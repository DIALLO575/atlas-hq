# GitHub App installation flow (SHA-113)

**Scope:** server-side installation link, signed `state`, setup callback, tenant binding, and selected-repository parsing for the GitHub.com App described by the SHA-112 contract. Checked against GitHub Docs on 2026-10-23. This change does not create a GitHub App, mint a key, store a secret, or call GitHub.

The behavior lives in `packages/connectors/github/src/installation-flow.mjs`. Permissions stay `metadata:read` and `pull_requests:read`. `writesEnabled` stays `false`. The data-plane authentication mode stays `github-app-installation-token`.

## Official behavior used

1. [Sharing your GitHub App](https://docs.github.com/en/apps/sharing-github-apps/sharing-your-github-app) — the install link is `https://github.com/apps/<app-slug>/installations/new`. A `state` query parameter is returned after the person installs, authenticates, or accepts an update, so the app can correlate that result with a user or account.
2. [About the setup URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url) — GitHub redirects to the setup URL with `installation_id`. GitHub warns that this value can be spoofed. Do not trust it. Generate a user access token for the person who installed the app and check that the installation is associated with that user. When Redirect on update is enabled, GitHub also redirects there after repository access is added or removed. The setup URL is not the OAuth callback URL.
3. [Installing a GitHub App from a third party](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party) — the person chooses **All repositories** or **Only select repositories**, then **Install**, **Install and request**, or **Request**.
4. [List repositories accessible to the app installation](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation) — `GET /installation/repositories` returns `total_count`, `repository_selection`, and `repositories`. It requires an installation access token. Tests below parse that shape; they do not send the request.
5. [List app installations accessible to the user access token](https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-user-access-token) — `GET /user/installations` is the check named by the setup-URL warning. `repository_selection` there is `all` or `selected`.

The current setup-URL page names `installation_id` and does not publish a table of `setup_action` values. This flow accepts only `install`, `update`, and `request`. `install` is the setup redirect. `update` is Redirect on update. `request` records an approval request and does not bind an installation. Any other value is rejected. A callback that omits `setup_action` is rejected. That closed set is unverified against a live GitHub redirect because no ATLAS GitHub App exists.

## Flow

1. The server creates an HMAC-SHA256 `state` over a JSON payload: version, purpose, tenant id, nonce, issued-at, and expiry. The default lifetime is 900 seconds. This is an ATLAS limit, not a GitHub limit. The payload is readable by the browser and by GitHub; the key is not in it.
2. The server returns only `https://github.com/apps/<slug>/installations/new?state=...`. The slug is the public app slug. The key never enters the URL.
3. The setup callback must echo that `state` once, with one `setup_action`. `install` and `update` also require one positive integer `installation_id`. The signature proves the tenant correlation only. `ownership` remains `unverified` and `grant` remains `none`.
4. The setup callback records a `pending-ownership-check` claim. While that claim is pending, the installation id is not an exclusive lock: another tenant's callback for the same id stays ok and does not burn that tenant's nonce, and the stored tenant remains the first tenant until proof. Once the claim is `active` or `repositories-ready`, the other tenant is refused. A later `update` clears any previously accepted repositories and returns the claim to `pending-ownership-check`.
5. `confirmOwnership` reassigns the pending claim to the calling tenant when the supplied list contains this installation id, sets the claim to `active`, then burns the deferred nonces. The future route must pass the installation ids from `GET /user/installations`. This module does not obtain a user access token, does not call GitHub, and does not verify that the list came from that endpoint. A missing id leaves the claim pending.
6. `replaceAuthorizedRepositories` stores repositories only after that confirmation, and only when every supplied page has `repository_selection: "selected"`, the pages agree on `total_count`, and the last page has no acceptable `Link: rel="next"`. The stored list is the authorized set for that tenant. `all` is refused and clears any stored repositories: GitHub grants an all-repositories installation access to repositories created later, which this MVP does not accept.

An off-origin `rel="next"` is invalid. The parser does not follow links. Pagination of a real response remains the SHA-112 `Link` rule.

The ledger is the binding rule, not a production database. A deployed server must persist consumed nonces, claims, and repository ids before replay protection or tenant binding holds across processes. No such store is added here.

## Stopped before any live GitHub call

A real installation is not proven. These human steps are required before ATLAS can exchange a callback for GitHub data. Do not put the values in the repository, the frontend, logs, or chat.

1. DIALLO creates the GitHub App on a personal account or an organization DIALLO controls, at GitHub's App registration page. ATLAS must not create it.
2. Set the App permissions to the SHA-112 minimum: repository metadata read, which GitHub grants implicitly, and pull requests read. Do not grant contents, administration, or installation-repository write.
3. Set the setup URL to the future ATLAS server route and enable Redirect on update. Leave "Request user authorization (OAuth) during installation" off if it would disable the setup URL, as GitHub documents.
4. Supply the public app slug to the server configuration.
5. Supply a server-only HMAC key of at least 32 characters for `state`. It must not use a `NEXT_PUBLIC_` name.
6. For the ownership check, supply the App client secret on the server and complete the user-authorization code exchange out of band. The client id may appear in GitHub's authorize URL; the client secret must not.
7. For `GET /installation/repositories`, supply the App ID and the App private key on the server so a later change can mint an installation access token. This change does not mint one.

Until those secrets exist outside the repo, the fixture tests are the verification. They do not prove a GitHub redirect, a signature from GitHub, or a repository list from the API.
