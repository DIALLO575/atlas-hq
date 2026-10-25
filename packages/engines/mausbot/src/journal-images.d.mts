import type { JournalItem } from "./journal.mjs";
export class JournalFetchError extends Error { code: string }
export type ImageProvider = { name: string; generate(input: { title: string; category: string; summary: string }): Promise<{ url: string } | null> };
export type FetchDeps = { fetchImpl?: typeof fetch; lookup?: (host: string, opts: object) => Promise<{ address: string }[]>; timeoutMs?: number; maxBytes?: number; maxImageBytes?: number };
export type Cover = { url: string | null; generated: boolean; origin: "provided" | "og" | "generated" | "placeholder" };
export function isPrivateAddress(address: string): boolean;
export function assertPublicUrl(raw: unknown, deps?: FetchDeps): Promise<URL>;
export function safeFetch(raw: string, deps?: FetchDeps & { accept?: string; maxRedirects?: number }): Promise<{ response: Response; url: string; body: Uint8Array }>;
export function extractOgImage(html: string, baseUrl: string): string | null;
export function verifyImage(url: string, deps?: FetchDeps): Promise<{ url: string; contentType: string }>;
export const stubImageProvider: ImageProvider;
export function resolveCover(item: Pick<JournalItem, "imageUrl" | "sourceUrl" | "title" | "category" | "summary">, deps?: FetchDeps & { provider?: ImageProvider }): Promise<Cover>;
