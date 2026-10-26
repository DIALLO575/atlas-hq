import { createHash } from "node:crypto";
import { GatewayError, requireAgentOwner, type AgentClient } from "./access";
import { readAgentSetting } from "./settings";
import { assertEntityScope, publicMessage, replayReceipt, UUID, validContext } from "./policy.mjs";
import type { AtlasAgentMessage, AtlasPageContext } from "./context";
import { resolveMausbotConfig, MausbotAdapterError } from "../../../packages/engines/mausbot/src/adapter.mjs";
import { executeMausbotPrimitive } from "../../../packages/engines/mausbot/src/primitives.mjs";
import { sharedMausbotSendGuard } from "../../../packages/engines/mausbot/src/send-guard.mjs";
import { mausbotReleasePermission, mausbotReleaseState } from "../../../packages/engine-core/src/release-gates.mjs";

/** Server-side source check; a client-provided title, entity or object snapshot is never trusted. */
async function verifyScope(supabase: AgentClient, context: AtlasPageContext) {
  if (!validContext(context)) throw new GatewayError("INVALID_PAGE_CONTEXT", 400);
  const setting = await readAgentSetting(supabase, context.workspaceId, context.pageKey);
  const bindings = await supabase.from("agent_page_settings").select("entity")
    .eq("workspace_id", context.workspaceId).neq("entity", "*");
  if (bindings.error) throw new GatewayError("AGENT_SETTINGS_UNAVAILABLE", 503);
  if (!assertEntityScope(setting.entity, context.entity, (bindings.data ?? []).map((row) => row.entity)))
    throw new GatewayError("ENTITY_SCOPE_FORBIDDEN", 403);
  if (context.pageKey !== "missions") throw new GatewayError("PAGE_NOT_ENABLED", 403);
  if (context.objectType === "mission" && context.objectId) {
    const mission = await supabase.from("atlas_missions")
      .select("id,workspace_id,title,description").eq("workspace_id", context.workspaceId)
      .eq("id", context.objectId).maybeSingle();
    if (mission.error) throw new GatewayError("OBJECT_UNAVAILABLE", 503);
    if (!mission.data) throw new GatewayError("OBJECT_FORBIDDEN", 403);
    return { setting, object: mission.data };
  }
  if (context.objectType !== "page" || context.objectId !== null)
    throw new GatewayError("INVALID_PAGE_CONTEXT", 400);
  return { setting, object: null };
}
async function resolveBot(config: NonNullable<ReturnType<typeof resolveMausbotConfig>>, name: string) {
  const inventory = await executeMausbotPrimitive(config, "agents.list");
  const agents = Array.isArray(inventory.agents) ? inventory.agents as Array<Record<string,unknown>> : [];
  const bot = agents.find((item) => item.id === name || (typeof item.name === "string" &&
    item.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr")));
  if (!bot || typeof bot.id !== "string") throw new GatewayError("AGENT_NOT_FOUND_ON_MAUSBOT", 404);
  return { bot, agents };
}
type ThreadRecord = {
  id: string; page_key: string; entity: string; agent_id: string;
  object_id: string | null; mausbot_task_id: string | null;
};
async function findThread(supabase: AgentClient, context: AtlasPageContext): Promise<ThreadRecord | null> {
  let query = supabase.from("agent_threads")
    .select("id,page_key,entity,agent_id,object_id,mausbot_task_id")
    .eq("workspace_id", context.workspaceId).eq("page_key", context.pageKey)
    .eq("entity", context.entity);
  query = context.objectId ? query.eq("object_id", context.objectId) : query.is("object_id", null);
  const result = await query.maybeSingle();
  if (result.error) throw new GatewayError("AGENT_THREAD_UNAVAILABLE", 503);
  return result.data;
}

/** B1: this method is wired, but the durable release gate always forbids writes. */
export async function ask(pageKey: string, context: AtlasPageContext, question: string, sendId: string) {
  if (!validContext(context) || context.pageKey !== pageKey ||
    typeof question !== "string" || !question.trim() || question.length > 2000 ||
    typeof sendId !== "string" || !UUID.test(sendId))
    throw new GatewayError("INVALID_AGENT_REQUEST", 400);
  const { supabase, userId } = await requireAgentOwner(context.workspaceId);
  const { setting, object } = await verifyScope(supabase, context);
  // No task creation, receipt reservation or message mutation occurs while disabled.
  if (!mausbotReleaseState(process.env).mutationsEnabled)
    throw new GatewayError("MAUSBOT_DURABLE_APPROVAL_REQUIRED", 423);
  const gate = mausbotReleasePermission(process.env, "write");
  if (!gate.allowed) throw new GatewayError(gate.code, gate.status);
  const config = resolveMausbotConfig(process.env, context.workspaceId);
  if (!config) throw new GatewayError("MAUSBOT_NOT_CONFIGURED", 503);
  const { bot, agents } = await resolveBot(config, setting.agentId);
  const payload = object ? "Contexte ATLAS (lecture seule): " + object.title.slice(0,120) +
    " — " + object.description.slice(0,1000) + "\nQuestion : " + question.trim() : question.trim();
  const digest = createHash("sha256").update(JSON.stringify({
    workspaceId: context.workspaceId, pageKey, objectId: context.objectId, entity: context.entity,
    agentId: setting.agentId, payload,
  })).digest("hex");
  let thread = await findThread(supabase, context);
  if (thread && thread.agent_id !== setting.agentId) throw new GatewayError("THREAD_AGENT_CHANGED", 409);
  if (!thread) {
    const inserted = await supabase.from("agent_threads").insert({
      workspace_id: context.workspaceId, page_key: pageKey, entity: context.entity,
      agent_id: setting.agentId, object_id: context.objectId, created_by: userId,
    }).select("id,page_key,entity,agent_id,object_id,mausbot_task_id").single();
    if (inserted.error?.code === "23505") thread = await findThread(supabase, context);
    else if (inserted.error) throw new GatewayError("AGENT_THREAD_CREATE_FAILED", 503);
    else thread = inserted.data;
    if (!thread) throw new GatewayError("AGENT_THREAD_CREATE_FAILED", 503);
  }
  const existing = await supabase.from("agent_send_receipts").select("body_digest,state,thread_id")
    .eq("workspace_id", context.workspaceId).eq("send_id", sendId).maybeSingle();
  if (existing.error) throw new GatewayError("AGENT_IDEMPOTENCE_UNAVAILABLE", 503);
  const replay = replayReceipt(existing.data, digest);
  if (replay && "conflict" in replay) throw new GatewayError(replay.code, 409);
  if (replay) return replay;
  // Reserve durably before any MausBot network mutation, including task creation.
  const receipt = await supabase.from("agent_send_receipts").insert({
    workspace_id: context.workspaceId, thread_id: thread.id, send_id: sendId,
    body_digest: digest, created_by: userId,
  });
  if (receipt.error?.code === "23505") {
    const replayed = await supabase.from("agent_send_receipts").select("body_digest,state,thread_id")
      .eq("workspace_id", context.workspaceId).eq("send_id", sendId).maybeSingle();
    const result = replayReceipt(replayed.data, digest);
    if (result && "conflict" in result) throw new GatewayError(result.code, 409);
    if (result) return result;
  }
  if (receipt.error) throw new GatewayError("AGENT_IDEMPOTENCE_UNAVAILABLE", 503);
  const audit = await supabase.rpc("atlas_mausbot_action_begin", {
    p_action_id: sendId, p_workspace_id: context.workspaceId,
    p_primitive: "conversations.messages.send", p_hash: digest,
  });
  if (audit.error || audit.data !== true) throw new GatewayError("MAUSBOT_AUDIT_UNAVAILABLE", 503);
  // The task allocation is also a mutation; never retry it automatically on timeout.
  if (!thread.mausbot_task_id) {
    const task = await executeMausbotPrimitive(config, "tasks.create", {
      target_type: "bot", target_id: bot.id, title: "ATLAS · " + pageKey,
    });
    const taskId = task?.task?.threadId;
    if (typeof taskId !== "string") throw new GatewayError("MAUSBOT_TASK_OUTCOME_UNKNOWN", 503);
    const saved = await supabase.from("agent_threads").update({
      mausbot_task_id: taskId, updated_at: new Date().toISOString(),
    }).eq("workspace_id", context.workspaceId).eq("id", thread.id);
    if (saved.error) throw new GatewayError("MAUSBOT_TASK_OUTCOME_UNKNOWN", 503);
    thread = { ...thread, mausbot_task_id: taskId };
  }
  const slot = sharedMausbotSendGuard().reserve({
    env: process.env, primitive: "conversations.messages.send",
    args: { bot_id: bot.id, send_id: sendId },
    fleet: { agents }, initiator: { kind: "owner" }, idempotencyKey: sendId,
  });
  if (!slot.allowed) throw new GatewayError(slot.code, slot.status);
  try {
    const result = await executeMausbotPrimitive(config, "conversations.messages.send", {
      bot_id: bot.id, task_id: thread.mausbot_task_id, text: payload, send_id: sendId,
    });
    const completed = await supabase.from("agent_send_receipts").update({
      state: "accepted", ...(typeof result.messageId === "string" ? { mausbot_message_id: result.messageId } : {}),
    }).eq("workspace_id", context.workspaceId).eq("send_id", sendId);
    const audited = await supabase.rpc("atlas_mausbot_action_complete", {
      p_action_id: sendId, p_state: "accepted",
    });
    if (completed.error || audited.error || audited.data !== true)
      throw new GatewayError("MAUSBOT_ACTION_OUTCOME_UNKNOWN", 503);
    return { accepted: true, duplicate: false, threadId: thread.id };
  } catch (error) {
    // A timeout cannot prove rejection: never release/retry an ambiguous send.
    if (error instanceof MausbotAdapterError) throw new GatewayError(error.code, error.status);
    throw error;
  }
}

/** Polls only real MausBot messages with real message ids. No fabricated assistant reply. */
export async function poll(workspaceId: string, threadId: string, afterId?: string) {
  if (!UUID.test(workspaceId) || !UUID.test(threadId) ||
    (afterId !== undefined && !/^[A-Za-z0-9_-]{1,120}$/.test(afterId)))
    throw new GatewayError("INVALID_THREAD_REQUEST", 400);
  const { supabase } = await requireAgentOwner(workspaceId);
  const { data: thread, error } = await supabase.from("agent_threads")
    .select("id,workspace_id,page_key,entity,agent_id,object_id,mausbot_task_id")
    .eq("workspace_id", workspaceId).eq("id", threadId).maybeSingle();
  if (error) throw new GatewayError("AGENT_THREAD_UNAVAILABLE", 503);
  if (!thread) throw new GatewayError("THREAD_NOT_FOUND", 404);
  await verifyScope(supabase, { workspaceId, pageKey: thread.page_key,
    entity: thread.entity, objectType: thread.object_id ? "mission" : "page", objectId: thread.object_id });
  if (!thread.mausbot_task_id) return { threadId, messages: [] as AtlasAgentMessage[], pending: true };
  const gate = mausbotReleasePermission(process.env, "read");
  if (!gate.allowed) throw new GatewayError(gate.code, gate.status);
  const config = resolveMausbotConfig(process.env, workspaceId);
  if (!config) throw new GatewayError("MAUSBOT_NOT_CONFIGURED", 503);
  const { bot } = await resolveBot(config, thread.agent_id);
  const result = await executeMausbotPrimitive(config, "conversations.messages.list", {
    bot_id: bot.id, task_id: thread.mausbot_task_id, limit: 30,
  });
  const raw = Array.isArray(result.messages) ? result.messages : [];
  const messages = raw.map((value: unknown) => publicMessage(value, config.token))
    .filter((message: AtlasAgentMessage | null): message is AtlasAgentMessage => message !== null);
  const index = afterId ? messages.findIndex((message: AtlasAgentMessage) => message.id === afterId) : -1;
  return { threadId, messages: index >= 0 ? messages.slice(index + 1) : messages, pending: false };
}


/**
 * Restore the existing REAL thread for a workspace page/object. No inserts,
 * outbound MausBot writes, test data or schema changes. The object and entity
 * are verified server-side before revealing the tenant's existing transcript.
 */
export async function historyForObject(workspaceId: string, pageKey: string, objectId: string | null) {
  if (!UUID.test(workspaceId) || pageKey !== "missions" ||
    (objectId !== null && !UUID.test(objectId)))
    throw new GatewayError("INVALID_THREAD_REQUEST", 400);
  const { supabase } = await requireAgentOwner(workspaceId);
  const setting = await readAgentSetting(supabase, workspaceId, pageKey);
  if (setting.entity === "*")
    return { threadId: null, messages: [] as AtlasAgentMessage[], pending: false };
  const context: AtlasPageContext = {
    workspaceId, pageKey, entity: setting.entity,
    objectType: objectId ? "mission" : "page", objectId,
  };
  await verifyScope(supabase, context);
  const thread = await findThread(supabase, context);
  if (!thread) return { threadId: null, messages: [] as AtlasAgentMessage[], pending: false };
  return poll(workspaceId, thread.id);
}

/**
 * B2 interrupt preparation: owner + tenant thread verification + hard release
 * gate, and absolutely NO call to interrupt_conversation or MausBot mutations.
 */
export async function prepareInterrupt(workspaceId: unknown, threadId: unknown) {
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId) ||
    typeof threadId !== "string" || !UUID.test(threadId))
    throw new GatewayError("INVALID_THREAD_REQUEST", 400);
  const { supabase } = await requireAgentOwner(workspaceId);
  const { data: thread, error } = await supabase.from("agent_threads")
    .select("id,page_key,entity,object_id").eq("workspace_id", workspaceId)
    .eq("id", threadId).maybeSingle();
  if (error) throw new GatewayError("AGENT_THREAD_UNAVAILABLE", 503);
  if (!thread) throw new GatewayError("THREAD_NOT_FOUND", 404);
  await verifyScope(supabase, {
    workspaceId, pageKey: thread.page_key, entity: thread.entity,
    objectType: thread.object_id ? "mission" : "page", objectId: thread.object_id,
  });
  if (!mausbotReleaseState(process.env).mutationsEnabled)
    throw new GatewayError("MAUSBOT_DURABLE_APPROVAL_REQUIRED", 423);
  const gate = mausbotReleasePermission(process.env, "execute");
  if (!gate.allowed) throw new GatewayError(gate.code, gate.status);
  // Even if an unrelated gate changes, B2 never implements provider interrupt.
  throw new GatewayError("MAUSBOT_DURABLE_APPROVAL_REQUIRED", 423);
}
