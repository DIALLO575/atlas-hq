const actions = new Set(["opened", "reopened", "synchronize", "closed"]);
const shaPattern = /^[0-9a-f]{40}$/i;

/** Parse only the small event envelope consumed by the MVP. Signature checks belong before this parser. */
export function parsePullRequestEvent(eventName, deliveryId, payload) {
  if (eventName !== "pull_request" || !deliveryId || !payload || typeof payload !== "object") return null;
  if (!actions.has(payload.action)) return null;
  const installationId = payload.installation?.id;
  const repository = payload.repository;
  const pullRequest = payload.pull_request;
  const owner = repository?.owner?.login;
  const repositoryName = repository?.name;
  const repositoryId = repository?.id;
  const number = pullRequest?.number ?? payload.number;
  const headSha = pullRequest?.head?.sha;
  const state = pullRequest?.state;
  const isDraft = pullRequest?.draft;
  const merged = pullRequest?.merged;
  if (!Number.isSafeInteger(installationId) || installationId <= 0) return null;
  if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) return null;
  if (typeof owner !== "string" || !owner || typeof repositoryName !== "string" || !repositoryName) return null;
  if (!Number.isSafeInteger(number) || number <= 0 || typeof headSha !== "string" || !shaPattern.test(headSha)) return null;
  if (!(["open", "closed"].includes(state)) || typeof isDraft !== "boolean" || typeof merged !== "boolean") return null;

  return {
    provider: "github",
    event: eventName,
    action: payload.action,
    deliveryId,
    resource: {
      provider: "github",
      installationId,
      repositoryId,
      owner,
      repository: repositoryName,
      pullRequestNumber: number,
      headSha,
    },
    payload: { status: { state, isDraft, merged } },
  };
}
