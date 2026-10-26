import type { ReactNode } from "react";
import { Icon } from "@/components/icon";

export function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="welcome-copy">{description}</p></div>;
}

export function EmptyPanel({ title, children, icon = "layers" }: { title: string; children: ReactNode; icon?: "layers" | "bot" | "search" }) {
  return <section className="empty-panel" aria-labelledby="empty-title"><span className="empty-panel-icon"><Icon name={icon}/></span><h2 id="empty-title">{title}</h2><p>{children}</p></section>;
}
