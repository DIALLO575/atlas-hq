import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { MausbotAdapterError, resolveMausbotConfig } from "../../../../../../packages/engines/mausbot/src/adapter.mjs";
import { mausbotReleasePermission } from "../../../../../../packages/engine-core/src/release-gates.mjs";
import {
  createTeamViewCache, fetchMausbotBotDetail, fetchMausbotSectionContext, fetchMausbotTeamView,
  MAUSBOT_TEAM_VIEW_ID, TeamViewInputError,
} from "../../../../../../packages/engines/mausbot/src/team-view.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One process-wide cache: 20 s freshness, at most one upstream refresh per 10 s per key.
const cache = createTeamViewCache();

/**
 * Owner-only, read-only Teams & Chiefs view.
 *   ?workspaceId=…                 -> teams, chiefs, members, status
 *   ?workspaceId=…&botId=…         -> overview + activity of one visible bot
 *   ?workspaceId=…&section=…       -> section-context METADATA (never its text)
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if ([...params.keys()].some((k) => !["workspaceId", "botId", "section"].includes(k))) {
    return engineFailure("TEAM_VIEW_FIELD_NOT_ALLOWED", 400);
  }
  const workspaceId = params.get("workspaceId");
  const botId = params.get("botId");
  const section = params.get("section");
  if (botId !== null && !MAUSBOT_TEAM_VIEW_ID.test(botId)) return engineFailure("TEAM_VIEW_ID_INVALID", 400);
  if (section !== null && !/^[\p{L}\p{N} _&().-]{1,60}$/u.test(section)) return engineFailure("TEAM_VIEW_SECTION_INVALID", 400);
  if (botId !== null && section !== null) return engineFailure("TEAM_VIEW_FIELD_NOT_ALLOWED", 400);
  const access = await requireEngineWorkspace(workspaceId);
  if (!access.ok) return access.response;
  if (access.role !== "owner") return engineFailure("MAUSBOT_OWNER_REQUIRED", 403);
  const gate = mausbotReleasePermission(process.env, "read");
  if (!gate.allowed) return engineFailure(gate.code, gate.status);
  const config = resolveMausbotConfig(process.env, workspaceId);
  if (!config) return engineFailure("MAUSBOT_NOT_CONFIGURED", 503);
  try {
    const key = [workspaceId, botId ? "bot:" + botId : section ? "section:" + section : "teams"].join("|");
    const data = await cache.get(key, () => botId ? fetchMausbotBotDetail(config, botId)
      : section ? fetchMausbotSectionContext(config, section) : fetchMausbotTeamView(config));
    return engineSuccess(data);
  } catch (error) {
    if (error instanceof TeamViewInputError) return engineFailure(error.code, error.code === "TEAM_VIEW_BOT_NOT_VISIBLE" ? 404 : 400);
    if (error instanceof MausbotAdapterError) return engineFailure(error.code, error.status);
    return engineFailure("MAUSBOT_UNAVAILABLE", 503);
  }
}
