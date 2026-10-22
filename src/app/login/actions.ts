"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function loginUrl(reason: string) {
  return `/login?reason=${encodeURIComponent(reason)}`;
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedPath = String(formData.get("next") ?? "");
  const destination = requestedPath.startsWith("/") && !requestedPath.startsWith("//") && requestedPath !== "/login" ? requestedPath : "/";
  if (!email || !password) redirect(loginUrl("invalid-input"));

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect(loginUrl("configuration"));

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) redirect(loginUrl("credentials"));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(loginUrl("auth-unavailable"));
  }
  redirect(destination);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login?reason=signed-out");
}
