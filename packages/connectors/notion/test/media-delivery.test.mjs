import test from "node:test";
import assert from "node:assert/strict";
import { notionHostedMediaSource as pick, fetchNotionHostedMedia as fetchMedia }
  from "../src/media-delivery.mjs";
const ID="123e4567-e89b-12d3-a456-426614174000";
const EXP="2026-10-26T10:00:00.000Z";
const NOW=1792920000000;
const url="https://s3.us-west-2.amazonaws.com/secure.notion-static.com/a.jpg?sig=secret";
const block=(type,file=url)=>({object:"block",id:ID,type,
  [type]:{type:"file",file:{url:file,expiry_time:EXP}}});
test("source selection refuses expired/foreign and external files",()=>{
  assert.equal(pick(block("image"),NOW).url,url);
  assert.throws(()=>pick(block("image","https://evil.org/"),NOW),{code:"NOT_AVAILABLE"});
  assert.throws(()=>pick(block("image"),Date.parse(EXP)+1),{code:"NOT_AVAILABLE"});
  assert.throws(()=>pick({object:"block",type:"image",
    image:{type:"external",external:{url:"https://example.org"}}},NOW),{code:"NOT_AVAILABLE"});
});
test("only fixed provider URL, safe image type and no credentialed origin",async()=>{
  const source=pick(block("image"),NOW);
  const result=await fetchMedia(source,{request:async(url,opts)=>{
    assert.equal(url,source.url);
    assert.equal(opts.redirect,"error");
    assert.equal(opts.headers.Authorization,undefined);
    return new Response(new Uint8Array([137,80,78,71]),{
      headers:{"content-type":"image/png","content-length":"4"}});
  }});
  assert.equal(result.mime,"image/png");
  assert.equal(result.bytes.length,4);
  assert.equal(result.disposition,"inline");
});
test("downloadable document is attachment, PDF supports inline",async()=>{
  const request=async()=>new Response("PDF",{
    headers:{"content-type":"application/pdf"}});
  const pdf=await fetchMedia(pick(block("pdf"),NOW),{request});
  assert.equal(pdf.mime,"application/pdf");
  assert.equal(pdf.disposition,"inline");
  const file=await fetchMedia(pick(block("file"),NOW),{request});
  assert.equal(file.disposition,"attachment");
});
test("unsupported SVG and HTML never served in media proxy",async()=>{
  for(const mime of ["image/svg+xml","text/html","application/javascript"]){
    const request=async()=>new Response("<script>test</script>",{
      headers:{"content-type":mime}});
    await assert.rejects(fetchMedia(pick(block("image"),NOW),{request}),
      {code:"UNSUPPORTED_MEDIA"});
  }
});
test("enforce content-length and streaming limit before returning any bytes",async()=>{
  let calls=0;
  const source=pick(block("image"),NOW);
  await assert.rejects(fetchMedia(source,{maxBytes:1024,
    request:async()=>{
      calls++;return new Response("small",{
        headers:{"content-type":"image/png","content-length":"99999"}});
    }}),{code:"MEDIA_TOO_LARGE"});
  await assert.rejects(fetchMedia(source,{maxBytes:1024,
    request:async()=>new Response(new Uint8Array(2048),{
      headers:{"content-type":"image/png"}})}),{code:"MEDIA_TOO_LARGE"});
  assert.equal(calls,1);
});
test("reject redirects and provider errors; never expose response body",async()=>{
  const source=pick(block("image"),NOW);
  await assert.rejects(fetchMedia(source,{request:async()=>{
    return new Response("PRIVATE_BODY",{status:302,headers:{Location:"https://evil.org/"}});
  }}),err=>err.code==="PROVIDER_UNAVAILABLE" &&
    !err.message.includes("PRIVATE_BODY"));
  await assert.rejects(fetchMedia(source,{request:async()=>{
    throw Error("token-secret");
  }}),err=>!err.message.includes("token-secret"));
});
test("cannot manually pass arbitrary attacker URL to binary fetcher",async()=>{
  await assert.rejects(fetchMedia({kind:"image",url:"https://localhost/file"},{
    request:async()=>{throw Error("should never be called");}
  }),{code:"INVALID_REQUEST"});
});
