import test from "node:test";
import assert from "node:assert/strict";
import { nativePrimitive } from "../packages/engine-core/src/native-capabilities.mjs";
import { COMPUTER_METADATA_READS, COMPUTER_MUTATION_PLANS, FILE_TRANSFER_PLANS,
  FileComputerContractError,planFileComputerRead,executeFileComputerRead,
  planFileComputerMutation,planMausbotFileTransfer } from "../packages/engines/mausbot/src/file-computer-contracts.mjs";
const config={baseUrl:"https://maus.test",token:"PRIVATE_BEARER"};
const fixtures={
  "/api/computers/usage":{cloudComputers:null,teamComputers:2,
    sshAlias:"PRIVATE",command:"PRIVATE",hostname:"PRIVATE"},
  "/api/local-computer":{ready:true,managed:true,container:"running",
    viewer_url:"https://PRIVATE",password:"PRIVATE",commands:["PRIVATE"],image:"PRIVATE"},
  "/api/browser-sites":{running:true,sites:[{site:"mail.private.test",
    cookies:2,storage:1,restore:"PRIVATE"}, {site:"bank.private.test",cookies:0,storage:2}],
    session:"PRIVATE",encryptionKey:"PRIVATE"},
};
const mock=(seen,alt={})=>async(address,init)=>{
  const u=new URL(address);seen.push({u,init});
  return Response.json(Object.hasOwn(alt,u.pathname)?alt[u.pathname]:fixtures[u.pathname]);
};
for(const name of COMPUTER_METADATA_READS){
  test(name+" reads only metadata and never screenshot, profile URL or login sites",async()=>{
    const input=name==="browser.sites"?{bot:"bot1",threadId:"thread1"}:{};
    const plan=planFileComputerRead(name,input);
    const sent=[];
    const out=await executeFileComputerRead(config,name,input,{fetchImpl:mock(sent)});
    assert.equal(plan.method,"GET");
    assert.equal(plan.callable,false);
    assert.equal(plan.released,false);
    assert.equal(plan.requiresOwnerOrAdmin,true);
    assert.equal(plan.requiresRuntimeOwnershipCheck,true);
    assert.equal(sent.length,1);
    assert.equal(sent[0].init.headers.Authorization,"Bearer PRIVATE_BEARER");
    assert.equal(sent[0].init.redirect,"manual");
    assert.equal(out.primitive,name);
    assert.equal(out.projection,"metadata-only");
    assert.equal(out.untrusted,true);
    assert.equal(JSON.stringify(out).includes("PRIVATE"),false);
    assert.equal(JSON.stringify(out).includes("https://"),false);
    assert.equal(JSON.stringify(out).includes("mail.private.test"),false);
    assert.equal(nativePrimitive(name)?.method,"GET");
  });
}
test("Browser-site lookup is target-bound; no arbitrary profile ID or cross-target read",()=>{
  const p=planFileComputerRead("browser.sites",{profile:"primary"});
  assert.equal(p.path,"/api/browser-sites?profile=primary");
  const bot=planFileComputerRead("browser.sites",{bot:"bot-1",threadId:"task_1"});
  const q=new URL("https://local.test"+bot.path);
  assert.equal(q.searchParams.get("bot"),"bot-1");
  assert.equal(q.searchParams.get("threadId"),"task_1");
  for(const x of [{},{bot:"bot1",profile:"primary"},{profile:"main",threadId:"thread1"},
    {bot:"../other"},{bot:"bot1",url:"https://evil"},{bot:"bot1",cookies:true}]){
    assert.throws(()=>planFileComputerRead("browser.sites",x),FileComputerContractError);
  }
  assert.throws(()=>planFileComputerRead("computer.frames",{}),FileComputerContractError);
});
test("Metadata adapters fail closed on malformed upstream payloads",async()=>{
  const requests=[
    ["computer.usage",{}, "/api/computers/usage",{cloudComputers:-1,teamComputers:0}],
    ["browser.sites",{bot:"bot1"},"/api/browser-sites",{sites:"private"}],
    ["computer.usage",{},"/api/computers/usage",{cloudComputers:"secret",teamComputers:0}],
  ];
  for(const [name,input,path,data] of requests){
    await assert.rejects(executeFileComputerRead(config,name,input,{fetchImpl:mock([],{[path]:data})}),
      e=>e.code==="COMPUTER_METADATA_INVALID");
  }
});
test("Computer and browser mutations demand human approval but have no execution interface",()=>{
  assert.equal(COMPUTER_MUTATION_PLANS.length,5);
  const cases=[
    ["computer.local.run",{},"/api/local-computer/run"],
    ["computer.local.start",{},"/api/local-computer/start"],
    ["computer.local.stop",{},"/api/local-computer/stop"],
    ["computer.local.remove",{},"/api/local-computer/remove"],
    ["browser.sign-out",{bot:"bot1",site:"example.com"},"/api/browser-sites/sign-out"],
  ];
  for(const [name,input,path] of cases){
    const p=planFileComputerMutation(name,input);
    assert.equal(p.method,"POST");
    assert.equal(p.path,path);
    assert.equal(p.callable,false);
    assert.equal(p.requiresOwnerOrAdmin,true);
    assert.equal(p.requiresHumanApproval,true);
    assert.equal(p.requiresRealActorSession,true);
    assert.equal(p.requiresDurableAudit,true);
    assert.equal(p.requiresRuntimeOwnershipCheck,true);
    assert.equal(p.retryPolicy,"never-automatic");
    assert.equal(nativePrimitive(name).method,"POST");
  }
  assert.equal(planFileComputerMutation("computer.local.remove",{}).requiresDestructiveConfirmation,true);
  assert.equal(planFileComputerMutation("computer.local.run",{}).requiresCostReview,true);
  assert.deepEqual(planFileComputerMutation("browser.sign-out",{profile:"personal",site:"example.com"}).body,
    {profile:"personal",site:"example.com"});
});
test("Browser sign-out cannot silently sign out EVERY site or run arbitrary computer commands",()=>{
  for(const [name,input] of [
    ["browser.sign-out",{bot:"bot1"}],["browser.sign-out",{bot:"bot1",site:"*.example.com"}],
    ["browser.sign-out",{bot:"bot1",site:"example.com",force:true}],
    ["browser.sign-out",{profile:"main",bot:"bot1",site:"example.com"}],
    ["computer.local.run",{command:"rm -rf /"}],
    ["computer.local.remove",{approved:true}],
    ["computer.local.start",{threadId:"unowned"}],
    ["computer.local.screenshot",{}],
    ["computer.bot.join",{botId:"bot1"}],
  ])assert.throws(()=>planFileComputerMutation(name,input),FileComputerContractError);
});
const U="aa121234-1234-4234-8234-123456789abc";
test("Binary transfer plans are metadata only, never JSON adapters or file readers",()=>{
  assert.equal(FILE_TRANSFER_PLANS.length,5);
  const specs=[
    ["files.thread.export",{threadId:"t1"},"GET","/api/threads/t1/export?format=markdown"],
    ["files.message.image",{threadId:"t1",messageId:"m1"},"GET",
      "/api/threads/t1/messages/m1/image"],
    ["files.message.file",{threadId:"t1",messageId:"m1",ref:0},"GET",
      "/api/threads/t1/messages/m1/file?preview=1&ref=0"],
    ["files.attachments.create",{uploadId:U,mime:"image/png",bytes:2000},"POST",
      "/api/attachments?uploadId="+U],
    ["files.files.create",{uploadId:U,mime:"application/pdf",name:"Report.pdf",bytes:2048},"POST",
      "/api/files?uploadId="+U+"&name=Report.pdf"],
  ];
  for(const [name,input,method,path] of specs){
    const plan=planMausbotFileTransfer(name,input);
    assert.equal(plan.method,method);
    assert.equal(plan.path,path);
    assert.equal(plan.callable,false);
    assert.equal(plan.requiresWorker,true);
    assert.equal(plan.requiresByteStream,true);
    assert.equal(plan.requiresHumanApproval,true);
    assert.equal(plan.requiresDurableAudit,true);
    assert.equal(plan.zeroRawBytesInJson,true);
    assert.equal(plan.released,false);
    assert.equal(plan.hostTested,false);
  }
  assert.equal(planMausbotFileTransfer("files.files.create",
    {uploadId:U,mime:"application/pdf",name:"Report.pdf",bytes:2048})
    .headers["Content-Length"],"2048");
});
test("Upload validation forbids path traversal, unsafe MIME types, tokens and oversized transfers",()=>{
  const invalid=[
    ["files.attachments.create",{uploadId:"../../other",mime:"image/png",bytes:2}],
    ["files.attachments.create",{uploadId:U,mime:"image/svg+xml",bytes:100}],
    ["files.attachments.create",{uploadId:U,mime:"image/png",bytes:10485761}],
    ["files.attachments.create",{uploadId:U,mime:"image/png",bytes:0}],
    ["files.files.create",{uploadId:U,mime:"application/x-sh",name:"run.sh",bytes:100}],
    ["files.files.create",{uploadId:U,mime:"application/pdf",name:"../../etc.pdf",bytes:100}],
    ["files.files.create",{uploadId:U,mime:"application/pdf",name:"report.png",bytes:100}],
    ["files.files.create",{uploadId:U,mime:"application/pdf",name:"safe.pdf",bytes:26214401}],
    ["files.files.create",{uploadId:U,mime:"application/pdf",name:"safe.pdf",bytes:200,data:"raw bytes"}],
    ["files.message.file",{threadId:"t1",messageId:"m1",path:"/etc/passwd"}],
    ["files.message.file",{threadId:"t1",messageId:"m1",ref:101}],
    ["files.thread.export",{threadId:"../t1"}],
    ["files.thread.export",{threadId:"t1",format:"json"}],
    ["files.attachments.read",{filename:"foo.png"}],
  ];
  for(const [name,input] of invalid)
    assert.throws(()=>planMausbotFileTransfer(name,input),FileComputerContractError,name);
});
