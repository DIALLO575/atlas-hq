"use client";

// Private signed Storage URLs are intentionally rendered directly without an image proxy.
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { listWorkspaces } from "@/app/workspaces/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ReadingState = { position?: number; pages_read?: number | null; finished_at?: string | null; client_updated_at?: string|null; device_id?:string|null }[];
type Book = { id: string; title: string; author: string; format: "epub" | "pdf"; status: string; cover_path?: string | null; cover_thumb_path?: string | null; book_reading_state?: ReadingState };
type CoverUrls = { path: string | null; coverUrl: string | null; thumbUrl: string | null };
type Summary = { todaySeconds:number;goalSeconds:number;goalMinutes?:number;dailySeconds?:Record<string,number>;pagesPerHour?:number;finishedBooks?:number;totalBooks?:number;streakDays?:number };
type ReaderApi = { open(book: string | Blob): Promise<void>; next(): Promise<void>; prev(): Promise<void>; book: { sections: unknown[]; getCover?: () => Promise<Blob | null> }; lastLocation?: { fraction?: number; index?: number; range?: Range }; getCFI(index: number, range: Range): string; resolveCFI(cfi: string): { index: number }; addAnnotation(annotation: { value: string; color: string; note?: string }): Promise<void>; addEventListener(type: string, listener: EventListener): void; removeEventListener(type: string, listener: EventListener): void; goTo(location: unknown): Promise<void> };
const API = "/api/engines/mausbot/books";
type OfflineToken = {scope:string;epoch:string;userId:string;workspaceId:string};
type OfflineRoot = {books:Record<string,{id:string;downloadedAt:number|null;fileSize:number|null;lastOpenedAt:number;status:string;localPosition?:number;localDeviceId?:string|null}>};
type OfflineStore = {cache:{open:(u:string,w:string)=>Promise<OfflineToken>;snapshot:(t:unknown)=>Promise<OfflineRoot|null>;saveBook:(t:unknown,b:unknown)=>Promise<boolean>;enqueue:(t:unknown,o:unknown)=>Promise<boolean>;queue:(t:unknown)=>Promise<{kind:string;sendId:string;body:Record<string,unknown>}[]|null>;acknowledge:(t:unknown,id:string)=>Promise<void>;markOpened:(t:unknown,id:string)=>Promise<void>};getFile:(t:unknown,id:string)=>Promise<{blob:Blob}|null>;putFile:(t:unknown,b:Book,blob:Blob,checksum:string)=>Promise<void>;removeFile:(t:unknown,id:string)=>Promise<void>;putCover:(t:unknown,id:string,path:string,blob:Blob)=>Promise<void>;close:()=>void};
type OfflineModule = {booksOfflineStorage:()=>Promise<OfflineStore>;setBooksCapability:(token:OfflineToken)=>void};
function deviceId() { let id = localStorage.getItem('atlas.books.device-id'); if (!id) { id = crypto.randomUUID(); localStorage.setItem('atlas.books.device-id', id); } return id; }
const PALETTES = [["#c97752", "#f1d4b5"], ["#456a68", "#b7c8b9"], ["#77658e", "#d4c2dc"], ["#af7d37", "#ecd9a6"], ["#4e688c", "#c2d3e8"], ["#9a5d70", "#e6bec7"]];
const HIGHLIGHT_COLORS: Record<string, string> = { yellow: "#f5d968", blue: "#8cbfda", green: "#9bc89c", pink: "#dfa1b5" };
const safeJson = async <T,>(response: Response): Promise<T> => { if (response.redirected && new URL(response.url).pathname.startsWith("/login")) throw new Error("AUTH_REQUIRED"); if (!response.ok) throw new Error(response.status === 307 ? "AUTH_REQUIRED" : "BOOKS_UNAVAILABLE"); return response.json() as Promise<T>; };
function sameSet<T>(set: Dispatch<SetStateAction<T>>, next: T) { set((old: T) => JSON.stringify(old) === JSON.stringify(next) ? old : next); }
function coverValue(book: Book) { return book.book_reading_state?.[0]?.position ?? 0; }
function signedUrl(workspaceId: string, bookId: string) { return `${API}/${bookId}/cover?workspaceId=${encodeURIComponent(workspaceId)}`; }
function importPublicModule(path: string) { return import(/* webpackIgnore: true */ new URL(path, window.location.origin).href); }

function canvasImage(title: string, author: string, palette: number, seed: number, size: number): Promise<File> {
  const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = Math.round(size * 1.5);
  const ctx = canvas.getContext("2d"); if (!ctx) return Promise.reject(new Error("CANVAS_UNAVAILABLE"));
  const [from, to] = PALETTES[((palette % PALETTES.length) + PALETTES.length) % PALETTES.length];
  const gradient = ctx.createLinearGradient(0, 0, size, canvas.height); gradient.addColorStop(0, from); gradient.addColorStop(1, to); ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, canvas.height);
  ctx.globalAlpha = .16; ctx.strokeStyle = "#fff9eb"; ctx.lineWidth = Math.max(2, size / 100);
  if (seed % 3 === 0) { for (let i = -size; i < canvas.height + size; i += size / 5) { ctx.beginPath(); ctx.arc(size * .82, i, size * .28, 0, Math.PI * 2); ctx.stroke(); } }
  else if (seed % 3 === 1) { for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(size * .08 + i * size * .12, 0); ctx.lineTo(size * .08 + i * size * .12, canvas.height); ctx.stroke(); } }
  else { ctx.beginPath(); ctx.arc(size * .82, size * .24, size * .22, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(size * .82, size * .24, size * .17, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.fillStyle = "#fffaf0"; ctx.textAlign = "left";
  const scale = size / 240; ctx.font = `600 ${Math.round(25 * scale)}px Georgia, serif`;
  const words = title.trim().split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > size * .75 && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line); const visible = lines.slice(0, Math.max(2, Math.floor(size / 72)));
  let y = canvas.height * .64 - (visible.length - 1) * 16 * scale;
  for (const part of visible) { ctx.fillText(part, size * .12, y, size * .76); y += 34 * scale; }
  ctx.globalAlpha = .82; ctx.font = `${Math.round(12 * scale)}px Arial, sans-serif`; ctx.fillText(author || "ATLAS · LECTURE", size * .12, canvas.height * .88, size * .76);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(new File([blob], `cover-${size}.webp`, { type: "image/webp" })) : reject(new Error("COVER_ENCODE_FAILED")), "image/webp", .88));
}
async function resizedImage(file: File, title: string, author: string, palette: number, seed: number) {
  if (!file.type.startsWith("image/") || file.size === 0) return [await canvasImage(title, author, palette, seed, 720), await canvasImage(title, author, palette, seed, 240)] as const;
  if (file.size > 15 * 1024 * 1024) throw new Error("La photo de couverture doit faire moins de 15 Mo.");
  const image = await createImageBitmap(file); const render = (limit: number) => new Promise<File>((resolve, reject) => {
    const ratio = Math.min(1, limit / Math.max(image.width, image.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext("2d"); if (!context) return reject(new Error("CANVAS_UNAVAILABLE")); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => blob ? resolve(new File([blob], `cover-${limit}.webp`, { type: "image/webp" })) : reject(new Error("COVER_ENCODE_FAILED")), "image/webp", .86);
  });
  const result = await Promise.all([render(720), render(240)]); image.close(); return result as readonly [File, File];
}
async function putCover(workspaceId: string, bookId: string, files: readonly [File, File]) {
  const response = await fetch(`${API}/${bookId}/cover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) });
  const signed = await safeJson<{ cover: { path: string; token: string }; thumb: { path: string; token: string } }>(response);
  const storage = createSupabaseBrowserClient()?.storage.from("books"); if (!storage) throw new Error("STORAGE_UNAVAILABLE");
  const [cover, thumb] = await Promise.all([storage.uploadToSignedUrl(signed.cover.path, signed.cover.token, files[0], { contentType: "image/webp" }), storage.uploadToSignedUrl(signed.thumb.path, signed.thumb.token, files[1], { contentType: "image/webp" })]);
  if (cover.error || thumb.error) throw new Error("COVER_UPLOAD_FAILED");
  const finalized = await fetch(`${API}/${bookId}/cover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, finalize: true, coverPath: signed.cover.path, thumbPath: signed.thumb.path }) });
  await safeJson<{ saved: boolean }>(finalized);
}

export function BookLibrary({ readerId }: { readerId?: string }) {
  const router = useRouter(); const [workspaceId, setWorkspaceId] = useState(""); const [books, setBooks] = useState<Book[]>([]); const [covers, setCovers] = useState<Record<string, CoverUrls>>({}); const [summary, setSummary] = useState<Summary | null>(null);
  const [offlineToken, setOfflineToken] = useState<{scope:string;epoch:string;userId:string;workspaceId:string}|null>(null); const [offlineIds,setOfflineIds]=useState<string[]>([]);
  const [filter, setFilter] = useState("Tous"); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [newFile, setNewFile] = useState<File | null>(null); const [newCover, setNewCover] = useState<File | null>(null); const [title, setTitle] = useState(""); const [author, setAuthor] = useState(""); const [readerBook, setReaderBook] = useState<Book | null>(null); const [readerUrl, setReaderUrl] = useState(""); const [reader, setReader] = useState<ReaderApi | null>(null); const [readerError, setReaderError] = useState(""); const [notes, setNotes] = useState<{ id:string;kind:string;body:string;position:number;color:string;anchor_cfi?:string|null;deleted_at?:string|null }[]>([]); const [editingNote,setEditingNote]=useState<string|null>(null); const [goalDraft,setGoalDraft]=useState("30"); const [noteText, setNoteText] = useState(""); const [selectedText, setSelectedText] = useState(""); const [settingsOpen, setSettingsOpen] = useState(false); const [font, setFont] = useState("Georgia, serif"); const [fontSize, setFontSize] = useState(18); const [theme, setTheme] = useState("sepia"); const [palette, setPalette] = useState(0); const [readerProgress, setReaderProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null); const coverInput = useRef<HTMLInputElement>(null); const readerHost = useRef<HTMLDivElement>(null); const fileRef = useRef<File | null>(null); const positionRef = useRef(0); const lastTick = useRef(0); const currentBookId = useRef(""); const selectedRange = useRef<{ index: number; range: Range } | null>(null); const currentSection = useRef(0); const notesRef = useRef(notes); const [refreshKey, setRefreshKey] = useState(0); const listEtag=useRef(""); const resumeOverride=useRef<number|null>(null);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  const readerPrefs = useRef({ font, fontSize, theme }); const readerDocs = useRef<Document[]>([]);
  useEffect(() => { readerPrefs.current = { font, fontSize, theme }; for (const doc of readerDocs.current) { doc.documentElement.style.fontFamily = font; doc.documentElement.style.fontSize = `${fontSize}px`; doc.documentElement.style.background = theme === "night" ? "#171717" : theme === "sepia" ? "#f0e4cd" : "#fffdf8"; doc.documentElement.style.color = theme === "night" ? "#eae4d8" : "#342c25"; } }, [font, fontSize, theme]);
  useEffect(() => { if (!readerId) return; const timer = window.setTimeout(() => setTheme(window.matchMedia("(max-width: 600px)").matches ? "night" : "sepia"), 0); return () => window.clearTimeout(timer); }, [readerId]);

  useEffect(() => { let alive = true; void listWorkspaces().then(async result => { if (!alive) return; if (result.status !== "ready") { setMessage("AUTH_REQUIRED"); return; } setWorkspaceId(result.selectedId); const supabase=createSupabaseBrowserClient(); const {data}=await supabase?.auth.getUser()??{data:{user:null}}; if(!alive||!data.user)return; try { const offlineStorageModule=await importPublicModule('/books-offline-storage.mjs') as OfflineModule; const store=await offlineStorageModule.booksOfflineStorage(); const token=await store.cache.open(data.user.id,result.selectedId); offlineStorageModule.setBooksCapability(token); setOfflineToken(token); const root=await store.cache.snapshot(token); setOfflineIds(Object.values(root?.books??{}).filter((b)=>b.downloadedAt).map((b)=>b.id)); store.close(); } catch { /* Offline storage can be unavailable without blocking the online library. */ } }); return () => { alive = false; }; }, []);
  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [listResponse, summaryResponse] = await Promise.all([fetch(`${API}?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", headers:listEtag.current?{'If-None-Match':listEtag.current}:{} }), fetch(`${API}/summary?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" })]);
      const list = listResponse.status===304?null:await safeJson<{ books: Book[] }>(listResponse); if(listResponse.headers.get("ETag"))listEtag.current=listResponse.headers.get("ETag")!; const daily = await safeJson<Summary>(summaryResponse);
      if(list)sameSet(setBooks, list.books); setSummary(old=>old&&JSON.stringify(old)===JSON.stringify(daily)?old:daily); setMessage("");
      if (offlineToken && list) { const offlineStorageModule=await importPublicModule('/books-offline-storage.mjs') as OfflineModule; const store=await offlineStorageModule.booksOfflineStorage(); try { await Promise.all(list.books.map(book=>store.cache.saveBook(offlineToken,{...book,position:coverValue(book)}))); } finally { store.close(); } }
      const nextCovers: Record<string, CoverUrls> = {};
      await Promise.all((list?.books??books).map(async book => {
        const old = covers[book.id];
        if (old && old.path === (book.cover_thumb_path ?? null)) { nextCovers[book.id] = old; return; }
        if (!book.cover_thumb_path) { nextCovers[book.id] = { path: null, coverUrl: null, thumbUrl: null }; return; }
        try { nextCovers[book.id] = await safeJson<CoverUrls>(await fetch(signedUrl(workspaceId, book.id), { cache: "no-store" })); } catch {}
      }));
      sameSet(setCovers, nextCovers);
    } catch (error) { setMessage(error instanceof Error ? error.message : "BOOKS_UNAVAILABLE"); }
  }, [workspaceId, covers, offlineToken, books]);
  useEffect(() => { const update=()=>{if(document.visibilityState==='visible')void refresh();}; const timer=window.setInterval(update,300000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);window.addEventListener('online',update);return()=>{window.clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);window.removeEventListener('online',update);}; },[refresh]);
  useEffect(() => {
    if (!offlineToken) return;
    let working = false;
    const flush = async () => {
      if (working || !navigator.onLine) return;
      working = true;
      let changedAnnotations = false;
      try {
        const offlineStorageModule = await importPublicModule('/books-offline-storage.mjs') as OfflineModule;
        const store = await offlineStorageModule.booksOfflineStorage();
        try {
          for (const item of await store.cache.queue(offlineToken) ?? []) {
            const method = item.kind === 'progress' ? 'POST' : item.kind === 'annotation_delete' ? 'DELETE' : item.body.id ? 'PATCH' : 'POST';
            const response = await fetch(item.kind === 'progress' ? `${API}/progress` : `${API}/notes`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.body) });
            if (!response.ok) break;
            await store.cache.acknowledge(offlineToken, item.sendId);
            if (item.kind !== 'progress') changedAnnotations = true;
          }
        } finally { store.close(); }
        if (changedAnnotations && readerBook) {
          const response = await fetch(`${API}/notes?workspaceId=${encodeURIComponent(workspaceId)}&bookId=${readerBook.id}`, { cache: 'no-store' });
          if (response.ok) { const result = await response.json() as { notes: typeof notes }; sameSet(setNotes, result.notes); }
        }
      } catch { /* Keep pending operations for the next network/focus event. */ }
      finally { working = false; }
    };
    window.addEventListener('online', flush); window.addEventListener('focus', flush); document.addEventListener('visibilitychange', flush); navigator.serviceWorker?.addEventListener('message', flush); void flush();
    return () => { window.removeEventListener('online', flush); window.removeEventListener('focus', flush); document.removeEventListener('visibilitychange', flush); navigator.serviceWorker?.removeEventListener('message', flush); };
  }, [offlineToken, readerBook, workspaceId]);
  // Fetching the latest private library is the synchronization boundary for this page.
  useEffect(() => { void refresh(); }, [refresh, refreshKey]);

  const visibleBooks = useMemo(() => books.filter(book => filter === "Tous" || (filter === "À lire" && coverValue(book) === 0) || (filter === "En cours" && coverValue(book) > 0 && coverValue(book) < .98) || (filter === "Terminé" && (book.status === "finished" || coverValue(book) >= .98))), [books, filter]);
  const openReader = useCallback(async (book: Book) => {
    let localPosition=0; let file:Blob|null=null; if(offlineToken) { const offlineStorageModule=await importPublicModule('/books-offline-storage.mjs') as OfflineModule; const store=await offlineStorageModule.booksOfflineStorage(); try { const root=await store.cache.snapshot(offlineToken); localPosition=root?.books?.[book.id]?.localPosition??0; const cached=await store.getFile(offlineToken,book.id); if(cached){file=cached.blob;await store.cache.markOpened(offlineToken,book.id);} } finally {store.close();} }
    const progressState=book.book_reading_state?.[0]; const remotePosition=progressState?.position??0; resumeOverride.current=progressState?.device_id&&progressState.device_id!==deviceId()&&remotePosition>localPosition?(window.confirm(`Un autre appareil est à ${Math.round(remotePosition*100)} %. Reprendre à ${Math.round(remotePosition*100)} % ?`)?remotePosition:localPosition):remotePosition;
    setReaderError(""); setReaderBook(book); setReaderUrl(""); setReader(null); currentBookId.current = book.id;
    try { if(file)setReaderUrl(URL.createObjectURL(file)); else { const result = await safeJson<{ url: string }>(await fetch(`${API}/${book.id}/file?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" })); setReaderUrl(result.url); } router.push(`/lecture/${book.id}?workspaceId=${encodeURIComponent(workspaceId)}`); }
    catch (error) { setReaderError(error instanceof Error ? error.message : "BOOK_FILE_UNAVAILABLE"); }
  }, [router, workspaceId, offlineToken]);
  useEffect(() => { if (readerId && workspaceId) { const book = books.find(item => item.id === readerId); if (book && !readerBook) { const timer = window.setTimeout(() => void openReader(book), 0); return () => window.clearTimeout(timer); } } }, [readerId, workspaceId, books, readerBook, openReader]);

  const generateAndUpload = useCallback(async (bookId: string, source?: File | Blob | null, variant = 0, bookTitle = title, bookAuthor = author) => {
    let selected = source ?? null;
    if (!selected && fileRef.current && (fileRef.current.type === "application/epub+zip" || fileRef.current.name.toLowerCase().endsWith(".epub"))) {
      try {
        await importPublicModule("/vendor/foliate-js/view.js"); await customElements.whenDefined("foliate-view");
        const hidden = document.createElement("div"); hidden.hidden = true; document.body.append(hidden);
        const view = document.createElement("foliate-view") as HTMLElement & { open(book: File): Promise<void>; book: { getCover?: () => Promise<Blob | null> } }; hidden.append(view);
        try { await view.open(fileRef.current); selected = await view.book.getCover?.() ?? null; } finally { hidden.remove(); }
      } catch { selected = null; }
    }
    const titlePalette = [...bookTitle].reduce((sum, char) => sum + char.charCodeAt(0), 0) % PALETTES.length;
    const selectedPalette = (titlePalette + variant) % PALETTES.length;
    let pair: readonly [File, File];
    if (selected) {
      try { pair = await resizedImage(new File([selected], "epub-cover", { type: selected.type || "image/jpeg" }), bookTitle, bookAuthor, selectedPalette, variant); }
      catch { pair = await resizedImage(new File([], "generated"), bookTitle, bookAuthor, selectedPalette, variant); }
    } else pair = await resizedImage(new File([], "generated"), bookTitle, bookAuthor, selectedPalette, variant);
    await putCover(workspaceId, bookId, pair);
  }, [author, title, workspaceId]);

  const addBook = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!workspaceId || !newFile || busy) return;
    if (newCover && (!['image/jpeg', 'image/png', 'image/webp'].includes(newCover.type) || newCover.size < 1 || newCover.size > 15 * 1024 * 1024)) { setMessage("Choisissez une image JPEG, PNG ou WebP de moins de 15 Mo."); return; }
    setBusy(true); setMessage(""); fileRef.current = newFile;
    try {
      const format = newFile.type === "application/pdf" || newFile.name.toLowerCase().endsWith(".pdf") ? "pdf" : "epub"; const mimeType = format === "pdf" ? "application/pdf" : "application/epub+zip";
      const created = await safeJson<{ book: Book; upload: { path: string; token: string } }>(await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, title: title.trim() || newFile.name.replace(/\.(epub|pdf)$/i, ""), author, format, mimeType, byteSize: newFile.size }) }));
      const storage = createSupabaseBrowserClient()?.storage.from("books"); if (!storage) throw new Error("STORAGE_UNAVAILABLE");
      const uploaded = await storage.uploadToSignedUrl(created.upload.path, created.upload.token, newFile, { contentType: mimeType }); if (uploaded.error) throw new Error("BOOK_UPLOAD_FAILED");
      if (newCover) { if (!['image/jpeg', 'image/png', 'image/webp'].includes(newCover.type)) throw new Error("Choisissez une image JPEG, PNG ou WebP."); await putCover(workspaceId, created.book.id, await resizedImage(newCover, title, author, palette, palette)); }
      else { await generateAndUpload(created.book.id, null, 0, created.book.title, created.book.author); }
      setTitle(""); setAuthor(""); setNewFile(null); setNewCover(null); if (fileInput.current) fileInput.current.value = ""; if (coverInput.current) coverInput.current.value = ""; setRefreshKey(x => x + 1); setMessage("Livre ajouté à votre bibliothèque.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "BOOK_CREATE_UNAVAILABLE"); }
    finally { setBusy(false); fileRef.current = null; }
  };

  const savePhoto = async (book: Book, file: File) => { setBusy(true); try { await putCover(workspaceId, book.id, await resizedImage(file, book.title, book.author, palette, palette)); setRefreshKey(x => x + 1); } catch (error) { setMessage(error instanceof Error ? error.message : "BOOK_COVER_UNAVAILABLE"); } finally { setBusy(false); } };
  const regenerate = async (book: Book) => { setBusy(true); const next = palette + 1; setPalette(next); try { await generateAndUpload(book.id, null, next, book.title, book.author); setRefreshKey(x => x + 1); } catch (error) { setMessage(error instanceof Error ? error.message : "BOOK_COVER_UNAVAILABLE"); } finally { setBusy(false); } };
  const removeCover = async (book: Book) => { setBusy(true); try { const response = await fetch(`${API}/${book.id}/cover?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "DELETE" }); await safeJson<{ removed: boolean }>(response); setRefreshKey(x => x + 1); } catch (error) { setMessage(error instanceof Error ? error.message : "BOOK_COVER_UNAVAILABLE"); } finally { setBusy(false); } };
  const makeOffline = async (book:Book) => { if(!offlineToken){setMessage("Reconnectez-vous pour préparer ce livre hors ligne.");return;} setBusy(true); try { await navigator.storage?.persist?.(); const estimate=await navigator.storage?.estimate?.(); const offlineStorageModule=await importPublicModule('/books-offline-storage.mjs') as OfflineModule; const store=await offlineStorageModule.booksOfflineStorage(); try { const old=await store.getFile(offlineToken,book.id); if(old){setOfflineIds(ids=>ids.includes(book.id)?ids:[...ids,book.id]);return;} const response=await safeJson<{url:string}>(await fetch(`${API}/${book.id}/file?workspaceId=${encodeURIComponent(workspaceId)}`,{cache:'no-store'})); const download=await fetch(response.url); if(!download.ok)throw new Error('BOOK_DOWNLOAD_FAILED'); const blob=await download.blob(); if(blob.size>1_000_000_000||blob.size>(estimate?.quota??Infinity)*.8||(estimate?.usage??0)+blob.size>(estimate?.quota??Infinity)*.9)throw new Error('STORAGE_QUOTA_LOW'); const root=await store.cache.snapshot(offlineToken); if(!root)throw new Error('BOOK_CACHE_SCOPE_CHANGED'); let total=Object.values(root.books).reduce((sum,item)=>sum+(item.downloadedAt?item.fileSize??0:0),0); const evict=Object.entries(root.books).filter(([id,item])=>id!==book.id&&item.downloadedAt&&item.status==='finished').sort((a,b)=>a[1].lastOpenedAt-b[1].lastOpenedAt); while(total+blob.size>1_000_000_000&&evict.length){const [id,item]=evict.shift()!;await store.removeFile(offlineToken,id);total-=item.fileSize??0;setOfflineIds(ids=>ids.filter(x=>x!==id));} if(total+blob.size>1_000_000_000)throw new Error('OFFLINE_LIMIT_REACHED'); const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join(''); await store.putFile(offlineToken,book,blob,checksum); const cover=book.cover_thumb_path?covers[book.id]?.thumbUrl:null; if(cover){const img=await fetch(cover);if(img.ok)await store.putCover(offlineToken,book.id,book.cover_thumb_path!,await img.blob());} setOfflineIds(ids=>ids.includes(book.id)?ids:[...ids,book.id]); } finally{store.close();} } catch(error){setMessage(error instanceof Error?error.message:'BOOK_OFFLINE_UNAVAILABLE');} finally{setBusy(false);} };
  const removeOffline = async (book:Book) => { if(!offlineToken)return; const offlineStorageModule=await importPublicModule('/books-offline-storage.mjs') as {booksOfflineStorage:()=>Promise<{removeFile:(t:unknown,id:string)=>Promise<void>;close:()=>void}>}; const store=await offlineStorageModule.booksOfflineStorage();try{await store.removeFile(offlineToken,book.id);setOfflineIds(ids=>ids.filter(id=>id!==book.id));}finally{store.close();} };

  useEffect(() => {
    const host = readerHost.current;
    if (!readerUrl || !host) return; let alive = true; let view: ReaderApi | null = null;
    const start = async () => { try {
      await importPublicModule("/vendor/foliate-js/view.js"); await customElements.whenDefined("foliate-view");
      if (!alive) return;
      const element = document.createElement("foliate-view") as unknown as ReaderApi & HTMLElement; element.className = "atlas-book-pages"; host.replaceChildren(element);
      element.addEventListener("relocate", ((event: CustomEvent<{ fraction?: number; index?: number }>) => { const total = Math.max(1, element.book?.sections?.length ?? 1); currentSection.current = event.detail.index ?? 0; positionRef.current = Math.min(1, Math.max(0, (currentSection.current + (event.detail.fraction ?? 0)) / total)); setReaderProgress(positionRef.current); }) as EventListener);
      readerDocs.current = [];
      element.addEventListener("draw-annotation", ((event: CustomEvent<{ annotation: { color: string }; draw: (renderer: (rects: DOMRectList, options: { color: string }) => SVGElement, options: { color: string }) => void }>) => { const detail = event.detail; void importPublicModule("/vendor/foliate-js/overlayer.js").then(module => { const overlayer = module as { Overlayer: { highlight: (rects: DOMRectList, options: { color: string }) => SVGElement } }; detail.draw(overlayer.Overlayer.highlight, { color: HIGHLIGHT_COLORS[detail.annotation.color] ?? HIGHLIGHT_COLORS.yellow }); }); }) as EventListener);
      element.addEventListener("create-overlay", ((event: CustomEvent<{ index: number }>) => { window.setTimeout(() => { for (const note of notesRef.current) if (note.kind === "highlight" && note.anchor_cfi && element.resolveCFI(note.anchor_cfi).index === event.detail.index) void element.addAnnotation({ value: note.anchor_cfi, color: note.color }); }, 0); }) as EventListener);
      element.addEventListener("load", ((event: CustomEvent<{ doc: Document }>) => { const doc = event.detail.doc; readerDocs.current = [...readerDocs.current.filter(current => current !== doc), doc]; const prefs = readerPrefs.current; doc.documentElement.style.fontFamily = prefs.font; doc.documentElement.style.fontSize = `${prefs.fontSize}px`; doc.documentElement.style.background = prefs.theme === "night" ? "#171717" : prefs.theme === "sepia" ? "#f0e4cd" : "#fffdf8"; doc.documentElement.style.color = prefs.theme === "night" ? "#eae4d8" : "#342c25"; doc.addEventListener("mouseup", () => { const selection = doc.getSelection(); setSelectedText(selection?.toString().trim() ?? ""); selectedRange.current = selection?.rangeCount ? { index: currentSection.current, range: selection.getRangeAt(0).cloneRange() } : null; }); }) as EventListener);
      await element.open(readerUrl);
      const resumePosition = resumeOverride.current ?? coverValue(readerBook ?? { id: "", title: "", author: "", format: "epub", status: "active" }); resumeOverride.current=null;
      const resumeSection = Math.min(element.book.sections.length - 1, Math.floor(resumePosition * element.book.sections.length));
      if (resumeSection > 0) await element.goTo(resumeSection);
      if (alive) { view = element; setReader(element); }
    } catch { if (alive) setReaderError("Impossible d’ouvrir ce fichier. Vérifiez que le lecteur et la migration sont disponibles."); } };
    void start(); return () => { alive = false; view = null; readerDocs.current = []; host.replaceChildren(); };
  }, [readerUrl, readerBook]);
  useEffect(() => { if (!reader || !readerBook) return; let alive = true; const refreshNotes = async () => { try { const result = await safeJson<{ notes: typeof notes }>(await fetch(`${API}/notes?workspaceId=${encodeURIComponent(workspaceId)}&bookId=${readerBook.id}`, { cache: "no-store" })); if (alive) { sameSet(setNotes, result.notes); for (const note of result.notes) if (note.kind === "highlight" && note.anchor_cfi) { try { await reader.addAnnotation({ value: note.anchor_cfi, color: note.color }); } catch {} } } } catch {} }; void refreshNotes(); return () => { alive = false; }; }, [reader, readerBook, workspaceId]);
  useEffect(() => { if (!reader || !readerBook) return; let active = true; const tick = async () => { const now = Date.now(); if (lastTick.current && active && document.visibilityState === "visible" && document.hasFocus()) { const delta = Math.min(15, Math.max(0, Math.floor((now - lastTick.current) / 1000))); if (delta > 0) { const sendId=crypto.randomUUID(); const body={workspaceId,sendId,events:[{bookId:readerBook.id,deltaSeconds:delta,position:positionRef.current,pagesRead:null,clientUpdatedAt:new Date().toISOString(),deviceId:deviceId()}]}; try { if(offlineToken){const offlineStorageModule=await importPublicModule('/books-offline-storage.mjs') as OfflineModule;const store=await offlineStorageModule.booksOfflineStorage();try{await store.cache.enqueue(offlineToken,{kind:'progress',sendId,queuedAt:Date.now(),body});await store.cache.saveBook(offlineToken,{...readerBook,localPosition:positionRef.current,localDeviceId:deviceId()});if('serviceWorker' in navigator&&'SyncManager' in window){const registration=await navigator.serviceWorker.ready as ServiceWorkerRegistration&{sync?:{register:(tag:string)=>Promise<void>}};await registration.sync?.register('atlas-books-sync');}}finally{store.close();}} const response=await fetch(`${API}/progress`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); if(response.ok&&offlineToken){const offlineStorageModule=await importPublicModule('/books-offline-storage.mjs') as {booksOfflineStorage:()=>Promise<{cache:{acknowledge:(t:unknown,id:string)=>Promise<void>};close:()=>void}>};const store=await offlineStorageModule.booksOfflineStorage();try{await store.cache.acknowledge(offlineToken,sendId);}finally{store.close();}} } catch {} } } lastTick.current = now; };
    lastTick.current = Date.now(); const timer = window.setInterval(() => void tick(), 15000); return () => { active = false; window.clearInterval(timer); };
  }, [reader, readerBook, workspaceId, offlineToken]);
  const saveNote = async (kind: "note" | "highlight" | "bookmark", content = noteText) => { if (!readerBook || !content.trim()) return; const range = selectedRange.current; const anchorCfi = range && reader ? reader.getCFI(range.index, range.range) : null; const sendId=crypto.randomUUID(); const body={workspaceId,bookId:readerBook.id,sendId,kind,body:content.trim(),position:positionRef.current,color:"yellow",anchorCfi}; try { if(offlineToken){const offlineStorageModule=await importPublicModule('/books-offline-storage.mjs') as OfflineModule;const store=await offlineStorageModule.booksOfflineStorage();try{await store.cache.enqueue(offlineToken,{kind:'annotation',sendId,queuedAt:Date.now(),body:editingNote?{...body,id:editingNote}:body});if('serviceWorker' in navigator&&'SyncManager' in window){const registration=await navigator.serviceWorker.ready as ServiceWorkerRegistration&{sync?:{register:(tag:string)=>Promise<void>}};await registration.sync?.register('atlas-books-sync');}}finally{store.close();}} const response=await fetch(`${API}/notes`,{method:editingNote?'PATCH':'POST',headers:{"Content-Type":"application/json"},body:JSON.stringify(editingNote?{...body,id:editingNote}:body)}); if(!response.ok)throw new Error('BOOK_NOTE_UNAVAILABLE'); if(offlineToken){const offlineStorageModule=await importPublicModule('/books-offline-storage.mjs') as OfflineModule;const store=await offlineStorageModule.booksOfflineStorage();try{await store.cache.acknowledge(offlineToken,sendId);}finally{store.close();}} if (kind === "highlight" && anchorCfi) { try { await reader?.addAnnotation({ value: anchorCfi, color: "yellow", note: content.trim() }); } catch {} } setNoteText(""); setSelectedText(""); setEditingNote(null); selectedRange.current = null; const list = await safeJson<{ notes: typeof notes }>(await fetch(`${API}/notes?workspaceId=${encodeURIComponent(workspaceId)}&bookId=${readerBook.id}`, { cache: "no-store" })); sameSet(setNotes, list.notes); } catch { setMessage('Note mise en attente de synchronisation.'); setNoteText(''); setSelectedText(''); setEditingNote(null); selectedRange.current=null; } };

  const deleteNote = async (note:{id:string}) => { if(!readerBook)return;const sendId=crypto.randomUUID(),body={workspaceId,bookId:readerBook.id,id:note.id,sendId};try{if(offlineToken){const offlineStorageModule=await importPublicModule('/books-offline-storage.mjs') as OfflineModule;const store=await offlineStorageModule.booksOfflineStorage();try{await store.cache.enqueue(offlineToken,{kind:'annotation_delete',sendId,queuedAt:Date.now(),body});}finally{store.close();}}const response=await fetch(`${API}/notes`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error('BOOK_NOTE_DELETE_UNAVAILABLE');if(offlineToken){const offlineStorageModule=await importPublicModule('/books-offline-storage.mjs') as OfflineModule;const store=await offlineStorageModule.booksOfflineStorage();try{await store.cache.acknowledge(offlineToken,sendId);}finally{store.close();}}const result=await safeJson<{notes:typeof notes}>(await fetch(`${API}/notes?workspaceId=${encodeURIComponent(workspaceId)}&bookId=${readerBook.id}`,{cache:'no-store'}));sameSet(setNotes,result.notes);}catch{setMessage('Suppression mise en attente de synchronisation.');} };
  const saveGoal = async (event:React.FormEvent<HTMLFormElement>) => {event.preventDefault();const value=Number(goalDraft);if(!Number.isInteger(value)||value<5||value>360){setMessage('Choisissez un objectif entre 5 et 360 minutes.');return;}const response=await fetch(`${API}/summary`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId,goalMinutes:value})});if(!response.ok){setMessage('Impossible d’enregistrer l’objectif.');return;}await refresh();};
  if (readerId) return <main className={`atlas-book-reader is-${theme}`}>
    <header className="atlas-book-reader-top"><Link href={`/lecture?workspaceId=${encodeURIComponent(workspaceId)}`} onClick={() => { setReaderUrl(""); setReader(null); setReaderBook(null); }}>← Bibliothèque</Link><strong>{readerBook?.title ?? "Lecture"}</strong><div><button type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>Réglages</button></div></header>
    {settingsOpen && <section className="atlas-book-settings" aria-label="Réglages de lecture"><label>Taille <input type="range" min="14" max="28" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} /></label><label>Police <select value={font} onChange={e => setFont(e.target.value)}><option value="Georgia, serif">Serif</option><option value="Arial, sans-serif">Sans</option><option value="monospace">Mono</option></select></label><label>Thème <select value={theme} onChange={e => setTheme(e.target.value)}><option value="light">Clair</option><option value="sepia">Sépia</option><option value="night">Nuit</option></select></label></section>}
    <div className="atlas-book-reader-layout"><div className="atlas-book-reader-pages"><div className="atlas-book-reader-controls"><button type="button" onClick={() => void reader?.prev()} aria-label="Page précédente">‹</button><button type="button" onClick={() => void reader?.next()} aria-label="Page suivante">›</button></div><div ref={readerHost} className="atlas-book-reader-host"/><input aria-label="Progression de lecture" type="range" min="0" max="100" value={Math.round(readerProgress * 100)} readOnly className="atlas-book-progress" /></div>
      <aside className="atlas-book-notes">
        <h2>Notes, surlignages &amp; signets</h2>
        {readerBook && <a href={`${API}/notes/export?workspaceId=${encodeURIComponent(workspaceId)}&bookId=${readerBook.id}`}>Exporter en Markdown</a>}
        {selectedText && <p className="atlas-book-selected">« {selectedText.slice(0, 260)} »</p>}
        <textarea value={noteText} onChange={event => setNoteText(event.target.value)} placeholder="Ajouter une note…" aria-label="Nouvelle note" />
        <div className="atlas-book-note-actions">
          <button type="button" onClick={() => void saveNote("note")}>{editingNote ? "Enregistrer la note" : "Ajouter une note"}</button>
          <button type="button" disabled={!selectedText} onClick={() => void saveNote("highlight", selectedText)}>Surligner</button>
          <button type="button" onClick={() => { const content=`Signet · ${Math.round(positionRef.current * 100)} %`; setNoteText(content); void saveNote("bookmark", content); }}>Ajouter un signet</button>
        </div>
        <ul>{notes.filter(note => !note.deleted_at).map(note => <li key={note.id} className={note.kind === "highlight" ? "is-highlight" : ""}>
          <small>{Math.round(note.position * 100)} % · {note.kind === "highlight" ? "Surlignage" : note.kind === "bookmark" ? "Signet" : "Note"}</small><p>{note.body}</p>
          <button type="button" onClick={() => { setEditingNote(note.id); setNoteText(note.body); }}>Modifier</button>
          <button type="button" onClick={() => void deleteNote(note)}>Supprimer</button>
        </li>)}</ul>
      </aside></div>
    {readerError && <p role="alert">{readerError === "AUTH_REQUIRED" ? <a href={`/login?next=${encodeURIComponent(`/lecture/${readerId}`)}`}>Connectez-vous pour ouvrir ce livre.</a> : readerError}</p>}
  </main>;

  const today = summary ? Math.round(summary.todaySeconds / 60) : 0; const goal = summary?.goalMinutes??(summary ? Math.round(summary.goalSeconds / 60) : 30); const heatmapDays=Object.entries(summary?.dailySeconds??{});
  return <main className="atlas-books-page"><header className="atlas-books-heading"><div><p className="atlas-books-eyebrow">ATLAS · TEMPS POUR LIRE</p><h1>Bibliothèque</h1><p>Reprenez le fil, à votre rythme.</p></div><div className="atlas-books-daily"><strong>{today}/{goal} min</strong><span>aujourd’hui</span><div><i style={{ width: `${Math.min(100, Math.round(today / Math.max(1, goal) * 100))}%` }}/></div></div></header>
    <section className="atlas-books-stats" aria-label="Statistiques de lecture"><div><strong>{summary?.streakDays??0}</strong><span>jours de série</span></div><div><strong>{summary?.pagesPerHour??0}</strong><span>pages / heure</span></div><div><strong>{summary?.finishedBooks??0}</strong><span>livres terminés</span></div><form onSubmit={saveGoal}><label htmlFor="daily-reading-goal">Objectif quotidien</label><input id="daily-reading-goal" type="number" min="5" max="360" value={goalDraft} onChange={e=>setGoalDraft(e.target.value)}/><span>min / jour</span><button type="submit">Enregistrer</button></form></section>
    <section className="atlas-books-heatmap" aria-label="Temps de lecture sur un an">{heatmapDays.map(([day,seconds])=><span key={day} title={`${day} · ${Math.round(seconds/60)} min`} style={{opacity:seconds?Math.min(.95,.2+seconds/3600):.12}}/>)}</section>
    {message && <p role={message === "AUTH_REQUIRED" ? "alert" : "status"} className="atlas-books-message">{message === "AUTH_REQUIRED" ? <a href="/login?next=%2Flecture">Connectez-vous pour ouvrir votre bibliothèque.</a> : message}</p>}
    <form className="atlas-books-add" onSubmit={addBook}><div><label htmlFor="book-file">Ajouter un livre</label><input id="book-file" ref={fileInput} type="file" accept=".epub,.pdf,application/epub+zip,application/pdf" onChange={e => { const file = e.target.files?.[0] ?? null; setNewFile(file); if (file && !title) setTitle(file.name.replace(/\.(epub|pdf)$/i, "")); }} required /></div><input aria-label="Titre" placeholder="Titre" value={title} onChange={e => setTitle(e.target.value)} maxLength={300}/><input aria-label="Auteur" placeholder="Auteur (facultatif)" value={author} onChange={e => setAuthor(e.target.value)} maxLength={300}/><div><label htmlFor="book-cover">Photo de couverture (facultatif)</label><input id="book-cover" ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setNewCover(e.target.files?.[0] ?? null)} /></div><button type="submit" disabled={busy || !newFile}>{busy ? "Ajout…" : "Ajouter le livre"}</button></form>
    <nav className="atlas-books-filters" aria-label="Filtrer les livres">{["Tous", "À lire", "En cours", "Terminé"].map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</nav>
    {books.some(book => coverValue(book) > 0 && coverValue(book) < .98) && <section className="atlas-books-section"><div className="atlas-books-section-title"><div><span>VOTRE LECTURE</span><h2>En cours</h2></div></div><div className="atlas-books-grid">{books.filter(book => coverValue(book) > 0 && coverValue(book) < .98).map(book => <BookCard key={`${book.id}:${book.cover_thumb_path ?? "none"}`} book={book} cover={covers[book.id]} workspaceId={workspaceId} onRead={openReader} onPhoto={savePhoto} onRegenerate={regenerate} onRemove={removeCover} busy={busy} offlineReady={offlineIds.includes(book.id)} onOffline={makeOffline} onRemoveOffline={removeOffline} />)}</div></section>}
    <section className="atlas-books-section"><div className="atlas-books-section-title"><div><span>À DÉCOUVRIR OU REPRENDRE</span><h2>{filter}</h2></div><small>{visibleBooks.length} livre{visibleBooks.length === 1 ? "" : "s"}</small></div>{visibleBooks.length ? <div className="atlas-books-grid">{visibleBooks.map(book => <BookCard key={`${book.id}:${book.cover_thumb_path ?? "none"}`} book={book} cover={covers[book.id]} workspaceId={workspaceId} onRead={openReader} onPhoto={savePhoto} onRegenerate={regenerate} onRemove={removeCover} busy={busy} offlineReady={offlineIds.includes(book.id)} onOffline={makeOffline} onRemoveOffline={removeOffline} />)}</div> : <div className="atlas-books-empty"><span>✳</span><h2>Votre prochaine page commence ici</h2><p>Ajoutez un EPUB ou un PDF pour le retrouver dans votre bibliothèque.</p></div>}</section>
  </main>;
}

function BookCard({ book, cover, workspaceId, onRead, onPhoto, onRegenerate, onRemove, busy, offlineReady, onOffline, onRemoveOffline }: { book: Book; cover?: CoverUrls; workspaceId: string; onRead: (book: Book) => void; onPhoto: (book: Book, file: File) => void; onRegenerate: (book: Book) => void; onRemove: (book: Book) => void; busy: boolean; offlineReady:boolean; onOffline:(book:Book)=>void; onRemoveOffline:(book:Book)=>void }) {
  const progress = coverValue(book); const file = useRef<HTMLInputElement>(null); const [coverOffline, setCoverOffline] = useState(false); const [thumbSrc, setThumbSrc] = useState<string | null>(cover?.thumbUrl ?? null);
  useEffect(() => {
    let alive = true; let objectUrl: string | null = null;
    const coverPath = book.cover_thumb_path;
    if (!coverPath) return;
    const key = `atlas.books.cover.${workspaceId}.${book.id}.${coverPath}`;
    const db = () => new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("atlas-books-covers", 1); request.onupgradeneeded = () => request.result.createObjectStore("thumbs"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const cache = async () => {
      try {
        if (!cover?.thumbUrl) throw new Error("OFFLINE");
        const response = await fetch(cover.thumbUrl, { cache: "force-cache" }); if (!response.ok) throw new Error("COVER_UNAVAILABLE");
        const blob = await response.blob(); const database = await db();
        await new Promise<void>((resolve, reject) => { const tx = database.transaction("thumbs", "readwrite"); tx.objectStore("thumbs").put(blob, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
        if (alive) { setThumbSrc(cover.thumbUrl); setCoverOffline(false); }
      } catch {
        try { const database = await db(); const blob = await new Promise<Blob | undefined>((resolve, reject) => { const request = database.transaction("thumbs").objectStore("thumbs").get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
          if (alive && blob) { objectUrl = URL.createObjectURL(blob); setThumbSrc(objectUrl); setCoverOffline(true); }
        } catch { if (alive) { setThumbSrc(null); setCoverOffline(false); } }
      }
    };
    void cache(); return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [cover?.thumbUrl, workspaceId, book.id, book.cover_thumb_path]);
  const fallback = PALETTES[(book.title.split("").reduce((n, c) => n + c.charCodeAt(0), 0)) % PALETTES.length];
  const imageSrc = book.cover_thumb_path ? thumbSrc : null;
  return <article className="atlas-book-card"><button type="button" className="atlas-book-card-main" onClick={() => onRead(book)} aria-label={`Ouvrir ${book.title}`}><div className="atlas-book-cover" style={{ background: `linear-gradient(145deg, ${fallback[0]}, ${fallback[1]})` }}>{imageSrc && <img src={imageSrc} alt="" loading="lazy" decoding="async" onError={() => setThumbSrc(null)} />}{!imageSrc && <span><b>{book.title}</b><small>{book.author || "ATLAS · LECTURE"}</small></span>}</div><div className="atlas-book-info"><span className="atlas-book-format">{book.format.toUpperCase()} <i>{offlineReady?"téléchargé":"en ligne"}</i></span><h3>{book.title}</h3><p>{book.author || "Auteur non renseigné"}</p><div className="atlas-book-card-progress"><span><i style={{ width: `${Math.round(progress * 100)}%` }}/></span><small>{Math.round(progress * 100)} %</small></div><strong>{progress >= .98 ? "Relire" : progress > 0 ? `Reprendre à ${Math.round(progress * 100)} %` : "Commencer la lecture"}</strong></div></button><div className="atlas-book-card-tools"><button type="button" disabled={busy} onClick={() => offlineReady?onRemoveOffline(book):onOffline(book)}>{offlineReady?"Retirer du hors ligne":"Disponible hors ligne"}</button><button type="button" onClick={() => file.current?.click()} aria-label={`Choisir une photo pour ${book.title}`}>Photo</button><button type="button" disabled={busy} onClick={() => onRegenerate(book)}>Régénérer</button><button type="button" disabled={busy} onClick={() => onRemove(book)}>Retirer</button><input ref={file} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const selected = e.target.files?.[0]; if (selected) onPhoto(book, selected); e.target.value = ""; }} /></div></article>;
}
