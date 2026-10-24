import { NextRequest, NextResponse } from "next/server";
import {
  adminLinearStateClient, linearConnectSettings, linearTokenVault, requireLinearWorkspaceMember,
} from "@/lib/linear/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? "";
  const actor = await requireLinearWorkspaceMember(workspaceId);
  if (!actor) return NextResponse.json({ error: "workspace-forbidden" }, {
    status: 403, headers: { "Cache-Control": "private, no-store" },
  });

  const settings = linearConnectSettings();
  const vault = linearTokenVault();
  if (!settings || !vault) return NextResponse.json({
    configured: false, callbackEnabled: false, connected: false,
  }, { headers: { "Cache-Control": "private, no-store" } });

  try {
    const admin = adminLinearStateClient(settings);
    // This is a status-only query for the verified current actor. Selecting ciphertext
    // or decrypting credentials is unnecessary for rendering the connection state.
    const { data: connection, error } = await admin.from("atlas_linear_connections")
      .select("access_expires_at,revoked_at")
      .eq("workspace_id", actor.workspaceId).eq("user_id", actor.userId).maybeSingle();
    if (error) throw new Error("LINEAR_CONNECTION_STORE_UNAVAILABLE");
    return NextResponse.json({
      configured: true,
      callbackEnabled: settings.callbackEnabled,
      connected: Boolean(connection && !connection.revokedAt),
      accessExpiresAt: connection?.accessExpiresAt ?? null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "linear-status-unavailable" }, {
      status: 503, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
