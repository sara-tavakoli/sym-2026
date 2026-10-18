import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, type User } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Logo, Spinner } from "../components/ui";

// Only known in-app destinations are honoured after the demo starts (no open redirect).
const NEXT: Record<string, string> = { "fit-finder": "/app/fit-finder", assistant: "/app/assistant" };

// Creates a private sandbox account with fictional data, then opens the dashboard (or a chosen tool).
export default function TryDemo() {
  const { setUser } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const started = useRef(false);
  const dest = NEXT[params.get("next") ?? ""] ?? "/app";

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in development
    started.current = true;
    api.post<{ user: User }>("/demo")
      .then((r) => { setUser(r.user); nav(dest, { replace: true }); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not start the demo. Please try again."));
  }, [nav, setUser, dest]);

  return (
    <div className="auth-wrap">
      <div className="auth-card stack fade-in" style={{ textAlign: "center" }}>
        <Link to="/" className="brand" style={{ justifyContent: "center" }}><Logo size={34} /><span className="wordmark">CarePath</span><span className="wordmark-ai">AI</span></Link>
        <div className="card stack">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <Link className="btn primary" to="/register">Create an account instead</Link>
            </>
          ) : (
            <>
              <p className="eyebrow">Live demo</p>
              <h1 style={{ fontSize: "1.6rem", marginTop: ".35rem" }}>Setting up your demo…</h1>
              <p className="muted">A private sandbox with fictional appointments, a prepared brief and follow-up tasks. It's deleted after 24 hours.</p>
              <div><Spinner /></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
