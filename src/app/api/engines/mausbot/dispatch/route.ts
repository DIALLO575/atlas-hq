import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import {
  MausbotAdapterError, resolveMausbotConfig, mausbotDispatch,
} from "../../../../../../packages/engines/mausbot/src/adapter.mjs";
import { mausbotReleasePermission } from "../../../../../../packages/engine-core/src/release-gates.mjs";
import { executeMausbotPrimitive } from "../../../../../../packages/engines/mausbot/src/primitives.mjs";
import { mausbotSendKillSwitchActive, sharedMausbotSendGuard } from "../../../../../../packages/engines/mausbot/src/send-guard.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return engineFailure("ORIGIN_FORBIDDEN", 403);
  let input: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return engineFailure("REQUEST_TOO_LARGE", 413);
    input = JSON.parse(raw);
  } catch { return engineFailure("INVALID_JSON", 400); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return engineFailure("INVALID_REQUEST", 400);
  const body = input as Record<string, unknown>;
  const access = await requireEngineWorkspace(body.workspaceId, true);
  if (!access.ok) return access.response;
  const gate = mausbotReleasePermission(process.env, "execute");
  if (!gate.allowed) return engineFailure(gate.code, gate.status);
  try {
    const config = resolveMausbotConfig(process.env, body.workspaceId);
    if (!config) return engineFailure("MAUSBOT_NOT_CONFIGURED", 503);
    // Autonomous dispatch is an automation-initiated wake: same dispatcher guard,
    // and it may never wake a Chief of Staff.
    if (mausbotSendKillSwitchActive(process.env)) return engineFailure("MAUSBOT_SEND_KILL_SWITCH", 423);
    let fleet: { agents: unknown[] } | null = null;
    try {
      const listing = await executeMausbotPrimitive(config, "agents.list");
      fleet = Array.isArray(listing?.agents) ? { agents: listing.agents } : null;
    } catch { fleet = null; }
    const decision = sharedMausbotSendGuard().reserve({
      env: process.env, primitive: "conversations.messages.send",
      args: { bot_id: body.botId }, fleet, initiator: { kind: "automation" },
    });
    if (!decision.allowed) {
      const response = engineFailure(decision.code, decision.status);
      if (decision.retryAfterSeconds) response.headers.set("Retry-After", String(decision.retryAfterSeconds));
      return response;
    }
    const result = await mausbotDispatch(config, {
      botId: body.botId, title: body.title, instruction: body.instruction,
    });
    return engineSuccess(result, result.accepted ? 202 : 502);
  } catch (error) {
    if (error instanceof MausbotAdapterError) return engineFailure(error.code, error.status);
    return engineFailure("MAUSBOT_UNAVAILABLE", 503);
  }
}
