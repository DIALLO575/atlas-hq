// Extension point only. Preserve editorial ordering; no scoring or recommendations.
export function rankItems(items) { return items.slice(); }
