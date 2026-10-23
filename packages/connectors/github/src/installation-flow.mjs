import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getNextPageUrl } from "./pagination-contract.mjs";

const githubOrigin = "https://github.com";
const statePurpose = "github-app-installation";
const stateVersion = 1;
const minimumKeyLength = 32;
const appSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const tenantIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const installationIdPattern = /^[1-9][0-9]*$/;
const noncePattern = /^[A-Za-z0-9_-]{22,128}$/;
const stateFields = ["v", "purpose", "tenantId", "nonce", "iat", "exp"];

/** ATLAS CSRF lifetime for the install `state` value. GitHub does not define this limit. */
export const installationStateTtlSeconds = 15 * 60;

/**
 * Callback values this flow accepts.
 * `install` and `update` follow the setup URL and "Redirect on update".
 * `request` is the install page's Request outcome: it is not an installation.
 * The current setup-URL doc names `installation_id` and not this enum; unknown values are rejected.
 */
export const setupActions = Object.freeze(["install", "update", "request"]);
const setupActionSet = new Set(setupActions);

function assertKey(key) {
  if (typeof key !== "string" || key.length < minimumKeyLength) {
    throw new TypeError("state key must be a server-side string of at least 32 characters");
  }
}

function assertTenantId(tenantId) {
  if (typeof tenantId !== "string" || !tenantIdPattern.test(tenantId)) {
    throw new TypeError("tenantId must be 1-128 characters from [A-Za-z0-9_-]");
  }
}

function assertNow(now) {
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("now must be a non-negative safe integer timestamp");
}

function sign(payloadPart, key) {
  return createHmac("sha256", key).update(payloadPart).digest("base64url");
}

function signaturesMatch(actual, expected) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Signed correlation token. The payload is visible to GitHub and the browser; the key never leaves the server. */
export function createInstallationState({ tenantId, key, now = Date.now(), nonce = randomBytes(16), ttlSeconds = installationStateTtlSeconds }) {
  assertTenantId(tenantId);
  assertKey(key);
  assertNow(now);
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 3600) {
    throw new TypeError("ttlSeconds must be a positive integer of at most 3600");
  }
  const nonceBytes = Buffer.isBuffer(nonce) ? nonce : nonce instanceof Uint8Array ? Buffer.from(nonce) : null;
  if (!nonceBytes || nonceBytes.length < 16 || nonceBytes.length > 64) throw new TypeError("nonce must be 16 to 64 bytes");
  const issuedAt = Math.floor(now / 1000);
  const payload = {
    v: stateVersion,
    purpose: statePurpose,
    tenantId,
    nonce: nonceBytes.toString("base64url"),
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  };
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadPart}.${sign(payloadPart, key)}`;
}

/** Returns the tenant correlation, or null when the token is absent, altered, or expired. */
export function readInstallationState(state, key, now = Date.now()) {
  assertKey(key);
  assertNow(now);
  if (typeof state !== "string" || state.length === 0 || state.length > 2048) return null;
  const separator = state.indexOf(".");
  if (separator <= 0 || separator !== state.lastIndexOf(".")) return null;
  const payloadPart = state.slice(0, separator);
  const signature = state.slice(separator + 1);
  if (!signature || !signaturesMatch(signature, sign(payloadPart, key))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isPlainObject(payload)) return null;
  const keys = Object.keys(payload);
  if (keys.length !== stateFields.length || stateFields.some((field) => !keys.includes(field))) return null;
  if (payload.v !== stateVersion || payload.purpose !== statePurpose) return null;
  if (typeof payload.tenantId !== "string" || !tenantIdPattern.test(payload.tenantId)) return null;
  if (typeof payload.nonce !== "string" || !noncePattern.test(payload.nonce)) return null;
  if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)) return null;
  const nowSeconds = Math.floor(now / 1000);
  if (payload.iat > nowSeconds + 60 || payload.exp <= nowSeconds || payload.exp <= payload.iat) return null;
  return { tenantId: payload.tenantId, nonce: payload.nonce, iat: payload.iat, exp: payload.exp };
}

/** Public install link documented by GitHub. `appSlug` is the public slug, not a credential. */
export function buildGitHubAppInstallUrl({ appSlug, state }) {
  if (typeof appSlug !== "string" || appSlug.length > 100 || !appSlugPattern.test(appSlug)) {
    throw new TypeError("appSlug must be a lowercase GitHub App slug");
  }
  if (typeof state !== "string" || state.length === 0 || state.length > 2048) throw new TypeError("state is required");
  const url = new URL(`/apps/${appSlug}/installations/new`, githubOrigin);
  url.searchParams.set("state", state);
  if (url.origin !== githubOrigin) throw new TypeError("install URL must stay on https://github.com");
  return url.toString();
}

function queryParameters(input) {
  if (input instanceof URL) return input.searchParams;
  if (input instanceof URLSearchParams) return input;
  if (typeof input === "string") {
    try {
      return new URL(input, githubOrigin).searchParams;
    } catch {
      return null;
    }
  }
  if (!isPlainObject(input)) return null;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else if (value !== undefined && value !== null) params.append(key, String(value));
  }
  return params;
}

function parseInstallationId(value) {
  if (typeof value !== "string" || !installationIdPattern.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Parse the setup redirect. A valid signature binds the tenant only.
 * `installation_id` stays unverified: GitHub documents that it can be spoofed.
 */
export function parseGitHubAppSetupCallback(query, { key, now = Date.now() } = {}) {
  const params = queryParameters(query);
  if (!params) return { ok: false, reason: "invalid-callback" };
  const state = params.getAll("state");
  const setup = params.getAll("setup_action");
  const installation = params.getAll("installation_id");
  if (state.length !== 1 || setup.length !== 1) return { ok: false, reason: "invalid-callback" };
  if (!setupActionSet.has(setup[0])) return { ok: false, reason: "bad-setup-action" };
  const verified = readInstallationState(state[0], key, now);
  if (!verified) return { ok: false, reason: "bad-state" };
  const setupAction = setup[0];
  if (setupAction === "request") {
    if (installation.length > 1) return { ok: false, reason: "bad-installation-id" };
    const requestId = installation.length === 0 ? null : parseInstallationId(installation[0]);
    if (installation.length === 1 && requestId === null) return { ok: false, reason: "bad-installation-id" };
    return {
      ok: true,
      tenantId: verified.tenantId,
      nonce: verified.nonce,
      setupAction,
      installationId: null,
      requestId,
      ownership: "unverified",
      grant: "none",
    };
  }
  if (installation.length !== 1) return { ok: false, reason: "missing-installation-id" };
  const installationId = parseInstallationId(installation[0]);
  if (installationId === null) return { ok: false, reason: "bad-installation-id" };
  return {
    ok: true,
    tenantId: verified.tenantId,
    nonce: verified.nonce,
    setupAction,
    installationId,
    requestId: null,
    ownership: "unverified",
    grant: "none",
  };
}

function parseRepository(repository) {
  if (!isPlainObject(repository) || !isPlainObject(repository.owner)) return null;
  const { id, name, full_name: fullName, private: isPrivate, owner } = repository;
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(owner.id) || owner.id <= 0) return null;
  if (typeof name !== "string" || !name || typeof owner.login !== "string" || !owner.login) return null;
  if (typeof fullName !== "string" || fullName !== `${owner.login}/${name}`) return null;
  if (typeof isPrivate !== "boolean") return null;
  return { id, name, fullName, isPrivate, owner: { id: owner.id, login: owner.login } };
}

function nextRelation(linkHeader) {
  if (linkHeader === null || linkHeader === undefined || linkHeader === "") return { status: "absent", url: null };
  if (typeof linkHeader !== "string") return { status: "invalid", url: null };
  const url = getNextPageUrl(linkHeader);
  if (url) return { status: "present", url };
  return { status: /rel="?next"?/i.test(linkHeader) ? "invalid" : "absent", url: null };
}

/** Parse one synthetic or captured `GET /installation/repositories` page. This function does not fetch. */
export function parseInstallationRepositoryPage(body, linkHeader = null) {
  if (!isPlainObject(body) || !Array.isArray(body.repositories)) return { ok: false, reason: "invalid-repository-page" };
  if (!Number.isSafeInteger(body.total_count) || body.total_count < 0) return { ok: false, reason: "invalid-repository-page" };
  const selection = body.repository_selection;
  if (selection !== "selected" && selection !== "all") {
    return { ok: false, reason: selection === undefined ? "invalid-repository-page" : "repository-selection-unknown" };
  }
  const next = nextRelation(linkHeader);
  if (next.status === "invalid") return { ok: false, reason: "invalid-repository-page" };
  const repositories = [];
  const seen = new Set();
  for (const repository of body.repositories) {
    const parsed = parseRepository(repository);
    if (!parsed || seen.has(parsed.id)) return { ok: false, reason: "invalid-repository-page" };
    seen.add(parsed.id);
    repositories.push(parsed);
  }
  if (repositories.length > body.total_count) return { ok: false, reason: "invalid-repository-page" };
  if (selection === "all") {
    return {
      ok: true,
      accepted: false,
      complete: false,
      repositorySelection: "all",
      repositories: [],
      totalCount: body.total_count,
      nextPageUrl: next.url,
      reason: "repository-selection-not-accepted",
    };
  }
  const complete = next.status === "absent" && repositories.length === body.total_count;
  return {
    ok: true,
    accepted: true,
    complete,
    repositorySelection: "selected",
    repositories,
    totalCount: body.total_count,
    nextPageUrl: next.url,
    reason: complete ? null : "repository-page-incomplete",
  };
}

/** Combine caller-supplied pages. The last page decides completeness; nothing is downloaded. */
export function reduceInstallationRepositoryPages(pages) {
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > 100) return { ok: false, reason: "invalid-repository-page" };
  const parsed = [];
  for (const page of pages) {
    if (!isPlainObject(page)) return { ok: false, reason: "invalid-repository-page" };
    const result = parseInstallationRepositoryPage(page.body, page.linkHeader ?? null);
    if (!result.ok) return result;
    parsed.push(result);
  }
  const selection = parsed[0].repositorySelection;
  if (parsed.some((page) => page.repositorySelection !== selection || page.totalCount !== parsed[0].totalCount)) {
    return { ok: false, reason: "invalid-repository-page" };
  }
  if (selection !== "selected") {
    return {
      ok: true,
      accepted: false,
      complete: false,
      repositorySelection: selection,
      repositories: [],
      totalCount: parsed[0].totalCount,
      reason: "repository-selection-not-accepted",
    };
  }
  const repositories = [];
  const seen = new Set();
  for (let index = 0; index < parsed.length; index += 1) {
    const page = parsed[index];
    const isLast = index === parsed.length - 1;
    if (!isLast && !page.nextPageUrl) return { ok: false, reason: "invalid-repository-page" };
    if (isLast && page.nextPageUrl && page.repositories.length >= page.totalCount) return { ok: false, reason: "invalid-repository-page" };
    for (const repository of page.repositories) {
      if (seen.has(repository.id)) return { ok: false, reason: "invalid-repository-page" };
      seen.add(repository.id);
      repositories.push(repository);
    }
  }
  const last = parsed[parsed.length - 1];
  if (!last.nextPageUrl && repositories.length !== last.totalCount) return { ok: false, reason: "invalid-repository-page" };
  const complete = !last.nextPageUrl && repositories.length === last.totalCount;
  return {
    ok: true,
    accepted: true,
    complete,
    repositorySelection: "selected",
    repositories,
    totalCount: last.totalCount,
    reason: complete ? null : "repository-page-incomplete",
  };
}

function copyRepository(repository) {
  return { ...repository, owner: { ...repository.owner } };
}

/**
 * In-memory tenant binding. Consumed nonces are remembered in this process only;
 * a deployed server must store them before replay protection crosses processes.
 * The setup redirect alone never reaches `repositories-ready`.
 */
export function createInstallationLedger() {
  const installations = new Map();
  const usedNonces = new Set();
  const deferredNonces = new Map();
  const requests = [];

  function deferNonce(installationId, nonce) {
    let pending = deferredNonces.get(installationId);
    if (!pending) {
      pending = new Set();
      deferredNonces.set(installationId, pending);
    }
    pending.add(nonce);
  }

  function burnDeferredNonces(installationId) {
    const pending = deferredNonces.get(installationId);
    if (!pending) return;
    for (const nonce of pending) usedNonces.add(nonce);
    deferredNonces.delete(installationId);
  }

  function record(callback) {
    if (!callback || callback.ok !== true) return { ok: false, reason: "invalid-callback" };
    if (usedNonces.has(callback.nonce)) return { ok: false, reason: "state-replayed" };
    if (callback.setupAction === "request") {
      usedNonces.add(callback.nonce);
      const request = { tenantId: callback.tenantId, requestId: callback.requestId, nonce: callback.nonce, status: "installation-requested" };
      requests.push(request);
      return { ok: true, status: request.status, tenantId: request.tenantId, installationId: null, requestId: request.requestId };
    }
    if (!Number.isSafeInteger(callback.installationId) || callback.installationId <= 0) return { ok: false, reason: "bad-installation-id" };
    const current = installations.get(callback.installationId);
    if (current && current.tenantId !== callback.tenantId) {
      if (current.status !== "pending-ownership-check") {
        usedNonces.add(callback.nonce);
        return { ok: false, reason: "installation-bound-to-other-tenant" };
      }
      // Unproven claims are movable. Do not lock the id, and do not burn this nonce until proof.
      deferNonce(callback.installationId, callback.nonce);
      return { ok: true, status: "pending-ownership-check", tenantId: callback.tenantId, installationId: callback.installationId, requestId: null };
    }
    usedNonces.add(callback.nonce);
    const next = {
      tenantId: callback.tenantId,
      installationId: callback.installationId,
      setupAction: callback.setupAction,
      status: "pending-ownership-check",
      repositorySelection: null,
      repositories: [],
    };
    installations.set(callback.installationId, next);
    return { ok: true, status: next.status, tenantId: next.tenantId, installationId: next.installationId, requestId: null };
  }

  function confirmOwnership({ tenantId, installationId, visibleInstallationIds }) {
    assertTenantId(tenantId);
    if (!Number.isSafeInteger(installationId) || installationId <= 0) return { ok: false, reason: "bad-installation-id" };
    if (!Array.isArray(visibleInstallationIds) || visibleInstallationIds.length > 5000) return { ok: false, reason: "invalid-ownership-evidence" };
    const visible = new Set();
    for (const id of visibleInstallationIds) {
      if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, reason: "invalid-ownership-evidence" };
      visible.add(id);
    }
    const current = installations.get(installationId);
    if (!current) return { ok: false, reason: "installation-not-attached" };
    if (current.status !== "pending-ownership-check") {
      if (current.tenantId !== tenantId) return { ok: false, reason: "installation-not-attached" };
      return { ok: false, reason: "ownership-not-pending", status: current.status };
    }
    if (!visible.has(installationId)) return { ok: false, reason: "installation-not-associated-with-user", status: current.status };
    burnDeferredNonces(installationId);
    current.tenantId = tenantId;
    current.status = "active";
    return { ok: true, status: current.status, tenantId, installationId };
  }

  function replaceAuthorizedRepositories(tenantId, installationId, pages) {
    assertTenantId(tenantId);
    const current = installations.get(installationId);
    if (!current || current.tenantId !== tenantId) return { ok: false, reason: "installation-not-attached" };
    if (current.status !== "active" && current.status !== "repositories-ready" && current.status !== "selection-rejected") {
      return { ok: false, reason: "ownership-not-confirmed", status: current.status };
    }
    const reduced = reduceInstallationRepositoryPages(pages);
    if (!reduced.ok) return reduced;
    if (!reduced.accepted || !reduced.complete) {
      if (!reduced.accepted) {
        current.status = "selection-rejected";
        current.repositorySelection = reduced.repositorySelection;
        current.repositories = [];
      }
      return { ok: false, reason: reduced.reason, status: current.status };
    }
    current.status = "repositories-ready";
    current.repositorySelection = "selected";
    current.repositories = reduced.repositories.map(copyRepository);
    return { ok: true, status: current.status, repositories: current.repositories.map(copyRepository) };
  }

  function listAuthorizedRepositories(tenantId) {
    assertTenantId(tenantId);
    return [...installations.values()]
      .filter((item) => item.tenantId === tenantId && item.status === "repositories-ready")
      .flatMap((item) => item.repositories.map(copyRepository));
  }

  function snapshot() {
    return {
      installations: [...installations.values()].map((item) => ({ ...item, repositories: item.repositories.map(copyRepository) })),
      requests: requests.map((request) => ({ ...request })),
    };
  }

  return { record, confirmOwnership, replaceAuthorizedRepositories, listAuthorizedRepositories, snapshot };
}
