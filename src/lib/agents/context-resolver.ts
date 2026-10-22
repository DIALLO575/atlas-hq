import { createHash } from "node:crypto";
import { AgentLayerError, type ContextDossier, type PullRequestContextSource, type RelatedResourceStore, type ResourceAccessPolicy, type ResourceRef } from "./contracts.ts";

const MAX_RELATED_RESOURCES = 30;
const MAX_PATCH_CHARS_PER_FILE = 12_000;
const MAX_TOTAL_ATTACHMENT_CHARS = 40_000;

function freshness(sourceUpdatedAt: string | undefined, observedAt: string): "fresh" | "stale" | "unknown" {
  if (!sourceUpdatedAt) return "unknown";
  const sourceTime = Date.parse(sourceUpdatedAt);
  const readTime = Date.parse(observedAt);
  if (!Number.isFinite(sourceTime) || !Number.isFinite(readTime)) return "unknown";
  return readTime - sourceTime <= 15 * 60 * 1000 ? "fresh" : "stale";
}

export class ContextResolver {
  private readonly pullRequests: PullRequestContextSource;
  private readonly relations: RelatedResourceStore;
  private readonly access: ResourceAccessPolicy;
  private readonly now: () => Date;

  constructor(
    pullRequests: PullRequestContextSource,
    relations: RelatedResourceStore,
    access: ResourceAccessPolicy,
    now: () => Date = () => new Date(),
  ) {
    this.pullRequests = pullRequests;
    this.relations = relations;
    this.access = access;
    this.now = now;
  }

  async resolve(input: { ownerId: string; source: ResourceRef }): Promise<ContextDossier> {
    if (input.source.provider !== "github" || input.source.objectType !== "pull_request" || !input.source.connectionId) {
      throw new AgentLayerError("INVALID_REQUEST", "The initial context resolver accepts a GitHub pull request with a connection id");
    }
    if (!(await this.access.canRead({ ownerId: input.ownerId, resource: input.source }))) {
      throw new AgentLayerError("CONTEXT_FORBIDDEN", "The caller cannot read this pull request");
    }

    let pr: Awaited<ReturnType<PullRequestContextSource["getPullRequest"]>>;
    try {
      pr = await this.pullRequests.getPullRequest({ ownerId: input.ownerId, resource: input.source });
    } catch {
      throw new AgentLayerError("CONTEXT_UNAVAILABLE", "GitHub did not return the pull request context");
    }

    const related = await this.relations.listRelated({ ownerId: input.ownerId, resource: pr.resource });
    const allowedRelated = [];
    for (const resource of related.slice(0, MAX_RELATED_RESOURCES)) {
      const ref: ResourceRef = {
        provider: resource.provider,
        objectType: resource.objectType,
        objectId: resource.providerObjectId,
        connectionId: resource.connectionId,
        canonicalUrl: resource.canonicalUrl,
      };
      if (await this.access.canRead({ ownerId: input.ownerId, resource: ref })) allowedRelated.push({ resource, ref });
    }

    const observedAt = this.now().toISOString();
    const sourceFreshness = freshness(pr.sourceUpdatedAt, observedAt);
    const provenance = [{
      resource: pr.resource,
      canonicalUrl: pr.canonicalUrl,
      sourceUpdatedAt: pr.sourceUpdatedAt,
      observedAt: pr.observedAt,
      freshness: freshness(pr.sourceUpdatedAt, pr.observedAt),
      accessDecision: "allowed" as const,
    }];
    const attachments = [];
    let totalChars = 0;
    for (const file of pr.changedFiles) {
      if (!file.patch || totalChars >= MAX_TOTAL_ATTACHMENT_CHARS) continue;
      const content = file.patch.slice(0, Math.min(MAX_PATCH_CHARS_PER_FILE, MAX_TOTAL_ATTACHMENT_CHARS - totalChars));
      if (!content) continue;
      totalChars += content.length;
      attachments.push({
        kind: "text" as const,
        name: `diff:${file.path}`,
        mimeType: "text/x-diff",
        content,
        provenance: {
          resource: pr.resource,
          canonicalUrl: pr.canonicalUrl,
          sourceUpdatedAt: pr.sourceUpdatedAt,
          observedAt: pr.observedAt,
          freshness: sourceFreshness,
          accessDecision: "allowed" as const,
        },
      });
    }

    for (const { resource, ref } of allowedRelated) {
      provenance.push({
        resource: ref,
        canonicalUrl: resource.canonicalUrl,
        sourceUpdatedAt: resource.sourceUpdatedAt,
        observedAt: resource.observedAt,
        freshness: resource.freshness ?? "unknown",
        accessDecision: "allowed",
      });
      if (!this.relations.readAttachment) continue;
      const attachment = await this.relations.readAttachment({ ownerId: input.ownerId, resource });
      if (attachment && totalChars < MAX_TOTAL_ATTACHMENT_CHARS) {
        const content = attachment.content.slice(0, MAX_TOTAL_ATTACHMENT_CHARS - totalChars);
        totalChars += content.length;
        attachments.push({ ...attachment, content });
      }
    }

    const facts = [
      { label: "State", value: pr.state },
      ...(pr.author ? [{ label: "Author", value: pr.author }] : []),
      ...(pr.baseBranch ? [{ label: "Base branch", value: pr.baseBranch }] : []),
      ...(pr.headBranch ? [{ label: "Head branch", value: pr.headBranch }] : []),
      ...(pr.headSha ? [{ label: "Head SHA", value: pr.headSha }] : []),
      { label: "Changed files", value: String(pr.changedFiles.length) },
      ...pr.changedFiles.slice(0, 100).map((file) => ({ label: `File: ${file.path}`, value: `${file.status}; +${file.additions ?? 0}/-${file.deletions ?? 0}` })),
    ];
    const dossierHash = createHash("sha256").update(`${input.ownerId}:${pr.resource.connectionId}:${pr.resource.objectId}:${pr.headSha ?? pr.sourceUpdatedAt ?? "unknown"}`).digest("hex").slice(0, 24);
    return {
      dossierId: `ctx_${dossierHash}`,
      ownerId: input.ownerId,
      source: pr.resource,
      title: pr.title,
      summary: pr.body ?? "",
      facts,
      relatedResources: allowedRelated.map(({ resource }) => resource),
      attachments,
      provenance,
      createdAt: observedAt,
    };
  }
}
