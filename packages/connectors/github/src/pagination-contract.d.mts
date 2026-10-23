export function getNextPageUrl(linkHeader: unknown): string | null;
export function capPaginatedItems<T>(items: readonly T[], maximum: number, hasNextPage: boolean): { items: T[]; truncated: boolean };
