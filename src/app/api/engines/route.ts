import { NextRequest } from "next/server";
import { ENGINE_CATALOG } from "../../../../packages/engine-core/src/catalog.mjs";
import { resolveMausbotConfig } from "../../../../packages/engines/mausbot/src/adapter.mjs";
import { resolveN8nReadOnlyConfig } from "../../../../packages/engines/n8n/src/adapter.mjs";
import { mausbotReleaseState } from "../../../../packages/engine-core/src/release-gates.mjs";
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
  // Server configuration is not proof of live n8n reachability or grants.
  let n8nConfigured = false;
  try { n8nConfigured = Boolean(resolveN8nReadOnlyConfig(process.env, workspaceId)); }
  catch { n8nConfigured = false; }
  const release = mausbotReleaseState(process.env);
  return engineSuccess({
    engines: ENGINE_CATALOG.map((engine) => ({
      ...engine, status: engine.id === "mausbot"
        ? (configured ? (release.readsEnabled ? "configured" : "preconnection") : "not-configured")
        : engine.id === "n8n" ? (n8nConfigured ? "preconnection" : "not-configured") : "planned",
    })),
  });
}
