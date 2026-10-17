import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff, Loader2, Lock, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { completeAccountSignIn, googleSignIn, pwChecks, startDemo } from "@/lib/auth";
import { errorMessage } from "@/lib/hooks";
import type { OkResponse, PublicUser } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AuthResult = { kind: "account"; user: PublicUser } | { kind: "demo"; persona: string };
type Tab = "signin" | "signup" | "forgot";

const DEMOS = [
  { id: "alex", name: "Alex Turner" },
  { id: "priya", name: "Priya Sharma" },
];

function PasswordField({ id, label, value, onChange, autoComplete, testid }: {
  id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; testid: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-ink">{label}</Label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-muted" />
        <Input id={id} data-testid={testid} type={show ? "text" : "password"} value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} className="h-11 bg-white pl-9 pr-11" />
        <button type="button" data-testid={`${testid}-toggle`} onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-1.5 top-1/2 -translate-y-1/2 size-8 grid place-items-center rounded-lg text-ink-muted hover:bg-sand hover:text-ink transition-colors duration-200">
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

/** Sign in / Sign up / Forgot password + clearly separated demo access. Used on /patient/sign-in and inside the booking flow. */
export default function AuthPanel({ initialTab = "signin", returnPath, onDone }: { initialTab?: "signin" | "signup"; returnPath: string; onDone: (r: AuthResult) => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState<string | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const checks = pwChecks(password);
  const signupOk = emailOk && checks.every((c) => c.ok) && password === confirm;
  const switchTab = (t: Tab) => { setTab(t); setError(null); setPassword(""); setConfirm(""); setResetSent(null); };

  const submitAccount = async (path: "/auth/login" | "/auth/signup") => {
    setError(null);
    setBusy(path);
    try {
      const user = await apiPost<PublicUser>(path, { email: email.trim(), password });
      await completeAccountSignIn(qc, user);
      toast.success(path === "/auth/signup" ? "Account created" : `Welcome back${user.name ? `, ${user.name}` : ""}`);
      onDone({ kind: "account", user });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const sendReset = async () => {
    setError(null);
    setBusy("forgot");
    try {
      const r = await apiPost<OkResponse>("/auth/forgot", { email: email.trim() });
      setResetSent(r.message ?? "Check your inbox for a reset link.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const demo = async (id: string, name: string) => {
    setBusy(`demo-${id}`);
    try {
      await startDemo(qc, id);
      toast.success(`Demo mode: ${name} (fictional patient)`);
      onDone({ kind: "demo", persona: id });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-testid="auth-panel" className="grid lg:grid-cols-[1fr_300px] gap-5">
      <div className="rounded-3xl frost-card p-5 sm:p-7">
        {tab !== "forgot" ? (
          <div role="tablist" aria-label="Sign in or sign up" className="grid grid-cols-2 rounded-full bg-sand p-1">
            {(["signin", "signup"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} data-testid={`auth-tab-${t}`} onClick={() => switchTab(t)}
                className={cn("h-10 rounded-full text-[15px] font-medium transition-[background-color,color,box-shadow] duration-200", tab === t ? "bg-white text-eucalypt shadow-sm" : "text-ink-muted hover:text-ink")}>
                {t === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>
        ) : (
          <button data-testid="auth-forgot-back" onClick={() => switchTab("signin")} className="text-sm text-eucalypt font-medium hover:underline">← Back to sign in</button>
        )}

        <h2 className="mt-5 text-2xl text-ink">{tab === "signin" ? "Welcome back" : tab === "signup" ? "Create your account" : "Reset your password"}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {tab === "signin" ? "Sign in to confirm your appointment." : tab === "signup" ? "It takes a minute. We'll ask a few details next." : "Enter your account email and we'll send you a reset link."}
        </p>

        <form
          className="mt-5 space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (tab === "signin") submitAccount("/auth/login");
            else if (tab === "signup") submitAccount("/auth/signup");
            else sendReset();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="auth-email" className="text-ink">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-muted" />
              <Input id="auth-email" data-testid="auth-email-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-11 bg-white pl-9" />
            </div>
            {email && !emailOk && <p className="text-xs text-[#B42318]">Enter a valid email address</p>}
          </div>

          {tab === "signin" && (
            <>
              <PasswordField id="auth-password" testid="auth-password-input" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
              <div className="flex justify-end -mt-1">
                <button type="button" data-testid="auth-forgot-link" onClick={() => switchTab("forgot")} className="text-sm text-eucalypt font-medium hover:underline">Forgot password?</button>
              </div>
            </>
          )}

          {tab === "signup" && (
            <>
              <PasswordField id="auth-new-password" testid="auth-new-password-input" label="Password" value={password} onChange={setPassword} autoComplete="new-password" />
              <ul data-testid="auth-password-rules" className="grid grid-cols-3 gap-1.5 text-[12px]">
                {checks.map((c) => (
                  <li key={c.id} className={cn("flex items-center gap-1 rounded-full px-2 py-1 transition-colors duration-200", c.ok ? "bg-eucalypt-soft text-eucalypt" : "bg-sand text-ink-muted")}>
                    <Check className={cn("size-3", !c.ok && "opacity-30")} /> {c.label}
                  </li>
                ))}
              </ul>
              <PasswordField id="auth-confirm" testid="auth-confirm-password-input" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
              {confirm && confirm !== password && <p className="text-xs text-[#B42318] -mt-2">Passwords don't match</p>}
            </>
          )}

          {error && <p data-testid="auth-error" role="alert" className="rounded-xl bg-[#FEF3F2] border border-[#FECDCA] px-3 py-2 text-sm text-[#B42318]">{error}</p>}
          {resetSent && <p data-testid="auth-reset-sent" className="rounded-xl bg-eucalypt-soft px-3 py-2 text-sm text-eucalypt">{resetSent}</p>}

          {tab === "signin" && (
            <Button type="submit" data-testid="auth-signin-submit" disabled={!emailOk || !password || busy !== null} className="w-full h-11 rounded-full text-[15px]">
              {busy === "/auth/login" ? <><Loader2 className="size-4 animate-spin" /> Signing in…</> : "Sign in"}
            </Button>
          )}
          {tab === "signup" && (
            <Button type="submit" data-testid="auth-signup-submit" disabled={!signupOk || busy !== null} className="w-full h-11 rounded-full text-[15px]">
              {busy === "/auth/signup" ? <><Loader2 className="size-4 animate-spin" /> Creating account…</> : "Create account"}
            </Button>
          )}
          {tab === "forgot" && (
            <Button type="submit" data-testid="auth-forgot-submit" disabled={!emailOk || busy !== null} className="w-full h-11 rounded-full text-[15px]">
              {busy === "forgot" ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : "Send reset link"}
            </Button>
          )}
        </form>

        {tab !== "forgot" && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-ink-muted"><span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" /></div>
            <Button variant="outline" data-testid="auth-google-btn" onClick={() => googleSignIn(returnPath)} className="w-full h-11 rounded-full bg-white text-[15px]">
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" /></svg>
              Continue with Google
            </Button>
            <p className="mt-5 text-center text-sm text-ink-muted">
              {tab === "signin" ? "New to VisitReady? " : "Already have an account? "}
              <button type="button" data-testid={tab === "signin" ? "auth-to-signup-link" : "auth-to-signin-link"} onClick={() => switchTab(tab === "signin" ? "signup" : "signin")} className="font-semibold text-eucalypt hover:underline">
                {tab === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </>
        )}
      </div>

      <aside className="space-y-4">
        <div data-testid="demo-access-card" className="rounded-3xl border-2 border-dashed border-[#FCD34D] bg-[#FFFBEB] p-5">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[#FCD34D] text-eucalypt-deep px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em]"><Sparkles className="size-3" /> Demo mode</p>
          <p className="mt-2 text-sm text-ink">Explore with a fictional patient. This is not real sign-in and uses no real personal information.</p>
          <div className="mt-3 space-y-2">
            {DEMOS.map((d) => (
              <Button key={d.id} variant="outline" data-testid={`demo-continue-${d.id}`} disabled={busy !== null} onClick={() => demo(d.id, d.name)} className="w-full h-10 rounded-full bg-white justify-center">
                {busy === `demo-${d.id}` ? <Loader2 className="size-4 animate-spin" /> : null} Continue as {d.name} (Demo)
              </Button>
            ))}
          </div>
        </div>
        <div data-testid="auth-privacy-notice" className="rounded-3xl bg-sand/70 p-5 text-xs text-ink-muted leading-relaxed">
          <p className="font-semibold text-ink text-sm">Your privacy</p>
          <p className="mt-1">We use your email to create and secure your account, and your name, date of birth and mobile so the clinic can identify you for your appointment. Passwords are stored hashed and never shown. Your preparation notes are never shared with a clinician unless you choose to share them.</p>
          <p className="mt-1">VisitReady is a hackathon prototype with fictional clinics — it is not a certified medical records system.</p>
        </div>
      </aside>
    </div>
  );
}
