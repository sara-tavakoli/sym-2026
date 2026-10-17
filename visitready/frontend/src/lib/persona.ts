import { useSyncExternalStore } from "react";
import type { PathwaySuggestion, Questionnaire } from "@/lib/types";

// Which fictional demo persona the presenter is driving. Persisted so a refresh keeps the same journey.
const KEY = "visitready-persona";
let current = (typeof localStorage !== "undefined" && localStorage.getItem(KEY)) || "alex";
const listeners = new Set<() => void>();

export const getPersona = () => current;

export function setPersona(id: string) {
  current = id;
  localStorage.setItem(KEY, id);
  listeners.forEach((l) => l());
}

export const usePersonaId = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getPersona,
  );

// ---- patient session: "account" = real signed-in user (httpOnly cookie, verified via /api/auth/me),
// "demo" = clearly-labelled fictional demo access (Alex / Priya). null = guest. ----
export type SessionMode = "demo" | "account" | null;
const MODE_KEY = "visitready-session";
const PATIENT_KEY = "visitready-patient-persona";
let mode: SessionMode = (typeof localStorage !== "undefined" && (localStorage.getItem(MODE_KEY) as SessionMode)) || null;
const sessionListeners = new Set<() => void>();
const emitSession = () => sessionListeners.forEach((l) => l());
const subscribeSession = (cb: () => void) => { sessionListeners.add(cb); return () => { sessionListeners.delete(cb); }; };

export const getMode = () => mode;
export const useSessionMode = () => useSyncExternalStore(subscribeSession, getMode);
export const isSignedIn = () => mode !== null;
export const useSignedIn = () => useSyncExternalStore(subscribeSession, isSignedIn);
/** The patient identity to restore on patient pages (the clinician area may switch the active persona). */
export const getPatientPersona = () => localStorage.getItem(PATIENT_KEY) ?? "alex";
export function setSession(next: SessionMode, persona?: string) {
  mode = next;
  if (next) localStorage.setItem(MODE_KEY, next);
  else localStorage.removeItem(MODE_KEY);
  if (persona) { localStorage.setItem(PATIENT_KEY, persona); setPersona(persona); }
  emitSession();
}

// ---- guest answers kept in the browser until sign-in, then carried over to the new journey ----
export interface GuestDraft { questionnaire?: Questionnaire; pathway?: PathwaySuggestion }
const GUEST_KEY = "visitready-guest";
let guest: GuestDraft = (() => { try { return JSON.parse(localStorage.getItem(GUEST_KEY) ?? "{}") as GuestDraft; } catch { return {}; } })();
export const getGuest = () => guest;
export const useGuest = () => useSyncExternalStore(subscribeSession, getGuest);
export function setGuest(next: GuestDraft) {
  guest = next;
  localStorage.setItem(GUEST_KEY, JSON.stringify(next));
  emitSession();
}
export const clearGuest = () => setGuest({});

/** Appends the active persona to a relative /api path, e.g. vurl("/visit") → "/visit?persona=alex". */
export const vurl = (path: string) => `${path}${path.includes("?") ? "&" : "?"}persona=${encodeURIComponent(getPersona())}`;
