import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDateTime, type Appointment, type Page } from "../lib/api";
import { PrepBadge, Skeletons } from "../components/ui";

export default function PrepList() {
  const [data, setData] = useState<Page<Appointment> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.get<Page<Appointment>>("/appointments?scope=upcoming&pageSize=20").then(setData).catch((e) => setError(e.message)); }, []);

  return (
    <div className="fade-in">
      <div className="page-head"><div><h1>AI Preparation</h1><p className="muted">Choose an upcoming appointment to turn your notes into a clear, editable brief.</p></div></div>
      <div className="card">
        {error && <div className="alert error">{error}</div>}
        {!data && !error && <Skeletons />}
        {data && data.items.length === 0 && (
          <div className="empty"><h3>No upcoming appointments</h3><p>Add an appointment first, then prepare for it here.</p><Link className="btn primary" to="/app/appointments?new=1">Add an appointment</Link></div>
        )}
        {data?.items.map((a) => (
          <Link key={a.id} to={`/app/appointments/${a.id}/prepare`} className="item">
            <div className="item-body"><div className="item-title">{a.practitioner_name} · {a.service_type}</div><div className="item-sub">{fmtDateTime(a.starts_at)} · {a.clinic_name}</div></div>
            <PrepBadge status={a.prep_status} />
            <span className="btn sm">{a.prep_status === "none" || a.prep_status === "notes" ? "Prepare" : "Open"}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
