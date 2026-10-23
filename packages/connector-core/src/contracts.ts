/** Shared, provider-neutral vocabulary for read-only connector contracts. */
export type ConnectorCapability =
  | "repositories.list"
  | "pull_requests.read"
  | "pull_requests.files.read"
  | "pull_requests.commits.read";

export type ConnectorPermission = {
  scope: "repository" | "organization" | "account";
  name: string;
  access: "read" | "write" | "admin";
  required: boolean;
  reason: string;
};

export type ResourceRef = {
  provider: string;
  installationId: number;
  repositoryId: number;
  owner: string;
  repository: string;
  pullRequestNumber: number;
  headSha: string;
};

export type ConnectorEvent<TPayload = unknown> = {
  provider: string;
  event: string;
  action: string | null;
  deliveryId: string;
  resource: ResourceRef | null;
  payload: TPayload;
};

export type RestApiPolicy = {
  apiVersion: string;
  accept: "application/vnd.github+json";
  pagination: "follow-link-header";
  maxPageSize: number;
  retry: {
    methods: readonly ["GET", "HEAD"];
    maxAttempts: number;
    honorRetryAfter: true;
    honorPrimaryRateLimitReset: true;
    secondaryLimitMinimumWaitSeconds: number;
    exponentialBackoff: true;
  };
};

export type ReadOnlyConnectorContract = {
  provider: string;
  authentication: "github-app-installation-token";
  repositorySelection: "selected-repositories";
  capabilities: readonly ConnectorCapability[];
  permissions: readonly ConnectorPermission[];
  api: RestApiPolicy;
  writesEnabled: false;
};
