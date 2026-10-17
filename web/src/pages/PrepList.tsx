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
          <Link className="btn ghost" to="/app/assistant">Prepare with the assistant</Link>
          <button className="btn primary" onClick={newDraft} disabled={creating}>{creating && <Spinner />} New draft brief</button>
        </div>
      </div>

      <section className="panel section-pad" aria-labelledby="up-h">
        <div className="panel-head"><h2 id="up-h">Upcoming appointments</h2></div>
        {error && <div className="alert error">{error}</div>}
        {!data && !error && <Skeletons />}
        {data && data.items.length === 0 && (
          <div className="panel-empty"><p><strong>No upcoming appointments</strong></p><p className="muted">Add one, or start a draft brief now and attach it later.</p><Link className="btn" to="/app/appointments?new=1">Add an appointment</Link></div>
        )}
        {data && data.items.length > 0 && (
          <ol className="rows">
            {data.items.map((a) => (
              <li key={a.id} className="appt-row">
                <Link to={`/app/appointments/${a.id}/prepare`} className="appt-main">
                  <span className="appt-text">
                    <span className="appt-title">{a.practitioner_name}</span>
                    <span className="appt-meta">{fmtDateTime(a.starts_at)} · {a.service_type} · {a.clinic_name}</span>
                    <span className="appt-meta"><PrepBadge status={a.prep_status} /></span>
                  </span>
                </Link>
                <Link to={`/app/appointments/${a.id}/prepare`} className="row-action" tabIndex={-1} aria-hidden="true">{a.prep_status === "none" || a.prep_status === "notes" ? "Prepare" : "Open"}</Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel section-pad" aria-labelledby="drafts-h">
        <div className="panel-head"><h2 id="drafts-h">Draft briefs</h2></div>
        <p className="muted small">Briefs you started without an appointment, from the form or an assistant conversation.</p>
        {!drafts && <Skeletons rows={2} />}
        {drafts && drafts.length === 0 && (
          <p className="panel-empty muted">No drafts yet. Chat with the assistant about your appointment and choose “Create a brief from this conversation”, or start a new draft.</p>
        )}
        {drafts && drafts.length > 0 && (
          <ol className="rows">
            {drafts.map((d) => (
              <li key={d.id} className="appt-row">
                <Link to={`/app/drafts/${d.id}`} className="appt-main">
                  <span className="appt-text">
                    <span className="appt-title">{d.title}</span>
                    <span className="appt-meta">{d.origin === "chat" ? "From an assistant conversation" : "Started from the form"} · {d.points ? `${d.points} points` : "No brief yet"} · Updated {fmtDateTime(d.updated_at)}</span>
                  </span>
                </Link>
                <Link to={`/app/drafts/${d.id}`} className="row-action" tabIndex={-1} aria-hidden="true">Open</Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
