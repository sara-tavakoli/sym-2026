import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDateTime, type Appointment, type Page, type Task, type TaskCategory } from "../lib/api";
import { Skeletons } from "../components/ui";
import { TaskCard } from "../components/TaskCard";
import { CategoryLegend, TodayCare } from "../components/CareCalendar";
import { CATEGORY_META, CATEGORY_ORDER, categoryOf, sydneyToday } from "../lib/followthrough";

type TaskPage = Page<Task> & { today?: string };
const FILTERS: { key: TaskCategory | "all"; label: string }[] = [{ key: "all", label: "All" }, ...CATEGORY_ORDER.map((c) => ({ key: c, label: CATEGORY_META[c].short }))];

export default function FollowUp() {
  const [status, setStatus] = useState<"open" | "completed">("open");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<TaskCategory | "all">("all");
  const [data, setData] = useState<TaskPage | null>(null);
  const [daily, setDaily] = useState<Task[]>([]);
  const [today, setToday] = useState(sydneyToday());
  const [recent, setRecent] = useState<Appointment[]>([]);
  const [error, setError] = useState("");

  const loadDaily = useCallback(() => {
    api.get<TaskPage>("/tasks?status=all&category=daily&pageSize=50").then((r) => { setDaily(r.items); if (r.today) setToday(r.today); }).catch(() => {});
  }, []);
  const load = useCallback(() => {
    const cat = category === "all" ? "" : `&category=${category}`;
    api.get<TaskPage>(`/tasks?status=${status}&page=${page}&pageSize=${category === "all" ? 20 : 10}${cat}`).then((r) => { setData(r); if (r.today) setToday(r.today); }).catch((e) => setError(e.message));
  }, [status, page, category]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(loadDaily, [loadDaily]);
  const changed = () => { load(); loadDaily(); };
  useEffect(() => { api.get<Page<Appointment>>("/appointments?scope=past&pageSize=5").then((r) => setRecent(r.items)).catch(() => {}); }, []);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="stack fade-in">
      <div className="page-head"><div><h1>Follow-up tracker</h1><p className="muted">Tasks from your healthcare professionals, and what you've already done.</p></div></div>

      <TodayCare tasks={daily} today={today} onChange={changed} />

      <div className="tabs" role="tablist" aria-label="Task status">
        {(["open", "completed"] as const).map((s) => (
          <button key={s} role="tab" aria-selected={status === s} onClick={() => { setStatus(s); setPage(1); }}>{s === "open" ? "Outstanding" : "Completed"}</button>
        ))}
      </div>

      <div className="cat-filters" role="group" aria-label="Show tasks of type">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={`cat-filter ${f.key !== "all" ? `cat-${f.key}` : ""}`} aria-pressed={category === f.key}
            onClick={() => { setCategory(f.key); setPage(1); }}>
            {f.key !== "all" && <span className="cat-dot" aria-hidden="true" />}{f.label}
          </button>
        ))}
      </div>

      <section className="panel section-pad" aria-label={status === "open" ? "Outstanding tasks" : "Completed tasks"}>
        {error && <div className="alert error">{error}</div>}
        {!data && !error && <Skeletons />}
        {data && data.items.length === 0 && (
          <div className="panel-empty">
            <p><strong>{status === "open" ? "No outstanding tasks" : "No completed tasks yet"}{category !== "all" ? ` of type ${CATEGORY_META[category].short.toLowerCase()}` : ""}</strong></p>
            <p className="muted">{status === "open" ? "Tasks you confirm from visit instructions appear here." : "Tick a task off and it moves here."}</p>
          </div>
        )}
        {data && data.items.length > 0 && <CategoryLegend />}
        {data && data.items.length > 0 && (category === "all"
          ? CATEGORY_ORDER.map((c) => {
            const group = data.items.filter((t) => categoryOf(t) === c);
            if (group.length === 0) return null;
            return (
              <div key={c} className={`cat-group cat-${c}`}>
                <h2 className="cat-group-h"><span className="cat-dot" aria-hidden="true" />{CATEGORY_META[c].label} <span className="muted small">({group.length})</span></h2>
                <ul className="task-list">
                  {group.map((t) => <TaskCard key={t.id} task={t} today={today} showAppointment onChange={changed} onDelete={changed} />)}
                </ul>
              </div>
            );
          })
          : (
            <ul className="task-list">
              {data.items.map((t) => <TaskCard key={t.id} task={t} today={today} showAppointment onChange={changed} onDelete={changed} />)}
            </ul>
          ))}
        {data && data.total > data.pageSize && (
          <nav className="pager" aria-label="Pagination">
            <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="small muted">Page {page} of {pages}</span>
            <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        )}
      </section>

      <section className="panel section-pad" aria-labelledby="add-instr-h">
        <div className="panel-head"><h2 id="add-instr-h">Add instructions from a visit</h2></div>
        <p className="muted small">Choose the appointment the instructions came from.</p>
        {recent.length === 0 ? <p className="muted small">Your past appointments appear here. You can also add instructions from any appointment page.</p> : (
          <ol className="rows">
            {recent.map((a) => (
              <li key={a.id} className="appt-row compact">
                <Link to={`/app/appointments/${a.id}`} className="appt-main">
                  <span className="appt-text"><span className="appt-title">{a.practitioner_name}</span><span className="appt-meta">{fmtDateTime(a.starts_at)} · {a.service_type}</span></span>
                </Link>
                <Link to={`/app/appointments/${a.id}#follow-up`} className="row-action">Add instructions<span className="sr-only"> for {a.practitioner_name}</span></Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
