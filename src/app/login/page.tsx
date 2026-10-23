import { signIn } from "./actions";
import Link from "next/link";

const messages: Record<string, string> = {
  configuration: "La connexion Supabase n’est pas configurée. Ajoutez l’URL du projet et sa clé publishable côté serveur avant de vous connecter.",
  "auth-unavailable": "Le service de connexion ne répond pas. Réessayez dans quelques instants.",
  credentials: "Connexion impossible. Vérifiez l’adresse e-mail et le mot de passe, puis réessayez.",
  "invalid-input": "Saisissez une adresse e-mail et un mot de passe.",
  "signed-out": "Vous êtes déconnecté.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string; next?: string }> }) {
  const { reason, next } = await searchParams;
  const message = reason ? messages[reason] : undefined;

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <Link className="auth-brand" href="/" aria-label="ATLAS HQ">A <span>ATLAS HQ</span></Link>
        <p className="eyebrow">ESPACE SÉCURISÉ</p>
        <h1 id="login-title">Connexion à ATLAS HQ</h1>
        <p className="auth-intro">Connectez-vous pour accéder à vos workspaces et aux six sections du cockpit.</p>
        {message && <p className="auth-message" role={reason === "credentials" || reason === "invalid-input" ? "alert" : "status"}>{message}</p>}
        <form action={signIn} className="auth-form">
          <input type="hidden" name="next" value={next ?? "/"} />
          <label htmlFor="email">Adresse e-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">Mot de passe</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button className="button button-light auth-submit" type="submit">Se connecter</button>
        </form>
        <p className="auth-footnote">Les données d’authentification sont vérifiées par Supabase Auth. Aucun accès n’est accordé en mode démonstration.</p>
      </section>
    </main>
  );
}
