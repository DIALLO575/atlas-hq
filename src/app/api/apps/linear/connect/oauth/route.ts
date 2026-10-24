import { NextRequest, NextResponse } from "next/server";
import { callbackLinearOAuthRoute } from "../../../../../../../packages/connectors/linear/src/connect-routes.mjs";
import { exchangeLinearAuthorizationCode, revokeLinearOAuthTokens } from "../../../../../../../packages/connectors/linear/src/oauth.mjs";
import { verifyLinearOAuthIdentity } from "../../../../../../../packages/connectors/linear/src/linear-identity.mjs";
import { saveLinearConnection } from "../../../../../../../packages/connectors/linear/src/connection-store.mjs";
import {
  adminLinearStateClient, assertLinearConnectionStoreReady, consumeRegisteredLinearOAuthState,
  linearConnectSettings, linearTokenVault,
  requireLinearWorkspaceAdminForState,
} from "@/lib/linear/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNextResponse(result: Awaited<ReturnType<typeof callbackLinearOAuthRoute>>) {
  const response = result.kind === "redirect"
    ? NextResponse.redirect(result.location, result.status)
    : NextResponse.json({ error: result.error }, { status: result.status });
  for (const [name, value] of Object.entries(result.headers)) response.headers.set(name, value);
  for (const cookie of result.cookies) {
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite,
      path: cookie.path, maxAge: cookie.maxAge,
    });
  }
  return response;
}

/**
 * Disabled by default. Enabling requires explicit server configuration and encryption keys.
 * The server-only connection migration is recorded in the official project history.
 */
export async function GET(request: NextRequest) {
  const settings = linearConnectSettings();
  const vault = linearTokenVault();
  const admin = settings ? adminLinearStateClient(settings) : null;
  return toNextResponse(await callbackLinearOAuthRoute(request, {
    settings,
    callbackEnabled: settings?.callbackEnabled === true && Boolean(vault),
    clientSecret: settings?.clientSecret,
    resolveActorForState: async (stateHash) => admin
      ? requireLinearWorkspaceAdminForState(admin, stateHash) : null,
    consumeState: async ({ state, cookieState, workspaceId, userId, stateKey }) => {
      return admin
        ? consumeRegisteredLinearOAuthState(admin, { state, cookieState, workspaceId, userId, stateKey })
        : false;
    },
    prepareConnectionStore: async (actor) => {
      if (!admin) throw new Error("LINEAR_CONNECTION_STORE_UNAVAILABLE");
      await assertLinearConnectionStoreReady(admin, actor);
    },
    exchangeCode: (args) => exchangeLinearAuthorizationCode(args),
    revokeTokens: (tokens) => revokeLinearOAuthTokens(tokens),
    verifyLinearIdentity: (accessToken) => verifyLinearOAuthIdentity(accessToken),
    saveConnection: (record) => admin && vault
      ? saveLinearConnection(admin, { ...record, vault })
      : Promise.reject(new Error("LINEAR_CONNECTION_STORE_UNAVAILABLE")),
  }));
}
