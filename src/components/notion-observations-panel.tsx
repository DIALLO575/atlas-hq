import Link from "next/link";
import { listPersonalNotionObservations } from "@/lib/notion/observations";

/**
 * A small historical reference index shared by Missions and Chief.
 * Render no section on empty/no-configuration/store-unavailable; avoid a
 * blocking or misleading provider-read status in other ATLAS dashboards.
 */
export async function NotionObservationsPanel({ workspaceId }: { workspaceId: string }) {
  let entries: Awaited<ReturnType<typeof listPersonalNotionObservations>> = [];
  try { entries = await listPersonalNotionObservations(workspaceId); }
  catch { return null; }
  if (entries.length === 0) return null;
  return <section aria-label="Références Notion récemment consultées">
    <h2>Références Notion</h2>
    <p>Historique de ressources personnelles, pas une permission d’accès actuelle.
      Toute nouvelle lecture doit être autorisée directement par Notion.</p>
    <ul>{entries.map((ref) => <li key={ref.connectionId + ref.resourceKind + ref.resourceId}>
      <strong>{ref.resourceKind}</strong>
      {" — "}<code>{ref.resourceId.slice(0,8)}…</code>
      <small> · Observé le {new Date(ref.observedAt).toLocaleDateString("fr-FR")}</small>
    </li>)}</ul>
    <Link href="/apps/notion">Vérifier les accès dans Notion</Link>
  </section>;
}
