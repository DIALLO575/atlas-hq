import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-elements";
import { EnginesHub } from "@/components/engines-hub";

export default function EnginesPage() {
  return <AppShell><main className="main-content" id="main-content">
    <PageHeading eyebrow="INFRASTRUCTURE IA" title="Moteurs IA" description="Connectez les moteurs qui donnent vie aux agents ATLAS. MAUSBOT et n8n disposent de contrats préparatoires ; les connexions et exécutions réelles restent soumises aux validations de sécurité." />
    <p><a href="/engines/approvals">Consulter les validations en attente (lecture seule)</a></p>
    <EnginesHub />
  </main></AppShell>;
}
