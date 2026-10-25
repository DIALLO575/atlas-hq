/**
 * Pure, server-only Notion REST read request builders (API 2026-03-11).
 * They do not authorize an actor or make HTTP calls. The caller must use the
 * bound Notion REST client and current ATLAS connection permission checks.
 */
const UUID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const invalid = () => { throw Object.assign(new Error("INVALID_INPUT"), { code: "INVALID_INPUT", status: 400 }); };
function boundedUuid(id) {
  if (typeof id !== "string" || !UUID.test(id)) invalid();
  return id;
}
function boundedSize(size) {
  if (!Number.isInteger(size) || size < 1 || size > 50) invalid();
  return size;
}
function boundedCursor(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > 2048 ||
      /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value;
}
function propertySegment(raw) {
  if (typeof raw !== "string" || !raw || raw.length > 128 ||
      /[\u0000-\u001f\u007f]/.test(raw)) invalid();
  // Notion sometimes returns percent-encoded property IDs. Normalize once;
  // never accept path traversal, even after percent decoding.
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { invalid(); }
  if (!decoded || decoded.length > 128 || decoded === "." || decoded === ".." ||
      /[\u0000-\u001f\u007f]/.test(decoded)) invalid();
  return encodeURIComponent(decoded);
}
function queryParameters({ startCursor, size }) {
  const params = new URLSearchParams({ page_size: String(boundedSize(size)) });
  const c = boundedCursor(startCursor);
  if (c !== null) params.set("start_cursor", c);
  return params;
}
export function notionPagePropertyRequest({
  pageId, propertyId, startCursor = null, size = 30,
} = {}) {
  const params = queryParameters({ startCursor, size });
  return Object.freeze({ method: "GET", path: "/v1/pages/" + boundedUuid(pageId) +
    "/properties/" + propertySegment(propertyId) + "?" + params });
}
function plainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function checkedJson(value, depth, budget) {
  if (++budget.nodes > 80 || depth > 7) invalid();
  if (typeof value === "string") {
    if (value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) invalid();
    return value;
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid();
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 12) invalid();
    return value.map(item => checkedJson(item, depth + 1, budget));
  }
  if (!plainRecord(value)) invalid();
  const keys = Object.keys(value);
  if (keys.length > 20) invalid();
  const out = Object.create(null);
  for (const key of keys) {
    if (!key || key.length > 96 || ["__proto__", "constructor", "prototype"].includes(key) ||
        /[\u0000-\u001f\u007f]/.test(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) invalid();
    out[key] = checkedJson(descriptor.value, depth + 1, budget);
  }
  return out;
}
function checkedFilter(filter) {
  if (!plainRecord(filter) || Object.keys(filter).length === 0) invalid();
  const cloned = checkedJson(filter, 0, { nodes: 0 });
  function validate(node) {
    if (!plainRecord(node)) invalid();
    const keys = Object.keys(node);
    const logical = keys.filter(key => key === "and" || key === "or");
    if (logical.length) {
      if (keys.length !== 1 || logical.length !== 1 ||
          !Array.isArray(node[logical[0]]) || !node[logical[0]].length) invalid();
      node[logical[0]].forEach(validate);
      return;
    }
    const hasProperty = Object.hasOwn(node, "property");
    const hasTimestamp = Object.hasOwn(node, "timestamp");
    if (hasProperty === hasTimestamp || keys.length !== 2) invalid();
    if (hasProperty && (typeof node.property !== "string" || !node.property ||
        node.property.length > 128)) invalid();
    if (hasTimestamp && !["created_time", "last_edited_time"].includes(node.timestamp)) invalid();
    const conditionKey = keys.find(k => k !== "property" && k !== "timestamp");
    if (!conditionKey || !plainRecord(node[conditionKey])) invalid();
  }
  validate(cloned);
  // Preserve supported Notion typed conditions, bounded structurally, while
  // leaving provider semantic validation to the official read endpoint.
  if (JSON.stringify(cloned).length > 4096) invalid();
  return cloned;
}
function checkedSorts(sorts) {
  if (!Array.isArray(sorts) || sorts.length > 5) invalid();
  return sorts.map(entry => {
    if (!plainRecord(entry)) invalid();
    const keys = Object.keys(entry);
    if (keys.length !== 2 || keys.some(key => !["property", "timestamp", "direction"].includes(key)) ||
        !["ascending", "descending"].includes(entry.direction) ||
        (Object.hasOwn(entry, "property") === Object.hasOwn(entry, "timestamp"))) invalid();
    const field = Object.hasOwn(entry, "property") ? "property" : "timestamp";
    const name = entry[field];
    if (typeof name !== "string" || !name || name.length > 128 ||
        /[\u0000-\u001f\u007f]/.test(name) ||
        (field === "timestamp" && !["created_time", "last_edited_time"].includes(name))) invalid();
    return { [field]: name, direction: entry.direction };
  });
}
export function notionDataSourceQueryRequest({
  dataSourceId, startCursor = null, size = 30, filter = null,
  sorts = [], isArchived = null,
} = {}) {
  const body = { page_size: boundedSize(size) };
  const c = boundedCursor(startCursor);
  if (c !== null) body.start_cursor = c;
  if (filter !== null) body.filter = checkedFilter(filter);
  const checked = checkedSorts(sorts);
  if (checked.length) body.sorts = checked;
  if (isArchived !== null) {
    if (typeof isArchived !== "boolean") invalid();
    body.is_archived = isArchived;
  }
  return Object.freeze({ method: "POST",
    path: "/v1/data_sources/" + boundedUuid(dataSourceId) + "/query",
    body: Object.freeze(body) });
}
