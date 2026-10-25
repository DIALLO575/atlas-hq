import assert from "node:assert/strict";
import test from "node:test";
import { issueStudioApprovalReceipt, checkStudioApprovalReceipt } from
  "../packages/connectors/github/src/github-studio-approval.mjs";

const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor="11111111-1111-4111-8111-111111111111";
const requestId="10000000-0000-4000-8000-000000000011";
const secret="approval-unit-test-signature-server-secret-not-production";
const draft={workspaceId:id,installationId:77,name:"my-repo",description:"new",private:true,autoInit:true};
const now=Date.parse("2026-10-24T21:00:00Z");
const args={draft,actorId:actor,idempotencyKey:requestId,secret,now};

test("receipt binds draft, actor, installation, key and a 5-minute expiry",()=>{
 const {receipt,expiresAt}=issueStudioApprovalReceipt(args);
 assert.equal(expiresAt,now+300000);
 assert.equal(checkStudioApprovalReceipt({...args,receipt,now:now+1000}),true);
 for(const changed of [
  {actorId:id}, {idempotencyKey:actor},
  {draft:{...draft,name:"other"}},
  {draft:{...draft,private:false}},
  {draft:{...draft,installationId:88}},
  {draft:{...draft,workspaceId:actor}},
  {secret:secret+"-different"},
  {now:now+300001},
 ]) assert.equal(checkStudioApprovalReceipt({...args,receipt,...changed}),false);
});
test("tampered or malformed receipts are rejected without throwing",()=>{
 const receipt=issueStudioApprovalReceipt(args).receipt;
 const [body,signature]=receipt.split(".");
 for(const value of [
  "", "invalid", body+".", "garbage."+signature,
  body+"."+signature.slice(0,-3)+"aaa",
  body+"."+signature+"extra", receipt+"!",
 ]) assert.equal(checkStudioApprovalReceipt({...args,receipt:value}),false);
});
test("invalid workspace/idempotency context and weak keys refuse issuance",()=>{
 for(const next of [{...args,secret:"short"},{...args,idempotencyKey:"invalid"},
  {...args,draft:{...draft,name:"invalid name"}}]) {
  assert.throws(()=>issueStudioApprovalReceipt(next));
 }
});
