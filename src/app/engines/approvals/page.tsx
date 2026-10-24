import { AppShell } from "@/components/app-shell";
import { PageHeading } from "@/components/page-elements";
import { ApprovalInbox } from "@/components/approval-inbox";

export default function EngineApprovalsPage() {
  return <AppShell><main className="main-content" id="main-content">
    <PageHeading eyebrow="MOTEURS IA" title="Demandes à valider"
      description="Consultation sécurisée des approbations en attente. Aucune action de validation n'est disponible." />
    <ApprovalInbox />
  </main></AppShell>;
}
