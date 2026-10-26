// Reading order is explicit and timezone independent. Edition timestamps are UTC instants.
export function editionTimestamp(edition) {
  const generated = Date.parse(edition?.generatedAt ?? edition?.generated_at ?? "");
  if (Number.isFinite(generated)) return generated;
  const received = Date.parse(edition?.receivedAt ?? edition?.received_at ?? "");
  return Number.isFinite(received) ? received : 0;
}

export function rankEditions(editions) {
  return editions.slice().sort((a, b) => editionTimestamp(b) - editionTimestamp(a));
}

function readingBucket(item) {
  if (item?.state === "new") return 0;
  if (item?.state === "read" && Number(item.lastPosition) > 0) return 1;
  if (item?.state === "done") return 3;
  return 2;
}

/** Non-read first, then started reading, then other read items, and completed items last. */
export function rankItems(items, editions = []) {
  const dates = new Map(editions.map(edition => [edition.editionId ?? edition.edition_id, editionTimestamp(edition)]));
  return items.map((item, index) => ({ item, index })).sort((a, b) => {
    const bucket = readingBucket(a.item) - readingBucket(b.item);
    if (bucket) return bucket;
    const edition = (dates.get(b.item.editionId) ?? 0) - (dates.get(a.item.editionId) ?? 0);
    if (edition) return edition;
    const positionA = Number.isFinite(a.item.position) ? a.item.position : a.index;
    const positionB = Number.isFinite(b.item.position) ? b.item.position : b.index;
    return positionA - positionB || a.index - b.index;
  }).map(({ item }) => item);
}
