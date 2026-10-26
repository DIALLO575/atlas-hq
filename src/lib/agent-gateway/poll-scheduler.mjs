/**
 * B2 single-flight, visibility-aware browser scheduler.
 * One request at a time; no interval backlog, no network calls from hidden tabs.
 * A poll is "active" only while the caller has a real accepted send awaiting
 * a response. Never infer activity from a loading animation.
 */
export const AGENT_POLL_ACTIVE_MS = 2_000;
export const AGENT_POLL_IDLE_MS = 15_000;
export function createAgentPollScheduler({
  load, isActive, onError = () => {}, visibility = document,
  setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now,
} = {}) {
  if (typeof load !== "function" || typeof isActive !== "function") {
    throw new TypeError("Agent poller needs load and isActive");
  }
  let started = false;
  let timer = null;
  let inFlight = null;
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  const hidden = () => visibility.visibilityState === "hidden" || visibility.hidden === true;
  const clear = () => { if (timer !== null) { clearTimer(timer); timer = null; } };
  function schedule(ms) {
    clear();
    if (!started || hidden()) return;
    timer = setTimer(() => { timer = null; void tick(); }, ms);
  }
  async function tick() {
    if (!started || hidden() || inFlight) return;
    const controller = new AbortController();
    inFlight = controller;
    lastStartedAt = now();
    try {
      await load(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted && started && !hidden()) onError(error);
    } finally {
      if (inFlight === controller) inFlight = null;
      if (started && !hidden()) schedule(isActive() ? AGENT_POLL_ACTIVE_MS : AGENT_POLL_IDLE_MS);
    }
  }
  function visibilityChange() {
    if (!started) return;
    if (hidden()) {
      clear();
      inFlight?.abort();
      // Await the canceled request's finally before rearming.
    } else if (!inFlight) {
      // Repeated visibility changes cannot cause a burst of VPS requests.
      schedule(Math.max(0, AGENT_POLL_ACTIVE_MS - (now() - lastStartedAt)));
    }
  }
  return Object.freeze({
    start() {
      if (started) return;
      started = true;
      visibility.addEventListener("visibilitychange", visibilityChange);
      if (!hidden()) schedule(0);
    },
    refresh() {
      // Accepted real send: replace a dormant 15s timer with the 2s cadence.
      if (started && !hidden() && !inFlight)
        schedule(Math.max(0, AGENT_POLL_ACTIVE_MS - (now() - lastStartedAt)));
    },
    stop() {
      if (!started) return;
      started = false;
      visibility.removeEventListener("visibilitychange", visibilityChange);
      clear();
      inFlight?.abort();
    },
  });
}
