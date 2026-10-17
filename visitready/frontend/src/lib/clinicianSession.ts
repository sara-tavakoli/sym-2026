import { useSyncExternalStore } from "react";

// Demo-only clinician "sign in": a local flag, no credentials. Production would require verified clinician auth.
const KEY = "visitready-clinician";
const listeners = new Set<() => void>();
const read = () => typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "dr-lin";

export function setClinicianSignedIn(on: boolean) {
  if (on) localStorage.setItem(KEY, "dr-lin");
  else localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

export const useClinicianSignedIn = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
  );

export const clinicianHome = () => (read() ? "/clinician/dashboard" : "/clinician");
