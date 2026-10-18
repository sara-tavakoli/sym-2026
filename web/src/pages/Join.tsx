import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useApp } from "../lib/app-context";
import { ROLE_HELP, ROLE_LABELS, type InviteInfo } from "../lib/circle";
import { Disclaimer, Logo, Skeletons, Spinner } from "../components/ui";

/** /join/:token: public landing for a care circle invite. Signing in or registering returns here via ?next=. */
export default function Join() {
  const { token = "" } = useParams();
  const { user, loading, logout, notify } = useApp();
  const nav = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = encodeURIComponent(`/join/${token}`);

  useEffect(() => { api.get<InviteInfo>(`/circle/join/${token}`).then(setInfo).catch((e) => setError(e.message)); }, [token]);

  async function accept() {
    setBusy(true); setError("");
    try {
      const r = await api.post<{ owner_id: string; owner_name: string }>(`/circle/join/${token}`);
      notify(`You've joined ${r.owner_name}'s care circle`);
      nav(`/app/supporting/${r.owner_id}`, { replace: true });
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not accept the invite"); }
    finally { setBusy(false); }
  }

  const closed = info && (info.state === "expired" || info.state === "cancelled");
  return (
    <div className="auth-wrap">
      <div className="auth-card stack fade-in">
        <Link to="/" className="brand" style={{ justifyContent: "center" }}><Logo size={34} /><span className="wordmark">CarePath</span><span className="wordmark-ai">AI</span></Link>
        <div className="card">
          {!info && !error && <Skeletons rows={2} />}
          {!info && error && <><h1 style={{ fontSize: "1.4rem" }}>Invite not found</h1><div className="alert error" role="alert">{error}</div></>}
          {info && (
            <>
              <p className="small muted" style={{ marginBottom: ".25rem" }}>Care circle invite</p>
              <h1 style={{ fontSize: "1.45rem" }}>{info.owner_name} invited {info.name.split(" ")[0]} to their care circle</h1>
              <p><span className={`badge ${info.role === "helper" ? "ok" : ""}`}>{ROLE_LABELS[info.role]}</span> <span className="small muted">{ROLE_HELP[info.role]}</span></p>
              <p className="small muted">You'll never see their preparation notes or drafts, and you can't edit or delete anything.</p>
              {error && <div className="alert error" role="alert">{error}</div>}
              {closed ? (
                <div className="alert warn">This invite has {info.state === "expired" ? "expired" : "been cancelled"}. Ask {info.owner_name} for a new link.</div>
              ) : loading ? <Skeletons rows={1} /> : user ? (
                <div className="stack">
                  <button className="btn primary" style={{ width: "100%" }} onClick={accept} disabled={busy}>{busy && <Spinner />} Accept as {user.name}</button>
                  <p className="small muted" style={{ margin: 0 }}>Not you? <button className="btn sm ghost" onClick={logout}>Log out</button></p>
                </div>
              ) : (
                <div className="stack">
                  <p className="small" style={{ margin: 0 }}>Log in or create a free account to accept. You'll come straight back here.</p>
                  <Link className="btn primary" style={{ width: "100%" }} to={`/register?next=${next}`}>Create account</Link>
                  <Link className="btn" style={{ width: "100%" }} to={`/login?next=${next}`}>Log in</Link>
                </div>
              )}
            </>
          )}
        </div>
        <Disclaimer compact />
      </div>
    </div>
  );
}
