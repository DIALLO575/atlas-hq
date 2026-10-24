import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { exchangeNotionAuthorizationCode } from "../../../../../../../packages/connectors/notion/src/oauth.mjs";
import { createNotionReadClient } from "../../../../../../../packages/connectors/notion/src/rest-client.mjs";
import {
  adminNotionClient, notionConnectSettings, notionTokenVault, NOTION_OAUTH_COOKIE,
  validateAndConsumeNotionCallback,
} from "@/lib/notion/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const settings = notionConnectSettings();
  const vault = notionTokenVault();
  if (!settings || !vault || !settings.callbackEnabled) {
    return NextResponse.json({ error: "notion-callback-disabled" },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const result = async (code: "connected" | "invalid-state" | "denied" | "unavailable") => {
    const url = new URL("/apps/notion", settings.publicOrigin);
    url.searchParams.set("notion", code);
    const response = NextResponse.redirect(url, 303);
    response.cookies.set(NOTION_OAUTH_COOKIE, "", {
      path: "/api/apps/notion", maxAge: 0, httpOnly: true,
      secure: settings.publicOrigin.startsWith("https:"), sameSite: "lax",
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const cookieState = request.cookies.get(NOTION_OAUTH_COOKIE)?.value ?? "";
  if (!state || !cookieState || state.length > 512) return result("invalid-state");
  try {
    const admin = adminNotionClient(settings);
    const actor = await validateAndConsumeNotionCallback(admin, {
      state, cookieState, key: settings.stateKey,
    });
    if (!actor) return result("invalid-state");
    // Denied authorization also consumes the state, preventing reuse.
    const code = request.nextUrl.searchParams.get("code");
    if (!code) return result("denied");
    if (code.length > 2048) return result("unavailable");
    const authorization = await exchangeNotionAuthorizationCode({
      clientId: settings.clientId, clientSecret: settings.clientSecret,
      publicOrigin: settings.publicOrigin, redirectUri: settings.redirectUri, code,
    });
    // Provider response is authenticated; confirm token can read its bot identity.
    const bot = await createNotionReadClient({
      token: authorization.accessToken,
    }).getCurrentBot();
    if (bot.id !== authorization.notionBotId) return result("unavailable");
    const envelope = vault.encryptTokens({
      accessToken: authorization.accessToken, refreshToken: authorization.refreshToken,
    }, {
      atlasWorkspaceId: actor.workspaceId, actorUserId: actor.userId,
      notionWorkspaceId: authorization.notionWorkspaceId,
      notionBotId: authorization.notionBotId,
    });
    // Atomic server-only RPC creates/rotates a registry row together with ciphertext.
    const { data, error } = await admin.rpc("atlas_notion_store_connection", {
      p_connection_id: randomUUID(),
      p_workspace_id: actor.workspaceId, p_user_id: actor.userId,
      p_notion_workspace_id: authorization.notionWorkspaceId,
      p_notion_bot_id: authorization.notionBotId,
      p_account_label: authorization.workspaceName || "Espace Notion",
      p_token_key_id: envelope.token_key_id,
      p_access_nonce: envelope.access_nonce,
      p_access_ciphertext: envelope.access_ciphertext,
      p_access_tag: envelope.access_tag,
      p_refresh_nonce: envelope.refresh_nonce,
      p_refresh_ciphertext: envelope.refresh_ciphertext,
      p_refresh_tag: envelope.refresh_tag,
    });
    if (error || typeof data !== "string") return result("unavailable");
    return result("connected");
  } catch {
    // Never log the OAuth code, provider response, decrypted tokens or state.
    return result("unavailable");
  }
}
