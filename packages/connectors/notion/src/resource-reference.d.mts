import type { NotionConnectionBinding } from "./capability-policy.mjs";
export type NotionResourceKind = "page" | "block" | "database" | "data_source";
export type NotionResourceRef = Readonly<{
  schema: "atlas.notion.resource-ref.v1";
  provider: "notion";
  apiVersion: "2026-03-11";
  surface: "rest"; kind: NotionResourceKind;
  resourceId: string; workspaceId: string; actorId: string;
  connectionId: string; notionWorkspaceId: string;
  sourceVersion: string | null; observedAt: number;
  provenance: "notion_live_provider_response";
}>;
export function notionResourceOperation(kind: NotionResourceKind): string;
export function notionResourceRef(args: {
  kind: NotionResourceKind; resourceId: string; connectionBinding: NotionConnectionBinding;
  providerResponse: Record<string, unknown>; checkedAt?: number;
}): NotionResourceRef;
export function matchesNotionResourceRef(
  resourceRef: NotionResourceRef, binding: NotionConnectionBinding,
  kind: NotionResourceKind, resourceId: string
): boolean;
