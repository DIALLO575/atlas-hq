"use client";
import { useState } from "react";

type CapabilityStatus = "not_implemented" | "built" | "configured" |
  "authorized" | "provider_verified" | "degraded";
type Capability = {
  id: string; surface: string; operation: string; status: CapabilityStatus;
  available: boolean; providerVerified: boolean;
};
type Snapshot = { schema: string; capabilities: Capability[] };
const statusNames: Record<CapabilityStatus, string> = {
  not_implemented: "Non développée",
  built: "Code disponible · non configuré",
  configured: "Configurée · pas d’autorisation active",
  authorized: "Connexion ATLAS autorisée · permission Notion non prouvée",
  provider_verified: "Vérifiée par une opération Notion",
  degraded: "Vérification Notion échouée",
};
const surfaceNames: Record<string, string> = {
  rest: "REST", mcp: "MCP", webhooks: "Webhooks",
  agents: "Agents", workers: "Workers Notion", admin: "Admin Enterprise",
};
export function NotionCapabilitiesClient({
  workspaceId, connectionId,
}: { workspaceId: string; connectionId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Aucune permission Notion n'est présumée vérifiée.",
  );
  async function inspect() {
    if (busy) return;
    setBusy(true);
    setSnapshot(null);
    try {
      const params = new URLSearchParams({
        workspaceId, connectionId, verify: "1",
      });
      const response = await fetch("/api/apps/notion/capabilities?" + params, {
        cache: "no-store", credentials: "same-origin",
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object" ||
          !("schema" in result) || result.schema !== "atlas.notion.capabilities.v1" ||
          !("capabilities" in result) || !Array.isArray(result.capabilities)) {
        throw new Error("notion-capabilities-unavailable");
      }
      const validated = result.capabilities.filter((cap): cap is Capability => {
        if (!cap || typeof cap !== "object") return false;
        return "id" in cap && typeof cap.id === "string" &&
          "status" in cap && typeof cap.status === "string" &&
          Object.prototype.hasOwnProperty.call(statusNames, cap.status) &&
          "surface" in cap && typeof cap.surface === "string" &&
          "operation" in cap && typeof cap.operation === "string" &&
          "available" in cap && typeof cap.available === "boolean" &&
          "providerVerified" in cap && typeof cap.providerVerified === "boolean";
      });
      setSnapshot({ schema: result.schema, capabilities: validated });
      const successes = validated.filter(cap => cap.providerVerified).length;
      setMessage(successes ? String(successes) + " opération(s) vérifiée(s) réellement auprès de Notion."
        : "Aucune opération Notion confirmée. Les droits doivent être vérifiés par ressource.");
    } catch {
      setMessage("Impossible de vérifier les capacités pour cette connexion.");
    } finally {
      setBusy(false);
    }
  }
  return <section aria-label="Capacités et permissions Notion">
    <h4>Capacités de la connexion</h4>
    <p>Les droits restent propres à chaque ressource partagée et à votre compte.</p>
    <button type="button" onClick={() => void inspect()} disabled={busy}>
      {busy ? "Vérification…" : "Vérifier les capacités"}
    </button>
    <p role="status">{message}</p>
    {snapshot && <details>
      <summary>Afficher les {snapshot.capabilities.length} capacités classées</summary>
      <ul>{snapshot.capabilities.map(item => <li key={item.id}>
        <strong>{surfaceNames[item.surface] ?? item.surface} — {item.id}</strong>
        {" : "}{statusNames[item.status]}
      </li>)}</ul>
    </details>}
  </section>;
}
