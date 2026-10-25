/** Server-side feature gate: require ALL three explicit flags for a matching Vercel environment.
 * This cannot grant GitHub permissions or replace human approval, OAuth or DB CAS.
 */
export function studioActivationMode(env) {
  const flags = [env.ATLAS_GITHUB_STUDIO_WRITE_ENABLED,
    env.ATLAS_GITHUB_STUDIO_APPROVAL_ENABLED,
    env.ATLAS_GITHUB_STUDIO_OAUTH_ENABLED];
  if (env.VERCEL_ENV === "production" &&
      flags.every((value) => value === "production")) return "production";
  if (env.VERCEL_ENV === "preview" &&
      flags.every((value) => value === "sandbox")) return "sandbox";
  return null;
}
export function studioAllowedBinding(mode, workspaceId, installationId, env) {
  if (mode === "production") return true;
  return mode === "sandbox" && workspaceId === env.ATLAS_GITHUB_STUDIO_SANDBOX_WORKSPACE_ID &&
    Number.isSafeInteger(installationId) && installationId > 0 &&
    String(installationId) === env.ATLAS_GITHUB_STUDIO_SANDBOX_INSTALLATION_ID;
}
