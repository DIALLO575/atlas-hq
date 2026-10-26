import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { githubConnectSettings } from "@/lib/github/connect";
import { adminLinearStateClient, linearConnectSettings, linearTokenVault } from "@/lib/linear/connect";
import { adminNotionClient, notionConnectSettings, notionTokenVault } from "@/lib/notion/connect";

type SessionClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
type AppSlug = "github" | "notion" | "linear";

export type ConnectedApp = {
  slug: AppSlug;
  name: string;
  description: string;
  href: string;
};

export type ConnectedAppsResult = {
  apps: ConnectedApp[];
  unavailable: boolean;
  unauthenticated: boolean;
};

const providers: ReadonlyArray<Omit<ConnectedApp, "href">> = [
  { slug: "github", name: "GitHub", description: "Dépôts et pull requests autorisés" },
  { slug: "notion", name: "Notion", description: "Pages, documents et bases de connaissances" },
  { slug: "linear", name: "Linear", description: "Projets, tâches et suivi des équipes" },
];

/** Only verified, ready GitHub App installations count; configuration alone does not. */
async function connectedGitHub(client: SessionClient, workspaceIds: string[]): Promise<string | null> {
  if (!githubConnectSettings() || !workspaceIds.length) return null;
  const { data, error } = await client.from("atlas_github_installations")
    .select("workspace_id,status,ownership_verified_at,repositories_verified_at")
    .in("workspace_id", workspaceIds).eq("status", "repositories-ready");
  if (error) throw new Error("GitHub connection status unavailable");
  const installation = (data ?? []).find((item) =>
    item.status === "repositories-ready" &&
    Boolean(item.ownership_verified_at && item.repositories_verified_at));
  return installation?.workspace_id ?? null;
}

/** The user-writable generic registry cannot prove Notion authorization on its own. */
async function connectedNotion(client: SessionClient, userId: string, adminWorkspaceIds: string[]): Promise<string | null> {
  const settings = notionConnectSettings();
  if (!settings?.callbackEnabled || !notionTokenVault() || !adminWorkspaceIds.length) return null;
  const [registry, credentials] = await Promise.all([
    client.from("atlas_connections").select("id,workspace_id")
      .eq("owner_id", userId).eq("provider", "notion").eq("status", "connected")
      .in("workspace_id", adminWorkspaceIds),
    adminNotionClient(settings).from("atlas_notion_connections")
      .select("connection_id,workspace_id").eq("user_id", userId)
      .in("workspace_id", adminWorkspaceIds).is("revoked_at", null),
  ]);
  if (registry.error || credentials.error) throw new Error("Notion connection status unavailable");
  const verified = new Set((credentials.data ?? []).map((row) => row.workspace_id + ":" + row.connection_id));
  const connection = (registry.data ?? []).find((row) => verified.has(row.workspace_id + ":" + row.id));
  return connection?.workspace_id ?? null;
}

/** Read connection metadata only, scoped to the signed-in actor and their workspaces. */
async function connectedLinear(userId: string, workspaceIds: string[]): Promise<string | null> {
  const settings = linearConnectSettings();
  if (!settings || !linearTokenVault() || !workspaceIds.length) return null;
  const { data, error } = await adminLinearStateClient(settings).from("atlas_linear_connections")
    .select("workspace_id").eq("user_id", userId)
    .in("workspace_id", workspaceIds).is("revoked_at", null).limit(1);
  if (error) throw new Error("Linear connection status unavailable");
  return data?.[0]?.workspace_id ?? null;
}

export async function listConnectedApps(): Promise<ConnectedAppsResult> {
  const empty = { apps: [], unavailable: false, unauthenticated: false };
  const client = await createSupabaseServerClient();
  if (!client) return { ...empty, unavailable: true };

  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return { ...empty, unauthenticated: true };

  const { data: memberships, error: membershipError } = await client.from("workspace_members")
    .select("workspace_id,role").eq("user_id", user.id);
  if (membershipError || !memberships) return { ...empty, unavailable: true };

  const accessible = memberships.filter((item) => ["owner", "admin", "member"].includes(item.role));
  const workspaceIds = [...new Set(accessible.map((item) => item.workspace_id))];
  const adminWorkspaceIds = [...new Set(accessible
    .filter((item) => item.role === "owner" || item.role === "admin")
    .map((item) => item.workspace_id))];

  if (!workspaceIds.length) return empty;

  // Independent checks: one provider outage must not hide the other connected apps.
  const checks = await Promise.allSettled([
    connectedGitHub(client, workspaceIds),
    connectedNotion(client, user.id, adminWorkspaceIds),
    connectedLinear(user.id, workspaceIds),
  ]);
  const apps = providers.flatMap((app, index) => {
    const checked = checks[index];
    if (checked.status !== "fulfilled" || !checked.value) return [];
    const href = app.slug === "notion" ? "/apps/notion"
      : "/apps/" + app.slug + "?workspaceId=" + encodeURIComponent(checked.value);
    return [{ ...app, href }];
  });
  return {
    apps,
    unavailable: checks.some((check) => check.status === "rejected"),
    unauthenticated: false,
  };
}
