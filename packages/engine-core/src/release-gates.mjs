/** ATLAS preconnection gate. No source of authority can be replaced by env flags.
 * Read-only diagnostics may be configured explicitly, but all write/execute
 * modes remain HARD BLOCKED until reviewed durable authorization is wired.
 */
export function mausbotReleaseState(env) {
  const value = env.ATLAS_MAUSBOT_RELEASE_STAGE;
  const readsEnabled = value === "read-only" || value === "enabled";
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
