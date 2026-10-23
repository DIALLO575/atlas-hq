import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { DuoAuth } from "./duo-auth";
import "./duo.css";

type LoginSearch = {
  reason?: string;
  next?: string;
  vue?: string;
  gaps?: string;
};

function destinationFrom(next: string | undefined) {
  const requestedPath = next ?? "";
  return requestedPath.startsWith("/") && !requestedPath.startsWith("//") && requestedPath !== "/login" ? requestedPath : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<LoginSearch> }) {
  const params = await searchParams;
  const destination = destinationFrom(params.next);

  if (!getSupabasePublicConfig()) {
    return (
      <main className="duo-auth">
        <div className="duo-stage" data-panel="configuration">
          <article className="duo-card" aria-labelledby="configuration-title">
            <p className="duo-logo"><span>A</span>tlas</p>
            <h1 id="configuration-title">Connexion indisponible</h1>
            <p className="duo-sub">Les paramètres publics d’authentification manquent. Ni la connexion ni l’inscription ne peuvent s’ouvrir.</p>
            <p className="duo-footnote">Aucun accès de démonstration.</p>
          </article>
        </div>
        <p className="duo-outside">Connexion par e-mail. Aucun accès n’est accordé en mode démonstration.</p>
      </main>
    );
  }

  return (
    <main className="duo-auth">
      <DuoAuth destination={destination} reason={params.reason ?? ""} vue={params.vue ?? ""} gaps={params.gaps ?? ""} />
      <p className="duo-outside">Connexion par e-mail. Aucun accès n’est accordé en mode démonstration.</p>
    </main>
  );
}
