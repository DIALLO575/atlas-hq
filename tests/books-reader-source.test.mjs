import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadBookReaderFile } from "../src/lib/books/reader-source.mjs";

const bookId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const epub = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

for (const [format, bytes, mime] of [["epub", epub, "application/epub+zip"], ["pdf", pdf, "application/pdf"]]) {
  test(`online ${format.toUpperCase()} opens as a format-typed file`, async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url: String(url), options });
      if (calls.length === 1) return Response.json({ url: "https://storage.example/signed-book", format });
      return new Response(new Blob([bytes], { type: mime }));
    };
    const file = await loadBookReaderFile({ book: { id: bookId, format }, workspaceId, fetchImpl });
    assert.equal(file.name, `${bookId}.${format}`);
    assert.equal(file.type, mime);
    assert.equal(Buffer.compare(Buffer.from(await file.arrayBuffer()), Buffer.from(bytes)), 0);
    assert.match(calls[0].url, new RegExp(`/books/${bookId}/file\\?workspaceId=${workspaceId}`));
    assert.equal(calls[1].url, "https://storage.example/signed-book");
    assert.equal(calls[0].options.cache, "no-store");
  });

  test(`offline ${format.toUpperCase()} opens from its cached Blob without a network request`, async () => {
    const file = await loadBookReaderFile({ book: { id: bookId, format }, workspaceId, offlineFile: new Blob([bytes], { type: mime }), fetchImpl: async () => { throw new Error("network must not be used"); } });
    assert.equal(file.name, `${bookId}.${format}`);
    assert.equal(file.type, mime);
    assert.equal(Buffer.compare(Buffer.from(await file.arrayBuffer()), Buffer.from(bytes)), 0);
  });
}

test("rejects an EPUB/PDF mismatch and makes authentication failure visible", async () => {
  await assert.rejects(loadBookReaderFile({ book: { id: bookId, format: "epub" }, workspaceId, offlineFile: new Blob([pdf]) }), /BOOK_FORMAT_INVALID/);
  const authResponse = { ok: false, status: 200, redirected: true, url: "https://atlas.example/login?next=%2Flecture", json: async () => ({}) };
  await assert.rejects(loadBookReaderFile({ book: { id: bookId, format: "pdf" }, workspaceId, fetchImpl: async () => authResponse }), /AUTH_REQUIRED/);
});

test("card navigation leaves file loading to the reader route, including its offline cache", async () => {
  const component = await readFile(new URL("../src/components/books/book-library.tsx", import.meta.url), "utf8");
  assert.match(component, /const navigateToReader = useCallback\(\(book: Book\) => \{\s*router\.push/);
  assert.match(component, /onRead=\{navigateToReader\}/);
  assert.match(component, /const loadReader = useCallback\(async \(book: Book\)/);
  assert.match(component, /loadBookReaderFile\(\{ book, workspaceId, offlineFile \}\)/);
  assert.match(component, /await element\.open\(readerFile\)/);
  assert.doesNotMatch(component, /const openReader = useCallback\(async/);
});

test("reader loading stays visible on the responsive desktop and mobile layouts", async () => {
  const component = await readFile(new URL("../src/components/books/book-library.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/app/lecture/lecture.css", import.meta.url), "utf8");
  assert.match(component, /role="status" className="atlas-book-reader-status"/);
  assert.match(component, /className="atlas-book-reader-status" role="alert"/);
  assert.match(styles, /@media\(max-width:900px\)/);
  assert.match(styles, /@media\(max-width:600px\)/);
});

test("missing PDF in storage gives recoverable error",async()=>{
 await assert.rejects(loadBookReaderFile({book:{id:bookId,format:"pdf"},workspaceId,
 fetchImpl:async()=>Response.json({error:"BOOK_FILE_MISSING"},{status:409})}),/BOOK_FILE_MISSING/);
});
