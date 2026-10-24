"use client";
import { useState, type FormEvent } from "react";

type Resource = { id: string; kind: string; title: string; editedAt: string | null };
type Block = { id: string; type: string; text: string; hasChildren: boolean };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Props = { workspaceId: string; connectionId: string };
export function NotionResourcesClient({ workspaceId, connectionId }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Resource[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("La lecture Notion n'a pas encore été vérifiée.");
  const [disconnected, setDisconnected] = useState(false);

  async function read(kind: "search" | "blocks", resourceId = "", more = false) {
    if (busy || disconnected) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ workspaceId, connectionId, kind });
      if (kind === "search") {
        params.set("query", query.slice(0, 200));
        if (more && cursor) params.set("cursor", cursor);
      } else {
        if (!UUID.test(resourceId)) throw new Error("invalid-resource");
        params.set("resourceId", resourceId);
      }
      const response = await fetch("/api/apps/notion/read?" + params, {
        credentials: "same-origin", cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object") {
        setFeedback("Notion est indisponible ou demande une nouvelle autorisation (" + response.status + ").");
        return;
      }
      const data = body as { results?: unknown; nextCursor?: unknown; hasMore?: unknown };
      if (!Array.isArray(data.results)) throw new Error("invalid-response");
      if (kind === "search") {
        const next = data.results.filter((item): item is Resource =>
          Boolean(item && typeof item === "object" && "id" in item &&
            typeof item.id === "string" && UUID.test(item.id) &&
            "title" in item && typeof item.title === "string" &&
            "kind" in item && typeof item.kind === "string"));
        setItems(previous => more ? [...previous, ...next] : next);
        setBlocks([]);
        setCursor(data.hasMore === true && typeof data.nextCursor === "string"
          ? data.nextCursor : null);
        setFeedback(next.length ? "Contenu autorisé reçu directement depuis Notion."
          : "Aucune page partagée ne correspond à cette recherche.");
      } else {
        setBlocks(data.results.filter((item): item is Block =>
          Boolean(item && typeof item === "object" && "id" in item &&
            typeof item.id === "string" && "text" in item &&
            typeof item.text === "string")));
        setFeedback("Blocs autorisés récupérés depuis Notion.");
      }
    } catch {
      setFeedback("Lecture indisponible. Vérifiez la connexion ou réessayez.");
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void read("search");
  }
  async function disconnect() {
    if (busy || disconnected || !window.confirm("Déconnecter cet espace Notion d'ATLAS ?")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/apps/notion/connect/disconnect", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ workspaceId, connectionId }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        setFeedback("La déconnexion n'a pas été confirmée (" + response.status + ").");
      } else {
        setDisconnected(true);
        setItems([]); setBlocks([]); setCursor(null);
        const status = data && typeof data === "object" &&
          "providerRevocation" in data && data.providerRevocation === "confirmed"
          ? "Révocation confirmée par Notion."
          : "Accès ATLAS coupé. La révocation chez Notion n'a pas pu être confirmée.";
        setFeedback("Déconnexion locale enregistrée. " + status);
      }
    } catch {
      setFeedback("Erreur réseau pendant la déconnexion; revérifiez le statut avant de réessayer.");
    } finally { setBusy(false); }
  }
  return <section aria-label="Ressources Notion autorisées">
    <form onSubmit={submit}>
      <label htmlFor={"notion-search-" + connectionId}>Rechercher des pages par titre</label>
      <input id={"notion-search-" + connectionId} type="search"
        value={query} maxLength={200} onChange={event => setQuery(event.target.value)}
        placeholder="Titre d'une page partagée" />
      <button type="submit" disabled={busy || disconnected}>
        {busy ? "Lecture…" : "Rechercher dans Notion"}
      </button>
    </form>
    <p role="status">{feedback}</p>
    {items.length > 0 && <ul>{items.map(item => <li key={item.id}>
      <strong>{item.title}</strong> — {item.kind}
      {item.kind === "page" && <button type="button" disabled={busy || disconnected}
        onClick={() => void read("blocks", item.id)}>Voir les blocs</button>}
    </li>)}</ul>}
    {cursor && <button type="button" disabled={busy || disconnected}
      onClick={() => void read("search", "", true)}>Afficher la suite</button>}
    {blocks.length > 0 && <section aria-label="Blocs de la page">
      <h4>Extrait des blocs</h4><ul>{blocks.map(block =>
        <li key={block.id}>{block.type} : {block.text || "Contenu non textuel"}</li>)}</ul>
    </section>}
    <button type="button" onClick={() => void disconnect()}
      disabled={busy || disconnected}>Déconnecter cet espace Notion</button>
  </section>;
}
