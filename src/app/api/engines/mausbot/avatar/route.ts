import { NextRequest, NextResponse } from "next/server";
import { engineFailure, requireEngineWorkspace } from "@/lib/engines/access";
import { resolveMausbotConfig } from "../../../../../../packages/engines/mausbot/src/adapter.mjs";
import { executeMausbotPrimitive } from "../../../../../../packages/engines/mausbot/src/primitives.mjs";
import { fetchMausbotAvatar, mausbotAvatarAvailable, storedMausbotAvatarPath } from "../../../../../../packages/engines/mausbot/src/avatar.mjs";
import { mausbotReleasePermission } from "../../../../../../packages/engine-core/src/release-gates.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The browser supplies only an agent ID. Each request is workspace-authenticated;
// the image URL is resolved from MAUSBOT's live bot inventory, not from user input.
// Tokens, attachment filenames and raw upstream URLs never reach client JSON.
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const botId = request.nextUrl.searchParams.get("botId");
  if (!botId || !/^[A-Za-z0-9_-]{1,120}$/.test(botId)) return engineFailure("MAUSBOT_AVATAR_ID_INVALID", 400);
  const access = await requireEngineWorkspace(workspaceId);
  if (!access.ok) return access.response;
  const gate = mausbotReleasePermission(process.env, "read");
  if (!gate.allowed) return engineFailure(gate.code, gate.status);
  try {
    const config = resolveMausbotConfig(process.env, workspaceId);
    if (!config) return engineFailure("MAUSBOT_NOT_CONFIGURED", 503);
    const listing = await executeMausbotPrimitive(config, "agents.list");
    const bot = Array.isArray(listing.agents)
      ? listing.agents.find((agent: unknown) => agent !== null && typeof agent === "object" &&
          (agent as { id?: unknown }).id === botId)
      : null;
    if (!bot || !mausbotAvatarAvailable(bot)) return engineFailure("MAUSBOT_AVATAR_NOT_FOUND", 404);
    const path = storedMausbotAvatarPath(bot.avatarUrl);
    if (!path) return engineFailure("MAUSBOT_AVATAR_NOT_FOUND", 404);
    const { bytes, mime } = await fetchMausbotAvatar(config, path);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=300, must-revalidate",
        "Vary": "Cookie",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return engineFailure("MAUSBOT_AVATAR_UNAVAILABLE", 503);
  }
}
