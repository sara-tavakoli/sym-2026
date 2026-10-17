import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type DashboardData, type PrepStatus } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Skeletons } from "../components/ui";

type Appt = DashboardData["upcoming"][number];

/** "Today", "Tomorrow", "In 3 days", "2 weeks ago" — computed from the stored date in the user's timezone. */
function relativeDay(iso: string) {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(new Date(iso)) - day(new Date())) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const n = Math.abs(diff), unit = n >= 14 ? `${Math.round(n / 7)} weeks` : `${n} days`;
  return diff > 0 ? `In ${unit}` : `${unit} ago`;
}
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`;
};
const PREP: Record<PrepStatus, { label: string; tone: string; action: string }> = {
  confirmed: { label: "Brief ready", tone: "ok", action: "View brief" },
  draft: { label: "Brief in draft", tone: "info", action: "Continue" },
  notes: { label: "Notes started", tone: "info", action: "Continue" },
  none: { label: "Not prepared", tone: "muted", action: "Prepare" },
};

function UpcomingRow({ a }: { a: Appt }) {
  const d = new Date(a.starts_at);
  const prep = PREP[a.prep_status];
  return (
    <li className="appt-row">
      <Link to={`/app/appointments/${a.id}`} className="appt-main">
        <span className="appt-date" aria-hidden="true"><span className="appt-day">{d.getDate()}</span><span className="appt-mon">{d.toLocaleString("en-AU", { month: "short" })}</span></span>
        <span className="appt-text">
          <span className="appt-title">{a.practitioner_name}</span>
          <span className="appt-meta">{when(a.starts_at)} · {a.service_type} · {a.clinic_name}</span>
          <span className="appt-meta"><span className="rel">{relativeDay(a.starts_at)}</span> · <span className={`prep prep-${prep.tone}`}>{prep.label}</span></span>
        </span>
      </Link>
      <Link to={a.prep_status === "confirmed" ? `/app/appointments/${a.id}/brief` : `/app/appointments/${a.id}/prepare`} className="row-action">
        {prep.action}<span className="sr-only"> for {a.practitioner_name}</span>
      </Link>
    </li>
  );
}

function RecentRow({ a }: { a: Appt }) {
  return (
    <li className="appt-row compact">
      <Link to={`/app/appointments/${a.id}`} className="appt-main">
        <span className="appt-text">
          <span className="appt-title">{a.practitioner_name}</span>
          <span className="appt-meta">{when(a.starts_at)} · {a.service_type}</span>
        </span>
      </Link>
      <Link to={`/app/appointments/${a.id}#follow-up`} className="row-action">Add visit notes<span className="sr-only"> for {a.practitioner_name}</span></Link>
    </li>
  );
}

function AssistantEntry() {
  const nav = useNavigate();
  const [text, setText] = useState("");
  const open = (e: FormEvent) => { e.preventDefault(); nav("/app/assistant", { state: { draft: text.trim() } }); };
  return (
    <section className="panel assist-entry o-4" aria-labelledby="assist-h">
      <h2 id="assist-h">Ask the assistant</h2>
      <p className="panel-lede">Organise what to raise at an appointment, or describe the kind of service you're looking for.</p>
      <form onSubmit={open} className="assist-form">
        <label htmlFor="assist-q" className="sr-only">What would you like help with?</label>
        <input id="assist-q" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="What do you need help with?" />
        <button className="btn">Open assistant</button>
      </form>
      <p className="fine">It won't diagnose or give medical advice.</p>
    </section>
  );
}

export default function Dashboard() {
  const { user, notify } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [completing, setCompleting] = useState<string | null>(null);

  const load = useCallback(() => api.get<DashboardData>("/dashboard").then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function complete(id: string, title: string) {
    setCompleting(id);
    try {
      await api.patch(`/tasks/${id}`, { status: "completed" });
      notify(`Marked “${title}” complete`);
      await load();
    } catch (e) { notify(e instanceof ApiError ? e.message : "Couldn't update the task", "error"); }
    finally { setCompleting(null); }
  }

  const c = data?.counts;
  return (
    <div className="dash fade-in">
      <header className="dash-head">
        <div>
          <h1>Hello, {user?.name.split(" ")[0]}</h1>
          {c && (
            <ul className="overview" aria-label="Overview">
              <li><Link to="/app/appointments"><strong>{c.upcoming}</strong> upcoming {c.upcoming === 1 ? "appointment" : "appointments"}</Link></li>
              {c.upcoming > 0 && <li><Link to="/app/preparation"><strong>{c.prepared}</strong> of {c.upcoming} with a brief ready</Link></li>}
              <li><Link to="/app/follow-up"><strong>{c.open_tasks}</strong> follow-up {c.open_tasks === 1 ? "task" : "tasks"} open</Link></li>
              {c.done_tasks > 0 && <li><Link to="/app/follow-up"><strong>{c.done_tasks}</strong> done</Link></li>}
            </ul>
          )}
        </div>
        <Link className="btn primary" to="/app/appointments?new=1">New appointment</Link>
      </header>

      {error && <div className="alert error" role="alert">{error} <button className="btn sm" onClick={() => { setError(""); load(); }}>Retry</button></div>}
      {!data && !error && <Skeletons rows={4} />}

      {data && (
        <div className="dash-grid">
          <div className="dash-col">
            <section className="panel o-1" aria-labelledby="up-h">
              <div className="panel-head">
                <h2 id="up-h">Upcoming appointments</h2>
                {data.upcoming.length > 0 && <Link to="/app/appointments" className="panel-link">All appointments</Link>}
              </div>
              {data.upcoming.length === 0 ? (
                <div className="panel-empty">
                  <p><strong>No upcoming appointments</strong></p>
                  <p className="muted">Add one to prepare your questions before you go.</p>
                  <Link className="btn" to="/app/appointments?new=1">Add an appointment</Link>
                </div>
              ) : (
                <ol className="rows">{data.upcoming.map((a) => <UpcomingRow key={a.id} a={a} />)}</ol>
              )}
            </section>

            <section className="panel o-3" aria-labelledby="rec-h">
              <div className="panel-head">
                <h2 id="rec-h">Recent appointments</h2>
                {data.recent.length > 0 && <Link to="/app/appointments?scope=past" className="panel-link">History</Link>}
              </div>
              {data.recent.length === 0
                ? <p className="panel-empty muted">Past appointments appear here, so you can record what you were asked to do.</p>
                : <ol className="rows">{data.recent.map((a) => <RecentRow key={a.id} a={a} />)}</ol>}
            </section>
          </div>

          <div className="dash-col">
            <section className="panel o-2" aria-labelledby="tasks-h">
              <div className="panel-head">
                <h2 id="tasks-h">Follow-up tasks</h2>
                <Link to="/app/follow-up" className="panel-link">Follow-Up Tracker</Link>
              </div>
              {data.openTasks.length === 0 ? (
                <p className="panel-empty muted">Nothing outstanding. After a visit, add the instructions you were given and the tasks will appear here.</p>
              ) : (
                <ul className="rows">
                  {data.openTasks.map((t) => (
                    <li key={t.id} className="task-row">
                      <input type="checkbox" className="task-check" checked={false} disabled={completing === t.id}
                        onChange={() => complete(t.id, t.title)} aria-label={`Mark “${t.title}” complete`} />
                      <div className="task-text">
                        <Link to={`/app/appointments/${t.appointment_id}#follow-up`} className="task-title">{t.title}</Link>
                        <span className="appt-meta">
                          From {t.practitioner_name}{t.deadline ? ` · Due ${t.deadline}` : ""}{t.status === "in_progress" ? " · In progress" : ""}
                        </span>
                        {t.needs_clarification ? <span className="flag">Check the details with your clinician</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {data.doneTasks.length > 0 && (
                <p className="panel-foot">
                  <Link to="/app/follow-up">{c!.done_tasks} completed</Link>
                  <span className="muted"> · Last: {data.doneTasks[0].title}</span>
                </p>
              )}
            </section>

            <AssistantEntry />
          </div>
        </div>
      )}
    </div>
  );
}
