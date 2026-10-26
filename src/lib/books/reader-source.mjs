const API = "/api/engines/mausbot/books";
const MIME_TYPES = { epub: "application/epub+zip", pdf: "application/pdf" };

async function readJson(response) {
  if (response.redirected && new URL(response.url).pathname.startsWith("/login")) {
    throw new Error("AUTH_REQUIRED");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (body?.error === "BOOK_FILE_MISSING") throw new Error("BOOK_FILE_MISSING");
    throw new Error(response.status === 307 ? "AUTH_REQUIRED" : "BOOK_FILE_UNAVAILABLE");
  }
  return response.json();
}

function matchesFormat(bytes, format) {
  if (format === "pdf") return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  if (format === "epub") return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  return false;
}

export async function loadBookReaderFile({ book, workspaceId, offlineFile = null, fetchImpl = fetch }) {
  let source = offlineFile;
  if (!source) {
    const query = new URLSearchParams({ workspaceId });
    const metadata = await readJson(await fetchImpl(`${API}/${book.id}/file?${query}`, { cache: "no-store" }));
    if (metadata.format && metadata.format !== book.format) throw new Error("BOOK_FORMAT_MISMATCH");
    let response;
    try { response = await fetchImpl(metadata.url); }
    catch { throw new Error("BOOK_FILE_DOWNLOAD_FAILED"); }
    if (!response.ok) throw new Error("BOOK_FILE_DOWNLOAD_FAILED");
    source = await response.blob();
  }

  if (!source || source.size < 5) throw new Error("BOOK_FILE_EMPTY");
  const bytes = new Uint8Array(await source.slice(0, 5).arrayBuffer());
  if (!matchesFormat(bytes, book.format)) throw new Error("BOOK_FORMAT_INVALID");
  const extension = book.format === "pdf" ? "pdf" : "epub";
  return new File([source], `${book.id}.${extension}`, { type: MIME_TYPES[book.format] });
}
