import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { GitHubControlCenter } from "@/components/github-control-center";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { githubConnectSettings } from "@/lib/github/connect";

export const dynamic = "force-dynamic";

const githubFeedback: Record<string, string> = {
  connected: "GitHub est bien connecté à ATLAS. Vous pouvez maintenant consulter les dépôts autorisés.",
  "select-repositories": "Ce message provient d’un ancien essai. ATLAS accepte désormais « All repositories » et « Only select repositories ». Relancez « Installer ou reconnecter GitHub » dans l’onglet Connexion.",
  "no-repositories": "L’installation GitHub ne comporte aucun dépôt autorisé. Choisissez au moins un dépôt dans GitHub, puis relancez la connexion.",
  "installation-not-owned": "Le compte GitHub utilisé pour l’autorisation n’est pas le propriétaire de cette installation ATLAS HQ Connect. Reconnectez-vous avec le compte propriétaire.",
  "installation-suspended": "Cette installation GitHub est suspendue. Réactivez-la dans GitHub avant de réessayer.",
  "pull-request-permission-required": "La GitHub App ne possède pas l’autorisation de lire les Pull Requests. Corrigez ses permissions dans GitHub.",
  "oauth-invalid": "GitHub a refusé le jeton OAuth. Vérifiez le Client Secret de l’application GitHub dans Vercel et réessayez. Ne transmettez jamais le secret dans le chat.",
  "github-unavailable": "La vérification auprès de GitHub est indisponible. Réessayez, puis consultez les journaux du serveur si le problème persiste.",
  "selection-incomplete": "La liste des dépôts autorisés retournée par GitHub était incomplète. Réessayez avec une sélection plus petite.",
  "selection-too-large": "Le connecteur accepte au maximum 500 dépôts sélectionnés par installation.",
  "storage-unavailable": "L’autorisation GitHub a été validée, mais ATLAS n’a pas pu enregistrer la connexion dans Supabase.",
  "verification-failed": "La vérification GitHub n’a pas abouti. Consultez les journaux d’autorisation côté serveur pour identifier l’étape exacte.",
  "invalid-state": "Cette tentative de connexion est expirée ou invalide. Relancez la connexion depuis ATLAS.",
  forbidden: "Vous devez être propriétaire ou administrateur de ce workspace pour connecter GitHub.",
  "oauth-denied": "L’autorisation GitHub a été annulée ou refusée.",
  "installation-incomplete": "L’installation GitHub n’a pas été terminée. Vérifiez les dépôts sélectionnés sur GitHub.",
  unavailable: "La connexion GitHub est temporairement indisponible. Réessayez.",
};

export default async function GitHubPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; github?: string }>;
}) {
  const params = await searchParams;
  const githubResult = params.github && Object.hasOwn(githubFeedback, params.github) ? githubFeedback[params.github] : null;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = supabase
    ? await supabase.auth.getUser() : { data: { user: null } };
  const { data: memberships, error } = user && supabase
    ? await supabase.from("workspace_members")
      .select("workspace_id, role, workspaces!inner(name)")
      .eq("user_id", user.id).order("created_at", { ascending: true })
    : { data: null, error: null };

  const workspaces = (memberships ?? []).flatMap((item) => {
    const space = Array.isArray(item.workspaces) ? item.workspaces[0] : item.workspaces;
    if (!space || !["owner", "admin", "member"].includes(item.role)) return [];
    return [{
      id: item.workspace_id,
      name: space.name,
      role: item.role as "owner" | "admin" | "member",
    }];
  });
  const initialWorkspaceId = workspaces.some((workspace) => workspace.id === params.workspaceId)
    ? params.workspaceId! : workspaces[0]?.id ?? "";
  return (
    <AppShell>
      <main className="main-content atlas-github-page" id="main-content">
        <nav className="atlas-gh-crumbs" aria-label="Fil d’Ariane">
          <Link href="/apps">Mes Apps</Link><span aria-hidden="true">/</span><strong>GitHub</strong>
        </nav>
        {githubResult && <div className="atlas-gh-notice" role={params.github === "connected" ? "status" : "alert"}>{githubResult}</div>}
        {error ? (
          <div className="atlas-gh-notice" role="alert">Impossible de charger vos espaces. <Link href="/apps/github">Réessayer</Link></div>
        ) : (
          <GitHubControlCenter workspaces={workspaces}
            initialWorkspaceId={initialWorkspaceId}
            configured={Boolean(githubConnectSettings())} />
        )}
      </main>
    </AppShell>
  );
}
