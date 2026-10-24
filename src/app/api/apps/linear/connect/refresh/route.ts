import { NextRequest, NextResponse } from "next/server";
import { refreshLinearConnectionRoute } from "../../../../../../../packages/connectors/linear/src/connect-routes.mjs";
import { refreshLinearOAuthToken, revokeLinearOAuthTokens } from "../../../../../../../packages/connectors/linear/src/oauth.mjs";
import {
  claimLinearConnectionRefresh, completeLinearConnectionRefresh,
  invalidateUncertainLinearRefresh, rejectLinearConnectionRefresh,
} from "../../../../../../../packages/connectors/linear/src/connection-store.mjs";
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
  const result = await refreshLinearConnectionRoute(request, {
    settings: activeSettings,
    authorizeWorkspaceAdmin: requireLinearWorkspaceAdmin,
    loadConnection: async (actor) => admin
      ? loadLinearConnectionForCurrentActor(admin, actor, vault, { allowExpired: true }) : null,
    claimRefresh: ({ actor, version, attemptId }) => admin
      ? claimLinearConnectionRefresh(admin, { workspaceId: actor.workspaceId, userId: actor.userId, expectedVersion: version, attemptId })
      : Promise.resolve(false),
    requestRefresh: (refreshToken) => refreshLinearOAuthToken({
      refreshToken, clientId: activeSettings!.clientId, clientSecret: activeSettings!.clientSecret,
    }),
    completeRefresh: ({ actor, version, attemptId, connection, tokens, scopes, expiresAt }) => admin && vault
      ? completeLinearConnectionRefresh(admin, {
        workspaceId: actor.workspaceId, userId: actor.userId, expectedVersion: version, attemptId,
        connection, tokens, scopes, expiresAt, vault,
      }) : Promise.resolve(false),
    rejectRefresh: ({ actor, version, attemptId }) => admin
      ? rejectLinearConnectionRefresh(admin, { workspaceId: actor.workspaceId, userId: actor.userId, expectedVersion: version, attemptId })
      : Promise.resolve(false),
    invalidateUncertainRefresh: ({ actor, version, attemptId }) => admin
      ? invalidateUncertainLinearRefresh(admin, { workspaceId: actor.workspaceId, userId: actor.userId, expectedVersion: version, attemptId })
      : Promise.resolve(false),
    revokeTokens: (tokens) => revokeLinearOAuthTokens(tokens),
  });
  const body = result.error ? { error: result.error }
    : { result: result.result, ...(result.providerRevocation ? { providerRevocation: result.providerRevocation } : {}) };
  return NextResponse.json(body, { status: result.status, headers: result.headers });
}
