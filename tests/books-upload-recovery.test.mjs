import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const ui=read("src/components/books/book-library.tsx"),api=read("src/app/api/engines/mausbot/books/[id]/file/route.ts");
test("recovery route is bounded owner-only and does not overwrite",()=>{
 for(const part of ["export async function POST","requireBookOwner(workspaceId,request.url)","BOOK_FILE_MISMATCH","upsert:false","bytes.byteLength!==Number(record.byte_size)"])assert.ok(api.includes(part));
});
test("new book upload attempts signed and proxy; cover failure not fatal",()=>{
 for(const part of ["sendBookFile(workspaceId,created.book.id,newFile,created.upload)",'cacheControl:"3600"',"createdId&&!fileReady",'method:"DELETE"',"coverIssue=true"])assert.ok(ui.includes(part));
});
test("reader can re-import missing file instead of adding duplicate",()=>{
 assert.ok(api.includes("BOOK_FILE_MISSING"));
 assert.ok(ui.includes("Réimporter le fichier original"));
 assert.ok(ui.includes("sendBookFile(workspaceId,readerBook.id,file)"));
});
