import "server-only";
import { coordinateRepositoryCreation } from "../../../packages/connectors/github/src/github-studio-orchestrator.mjs";
import { prepareGitHubStudioMutation } from "@/lib/github/studio-server";

export async function executeSandboxRepositoryCreation(args: Parameters<typeof prepareGitHubStudioMutation>[0]) {
  const collaborators = prepareGitHubStudioMutation(args);
  return coordinateRepositoryCreation(collaborators);
}
