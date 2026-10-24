const ENDPOINT = "https://api.linear.app/graphql";

export class LinearApiError extends Error {
  constructor(code, { retryAfterSeconds } = {}) {
    super(code);
    this.name = "LinearApiError";
    this.code = code;
    if (Number.isSafeInteger(retryAfterSeconds) && retryAfterSeconds > 0) {
      this.retryAfterSeconds = Math.min(retryAfterSeconds, 86_400);
    }
  }
}

function retryAfterSeconds(headers, now = Date.now()) {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(1, Math.ceil((date - now) / 1000));
  }
  for (const name of ["x-ratelimit-endpoint-requests-reset", "x-ratelimit-requests-reset"]) {
    const epochMs = Number(headers.get(name));
    if (Number.isFinite(epochMs) && epochMs > 0) return Math.max(1, Math.ceil((epochMs - now) / 1000));
  }
  return undefined;
}

// Tokenize enough of GraphQL's executable-document grammar to identify every
// top-level operation. Strings (including block strings) and comments are
// atomic, so operation-looking text in either cannot change the classification.
function tokenize(document) {
  const tokens = [];
  for (let i = 0; i < document.length;) {
    const char = document[i];
    if (/\s|,/.test(char)) { i++; continue; }
    if (char === "#") {
      while (i < document.length && document[i] !== "\n" && document[i] !== "\r") i++;
      continue;
    }
    if (document.startsWith('"""', i)) {
      i += 3;
      let closed = false;
      while (i < document.length) {
        if (document.startsWith('\\"""', i)) { i += 4; continue; }
        if (document.startsWith('"""', i)) { i += 3; closed = true; break; }
        i++;
      }
      if (!closed) throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
      tokens.push({ kind: "value", value: "string" });
      continue;
    }
    if (char === '"') {
      i++;
      let closed = false;
      while (i < document.length) {
        if (document[i] === "\\") { i += 2; continue; }
        if (document[i] === '"') { i++; closed = true; break; }
        if (document[i] === "\n" || document[i] === "\r") break;
        i++;
      }
      if (!closed) throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
      tokens.push({ kind: "value", value: "string" });
      continue;
    }
    const name = /^[_A-Za-z][_0-9A-Za-z]*/.exec(document.slice(i));
    if (name) { tokens.push({ kind: "name", value: name[0] }); i += name[0].length; continue; }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(document.slice(i));
    if (number) { tokens.push({ kind: "value", value: number[0] }); i += number[0].length; continue; }
    if ("!$():=@[]{|}&".includes(char)) { tokens.push({ kind: "punct", value: char }); i++; continue; }
    if (document.startsWith("...", i)) { tokens.push({ kind: "punct", value: "..." }); i += 3; continue; }
    throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
  }
  return tokens;
}

function inspectReadOnlyOperations(document, operationName) {
  const tokens = tokenize(document);
  const operations = [];
  let index = 0;
  const skipSelection = () => {
    if (tokens[index]?.value !== "{") throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
    let depth = 0;
    do {
      const token = tokens[index++];
      if (!token) throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
      if (token.value === "{") depth++;
      if (token.value === "}") depth--;
    } while (depth > 0);
  };
  const skipDefinitionPreamble = () => {
    let parentheses = 0;
    while (index < tokens.length) {
      const value = tokens[index].value;
      if (value === "(") parentheses++;
      else if (value === ")") {
        if (parentheses === 0) throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
        parentheses--;
      } else if (value === "{" && parentheses === 0) break;
      index++;
    }
    if (parentheses !== 0) throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
    skipSelection();
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.value === "{") {
      operations.push({ type: "query", name: null });
      skipSelection();
    } else if (token.kind === "name" && ["query", "mutation", "subscription"].includes(token.value)) {
      const type = token.value;
      index++;
      const name = tokens[index]?.kind === "name" ? tokens[index++].value : null;
      operations.push({ type, name });
      skipDefinitionPreamble();
    } else if (token.kind === "name" && token.value === "fragment") {
      index++;
      if (tokens[index]?.kind !== "name") throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
      index++;
      skipDefinitionPreamble();
    } else {
      throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
    }
  }

  if (!operations.length || operations.some(({ type }) => type !== "query")) {
    throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
  }
  if (operations.length === 1) {
    if (operationName && operations[0].name !== operationName) throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
  } else {
    if (operations.some(({ name }) => !name) || typeof operationName !== "string" || !operationName) {
      throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
    }
    const matching = operations.filter(({ name }) => name === operationName);
    if (matching.length !== 1) throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
  }
}

/** Read-only GraphQL transport. Authorization is accepted only server-side. */
export async function linearGraphql({ accessToken, query, operationName, variables = {}, fetchImpl = fetch }) {
  if (typeof accessToken !== "string" || !accessToken || typeof query !== "string" || !query.trim()) {
    throw new LinearApiError("LINEAR_API_INVALID_REQUEST");
  }
  inspectReadOnlyOperations(query, operationName);
  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ query, ...(operationName ? { operationName } : {}), variables }),
      cache: "no-store",
    });
  } catch {
    throw new LinearApiError("LINEAR_API_UNAVAILABLE");
  }
  if (response.status === 401) throw new LinearApiError("LINEAR_API_UNAUTHORIZED");
  if (response.status === 403) throw new LinearApiError("LINEAR_API_FORBIDDEN");
  if (response.status === 429) throw new LinearApiError("LINEAR_API_RATE_LIMITED", {
    retryAfterSeconds: retryAfterSeconds(response.headers),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) throw new LinearApiError("LINEAR_API_UNAVAILABLE");
    throw new LinearApiError("LINEAR_API_INVALID_RESPONSE");
  }
  if (Array.isArray(payload?.errors) && payload.errors.some((error) => error?.extensions?.code === "RATELIMITED")) {
    throw new LinearApiError("LINEAR_API_RATE_LIMITED", {
      retryAfterSeconds: retryAfterSeconds(response.headers),
    });
  }
  if (!response.ok) throw new LinearApiError("LINEAR_API_UNAVAILABLE");
  if (!payload || (Array.isArray(payload.errors) && payload.errors.length)) {
    throw new LinearApiError("LINEAR_API_QUERY_FAILED");
  }
  if (!payload.data || typeof payload.data !== "object") throw new LinearApiError("LINEAR_API_INVALID_RESPONSE");
  return payload.data;
}
