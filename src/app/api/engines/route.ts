import { NextRequest } from "next/server";
import { ENGINE_CATALOG } from "../../../../packages/engine-core/src/catalog.mjs";
import { resolveMausbotConfig } from "../../../../packages/engines/mausbot/src/adapter.mjs";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const access = await requireEngineWorkspace(workspaceId);
  if (!access.ok) return access.response;
  let configured = false;
  try { configured = Boolean(resolveMausbotConfig(process.env, workspaceId)); }
  catch { return engineFailure("ENGINE_CONFIGURATION_INVALID", 503); }
  return engineSuccess({
    engines: ENGINE_CATALOG.map((engine) => ({
      ...engine, status: engine.id === "mausbot" ? (configured ? "configured" : "not-configured") : "planned",
    })),
  });
}
