import { NextRequest } from "next/server";
import { engineFailure, engineSuccess, requireEngineWorkspace } from "@/lib/engines/access";
import { resolveMausbotConfig, MausbotAdapterError } from "../../../../../../packages/engines/mausbot/src/adapter.mjs";
import { executeMausbotPrimitive } from "../../../../../../packages/engines/mausbot/src/primitives.mjs";
import { MAUSBOT_PRIMITIVES, MAUSBOT_FUTURE_SURFACES, validateMausbotPrimitive, PrimitiveInputError } from "../../../../../../packages/engine-core/src/primitives.mjs";
import { MAUSBOT_NATIVE_CAPABILITIES, nativeCoverageSummary } from "../../../../../../packages/engine-core/src/native-capabilities.mjs";

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
    futureSurfaces: MAUSBOT_FUTURE_SURFACES,
    note: "source-mapped; not yet validated against a live MAUSBOT host",
  });
}

/** Authorized primitive call. No raw API path, arbitrary URL or tool name accepted. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return engineFailure("ORIGIN_FORBIDDEN", 403);
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 200_000) return engineFailure("REQUEST_TOO_LARGE", 413);
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
  const access = await requireEngineWorkspace(input.workspaceId, normalized.def.mode !== "read");
  if (!access.ok) return access.response;
  try {
    const config = resolveMausbotConfig(process.env, input.workspaceId);
    if (!config) return engineFailure("MAUSBOT_NOT_CONFIGURED", 503);
    const result = await executeMausbotPrimitive(config, normalized.def.id, normalized.args);
    return engineSuccess({ primitive: normalized.def.id, result },
      normalized.def.mode === "read" ? 200 : 202);
  } catch (error) {
    if (error instanceof PrimitiveInputError) return engineFailure(error.code, 400);
    if (error instanceof MausbotAdapterError) return engineFailure(error.code, error.status);
    return engineFailure("MAUSBOT_UNAVAILABLE", 503);
  }
}
