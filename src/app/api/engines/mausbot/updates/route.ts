import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { MausbotAdapterError, resolveMausbotConfig } from "../../../../../../packages/engines/mausbot/src/adapter.mjs";
import { executeMausbotPrimitive } from "../../../../../../packages/engines/mausbot/src/primitives.mjs";
import { mausbotMessageDelta, MAUSBOT_MESSAGE_WINDOW } from "../../../../../../packages/engines/mausbot/src/message-updates.mjs";
import { mausbotReleasePermission } from "../../../../../../packages/engine-core/src/release-gates.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A read-only, session-authorized delta bridge. The native endpoint does not
// support an after-cursor: compare the latest bounded page server-side and send
// only changed tail entries to the browser. Never cache raw messages on Vercel.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const workspaceId = query.get("workspaceId");
  const kind = query.get("kind");
  const targetId = query.get("targetId");
  const taskId = query.get("taskId");
  const afterId = query.get("afterId");
  if (!["team","agent"].includes(kind ?? "") ||
      !targetId || !/^[A-Za-z0-9_-]{1,120}$/.test(targetId) ||
      !taskId || !/^[A-Za-z0-9_-]{1,120}$/.test(taskId) ||
      (afterId !== null && !/^[A-Za-z0-9_-]{1,120}$/.test(afterId))) {
    return engineFailure("MAUSBOT_UPDATES_INPUT_INVALID",400);
  }
  const access = await requireEngineWorkspace(workspaceId,true);
  if (!access.ok) return access.response;
  const gate = mausbotReleasePermission(process.env,"read");
  if (!gate.allowed) return engineFailure(gate.code,gate.status);
  try {
    const config = resolveMausbotConfig(process.env,workspaceId);
    if (!config) return engineFailure("MAUSBOT_NOT_CONFIGURED",503);
    const args = kind === "team"
      ? {channel_id:targetId,task_id:taskId,limit:MAUSBOT_MESSAGE_WINDOW}
      : {bot_id:targetId,task_id:taskId,limit:MAUSBOT_MESSAGE_WINDOW};
    // This primitive validates target ownership before reading its task.
    const result = await executeMausbotPrimitive(config,
      kind === "team" ? "channels.messages.list" : "conversations.messages.list",args);
    if (!Array.isArray(result.messages)) return engineFailure("CONVERSATION_INVALID",502);
    return engineSuccess(mausbotMessageDelta(result.messages,afterId));
  } catch (error) {
    if (error instanceof MausbotAdapterError) return engineFailure(error.code,error.status);
    return engineFailure("CONVERSATION_UNAVAILABLE",503);
  }
}
