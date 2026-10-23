"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { emailConfirmRedirect, requestOriginFrom } from "@/lib/auth/email-redirect";
import { isValidEmail, passwordMeetsRules } from "@/lib/auth/password-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function loginQuery(reason: string, requestedPath: string, vue?: string, gaps?: string) {
  const params = new URLSearchParams();
  if (reason) params.set("reason", reason);
  if (requestedPath.startsWith("/") && !requestedPath.startsWith("//") && requestedPath !== "/login" && requestedPath !== "/") {
    params.set("next", requestedPath);
  }
  if (vue) params.set("vue", vue);
  if (gaps) params.set("gaps", gaps);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

function destinationFrom(formData: FormData) {
  const requestedPath = String(formData.get("next") ?? "");
  const destination = requestedPath.startsWith("/") && !requestedPath.startsWith("//") && requestedPath !== "/login" ? requestedPath : "/";
  return { requestedPath, destination };
}

function rethrowRedirect(error: unknown, requestedPath: string): never {
  if (error && typeof error === "object" && "digest" in error) throw error;
  redirect(loginQuery("auth-unavailable", requestedPath));
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const { requestedPath, destination } = destinationFrom(formData);
  const emailInvalid = !isValidEmail(email);
  const passwordInvalid = password.length === 0;
  if (emailInvalid || passwordInvalid) {
    const reason = emailInvalid && passwordInvalid ? "invalid-input" : emailInvalid ? "invalid-email" : "invalid-password";
    redirect(loginQuery(reason, requestedPath));
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(loginQuery("configuration", requestedPath));

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) redirect(loginQuery("credentials", requestedPath));
  } catch (error) {
    rethrowRedirect(error, requestedPath);
  }
  redirect(destination);
}

export async function signUp(formData: FormData) {
  const name = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const { requestedPath, destination } = destinationFrom(formData);
  const gaps = [
    !name ? "name" : "",
    !isValidEmail(email) ? "email" : "",
    !passwordMeetsRules(password) ? "password" : "",
  ].filter(Boolean);
  if (gaps.length) redirect(loginQuery("signup-invalid", requestedPath, "inscription", gaps.join(",")));

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(loginQuery("configuration", requestedPath));

  try {
    const emailRedirectTo = emailConfirmRedirect(requestOriginFrom(await headers()));
    const options: { data: { full_name: string }; emailRedirectTo?: string } = { data: { full_name: name } };
    if (emailRedirectTo) options.emailRedirectTo = emailRedirectTo;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options,
    });
    if (error) {
      const code = "code" in error ? String(error.code) : "";
      if (code === "weak_password" || code === "password_does_not_meet_requirements") {
        redirect(loginQuery("signup-invalid", requestedPath, "inscription", "password"));
      }
      redirect(loginQuery("signup-failed", requestedPath, "inscription"));
    }
    if (data.session) redirect(destination);
  } catch (error) {
    rethrowRedirect(error, requestedPath);
  }
  redirect(loginQuery("check-email", requestedPath, "inscription"));
}

export async function requestPasswordReset(formData: FormData) {
  const { requestedPath } = destinationFrom(formData);
  redirect(loginQuery("", requestedPath, "oublie"));
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login?reason=signed-out");
}
