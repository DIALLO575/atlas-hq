import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { resolveMausbotConfig, MausbotAdapterError } from "../../../../../../packages/engines/mausbot/src/adapter.mjs";
import { readMausbotNeedsYou } from "../../../../../../packages/engines/mausbot/src/needs-you.mjs";
import { mausbotReleasePermission } from "../../../../../../packages/engine-core/src/release-gates.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Private viewer-scoped attention read. No browser token, no mutation and
 * no fallback to a broad team-admin token without a verified identity binding.
 */
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const access = await requireEngineWorkspace(workspaceId, true);
  if (!access.ok) return access.response;
  if ([...request.nextUrl.searchParams.keys()].some(key => key !== "workspaceId") ||
      request.nextUrl.searchParams.getAll("workspaceId").length !== 1) {
    return engineFailure("NEEDS_YOU_QUERY_INVALID",400);
  }
  const permission=mausbotReleasePermission(process.env,"read");
  if(!permission.allowed) return engineFailure(permission.code,permission.status);
  // The host API scopes Needs You to the token's identity, not the ATLAS user.
  // Verification of that identity mapping is mandatory to prevent cross-person
  // leakage of private questions on shared Team Cloud installations.
  if(process.env.ATLAS_MAUSBOT_NEEDS_YOU_IDENTITY_VERIFIED!=="true")
    return engineFailure("MAUSBOT_VIEWER_IDENTITY_UNVERIFIED",423);
  try {
    const config=resolveMausbotConfig(process.env,workspaceId);
    if(!config) return engineFailure("MAUSBOT_NOT_CONFIGURED",503);
    return engineSuccess(await readMausbotNeedsYou(config));
  } catch(error) {
    if(error instanceof MausbotAdapterError) return engineFailure(error.code,error.status);
    return engineFailure("MAUSBOT_UNAVAILABLE",503);
  }
}
