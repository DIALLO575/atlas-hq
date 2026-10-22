import {
  assertCanUseConnection,
  ConnectorError,
  payloadHash,
  type ConnectorAdapter,
  type ConnectorConnection,
  type IdempotencyStore,
  type IssueCreateInput,
  type NormalizedResource,
  type Page,
  type PreparedCommand,
  type ProviderReceipt,
  type ServerSecretResolver,
} from "./contracts.ts";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  updated_at: string;
  repository_url: string;
}

interface GitHubSearchResponse {
  items: GitHubIssue[];
}

function mapIssue(connectionId: string, issue: GitHubIssue, observedAt: string): NormalizedResource {
  return {
    connectionId,
    provider: "github",
    objectType: "issue",
    providerObjectId: String(issue.number),
    title: issue.title,
    summary: issue.body ?? undefined,
    canonicalUrl: issue.html_url,
    sourceUpdatedAt: issue.updated_at,
    observedAt,
    providerData: { repositoryUrl: issue.repository_url },
  };
}

export class GitHubConnector implements ConnectorAdapter {
  readonly provider = "github" as const;
  private readonly secrets: ServerSecretResolver;
  private readonly fetcher: FetchLike;
  private readonly now: () => Date;

  constructor(
    secrets: ServerSecretResolver,
    fetcher: FetchLike = fetch,
    now: () => Date = () => new Date(),
  ) {
    this.secrets = secrets;
    this.fetcher = fetcher;
    this.now = now;
  }

  describe(connection: ConnectorConnection) {
    return ["issues.search", "issues.read", "issues.create"].map((id) => ({
      id,
      state: "unknown" as const,
      evidence: "not_verified" as const,
      requiredScopes: id === "issues.create" ? ["Issues: write"] : ["Issues: read"],
      reason: connection.state === "connected" && connection.secretRef
        ? "Live repository permission check has not been implemented."
        : "GitHub App/OAuth authorization has not been checked by ATLAS HQ.",
    }));
  }

  async health(connection: ConnectorConnection) {
    assertCanUseConnection(connection, this.provider);
    const response = await this.request(connection, "/user");
    if (!response.ok) throw await this.toError(response);
    return { state: "connected" as const, checkedAt: this.now().toISOString() };
  }

  async searchIssues(connection: ConnectorConnection, query: string, cursor?: string): Promise<Page<NormalizedResource>> {
    assertCanUseConnection(connection, this.provider);
    const params = new URLSearchParams({ q: `${query} repo:${connection.accountLabel}`, per_page: "50" });
    if (cursor) params.set("page", cursor);
    const response = await this.request(connection, `/search/issues?${params}`);
    if (!response.ok) throw await this.toError(response);
    const result = await response.json() as GitHubSearchResponse;
    const observedAt = this.now().toISOString();
    return {
      items: result.items.map((issue) => mapIssue(connection.id, issue, observedAt)),
      nextCursor: result.items.length === 50 ? String(Number(cursor ?? "1") + 1) : undefined,
    };
  }

  async getIssue(connection: ConnectorConnection, providerObjectId: string): Promise<NormalizedResource> {
    assertCanUseConnection(connection, this.provider);
    const response = await this.request(connection, `/repos/${connection.accountLabel}/issues/${encodeURIComponent(providerObjectId)}`);
    if (!response.ok) throw await this.toError(response);
    return mapIssue(connection.id, await response.json() as GitHubIssue, this.now().toISOString());
  }

  prepareCreateIssue(connection: ConnectorConnection, input: IssueCreateInput): PreparedCommand<IssueCreateInput> {
    assertCanUseConnection(connection, this.provider);
    const normalized = { title: input.title.trim(), body: input.body?.trim(), labels: [...(input.labels ?? [])].sort() };
    if (!normalized.title || normalized.title.length > 256) {
      throw new ConnectorError("VALIDATION_FAILED", "GitHub issue title must contain 1 to 256 characters");
    }
    return {
      connectionId: connection.id,
      operation: "issues.create",
      input: normalized,
      payloadHash: payloadHash({ provider: "github", repository: connection.accountLabel, ...normalized }),
      requiredScopes: ["Issues: write"],
      approvalRequired: true,
      preparedAt: this.now().toISOString(),
    };
  }

  async executeCreateIssue(
    connection: ConnectorConnection,
    command: PreparedCommand<IssueCreateInput>,
    approvedPayloadHash: string,
    idempotencyKey: string,
    store: IdempotencyStore,
  ): Promise<ProviderReceipt> {
    assertCanUseConnection(connection, this.provider);
    const actualPayloadHash = payloadHash({ provider: "github", repository: connection.accountLabel, ...command.input });
    if (command.connectionId !== connection.id || command.operation !== "issues.create" || command.payloadHash !== approvedPayloadHash || command.payloadHash !== actualPayloadHash) {
      throw new ConnectorError("VALIDATION_FAILED", "Approval does not match this connection and command preview");
    }
    for (const scope of command.requiredScopes) {
      if (!connection.grantedScopes.includes(scope)) throw new ConnectorError("PERMISSION_DENIED", `Missing required scope: ${scope}`);
    }
    const reservation = await store.reserve(idempotencyKey, command.payloadHash);
    if (reservation.state === "completed") return reservation.receipt;
    if (reservation.state === "conflict") throw new ConnectorError("CONFLICT", "Idempotency key was already used for a different command");
    if (reservation.state === "in_progress" || reservation.state === "unknown_outcome") {
      throw new ConnectorError("TIMEOUT_UNKNOWN_OUTCOME", `Command is ${reservation.state}; reconcile with GitHub before retrying`);
    }

    try {
      const response = await this.request(connection, `/repos/${connection.accountLabel}/issues`, {
        method: "POST",
        body: JSON.stringify(command.input),
      });
      if (!response.ok) throw await this.toError(response);
      const issue = await response.json() as GitHubIssue;
      const receipt = { providerObjectId: String(issue.number), canonicalUrl: issue.html_url, acceptedAt: this.now().toISOString() };
      await store.complete(idempotencyKey, receipt);
      return receipt;
    } catch (error) {
      if (error instanceof ConnectorError && error.code !== "TIMEOUT_UNKNOWN_OUTCOME" && error.code !== "PROVIDER_UNAVAILABLE") throw error;
      await store.markUnknown(idempotencyKey, error instanceof Error ? error.message : "Unknown network outcome");
      throw new ConnectorError("TIMEOUT_UNKNOWN_OUTCOME", "GitHub write outcome is unknown; verify by reading the issue before retrying");
    }
  }

  private async request(connection: ConnectorConnection, path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.secrets.resolve({ ownerId: connection.ownerId, connectionId: connection.id, secretRef: connection.secretRef! });
    try {
      return await this.fetcher(`https://api.github.com${path}`, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          ...init.headers,
        },
      });
    } catch {
      throw new ConnectorError("TIMEOUT_UNKNOWN_OUTCOME", "GitHub request did not return a response");
    }
  }

  private async toError(response: Response): Promise<ConnectorError> {
    if (response.status === 401) return new ConnectorError("AUTH_REQUIRED", "GitHub authorization must be renewed");
    if (response.status === 429 || response.status === 403 && response.headers.has("retry-after")) {
      return new ConnectorError("RATE_LIMITED", "GitHub rate limit reached", Number(response.headers.get("retry-after") ?? 0));
    }
    if (response.status === 403) return new ConnectorError("PERMISSION_DENIED", "GitHub denied the requested permission");
    if (response.status === 404) return new ConnectorError("NOT_FOUND_OR_HIDDEN", "GitHub resource was not found or is not visible");
    if (response.status >= 500) return new ConnectorError("PROVIDER_UNAVAILABLE", "GitHub is temporarily unavailable");
    return new ConnectorError("VALIDATION_FAILED", `GitHub rejected the request (${response.status})`);
  }
}
