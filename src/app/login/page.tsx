import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { AccessThemeControl, DuoAuth } from "./duo-auth";
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
  const theme = (await cookies()).get("atlas-access-theme")?.value === "light" ? "light" : "dark";

  if (!getSupabasePublicConfig()) {
    return (
      <main className="duo-auth" data-theme={theme}>
        <AccessThemeControl initial={theme} />
        <div className="duo-stage" data-panel="configuration">
          <article className="duo-card" aria-labelledby="configuration-title">
            <p className="duo-logo"><span>A</span>tlas</p>
            <h1 id="configuration-title">Connexion indisponible</h1>
            <p className="duo-sub">Les paramètres publics d’authentification manquent.</p>
          </article>
        </div>
      </main>
    );
  }

  return (
    <main className="duo-auth" data-theme={theme}>
      <DuoAuth destination={destination} reason={params.reason ?? ""} vue={params.vue ?? ""} gaps={params.gaps ?? ""} theme={theme} />
    </main>
  );
}
