import type { ReadOnlyConnectorContract, ResourceRef } from "../packages/connector-core/src/contracts";
import { githubMvpContract, type GitHubPullRequestStatus } from "../packages/connectors/github/src/contract";
import { buildGitHubAppInstallUrl, createInstallationLedger, createInstallationState, parseGitHubAppSetupCallback, reduceInstallationRepositoryPages } from "../packages/connectors/github/src/installation-flow.mjs";
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

const installationState = createInstallationState({
  tenantId: "tenant-a",
  key: "fixture-state-key-fixture-state-key",
  now: 0,
  nonce: new Uint8Array(16),
});
const installUrl: string = buildGitHubAppInstallUrl({ appSlug: "atlas-hq-fixture", state: installationState });
const setupCallback = parseGitHubAppSetupCallback(installUrl, { key: "fixture-state-key-fixture-state-key", now: 0 });
if (setupCallback.ok && setupCallback.setupAction === "install") {
  const ledger = createInstallationLedger();
  const installationId: number = setupCallback.installationId;
  ledger.record(setupCallback);
  void installationId;
}
const repositoryPage = reduceInstallationRepositoryPages([]);
if (repositoryPage.ok && repositoryPage.accepted) {
  const fullName: string = repositoryPage.repositories[0]?.fullName ?? "";
  void fullName;
}
void installUrl;
