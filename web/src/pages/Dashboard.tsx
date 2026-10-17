import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDateTime, type DashboardData } from "../lib/api";
import { useApp } from "../lib/app-context";
import { PrepBadge, Skeletons } from "../components/ui";
import { Assistant } from "../components/Assistant";
import { NeedsAttention } from "../components/NeedsAttention";

type Appt = DashboardData["upcoming"][number];

function ApptList({ items, empty }: { items: Appt[]; empty: React.ReactNode }) {
  if (!items.length) return <div className="empty">{empty}</div>;
  return (
    <div>
      {items.map((a) => {
        const d = new Date(a.starts_at);
        return (
          <Link key={a.id} to={`/app/appointments/${a.id}`} className="item">
            <div className="item-date"><b>{d.getDate()}</b><span>{d.toLocaleString("en-AU", { month: "short" })}</span></div>
            <div className="item-body">
              <div className="item-title">{a.practitioner_name}</div>
              <div className="item-sub">{a.service_type} · {a.clinic_name} · {d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</div>
            </div>
            <PrepBadge status={a.prep_status} />
          </Link>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { api.get<DashboardData>("/dashboard").then(setData).catch((e) => setError(e.message)); }, []);

  return (
    <div className="stack fade-in">
      <div className="page-head">
        <div><h1>Hello, {user?.name.split(" ")[0]}</h1><p className="muted">Here's where things stand.</p></div>
        <div className="row">
          <Link className="btn primary" to="/app/appointments?new=1">New appointment</Link>
          <Link className="btn" to="/app/preparation">Prepare a brief</Link>
          <Link className="btn" to="/app/follow-up">Add visit notes</Link>
        </div>
      </div>

      <NeedsAttention />

      <Assistant variant="panel" />

      {error && <div className="alert error" role="alert">{error}</div>}
      {!data && !error && <Skeletons rows={4} />}
      {data && (
        <>
          <div className="stats">
            <div className="stat"><b>{data.counts.upcoming}</b><span>Upcoming appointments</span></div>
            <div className="stat"><b>{data.counts.prepared}</b><span>Upcoming with a brief ready</span></div>
            <div className="stat"><b>{data.counts.open_tasks}</b><span>Outstanding tasks</span></div>
            <div className="stat"><b>{data.counts.done_tasks}</b><span>Completed tasks</span></div>
          </div>

          <div className="grid cols-2">
            <section className="card" aria-labelledby="up">
              <div className="card-head"><h2 id="up">Upcoming</h2><Link to="/app/appointments" className="small">View all</Link></div>
              <ApptList items={data.upcoming} empty={<><h3>No upcoming appointments</h3><p>Add one to start preparing.</p><Link className="btn primary" to="/app/appointments?new=1">Add your first appointment</Link></>} />
            </section>
            <section className="card" aria-labelledby="rec">
              <div className="card-head"><h2 id="rec">Recently completed</h2><Link to="/app/appointments?scope=past" className="small">History</Link></div>
              <ApptList items={data.recent} empty={<><h3>Nothing here yet</h3><p>Past appointments will appear here.</p></>} />
            </section>
            <section className="card" aria-labelledby="ot">
              <div className="card-head"><h2 id="ot">Outstanding follow-up tasks</h2></div>
              {data.openTasks.length === 0 ? (
                <div className="empty"><h3>No outstanding tasks</h3><p>After a visit, add the instructions you were given and confirm the tasks to track them here.</p></div>
              ) : data.openTasks.map((t) => (
                <Link key={t.id} to={`/app/appointments/${t.appointment_id}`} className="item">
                  <div className="item-body"><div className="item-title">{t.title}</div><div className="item-sub">From {t.practitioner_name}{t.deadline ? ` · due ${t.deadline}` : ""}</div></div>
                  {t.needs_clarification ? <span className="badge warn">Clarify</span> : null}
                  <span className="badge">{t.status === "in_progress" ? "In progress" : "To do"}</span>
                </Link>
              ))}
            </section>
            <section className="card" aria-labelledby="dt">
              <div className="card-head"><h2 id="dt">Completed tasks</h2></div>
              {data.doneTasks.length === 0 ? (
                <div className="empty"><h3>No completed tasks yet</h3></div>
              ) : data.doneTasks.map((t) => (
                <Link key={t.id} to={`/app/appointments/${t.appointment_id}`} className="item">
                  <div className="item-body"><div className="item-title">{t.title}</div><div className="item-sub">Completed {fmtDateTime(t.updated_at)}</div></div>
                  <span className="badge ok">Done</span>
                </Link>
              ))}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
