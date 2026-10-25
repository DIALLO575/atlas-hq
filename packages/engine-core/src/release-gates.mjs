/** ATLAS preconnection gate. No source of authority can be replaced by env flags.
 * Read-only diagnostics may be configured explicitly, but all write/execute
 * modes remain HARD BLOCKED until reviewed durable authorization is wired.
 */
export function mausbotReleaseState(env) {
  const value = env.ATLAS_MAUSBOT_RELEASE_STAGE;
  const readsEnabled = value === "read-only" || value === "enabled" || value === "admin";
  return Object.freeze({
    stage: readsEnabled ? "read-only" : "offline",
    readsEnabled,
    mutationsEnabled: false,
    pending: "durable-engine-gate",
  });
}
export function mausbotReleasePermission(env, mode) {
  const stage = mausbotReleaseState(env);
  if (mode === "read" && stage.readsEnabled) return {allowed:true,status:200};
  if (mode === "write" || mode === "execute")
    return {allowed:false,code:"MAUSBOT_DURABLE_APPROVAL_REQUIRED",status:423};
  if (mode !== "read") return {allowed:false,code:"ENGINE_MODE_UNKNOWN",status:400};
  return {allowed:false,code:"MAUSBOT_PRECONNECTION_GATE_CLOSED",status:423};
}

/**
 * n8n provider I/O is HARD BLOCKED (SHA-176). DB metadata reads use their
 * own authenticated RLS BFF, not this release gate. Environment switches
 * cannot authorize live n8n REST, MCP, webhook, execution, or dispatch.
 */
export function n8nReleaseState(_env = {}) {
  return Object.freeze({
    stage: "offline",
    providerReadsEnabled: false,
    mutationsEnabled: false,
    dispatchEnabled: false,
    pending: "n8n-durable-provider-certification",
  });
}
export function n8nReleasePermission(_env, mode) {
  if (!["read", "write", "execute"].includes(mode)) {
    return Object.freeze({ allowed: false, status: 400, code: "ENGINE_MODE_UNKNOWN" });
  }
  return Object.freeze({
    allowed: false, status: 423, code: "N8N_DURABLE_RELEASE_GATE_CLOSED",
  });
}
