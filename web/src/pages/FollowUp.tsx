import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDateTime, type Appointment, type Page, type Task } from "../lib/api";
import { Skeletons } from "../components/ui";
import { TaskCard } from "../components/TaskCard";

export default function FollowUp() {
  const [status, setStatus] = useState<"open" | "completed">("open");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Task> | null>(null);
  const [recent, setRecent] = useState<Appointment[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.get<Page<Task>>(`/tasks?status=${status}&page=${page}&pageSize=10`).then(setData).catch((e) => setError(e.message));
  }, [status, page]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => { api.get<Page<Appointment>>("/appointments?scope=past&pageSize=5").then((r) => setRecent(r.items)).catch(() => {}); }, []);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="stack fade-in">
      <div className="page-head"><div><h1>Follow-Up Tracker</h1><p className="muted">Everything you need to do after your visits, in one place.</p></div></div>

      <div className="card">
        <h2>Add visit instructions</h2>
        <p className="muted small">Choose the appointment the instructions came from.</p>
        {recent.length === 0 ? <p className="muted small">Your past appointments will appear here. Instructions can be added from any appointment page.</p> : recent.map((a) => (
          <Link key={a.id} to={`/app/appointments/${a.id}#follow-up`} className="item">
            <div className="item-body"><div className="item-title">{a.practitioner_name} · {a.service_type}</div><div className="item-sub">{fmtDateTime(a.starts_at)}</div></div>
            <span className="btn sm">Add instructions</span>
          </Link>
        ))}
      </div>

      <div>
        <div className="tabs" role="tablist">
          {(["open", "completed"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={status === s} onClick={() => { setStatus(s); setPage(1); }}>{s === "open" ? "Outstanding" : "Completed"}</button>
          ))}
        </div>
        {error && <div className="alert error">{error}</div>}
        {!data && !error && <Skeletons />}
        {data && data.items.length === 0 && (
          <div className="card empty"><h3>{status === "open" ? "No outstanding tasks" : "No completed tasks yet"}</h3>
            <p>{status === "open" ? "Tasks you confirm from visit instructions will show up here." : "Tick a task off and it will move here."}</p></div>
        )}
        {data?.items.map((t) => <TaskCard key={t.id} task={t} showAppointment onChange={() => load()} onDelete={() => load()} />)}
        {data && data.total > data.pageSize && (
          <nav className="pager" aria-label="Pagination">
            <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="small muted">Page {page} of {pages}</span>
            <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        )}
      </div>
    </div>
  );
}
