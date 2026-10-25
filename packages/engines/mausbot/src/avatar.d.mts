import type { MausbotConfig } from "./adapter.mjs";
export declare const MAUSBOT_AVATAR_LIMIT: number;
export declare function storedMausbotAvatarPath(value: unknown): string | null;
export declare function mausbotAvatarAvailable(bot: {avatarUrl?: unknown; avatarCrop?: unknown} | null | undefined): boolean;
export declare function detectMausbotImageMime(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null;
export declare function fetchMausbotAvatar(config: MausbotConfig, path: unknown, fetchImpl?: typeof fetch): Promise<{bytes: Uint8Array; mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp"}>;
