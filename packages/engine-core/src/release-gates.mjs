/** ATLAS Engine Hub — offline until a separately reviewed release gate.
 * An upstream URL and token alone MUST NOT make an engine executable.
 * Flags are server-side and never user-selectable in the browser.
 */
export function mausbotReleaseState(env) {
  const stage = env.ATLAS_MAUSBOT_RELEASE_STAGE;
  const acknowledged = env.ATLAS_MAUSBOT_MUTATIONS_ACK === "I_ACKNOWLEDGE_ENGINE_ACTIONS";
  const readsEnabled = stage === "read-only" || stage === "enabled";
  const mutationsEnabled = stage === "enabled" && acknowledged;
  return Object.freeze({stage: readsEnabled ? (mutationsEnabled ? "enabled" : "read-only") : "offline", readsEnabled, mutationsEnabled});
}
export function mausbotReleasePermission(env, mode) {
  const stage = mausbotReleaseState(env);
  if (mode === "read" && stage.readsEnabled) return {allowed:true,status:200};
  if ((mode === "write" || mode === "execute") && stage.mutationsEnabled) return {allowed:true,status:200};
  if (mode !== "read" && mode !== "write" && mode !== "execute") return {allowed:false,code:"ENGINE_MODE_UNKNOWN",status:400};
  return {allowed:false,code:"MAUSBOT_PRECONNECTION_GATE_CLOSED",status:423};
}
