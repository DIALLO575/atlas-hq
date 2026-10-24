import { NextRequest, NextResponse } from "next/server";
import { readLinearResourceRoute } from "../../../../../../packages/connectors/linear/src/linear-read.mjs";
import { refreshLinearConnectionRoute } from "../../../../../../packages/connectors/linear/src/connect-routes.mjs";
import { refreshLinearOAuthToken, revokeLinearOAuthTokens } from "../../../../../../packages/connectors/linear/src/oauth.mjs";
import {
  claimLinearConnectionRefresh, completeLinearConnectionRefresh,
  invalidateUncertainLinearRefresh, rejectLinearConnectionRefresh,
} from "../../../../../../packages/connectors/linear/src/connection-store.mjs";
import {
  adminLinearStateClient, linearConnectSettings, linearTokenVault,
  loadLinearConnectionForCurrentActor, requireLinearWorkspaceMember,
} from "@/lib/linear/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const settings = linearConnectSettings();
  const vault = linearTokenVault();
  if (!settings || !vault) {
    return NextResponse.json({ error: "linear-not-configured" }, {
      status: 503, headers: { "Cache-Control": "private, no-store" },
    });
  }
  const admin = adminLinearStateClient(settings);
  const loadConnection = (actor: { workspaceId: string; userId: string }) =>
    loadLinearConnectionForCurrentActor(admin, actor, vault, { allowExpired: true, allowMemberRead: true });

  const result = await readLinearResourceRoute(request, {
    publicOrigin: settings.publicOrigin,
    authorizeWorkspaceMember: requireLinearWorkspaceMember,
    loadConnection,
    refreshConnection: async (actor) => {
      const refreshRequest = new Request(`${settings.publicOrigin}/api/apps/linear/connect/refresh`, {
        method: "POST",
        headers: { origin: settings.publicOrigin, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ workspaceId: actor.workspaceId }),
      });
      const refreshed = await refreshLinearConnectionRoute(refreshRequest, {
        settings: { publicOrigin: settings.publicOrigin, clientId: settings.clientId, clientSecret: settings.clientSecret },
        authorizeWorkspaceAdmin: requireLinearWorkspaceMember,
        loadConnection,
        claimRefresh: ({ actor: current, version, attemptId }) => claimLinearConnectionRefresh(admin, {
          workspaceId: current.workspaceId, userId: current.userId, expectedVersion: version, attemptId,
        }),
        requestRefresh: (refreshToken) => refreshLinearOAuthToken({
          refreshToken, clientId: settings.clientId, clientSecret: settings.clientSecret,
        }),
        completeRefresh: ({ actor: current, version, attemptId, connection, tokens, scopes, expiresAt }) =>
          completeLinearConnectionRefresh(admin, {
            workspaceId: current.workspaceId, userId: current.userId,
            expectedVersion: version, attemptId, connection, tokens, scopes, expiresAt, vault,
          }),
        rejectRefresh: ({ actor: current, version, attemptId }) => rejectLinearConnectionRefresh(admin, {
          workspaceId: current.workspaceId, userId: current.userId, expectedVersion: version, attemptId,
        }),
        invalidateUncertainRefresh: ({ actor: current, version, attemptId }) => invalidateUncertainLinearRefresh(admin, {
          workspaceId: current.workspaceId, userId: current.userId, expectedVersion: version, attemptId,
        }),
        revokeTokens: (tokens) => revokeLinearOAuthTokens(tokens),
      });
      return refreshed.kind === "json" ? { status: refreshed.status, result: refreshed.result } : null;
    },
  });

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
