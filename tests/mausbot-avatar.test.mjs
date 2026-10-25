import test from "node:test";
import assert from "node:assert/strict";
import { storedMausbotAvatarPath, mausbotAvatarAvailable,
  detectMausbotImageMime, fetchMausbotAvatar, MAUSBOT_AVATAR_LIMIT }
  from "../packages/engines/mausbot/src/avatar.mjs";

const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const valid = "/api/attachments/abc-123.png";
test("avatar paths are strictly local stored raster files", () => {
  assert.equal(storedMausbotAvatarPath(valid),valid);
  for(const value of ["https://attacker.example/avatar.png","//attacker.example/avatar.png",
    "/api/attachments/../secret.png", "/api/attachments/a.svg",
    "/api/attachments/a.png?token=123","/api/attachments/%2e%2e.png",
    "http://127.0.0.1:8799/api/attachments/a.png","/api/bots",
    "/api/attachments/a.PNG",null,undefined]) assert.equal(storedMausbotAvatarPath(value),null);
});
test("only server-validated avatar URL counts and mascot crop stays untouched",()=>{
  assert.equal(mausbotAvatarAvailable({avatarUrl:valid,avatarCrop:"circle"}),true);
  assert.equal(mausbotAvatarAvailable({avatarUrl:valid,avatarCrop:"mascot"}),false);
  assert.equal(mausbotAvatarAvailable({avatarUrl:"https://evil.example/p.png",avatarCrop:"circle"}),false);
});
test("proxy adds secret server side and does not follow redirects", async()=>{
 let observed;
 const response=await fetchMausbotAvatar({baseUrl:"https://mausbot.example",token:"server-only-secret"},valid,
   async(url,options)=>{observed={url,options};return new Response(png,{headers:{"Content-Type":"image/png"}})});
 assert.equal(observed.url,"https://mausbot.example"+valid);
 assert.equal(observed.options.redirect,"manual");
 assert.equal(observed.options.headers.Authorization,"Bearer server-only-secret");
 assert.deepEqual([...response.bytes],[...png]);
 assert.equal(response.mime,"image/png");
});
test("wrong signatures, wrong declared mime and oversize responses are rejected",async()=>{
 const cfg={baseUrl:"https://mausbot.example",token:"secret"};
 const reply=(body,mime,headers={})=>async()=>new Response(body,{headers:{"Content-Type":mime,...headers}});
 await assert.rejects(fetchMausbotAvatar(cfg,valid,reply("<svg/>","image/svg+xml")),/MAUSBOT_AVATAR_TYPE_INVALID/);
 await assert.rejects(fetchMausbotAvatar(cfg,valid,reply("<script/>","image/png")),/MAUSBOT_AVATAR_TYPE_INVALID/);
 await assert.rejects(fetchMausbotAvatar(cfg,valid,reply(png,"image/jpeg")),/MAUSBOT_AVATAR_TYPE_INVALID/);
 await assert.rejects(fetchMausbotAvatar(cfg,valid,reply(png,"image/png",{"Content-Length":String(MAUSBOT_AVATAR_LIMIT+1)})));
 await assert.rejects(fetchMausbotAvatar(cfg,"https://evil.example",reply(png,"image/png")),/MAUSBOT_AVATAR_PATH_INVALID/);
 await assert.rejects(fetchMausbotAvatar(cfg,valid,async()=>Response.redirect("https://evil.example",302)));
});
test("magic byte sniffer accepts only declared raster formats",()=>{
 assert.equal(detectMausbotImageMime(png),"image/png");
 assert.equal(detectMausbotImageMime(new Uint8Array([255,216,255,0])),"image/jpeg");
 assert.equal(detectMausbotImageMime(new TextEncoder().encode("GIF89a")),"image/gif");
 assert.equal(detectMausbotImageMime(new TextEncoder().encode("RIFF0000WEBP")),"image/webp");
 assert.equal(detectMausbotImageMime(new TextEncoder().encode("<svg/>")),null);
});
