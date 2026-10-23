import type { ReadOnlyConnectorContract, ResourceRef } from "../packages/connector-core/src/contracts";
import { githubMvpContract, type GitHubPullRequestStatus } from "../packages/connectors/github/src/contract";
import { parsePullRequestEvent } from "../packages/connectors/github/src/webhook-contract.mjs";

const providerContract: ReadOnlyConnectorContract = githubMvpContract;
const parsed = parsePullRequestEvent("pull_request", "delivery-id", {});
if (parsed) {
  const resource: ResourceRef = parsed.resource;
  const pinnedRevision: string = resource.headSha;
  const status: GitHubPullRequestStatus = parsed.payload.status;
  void pinnedRevision;
  void status;
}
void providerContract;
