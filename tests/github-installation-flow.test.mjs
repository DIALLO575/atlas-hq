import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import {
  buildGitHubAppInstallUrl,
  createInstallationLedger,
  createInstallationState,
  installationStateTtlSeconds,
  parseGitHubAppSetupCallback,
  parseInstallationRepositoryPage,
  readInstallationState,
  reduceInstallationRepositoryPages,
  setupActions,
} from "../packages/connectors/github/src/installation-flow.mjs";

const key = "fixture-state-key-fixture-state-key";
const otherKey = "other-fixture-state-key-other-fixture";
const now = Date.parse("2026-10-23T15:00:00.000Z");
const nonce = Buffer.alloc(16, 7);
const tenantA = "tenant-a";
const tenantB = "tenant-b";

function stateFor(tenantId, overrides = {}) {
  return createInstallationState({ tenantId, key, now, nonce, ...overrides });
}

function callbackFor(state, { setupAction = "install", installationId = "81", includeInstallationId = true, now: at = now, extra = [] } = {}) {
  const url = new URL("https://atlas.example/github/setup");
  url.searchParams.set("state", state);
  url.searchParams.set("setup_action", setupAction);
  if (includeInstallationId) url.searchParams.set("installation_id", installationId);
  for (const [name, value] of extra) url.searchParams.append(name, value);
  return parseGitHubAppSetupCallback(url, { key, now: at });
}

function repository(id, name = "atlas-hq", login = "DIALLO575") {
  return { id, name, full_name: `${login}/${name}`, private: id % 2 === 0, owner: { login, id: 7 } };
}

function selectedPage(repositories, totalCount = repositories.length, selection = "selected") {
  return { total_count: totalCount, repository_selection: selection, repositories };
}

test("install URL is the public GitHub link and does not carry the state key", () => {
  const state = stateFor(tenantA);
  const href = buildGitHubAppInstallUrl({ appSlug: "atlas-hq-fixture", state });
  const url = new URL(href);
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.pathname, "/apps/atlas-hq-fixture/installations/new");
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(href.includes(key), false);
  for (const appSlug of ["", "A", "../evil", "a/b", "apps/evil", "atlas_hq"]) {
    assert.throws(() => buildGitHubAppInstallUrl({ appSlug, state }), TypeError);
  }
});

test("signed state binds one tenant and rejects tampering, the wrong key, and expiry", () => {
  const state = stateFor(tenantA);
  assert.deepEqual(readInstallationState(state, key, now), {
    tenantId: tenantA,
    nonce: nonce.toString("base64url"),
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + installationStateTtlSeconds,
  });
  assert.equal(readInstallationState(state, otherKey, now), null);
  assert.equal(readInstallationState(`${state.slice(0, -1)}${state.endsWith("a") ? "b" : "a"}`, key, now), null);
  assert.equal(readInstallationState(state, key, now + installationStateTtlSeconds * 1000), null);
  assert.deepEqual(readInstallationState(state, key, now + (installationStateTtlSeconds * 1000) - 1000), {
    tenantId: tenantA,
    nonce: nonce.toString("base64url"),
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + installationStateTtlSeconds,
  });
  const future = stateFor(tenantA, { now: now + 120_000 });
  assert.equal(readInstallationState(future, key, now), null);
  assert.throws(() => createInstallationState({ tenantId: tenantA, key: "short", now, nonce }), TypeError);
  assert.throws(() => createInstallationState({ tenantId: "bad tenant", key, now, nonce }), TypeError);
});

test("setup callback keeps installation_id unverified and request is not an installation", () => {
  const state = stateFor(tenantA);
  const installed = callbackFor(state);
  assert.equal(installed.ok, true);
  assert.equal(installed.tenantId, tenantA);
  assert.equal(installed.setupAction, "install");
  assert.equal(installed.installationId, 81);
  assert.equal(installed.ownership, "unverified");
  assert.equal(installed.grant, "none");
  assert.equal(callbackFor(state, { installationId: "0" }).reason, "bad-installation-id");
  assert.equal(callbackFor(state, { installationId: "081" }).reason, "bad-installation-id");
  assert.equal(callbackFor(state, { includeInstallationId: false }).reason, "missing-installation-id");
  assert.equal(callbackFor(state, { setupAction: "delete" }).reason, "bad-setup-action");
  assert.equal(callbackFor(state, { extra: [["setup_action", "update"]] }).reason, "invalid-callback");
  const requested = callbackFor(stateFor(tenantA, { nonce: Buffer.alloc(16, 8) }), { setupAction: "request", includeInstallationId: false });
  assert.equal(requested.ok, true);
  assert.equal(requested.setupAction, "request");
  assert.equal(requested.installationId, null);
  assert.equal(requested.grant, "none");
});

test("a tenant claim is single-use, cannot be stolen, and is not authorized until ownership evidence matches", () => {
  const ledger = createInstallationLedger();
  const state = stateFor(tenantA);
  const first = ledger.record(callbackFor(state));
  assert.deepEqual(first, { ok: true, status: "pending-ownership-check", tenantId: tenantA, installationId: 81, requestId: null });
  assert.equal(ledger.record(callbackFor(state, { installationId: "99" })).reason, "state-replayed");
  assert.deepEqual(ledger.listAuthorizedRepositories(tenantA), []);

  const missed = ledger.confirmOwnership({ tenantId: tenantA, installationId: 81, visibleInstallationIds: [99] });
  assert.equal(missed.reason, "installation-not-associated-with-user");
  assert.equal(missed.status, "pending-ownership-check");
  assert.equal(ledger.confirmOwnership({ tenantId: tenantA, installationId: 81, visibleInstallationIds: [81] }).status, "active");

  const stolen = stateFor(tenantB, { nonce: Buffer.alloc(16, 9) });
  assert.equal(ledger.record(callbackFor(stolen, { installationId: "81" })).reason, "installation-bound-to-other-tenant");
  assert.equal(ledger.record(callbackFor(stolen, { installationId: "81" })).reason, "state-replayed");
  assert.equal(ledger.confirmOwnership({ tenantId: tenantB, installationId: 81, visibleInstallationIds: [81] }).reason, "installation-not-attached");

  const incomplete = [{ body: selectedPage([repository(19)], 2), linkHeader: '<https://api.github.com/installation/repositories?page=2>; rel="next"' }];
  assert.equal(ledger.replaceAuthorizedRepositories(tenantA, 81, incomplete).reason, "repository-page-incomplete");
  assert.deepEqual(ledger.listAuthorizedRepositories(tenantA), []);

  const stored = ledger.replaceAuthorizedRepositories(tenantA, 81, [{ body: selectedPage([repository(19)]), linkHeader: null }]);
  assert.equal(stored.ok, true);
  assert.equal(stored.status, "repositories-ready");
  assert.deepEqual(ledger.listAuthorizedRepositories(tenantA), [
    { id: 19, name: "atlas-hq", fullName: "DIALLO575/atlas-hq", isPrivate: false, owner: { id: 7, login: "DIALLO575" } },
  ]);
  assert.deepEqual(ledger.listAuthorizedRepositories(tenantB), []);
});

test("a pending ownership check does not lock the installation or burn the other tenant nonce", () => {
  const ledger = createInstallationLedger();
  const attacker = "tenant-attacker";
  const victim = "tenant-victim";
  const attackerRecord = ledger.record(callbackFor(stateFor(attacker, { nonce: Buffer.alloc(16, 11) }), { installationId: "81" }));
  assert.equal(attackerRecord.ok, true);
  assert.equal(attackerRecord.status, "pending-ownership-check");
  assert.equal(attackerRecord.installationId, 81);
  assert.deepEqual(ledger.listAuthorizedRepositories(attacker), []);

  const victimCallback = callbackFor(stateFor(victim, { nonce: Buffer.alloc(16, 12) }), { installationId: "81" });
  const victimRecord = ledger.record(victimCallback);
  assert.notEqual(victimRecord.reason, "installation-bound-to-other-tenant");
  assert.equal(victimRecord.ok, true);
  assert.notEqual(ledger.record(victimCallback).reason, "state-replayed");

  const attached = ledger.confirmOwnership({ tenantId: victim, installationId: 81, visibleInstallationIds: [81] });
  assert.deepEqual(attached, { ok: true, status: "active", tenantId: victim, installationId: 81 });
  assert.equal(ledger.record(victimCallback).reason, "state-replayed");

  const activeTheft = ledger.record(callbackFor(stateFor(attacker, { nonce: Buffer.alloc(16, 13) }), { installationId: "81" }));
  assert.equal(activeTheft.reason, "installation-bound-to-other-tenant");
  assert.equal(ledger.confirmOwnership({ tenantId: attacker, installationId: 81, visibleInstallationIds: [81] }).reason, "installation-not-attached");

  const ready = ledger.replaceAuthorizedRepositories(victim, 81, [{ body: selectedPage([repository(19)]), linkHeader: null }]);
  assert.equal(ready.status, "repositories-ready");
  assert.equal(ledger.record(callbackFor(stateFor(attacker, { nonce: Buffer.alloc(16, 14) }), { installationId: "81" })).reason, "installation-bound-to-other-tenant");
  assert.equal(ledger.confirmOwnership({ tenantId: attacker, installationId: 81, visibleInstallationIds: [81] }).reason, "installation-not-attached");
  assert.equal(ledger.listAuthorizedRepositories(attacker).length, 0);
  assert.equal(ledger.listAuthorizedRepositories(victim).length, 1);
});

test("an update returns to pending and a request never binds an installation id", () => {
  const ledger = createInstallationLedger();
  const requested = ledger.record(callbackFor(stateFor(tenantA), { setupAction: "request", installationId: "81" }));
  assert.equal(requested.status, "installation-requested");
  assert.equal(requested.installationId, null);
  assert.equal(requested.requestId, 81);
  assert.equal(ledger.record(callbackFor(stateFor(tenantB, { nonce: Buffer.alloc(16, 3) }), { installationId: "81" })).status, "pending-ownership-check");

  const ready = createInstallationLedger();
  assert.equal(ready.record(callbackFor(stateFor(tenantA, { nonce: Buffer.alloc(16, 4) }))).status, "pending-ownership-check");
  ready.confirmOwnership({ tenantId: tenantA, installationId: 81, visibleInstallationIds: [81] });
  ready.replaceAuthorizedRepositories(tenantA, 81, [{ body: selectedPage([repository(19)]), linkHeader: null }]);
  const update = ready.record(callbackFor(stateFor(tenantA, { nonce: Buffer.alloc(16, 5) }), { setupAction: "update", installationId: "81" }));
  assert.equal(update.status, "pending-ownership-check");
  assert.deepEqual(ready.listAuthorizedRepositories(tenantA), []);
  assert.equal(ready.replaceAuthorizedRepositories(tenantA, 81, [{ body: selectedPage([repository(19)]), linkHeader: null }]).reason, "ownership-not-confirmed");
});

test("repository pages accept only a complete selected set and refuse all-repository grants", () => {
  const broad = parseInstallationRepositoryPage(selectedPage([repository(19)], 1, "all"), null);
  assert.equal(broad.accepted, false);
  assert.deepEqual(broad.repositories, []);
  assert.equal(broad.reason, "repository-selection-not-accepted");
  assert.equal(parseInstallationRepositoryPage({ ...selectedPage([repository(19)]), repository_selection: "none" }, null).reason, "repository-selection-unknown");
  assert.equal(parseInstallationRepositoryPage(selectedPage([{ id: 19, name: "atlas-hq", full_name: "DIALLO575/atlas-hq", private: false, owner: { login: "other", id: 7 } }]), null).reason, "invalid-repository-page");
  assert.equal(parseInstallationRepositoryPage(selectedPage([repository(19)]), '<https://attacker.example/steal>; rel="next"').reason, "invalid-repository-page");

  const pages = [
    { body: selectedPage([repository(19)], 2), linkHeader: '<https://api.github.com/installation/repositories?page=2>; rel="next"' },
    { body: selectedPage([repository(20, "atlas-web")], 2), linkHeader: '<https://api.github.com/installation/repositories?page=1>; rel="prev"' },
  ];
  const reduced = reduceInstallationRepositoryPages(pages);
  assert.equal(reduced.complete, true);
  assert.deepEqual(reduced.repositories.map((item) => item.id), [19, 20]);
  assert.equal(reduceInstallationRepositoryPages([pages[0], pages[0]]).reason, "invalid-repository-page");

  const ledger = createInstallationLedger();
  ledger.record(callbackFor(stateFor(tenantA)));
  ledger.confirmOwnership({ tenantId: tenantA, installationId: 81, visibleInstallationIds: [81] });
  const rejected = ledger.replaceAuthorizedRepositories(tenantA, 81, [{ body: selectedPage([repository(19)], 1, "all"), linkHeader: null }]);
  assert.equal(rejected.reason, "repository-selection-not-accepted");
  assert.equal(rejected.status, "selection-rejected");
  assert.deepEqual(ledger.listAuthorizedRepositories(tenantA), []);
});

test("SHA-113 extends the read-only contract and the module performs no GitHub call", async () => {
  const contract = await readFile(new URL("../packages/connectors/github/src/contract.ts", import.meta.url), "utf8");
  const source = await readFile(new URL("../packages/connectors/github/src/installation-flow.mjs", import.meta.url), "utf8");
  const compiled = ts.transpileModule(contract, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const compiledModule = { exports: {} };
  new Function("exports", "module", compiled)(compiledModule.exports, compiledModule);
  const runtime = compiledModule.exports.githubMvpContract;
  assert.equal(runtime.writesEnabled, false);
  assert.equal(runtime.installationFlow.liveGitHubCalls, false);
  assert.equal(runtime.installationFlow.stateTtlSeconds, installationStateTtlSeconds);
  assert.deepEqual(runtime.installationFlow.setupActions, [...setupActions]);
  assert.equal(runtime.installationFlow.acceptedRepositorySelection, "selected");
  assert.equal(runtime.permissions.length, 2);
  assert.doesNotMatch(source, /fetch\(|https?:\/\/api\.github\.com|BEGIN |private_key/i);
  assert.doesNotMatch(contract, /access: "write"|contents:write|administration:write/i);
});
