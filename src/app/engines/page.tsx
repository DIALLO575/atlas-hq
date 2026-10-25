import Image from "next/image";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";
import { EnginesHub } from "@/components/engines-hub";

export default function EnginesPage() {
  return (
    <AppShell>
      <main className="main-content atlas-engines-page" id="main-content">
        <header className="atlas-engine-page-head">
          <div className="atlas-engine-page-copy">
            <p className="atlas-engine-kicker"><Icon name="layers" /> ATLAS / ENGINE HUB</p>
            <h1>L'espace de vos <span>moteurs IA.</span></h1>
            <p className="atlas-engine-page-lead">
              Un seul cockpit pour découvrir les moteurs, vérifier leurs capacités et suivre leur connexion.
              Chaque accès reste gouverné par les permissions ATLAS.
            </p>
            <div className="atlas-engine-head-pills">
              <span><Icon name="shield-check" /> Accès contrôlé</span>
              <span><Icon name="activity" /> État réel, sans simulation</span>
            </div>
            <div className="atlas-engine-page-links">
              <Link href="/agents" className="atlas-engine-main-link"><Icon name="bot" /> Espace Agents <Icon name="arrow-up-right" /></Link>
              <Link href="/engines/approvals" className="atlas-engine-secondary-link"><Icon name="inbox" /> Voir les approbations <Icon name="arrow-right" /></Link>
            </div>
          </div>
          <div className="atlas-engine-hero-art" aria-hidden="true">
            <div className="atlas-engine-hero-orbit atlas-engine-hero-orbit-one" />
            <div className="atlas-engine-hero-orbit atlas-engine-hero-orbit-two" />
            <div className="atlas-engine-hero-logo atlas-engine-hero-maus">
              <Image src="/brands/mausbot.svg" alt="" width={92} height={92} unoptimized />
            </div>
            <div className="atlas-engine-hero-logo atlas-engine-hero-hermes">
              <Image src="/brands/hermes-agent.svg" alt="" width={76} height={76} unoptimized />
            </div>
            <span className="atlas-engine-hero-caption">ENGINE HUB <span>·</span> ATLAS HQ</span>
          </div>
        </header>
        <EnginesHub />
      </main>
    </AppShell>
  );
}
