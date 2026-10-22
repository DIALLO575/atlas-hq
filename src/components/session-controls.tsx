"use client";

import { useEffect, useState } from "react";
import { signOut } from "@/app/login/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

type SessionState = { status: "loading" } | { status: "ready"; email: string } | { status: "error" };

export function SessionControls() {
  const [session, setSession] = useState<SessionState>(() => getSupabasePublicConfig() ? { status: "loading" } : { status: "error" });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    let alive = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!alive) return;
      setSession(error || !data.user ? { status: "error" } : { status: "ready", email: data.user.email ?? "Compte connecté" });
    }).catch(() => {
      if (alive) setSession({ status: "error" });
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!alive) return;
      setSession(currentSession?.user ? { status: "ready", email: currentSession.user.email ?? "Compte connecté" } : { status: "error" });
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const label = session.status === "loading" ? "Vérification de la session…" : session.status === "ready" ? session.email : "Session indisponible";

  return (
    <div className="profile-row session-row">
      <span className="profile-avatar" aria-hidden="true">{session.status === "ready" ? session.email.slice(0, 2).toUpperCase() : "AT"}</span>
      <span className="session-label"><strong>{label}</strong><small>{session.status === "ready" ? "Compte connecté" : "Authentification requise"}</small></span>
      <form action={signOut}><button className="sign-out-button" type="submit" disabled={session.status !== "ready"}>Déconnexion</button></form>
    </div>
  );
}
