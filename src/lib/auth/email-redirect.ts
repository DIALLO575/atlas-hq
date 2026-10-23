type HeaderSource = { get(name: string): string | null };

const ALLOWED_ORIGINS = new Set(["http://localhost:3000", "https://atlas-hq-preview.vercel.app"]);

// Fixed base so the URL parser reveals open redirects. The callback never sends the browser here.
const PATH_PARSE_BASE = "https://atlas-hq-preview.vercel.app/";

export function emailConfirmRedirect(origin: string): string | null {
  if (!ALLOWED_ORIGINS.has(origin)) return null;
  return `${origin}/auth/callback`;
}

export function requestOriginFrom(source: HeaderSource): string {
  const origin = source.get("origin")?.trim() ?? "";
  if (origin) return origin;
  const host = (source.get("x-forwarded-host") ?? source.get("host") ?? "").split(",")[0]?.trim() ?? "";
  const proto = (source.get("x-forwarded-proto") ?? "").split(",")[0]?.trim() ?? "";
  if (!host || !proto || host.includes("/") || proto.includes("/")) return "";
  return `${proto}://${host}`;
}

export function safeInternalPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || /[\u0000-\u0020\\]/.test(value)) return "/";
  let parsed: URL;
  try {
    parsed = new URL(value, PATH_PARSE_BASE);
  } catch {
    return "/";
  }
  if (parsed.origin !== "https://atlas-hq-preview.vercel.app") return "/";
  if (parsed.username || parsed.password) return "/";
  if (parsed.pathname === "/login" || parsed.pathname.startsWith("/login/")) return "/";
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
