export type ReaderBookFile = { id: string; format: "epub" | "pdf" };
export function loadBookReaderFile(args: {
  book: ReaderBookFile;
  workspaceId: string;
  offlineFile?: Blob | null;
  fetchImpl?: typeof fetch;
}): Promise<File>;
