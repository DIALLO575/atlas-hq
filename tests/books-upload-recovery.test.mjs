import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const ui=read("src/components/books/book-library.tsx"),api=read("src/app/api/engines/mausbot/books/[id]/file/route.ts");
test("recovery route is bounded owner-only and does not overwrite",()=>{
 for(const part of ["export async function POST","requireBookOwner(workspaceId,request.url)","BOOK_FILE_MISMATCH","upsert:false","bytes.byteLength!==Number(record.byte_size)"])assert.ok(api.includes(part));
});
test("new book upload attempts signed and proxy; cover failure not fatal",()=>{
 for(const part of ["sendBookFile(workspaceId,created.book.id,newFile,created.upload,setUploadPercent)",'cacheControl:"3600"',"createdId&&!fileReady",'method:"DELETE"',"coverIssue=true"])assert.ok(ui.includes(part));
});
test("reader can re-import missing file instead of adding duplicate",()=>{
 assert.ok(api.includes("BOOK_FILE_MISSING"));
 assert.ok(ui.includes("Réimporter le fichier original"));
 assert.ok(ui.includes("sendBookFile(workspaceId,readerBook.id,file)"));
});

test("upload never treats a conflict or a signed URL as proof of storage",()=>{
 const proxy=ui.indexOf('method:"POST",body');
 const signed=ui.indexOf("storage.uploadToSignedUrl(signed.path");
 assert.ok(proxy>=0&&signed>proxy,"small PDFs use the owner-scoped proxy before signed fallback");
 assert.ok(ui.includes('if((response.ok||response.status===409)&&await stored()){onProgress?.(100);return;}'));
 assert.ok(ui.includes('if(!saved.error&&await stored()){onProgress?.(100);return;}'));
 assert.ok(ui.includes('fetch(endpoint,{cache:"no-store",redirect:"follow"})'));
 assert.ok(!ui.includes('if(response.ok||response.status===409)return;'));
});

test("mobile proxy and signed transfers reject login HTML and require real signed Storage JSON",()=>{
 assert.ok(ui.includes('check.redirected&&new URL(check.url).pathname.startsWith("/login")'));
 assert.ok(ui.includes('check.headers.get("content-type")'));
 assert.ok(ui.includes('data.format!==format||typeof data.url!=="string"'));
 assert.ok(ui.includes('url.pathname.includes("/storage/v1/object/sign/books/")'));
 assert.ok(ui.includes('response.redirected&&new URL(response.url).pathname.startsWith("/login")'));
 assert.ok(ui.includes('uploadSignedResumable({projectUrl:config.url'));
});
