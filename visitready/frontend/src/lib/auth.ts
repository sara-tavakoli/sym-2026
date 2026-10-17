import { useQuery, type QueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { visitKey } from "@/lib/hooks";
import { clearGuest, getGuest, getMode, setPersona, setSession, useSessionMode } from "@/lib/persona";
import type { PublicUser, Visit } from "@/lib/types";

export const meKey = ["auth", "me"] as const;

/** The signed-in account (server-verified). Only queried in account mode. */
export function useMe() {
  const mode = useSessionMode();
  return useQuery({ queryKey: meKey, queryFn: () => apiGet<PublicUser>("/auth/me"), enabled: mode === "account", retry: false, staleTime: 30_000 });
}

export const pwChecks = (pw: string) => [
  { id: "length", label: "At least 8 characters", ok: pw.length >= 8 },
  { id: "letter", label: "A letter", ok: /[A-Za-z]/.test(pw) },
  { id: "number", label: "A number", ok: /\d/.test(pw) },
];

async function carryGuestAnswers(persona: string): Promise<Visit | null> {
  const q = getGuest().questionnaire;
  if (!q) return null;
  return apiPost<Visit>(`/visit/questionnaire?persona=${encodeURIComponent(persona)}`, q);
}

/** Real account signed in (password or Google): remember it and carry over any guest Find Care answers. */
export async function completeAccountSignIn(qc: QueryClient, user: PublicUser) {
  qc.setQueryData(meKey, user);
  setSession("account", user.user_id);
  const v = await carryGuestAnswers(user.user_id).catch(() => null);
  clearGuest();
  if (v) qc.setQueryData(visitKey(user.user_id), v);
  else qc.invalidateQueries({ queryKey: visitKey(user.user_id) });
}

/** Clearly-labelled demo access with fictional data. Each demo start is a fresh, empty journey. */
export async function startDemo(qc: QueryClient, persona: string) {
  setPersona(persona);
  const q = `?persona=${encodeURIComponent(persona)}`;
  let v = await apiPost<Visit>(`/visit/reset${q}`);
  v = (await carryGuestAnswers(persona).catch(() => null)) ?? v;
  clearGuest();
  qc.setQueryData(visitKey(persona), v);
  qc.invalidateQueries({ queryKey: ["clinician-dashboard"] });
  setSession("demo", persona);
}

export async function signOut(qc: QueryClient) {
  if (getMode() === "account") await apiPost("/auth/logout").catch(() => undefined);
  setSession(null);
  clearGuest();
  qc.removeQueries({ queryKey: meKey });
}

/** Emergent-managed Google sign-in; returns to the exact page (and booking selection) the user started from. */
export function googleSignIn(returnPath: string) {
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const redirectUrl = window.location.origin + returnPath;
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
}
