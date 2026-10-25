import "server-only";
import { studioActivationMode, studioAllowedBinding } from "../../../packages/connectors/github/src/github-studio-activation.mjs";
export type StudioMutationMode = "sandbox"|"production";
export const studioMutationMode = (): StudioMutationMode|null => studioActivationMode(process.env);
export const studioSandboxBindingAllowed = (mode: StudioMutationMode, workspaceId: string, installationId:number) =>
  studioAllowedBinding(mode, workspaceId, installationId, process.env);
