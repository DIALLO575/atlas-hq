"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icon";

const suggestions = [
  "Fais le point sur mes missions",
  "Quelles décisions m'attendent ?",
  "Résume l'activité des agents",
];

export function ChiefComposer() {
  const [message, setMessage] = useState("");

  return (
    <section className="atlas-panel atlas-chief-panel" aria-labelledby="atlas-chief-heading">
      <div className="atlas-panel-heading">
        <div className="atlas-panel-heading-title"><span className="atlas-heading-icon atlas-icon-violet"><Icon name="spark" /></span><h2 id="atlas-chief-heading">Chief of Staff</h2><span className="atlas-neutral-pill">À connecter</span></div>
        <Link href="/chief" className="atlas-subtle-link">Ouvrir <Icon name="arrow-up-right" /></Link>
      </div>
      <div className="atlas-chief-body">
        <div className="atlas-chief-avatar" aria-hidden="true"><Icon name="spark" /></div>
        <div><strong>Votre copilote pour tout coordonner.</strong><p>Centralisez les échanges avec vos agents, applications et missions.</p></div>
      </div>
      <div className="atlas-suggestion-row" aria-label="Suggestions de messages">
        {suggestions.map((prompt) => (
          <button key={prompt} className="atlas-suggestion" type="button" onClick={() => setMessage(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
      <div className="atlas-chat-composer">
        <label className="sr-only" htmlFor="atlas-chief-message">Votre message au Chief of Staff</label>
        <textarea id="atlas-chief-message" rows={2} value={message} onChange={(event) => setMessage(event.target.value)}
          placeholder="Posez une question ou donnez une instruction..." />
        <button type="button" disabled aria-label="Envoi indisponible tant que le Chief n'est pas connecté" title="Connectez un agent pour activer l'envoi">
          <Icon name="arrow-right" />
        </button>
      </div>
      <p className="atlas-chief-disclaimer">Le Chief n’est pas connecté. <Link href="/agents">Voir les agents <Icon name="arrow-right" /></Link></p>
    </section>
  );
}
