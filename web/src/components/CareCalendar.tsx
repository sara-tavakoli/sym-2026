import { useState } from "react";
import { api, ApiError, type Task, type TaskCategory } from "../lib/api";
import { useApp } from "../lib/app-context";
import { CATEGORY_META, CATEGORY_ORDER, addDays, daysBetween, encouragementFor, fmtDay, isActiveOn } from "../lib/followthrough";
import "./followthrough.css";

export function CategoryBadge({ category }: { category: TaskCategory }) {
  return <span className={`cat-badge cat-${category}`}><span className="cat-dot" aria-hidden="true" />{CATEGORY_META[category].short}</span>;
}

export function CategoryLegend() {
  return (
    <ul className="cat-legend" aria-label="Task colours">
      {CATEGORY_ORDER.map((c) => <li key={c}><span className={`cat-dot cat-${c}`} aria-hidden="true" />{CATEGORY_META[c].label}</li>)}
    </ul>
  );
}

/** Ticks or unticks one day of a daily task; the server rejects future and out-of-range days. */
export function useTickDay(onChange: (t: Task) => void) {
  const { notify } = useApp();
  const [busy, setBusy] = useState("");
  async function tick(task: Task, day: string, done: boolean) {
    setBusy(`${task.id}:${day}`);
    try {
      const updated = await api.post<Task>(`/tasks/${task.id}/days`, { day, done });
      onChange(updated);
      if (done && updated.status === "completed" && task.status !== "completed") notify(`All ${updated.duration_days} days done for “${updated.title}”`);
    } catch (e) { notify(e instanceof ApiError ? e.message : "Could not save that day", "error"); }
    finally { setBusy(""); }
  }
  return { tick, busy };
}

const WINDOW = 21; // long courses show the three weeks around today rather than every day

/** The care calendar for one daily task: one button per day, ticked days filled, future days disabled. */
export function DayStrip({ task, today, onChange }: { task: Task; today: string; onChange: (t: Task) => void }) {
  const { tick, busy } = useTickDay(onChange);
  if (!task.start_date || !task.end_date) return null;
  const total = daysBetween(task.start_date, task.end_date) + 1;
  const ticks = new Set(task.ticks ?? []);
  let from = task.start_date;
  if (total > WINDOW) {
    const latest = addDays(task.end_date, -(WINDOW - 1)), ideal = addDays(today, -13);
    from = [task.start_date, ideal < latest ? ideal : latest].sort()[1]; // clamp(today - 13, start, end - 20)
  }
  const count = Math.min(total, WINDOW);
  const days = Array.from({ length: count }, (_, i) => addDays(from, i));
  const done = [...ticks].filter((d) => d >= task.start_date! && d <= task.end_date!).length;
  const dayNo = today < task.start_date ? 0 : Math.min(total, daysBetween(task.start_date, today) + 1);
  return (
    <div className="day-strip" role="group" aria-label={`Daily calendar for “${task.title}”`}>
      <p className="day-strip-head">
        <span>{dayNo > 0 && today <= task.end_date ? `Day ${dayNo} of ${total}` : today > task.end_date ? `Finished ${fmtDay(task.end_date)}` : `Starts ${fmtDay(task.start_date)}`}</span>
        <span className="muted">{done} of {total} days ticked</span>
      </p>
      <ol className="day-cells">
        {days.map((d) => {
          const on = ticks.has(d), future = d > today;
          return (
            <li key={d}>
              <button type="button" className={`day-cell ${on ? "on" : ""} ${d === today ? "today" : ""}`} aria-pressed={on} disabled={future || busy === `${task.id}:${d}`}
                aria-label={`${fmtDay(d, { weekday: "long", day: "numeric", month: "long" })}${d === today ? " (today)" : ""}: ${on ? "done" : future ? "upcoming" : "not ticked"}`}
                onClick={() => tick(task, d, !on)}>
                <span className="day-dow" aria-hidden="true">{fmtDay(d, { weekday: "narrow" })}</span>
                <span className="day-num" aria-hidden="true">{on ? "✓" : fmtDay(d, { day: "numeric" })}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A small, non-clinical well-done note once every daily task active today is ticked. */
export function Encouragement({ tasks, today }: { tasks: Task[]; today: string }) {
  const active = tasks.filter((t) => isActiveOn(t, today));
  if (active.length === 0 || !active.every((t) => t.ticks?.includes(today))) return null;
  return (
    <div className="encourage" role="status">
      <p className="encourage-kicker">All done for today</p>
      <p className="encourage-text">{encouragementFor(today)}</p>
    </div>
  );
}

/** "Today's daily care": tick today for every daily task in one place. */
export function TodayCare({ tasks, today, onChange }: { tasks: Task[]; today: string; onChange: (t: Task) => void }) {
  const { tick, busy } = useTickDay(onChange);
  const active = tasks.filter((t) => isActiveOn(t, today));
  if (active.length === 0) return null;
  const left = active.filter((t) => !t.ticks?.includes(today)).length;
  return (
    <section className="panel section-pad today-care" aria-labelledby="today-care-h">
      <div className="panel-head">
        <h2 id="today-care-h">Today's daily care</h2>
        <span className="small muted">{fmtDay(today, { weekday: "long", day: "numeric", month: "long" })} · {left === 0 ? "all ticked" : `${left} to go`}</span>
      </div>
      <ul className="today-list">
        {active.map((t) => {
          const on = !!t.ticks?.includes(today);
          const total = daysBetween(t.start_date!, t.end_date!) + 1;
          return (
            <li key={t.id} className={on ? "on" : ""}>
              <label className="today-row">
                <input type="checkbox" checked={on} disabled={busy === `${t.id}:${today}`} onChange={() => tick(t, today, !on)} />
                <span className="today-text">
                  <span className="today-title">{t.title}</span>
                  <span className="small muted">Day {daysBetween(t.start_date!, today) + 1} of {total}{t.practitioner_name ? ` · from ${t.practitioner_name}` : ""}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <Encouragement tasks={active} today={today} />
    </section>
  );
}
