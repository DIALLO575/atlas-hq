import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import {
  MausbotAdapterError, resolveMausbotConfig, mausbotDispatch,
} from "../../../../../../packages/engines/mausbot/src/adapter.mjs";

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
  try {
    const config = resolveMausbotConfig(process.env, body.workspaceId);
    if (!config) return engineFailure("MAUSBOT_NOT_CONFIGURED", 503);
    const result = await mausbotDispatch(config, {
      botId: body.botId, title: body.title, instruction: body.instruction,
    });
    return engineSuccess(result, result.accepted ? 202 : 502);
  } catch (error) {
    if (error instanceof MausbotAdapterError) return engineFailure(error.code, error.status);
    return engineFailure("MAUSBOT_UNAVAILABLE", 503);
  }
}
