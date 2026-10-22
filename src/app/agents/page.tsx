import { AppShell } from "@/components/app-shell";
import { DemoNotice, PageHeading } from "@/components/page-elements";
import { AgentLayerPanel } from "@/components/agent-layer-panel";
import type { AgentBridgeBootstrap } from "@/lib/agent-bridge";

const unavailableBridge: AgentBridgeBootstrap = {
  state: "unavailable",
  agents: [{ identity: { id: "ebcc1f45-7e75-4276-8e46-2c2e179f28fd", displayName: "VISION", enabled: false }, origin: "team_roster", activation: "unknown" }],
  reason: "Le contrat Agent Bridge n’est pas encore raccordé à cette interface.",
};

export default function AgentsPage() {
  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="ESPACE DE TRAVAIL" title="Agents & Équipes" description="Sollicitez un agent depuis une ressource et gardez le contexte, les accès, la mission et son rapport liés."/><DemoNotice/><AgentLayerPanel bootstrap={unavailableBridge}/><p className="section-footnote">La fiche de ressource transmettra son contexte à ce panneau. Aucune mission ou réponse n’est simulée.</p></main></AppShell>;
}
