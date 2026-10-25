/** Only the audited ATLAS owner route may act on a true result. */
export declare function mausbotOwnerControlPermission(
  env: Record<string, string | undefined>,
  scope?: { role?: string; workspaceId?: unknown; mode?: string },
): { allowed: boolean; status: number; code?: string };
