import { NextRequest, NextResponse } from "next/server";
import { startLinearOAuthRoute } from "../../../../../../../packages/connectors/linear/src/connect-routes.mjs";
import {
  adminLinearStateClient, linearConnectCookieName, linearConnectSettings,
  linearPkceCookieName, registerLinearOAuthState, requireLinearWorkspaceAdmin,
} from "@/lib/linear/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNextResponse(result: Awaited<ReturnType<typeof startLinearOAuthRoute>>) {
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

export async function POST(request: NextRequest) {
  const settings = linearConnectSettings();
  return toNextResponse(await startLinearOAuthRoute(request, {
    settings,
    authorizeWorkspaceAdmin: requireLinearWorkspaceAdmin,
    registerState: async ({ workspaceId, userId, stateKey, now }) => {
      const admin = adminLinearStateClient(settings!);
      return registerLinearOAuthState(admin, { workspaceId, userId, stateKey, now });
    },
  }));
}
