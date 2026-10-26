"use client";

import { useEffect, useState } from "react";
import { purgeJournalCache } from "@/lib/journal/cache-storage";
import { signOut } from "@/app/login/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

type SessionState = { status: "loading" } | { status: "ready"; email: string } | { status: "signed-out" } | { status: "error" };

export function SessionControls() {
  const [session, setSession] = useState<SessionState>(() => getSupabasePublicConfig() ? { status: "loading" } : { status: "error" });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    let alive = true;
    let knownUser: string | null = null;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!alive) return;
      knownUser = data.user?.id ?? null;
      setSession(error ? { status: "error" } : data.user ? { status: "ready", email: data.user.email ?? "Compte connecté" } : { status: "signed-out" });
    }).catch(() => {
      if (alive) setSession({ status: "error" });
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!alive) return;
      if (_event === 'SIGNED_OUT' || (knownUser && currentSession?.user.id !== knownUser)) void purgeJournalCache().catch(() => undefined);
      knownUser = currentSession?.user.id ?? null;
      setSession(currentSession?.user ? { status: "ready", email: currentSession.user.email ?? "Compte connecté" } : { status: "signed-out" });
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const label = session.status === "loading" ? "Vérification de la session…" : session.status === "ready" ? session.email : session.status === "signed-out" ? "Déconnecté" : "Session indisponible";
  const detail = session.status === "ready" ? "Compte connecté" : session.status === "signed-out" ? "Connexion requise" : session.status === "error" ? "Vérifiez votre connexion" : "Chargement du compte";

  return (
    <div className="profile-row session-row">
      <span className="profile-avatar" aria-hidden="true">{session.status === "ready" ? session.email.slice(0, 2).toUpperCase() : "AT"}</span>
      <span className="session-label"><strong>{label}</strong><small>{detail}</small></span>
      <form action={async () => { await purgeJournalCache(); await signOut(); }}><button className="sign-out-button" type="submit" disabled={session.status !== "ready"}>Déconnexion</button></form>
    </div>
  );
}
