import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { projectAtlasActionCatalog } from "../../../../../packages/action-gateway/src/catalog.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * User-session read of Atlas's *implemented* action contract only.
 * NOT an n8n machine endpoint and not an MCP server or connector action API.
 * No secrets, live provider checks or permissions claimed; every item
 * remains available:false/callable:false until a separate release.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workspaceId = params.get("workspaceId");
  const access = await requireEngineWorkspace(workspaceId);
  if (!access.ok) return access.response;
  if (params.getAll("workspaceId").length !== 1 ||
      params.getAll("surface").length > 1 ||
      [...params.keys()].some(key => key !== "workspaceId" && key !== "surface")) {
    return engineFailure("ATLAS_ACTION_QUERY_INVALID", 400);
  }
  const surface = params.get("surface") ?? "rest";
  if (surface !== "rest" && surface !== "mcp")
    return engineFailure("ATLAS_ACTION_SURFACE_INVALID", 400);
  return engineSuccess({
    kind: "atlas-action-catalog",
    surface,
    workspaceId,
    providerConnected: false,
    gatewayReleased: false,
    machineAuthEnabled: false,
    providerActionsEnabled: false,
    tools: projectAtlasActionCatalog(surface),
    note: "CATALOG_ONLY_NO_PROVIDER_IO",
  });
}
