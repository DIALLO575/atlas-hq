import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { EnginesHub } from "@/components/engines-hub";

export default function EnginesPage() {
  return (
    <AppShell>
      <main className="main-content atlas-engines-page" id="main-content">
        <header className="atlas-engine-page-head">
          <p className="atlas-engine-kicker"><Icon name="layers" /> ATLAS / MOTEURS IA</p>
          <h1>Vos <span>moteurs IA.</span></h1>
          <p className="atlas-engine-page-lead">Retrouvez vos moteurs et leur état de connexion.</p>
        </header>
        <EnginesHub />
      </main>
    </AppShell>
  );
}
