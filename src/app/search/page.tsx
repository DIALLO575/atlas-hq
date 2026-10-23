"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DemoNotice, EmptyPanel, PageHeading } from "@/components/page-elements";
import { searchableItems } from "@/lib/demo-data";
import { Icon } from "@/components/icon";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    return normalized ? searchableItems.filter((item) => `${item.title} ${item.detail} ${item.type}`.toLocaleLowerCase("fr").includes(normalized)) : [];
  }, [query]);

  return <AppShell><main className="main-content" id="main-content"><PageHeading eyebrow="RETROUVER" title="Recherche" description="Cherchez dans les sections et le catalogue d’exemple d’ATLAS HQ."/><DemoNotice/><form className="search-form" role="search" onSubmit={(event) => event.preventDefault()}><Icon name="search"/><label className="sr-only" htmlFor="atlas-search">Votre recherche</label><input id="atlas-search" type="search" placeholder="Rechercher une app ou une section…" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off"/><kbd aria-hidden="true">Entrée</kbd></form>
    <section className="search-results" aria-label="Résultats de recherche" aria-live="polite" aria-busy="false">{query.trim() ? results.length ? <><p className="results-count">{results.length} résultat{results.length > 1 ? "s" : ""} dans les exemples</p><ul className="results-list">{results.map((item) => <li key={`${item.type}-${item.title}`}><Link href={item.href}><span className="result-icon"><Icon name={item.type === "Application" ? "layers" : "grid"}/></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><span className="result-type">{item.type}</span><Icon name="arrow-up-right"/></Link></li>)}</ul></> : <EmptyPanel title="Aucun résultat">Essayez un autre terme. La recherche porte uniquement sur le catalogue de démonstration.</EmptyPanel> : <EmptyPanel title="Que souhaitez-vous retrouver ?" icon="search">Saisissez un nom d’application ou une section. Les données réelles ne sont pas encore connectées.</EmptyPanel>}</section>
  </main></AppShell>;
}
