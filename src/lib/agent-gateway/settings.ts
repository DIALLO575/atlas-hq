import { GatewayError, type AgentClient } from "./access";
import { AGENT_KEY, ENTITIES, PAGE_KEY } from "./policy.mjs";
import type { AtlasEntity } from "./context";

export type PageSetting = {
  pageKey: string; entity: AtlasEntity | "*"; agentId: string;
  isFallback: boolean; updatedAt: string | null;
};
export async function readAgentSetting(supabase: AgentClient, workspaceId: string, pageKey: string): Promise<PageSetting> {
  if (!PAGE_KEY.test(pageKey)) throw new GatewayError("INVALID_PAGE_KEY", 400);
  const { data, error } = await supabase.from("agent_page_settings")
    .select("page_key,entity,agent_id,updated_at").eq("workspace_id", workspaceId)
    .in("page_key", [pageKey, "*"]);
  if (error) throw new GatewayError("AGENT_SETTINGS_UNAVAILABLE", 503);
  const row = (data ?? []).find((item) => item.page_key === pageKey) ??
    (data ?? []).find((item) => item.page_key === "*");
  if (!row) return { pageKey, entity: "*", agentId: pageKey === "journal" ? "MORGANS" : "ROGER",
    isFallback: true, updatedAt: null }; // Real default, explicitly not a persisted preference.
  return { pageKey, entity: row.entity as AtlasEntity | "*", agentId: row.agent_id,
    isFallback: row.page_key !== pageKey, updatedAt: row.updated_at };
}
export async function saveAgentSetting(supabase: AgentClient, workspaceId: string, userId: string,
  pageKey: string, agentId: string, entity: string): Promise<PageSetting> {
  if (!PAGE_KEY.test(pageKey) || !AGENT_KEY.test(agentId) ||
    (entity !== "*" && !ENTITIES.includes(entity))) throw new GatewayError("INVALID_SETTING", 400);
  if (pageKey === "missions" && entity === "*") throw new GatewayError("ENTITY_SCOPE_REQUIRED", 400);
  const { error } = await supabase.from("agent_page_settings").upsert({
    workspace_id: workspaceId, page_key: pageKey, entity, agent_id: agentId, updated_by: userId,
  }, { onConflict: "workspace_id,page_key" });
  if (error) throw new GatewayError("AGENT_SETTINGS_WRITE_FAILED", 503);
  return readAgentSetting(supabase, workspaceId, pageKey);
}
