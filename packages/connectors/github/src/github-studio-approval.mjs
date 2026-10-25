import { createHmac, timingSafeEqual } from "node:crypto";
import { parseRepositoryDraft, GitHubStudioError } from "./github-studio-create.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TTL = 5 * 60 * 1000;
const invalid = () => { throw new GitHubStudioError("APPROVAL_INVALID"); };

function canonical({ draft, actorId, idempotencyKey }) {
  if (!UUID.test(actorId ?? "") || !UUID.test(idempotencyKey ?? "")) invalid();
  const parsed = parseRepositoryDraft(draft);
  return [
    parsed.workspaceId, parsed.installationId, actorId, idempotencyKey,
    parsed.name, parsed.description, parsed.private, parsed.autoInit,
  ];
}
function secretKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) invalid();
  return secret;
}
function mac(encoded, secret) {
  return createHmac("sha256", secretKey(secret))
    .update("atlas-gh-studio-approval-v1:")
    .update(encoded).digest();
}

/** 5-minute, context-bound server approval receipt. Not a GitHub permission.
 * Issued only AFTER fresh Supabase admin authorization + live GitHub grant check.
 * Replay with same idempotencyKey cannot create twice thanks to DB CAS.
 */
export function issueStudioApprovalReceipt({ draft, actorId, idempotencyKey, secret, now = Date.now() }) {
  if (!Number.isFinite(now)) invalid();
  const body = Buffer.from(JSON.stringify({
    v:1, context: canonical({draft, actorId, idempotencyKey}), exp:now + TTL,
  })).toString("base64url");
  return Object.freeze({ receipt: body + "." + mac(body,secret).toString("base64url"),
    expiresAt: now + TTL });
}

export function checkStudioApprovalReceipt({
  receipt, draft, actorId, idempotencyKey, secret, now = Date.now(),
}) {
  if (typeof receipt !== "string" || receipt.length > 4096 ||
      !Number.isFinite(now) || typeof secret !== "string" || secret.length < 32) return false;
  const parts = receipt.split(".");
  if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return false;
  const expected = mac(parts[0],secret);
  const supplied = Buffer.from(parts[1], "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) return false;
  let decoded;
  try { decoded = JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8")); }
  catch { return false; }
  if (decoded?.v !== 1 || !Number.isFinite(decoded.exp) ||
      decoded.exp <= now || decoded.exp > now + TTL) return false;
  let desired;
  try { desired = canonical({draft,actorId,idempotencyKey}); } catch { return false; }
  return JSON.stringify(decoded.context) === JSON.stringify(desired);
}
