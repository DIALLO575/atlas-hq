# GitHub connector MVP contract (SHA-112)

**Scope:** GitHub.com, GitHub App installation tokens, selected repositories, read-only PR ingestion. Reviewed against the official GitHub Docs on 2026-10-23. This is a contract, not an active integration: this change creates no app, credential, webhook endpoint, installation, or external API call.

The executable/type contract lives in `packages/connector-core/src/contracts.ts` and `packages/connectors/github/src/contract.ts`. The pure webhook-envelope parser is `packages/connectors/github/src/webhook-contract.mjs`; it is not a signature verifier or network client.

## Endpoint / permission / event / risk / test matrix

| Capability | Official REST endpoint | Minimum GitHub App permission | Consumed event(s) | Risk / limit | Offline test |
|---|---|---|---|---|---|
| Enumerate repositories already granted to an installation | `GET /installation/repositories` | Installation access token: no additional permission; repository metadata is implicitly read-only. The endpoint cannot add repositories. | `installation` (`created`, `deleted`, `suspend`, `unsuspend`); `installation_repositories` (`added`, `removed`) | Persist installation/repository numeric IDs. Treat revocation/removal as access loss. Use selected repositories only. | Static contract assertion; no GitHub call. |
| Read a PR and current head SHA | `GET /repos/{owner}/{repo}/pulls/{pull_number}` | Repository `Pull requests: read` | `pull_request` (`opened`, `reopened`, `synchronize`, `closed`) | Webhook delivery can be delayed/duplicated and PR state can move. Validate signature and delivery ID before processing; reread current PR before mission creation. A closed PR is state only, never a write request. | Fixture parses to stable `ResourceRef`; unsupported actions and malformed IDs/SHA are ignored. |
| Read changed files | `GET /repos/{owner}/{repo}/pulls/{pull_number}/files` | Repository `Pull requests: read` | `pull_request` (`opened`, `reopened`, `synchronize`) | Paginated, maximum 3,000 files. Report truncation/limit; do not claim a complete diff beyond the API limit. | Contract matrix asserts endpoint/permission/event and pagination policy. |
| Read PR commits | `GET /repos/{owner}/{repo}/pulls/{pull_number}/commits` | Repository `Pull requests: read` | `pull_request` (`opened`, `reopened`, `synchronize`) | The PR endpoint returns at most 250 commits; expose the cap. | Contract matrix asserts endpoint/permission/event and pagination policy. |

`Metadata: read` is implicitly granted by GitHub Apps. The installation repository listing endpoint specifically documents no additional permission for an installation token. No `Contents`, `Checks`, `Statuses`, `Issues`, organization, administration, or write permission is requested by this MVP: these capabilities are outside the listed endpoint set. Add a permission only with a documented endpoint, acceptance criterion, and test.

`installation_repositories` is delivered to GitHub Apps by default and cannot be manually subscribed to. Subscribe to `pull_request` only for the four actions above; other actions are acknowledged/ignored by the eventual receiver. `installation` lifecycle actions are tracked so access can be enabled/removed/suspended without broadening repository selection.

## Shared contract and resource identity

`ResourceRef` is `{ provider: "github", installationId, repositoryId, owner, repository, pullRequestNumber, headSha }`. The event snapshot also carries the status flags `state: "open" | "closed"`, `isDraft`, and `merged`. The immutable numeric GitHub IDs avoid relying on names alone; the SHA ties an @VISION mission/result to the analyzed revision. Mission reports are stored in ATLAS and link back to GitHub as the external source of truth. This MVP makes no GitHub write.

## REST behavior

- Pin `X-GitHub-Api-Version: 2026-03-10` and `Accept: application/vnd.github+json`; review the version against the REST API versioning page before changing it.
- Paginate via the response `Link` header, not by constructing cursors. Request `per_page=100` where the endpoint supports it. Preserve caps documented for files (3,000) and PR commits (250).
- Use ETag/`If-None-Match` where useful; `304` means unchanged.
- `401`: stop and surface invalid authorization. `403`: stop; distinguish denied permission from rate limit. `404`: do not disclose existence (GitHub can hide private resources). `422`: request/validation failure, do not retry unchanged. `429` or rate-limited `403`: honor `Retry-After`; if `x-ratelimit-remaining=0`, wait until `x-ratelimit-reset`; otherwise wait at least 60 seconds and back off exponentially. Retry only idempotent `GET`/`HEAD`, at most three attempts, then surface degraded/error state. Do not retry mutation methods (none exist in MVP).

## Explicit exclusions

- All GitHub writes: comments, reviews, labels, merges, branch operations, or installation changes.
- GitHub MCP as auth/execution path (V1/experimental follow-up), GraphQL until a measured need, checks/statuses, issues, content/blob reads, and broad account/org discovery.
- Frontend credentials or secrets. The installation private key and webhook secret, if introduced in a separately approved implementation, must remain server-side.

## Official references

Checked 2026-10-23; links below are GitHub's official documentation and the contract records the conclusions needed for repeatable review:

1. [Choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app) — choose minimum permissions; endpoint documentation defines exact requirements.
2. [REST API endpoints for installations](https://docs.github.com/en/rest/apps/installations) — list installation repositories, pagination, and installation-token permission requirements.
3. [REST API endpoints for pull requests](https://docs.github.com/en/rest/pulls/pulls) — PR/list files/list commits endpoints and permission requirements/caps.
4. [Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads) — event availability, actions and `installation_repositories` behavior.
5. [REST API versioning](https://docs.github.com/en/rest/about-the-rest-api/api-versions) — version header.
6. [Using pagination in the REST API](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api) — follow `Link` relations.
7. [Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) and [troubleshooting rate-limit errors](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api) — retry behavior and headers.

## Verification boundary

The local tests prove the shape of the contract and parser behavior against fixed, synthetic payloads without network access or credentials. They do **not** prove a GitHub App installation, webhook signature verification/delivery, permissions on an actual installation, or an end-to-end connector; those remain out of scope and unverified in SHA-112.
