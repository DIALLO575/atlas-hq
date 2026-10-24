import { NextRequest, NextResponse } from "next/server";
import { readLinearOAuthState } from "../../../../../../../packages/connectors/linear/src/oauth-state.mjs";
import {
  adminLinearStateClient, consumeRegisteredLinearOAuthState, linearConnectCookieName,
  linearConnectRedirect, linearConnectSettings, linearPkceCookieName, requireLinearWorkspaceAdminForState,
} from "@/lib/linear/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finish(settings: NonNullable<ReturnType<typeof linearConnectSettings>>, result: string) {
  const response = NextResponse.redirect(linearConnectRedirect(settings, result), 303);
  response.headers.set("Cache-Control", "private, no-store");
  for (const name of [linearConnectCookieName, linearPkceCookieName]) {
    response.cookies.set(name, "", {
      httpOnly: true, secure: true, sameSite: "lax",
      path: "/api/apps/linear/connect", maxAge: 0,
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
  if (!settings) return NextResponse.json({ error: "LINEAR_NOT_CONFIGURED" }, { status: 503 });
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const cookieState = request.cookies.get(linearConnectCookieName)?.value ?? "";
  const verifier = request.cookies.get(linearPkceCookieName)?.value ?? "";
  const proof = readLinearOAuthState({ state, cookieState, key: settings.stateKey });
  if (!proof || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) return finish(settings, "invalid-state");

  const admin = adminLinearStateClient(settings);
  const actor = await requireLinearWorkspaceAdminForState(admin, proof.stateHash);
  if (!actor) return finish(settings, "forbidden");
  const consumed = await consumeRegisteredLinearOAuthState(admin, {
    state, cookieState, workspaceId: actor.workspaceId, userId: actor.userId,
    stateKey: settings.stateKey,
  });
  if (!consumed) return finish(settings, "invalid-state");
  if (request.nextUrl.searchParams.has("error") || !request.nextUrl.searchParams.get("code")) {
    return finish(settings, "oauth-denied");
  }

  // Fail closed before token exchange. No encrypted credential store is available yet.
  return finish(settings, "callback-disabled");
}
