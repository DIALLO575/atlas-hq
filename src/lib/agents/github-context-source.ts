import type { ConnectorConnection } from "../connectors/contracts.ts";
import { GitHubConnector } from "../connectors/github.ts";
import { AgentLayerError, type PullRequestContextSource, type ResourceRef } from "./contracts.ts";

export interface AgentConnectionStore {
  getConnection(input: { ownerId: string; connectionId: string }): Promise<ConnectorConnection | undefined>;
}

export class GitHubContextSource implements PullRequestContextSource {
  private readonly connections: AgentConnectionStore;
  private readonly github: GitHubConnector;

  constructor(connections: AgentConnectionStore, github: GitHubConnector) {
    this.connections = connections;
    this.github = github;
  }

  async getPullRequest(input: { ownerId: string; resource: ResourceRef }) {
    const connectionId = input.resource.connectionId;
    if (!connectionId || input.resource.provider !== "github" || input.resource.objectType !== "pull_request") {
      throw new AgentLayerError("INVALID_REQUEST", "A GitHub pull request connection is required");
    }
    const connection = await this.connections.getConnection({ ownerId: input.ownerId, connectionId });
    if (!connection || connection.provider !== "github") throw new AgentLayerError("CONTEXT_NOT_FOUND", "GitHub connection was not found for this owner");
    return this.github.getPullRequestContext(connection, input.resource.objectId);
  }
}
