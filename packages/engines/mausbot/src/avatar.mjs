/**
 * Authenticated MAUSBOT avatar bridge. Never trust browser-provided paths,
 * hosts, URLs, or content types. MAUSBOT avatarUrl is always a local, stored
 * raster image path; only exact images from the server allowlist are fetched.
 */
const AVATAR_PATH = /^\/api\/attachments\/[A-Za-z0-9-]{1,160}\.(?:png|jpg|gif|webp)$/;
export const MAUSBOT_AVATAR_LIMIT = 10 * 1024 * 1024;

export function storedMausbotAvatarPath(value) {
  return typeof value === "string" && AVATAR_PATH.test(value) ? value : null;
}

export function mausbotAvatarAvailable(bot) {
  return bot?.avatarCrop !== "mascot" && Boolean(storedMausbotAvatarPath(bot?.avatarUrl));
}

export function detectMausbotImageMime(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 &&
      bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 &&
      bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  const str = (start, value) => bytes.length >= start + value.length &&
    [...value].every((ch, idx) => bytes[start + idx] === ch.charCodeAt(0));
  if (str(0, "GIF87a") || str(0, "GIF89a")) return "image/gif";
  if (str(0, "RIFF") && str(8, "WEBP")) return "image/webp";
  return null;
}

export async function fetchMausbotAvatar(config, rawPath, fetchImpl = fetch) {
  const path = storedMausbotAvatarPath(rawPath);
  if (!path) throw new Error("MAUSBOT_AVATAR_PATH_INVALID");
  let response;
  try {
    response = await fetchImpl(config.baseUrl + path, {
      method: "GET", cache: "no-store", redirect: "manual",
      headers: { Authorization: "Bearer " + config.token, Accept: "image/png,image/jpeg,image/webp,image/gif" },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("MAUSBOT_AVATAR_UPSTREAM_UNAVAILABLE");
  }
  if (!response.ok || response.redirected) throw new Error("MAUSBOT_AVATAR_UPSTREAM_UNAVAILABLE");
  const expectedType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!["image/png","image/jpeg","image/webp","image/gif"].includes(expectedType)) {
    await response.body?.cancel().catch(() => {});
    throw new Error("MAUSBOT_AVATAR_TYPE_INVALID");
  }
  const length = Number(response.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > MAUSBOT_AVATAR_LIMIT) {
    await response.body?.cancel().catch(() => {});
    throw new Error("MAUSBOT_AVATAR_SIZE_INVALID");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("MAUSBOT_AVATAR_EMPTY");
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAUSBOT_AVATAR_LIMIT) {
        await reader.cancel().catch(() => {});
        throw new Error("MAUSBOT_AVATAR_SIZE_INVALID");
      }
      chunks.push(chunk.value);
    }
  } catch {
    throw new Error("MAUSBOT_AVATAR_UPSTREAM_UNAVAILABLE");
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const detected = detectMausbotImageMime(bytes);
  if (!detected || detected !== expectedType) throw new Error("MAUSBOT_AVATAR_TYPE_INVALID");
  return { bytes, mime: detected };
}
