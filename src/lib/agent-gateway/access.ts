import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UUID } from "./policy.mjs";

export class GatewayError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
export type AgentClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export async function requireAgentOwner(workspaceId: unknown): Promise<{ supabase: AgentClient; userId: string }> {
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId))
    throw new GatewayError("INVALID_WORKSPACE_ID", 400);
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new GatewayError("AUTH_UNAVAILABLE", 503);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new GatewayError("AUTH_REQUIRED", 401);
  const { data: membership, error } = await supabase.from("workspace_members").select("role")
    .eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (error) throw new GatewayError("WORKSPACE_UNAVAILABLE", 503);
  if (membership?.role !== "owner") throw new GatewayError("OWNER_REQUIRED", 403);
  return { supabase, userId: user.id };
}
export function agentError(error: unknown): { code: string; status: number } {
  return error instanceof GatewayError ? { code: error.code, status: error.status } :
    { code: "AGENT_GATEWAY_UNAVAILABLE", status: 503 };
}
