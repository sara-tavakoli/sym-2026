import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type Appointment, type Page } from "../lib/api";
import { useApp } from "../lib/app-context";
import { AppointmentForm, type AppointmentPrefill } from "../components/AppointmentForm";
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
  // Optional prefill when arriving from Fit Finder ("Add to my appointments").
  const [prefill, setPrefill] = useState<AppointmentPrefill | undefined>(() => params.get("new") === "1" && (params.get("practitioner") || params.get("clinic"))
    ? { practitioner_name: params.get("practitioner") ?? undefined, clinic_name: params.get("clinic") ?? undefined, service_type: params.get("service") ?? undefined, location: params.get("location") ?? undefined }
    : undefined);

  const load = useCallback(() => {
    setError("");
    api.get<Page<Appointment>>(`/appointments?scope=${scope}&page=${page}&pageSize=${PAGE_SIZE}`).then(setData).catch((e) => setError(e.message));
  }, [scope, page]);
  useEffect(() => { setData(null); load(); }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const closeForm = () => { setCreating(false); setImporting(false); setPrefill(undefined); if (params.has("new") || params.has("import")) { for (const k of ["new", "import", "practitioner", "clinic", "service", "location"]) params.delete(k); setParams(params, { replace: true }); } };

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

      <div className="card">
        {error && <div className="alert error" role="alert">{error} <button className="btn sm" onClick={load}>Retry</button></div>}
        {!data && !error && <Skeletons />}
        {data && data.items.length === 0 && (
          <div className="empty">
            <h3>{scope === "upcoming" ? "No upcoming appointments" : "No past appointments"}</h3>
            <p>{scope === "upcoming" ? "Add an appointment to prepare for it and track follow-ups." : "Appointments move here after their date has passed."}</p>
            {scope === "upcoming" && <button className="btn primary" onClick={() => setCreating(true)}>Add an appointment</button>}
          </div>
        )}
        {data?.items.map((a) => {
          const d = new Date(a.starts_at);
          return (
            <Link key={a.id} to={`/app/appointments/${a.id}`} className="item">
              <div className="item-date"><b>{d.getDate()}</b><span>{d.toLocaleString("en-AU", { month: "short" })}</span></div>
              <div className="item-body">
                <div className="item-title">{a.practitioner_name} <span className="muted" style={{ fontWeight: 400 }}>· {a.service_type}</span></div>
                <div className="item-sub">{a.clinic_name} · {d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}{a.purpose ? ` · ${a.purpose}` : ""}</div>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <PlanBadge count={a.pending_plans} />
                <PrepBadge status={a.prep_status} />
                {a.open_tasks > 0 && <span className="badge warn">{a.open_tasks} open task{a.open_tasks > 1 ? "s" : ""}</span>}
              </div>
            </Link>
          );
        })}
        {data && data.total > data.pageSize && (
          <nav className="pager" aria-label="Pagination">
            <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="small muted">Page {page} of {pages} · {data.total} appointments</span>
            <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        )}
      </div>

      {creating && <AppointmentForm startWithImport={importing} prefill={prefill} onClose={closeForm} onSaved={() => { closeForm(); notify("Appointment created"); load(); }} />}
    </div>
  );
}
