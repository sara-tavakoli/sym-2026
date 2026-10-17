import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type User } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Disclaimer, Field, Logo, Spinner } from "../components/ui";

export default function Auth({ mode }: { mode: "login" | "register" }) {
  const { user, loading, setUser } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isReg = mode === "register";

  if (!loading && user) return <Navigate to="/app" replace />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError("");
    try {
      const r = await api.post<{ user: User }>(`/auth/${mode}`, { email: f.get("email"), password: f.get("password"), name: f.get("name") });
      setUser(r.user);
      const next = params.get("next");
      nav(next === "preparation" || next === "follow-up" ? `/app/${next}` : "/app", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card stack fade-in">
        <Link to="/" className="brand" style={{ justifyContent: "center", color: "var(--text)" }}><Logo /> CarePath AI</Link>
        <div className="card">
          <h1 style={{ fontSize: "1.5rem" }}>{isReg ? "Create your account" : "Welcome back"}</h1>
          <p className="muted small">{isReg ? "Demo use only — please use fictional information." : "Log in to see your appointments and tasks."}</p>
          {error && <div className="alert error" role="alert">{error}</div>}
          <form onSubmit={submit}>
            {isReg && <Field label="Name"><input name="name" autoComplete="name" required maxLength={100} /></Field>}
            <Field label="Email"><input name="email" type="email" autoComplete="email" required /></Field>
            <Field label="Password" hint={isReg ? "At least 8 characters" : undefined}>
              <input name="password" type="password" autoComplete={isReg ? "new-password" : "current-password"} required minLength={isReg ? 8 : undefined} />
            </Field>
            <button className="btn primary" style={{ width: "100%" }} disabled={busy}>{busy && <Spinner />} {isReg ? "Create account" : "Log in"}</button>
          </form>
          <p className="small muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
            {isReg ? <>Already have an account? <Link to="/login">Log in</Link></> : <>New here? <Link to="/register">Create an account</Link></>}
          </p>
        </div>
        <Disclaimer compact />
      </div>
    </div>
  );
}
