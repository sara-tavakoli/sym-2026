import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronDown, ClipboardCheck, Compass, ListChecks, LogOut, RotateCcw, Stethoscope, User, Phone, Leaf } from "lucide-react";
import DemoGuide from "@/components/DemoGuide";
import NotificationBell from "@/components/NotificationBell";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clearGuest, useSessionMode, useSignedIn } from "@/lib/persona";
import { signOut as doSignOut, useMe } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { clinicianHome, setClinicianSignedIn, useClinicianSignedIn } from "@/lib/clinicianSession";
import { useCurrentPersona } from "@/lib/hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { vurl } from "@/lib/persona";
import { apiPost } from "@/lib/api";
import { useVisitMutation } from "@/lib/hooks";
import type { Visit } from "@/lib/types";
import { cn } from "@/lib/utils";

// "My journey" is the parent; its three steps live in a submenu instead of competing as top-level tabs.
const JOURNEY_STEPS = [
  { to: "/patient/navigate", label: "Find care", n: 1, id: "navigate", icon: Compass, hint: "Answer a few questions and book the right appointment" },
  { to: "/patient/prep", label: "Prepare", n: 2, id: "prep", icon: ClipboardCheck, hint: "Turn your concerns into a brief for your doctor" },
  { to: "/patient/follow-through", label: "Follow-through", n: 3, id: "follow-through", icon: ListChecks, hint: "Track the plan your clinician approved" },
];
const PATIENT_NAV: { to: string; label: string; id: string; n?: number }[] = [
  { to: "/patient", label: "Home", id: "home" },
  { to: "/patient/journey", label: "My journey", id: "journey" },
];

export default function AppShell({ children, mode = "patient" }: { children: ReactNode; mode?: "patient" | "clinician" }) {
  const navigate = useNavigate();
  const [resetOpen, setResetOpen] = useState(false);
  const reset = useVisitMutation(() => apiPost<Visit>(vurl("/visit/reset")));
  const clinician = mode === "clinician";
  const { pathname } = useLocation();
  const inJourney = pathname.startsWith("/patient/") && pathname !== "/patient" && pathname !== "/patient/sign-in";
  const clinicianSignedIn = useClinicianSignedIn();
  const patientSignedIn = useSignedIn();
  const persona = useCurrentPersona();
  const sessionMode = useSessionMode();
  const me = useMe();
  const qc = useQueryClient();
  const accountName = me.data ? (me.data.profile.preferred_name || me.data.profile.full_name || me.data.email) : "";
  const shownName = sessionMode === "account" ? accountName.split(" ")[0] : persona?.patient.name.split(" ")[0] ?? "";
  const shownInitials = sessionMode === "account" ? (accountName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "Me") : persona?.initials ?? "…";
  const here = encodeURIComponent(pathname + window.location.search);

  const signOut = () => {
    void doSignOut(qc);
    toast.success("Signed out");
    navigate("/patient");
  };

  const doReset = () => {
    if (!clinician && !patientSignedIn) {
      clearGuest();
      setResetOpen(false);
      toast.success("Demo reset — your guest answers were cleared");
      navigate("/patient");
      return;
    }
    reset.mutate(undefined, {
      onSuccess: () => {
        setResetOpen(false);
        toast.success(`Demo reset — ${persona?.patient.name ?? "the"} journey starts fresh`);
        navigate("/patient");
      },
    });
  };

  return (
    <div className={cn("min-h-screen flex flex-col", clinician ? "bg-[#F5F7F6]" : "bg-cream")}>
      <div data-testid="demo-boundary-strip" className="bg-sand border-b border-line text-ink-muted text-[11px]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-1 flex flex-wrap items-center justify-between gap-2">
          <span>
            <span className="font-semibold text-terracotta tracking-[0.15em] uppercase mr-2">Demo</span>
            Simulated journey with fictional patients, clinics and clinicians. Not a real healthcare service.
          </span>
          <span className="flex items-center gap-3">
            <span data-testid="emergency-call-notice" className="inline-flex items-center gap-1.5 rounded-full bg-[#FEE2E2] text-[#991B1B] px-2.5 py-0.5 font-medium">
              <Phone className="size-3.5" /> In an emergency call <a href="tel:000" className="font-bold underline-offset-2 hover:underline">000</a>
            </span>
            <button
              data-testid="reset-demo-btn"
              onClick={() => setResetOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-0.5 text-[11px] text-ink hover:border-eucalypt/50 transition-colors duration-200"
            >
              <RotateCcw className="size-3" /> Reset demo
            </button>
            <button
              data-testid={clinician ? "demo-switch-to-patient" : "demo-switch-to-clinician"}
              onClick={() => navigate(clinician ? "/patient/journey" : clinicianHome())}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-0.5 text-[11px] text-ink hover:border-eucalypt/50 transition-colors duration-200"
            >
              {clinician ? <User className="size-3" /> : <Stethoscope className="size-3" />} Demo: switch to {clinician ? "Patient" : "Clinician"}
            </button>
          </span>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-line/80 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link to={clinician ? clinicianHome() : "/patient"} data-testid="brand-home-link" className="flex items-center gap-2 shrink-0">
            <span className="size-8 rounded-full bg-eucalypt text-white grid place-items-center">
              <Leaf className="size-4" />
            </span>
            <span className="font-heading text-xl font-semibold tracking-tight text-ink">VisitReady</span>
          </Link>

          {!clinician && (
            <nav className="hidden md:flex items-center gap-1 ml-4">
              <NavLink
                to="/patient"
                end
                data-testid="nav-home-link"
                className={({ isActive }) => cn("px-4 py-2 rounded-full text-[15px] font-medium transition-[background-color,color,box-shadow] duration-200", isActive ? "bg-eucalypt text-white shadow-[0_8px_20px_-10px_rgba(23,46,39,0.7)]" : "text-ink hover:bg-eucalypt-soft hover:text-eucalypt")}
              >
                Home
              </NavLink>
              <DropdownMenu>
                <DropdownMenuTrigger
                  data-testid="nav-journey-menu"
                  className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[15px] font-medium transition-[background-color,color,box-shadow] duration-200",
                    inJourney ? "bg-eucalypt text-white shadow-[0_8px_20px_-10px_rgba(23,46,39,0.7)]" : "text-ink hover:bg-eucalypt-soft hover:text-eucalypt",
                  )}
                >
                  My journey <ChevronDown className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={10} className="w-80 rounded-2xl border-line p-2 shadow-[0_24px_48px_-24px_rgba(23,46,39,0.45)]">
                  <DropdownMenuGroup>
                    {JOURNEY_STEPS.map((j) => {
                      const on = pathname.startsWith(j.to);
                      return (
                        <DropdownMenuItem
                          key={j.to}
                          data-testid={`nav-${j.id}-link`}
                          onClick={() => navigate(j.to)}
                          className={cn("group items-start gap-3 rounded-xl px-3 py-2.5 cursor-pointer", on && "bg-eucalypt-soft")}
                        >
                          <span className={cn("mt-0.5 size-9 shrink-0 rounded-xl grid place-items-center transition-colors duration-200", on ? "bg-eucalypt text-white" : "bg-sand text-eucalypt group-focus:bg-eucalypt group-focus:text-white")}>
                            <j.icon className="size-4" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[15px] font-medium text-ink">{j.label}</span>
                            <span className="block text-xs text-ink-muted leading-snug">{j.hint}</span>
                          </span>
                          {on && <Check className="mt-1 size-4 text-eucalypt" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          )}
          {clinician && (
            <div className="ml-3 flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#FEF3C7] text-[#92400E] px-3 py-1 text-xs font-semibold">
                <Stethoscope className="size-3.5" /> Clinician Demo Mode
              </span>
              {clinicianSignedIn && (
                <NavLink
                  to="/clinician/dashboard"
                  data-testid="nav-clinician-dashboard-link"
                  className={({ isActive }) =>
                    cn("hidden md:inline px-3 py-1.5 rounded-full text-sm transition-colors duration-200", isActive ? "bg-eucalypt-soft text-eucalypt font-medium" : "text-ink-muted hover:text-ink hover:bg-sand")
                  }
                >
                  Today's appointments
                </NavLink>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {clinician && clinicianSignedIn && (
              <Button
                variant="ghost"
                size="sm"
                data-testid="clinician-sign-out-btn"
                className="text-ink-muted"
                onClick={() => { setClinicianSignedIn(false); navigate("/clinician"); }}
              >
                <LogOut className="size-4" /> <span className="hidden lg:inline">Sign out</span>
              </Button>
            )}
            {!clinician && patientSignedIn && (
              <>
                <NotificationBell audience="patient" />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    data-testid="patient-account-btn"
                    className="flex items-center gap-2 rounded-full border border-line bg-white pl-1 pr-3 py-1 text-[15px] hover:border-eucalypt/50 transition-colors duration-200"
                  >
                    <span className="size-8 rounded-full bg-[#FCD34D] text-eucalypt-deep grid place-items-center text-xs font-semibold">{shownInitials}</span>
                    <span data-testid="persona-current-name" className="hidden sm:inline font-medium text-ink">{shownName}</span>{sessionMode === "demo" && <span className="rounded-full bg-[#FEF3C7] text-[#92400E] px-1.5 text-[10px] font-bold">DEMO</span>}
                    <ChevronDown className="size-3.5 text-ink-muted" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{sessionMode === "account" ? me.data?.email : persona ? `${persona.patient.name} · fictional demo patient` : "Demo patient"}</DropdownMenuLabel>
                      {sessionMode === "account" && (
                        <DropdownMenuItem data-testid="patient-profile-link" onClick={() => navigate("/patient/profile")} className="gap-2"><User className="size-4" /> My profile</DropdownMenuItem>
                      )}
                      <DropdownMenuItem data-testid="patient-sign-out-btn" onClick={signOut} className="gap-2">
                        <LogOut className="size-4" /> Sign out
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            {!clinician && !patientSignedIn && (
              <>
                <Button variant="ghost" data-testid="header-sign-in-btn" className="h-10 rounded-full px-5 text-[15px] font-medium text-ink hover:bg-eucalypt-soft hover:text-eucalypt" onClick={() => navigate(`/patient/sign-in?next=${here}`)}>
                  Sign in
                </Button>
                <Button data-testid="header-sign-up-btn" className="h-10 rounded-full bg-eucalypt hover:bg-eucalypt-deep text-white px-6 text-[15px] font-semibold" onClick={() => navigate(`/patient/sign-in?mode=signup&next=${here}`)}>
                  Sign up
                </Button>
              </>
            )}
            {clinician && clinicianSignedIn && <NotificationBell audience={clinician ? "clinician" : "patient"} />}
          </div>
        </div>
        {!clinician && (
          <nav className="md:hidden flex items-center gap-1 overflow-x-auto px-4 pb-2">
            {[...PATIENT_NAV, ...JOURNEY_STEPS].map((n: { to: string; label: string; id: string; n?: number }) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/patient"}
                data-testid={`mobile-nav-${n.id}-link`}
                className={({ isActive }) =>
                  cn("px-3 py-1 rounded-full text-sm whitespace-nowrap", isActive ? "bg-eucalypt-soft text-eucalypt" : "text-ink-muted")
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <div className="h-16" aria-hidden />

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent data-testid="reset-demo-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Reset the demo?</DialogTitle>
            <DialogDescription>
              {!clinician && !patientSignedIn ? "This clears any answers or appointment time you picked as a guest." : `This clears ${persona?.patient.name ?? "this patient"}'s questionnaire, booking, brief, clinical notes and follow-up tasks so you can run the journey again.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" data-testid="reset-demo-cancel-btn" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button data-testid="reset-demo-confirm-btn" onClick={doReset} disabled={reset.isPending}>
              {reset.isPending ? "Resetting…" : "Reset journey"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DemoGuide />
      <Toaster richColors offset={{ bottom: 80, right: 20 }} />
    </div>
  );
}
