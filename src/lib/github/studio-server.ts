import "server-only";
import {
  adminGitHubClient, githubConnectSettings,
} from "@/lib/github/connect";
import {
  createRepositoryIntent,
} from "../../../packages/connectors/github/src/github-studio-ledger.mjs";
import {
  createPersonalRepository, parseRepositoryDraft,
  verifiedPersonalInstallation, GitHubStudioError,
} from "../../../packages/connectors/github/src/github-studio-create.mjs";
import {
  createGitHubStudioOperationStore,
} from "../../../packages/connectors/github/src/github-studio-store.mjs";
import {
  verifyCreatedRepositoryAccess,
} from "../../../packages/connectors/github/src/github-studio-grant-verifier.mjs";

type InstallationBinding = {
  workspaceId: string; installationId: number;
  status: string; repositorySelection: "selected" | "all";
  ownershipVerifiedAt: string | null; repositoriesVerifiedAt: string | null;
};
type DraftInput = {
  workspaceId: string; installationId: number; name: string;
  description?: string; private?: boolean; autoInit?: boolean;
};

/**
 * Trusted wiring for a FUTURE admin-only, feature-flagged execute endpoint.
 * No API route currently invokes this factory. Never use from Client Components.
 * The caller must first verify the Supabase user session, role, CSRF/origin,
 * verified workspace installation, explicit confirmation and feature flag.
 */
export function prepareGitHubStudioMutation({
  workspaceId, actorId, installationId, binding, draft, idempotencyKey,
}: {
  workspaceId: string; actorId: string; installationId: number;
  binding: InstallationBinding; draft: DraftInput; idempotencyKey: string;
}) {
  const spec = parseRepositoryDraft(draft);
  if (spec.workspaceId !== workspaceId || spec.installationId !== installationId ||
      !verifiedPersonalInstallation(binding, workspaceId, installationId)) {
    throw new GitHubStudioError("PERMISSION_DENIED");
  }
  const config = githubConnectSettings();
  if (!config) throw new GitHubStudioError("NOT_CONFIGURED");
  const intent = createRepositoryIntent({ draft: spec, actorId, idempotencyKey });
  const admin = adminGitHubClient(config);
  const store = createGitHubStudioOperationStore({
    rpc: async (fn, payload) => {
      const { data, error } = await admin.rpc(fn, payload);
      return { data, error };
    },
  });
  // The coordinator receives bound collaborators, not user-supplied URLs,
  // service role keys or GitHub installation access tokens.
  return {
    intent: { ...intent, draft: { name: spec.name, private: spec.private } },
    store,
    create: () => createPersonalRepository({
      workspaceId, installationId, binding, draft: spec,
      appId: config.appId, privateKey: config.appPrivateKey,
    }),
    verifyAccess: (created: { repositoryId: number; fullName: string; url: string }) =>
      verifyCreatedRepositoryAccess({
        workspaceId, installationId, binding, created,
        appId: config.appId, privateKey: config.appPrivateKey,
      }),
    finishWithAccess: (operationId: string, created: { repositoryId: number }) =>
      store.finishWithAccess(operationId, created),
  };
}
