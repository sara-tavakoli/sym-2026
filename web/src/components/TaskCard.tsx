import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, STATUS_LABELS, type Task, type TaskStatus } from "../lib/api";
import { useApp } from "../lib/app-context";
import { dueInfo } from "../lib/due";

export function TaskCard({ task, onChange, onDelete, showAppointment }: { task: Task; onChange: (t: Task) => void; onDelete: (id: string) => void; showAppointment?: boolean }) {
  const { notify } = useApp();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [deadline, setDeadline] = useState(task.deadline ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const due = dueInfo(task.due_date, task.status === "completed");

  async function patch(body: Partial<Pick<Task, "title" | "notes" | "deadline" | "status">>) {
    try { onChange(await api.patch<Task>(`/tasks/${task.id}`, body)); return true; }
    catch (e) { notify(e instanceof ApiError ? e.message : "Could not save", "error"); return false; }
  }
  async function remove() {
    if (!window.confirm("Delete this task?")) return;
    try { await api.del(`/tasks/${task.id}`); onDelete(task.id); } catch { notify("Could not delete the task", "error"); }
  }

  return (
    <div className={`task ${task.status === "completed" ? "done" : ""}`}>
      <div className="task-top">
        <input type="checkbox" style={{ width: 22, minHeight: 22, marginTop: 3 }} checked={task.status === "completed"}
          aria-label={`Mark "${task.title}" ${task.status === "completed" ? "not completed" : "completed"}`}
          onChange={(e) => patch({ status: e.target.checked ? "completed" : "todo" })} />
        {editing ? (
          <div style={{ flex: 1 }}>
            <input aria-label="Task title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            <input aria-label="Deadline" style={{ marginTop: 6 }} placeholder="Deadline (optional) — only if you were given one" value={deadline} maxLength={100} onChange={(e) => setDeadline(e.target.value)} />
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn sm primary" disabled={!title.trim()} onClick={async () => { if (await patch({ title, deadline: deadline || null })) setEditing(false); }}>Save</button>
              <button className="btn sm" onClick={() => { setEditing(false); setTitle(task.title); setDeadline(task.deadline ?? ""); }}>Cancel</button>
            </div>
          </div>
        ) : <div className="task-title">{task.title}</div>}
        <select aria-label="Status" value={task.status} onChange={(e) => patch({ status: e.target.value as TaskStatus })}>
          {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>
      {task.source_text !== "Added manually" && <div className="src">From your instructions: <q>{task.source_text}</q></div>}
      <div className="meta">
        {task.deadline && !editing && (due
          ? <><span className={`badge ${due.tone}`}>{due.label}</span><span className="small muted">“{task.deadline}”</span></>
          : <span className="badge info">Due: {task.deadline}</span>)}
        {task.needs_clarification ? <span className="badge warn" title={task.clarification_reason ?? ""}>Confirm with your healthcare professional</span> : null}
        {showAppointment && task.practitioner_name && <Link className="small" to={`/app/appointments/${task.appointment_id}`}>{task.practitioner_name}</Link>}
        {!editing && <button className="btn sm ghost" onClick={() => setEditing(true)}>Edit</button>}
        <button className="btn sm ghost danger" onClick={remove}>Delete</button>
      </div>
      {task.needs_clarification && task.clarification_reason ? <div className="small" style={{ color: "var(--warn)", marginTop: 4 }}>{task.clarification_reason}</div> : null}
      <textarea aria-label="Notes" placeholder="Your notes (optional)" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (notes !== (task.notes ?? "")) patch({ notes: notes || null }); }} />
    </div>
  );
}
