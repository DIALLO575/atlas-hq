import { NextRequest, NextResponse } from "next/server";
import { createLinearPkcePair, linearAuthorizationUrl } from "../../../../../../../packages/connectors/linear/src/oauth.mjs";
import {
  adminLinearStateClient, linearConnectCookieName, linearConnectSettings,
  linearPkceCookieName, registerLinearOAuthState, requireLinearWorkspaceAdmin,
} from "@/lib/linear/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const settings = linearConnectSettings();
  if (!settings) return NextResponse.json({ error: "LINEAR_NOT_CONFIGURED" }, { status: 503 });
  if (request.headers.get("origin") !== settings.publicOrigin) {
    return NextResponse.json({ error: "BAD_ORIGIN" }, { status: 403 });
  }

  let workspaceId = "";
  try {
    workspaceId = String((await request.formData()).get("workspaceId") ?? "");
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const actor = await requireLinearWorkspaceAdmin(workspaceId);
  if (!actor) return NextResponse.json({ error: "WORKSPACE_FORBIDDEN" }, { status: 403 });

  try {
    const admin = adminLinearStateClient(settings);
    const state = await registerLinearOAuthState(admin, {
      workspaceId: actor.workspaceId, userId: actor.userId, stateKey: settings.stateKey,
    });
    const { verifier, challenge } = createLinearPkcePair();
    const authorize = linearAuthorizationUrl({
      clientId: settings.clientId,
      redirectUri: settings.redirectUri,
      state,
      codeChallenge: challenge,
    });
    const response = NextResponse.redirect(authorize, 303);
    response.headers.set("Cache-Control", "private, no-store");
    const cookieOptions = {
      httpOnly: true, secure: true, sameSite: "lax" as const,
      path: "/api/apps/linear/connect", maxAge: 15 * 60,
    };
    response.cookies.set(linearConnectCookieName, state, cookieOptions);
    // PKCE verifier stays in a short-lived HttpOnly cookie and is never put in the URL.
    response.cookies.set(linearPkceCookieName, verifier, cookieOptions);
    return response;
  } catch {
    return NextResponse.json({ error: "LINEAR_OAUTH_UNAVAILABLE" }, { status: 503 });
  }
}
