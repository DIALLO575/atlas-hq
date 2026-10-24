import { NextRequest, NextResponse } from "next/server";
import { callbackLinearOAuthRoute } from "../../../../../../../packages/connectors/linear/src/connect-routes.mjs";
import {
  adminLinearStateClient, consumeRegisteredLinearOAuthState, linearConnectSettings,
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
 * Deliberately unavailable until encrypted durable credential storage is reviewed.
 * This route never exchanges a code or persists Linear tokens.
 */
export async function GET(request: NextRequest) {
  const settings = linearConnectSettings();
  return toNextResponse(await callbackLinearOAuthRoute(request, {
    settings,
    resolveActorForState: async (stateHash) => {
      const admin = adminLinearStateClient(settings!);
      return requireLinearWorkspaceAdminForState(admin, stateHash);
    },
    consumeState: async ({ state, cookieState, workspaceId, userId, stateKey }) => {
      const admin = adminLinearStateClient(settings!);
      return consumeRegisteredLinearOAuthState(admin, { state, cookieState, workspaceId, userId, stateKey });
    },
  }));
}
