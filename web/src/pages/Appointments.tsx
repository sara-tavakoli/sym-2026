import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Appointment, type Page } from "../lib/api";
import { useApp } from "../lib/app-context";
import { AppointmentForm } from "../components/AppointmentForm";
import { PlanBadge, PrepBadge, Skeletons } from "../components/ui";

type Scope = "upcoming" | "past";
const PAGE_SIZE = 8;

export default function Appointments() {
  const { notify } = useApp();
  const [params, setParams] = useSearchParams();
  const scope: Scope = params.get("scope") === "past" ? "past" : "upcoming";
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Appointment> | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(params.get("new") === "1" || params.get("import") === "1");
  const [importing, setImporting] = useState(params.get("import") === "1");

  const load = useCallback(() => {
    setError("");
    api.get<Page<Appointment>>(`/appointments?scope=${scope}&page=${page}&pageSize=${PAGE_SIZE}`).then(setData).catch((e) => setError(e.message));
  }, [scope, page]);
  useEffect(() => { setData(null); load(); }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const closeForm = () => { setCreating(false); setImporting(false); if (params.has("new") || params.has("import")) { params.delete("new"); params.delete("import"); setParams(params, { replace: true }); } };

  return (
    <div className="fade-in">
      <div className="page-head">
        <div><h1>Appointments</h1><p className="muted">Your own records of appointments. Nothing here is booked with a provider.</p></div>
        <div className="row">
          <button className="btn" onClick={() => { setImporting(true); setCreating(true); }}>Import booking confirmation</button>
          <button className="btn primary" onClick={() => setCreating(true)}>New appointment</button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Appointment scope">
        {(["upcoming", "past"] as const).map((s) => (
          <button key={s} role="tab" aria-selected={scope === s} onClick={() => { setPage(1); setParams(s === "past" ? { scope: "past" } : {}); }}>
            {s === "upcoming" ? "Upcoming" : "Past"}
          </button>
        ))}
      </div>

      <div className="panel list-panel">
        {error && <div className="alert error" role="alert">{error} <button className="btn sm" onClick={load}>Retry</button></div>}
        {!data && !error && <Skeletons />}
        {data && data.items.length === 0 && (
          <div className="panel-empty">
            <p><strong>{scope === "upcoming" ? "No upcoming appointments" : "No past appointments"}</strong></p>
            <p className="muted">{scope === "upcoming" ? "Add an appointment to prepare for it and keep track of what comes after." : "Appointments move here after their date has passed."}</p>
            {scope === "upcoming" && <button className="btn" onClick={() => setCreating(true)}>Add an appointment</button>}
          </div>
        )}
        {data && data.items.length > 0 && (
          <ol className="rows">
            {data.items.map((a) => {
              const d = new Date(a.starts_at);
              return (
                <li key={a.id} className="appt-row">
                  <Link to={`/app/appointments/${a.id}`} className="appt-main">
                    <span className="appt-date" aria-hidden="true"><span className="appt-day">{d.getDate()}</span><span className="appt-mon">{d.toLocaleString("en-AU", { month: "short" })}</span></span>
                    <span className="appt-text">
                      <span className="appt-title">{a.practitioner_name}</span>
                      <span className="appt-meta">{d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}, {d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })} · {a.service_type} · {a.clinic_name}</span>
                      {a.purpose && <span className="appt-meta">{a.purpose}</span>}
                    </span>
                  </Link>
                  <span className="row-status">
                    <PlanBadge count={a.pending_plans} />
                    <PrepBadge status={a.prep_status} />
                    {a.open_tasks > 0 && <span className="row-note">{a.open_tasks} open task{a.open_tasks > 1 ? "s" : ""}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {data && data.total > data.pageSize && (
          <nav className="pager" aria-label="Pagination">
            <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="small muted">Page {page} of {pages} · {data.total} appointments</span>
            <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        )}
      </div>

      {creating && <AppointmentForm startWithImport={importing} onClose={closeForm} onSaved={() => { closeForm(); notify("Appointment created"); load(); }} />}
    </div>
  );
}
