import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { pwChecks } from "@/lib/auth";
import { errorMessage } from "@/lib/hooks";
import type { OkResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const checks = pwChecks(pw);
  const ok = checks.every((c) => c.ok) && pw === confirm && !!token;

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await apiPost<OkResponse>("/auth/reset", { token, password: pw });
      setDone(r.message ?? "Password updated.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <section className="mx-auto max-w-lg px-4 sm:px-6 pt-10 sm:pt-14 animate-fade-up">
        <div className="rounded-3xl frost-card p-6 sm:p-8">
          <h1 data-testid="reset-title" className="text-[28px] leading-tight tracking-tight text-ink">Choose a new password</h1>
          {done ? (
            <>
              <p data-testid="reset-success" className="mt-3 rounded-xl bg-eucalypt-soft px-3 py-2 text-sm text-eucalypt">{done}</p>
              <Link to="/patient/sign-in" data-testid="reset-sign-in-link" className={cn(buttonVariants(), "mt-5 rounded-full")}>Go to sign in</Link>
            </>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); if (ok) submit(); }}>
              {!token && <p className="text-sm text-[#B42318]">This reset link is missing its token. Request a new one from Sign in → Forgot password.</p>}
              <div className="space-y-1.5">
                <Label htmlFor="rp-pw">New password</Label>
                <Input id="rp-pw" data-testid="reset-password-input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-11 bg-white" />
              </div>
              <ul className="grid grid-cols-3 gap-1.5 text-[12px]">
                {checks.map((c) => (
                  <li key={c.id} className={cn("flex items-center gap-1 rounded-full px-2 py-1", c.ok ? "bg-eucalypt-soft text-eucalypt" : "bg-sand text-ink-muted")}><Check className="size-3" /> {c.label}</li>
                ))}
              </ul>
              <div className="space-y-1.5">
                <Label htmlFor="rp-confirm">Confirm password</Label>
                <Input id="rp-confirm" data-testid="reset-confirm-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11 bg-white" />
                {confirm && confirm !== pw && <p className="text-xs text-[#B42318]">Passwords don't match</p>}
              </div>
              {error && <p data-testid="reset-error" role="alert" className="rounded-xl bg-[#FEF3F2] border border-[#FECDCA] px-3 py-2 text-sm text-[#B42318]">{error}</p>}
              <Button type="submit" data-testid="reset-submit-btn" disabled={!ok || busy} className="w-full h-11 rounded-full">
                {busy ? <><Loader2 className="size-4 animate-spin" /> Updating…</> : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </section>
    </AppShell>
  );
}
