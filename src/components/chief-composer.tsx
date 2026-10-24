"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icon";

const suggestions = [
  "Fais le point sur mes missions",
  "Quelles décisions m'attendent ?",
  "Montre la répartition des missions",
];

export function ChiefComposer() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const open = () => {
    const prompt = message.trim();
    router.push("/chief" + (prompt ? "?prompt=" + encodeURIComponent(prompt) : ""));
  };
  return (
    <section className="atlas-panel atlas-chief-panel" aria-labelledby="atlas-chief-heading">
      <div className="atlas-panel-heading">
        <div className="atlas-panel-heading-title"><span className="atlas-heading-icon atlas-icon-violet"><Icon name="spark" /></span>
          <h2 id="atlas-chief-heading">Chief of Staff</h2><span className="atlas-neutral-pill">Briefings Atlas</span></div>
        <Link href="/chief" className="atlas-subtle-link">Ouvrir <Icon name="arrow-up-right" /></Link>
      </div>
      <div className="atlas-chief-body">
        <div className="atlas-chief-avatar" aria-hidden="true"><Icon name="spark" /></div>
        <div><strong>Votre cockpit pour tout coordonner.</strong>
          <p>Interrogez vos missions, vos validations et votre workspace.</p></div>
      </div>
      <div className="atlas-suggestion-row" aria-label="Suggestions de messages">
        {suggestions.map(prompt => <button key={prompt} className="atlas-suggestion" type="button"
          onClick={() => {setMessage(prompt); router.push("/chief?prompt=" + encodeURIComponent(prompt));}}>
          {prompt}</button>)}
      </div>
      <form className="atlas-chat-composer" onSubmit={event => {event.preventDefault();open();}}>
        <label className="sr-only" htmlFor="atlas-chief-message">Votre question au Chief of Staff</label>
        <textarea id="atlas-chief-message" rows={2} maxLength={700} value={message}
          onChange={event=>setMessage(event.target.value)}
          placeholder="Demandez un briefing ou un graphique..."/>
        <button type="submit" aria-label="Ouvrir le Chief avec votre question">
          <Icon name="arrow-right" />
        </button>
      </form>
      <p className="atlas-chief-disclaimer">Briefings sur les données Atlas. Modèle IA externe non connecté.
        <Link href="/chief"> Ouvrir le Command Deck <Icon name="arrow-right" /></Link></p>
    </section>
  );
}
