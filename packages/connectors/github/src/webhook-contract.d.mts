import type { ConnectorEvent, ResourceRef } from "../../../connector-core/src/contracts";

export type GitHubPullRequestEvent = ConnectorEvent & {
  provider: "github";
  event: "pull_request";
  action: "opened" | "reopened" | "synchronize" | "closed";
  resource: ResourceRef & { provider: "github" };
  payload: { status: { state: "open" | "closed"; isDraft: boolean; merged: boolean } };
};

export function parsePullRequestEvent(
  eventName: string,
  deliveryId: string,
  payload: unknown,
): GitHubPullRequestEvent | null;
