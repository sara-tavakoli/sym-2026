import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, fmtDateTime, type Appointment, type Draft, type DraftSummary, type Page } from "../lib/api";
import { useApp } from "../lib/app-context";
import { PrepBadge, Skeletons, Spinner } from "../components/ui";

export default function PrepList() {
  const nav = useNavigate();
  const { notify } = useApp();
  const [data, setData] = useState<Page<Appointment> | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    api.get<Page<Appointment>>("/appointments?scope=upcoming&pageSize=20").then(setData).catch((e) => setError(e.message));
    api.get<{ items: DraftSummary[] }>("/drafts").then((r) => setDrafts(r.items)).catch(() => setDrafts([]));
  }, []);

  async function newDraft() {
    setCreating(true);
    try { const d = await api.post<Draft>("/drafts", {}); nav(`/app/drafts/${d.id}`); }
    catch (e) { notify(e instanceof ApiError ? e.message : "Could not create a draft", "error"); setCreating(false); }
  }

  return (
    <div className="stack fade-in">
      <div className="page-head">
        <div><h1>AI Preparation</h1><p className="muted">Turn your own notes into a clear, editable appointment brief — with or without an appointment booked yet.</p></div>
        <div className="row">
          <Link className="btn" to="/app/assistant">Prepare with the assistant</Link>
          <button className="btn primary" onClick={newDraft} disabled={creating}>{creating && <Spinner />} New draft brief</button>
        </div>
      </div>

      <section className="card" aria-labelledby="up-h">
        <h2 id="up-h">Upcoming appointments</h2>
        {error && <div className="alert error">{error}</div>}
        {!data && !error && <Skeletons />}
        {data && data.items.length === 0 && (
          <div className="empty"><h3>No upcoming appointments</h3><p>Add one, or start a draft brief now and attach it later.</p><Link className="btn primary" to="/app/appointments?new=1">Add an appointment</Link></div>
        )}
        {data?.items.map((a) => (
          <Link key={a.id} to={`/app/appointments/${a.id}/prepare`} className="item">
            <div className="item-body"><div className="item-title">{a.practitioner_name} · {a.service_type}</div><div className="item-sub">{fmtDateTime(a.starts_at)} · {a.clinic_name}</div></div>
            <PrepBadge status={a.prep_status} />
            <span className="btn sm">{a.prep_status === "none" || a.prep_status === "notes" ? "Prepare" : "Open"}</span>
          </Link>
        ))}
      </section>

      <section className="card" aria-labelledby="drafts-h">
        <h2 id="drafts-h">Draft briefs</h2>
        <p className="muted small">Briefs you started without an appointment, from a form or an assistant conversation.</p>
        {!drafts && <Skeletons rows={2} />}
        {drafts && drafts.length === 0 && (
          <div className="empty"><h3>No drafts yet</h3><p>Chat with the assistant about your appointment and choose “Create a brief from this conversation”, or start a new draft.</p></div>
        )}
        {drafts?.map((d) => (
          <Link key={d.id} to={`/app/drafts/${d.id}`} className="item">
            <div className="item-body">
              <div className="item-title">{d.title}</div>
              <div className="item-sub">{d.origin === "chat" ? "From an assistant conversation" : "Started from the form"} · {d.points ? `${d.points} points` : "No brief yet"} · updated {fmtDateTime(d.updated_at)}</div>
            </div>
            <span className="badge info">Draft</span>
            <span className="btn sm">Open</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
