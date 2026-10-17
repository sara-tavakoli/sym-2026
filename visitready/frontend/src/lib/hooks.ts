import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";
import { ApiError, apiGet } from "@/lib/api";
import { usePersonaId, useSignedIn, vurl } from "@/lib/persona";
import type { Clinic, Persona, Service, Transcript, Visit, NearbyClinics } from "@/lib/types";

export const visitKey = (persona: string) => ["visit", persona] as const;

export function useVisit() {
  const persona = usePersonaId();
  const signedIn = useSignedIn();
  const clinicianArea = useLocation().pathname.startsWith("/clinician");
  // Guests have no journey yet — patient pages render their empty states. Clinicians always see the visit.
  return useQuery({ queryKey: visitKey(persona), queryFn: () => apiGet<Visit>(vurl(clinicianArea ? "/clinician/visit" : "/visit")), enabled: signedIn || clinicianArea });
}
/** Server-anchored "today" (Melbourne), for pages that render without a visit. */
export const useToday = () => useQuery({ queryKey: ["today"], queryFn: () => apiGet<{ today: string }>("/today"), staleTime: 60_000 });
export const usePersonas = () => useQuery({ queryKey: ["personas"], queryFn: () => apiGet<Persona[]>("/personas"), staleTime: Infinity });
/** The active persona's profile + demo answers (undefined while loading / offline). */
export function useCurrentPersona(): Persona | undefined {
  const id = usePersonaId();
  const signedIn = useSignedIn();
  const list = usePersonas().data;
  return signedIn ? list?.find((p) => p.id === id) : undefined;
}
export const useNearbyClinics = (location: string, radiusKm: number) =>
  useQuery({
    queryKey: ["clinics-nearby", location.trim().toLowerCase(), radiusKm],
    queryFn: () => apiGet<NearbyClinics>(`/clinics/nearby?location=${encodeURIComponent(location.trim())}&radius_km=${radiusKm}`),
    enabled: location.trim().length >= 2,
    retry: false,
    staleTime: 5 * 60_000,
  });
export const useClinics = () => useQuery({ queryKey: ["clinics"], queryFn: () => apiGet<Clinic[]>("/clinics") });
export const useServices = () => useQuery({ queryKey: ["services"], queryFn: () => apiGet<Service[]>("/services") });
export function useTranscript() {
  const persona = usePersonaId();
  return useQuery({ queryKey: ["transcript", persona], queryFn: () => apiGet<Transcript>(vurl("/demo/transcript")) });
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const detail = (e.body as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && typeof detail[0]?.msg === "string") return String(detail[0].msg).replace(/^Value error, /, "");
    return "Please check the details and try again.";
  }
  return "We couldn't reach the server. Please try again.";
}

/** Every journey mutation returns the updated Visit, so we write it straight into the cache. */
export function useVisitMutation<B>(fn: (body: B) => Promise<Visit>, successMessage?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (v) => {
      qc.setQueryData(visitKey(v.persona), v);
      qc.invalidateQueries({ queryKey: ["clinician-dashboard"] });
      if (successMessage) toast.success(successMessage);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export interface Stage { key: string; label: string; short: string; path: string; done: boolean }

export function journeyStages(v?: Visit): Stage[] {
  const tasks = v?.tasks ?? [];
  return [
    { key: "find", label: "Find care & book", short: "Find care", path: "/patient/navigate", done: !!v?.booking },
    { key: "prep", label: "Prepare brief", short: "Prepare", path: "/patient/prep", done: v?.brief?.status === "saved" },
    {
      key: "follow", label: "Follow through", short: "Follow-through", path: "/patient/follow-through",
      done: tasks.length > 0 && tasks.every((t) => t.status === "completed"),
    },
  ];
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
