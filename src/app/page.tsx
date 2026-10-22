import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/icon";

const spaces = [
  { name: "Notion", detail: "Espaces de travail", mark: "N", tone: "notion" },
  { name: "GitHub", detail: "Code & projets", mark: "GH", tone: "github" },
  { name: "Linear", detail: "Tâches & suivi", mark: "L", tone: "linear" },
  { name: "OpenMausBot", detail: "Assistants", mark: "◎", tone: "maus" },
];

export default function Home() {
  return (
    <AppShell>
      <main className="main-content" id="main-content">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">JEUDI 22 OCTOBRE</p>
            <h1>Bonjour, Mamadou <span aria-hidden="true">✳</span></h1>
            <p className="welcome-copy">Votre espace de travail, enfin réuni au même endroit.</p>
          </div>
          <button className="icon-button search-button" type="button" aria-label="Rechercher dans ATLAS HQ">
            <Icon name="search" /> <span>Rechercher</span><kbd>⌘ K</kbd>
          </button>
        </div>

        <section className="focus-card" aria-labelledby="focus-title">
          <div className="focus-content">
            <div className="focus-label"><span className="live-dot" /> ESPACE PERSONNEL</div>
            <h2 id="focus-title">Tout commence<br className="mobile-break" /> par une bonne vue d’ensemble.</h2>
            <p>Vos projets et vos outils, rassemblés dans un cockpit clair. Connectez vos espaces quand vous serez prêt.</p>
            <a className="button button-light" href="#espaces">Explorer mes espaces <Icon name="arrow-up-right" /></a>
          </div>
          <div className="focus-art" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="core-mark"><span>A</span><i /></div>
            <div className="orbit-node node-one">N</div><div className="orbit-node node-two">GH</div><div className="orbit-node node-three">L</div>
          </div>
          <div className="card-index">01 <span>—</span> 04</div>
        </section>

        <div className="section-heading" id="espaces">
          <div><p className="eyebrow">VOTRE ÉCOSYSTÈME</p><h2>Espaces connectés</h2></div>
          <button className="text-button" type="button">Gérer les connexions <Icon name="arrow-right" /></button>
        </div>

        <section className="spaces-grid" aria-label="État des espaces de travail">
          {spaces.map((space) => (
            <article className="space-card" key={space.name}>
              <div className={`space-mark ${space.tone}`} aria-hidden="true">{space.mark}</div>
              <div className="space-info"><h3>{space.name}</h3><p>{space.detail}</p></div>
              <span className="connection-state"><span /> À connecter</span>
              <button className="space-arrow" type="button" aria-label={`Configurer ${space.name}`}><Icon name="arrow-up-right" /></button>
            </article>
          ))}
        </section>

        <section className="bottom-grid" aria-label="Résumé">
          <article className="panel activity-panel">
            <div className="panel-heading"><div><p className="eyebrow">EN UN COUP D’ŒIL</p><h2>Activité récente</h2></div><span className="quiet-tag">EN ATTENTE</span></div>
            <div className="empty-state"><div className="empty-icon"><Icon name="activity" /></div><div><h3>Votre fil d’activité est prêt</h3><p>Les événements apparaîtront ici après la connexion de vos outils.</p></div></div>
          </article>
          <article className="panel note-panel">
            <div className="panel-heading"><div><p className="eyebrow">POUR BIEN DÉMARRER</p><h2>Un cockpit à votre rythme</h2></div><div className="spark-icon">✳</div></div>
            <p className="note-copy">Commencez par connecter les espaces que vous utilisez le plus. Vos outils restent les sources de vérité.</p>
            <a href="#espaces" className="inline-link">Voir les espaces <Icon name="arrow-right" /></a>
          </article>
        </section>
        <footer className="page-footer"><span>ATLAS HQ <span className="footer-dot">·</span> votre espace de travail</span><span>Une interface simple, avec ou sans IA.</span></footer>
      </main>
    </AppShell>
  );
}
