import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  N8N_CERTIFICATION_REQUIREMENTS,N8N_RELEASE_REVIEW_TARGETS,assessN8nReleaseReadiness,
} from "../packages/engines/n8n/src/certification.mjs";
import { n8nReleasePermission } from "../packages/engine-core/src/release-gates.mjs";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("all review targets remain immutable NO_GO and NEVER grant n8n operation",()=>{
 assert.deepEqual(N8N_RELEASE_REVIEW_TARGETS,["sandbox","saas","production"]);
 let previous=0;
 for(const target of N8N_RELEASE_REVIEW_TARGETS){
  const d=assessN8nReleaseReadiness({target});
  assert.equal(d.target,target);
  assert.equal(d.decision,"NO_GO");
  assert.equal(d.authority,"none");
  assert.equal(d.releaseAuthorized,false);
  for(const action of ["canDeploy","canActivateProvider","canIssueMcpToken",
    "canDispatch","canLiftSqlOfflineCheck","independentlySigned"])
    assert.equal(d[action],false,action);
  assert.equal(d.releaseCode,"N8N_DURABLE_RELEASE_GATE_CLOSED");
  assert.ok(d.blockingCount>=previous);
  previous=d.blockingCount;
  assert.equal(d.blockingCount,d.blockingRequirements.length);
  assert.ok(Object.isFrozen(d)&&Object.isFrozen(d.blockingRequirements));
  assert.ok(d.blockingRequirements.every(item=>Object.isFrozen(item)&&item.blocked&&!item.verified));
 }
});
test("fake signoff, role, env, tokens or provider claims cannot turn a review into GO",()=>{
 for(const flag of ["approved","signedOff","sandboxPassed","productionReady",
   "serviceRole","licenseApproved","allowRelease","bypass","token","role",
   "authority","connection","certified","approverId"]){
  assert.throws(()=>assessN8nReleaseReadiness({target:"production",[flag]:true}),/N8N_CERTIFICATION_INPUT_INVALID/);
 }
 for(const target of ["go","productionGO","local","staging","all","",null]){
  assert.throws(()=>assessN8nReleaseReadiness({target}),/N8N_CERTIFICATION_TARGET_INVALID/);
 }
 assert.throws(()=>assessN8nReleaseReadiness([]),/N8N_CERTIFICATION_INPUT_INVALID/);
 assert.throws(()=>assessN8nReleaseReadiness(null),/N8N_CERTIFICATION_INPUT_INVALID/);
 const envBackup=process.env.ATLAS_N8N_RELEASE_STAGE;
 try{
  process.env.ATLAS_N8N_RELEASE_STAGE="enabled";
  assert.equal(assessN8nReleaseReadiness({target:"sandbox"}).decision,"NO_GO");
  assert.equal(n8nReleasePermission(process.env,"execute").allowed,false);
 }finally{
  if(envBackup===undefined)delete process.env.ATLAS_N8N_RELEASE_STAGE;
  else process.env.ATLAS_N8N_RELEASE_STAGE=envBackup;
 }
});
test("no live proof is inferred from CI success or a signed-off JSON fixture",()=>{
 const v=assessN8nReleaseReadiness();
 assert.equal(v.providerAttestation,"missing");
 assert.equal(v.licenseAttestation,"not-cleared");
 assert.equal(v.ciIsNotLiveE2e,true);
 assert.equal(v.sqlOfflineGateExpected,true);
 assert.equal(v.blockingRequirements.some(x=>x.id==="sandbox-webhook-hmac-e2e"),true);
 assert.equal(v.blockingRequirements.some(x=>x.id==="sandbox-auth-two-tenants"),true);
});
test("risk matrix has unique IDs, explicit stages, real negative tests and expiry policy",()=>{
 const all=N8N_CERTIFICATION_REQUIREMENTS;
 assert.equal(new Set(all.map(x=>x.id)).size,all.length);
 assert.ok(all.length>=14);
 assert.ok(all.every(x=>typeof x.requirement==="string"&&x.requirement.length>=20));
 for(const id of ["sandbox-approval-idempotency","sandbox-chaos-recovery",
   "sandbox-secrets-audit","sandbox-backup-restore","mcp-version-matrix-reconciled",
   "license-written-clearance","prod-artifacts-matched","prod-operational-signoff"])
  assert.equal(all.some(x=>x.id===id),true,id);
 assert.equal(assessN8nReleaseReadiness({target:"production"}).blockingCount,all.length);
});
test("CI read-only certification source cannot dispatch, contact a provider or lift SQL lock",async()=>{
 const [src,gate]=await Promise.all([
  read("../packages/engines/n8n/src/certification.mjs"),
  read("../packages/engine-core/src/release-gates.mjs"),
 ]);
 assert.doesNotMatch(src,/\bfetch\s*\(|\baxios\s*\(|\bspawn\s*\(|\bexec\s*\(|service_role|NEXT_PUBLIC_N8N/);
 assert.match(src,/n8nReleasePermission/);
 assert.match(gate,/N8N_DURABLE_RELEASE_GATE_CLOSED/);
});
test("dated evidence snapshot is observational and explicitly records mismatch",async()=>{
 const snapshot=JSON.parse(await read("../docs/integrations/n8n-pr10-evidence-2026-10-25.json"));
 assert.equal(snapshot.observedDate,"2026-10-25");
 assert.equal(snapshot.decision,"NO_GO");
 assert.equal(snapshot.production.mainGitSha,"c7ec18e93f44fc32e560ae8b74b7fd6664ce5249");
 assert.equal(snapshot.production.vercelReadyGitSha,snapshot.production.mainGitSha);
 assert.notEqual(snapshot.production.vercelReadyGitSha,snapshot.n8nStack.pr09Sha);
 assert.equal(snapshot.n8nStack.allDraft,true);
 assert.equal(snapshot.n8nRuntime.sandboxAttested,false);
 assert.equal(snapshot.n8nRuntime.instanceVersion,null);
 assert.equal(snapshot.n8nRuntime.liveMcpConfirmed,false);
 assert.equal(snapshot.n8nRuntime.liveWebhookConfirmed,false);
 assert.equal(snapshot.license.externalCustomerBuilderCleared,false);
 assert.equal(snapshot.supabase.offlineConstraintValidated,true);
 assert.equal(snapshot.supabase.counts.engineInstances,0);
 assert.equal(snapshot.supabase.counts.workflowRows,0);
 assert.equal(snapshot.supabase.counts.executionRows,0);
 assert.equal(snapshot.supabase.counts.callbackReceipts,0);
 for(const v of ["20261025114449","20261025120150","20261025133921"])
  assert.ok(snapshot.supabase.migrationVersions.includes(v));
});
test("version contradiction is explicitly listed, not silently treated as compatible",async()=>{
 const [mcp,doc]=await Promise.all([
  read("../packages/engines/n8n/src/mcp-client.mjs"),
  read("../docs/integrations/n8n-pr10-certification.md"),
 ]);
 assert.match(mcp,/\["workflows\.ai\.create","create_workflow_from_code","2\.12\.0"/);
 assert.match(doc,/2\.13\.0/);
 assert.match(doc,/2\.18\.3/);
 assert.match(doc,/SHA-178/);
 assert.match(doc,/NO-GO/);
});
test("runbook includes safe rollback that preserves DB metadata and audit",async()=>{
 const doc=await read("../docs/runbooks/n8n-pr10-rollout-rollback.md");
 for(const key of ["Vercel","SIGKILL","429","401","403","5xx","HMAC",
  "licence","approbation","service_role","replay","workflow","restore"])
  assert.ok(doc.toLowerCase().includes(key.toLowerCase()),key);
 assert.match(doc,/Ne jamais supprimer/);
 assert.match(doc,/NO-GO/);
 assert.doesNotMatch(doc,/drop table|truncate table|delete from private/i);
});
test("documentation does not claim E2E, legal clearance or production activation",async()=>{
 const doc=await read("../docs/integrations/n8n-pr10-certification.md");
 for(const phrase of ["non réalisés","sans sandbox","sans licence",
    "production","indépendante","SQL","RLS","GO/NO-GO"])
  assert.ok(doc.includes(phrase),phrase);
 assert.match(doc,/https:\/\/support\.n8n\.io\/article\//);
 assert.match(doc,/https:\/\/n8n\.io\/oem\//);
});
