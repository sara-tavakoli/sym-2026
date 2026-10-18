import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type User } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Disclaimer, Logo, Spinner } from "../components/ui";
import { DEMO, DEMO_FILL } from "../lib/demo-fill";

const BOOKING_RE = /^\/book\/[\w-]{1,80}(\?[\w=&%.:+-]*)?$/;

// Demo type-ahead: start typing and a suggestion appears in grey; Enter (or Tab / →) accepts it and moves on,
// Enter on a completed form submits. Everything suggested is fictional; the email gets a random number so a
// suggested sign-up always works. Emails used in this browser are remembered (this browser only) for sign-in.
export const DEMO_PASSWORD = "carepath123";
const DEMO_NAMES = ["Brenda Example", "Alex Sample", "Jordan Demo", "Maya Patel", "Sam Lee", "Chris Nguyen", "Priya Shah", "Tom Walker"];
const SEEDED = [{ email: "demo@carepath.example", password: "demo-password-1" }];
const REMEMBER_KEY = "carepath.accounts";
type Remembered = { email: string; demoPassword: boolean };
function remembered(): Remembered[] {
  try { const v = JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x?.email === "string") : []; } catch { return []; }
}
function remember(email: string, demoPassword: boolean) {
  try { localStorage.setItem(REMEMBER_KEY, JSON.stringify([{ email, demoPassword }, ...remembered().filter((r) => r.email !== email)].slice(0, 5))); } catch { /* storage unavailable */ }
}
const completes = (value: string, suggestion: string | null) =>
  !!suggestion && !!value && value !== suggestion && suggestion.toLowerCase().startsWith(value.toLowerCase());

export default function Auth({ mode }: { mode: "login" | "register" }) {
  const { user, loading, setUser } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tag = useMemo(() => String(Math.floor(100 + Math.random() * 900)), []);
  const isReg = mode === "register";
  // Demo defaults: sign-up starts with a fresh fictional account, log-in with the presenter account.
  const [name, setName] = useState(DEMO_FILL && isReg ? DEMO.name : "");
  const [email, setEmail] = useState(!DEMO_FILL ? "" : isReg ? `brenda.example${tag}@example.com` : DEMO.login.email);
  const [password, setPassword] = useState(!DEMO_FILL ? "" : isReg ? DEMO_PASSWORD : DEMO.login.password);
  const next = params.get("next");
  // Only known in-app destinations are honoured (no open redirect); care circle invites come back to /join/<token>,
  // a booking in progress comes back to /book/<provider>?slot=…, and public care pages come back to themselves.
  const dest = next && /^\/join\/[a-f0-9]{64}$/.test(next) ? next
    : next && BOOKING_RE.test(next) ? next
    : next && /^\/(get-care|find-care|search)(\?[\w=&%.:,+-]*)?$/.test(next) ? next
    : next === "preparation" || next === "follow-up" ? `/app/${next}` : "/app";
  const booking = !!next && BOOKING_RE.test(next);
  const keep = next ? `?next=${encodeURIComponent(next)}` : "";

  // Suggestions for the current input.
  const nameSuggestion = DEMO_NAMES.find((n) => completes(name, n)) ?? null;
  const known = [...remembered(), ...SEEDED.map((s) => ({ email: s.email, demoPassword: false }))];
  const emailSuggestion = isReg
    ? (() => { const parts = (name.trim() || "Brenda Example").toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean); return `${parts.join(".") || "brenda"}${tag}@example.com`; })()
    : known.find((k) => completes(email, k.email))?.email ?? null;
  const passwordSuggestion = isReg ? DEMO_PASSWORD
    : email.trim().toLowerCase() === DEMO.login.email ? DEMO.login.password
    : SEEDED.find((s) => s.email === email.trim().toLowerCase())?.password ?? (remembered().find((r) => r.email === email.trim().toLowerCase())?.demoPassword ? DEMO_PASSWORD : null);

  if (!loading && user) return <Navigate to={dest} replace />;

  async function submit(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await api.post<{ user: User }>(`/auth/${mode}`, { email, password, name });
      if (isReg) remember(r.user.email, password === DEMO_PASSWORD);
      else if (!remembered().some((x) => x.email === r.user.email)) remember(r.user.email, password === DEMO_PASSWORD);
      setUser(r.user);
      nav(dest, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card stack fade-in">
        <Link to="/" className="brand" style={{ justifyContent: "center" }}><Logo size={34} /><span className="wordmark">CarePath</span><span className="wordmark-ai">AI</span></Link>
        <div className="card">
          <h1 style={{ fontSize: "1.5rem" }}>{isReg ? "Create your account" : "Welcome back"}</h1>
          <p className="muted small">{isReg ? "Demo use only — please use fictional information." : "Log in to see your appointments and tasks."}</p>
          {booking && <div className="alert info" role="note">{isReg ? "Create an account" : "Sign in"} to finish your booking. Your chosen time is kept and you'll come straight back to confirm it.</div>}
          {error && <div className="alert error" role="alert">{error}</div>}
          <form onSubmit={submit}>
            {isReg && (
              <SuggestField label="Name" value={name} onChange={setName} suggestion={nameSuggestion}
                input={{ name: "name", autoComplete: "name", required: true, maxLength: 100, placeholder: "Start typing, e.g. B" }} />
            )}
            <SuggestField label="Email" value={email} onChange={setEmail} suggestion={emailSuggestion} offerWhenEmpty={isReg}
              input={{ name: "email", type: "email", autoComplete: "email", required: true }} />
            <SuggestField label="Password" value={password} onChange={setPassword} suggestion={passwordSuggestion} offerWhenEmpty secret
              hint={isReg ? "At least 8 characters" : undefined}
              input={{ name: "password", type: "password", autoComplete: isReg ? "new-password" : "current-password", required: true, minLength: isReg ? 8 : undefined }} />
            <button className="btn primary" style={{ width: "100%" }} disabled={busy}>{busy && <Spinner />} {isReg ? "Create account" : "Log in"}</button>
          </form>
          <p className="small muted" style={{ marginTop: ".8rem", marginBottom: 0 }}>Tip: start typing and press <kbd>Enter</kbd> to accept the grey suggestion.</p>
          <p className="small muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
            {isReg ? <>Already have an account? <Link to={`/login${keep}`}>Log in</Link></> : <>New here? <Link to={`/register${keep}`}>Create an account</Link></>}
          </p>
        </div>
        <Disclaimer compact />
      </div>
    </div>
  );
}

/** A field with inline type-ahead: grey completion text; Enter / Tab / → accepts and Enter moves to the next field. */
function SuggestField({ label, value, onChange, suggestion, input, hint, offerWhenEmpty = false, secret = false }: {
  label: string; value: string; onChange: (v: string) => void; suggestion: string | null; hint?: string;
  offerWhenEmpty?: boolean; secret?: boolean; input: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const [focused, setFocused] = useState(false);
  const can = !!suggestion && (completes(value, suggestion) || (offerWhenEmpty && !value));
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const form = e.currentTarget.form, fields = form ? [...form.querySelectorAll("input")] : [];
      const nextField = fields[fields.indexOf(e.currentTarget) + 1];
      if (can) {
        e.preventDefault(); onChange(suggestion!);
        if (nextField) nextField.focus(); else form?.querySelector("button")?.focus();
      } else if (nextField && value) { e.preventDefault(); nextField.focus(); } // last field: Enter submits
      return;
    }
    // Tab / → only complete something already started, so tabbing through an empty field never fills it.
    const atEnd = e.currentTarget.selectionStart === value.length;
    if (completes(value, suggestion) && (e.key === "Tab" || (e.key === "ArrowRight" && atEnd))) onChange(suggestion!);
  }
  return (
    <div className="field">
      <label>{label}
        <span className="suggest">
          <input {...input} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={can && !secret && !value ? undefined : input.placeholder} />
          {can && !secret && focused && (
            <span className="suggest-ghost" aria-hidden="true"><span className="suggest-typed">{value}</span>{suggestion!.slice(value.length)}</span>
          )}
        </span>
      </label>
      {can && focused ? (
        <div className="hint suggest-hint" aria-live="polite">Press <kbd>Enter</kbd> to use {secret ? <>the demo password <code>{suggestion}</code></> : <strong>{suggestion}</strong>}</div>
      ) : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}
