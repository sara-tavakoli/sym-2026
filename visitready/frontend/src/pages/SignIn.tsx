import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/AppShell";
import AuthPanel, { type AuthResult } from "@/components/AuthPanel";
import { useMe } from "@/lib/auth";
import { useSessionMode } from "@/lib/persona";

/** Header Sign in / Sign up. `next` returns the user to where they started. */
export default function SignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/patient";
  const signup = params.get("mode") === "signup";
  const mode = useSessionMode();
  const me = useMe();

  const finish = (r: AuthResult) => {
    if (r.kind === "account" && !r.user.profile_complete) navigate(`/patient/profile?next=${encodeURIComponent(next)}`, { replace: true });
    else navigate(next, { replace: true });
  };

  // Returning from Google sign-in lands back here already signed in.
  useEffect(() => {
    if (mode === "demo") navigate(next, { replace: true });
    if (mode === "account" && me.data) finish({ kind: "account", user: me.data });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, me.data]);

  return (
    <AppShell>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-8 sm:pt-12 animate-fade-up">
        <button
          type="button"
          data-testid="sign-in-back-btn"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/patient"))}
          className="group mb-6 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:border-eucalypt/50 hover:text-eucalypt transition-colors duration-200"
        >
          <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" /> Back
        </button>
        <h1 data-testid="sign-in-title" className="text-[32px] sm:text-[40px] leading-tight tracking-tight text-ink">{signup ? "Join VisitReady" : "Sign in to VisitReady"}</h1>
        <p className="mt-1 mb-6 text-[15px] text-ink-muted">Browse care freely — an account is only needed to confirm a booking.</p>
        <AuthPanel initialTab={signup ? "signup" : "signin"} returnPath={`/patient/sign-in?next=${encodeURIComponent(next)}`} onDone={finish} />
      </section>
    </AppShell>
  );
}
