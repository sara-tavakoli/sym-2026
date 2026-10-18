import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, STATUS_LABELS, type Task, type TaskCategory, type TaskStatus } from "../lib/api";
import { useApp } from "../lib/app-context";
import { useHelpers } from "../lib/circle";
import { dueInfo } from "../lib/due";
import { CATEGORY_META, CATEGORY_ORDER, categoryOf, sydneyToday } from "../lib/followthrough";
import { CategoryBadge, DayStrip } from "./CareCalendar";

/** One checklist row. Rendered inside a divided list, so it has no card chrome of its own. */
export function TaskCard({ task, onChange, onDelete, showAppointment, today = sydneyToday() }: { task: Task; onChange: (t: Task) => void; onDelete: (id: string) => void; showAppointment?: boolean; today?: string }) {
  const { notify, user } = useApp();
  const helpers = useHelpers(user?.id);
  const [editing, setEditing] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [deadline, setDeadline] = useState(task.deadline ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const done = task.status === "completed";
  const due = dueInfo(task.due_date, done);
  const category = categoryOf(task);

  async function patch(body: Partial<Pick<Task, "title" | "notes" | "deadline" | "status" | "assignee_user_id" | "category">>) {
    try { onChange(await api.patch<Task>(`/tasks/${task.id}`, body)); return true; }
    catch (e) { notify(e instanceof ApiError ? e.message : "Could not save", "error"); return false; }
  }
  async function remove() {
    if (!window.confirm("Delete this task?")) return;
    try { await api.del(`/tasks/${task.id}`); onDelete(task.id); } catch { notify("Could not delete the task", "error"); }
  }
  async function saveNote() {
    if (notes !== (task.notes ?? "")) { if (!(await patch({ notes: notes || null }))) return; }
    setNoteOpen(false);
  }

  return (
    <li className={`task cat-task cat-${category} ${done ? "done" : ""}`}>
      <input type="checkbox" className="task-check" checked={done}
        aria-label={`Mark "${task.title}" ${done ? "not completed" : "completed"}`}
        onChange={(e) => patch({ status: e.target.checked ? "completed" : "todo" })} />
      <div className="task-body">
        {editing ? (
          <div className="task-edit">
            <label className="sr-only" htmlFor={`t-${task.id}`}>Task title</label>
            <input id={`t-${task.id}`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            <label className="sr-only" htmlFor={`d-${task.id}`}>Deadline</label>
            <input id={`d-${task.id}`} placeholder="Deadline, only if you were given one" value={deadline} maxLength={100} onChange={(e) => setDeadline(e.target.value)} />
            <div className="row">
              <button className="btn sm primary" disabled={!title.trim()} onClick={async () => { if (await patch({ title, deadline: deadline || null })) setEditing(false); }}>Save</button>
              <button className="btn sm ghost" onClick={() => { setEditing(false); setTitle(task.title); setDeadline(task.deadline ?? ""); }}>Cancel</button>
            </div>
          </div>
        ) : <p className="task-name">{task.title}</p>}

        {task.source_text !== "Added manually" && <p className="task-source">From your instructions: “{task.source_text}”</p>}

        <p className="task-meta">
          <CategoryBadge category={category} />
          {task.deadline && !editing && (due ? <span className={`badge ${due.tone}`} title={`“${task.deadline}”`}>{due.label}</span> : <span>Due {task.deadline}</span>)}
          {task.assignee_name && <span className="badge">Assigned to {task.assignee_name}</span>}
          {showAppointment && task.practitioner_name && <Link to={`/app/appointments/${task.appointment_id}#follow-up`}>{task.practitioner_name}</Link>}
          {task.source_text === "Added manually" && <span>Added by you</span>}
        </p>
        {task.needs_clarification ? (
          <p className="task-flag"><strong>Check with your healthcare professional.</strong>{task.clarification_reason ? ` ${task.clarification_reason}` : ""}</p>
        ) : null}

        {category === "daily" && <DayStrip task={task} today={today} onChange={onChange} />}

        {task.notes && !noteOpen && <p className="task-note"><span className="muted">Your note:</span> {task.notes}</p>}
        {noteOpen && (
          <div className="task-edit">
            <label className="sr-only" htmlFor={`n-${task.id}`}>Your note</label>
            <textarea id={`n-${task.id}`} rows={2} value={notes} maxLength={2000} autoFocus onChange={(e) => setNotes(e.target.value)} placeholder="Anything you want to remember about this task" />
            <div className="row">
              <button className="btn sm primary" onClick={saveNote}>Save note</button>
              <button className="btn sm ghost" onClick={() => { setNoteOpen(false); setNotes(task.notes ?? ""); }}>Cancel</button>
            </div>
          </div>
        )}

        {!editing && !noteOpen && (
          <div className="task-actions">
            <button className="text-btn" onClick={() => setNoteOpen(true)}>{task.notes ? "Edit note" : "Add note"}</button>
            <button className="text-btn" onClick={() => setEditing(true)}>Edit</button>
            <button className="text-btn danger" onClick={remove}>Delete</button>
            <select aria-label={`Type of task for "${task.title}"`} className="assign-select cat-select" value={category}
              onChange={(e) => patch({ category: e.target.value as TaskCategory })}>
              {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
            </select>
            {(helpers.length > 0 || task.assignee_user_id) && (
              <select aria-label={`Who is doing "${task.title}"`} className="assign-select" value={task.assignee_user_id ?? ""}
                onChange={(e) => patch({ assignee_user_id: e.target.value || null })}>
                <option value="">Me</option>
                {helpers.map((h) => <option key={h.member_id} value={h.member_id}>{h.name}</option>)}
                {task.assignee_user_id && !helpers.some((h) => h.member_id === task.assignee_user_id) && <option value={task.assignee_user_id}>{task.assignee_name ?? "Circle member"}</option>}
              </select>
            )}
          </div>
        )}
      </div>
      <label className="sr-only" htmlFor={`s-${task.id}`}>Status</label>
      <select id={`s-${task.id}`} className={`status-select status-${task.status}`} value={task.status} onChange={(e) => patch({ status: e.target.value as TaskStatus })}>
        {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
      </select>
    </li>
  );
}
