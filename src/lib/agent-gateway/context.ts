/** Context is an untrusted HINT from the page, never proof of entity ownership. */
export type AtlasEntity = "FOUNDER" | "VELMO" | "WAHABI" | "NEW_PLATFORM" | "PERSO";
export type AtlasPageContext = {
  workspaceId: string;
  pageKey: string;
  entity: AtlasEntity | "*";
  objectType: "mission" | "page";
  objectId: string | null;
};
export type AtlasAgentMessage = {
  id: string;
  role: string;
  at: string | null;
  text: string;
};
