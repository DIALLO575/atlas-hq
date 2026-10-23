import { signIn, signUp } from "@/app/login/actions";
import Link from "next/link";

type Props = { searchParams: Promise<{ next?: string; error?: string; message?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <Link className="brand auth-brand" href="/" aria-label="ATLAS HQ">A <span>ATLAS HQ</span></Link>
        <p className="eyebrow">ESPACE SÉCURISÉ</p>
        <h1 id="login-title">Connectez-vous à ATLAS HQ</h1>
        <p>Vos workspaces et leurs données sont isolés selon votre compte et vos rôles.</p>
        {params.error && <p className="auth-message" role="alert">{params.error}</p>}
        {params.message && <p className="auth-message" role="status">{params.message}</p>}
        <form action={signIn} className="auth-form">
          <input type="hidden" name="next" value={params.next ?? "/"} />
          <label htmlFor="email">Adresse e-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">Mot de passe</label>
          <input id="password" name="password" type="password" autoComplete="current-password" minLength={8} required />
          <button className="button button-dark" type="submit">Se connecter</button>
        </form>
        <details className="auth-signup">
          <summary>Créer un compte</summary>
          <form action={signUp} className="auth-form">
            <label htmlFor="signup-email">Adresse e-mail</label>
            <input id="signup-email" name="email" type="email" autoComplete="email" required />
            <label htmlFor="signup-password">Mot de passe (8 caractères minimum)</label>
            <input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            <button className="button button-dark" type="submit">Créer mon compte</button>
          </form>
        </details>
      </section>
    </main>
  );
}
