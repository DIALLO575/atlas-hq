export interface NotionObservation {
  connectionId: string; resourceKind: "page" | "block" | "database" | "data_source";
  resourceId: string; notionWorkspaceId: string;
  observedAt: string; sourceUpdatedAt: string | null;
  providerAccessVerifiedNow: false;
}
export function notionObservationListView(raw: unknown, maxItems?: number):
  ReadonlyArray<Readonly<NotionObservation>>;
