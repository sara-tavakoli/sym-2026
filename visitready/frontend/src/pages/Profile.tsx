import { useNavigate, useSearchParams, Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import ProfileForm from "@/components/ProfileForm";
import { buttonVariants } from "@/components/ui/button";
import { useMe } from "@/lib/auth";
import { useSessionMode } from "@/lib/persona";
import { cn } from "@/lib/utils";

export default function Profile() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");
  const mode = useSessionMode();
  const me = useMe();

  return (
    <AppShell>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-8 sm:pt-12 animate-fade-up">
        <p className="tracking-[0.15em] uppercase text-[11px] font-semibold text-terracotta">Your account</p>
        <h1 className="mt-1 mb-6 text-[32px] sm:text-[40px] leading-tight tracking-tight text-ink">Patient profile</h1>
        {mode !== "account" ? (
          <div data-testid="profile-signed-out" className="rounded-3xl frost-card p-8 max-w-2xl">
            <p className="text-ink">{mode === "demo" ? "Demo patients use fictional details — there's no profile to edit." : "Sign in to see your profile."}</p>
            {mode !== "demo" && <Link to="/patient/sign-in?next=/patient/profile" className={cn(buttonVariants(), "mt-4 rounded-full")}>Sign in</Link>}
          </div>
        ) : me.isLoading ? (
          <div className="h-80 max-w-2xl rounded-3xl ai-shimmer" />
        ) : me.data ? (
          <ProfileForm user={me.data} editAll={!next} onSaved={() => navigate(next || "/patient/journey")} onCancel={next ? undefined : () => navigate(-1)} />
        ) : null}
      </section>
    </AppShell>
  );
}
