import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type DashboardData, type PrepStatus } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Skeletons } from "../components/ui";
import { CircleCard } from "../components/CircleBits";
import { NeedsAttention } from "../components/NeedsAttention";

type Appt = DashboardData["upcoming"][number];

/** "Today", "Tomorrow", "In 3 days", "2 weeks ago", computed from the stored date in the user's timezone. */
function relativeDay(iso: string) {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(new Date(iso)) - day(new Date())) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const n = Math.abs(diff), unit = n >= 14 ? `${Math.round(n / 7)} weeks` : `${n} days`;
  return diff > 0 ? `In ${unit}` : `${unit} ago`;
}
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };

const PREP_STEP: Record<PrepStatus, number> = { none: 0, notes: 1, draft: 2, confirmed: 3 };
const PREP_ACTION: Record<PrepStatus, string> = { none: "Prepare for this visit", notes: "Continue preparing", draft: "Review your brief", confirmed: "View brief" };

function Plus() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

/** Preparation progress for one appointment, derived from its saved status. */
function PrepTrack({ status }: { status: PrepStatus }) {
  const step = PREP_STEP[status];
  const labels = ["Notes", "Brief drafted", "Confirmed"];
  const summary = step === 0 ? "Not started" : step === 3 ? "Brief confirmed" : labels[step - 1];
  return (
    <div className="prep-track" aria-label={`Preparation: ${summary}`}>
      <ol aria-hidden="true">
        {labels.map((l, i) => <li key={l} className={i < step ? "done" : ""}><span className="bar" /><span className="lbl">{l}</span></li>)}
      </ol>
    </div>
  );
}

function NextAppointment({ a }: { a: Appt }) {
  const d = new Date(a.starts_at);
  return (
    <section className="hero-appt" aria-labelledby="next-h">
      <div className="hero-date" aria-hidden="true">
        <span className="hero-wd">{d.toLocaleDateString("en-AU", { weekday: "long" })}</span>
        <span className="hero-day">{d.getDate()}</span>
        <span className="hero-mon">{d.toLocaleDateString("en-AU", { month: "long" })}</span>
        <span className="hero-time">{time(a.starts_at)}</span>
      </div>
      <div className="hero-body">
        <p className="eyebrow">Next appointment · <span className="hero-rel">{relativeDay(a.starts_at)}</span></p>
        <h2 id="next-h" className="hero-title">{a.practitioner_name}</h2>
        <p className="hero-meta">
          <span className="sr-only">{d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}, </span>
          {time(a.starts_at)} · {a.service_type} · {a.clinic_name}
        </p>
        <PrepTrack status={a.prep_status} />
        <div className="row hero-actions">
          <Link className="btn primary" to={a.prep_status === "confirmed" ? `/app/appointments/${a.id}/brief` : `/app/appointments/${a.id}/prepare`}>{PREP_ACTION[a.prep_status]}</Link>
          <Link className="btn ghost" to={`/app/appointments/${a.id}`}>Appointment details</Link>
        </div>
      </div>
    </section>
  );
}

function NoNextAppointment() {
  return (
    <section className="hero-appt hero-empty" aria-labelledby="next-h">
      <div className="hero-body">
        <p className="eyebrow">Next appointment</p>
        <h2 id="next-h" className="hero-title">No upcoming appointments</h2>
        <p className="hero-meta">Add one to prepare your questions before you go, or find a service that suits your needs.</p>
        <div className="row hero-actions">
          <Link className="btn primary" to="/app/appointments?new=1">Add an appointment</Link>
          <Link className="btn ghost" to="/app/fit-finder">Find a service</Link>
        </div>
      </div>
    </section>
  );
}

function AssistantEntry() {
  const nav = useNavigate();
  const [text, setText] = useState("");
  const open = (e: FormEvent) => { e.preventDefault(); nav("/app/assistant", { state: { draft: text.trim() } }); };
  return (
    <section className="assist-band" aria-labelledby="assist-h">
      <h2 id="assist-h">Ask the assistant</h2>
      <p>Organise what to raise at an appointment, or describe the kind of service you're looking for.</p>
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
  const next = data?.upcoming[0];
  const later = data?.upcoming.slice(1) ?? [];
  return (
    <div className="dash fade-in">
      <header className="dash-head">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1>{greeting()}, {user?.name.split(" ")[0]}</h1>
        </div>
        <Link className="btn primary" to="/app/appointments?new=1"><Plus /> New appointment</Link>
      </header>

      {error && <div className="alert error" role="alert">{error} <button className="btn sm" onClick={() => { setError(""); load(); }}>Retry</button></div>}
      {!data && !error && <Skeletons rows={4} />}

      {data && c && (
        <>
          <div className="dash-top">
            {next ? <NextAppointment a={next} /> : <NoNextAppointment />}
            <aside className="glance" aria-labelledby="glance-h">
              <h2 id="glance-h" className="glance-title">At a glance</h2>
              <ul className="overview">
                <li><Link to="/app/appointments"><span className="glance-n">{c.upcoming}</span><span className="glance-l">upcoming {c.upcoming === 1 ? "appointment" : "appointments"}</span></Link></li>
                <li><Link to="/app/preparation"><span className="glance-n">{c.prepared}{c.upcoming > 0 && <span className="glance-of">/{c.upcoming}</span>}</span><span className="glance-l">with a confirmed brief</span></Link></li>
                <li><Link to="/app/follow-up"><span className="glance-n">{c.open_tasks}</span><span className="glance-l">follow-up {c.open_tasks === 1 ? "task" : "tasks"} open</span></Link></li>
                <li><Link to="/app/follow-up"><span className="glance-n">{c.done_tasks}</span><span className="glance-l">{c.done_tasks === 1 ? "task" : "tasks"} completed</span></Link></li>
              </ul>
            </aside>
          </div>

          <NeedsAttention />

          <div className="dash-grid">
            <div className="dash-col">
            <section className="panel schedule o-3" aria-labelledby="sched-h">
              <div className="panel-head">
                <h2 id="sched-h">Schedule</h2>
                <Link to="/app/appointments" className="panel-link">All appointments</Link>
              </div>
              <h3 className="group-title">Later</h3>
              {later.length === 0 ? <p className="group-empty">{next ? "Nothing else booked yet." : "No upcoming appointments."}</p> : (
                <ol className="rows">
                  {later.map((a) => (
                    <li key={a.id} className="appt-row compact">
                      <Link to={`/app/appointments/${a.id}`} className="appt-main">
                        <span className="date-chip" aria-hidden="true"><b>{new Date(a.starts_at).getDate()}</b>{new Date(a.starts_at).toLocaleString("en-AU", { month: "short" })}</span>
                        <span className="appt-text"><span className="appt-title">{a.practitioner_name}</span><span className="appt-meta">{shortDate(a.starts_at)}, {time(a.starts_at)} · {a.service_type}</span></span>
                      </Link>
                      <span className="appt-rel">{relativeDay(a.starts_at)}</span>
                    </li>
                  ))}
                </ol>
              )}
              <h3 className="group-title">Recent</h3>
              {data.recent.length === 0 ? <p className="group-empty">Past appointments appear here, so you can record what you were asked to do.</p> : (
                <ol className="rows">
                  {data.recent.map((a) => (
                    <li key={a.id} className="appt-row compact">
                      <Link to={`/app/appointments/${a.id}`} className="appt-main">
                        <span className="date-chip past" aria-hidden="true"><b>{new Date(a.starts_at).getDate()}</b>{new Date(a.starts_at).toLocaleString("en-AU", { month: "short" })}</span>
                        <span className="appt-text"><span className="appt-title">{a.practitioner_name}</span><span className="appt-meta">{shortDate(a.starts_at)} · {a.service_type}</span></span>
                      </Link>
                      <Link to={`/app/appointments/${a.id}#follow-up`} className="row-action">Add visit notes<span className="sr-only"> for {a.practitioner_name}</span></Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>
              <div className="o-4"><AssistantEntry /></div>
            </div>

            <div className="dash-col">
              <section className="panel tasks o-2" aria-labelledby="tasks-h">
                <div className="panel-head">
                  <h2 id="tasks-h">Follow-up tasks</h2>
                  <Link to="/app/follow-up" className="panel-link">View all</Link>
                </div>
                {data.openTasks.length === 0 ? (
                  <p className="group-empty">Nothing outstanding. After a visit, add the instructions you were given and the tasks appear here.</p>
                ) : (
                  <ul className="rows">
                    {data.openTasks.map((t) => (
                      <li key={t.id} className="task-row">
                        <input type="checkbox" className="task-check" checked={false} disabled={completing === t.id}
                          onChange={() => complete(t.id, t.title)} aria-label={`Mark “${t.title}” complete`} />
                        <div className="task-text">
                          <Link to={`/app/appointments/${t.appointment_id}#follow-up`} className="task-title">{t.title}</Link>
                          <span className="appt-meta">From {t.practitioner_name}{t.deadline ? ` · Due ${t.deadline}` : ""}{t.status === "in_progress" ? " · In progress" : ""}</span>
                          {t.needs_clarification ? <span className="flag">Check the details with your clinician</span> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {data.doneTasks.length > 0 && (
                  <p className="panel-foot"><Link to="/app/follow-up">{c.done_tasks} completed</Link><span className="muted"> · Last: {data.doneTasks[0].title}</span></p>
                )}
              </section>
              <CircleCard />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
