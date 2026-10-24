import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import {
  MausbotAdapterError, resolveMausbotConfig, mausbotHealth, mausbotAgents, mausbotJob,
} from "../../../../../packages/engines/mausbot/src/adapter.mjs";
import { mausbotReleasePermission } from "../../../../../packages/engine-core/src/release-gates.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const access = await requireEngineWorkspace(workspaceId);
  if (!access.ok) return access.response;
  const gate = mausbotReleasePermission(process.env, "read");
  if (!gate.allowed) return engineFailure(gate.code, gate.status);
  const view = request.nextUrl.searchParams.get("view") ?? "health";
  if (!["health", "agents", "job"].includes(view)) return engineFailure("INVALID_VIEW", 400);
  try {
    const config = resolveMausbotConfig(process.env, workspaceId);
    if (!config) return engineFailure("MAUSBOT_NOT_CONFIGURED", 503);
    if (view === "health") return engineSuccess(await mausbotHealth(config));
    if (view === "agents") return engineSuccess({ agents: await mausbotAgents(config) });
    const threadId = request.nextUrl.searchParams.get("threadId");
    return engineSuccess({ job: await mausbotJob(config, threadId) });
  } catch (error) {
    if (error instanceof MausbotAdapterError) return engineFailure(error.code, error.status);
    return engineFailure("MAUSBOT_UNAVAILABLE", 503);
  }
}
