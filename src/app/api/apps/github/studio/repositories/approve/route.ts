import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { githubConnectSettings } from "@/lib/github/connect";
import {
  GitHubStudioError, parseRepositoryDraft, verifiedPersonalInstallation,
} from "../../../../../../../../packages/connectors/github/src/github-studio-create.mjs";
import { readStudioCreationPermission } from "../../../../../../../../packages/connectors/github/src/github-studio-permission.mjs";
import { issueStudioApprovalReceipt } from "../../../../../../../../packages/connectors/github/src/github-studio-approval.mjs";
import { studioMutationMode, studioSandboxBindingAllowed } from "@/lib/github/studio-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (error: string, status: number) => NextResponse.json({error}, {
  status, headers: {"Cache-Control":"no-store"},
});

/** Approves a bound INTENT in preview sandbox. Does NOT execute a GitHub write. */
export async function POST(request: NextRequest) {
  const mode = studioMutationMode();
  if (!mode) return reply("STUDIO_APPROVAL_DISABLED",404);
  const settings = githubConnectSettings();
  if (!settings || !settings.publicOrigin.startsWith("https://")) {
    return reply("STUDIO_NOT_CONFIGURED",503);
  }
  if (request.headers.get("origin") !== settings.publicOrigin ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return reply("FORBIDDEN_ORIGIN",403);
  }
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!UUID.test(idempotencyKey ?? "")) return reply("INVALID_INPUT",400);
  const len = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(len) || len > 2048) return reply("INVALID_INPUT",400);

  let draft;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return reply("INVALID_INPUT",400);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply("INVALID_INPUT",400);
    const { approved, typedName, ...spec } = body as Record<string, unknown>;
    if (approved !== true || typeof typedName !== "string") return reply("APPROVAL_REQUIRED",400);
    draft = parseRepositoryDraft(spec);
    if (typedName !== draft.name) return reply("APPROVAL_NAME_MISMATCH",400);
  } catch(error) {
    return reply(error instanceof GitHubStudioError ? error.code : "INVALID_INPUT",400);
  }

  if (!studioSandboxBindingAllowed(mode, draft.workspaceId, draft.installationId)) {
    return reply("SANDBOX_ONLY",403);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return reply("AUTH_UNAVAILABLE",503);
  const {data:{user},error:userError} = await supabase.auth.getUser();
  if (userError || !user) return reply("AUTH_REQUIRED",401);
  const {data:member,error:memberError} = await supabase.from("workspace_members")
    .select("role").eq("workspace_id",draft.workspaceId)
    .eq("user_id",user.id).maybeSingle();
  if (memberError) return reply("WORKSPACE_UNAVAILABLE",503);
  if (!member || !["owner","admin"].includes(member.role)) return reply("WORKSPACE_FORBIDDEN",403);

  const {data:row,error:installError} = await supabase.from("atlas_github_installations")
    .select("installation_id, workspace_id, status, repository_selection, ownership_verified_at, repositories_verified_at")
    .eq("workspace_id",draft.workspaceId).eq("installation_id",draft.installationId).maybeSingle();
  if (installError) return reply("CONNECTIONS_UNAVAILABLE",503);
  const binding = row && {
    workspaceId:row.workspace_id, installationId:Number(row.installation_id),
    status:row.status,repositorySelection:row.repository_selection,
    ownershipVerifiedAt:row.ownership_verified_at,repositoriesVerifiedAt:row.repositories_verified_at,
  };
  if (!verifiedPersonalInstallation(binding,draft.workspaceId,draft.installationId)) {
    return reply("GITHUB_NOT_AUTHORIZED",403);
  }
  try {
    const permission = await readStudioCreationPermission({
      workspaceId:draft.workspaceId,installationId:draft.installationId,binding,
      appId:settings.appId,privateKey:settings.appPrivateKey,
    });
    if (permission.status !== "granted") return reply("GITHUB_WRITE_NOT_APPROVED",403);
    const receipt = issueStudioApprovalReceipt({
      draft,actorId:user.id,idempotencyKey:idempotencyKey!,
      secret:settings.stateKey,
    });
    return NextResponse.json({
      approved:true,receipt:receipt.receipt,expiresAt:receipt.expiresAt,
      canExecute:true,notice:"APPROVED_ONLY_NOT_DISPATCHED",
    }, {headers:{"Cache-Control":"no-store"}});
  } catch {
    return reply("GITHUB_PERMISSION_UNAVAILABLE",503);
  }
}
