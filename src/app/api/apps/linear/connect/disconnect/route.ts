import { NextRequest, NextResponse } from "next/server";
import { disconnectLinearConnectionRoute } from "../../../../../../../packages/connectors/linear/src/connect-routes.mjs";
import { revokeLinearOAuthTokens } from "../../../../../../../packages/connectors/linear/src/oauth.mjs";
import { revokeLinearConnection } from "../../../../../../../packages/connectors/linear/src/connection-store.mjs";
import {
  adminLinearStateClient, linearConnectSettings, linearTokenVault,
  loadLinearConnectionForCurrentActor, requireLinearWorkspaceAdmin,
} from "@/lib/linear/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const settings = linearConnectSettings();
  const vault = linearTokenVault();
  const activeSettings = settings && vault ? settings : null;
  const admin = activeSettings ? adminLinearStateClient(activeSettings) : null;
  const result = await disconnectLinearConnectionRoute(request, {
    settings: activeSettings,
    authorizeWorkspaceAdmin: requireLinearWorkspaceAdmin,
    loadConnection: async (actor) => admin
      ? loadLinearConnectionForCurrentActor(admin, actor, vault, { allowExpired: true, includeRevoked: true }) : null,
    revokeLocal: ({ actor, version }) => admin
      ? revokeLinearConnection(admin, { workspaceId: actor.workspaceId, userId: actor.userId, expectedVersion: version })
      : Promise.resolve(false),
    revokeTokens: (tokens) => revokeLinearOAuthTokens(tokens),
  });
  const body = result.error ? { error: result.error }
    : { result: result.result, providerRevocation: result.providerRevocation };
  return NextResponse.json(body, { status: result.status, headers: result.headers });
}
