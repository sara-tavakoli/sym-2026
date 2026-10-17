import { useEffect, useRef, useState } from "react";
import { api, ApiError, type ProposedTask, type Task } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Spinner } from "./ui";
import { TaskCard } from "./TaskCard";

/** `prefill` (e.g. a plan sent by a clinician) replaces the instructions text whenever its key changes; `onConfirmed` runs after tasks are saved. */
export function FollowUpPanel({ appointmentId, onChanged, prefill, onConfirmed }:
  { appointmentId: string; onChanged?: () => void; prefill?: { text: string; key: number }; onConfirmed?: () => void }) {
  const { notify } = useApp();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [text, setText] = useState("");
  const [proposed, setProposed] = useState<ProposedTask[] | null>(null);
  const [busy, setBusy] = useState<"" | "extract" | "confirm">("");
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!prefill) return;
    setText(prefill.text); setProposed(null); setError("");
    requestAnimationFrame(() => { textRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); textRef.current?.focus(); });
  }, [prefill?.key]);

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
      setTasks((t) => [...(t ?? []), ...r.tasks]); setProposed(null); setText(""); onChanged?.(); onConfirmed?.();
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

  return (
    <div className="stack">
      {error && <div className="alert error" role="alert">{error}</div>}

      {!proposed && (
        <div>
          <div className="field">
            <label htmlFor={`instr-${appointmentId}`}>Instructions from your healthcare professional</label>
            <textarea ref={textRef} id={`instr-${appointmentId}`} rows={5} maxLength={6000} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Paste or type what you were told, e.g. “Book a follow-up in 2 weeks. Get a blood test at …”" />
            <div className="hint">CarePath only lists actions that are written here. It won't add advice or change medication wording.</div>
          </div>
          <button className="btn primary" onClick={extract} disabled={!text.trim() || busy === "extract"}>{busy === "extract" && <Spinner />} Extract tasks</button>
          {busy === "extract" && <span className="small muted"> Reading your instructions… this usually takes a few seconds.</span>}
        </div>
      )}

      {proposed && (
        <div className="card" style={{ background: "var(--surface-2)" }}>
          <h3>Review before saving</h3>
          <p className="small muted">Nothing is saved until you confirm. Edit titles, remove anything that isn't right, and check the flagged items with your healthcare professional.</p>
          {proposed.length === 0 && <div className="alert info">No clear actions were found in that text. You can go back and edit it, or add tasks manually below.</div>}
          {proposed.map((t, i) => (
            <div className="task" key={i}>
              <div className="task-top">
                <input aria-label={`Task ${i + 1} title`} value={t.title} maxLength={200} readOnly={t.is_medication} onChange={(e) => setProp(i, { title: e.target.value })} />
                <button className="btn sm ghost danger" onClick={() => setProposed(proposed.filter((_, j) => j !== i))} aria-label={`Remove task ${i + 1}`}>Remove</button>
              </div>
              <div className="src">Source: <q>{t.source_text}</q></div>
              <div className="meta">
                {t.deadline ? <span className="badge info">Due: {t.deadline}</span> : <span className="badge">No deadline stated</span>}
                {t.is_medication && <span className="badge warn">Medication wording kept exactly as entered</span>}
                {t.needs_clarification && <span className="badge warn">Needs clarification</span>}
              </div>
              {t.clarification_reason && <div className="small" style={{ color: "var(--warn)", marginTop: 4 }}>{t.clarification_reason}</div>}
            </div>
          ))}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setProposed(null)}>Back to text</button>
            <button className="btn primary" onClick={confirm} disabled={!proposed.length || busy === "confirm"}>{busy === "confirm" && <Spinner />} Confirm {proposed.length} task{proposed.length === 1 ? "" : "s"}</button>
          </div>
        </div>
      )}

      <div>
        <h3>Checklist</h3>
        {!tasks && <div className="skeleton" style={{ height: 70 }} />}
        {tasks && tasks.length === 0 && <p className="muted small">No tasks yet. Add visit instructions above, or add one yourself.</p>}
        {tasks?.map((t) => (
          <TaskCard key={t.id} task={t}
            onChange={(n) => { setTasks((x) => x!.map((y) => (y.id === n.id ? n : y))); onChanged?.(); }}
            onDelete={(id) => { setTasks((x) => x!.filter((y) => y.id !== id)); onChanged?.(); }} />
        ))}
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) addManual(); }}>
          <input aria-label="Add a task yourself" style={{ flex: 1, minWidth: 200 }} placeholder="Add a task yourself (e.g. bring Medicare card)" value={manual} maxLength={200} onChange={(e) => setManual(e.target.value)} />
          <button className="btn" disabled={!manual.trim()}>Add task</button>
        </form>
      </div>
    </div>
  );
}
