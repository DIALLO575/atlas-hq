/**
 * SHA-181 — n8n release certification: NON-AUTHORIZING, fail-closed evaluator.
 *
 * This file is intentionally independent of n8n provider credentials and
 * release-gate switches. It takes a requested *review lane* only, not client
 * evidence or approval flags. Actual sandbox/production authorization MUST
 * originate from a separately reviewed signed release process.
 *
 * Passing npm test / SQL fixtures / deployed schema is not evidence that
 * a real n8n instance has ever been connected or certified.
 */
import { n8nReleasePermission } from "../../../engine-core/src/release-gates.mjs";

const definitions = [
  ["repo-chain-reviewed","review","Review and merge ordered PR #57→#58→#59→#61→#63→#65→#66→#67→#69→PR10"],
  ["sandbox-provider-provisioned","sandbox","Dedicated n8n sandbox instance, pinned build, TLS, egress and bounded test workflows"],
  ["rest-mcp-handshake-attested","sandbox","Test actual n8n REST and MCP tool contracts, authenticating against the pinned version"],
  ["mcp-version-matrix-reconciled","sandbox","Resolve n8n 2.13 builder / 2.18.3 MCP minima against PR07 static floor assumptions"],
  ["sandbox-auth-two-tenants","sandbox","Run real Auth E2E across two workspaces, revoked membership, role and actor-bound grants"],
  ["sandbox-approval-idempotency","sandbox","Independent reviewer + immutable intent + atomic outbox + nonduplicating provider effect"],
  ["sandbox-webhook-hmac-e2e","sandbox","Real n8n test webhook/callback with HMAC, replay/late event, execution identity and CAS"],
  ["sandbox-chaos-recovery","sandbox","401/403/429/5xx, timeout-after-effect, two workers, SIGKILL, dead-letter and recovery exercised"],
  ["sandbox-secrets-audit","sandbox","Server-held secret rotation, no token leakage, SSRF/node restrictions, retention and n8n audit"],
  ["sandbox-backup-restore","sandbox","Demonstrate recoverable backups and rollback on staging; verify data and release gate"],
  ["license-written-clearance","saas","Written n8n commercial/OEM determination for the exact external builder UI and AI agent use"],
  ["customer-authorization-e2e","saas","Customer-delegated machine identity, least-privilege provider grants and billing/retention checks"],
  ["prod-artifacts-matched","production","Same reviewed Git SHA, CI build and Vercel READY artifact; Supabase migration history reconciled"],
  ["prod-operational-signoff","production","Named founder/owner GO, incident contacts, SLOs, alerting and dry-run rollback proof"],
];
const stageTargets=Object.freeze(["sandbox","saas","production"]);
const ranks=Object.freeze({review:0,sandbox:1,saas:2,production:3});
const risk=Object.freeze(definitions.map(([id,stage,requirement])=>Object.freeze({
  id,stage,requirement,verified:false,blocked:true,
})));
export const N8N_CERTIFICATION_REQUIREMENTS=risk;
export const N8N_RELEASE_REVIEW_TARGETS=stageTargets;

/**
 * Immutable human-readable verdict; ALWAYS non-authorizing for PR10.
 * No supplied flags such as "approved", "signedOff", "serviceRole" or
 * "sandboxPassed" can change this verdict. Review lanes are not releases.
 */
export function assessN8nReleaseReadiness(input={}){
  if(input===null||Array.isArray(input)||typeof input!=="object"||
      Object.keys(input).some(k=>k!=="target"))
    throw new TypeError("N8N_CERTIFICATION_INPUT_INVALID");
  const target=input.target??"sandbox";
  if(!stageTargets.includes(target))
    throw new TypeError("N8N_CERTIFICATION_TARGET_INVALID");
  const required=Object.freeze(risk.filter(g=>ranks[g.stage]<=ranks[target]));
  const release=n8nReleasePermission({},target==="sandbox"?"read":"execute");
  if(release.allowed!==false||release.status!==423)
    throw new Error("N8N_CERTIFICATION_RUNTIME_GATE_REGRESSION");
  return Object.freeze({
    kind:"n8n-release-assessment",target,decision:"NO_GO",
    authority:"none",independentlySigned:false,
    releaseAuthorized:false,canDeploy:false,canActivateProvider:false,
    canIssueMcpToken:false,canDispatch:false,canLiftSqlOfflineCheck:false,
    ciIsNotLiveE2e:true,
    providerAttestation:"missing",licenseAttestation:"not-cleared",
    sqlOfflineGateExpected:true,releaseCode:release.code,
    blockingCount:required.length,blockingRequirements:required,
    next:"Provision sandbox and execute independent runbook; update evidence only in a separately reviewed release PR.",
  });
}
