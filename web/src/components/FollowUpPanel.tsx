import { useEffect, useState } from "react";
import { api, ApiError, type ProposedTask, type Task } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Spinner } from "./ui";
import { TaskCard } from "./TaskCard";

export function FollowUpPanel({ appointmentId, onChanged }: { appointmentId: string; onChanged?: () => void }) {
  const { notify } = useApp();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [text, setText] = useState("");
  const [proposed, setProposed] = useState<ProposedTask[] | null>(null);
  const [busy, setBusy] = useState<"" | "extract" | "confirm">("");
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");

  useEffect(() => {
    api.get<{ tasks: Task[] }>(`/appointments/${appointmentId}/follow-up`).then((r) => setTasks(r.tasks)).catch((e) => setError(e.message));
  }, [appointmentId]);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

  async function extract() {
    setError(""); setBusy("extract");
    try { setProposed((await api.post<{ tasks: ProposedTask[] }>(`/appointments/${appointmentId}/instructions/extract`, { text })).tasks); }
    catch (e) { fail(e); } finally { setBusy(""); }
  }
  async function confirm() {
    if (!proposed) return;
    setError(""); setBusy("confirm");
    try {
      const r = await api.post<{ tasks: Task[] }>(`/appointments/${appointmentId}/instructions/confirm`, { text, tasks: proposed });
      setTasks((t) => [...(t ?? []), ...r.tasks]); setProposed(null); setText(""); onChanged?.();
      notify(`${r.tasks.length} task${r.tasks.length > 1 ? "s" : ""} saved`);
    } catch (e) { fail(e); } finally { setBusy(""); }
  }
  async function addManual() {
    try {
      const t = await api.post<Task>(`/appointments/${appointmentId}/tasks`, { title: manual });
      setTasks((x) => [...(x ?? []), t]); setManual(""); onChanged?.();
    } catch (e) { fail(e); }
  }
  const setProp = (i: number, patch: Partial<ProposedTask>) => setProposed((p) => p && p.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const instructionsForm = (
    <div className="instr">
      <label htmlFor={`instr-${appointmentId}`} className="instr-label">Instructions from your healthcare professional</label>
      <p className="hint" id={`instr-h-${appointmentId}`}>Paste or type what you were told. CarePath only lists actions that are written here. It won't add advice or change medication wording.</p>
      <textarea id={`instr-${appointmentId}`} rows={4} maxLength={6000} value={text} onChange={(e) => setText(e.target.value)} aria-describedby={`instr-h-${appointmentId}`}
        placeholder="e.g. Book a follow-up in 2 weeks. Get a blood test at the pathology clinic." />
      <div className="row instr-actions">
        <button className="btn primary" onClick={extract} disabled={!text.trim() || busy === "extract"}>{busy === "extract" && <Spinner />} Extract tasks</button>
        {busy === "extract" && <span className="small muted" role="status">Reading your instructions…</span>}
      </div>
    </div>
  );

  const review = proposed && (
    <div className="review" aria-labelledby={`review-${appointmentId}`}>
      <h3 id={`review-${appointmentId}`}>Review before saving</h3>
      <p className="hint">Nothing is saved until you confirm. Edit titles, remove anything that isn't right, and check flagged items with your healthcare professional.</p>
      {proposed.length === 0 && <div className="alert info">No clear actions were found in that text. Go back and edit it, or add a task yourself below.</div>}
      <ol className="review-list">
        {proposed.map((t, i) => (
          <li key={i}>
            <div className="review-top">
              <label className="sr-only" htmlFor={`p-${appointmentId}-${i}`}>Task {i + 1} title</label>
              <input id={`p-${appointmentId}-${i}`} value={t.title} maxLength={200} readOnly={t.is_medication} onChange={(e) => setProp(i, { title: e.target.value })} />
              <button className="text-btn danger" onClick={() => setProposed(proposed.filter((_, j) => j !== i))} aria-label={`Remove task ${i + 1}`}>Remove</button>
            </div>
            <p className="task-source">From your instructions: “{t.source_text}”</p>
            <p className="task-meta">
              <span>{t.deadline ? `Due ${t.deadline}` : "No deadline stated"}</span>
              {t.is_medication && <span>Medication wording kept exactly as entered</span>}
            </p>
            {t.needs_clarification && <p className="task-flag"><strong>Check with your healthcare professional.</strong>{t.clarification_reason ? ` ${t.clarification_reason}` : ""}</p>}
          </li>
        ))}
      </ol>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn ghost" onClick={() => setProposed(null)}>Back to text</button>
        <button className="btn primary" onClick={confirm} disabled={!proposed.length || busy === "confirm"}>{busy === "confirm" && <Spinner />} Confirm {proposed.length} task{proposed.length === 1 ? "" : "s"}</button>
      </div>
    </div>
  );

  const hasTasks = !!tasks && tasks.length > 0;
  return (
    <div className="followup">
      {error && <div className="alert error" role="alert">{error}</div>}

      <div className="checklist">
        <h3>Checklist</h3>
        {!tasks && <div className="skeleton" style={{ height: 56 }} />}
        {tasks && tasks.length === 0 && !proposed && <p className="muted small">No tasks yet. Add the instructions you were given below, or add a task yourself.</p>}
        {hasTasks && (
          <ul className="task-list">
            {tasks!.map((t) => (
              <TaskCard key={t.id} task={t}
                onChange={(n) => { setTasks((x) => x!.map((y) => (y.id === n.id ? n : y))); onChanged?.(); }}
                onDelete={(id) => { setTasks((x) => x!.filter((y) => y.id !== id)); onChanged?.(); }} />
            ))}
          </ul>
        )}
        <form className="add-task" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) addManual(); }}>
          <label className="sr-only" htmlFor={`manual-${appointmentId}`}>Add a task yourself</label>
          <input id={`manual-${appointmentId}`} placeholder="Add a task yourself, e.g. bring Medicare card" value={manual} maxLength={200} onChange={(e) => setManual(e.target.value)} />
          <button className="btn" disabled={!manual.trim()}>Add</button>
        </form>
      </div>

      <div className="instr-wrap">
        {review ?? instructionsForm}
      </div>
    </div>
  );
}
