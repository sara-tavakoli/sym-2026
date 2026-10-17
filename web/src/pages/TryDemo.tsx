import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type User } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Logo, Spinner } from "../components/ui";

// Creates a private sandbox account with fictional data, then opens the dashboard.
export default function TryDemo() {
  const { setUser } = useApp();
  const nav = useNavigate();
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in development
    started.current = true;
    api.post<{ user: User }>("/demo")
      .then((r) => { setUser(r.user); nav("/app", { replace: true }); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not start the demo. Please try again."));
  }, [nav, setUser]);

  return (
    <div className="auth-wrap">
      <div className="card stack" style={{ maxWidth: 420, margin: "15vh auto", textAlign: "center" }}>
        <div><Logo size={40} /></div>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Link className="btn primary" to="/register">Create an account instead</Link>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: "1.3rem" }}>Setting up your demo…</h1>
            <p className="muted">A private sandbox with fictional appointments, a prepared brief and follow-up tasks. It's deleted after 24 hours.</p>
            <div><Spinner /></div>
          </>
        )}
      </div>
    </div>
  );
}
