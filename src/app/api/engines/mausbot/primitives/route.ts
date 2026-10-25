import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { resolveMausbotConfig, MausbotAdapterError } from "../../../../../../packages/engines/mausbot/src/adapter.mjs";
import { executeMausbotPrimitive } from "../../../../../../packages/engines/mausbot/src/primitives.mjs";
import { MAUSBOT_PRIMITIVES, MAUSBOT_FUTURE_SURFACES, validateMausbotPrimitive, PrimitiveInputError } from "../../../../../../packages/engine-core/src/primitives.mjs";
import { MAUSBOT_NATIVE_CAPABILITIES, nativeCoverageSummary } from "../../../../../../packages/engine-core/src/native-capabilities.mjs";
import { mausbotReleasePermission, mausbotReleaseState } from "../../../../../../packages/engine-core/src/release-gates.mjs";
import { mausbotOwnerControlPermission } from "../../../../../../packages/engine-core/src/mausbot-owner-control.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The manifest is inspectable before MAUSBOT is actually connected. */
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const access = await requireEngineWorkspace(workspaceId);
  if (!access.ok) return access.response;
  return engineSuccess({
    engine: "mausbot", source: "OpenMausBot scripts/mcp-server.ts",
    primitives: MAUSBOT_PRIMITIVES,
    native: MAUSBOT_NATIVE_CAPABILITIES,
    nativeCoverage: nativeCoverageSummary(),
    release: mausbotReleaseState(process.env),
    futureSurfaces: MAUSBOT_FUTURE_SURFACES,
    note: "source-mapped; not yet validated against a live MAUSBOT host",
  });
}

/** Authorized primitive call. No raw API path, arbitrary URL or tool name accepted. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin !== request.nextUrl.origin) return engineFailure("ORIGIN_FORBIDDEN", 403);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return engineFailure("CONTENT_TYPE_INVALID", 415);
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 200_000) return engineFailure("REQUEST_TOO_LARGE", 413);
    body = JSON.parse(raw);
  } catch { return engineFailure("INVALID_JSON", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return engineFailure("PRIMITIVE_INPUT_INVALID", 400);
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((k) => !["workspaceId", "primitive", "args"].includes(k))) {
    return engineFailure("PRIMITIVE_FIELD_NOT_ALLOWED", 400);
  }
  let normalized;
  try { normalized = validateMausbotPrimitive(input.primitive, input.args); }
  catch (error) {
    if (error instanceof PrimitiveInputError) return engineFailure(error.code, 400);
    return engineFailure("PRIMITIVE_INPUT_INVALID", 400);
  }
  const sensitiveRead = ["conversations.messages.list", "channels.messages.list", "search.messages", "jobs.wait"]
    .includes(normalized.def.id);
  const access = await requireEngineWorkspace(input.workspaceId, normalized.def.mode !== "read" || sensitiveRead);
  if (!access.ok) return access.response;
  const gate = mausbotReleasePermission(process.env, normalized.def.mode);
  const ownerControl = normalized.def.mode === "read" ? { allowed: false } :
    mausbotOwnerControlPermission(process.env, {
      role: access.role, workspaceId: input.workspaceId, mode: normalized.def.mode,
    });
  if (!gate.allowed && !ownerControl.allowed) return engineFailure(gate.code, gate.status);

  // The owner explicitly clicked an action. Reserve its ID before any upstream
  // mutation: after a timeout/crash it MUST NOT be dispatched again automatically.
  // No bearer, raw prompt, or external response is stored in this audit record.
  let audit: { id: string; supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>> } | null = null;
  if (ownerControl.allowed) {
    const actionId = request.headers.get("idempotency-key");
    if (!actionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actionId)) {
      return engineFailure("MAUSBOT_ACTION_ID_REQUIRED", 400);
    }
    const supabase = await createSupabaseServerClient();
    if (!supabase) return engineFailure("MAUSBOT_AUDIT_UNAVAILABLE", 503);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return engineFailure("AUTH_REQUIRED", 401);
    const digest = createHash("sha256").update(JSON.stringify({
      workspaceId: input.workspaceId, primitive: normalized.def.id, args: normalized.args,
    })).digest("hex");
    const reserved = await supabase.rpc("atlas_mausbot_action_begin", {
      p_action_id: actionId, p_workspace_id: input.workspaceId,
      p_primitive: normalized.def.id, p_hash: digest,
    });
    if (reserved.error) return engineFailure("MAUSBOT_AUDIT_UNAVAILABLE", 503);
    if (reserved.data !== true) return engineFailure("MAUSBOT_ACTION_ALREADY_RESERVED", 409);
    audit = { id: actionId, supabase };
  }
  const finalize = async (state: "accepted" | "unknown") => {
    if (!audit) return true;
    const complete = await audit.supabase.rpc("atlas_mausbot_action_complete", {
      p_action_id: audit.id, p_state: state,
    });
    return !complete.error && complete.data === true;
  };
  try {
    const config = resolveMausbotConfig(process.env, input.workspaceId);
    if (!config) return engineFailure("MAUSBOT_NOT_CONFIGURED", 503);
    const result = await executeMausbotPrimitive(config, normalized.def.id, normalized.args);
    if (["conversations.messages.list", "channels.messages.list"].includes(normalized.def.id) && result && typeof result === "object") {
      const record = result as Record<string, unknown>;
      const messages = Array.isArray(record.messages) ? record.messages.slice(0, 50).flatMap((value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const message = value as Record<string, unknown>;
        const tool = message.tool && typeof message.tool === "object" && !Array.isArray(message.tool) ? message.tool as Record<string, unknown> : null;
        const card = message.card && typeof message.card === "object" && !Array.isArray(message.card) ? message.card as Record<string, unknown> : null;
        return [{
          id: typeof message.id === "string" ? message.id.slice(0, 160) : null,
          at: typeof message.at === "string" ? message.at.slice(0, 64) : null,
          role: typeof message.role === "string" ? message.role.slice(0, 40) : null,
          kind: typeof message.kind === "string" ? message.kind.slice(0, 40) : null,
          text: typeof message.text === "string" ? message.text.slice(0, 6000) : "",
          hasImage: message.hasImage === true,
          steered: message.steered === true, queued: message.queued === true,
          ...(tool ? { tool: {
            ...(typeof tool.name === "string" ? { name: tool.name.slice(0, 100) } : {}),
            ...(typeof tool.ok === "boolean" ? { ok: tool.ok } : {}),
            ...(typeof tool.spoken === "string" ? { spoken: tool.spoken.slice(0, 3000) } : {}),
            ...(typeof tool.setup === "string" ? { setup: tool.setup.slice(0, 3000) } : {}),
            ...(typeof tool.terminal === "string" ? { terminal: tool.terminal.slice(0, 3000) } : {}),
          } } : {}),
          ...(card ? { card: {
            ...(typeof card.title === "string" ? { title: card.title.slice(0, 300) } : {}),
            ...(typeof card.subtitle === "string" ? { subtitle: card.subtitle.slice(0, 1000) } : {}),
            ...(typeof card.answered === "boolean" ? { answered: card.answered } : {}),
            ...(typeof card.dismissed === "boolean" ? { dismissed: card.dismissed } : {}),
            ...(typeof card.expired === "boolean" ? { expired: card.expired } : {}),
          } } : {}),
        }];
      }) : [];
      return engineSuccess({ primitive: normalized.def.id, result: {
        taskId: typeof record.taskId === "string" ? record.taskId.slice(0, 120) : null,
        hasMore: record.hasMore === true, messages,
      } });
    }
    if (!await finalize("accepted")) return engineFailure("MAUSBOT_ACTION_OUTCOME_UNKNOWN", 503);
    return engineSuccess({ primitive: normalized.def.id, result },
      normalized.def.mode === "read" ? 200 : 202);
  } catch (error) {
    if (!await finalize("unknown")) return engineFailure("MAUSBOT_ACTION_OUTCOME_UNKNOWN", 503);
    if (error instanceof PrimitiveInputError) return engineFailure(error.code, 400);
    if (error instanceof MausbotAdapterError) return engineFailure(error.code, error.status);
    return engineFailure("MAUSBOT_UNAVAILABLE", 503);
  }
}
