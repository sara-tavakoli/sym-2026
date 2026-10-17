import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, ShieldCheck, Stethoscope, User } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { setClinicianSignedIn, useClinicianSignedIn } from "@/lib/clinicianSession";

export default function ClinicianWelcome() {
  const navigate = useNavigate();
  const signedIn = useClinicianSignedIn();
  if (signedIn) return <Navigate to="/clinician/dashboard" replace />;

  return (
    <AppShell mode="clinician">
      <div className="relative">
        <div className="absolute inset-0 paper-grain opacity-50 pointer-events-none" aria-hidden />
        <div className="relative mx-auto max-w-2xl px-4 sm:px-6 pt-14 sm:pt-20 text-center animate-fade-up">
          <div className="mx-auto size-20 rounded-full bg-eucalypt-soft text-eucalypt grid place-items-center shadow-[0_12px_30px_-18px_rgba(13,92,77,0.7)]">
            <Stethoscope className="size-9" />
          </div>
          <p className="mt-6 tracking-[0.15em] uppercase text-xs font-semibold text-terracotta">For clinicians</p>
          <h1 data-testid="clinician-portal-title" className="mt-2 text-4xl sm:text-5xl tracking-tight text-ink">Clinician Portal</h1>
          <p className="mt-4 text-lg text-ink-muted leading-relaxed">
            Manage appointments, review AI-assisted documentation and approve patient follow-up instructions.
          </p>

          <div data-testid="clinician-profile-card" className="mt-10 text-left rounded-3xl bg-white border border-line p-5 sm:p-6 shadow-[0_24px_60px_-40px_rgba(23,46,39,0.45)]">
            <p className="text-xs text-ink-muted">Fictional clinician profile</p>
            <div className="mt-3 flex items-center gap-4">
              <span className="size-12 rounded-full bg-sand text-ink grid place-items-center"><User className="size-5" /></span>
              <div>
                <p className="font-heading text-xl text-ink">Dr Sarah Lin</p>
                <p className="text-sm text-ink-muted">General Practitioner · Carlton Family Medical · Demo account</p>
              </div>
            </div>
            <Button
              data-testid="continue-as-clinician-btn"
              onClick={() => { setClinicianSignedIn(true); navigate("/clinician/dashboard"); }}
              className="mt-5 w-full h-12 rounded-full bg-eucalypt-deep hover:bg-eucalypt text-base group"
            >
              Continue as Dr Sarah Lin (Demo) <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Button>
          </div>

          <p data-testid="clinician-auth-note" className="mt-5 flex items-start justify-center gap-2 text-xs text-ink-muted max-w-md mx-auto">
            <ShieldCheck className="size-4 shrink-0 text-eucalypt" />
            Demo only — no password needed. A real product would verify the clinician's identity and registration before granting access.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
