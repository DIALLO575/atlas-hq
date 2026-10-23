export type InstallationStateClaims = {
  tenantId: string;
  nonce: string;
  iat: number;
  exp: number;
};

export type SetupCallback =
  | {
      ok: true;
      tenantId: string;
      nonce: string;
      setupAction: "install" | "update";
      installationId: number;
      requestId: null;
      ownership: "unverified";
      grant: "none";
    }
  | {
      ok: true;
      tenantId: string;
      nonce: string;
      setupAction: "request";
      installationId: null;
      requestId: number | null;
      ownership: "unverified";
      grant: "none";
    }
  | { ok: false; reason: string };

export type AuthorizedRepository = {
  id: number;
  name: string;
  fullName: string;
  isPrivate: boolean;
  owner: { id: number; login: string };
};

export type RepositoryPageResult =
  | {
      ok: true;
      accepted: true;
      complete: boolean;
      repositorySelection: "selected";
      repositories: AuthorizedRepository[];
      totalCount: number;
      nextPageUrl?: string | null;
      reason: string | null;
    }
  | {
      ok: true;
      accepted: false;
      complete: false;
      repositorySelection: "all";
      repositories: AuthorizedRepository[];
      totalCount: number;
      nextPageUrl?: string | null;
      reason: "repository-selection-not-accepted";
    }
  | { ok: false; reason: string };

export function createInstallationState(input: {
  tenantId: string;
  key: string;
  now?: number;
  nonce?: Uint8Array;
  ttlSeconds?: number;
}): string;

export function readInstallationState(state: string, key: string, now?: number): InstallationStateClaims | null;

export function buildGitHubAppInstallUrl(input: { appSlug: string; state: string }): string;

export function parseGitHubAppSetupCallback(
  query: URL | URLSearchParams | string | Record<string, string | readonly string[] | null | undefined>,
  options: { key: string; now?: number },
): SetupCallback;

export function parseInstallationRepositoryPage(body: unknown, linkHeader?: string | null): RepositoryPageResult;

export function reduceInstallationRepositoryPages(
  pages: readonly { body: unknown; linkHeader?: string | null }[],
): RepositoryPageResult;

export type InstallationLedger = {
  record(callback: SetupCallback): { ok: boolean; reason?: string; status?: string; tenantId?: string; installationId?: number | null; requestId?: number | null };
  confirmOwnership(input: {
    tenantId: string;
    installationId: number;
    visibleInstallationIds: readonly number[];
  }): { ok: boolean; reason?: string; status?: string; tenantId?: string; installationId?: number };
  replaceAuthorizedRepositories(
    tenantId: string,
    installationId: number,
    pages: readonly { body: unknown; linkHeader?: string | null }[],
  ): { ok: boolean; reason?: string; status?: string; repositories?: AuthorizedRepository[] };
  listAuthorizedRepositories(tenantId: string): AuthorizedRepository[];
  snapshot(): { installations: unknown[]; requests: unknown[] };
};

export function createInstallationLedger(): InstallationLedger;
