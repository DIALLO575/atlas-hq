const githubApiOrigin = "https://api.github.com";

/** Return only GitHub API's next link. The response header is data, so reject off-origin URLs. */
export function getNextPageUrl(linkHeader) {
  if (typeof linkHeader !== "string") return null;
  for (const match of linkHeader.matchAll(/<([^>]+)>\s*([^<]*)/g)) {
    const [, href, parameters] = match;
    const rel = parameters.match(/(?:^|;)\s*rel="?([^";,\s]+)"?/i)?.[1];
    if (rel !== "next") continue;
    try {
      const url = new URL(href);
      if (url.origin !== githubApiOrigin || url.username || url.password) return null;
      return url.toString();
    } catch {
      return null;
    }
  }
  return null;
}

/** Enforce the documented endpoint cap and surface when additional results exist. */
export function capPaginatedItems(items, maximum, hasNextPage) {
  if (!Array.isArray(items) || !Number.isSafeInteger(maximum) || maximum < 0 || typeof hasNextPage !== "boolean") {
    throw new TypeError("Expected an item array, non-negative integer cap, and boolean hasNextPage");
  }
  return {
    items: items.slice(0, maximum),
    truncated: items.length > maximum || (items.length >= maximum && hasNextPage),
  };
}
