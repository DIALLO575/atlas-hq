import type { Capability, ConnectorConnection } from "./contracts.ts";

/** Linear manifest only: no live API calls are advertised until OAuth/API-key storage and scopes are verified. */
export function describeLinear(connection: ConnectorConnection): Capability[] {
  return ["issues.search", "issues.read", "issues.create", "webhooks.subscribe"].map((id) => ({
    id,
    state: "unknown",
    evidence: "not_verified",
    reason: connection.state === "connected"
      ? "Linear scopes, team access and API credentials have not been verified by ATLAS HQ."
      : "Linear OAuth consent and server-side credential storage are not configured.",
  }));
}
