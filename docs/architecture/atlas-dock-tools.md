# Atlas Dock — Tools & Agents (UI phase)

The Dock is a separate interactive navigation island and a sidecar Toolspace. The purple island is draggable and magnetically docks left or right. Shortcuts are user-configured, persisted locally and **only navigate to Atlas routes**.

## Security boundary

The Toolspace's Outils tab has safe navigation shortcuts. Provider examples (GitHub, Notion and Google Calendar) link to /apps. They do not authenticate, read external data or execute API calls. The Agents IA tab shows an explicit unconnected state. Pinning a shortcut does not grant account access.

To enable a tool call by an agent later, implement an authenticated server-side tool registry:

1. Resolve session and workspace membership server-side; deny by default.
2. Ensure the connector is installed and healthy for this workspace using least-privileged scope.
3. Validate tool name, typed input schema, caller agent identity and per-workspace capability allowlist.
4. For writes, deletions, external sends and sensitive actions, queue human approval in /inbox; do not execute before authorization.
5. Execute only via server connectors; enforce timeouts, rate limits and idempotency, and keep an audit trail for agent, tool, arguments, approval, result and errors.
6. Use RLS workspace isolation for connections, permissions, requests and results. Never expose provider tokens or service role credentials to the browser or agents.
7. Provide honest user-visible statuses: not connected, pending approval, running, successful, failed. Do not fabricate activity.

The current Dock demo does **not** have an agent-tool execution backend. Agents cannot currently execute these shortcuts.

## Testing

Ensure drag and keyboard repositioning remain separate from navigation; collapse/expand and mobile launchers remain accessible; pinned IDs are validated; the disconnected agent view makes no external requests.
