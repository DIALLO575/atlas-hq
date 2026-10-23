"use client";

import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { PASSWORD_RULES, isValidEmail, passwordMeetsRules } from "@/lib/auth/password-policy";
import { signIn, signUp } from "./actions";
import { AppleIcon, ArrowIcon, CheckMark, EyeIcon, GoogleIcon, LockIcon, MailIcon, MicrosoftIcon, SpinIcon, TickIcon, UserIcon } from "./duo-icons";

type Panel = "login" | "signup" | "reset" | "check-email";

const EMAIL_ERROR = "Indiquez une adresse e-mail valide.";
const LOGIN_PASSWORD_ERROR = "Indiquez votre mot de passe.";
const NAME_ERROR = "Indiquez votre nom complet.";
const SIGNUP_PASSWORD_ERROR = "Le mot de passe ne respecte pas les règles.";

const PanelContext = createContext<{ select: (panel: Panel) => void; destination: string }>({
  select: () => undefined,
  destination: "/",
});

function panelFrom(vue: string, reason: string): Panel {
  if (reason === "check-email") return "check-email";
  if (vue === "oublie" || reason === "reset-accepted" || reason === "reset-failed") return "reset";
  if (vue === "inscription" || reason === "signup-failed" || reason === "signup-invalid") return "signup";
  return "login";
}

function Wordmark() {
  return <p className="duo-logo"><span>A</span>tlas</p>;
}

function Tagline() {
  return <p className="duo-tag">Connectez vos données.<br />Avancez plus loin.</p>;
}

function PanelButton({ panel, children }: { panel: Panel; children: string }) {
  const { select, destination } = useContext(PanelContext);
  const params = new URLSearchParams();
  if (destination !== "/") params.set("next", destination);
  if (panel === "signup" || panel === "check-email") params.set("vue", "inscription");
  else if (panel === "reset") params.set("vue", "oublie");
  const query = params.toString();
  return (
    <a className="duo-text-button" href={query ? `/login?${query}` : "/login"} onClick={(event) => { event.preventDefault(); select(panel); }}>
      {children}
    </a>
  );
}

function SocialRow() {
  return (
    <>
      <div className="duo-or"><span>ou continuer avec</span></div>
      <div className="duo-social">
        <button type="button" aria-label="Google" aria-disabled={true} disabled><GoogleIcon /></button>
        <button type="button" aria-label="Microsoft" aria-disabled={true} disabled><MicrosoftIcon /></button>
        <button type="button" aria-label="Apple" aria-disabled={true} disabled><AppleIcon /></button>
      </div>
    </>
  );
}

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={pending ? "duo-submit is-busy" : "duo-submit"} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? <SpinIcon /> : null}
      <span>{pending ? busy : idle}</span>
      {pending ? null : <ArrowIcon />}
    </button>
  );
}

function Field({
  id,
  label,
  type,
  name,
  placeholder,
  autoComplete,
  icon,
  error,
  disabled,
  value,
  onValue,
  toggle,
}: {
  id: string;
  label: string;
  type: string;
  name: string;
  placeholder: string;
  autoComplete: string;
  icon: ReactNode;
  error: string;
  disabled: boolean;
  value?: string;
  onValue?: (value: string) => void;
  toggle?: { pressed: boolean; onToggle: () => void };
}) {
  const errorId = `${id}-error`;
  return (
    <div className={error ? "duo-field is-invalid" : "duo-field"}>
      <label htmlFor={id}>{label}</label>
      <div className={toggle ? "duo-control has-toggle" : "duo-control"}>
        <span className="duo-lead">{icon}</span>
        <input
          id={id}
          name={name}
          type={toggle ? (toggle.pressed ? "text" : "password") : type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...(value !== undefined ? { value } : {})}
          onChange={onValue ? (event) => onValue(event.target.value) : undefined}
        />
        {toggle ? (
          <button className="duo-toggle" type="button" aria-pressed={toggle.pressed} aria-label={toggle.pressed ? "Masquer le mot de passe" : "Afficher le mot de passe"} onClick={toggle.onToggle} disabled={disabled}>
            <EyeIcon />
          </button>
        ) : null}
      </div>
      {error ? <p className="duo-msg" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}

function LoginForm({ destination, reason }: { destination: string; reason: string }) {
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState({
    email: reason === "invalid-email" || reason === "invalid-input" ? EMAIL_ERROR : "",
    password: reason === "invalid-password" || reason === "invalid-input" ? LOGIN_PASSWORD_ERROR : "",
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const next = {
      email: isValidEmail(String(data.get("email") ?? "")) ? "" : EMAIL_ERROR,
      password: String(data.get("password") ?? "") ? "" : LOGIN_PASSWORD_ERROR,
    };
    if (next.email || next.password) {
      event.preventDefault();
      setErrors(next);
      return;
    }
    setErrors({ email: "", password: "" });
  }

  return (
    <form action={signIn} noValidate onSubmit={onSubmit}>
      <Wordmark />
      <Tagline />
      <h1 id="login-title">Connexion</h1>
      <p className="duo-sub">Accédez à votre espace Atlas.</p>
      {reason === "credentials" ? <p className="duo-banner" role="alert">Adresse ou mot de passe incorrect.</p> : null}
      {reason === "auth-unavailable" ? <p className="duo-banner" role="alert">Le service de connexion ne répond pas. Réessayez dans quelques instants.</p> : null}
      {reason === "signed-out" ? <p className="duo-status" role="status">Vous êtes déconnecté.</p> : null}
      <input type="hidden" name="next" value={destination} />
      <LoginControls visible={visible} onToggle={() => setVisible((current) => !current)} errors={errors} onClear={(field) => setErrors((current) => ({ ...current, [field]: "" }))} />
      <div className="duo-meta">
        <label className="duo-check">
          <input type="checkbox" />
          <span>Se souvenir de moi</span>
        </label>
        <PanelButton panel="reset">Mot de passe oublié ?</PanelButton>
      </div>
      <SubmitButton idle="Se connecter" busy="Connexion…" />
      <SocialRow />
      <p className="duo-switch">Pas encore de compte ? <PanelButton panel="signup">Créer un compte</PanelButton></p>
    </form>
  );
}

function LoginControls({
  visible,
  onToggle,
  errors,
  onClear,
}: {
  visible: boolean;
  onToggle: () => void;
  errors: { email: string; password: string };
  onClear: (field: "email" | "password") => void;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <Field id="login-email" label="Adresse e-mail" type="email" name="email" placeholder="votre@email.com" autoComplete="email" icon={<MailIcon />} error={errors.email} disabled={pending} onValue={() => onClear("email")} />
      <Field id="login-password" label="Mot de passe" type="password" name="password" placeholder="Votre mot de passe" autoComplete="current-password" icon={<LockIcon />} error={errors.password} disabled={pending} toggle={{ pressed: visible, onToggle }} onValue={() => onClear("password")} />
    </>
  );
}

function SignupForm({ destination, reason, gaps }: { destination: string; reason: string; gaps: string }) {
  const gapSet = new Set(gaps.split(",").filter(Boolean));
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({
    name: gapSet.has("name") ? NAME_ERROR : "",
    email: gapSet.has("email") ? EMAIL_ERROR : "",
    password: gapSet.has("password") ? SIGNUP_PASSWORD_ERROR : "",
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const next = {
      name: String(data.get("fullName") ?? "").trim() ? "" : NAME_ERROR,
      email: isValidEmail(String(data.get("email") ?? "")) ? "" : EMAIL_ERROR,
      password: passwordMeetsRules(String(data.get("password") ?? "")) ? "" : SIGNUP_PASSWORD_ERROR,
    };
    if (next.name || next.email || next.password) {
      event.preventDefault();
      setErrors(next);
      return;
    }
    setErrors({ name: "", email: "", password: "" });
  }

  return (
    <form action={signUp} noValidate onSubmit={onSubmit}>
      <Wordmark />
      <Tagline />
      <h1 id="signup-title">Créer un compte</h1>
      <p className="duo-sub">Rejoignez Atlas et centralisez vos données en toute simplicité.</p>
      {reason === "signup-failed" ? <p className="duo-banner" role="alert">La création du compte n’a pas abouti. Réessayez.</p> : null}
      <input type="hidden" name="next" value={destination} />
      <SignupControls visible={visible} onToggle={() => setVisible((current) => !current)} password={password} onPassword={setPassword} errors={errors} onClear={(field) => setErrors((current) => ({ ...current, [field]: "" }))} />
      <SubmitButton idle="Créer un compte" busy="Création…" />
      <SocialRow />
      <p className="duo-switch">Vous avez déjà un compte ? <PanelButton panel="login">Se connecter</PanelButton></p>
    </form>
  );
}

function SignupControls({
  visible,
  onToggle,
  password,
  onPassword,
  errors,
  onClear,
}: {
  visible: boolean;
  onToggle: () => void;
  password: string;
  onPassword: (value: string) => void;
  errors: { name: string; email: string; password: string };
  onClear: (field: "name" | "email" | "password") => void;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <Field id="signup-name" label="Nom complet" type="text" name="fullName" placeholder="Votre nom complet" autoComplete="name" icon={<UserIcon />} error={errors.name} disabled={pending} onValue={() => onClear("name")} />
      <Field id="signup-email" label="Adresse e-mail" type="email" name="email" placeholder="votre@email.com" autoComplete="email" icon={<MailIcon />} error={errors.email} disabled={pending} onValue={() => onClear("email")} />
      <Field id="signup-password" label="Mot de passe" type="password" name="password" placeholder="Créez un mot de passe" autoComplete="new-password" icon={<LockIcon />} error={errors.password} disabled={pending} value={password} onValue={(value) => { onPassword(value); onClear("password"); }} toggle={{ pressed: visible, onToggle }} />
      <ul className="duo-rules" aria-label="Règles du mot de passe">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(password);
          return (
            <li key={rule.id} className={met ? "is-met" : undefined}>
              <span className="duo-tick" aria-hidden="true"><TickIcon /></span>
              <span>{rule.label}</span>
              <span className="sr-only">{met ? ", règle tenue" : ", règle non tenue"}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ResetForm() {
  return (
    <form noValidate onSubmit={(event) => event.preventDefault()}>
      <Wordmark />
      <Tagline />
      <h1 id="reset-title">Mot de passe oublié</h1>
      <p className="duo-sub" id="reset-unavailable">Le choix d’un nouveau mot de passe n’est pas disponible sur cet écran.</p>
      <Field id="reset-email" label="Adresse e-mail" type="email" name="email" placeholder="votre@email.com" autoComplete="email" icon={<MailIcon />} error="" disabled={false} />
      <button className="duo-submit" type="button" disabled aria-disabled={true} aria-describedby="reset-unavailable">
        <span>Envoyer la demande</span>
        <ArrowIcon />
      </button>
      <p className="duo-switch">Vous avez déjà un compte ? <PanelButton panel="login">Se connecter</PanelButton></p>
    </form>
  );
}

function CheckEmail() {
  return (
    <>
      <Wordmark />
      <div className="duo-confirm">
        <div className="duo-confirm-mark"><CheckMark /></div>
        <h1 id="check-email-title">Vérifiez votre e-mail</h1>
        <p className="duo-sub">Si l’adresse est acceptée, un lien d’activation est envoyé. La connexion ouvre ensuite l’accueil.</p>
      </div>
      <p className="duo-switch">Vous avez déjà un compte ? <PanelButton panel="login">Se connecter</PanelButton></p>
    </>
  );
}

export function DuoAuth({ destination, reason, vue, gaps }: { destination: string; reason: string; vue: string; gaps: string }) {
  const [panel, setPanel] = useState<Panel>(() => panelFrom(vue, reason));
  const [serverReason, setServerReason] = useState(reason);
  const [serverGaps, setServerGaps] = useState(gaps);

  function selectPanel(next: Panel) {
    setPanel(next);
    setServerReason("");
    setServerGaps("");
    const url = new URL(window.location.href);
    url.searchParams.delete("reason");
    url.searchParams.delete("gaps");
    if (next === "signup" || next === "check-email") url.searchParams.set("vue", "inscription");
    else if (next === "reset") url.searchParams.set("vue", "oublie");
    else url.searchParams.delete("vue");
    window.history.replaceState(null, "", url);
  }

  return (
    <PanelContext.Provider value={{ select: selectPanel, destination }}>
      <div className="duo-stage" data-panel={panel}>
        <article className="duo-card is-login" aria-labelledby={panel === "reset" ? "reset-title" : "login-title"}>
          {panel === "reset" ? <ResetForm /> : <LoginForm destination={destination} reason={serverReason} />}
        </article>
        <article className="duo-card is-signup" aria-labelledby={panel === "check-email" ? "check-email-title" : "signup-title"}>
          {panel === "check-email" ? <CheckEmail /> : <SignupForm destination={destination} reason={serverReason} gaps={serverGaps} />}
        </article>
      </div>
    </PanelContext.Provider>
  );
}
