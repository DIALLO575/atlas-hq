import { linearGraphql, LinearApiError } from "./graphql-client.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LINEAR_READ_PAGE_SIZE = 25;
const NO_STORE = { "Cache-Control": "private, no-store" };

const RESOURCES = Object.freeze({
  teams: {
    operationName: "AtlasLinearTeams",
    collection: "teams",
    query: `query AtlasLinearTeams($first: Int!, $after: String) {
      viewer { id organization { id } }
      teams(first: $first, after: $after) {
        nodes { id key name }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    normalize: (value) => {
      if (!isString(value?.id) || !isString(value?.key) || !isString(value?.name)) return null;
      return { id: value.id, key: value.key, name: value.name };
    },
  },
  projects: {
    operationName: "AtlasLinearProjects",
    collection: "projects",
    query: `query AtlasLinearProjects($first: Int!, $after: String) {
      viewer { id organization { id } }
      projects(first: $first, after: $after) {
        nodes { id name description updatedAt }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    normalize: (value) => {
      if (!isString(value?.id) || !isString(value?.name) ||
          (value.description !== null && !isString(value.description)) || !isString(value?.updatedAt)) return null;
      return { id: value.id, name: value.name, description: value.description, updatedAt: value.updatedAt };
    },
  },
  issues: {
    operationName: "AtlasLinearIssues",
    collection: "issues",
    query: `query AtlasLinearIssues($first: Int!, $after: String) {
      viewer { id organization { id } }
      issues(first: $first, after: $after) {
        nodes {
          id identifier title description priority updatedAt
          team { id key name }
          project { id name }
          state { id name }
          assignee { id name }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    normalize: (value) => {
      if (!isString(value?.id) || !isString(value?.identifier) || !isString(value?.title) ||
          (value.description !== null && !isString(value.description)) ||
          !Number.isFinite(value?.priority) || !isString(value?.updatedAt) ||
          !nullableRecord(value?.team, ["id", "key", "name"]) ||
          !nullableRecord(value?.project, ["id", "name"]) ||
          !nullableRecord(value?.state, ["id", "name"]) ||
          !nullableRecord(value?.assignee, ["id", "name"])) return null;
      return {
        id: value.id, identifier: value.identifier, title: value.title, description: value.description,
        priority: value.priority, updatedAt: value.updatedAt,
        team: value.team, project: value.project, state: value.state, assignee: value.assignee,
      };
    },
  },
});

function isString(value) { return typeof value === "string" && value.length <= 20_000; }
function nullableRecord(value, keys) {
  return value === null || (value && typeof value === "object" && !Array.isArray(value) && keys.every((key) => isString(value[key])));
}

function json(status, body, headers = {}) {
  return { status, body, headers: { ...NO_STORE, ...headers } };
}

function parseRequest(request) {
  if (request.method !== "GET") return { error: json(405, { error: "method-not-allowed" }, { Allow: "GET" }) };
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  const resource = url.searchParams.get("resource") ?? "";
  const afterValues = url.searchParams.getAll("after");
  const after = afterValues.length === 1 ? afterValues[0] : null;
  if (!UUID.test(workspaceId) || !Object.hasOwn(RESOURCES, resource) || afterValues.length > 1 ||
      (after !== null && (!after.length || after.length > 1024 || /[\u0000-\u001f\u007f]/.test(after)))) {
    return { error: json(400, { error: "invalid-request" }) };
  }
  return { workspaceId, resource, after };
}

function mapApiError(error) {
  if (!(error instanceof LinearApiError)) return json(502, { error: "linear-unavailable" });
  if (error.code === "LINEAR_API_UNAUTHORIZED") return json(401, { error: "linear-reauth-required" });
  if (error.code === "LINEAR_API_FORBIDDEN") return json(403, { error: "linear-forbidden" });
  if (error.code === "LINEAR_API_RATE_LIMITED") {
    const headers = error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {};
    return json(429, { error: "linear-rate-limited", retryAfterSeconds: error.retryAfterSeconds ?? null }, headers);
  }
  if (error.code === "LINEAR_API_INVALID_RESPONSE" || error.code === "LINEAR_API_QUERY_FAILED") {
    return json(502, { error: "linear-invalid-response" });
  }
  return json(502, { error: "linear-unavailable" });
}

/** One fixed, read-only query page. Identity, membership, connection and refresh are server dependencies. */
export async function readLinearResourceRoute(request, {
  publicOrigin, authorizeWorkspaceMember, loadConnection, refreshConnection, queryLinear = linearGraphql, now = Date.now(),
}) {
  const parsed = parseRequest(request);
  if (parsed.error) return parsed.error;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if ((origin && origin !== publicOrigin) || (fetchSite && fetchSite !== "same-origin")) {
    return json(403, { error: "bad-origin" });
  }
  const { workspaceId, resource, after } = parsed;
  if (typeof authorizeWorkspaceMember !== "function" || typeof loadConnection !== "function" ||
      typeof refreshConnection !== "function" || typeof queryLinear !== "function") {
    return json(503, { error: "linear-not-configured" });
  }

  let actor;
  try { actor = await authorizeWorkspaceMember(workspaceId); } catch { actor = null; }
  if (!actor || actor.workspaceId !== workspaceId || !UUID.test(actor.userId ?? "")) {
    return json(403, { error: "workspace-forbidden" });
  }

  let connection;
  try { connection = await loadConnection(actor); } catch { return json(503, { error: "linear-unavailable" }); }
  if (!connection || connection.actorUserId !== actor.userId || connection.revokedAt ||
      !UUID.test(connection.linearWorkspaceId ?? "") || !UUID.test(connection.linearActorId ?? "") ||
      !Array.isArray(connection.scopes) || connection.scopes.length !== 1 || connection.scopes[0] !== "read") {
    return json(404, { error: "linear-not-connected" });
  }

  if (!Number.isFinite(Date.parse(connection.accessExpiresAt))) return json(502, { error: "linear-invalid-connection" });
  if (Date.parse(connection.accessExpiresAt) <= now + 120_000) {
    let refreshed;
    try { refreshed = await refreshConnection(actor); } catch { refreshed = null; }
    if (!refreshed || refreshed.status !== 200 || !["refreshed", "still-valid"].includes(refreshed.result)) {
      if (refreshed?.status === 401) return json(401, { error: "linear-reauth-required" });
      if (refreshed?.status === 409) return json(409, { error: "linear-refresh-pending" }, { "Retry-After": "3" });
      return json(503, { error: "linear-refresh-unavailable" });
    }
    try { connection = await loadConnection(actor); } catch { return json(503, { error: "linear-unavailable" }); }
    if (!connection || connection.actorUserId !== actor.userId || connection.revokedAt ||
        connection.scopes?.length !== 1 || connection.scopes[0] !== "read" ||
        Date.parse(connection.accessExpiresAt) <= now) return json(401, { error: "linear-reauth-required" });
  }

  const descriptor = RESOURCES[resource];
  let data;
  try {
    data = await queryLinear({
      accessToken: connection.accessToken,
      query: descriptor.query,
      operationName: descriptor.operationName,
      variables: { first: LINEAR_READ_PAGE_SIZE, after },
    });
  } catch (error) { return mapApiError(error); }

  if (data?.viewer?.id !== connection.linearActorId || data?.viewer?.organization?.id !== connection.linearWorkspaceId) {
    return json(403, { error: "linear-workspace-mismatch" });
  }
  const connectionData = data?.[descriptor.collection];
  const nodes = connectionData?.nodes;
  const pageInfo = connectionData?.pageInfo;
  if (!Array.isArray(nodes) || nodes.length > LINEAR_READ_PAGE_SIZE ||
      typeof pageInfo?.hasNextPage !== "boolean" ||
      (pageInfo.endCursor !== null && typeof pageInfo.endCursor !== "string") ||
      (pageInfo.hasNextPage && (!pageInfo.endCursor || pageInfo.endCursor.length > 1024))) {
    return json(502, { error: "linear-invalid-response" });
  }
  const items = nodes.map(descriptor.normalize);
  if (items.some((item) => item === null)) return json(502, { error: "linear-invalid-response" });
  return json(200, {
    resource,
    items,
    pageInfo: { hasNextPage: pageInfo.hasNextPage, endCursor: pageInfo.endCursor },
    incomplete: pageInfo.hasNextPage,
  });
}
