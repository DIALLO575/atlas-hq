import {
  EngineVaultError, engineEnvelopeFromRow, engineEnvelopeToRow,
} from "./vault.mjs";

/**
 * SHA-149: server-only credential lifecycle CONTRACT.
 * No Supabase REST access, SQL client, KMS credential, env, browser route,
 * MAUSBOT transport, or automatic privilege escalation.
 *
 * Dependencies MUST be supplied by privileged application code:
 * - verifySession: revalidates the REAL actor session and DB ownership
 * - loadVault: obtains KMS-protected keyring with retained old keys
 * - repository.transaction: owns a single atomic private-DB transaction
 *
 * This cannot be connected to a public HTTP route as-is.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9._-]{1,64}$/;
const COMMANDS = new Set(["create", "rotate", "revoke", "inspect"]);
export class CredentialLifecycleError extends Error {
  constructor(code) { super(code); this.name = "CredentialLifecycleError"; this.code = code; }
}
const fail = code => { throw new CredentialLifecycleError(code); };
const rec = x => x !== null && typeof x === "object" && !Array.isArray(x);
function ids(input) {
  if (!rec(input) || Object.keys(input).some(k => !["workspaceId", "instanceId"].includes(k))
      || !UUID.test(input.workspaceId ?? "") || !UUID.test(input.instanceId ?? ""))
    fail("CREDENTIAL_SCOPE_INVALID");
  return Object.freeze({
    workspaceId: input.workspaceId.toLowerCase(),
    instanceId: input.instanceId.toLowerCase(),
  });
}
const safeAudit = (c, actor, event_key) => Object.freeze({
  workspace_id: c.workspaceId, instance_id: c.instanceId,
  actor_id: actor, event_key,
});
function validateGrant(grant,c,action) {
  if (!rec(grant) || grant.verified !== true || !UUID.test(grant.actorId ?? "") ||
      !UUID.test(grant.workspaceId ?? "") || !UUID.test(grant.instanceId ?? "") ||
      grant.workspaceId.toLowerCase() !== c.workspaceId ||
      grant.instanceId.toLowerCase() !== c.instanceId || grant.action !== action)
    fail("CREDENTIAL_ACCESS_DENIED");
  return grant.actorId.toLowerCase();
}
function validateRow(row,c, allowRevoked = false) {
  if (!rec(row) || typeof row.workspace_id !== "string" ||
      typeof row.instance_id !== "string" ||
      row.workspace_id.toLowerCase() !== c.workspaceId ||
      row.instance_id.toLowerCase() !== c.instanceId ||
      !KEY.test(row.key_id ?? "") ||
      (row.revoked_at !== null && row.revoked_at !== undefined && !allowRevoked))
    fail("CREDENTIAL_RECORD_INVALID");
  return row;
}
function validateVault(v) {
  if (!rec(v) || typeof v.encrypt !== "function" ||
      typeof v.decrypt !== "function" || typeof v.rotate !== "function" ||
      !KEY.test(v.activeKeyId ?? ""))
    fail("CREDENTIAL_PROVIDER_UNAVAILABLE");
  return v;
}
function verifiedDeps(input) {
  if (!rec(input) || Object.keys(input).some(k =>
    !["verifySession","loadVault","repository"].includes(k)) ||
    typeof input.verifySession !== "function" ||
    typeof input.loadVault !== "function" ||
    !rec(input.repository) ||
    typeof input.repository.transaction !== "function")
    fail("CREDENTIAL_DEPENDENCIES_INVALID");
  return input;
}
function checkTx(tx,verb) {
  if (!rec(tx) || typeof tx.audit !== "function" ||
      typeof tx[verb] !== "function") fail("CREDENTIAL_TRANSACTION_INVALID");
}
/** Unlike APIs, this service has no unlock or "approved" input parameter. */
export function createEngineCredentialLifecycle(input) {
  const deps = verifiedDeps(input);
  async function authorize(scope,session,action) {
    const c = ids(scope);
    if (!COMMANDS.has(action) || session === null || session === undefined)
      fail("CREDENTIAL_ACCESS_DENIED");
    let grant;
    try { grant = await deps.verifySession({session, ...c, action}); }
    catch { fail("CREDENTIAL_ACCESS_DENIED"); }
    return {scope:c,actor:validateGrant(grant,c,action)};
  }
  async function vault(c) {
    try { return validateVault(await deps.loadVault(c)); }
    catch { fail("CREDENTIAL_PROVIDER_UNAVAILABLE"); }
  }
  async function atomic(callback) {
    // Repository must implement an actual DB transaction that rolls back on
    // any error, including failed audit. Tests simulate this property.
    return deps.repository.transaction(callback);
  }
  return Object.freeze({
    async create({scope,session,secret}) {
      const {scope:c,actor} = await authorize(scope,session,"create");
      // Never accept JSON, caller's "approved" flag or coerced objects.
      if (!Buffer.isBuffer(secret) || secret.length < 1 || secret.length > 65536)
        fail("CREDENTIAL_SECRET_INVALID");
      const v=await vault(c);
      const owned=Buffer.from(secret);
      let encrypted;
      try { encrypted=v.encrypt({...c,purpose:"credential"},owned); }
      finally { owned.fill(0); }
      const row=Object.freeze({...engineEnvelopeToRow(encrypted),
        workspace_id:c.workspaceId,instance_id:c.instanceId,revoked_at:null});
      return atomic(async tx => {
        checkTx(tx,"insertCredential");
        await tx.insertCredential(row); // UNIQUE(workspace_id,instance_id).
        await tx.audit(safeAudit(c,actor,"credential.created"));
        return Object.freeze({created:true,keyId:encrypted.keyId,version:encrypted.version});
      });
    },
    async rotate({scope,session}) {
      const {scope:c,actor}=await authorize(scope,session,"rotate");
      const v=await vault(c);
      return atomic(async tx => {
        checkTx(tx,"replaceCredential");
        if (typeof tx.getCredential !== "function")fail("CREDENTIAL_TRANSACTION_INVALID");
        const current=validateRow(await tx.getCredential(c),c);
        let renewed;
        try {
          renewed=v.rotate({...c,purpose:"credential"},engineEnvelopeFromRow(current));
        } catch (e) {
          if (e instanceof EngineVaultError)fail("CREDENTIAL_ROTATION_FAILED");
          throw e;
        }
        if (renewed.keyId === current.key_id)
          fail("CREDENTIAL_ACTIVE_KEY_UNCHANGED");
        const updated=Object.freeze({...engineEnvelopeToRow(renewed),
          workspace_id:c.workspaceId,instance_id:c.instanceId,revoked_at:null});
        await tx.replaceCredential(c,current,updated); // CAS expected, in same TX
        await tx.audit(safeAudit(c,actor,"credential.rotated"));
        return Object.freeze({rotated:true,keyId:renewed.keyId,version:renewed.version});
      });
    },
    async revoke({scope,session}) {
      const {scope:c,actor}=await authorize(scope,session,"revoke");
      return atomic(async tx => {
        checkTx(tx,"revokeCredential");
        const revoked=await tx.revokeCredential(c); // revoked_at=NOW if null, 1 row
        if (revoked!==true)fail("CREDENTIAL_REVOKE_FAILED");
        await tx.audit(safeAudit(c,actor,"credential.revoked"));
        return Object.freeze({revoked:true});
      });
    },
    async inspect({scope,session}) {
      const {scope:c}=await authorize(scope,session,"inspect");
      return atomic(async tx => {
        if (!rec(tx) || typeof tx.getCredential !== "function")
          fail("CREDENTIAL_TRANSACTION_INVALID");
        const record=validateRow(await tx.getCredential(c),c,true);
        return Object.freeze({
          exists:true,revoked:record.revoked_at!==null&&record.revoked_at!==undefined,
          keyId:record.key_id,version:record.version,
        });
      });
    },
  });
}
