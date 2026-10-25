import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import {
  MausbotAdapterError, resolveMausbotConfig, mausbotHealth, mausbotAgents, mausbotJob,
} from "../../../../../packages/engines/mausbot/src/adapter.mjs";
import { executeMausbotPrimitive } from "../../../../../packages/engines/mausbot/src/primitives.mjs";
import { mausbotReleasePermission } from "../../../../../packages/engine-core/src/release-gates.mjs";
import { mausbotOwnerControlPermission } from "../../../../../packages/engine-core/src/mausbot-owner-control.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const view = request.nextUrl.searchParams.get("view") ?? "health";
  if (!["health", "agents", "inventory", "job"].includes(view)) return engineFailure("INVALID_VIEW", 400);
  const access = await requireEngineWorkspace(workspaceId, view === "job");
  if (!access.ok) return access.response;
  const gate = mausbotReleasePermission(process.env, "read");
  if (!gate.allowed) return engineFailure(gate.code, gate.status);
  try {
    const config = resolveMausbotConfig(process.env, workspaceId);
    if (!config) return engineFailure("MAUSBOT_NOT_CONFIGURED", 503);
    if (view === "health") return engineSuccess(await mausbotHealth(config));
    if (view === "agents") return engineSuccess({ agents: await mausbotAgents(config) });
    if (view === "inventory") {
      const [agentResult, groupResult] = await Promise.all([
        executeMausbotPrimitive(config, "agents.list"),
        executeMausbotPrimitive(config, "channels.list"),
      ]);
      const label = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : null;
      const agents = Array.isArray(agentResult.agents) ? agentResult.agents.flatMap((value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const agent = value as Record<string, unknown>;
        const id = label(agent.id, 120), name = label(agent.name, 100);
        if (!id || !name) return [];
        const tasks = Array.isArray(agent.tasks) ? agent.tasks.flatMap((taskValue: unknown) => {
          if (!taskValue || typeof taskValue !== "object" || Array.isArray(taskValue)) return [];
          const task = taskValue as Record<string, unknown>;
          const threadId = label(task.threadId, 120);
          return threadId ? [{ threadId, title: label(task.title, 200), activity: label(task.activity, 40), active: task.active === true }] : [];
        }).slice(0, 50) : [];
        return [{ id, name, title: label(agent.title, 200), section: label(agent.section, 100), chiefOfStaff: agent.chiefOfStaff === true, activeTaskId: label(agent.activeTaskId, 120), tasks }];
      }).slice(0, 200) : [];
      const groups = Array.isArray(groupResult.channels) ? groupResult.channels.flatMap((value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const group = value as Record<string, unknown>;
        const id = label(group.id, 120), name = label(group.name, 100);
        if (!id || !name) return [];
        const memberIds = Array.isArray(group.memberIds)
          ? group.memberIds.filter((memberId: unknown): memberId is string => typeof memberId === "string").slice(0, 64).map((memberId: string) => memberId.slice(0, 120))
          : [];
        const tasks = Array.isArray(group.tasks) ? group.tasks.flatMap((taskValue: unknown) => {
          if (!taskValue || typeof taskValue !== "object" || Array.isArray(taskValue)) return [];
          const task = taskValue as Record<string, unknown>;
          const threadId = label(task.threadId, 120);
          return threadId ? [{ threadId, title: label(task.title, 200), activity: label(task.activity, 40), active: task.active === true }] : [];
        }).slice(0, 50) : [];
        const responder = group.defaultResponder && typeof group.defaultResponder === "object" && !Array.isArray(group.defaultResponder)
          ? group.defaultResponder as Record<string, unknown> : null;
        const defaultResponder = responder && typeof responder.kind === "string"
          ? { kind: responder.kind.slice(0, 20), ...(typeof responder.botId === "string" && memberIds.includes(responder.botId)
            ? { botId: responder.botId } : {}) } : null;
        return [{ id, name, section: label(group.section, 100), memberIds, defaultResponder,
          activeTaskId: label(group.activeTaskId, 120), tasks }];
      }).slice(0, 100) : [];
      return engineSuccess({
        engine: "mausbot", source: "live-read-only",
        canWrite: mausbotOwnerControlPermission(process.env, {
          role: access.role, workspaceId, mode: "execute",
        }).allowed,
        agents, groups,
      });
    }
    const threadId = request.nextUrl.searchParams.get("threadId");
    return engineSuccess({ job: await mausbotJob(config, threadId) });
  } catch (error) {
    if (error instanceof MausbotAdapterError) return engineFailure(error.code, error.status);
    return engineFailure("MAUSBOT_UNAVAILABLE", 503);
  }
}
