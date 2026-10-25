/**
 * SHA-175: pure, OFFLINE normalization of already fetched n8n metadata.
 * NOT a sync worker, database writer, auth boundary or provider client.
 * A future worker must establish its own connection/grants and exhaustive cursor
 * traversal before any persistence, tombstone or workflow status transition.
 */
import { validateN8nRemoteId } from "./contracts.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const reject = (code) => { const error = new Error(code); error.code = code; error.status = 400; throw error; };
const REQUIRED = ["id", "name", "active", "createdAt", "updatedAt"];
function timestamp(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value) ||
    !Number.isFinite(Date.parse(value))) reject("N8N_SYNC_TIMESTAMP_INVALID");
  return value;
}
export function planN8nWorkflowSync(input) {
  if (!isRecord(input) || Object.keys(input).some(key => !["workspaceId","instanceId","workflows"].includes(key))) {
    reject("N8N_SYNC_INPUT_INVALID");
  }
  if (typeof input.workspaceId !== "string" || !UUID.test(input.workspaceId) ||
    typeof input.instanceId !== "string" || !UUID.test(input.instanceId)) {
    reject("N8N_SYNC_SCOPE_INVALID");
  }
  if (!Array.isArray(input.workflows) || input.workflows.length > 100) reject("N8N_SYNC_PAGE_INVALID");
  const seen = new Set();
  const rows = input.workflows.map(item => {
    if (!isRecord(item) || Object.keys(item).some(key => !REQUIRED.includes(key)) ||
      REQUIRED.some(key => !Object.hasOwn(item,key))) reject("N8N_SYNC_FIELD_FORBIDDEN");
    let id;
    try { id = validateN8nRemoteId(item.id); } catch { reject("N8N_SYNC_ID_INVALID"); }
    if (seen.has(id)) reject("N8N_SYNC_DUPLICATE_ID");
    seen.add(id);
    if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 160 ||
      typeof item.active !== "boolean") reject("N8N_SYNC_METADATA_INVALID");
    return Object.freeze({
      workspace_id: input.workspaceId,
      instance_id: input.instanceId,
      remote_workflow_id: id,
      name: item.name.trim(),
      remote_active: item.active,
      remote_created_at: timestamp(item.createdAt),
      remote_updated_at: timestamp(item.updatedAt),
      // A caller-supplied page cannot attest source verification.
      sync_state: "unverified",
    });
  });
  return Object.freeze({
    kind: "n8n-workflow-sync-draft",
    workspaceId: input.workspaceId,
    instanceId: input.instanceId,
    rows: Object.freeze(rows),
    canPersist: false,
    canMarkMissing: false,
    canDispatch: false,
    requiresTrustedServerSnapshot: true,
    requiresCompleteCursorWalkForMissing: true,
  });
}
