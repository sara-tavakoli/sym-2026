import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, fmtDateTime, SECTION_KEYS, SECTION_TITLES, STATUS_LABELS, type SectionKey, type TaskStatus } from "../lib/api";
import { useApp } from "../lib/app-context";
import { ROLE_HELP, ROLE_LABELS, type SupportTask, type SupportView, type Supported } from "../lib/circle";
import { ActivityFeed, Avatar } from "../components/CircleBits";
import { Skeletons, Spinner } from "../components/ui";

/** /app/supporting: the circles I've been invited into. */
export default function SupportingList() {
  const [items, setItems] = useState<Supported[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.get<{ items: Supported[] }>("/supporting").then((r) => setItems(r.items)).catch((e) => setError(e.message)); }, []);

  return (
    <div className="stack fade-in">
      <div className="page-head"><div><h1>People I support</h1><p className="muted">Appointments and follow-up tasks shared with you by people whose care circle you've joined.</p></div></div>
      {error && <div className="alert error" role="alert">{error}</div>}
      {!items && !error && <Skeletons rows={2} />}
      {items && items.length === 0 && (
        <div className="card empty"><h3>You're not supporting anyone yet</h3><p>When someone invites you to their care circle, open the link they send you and accept it.</p><Link className="btn" to="/app/circle">Go to your own care circle</Link></div>
      )}
      {items && items.length > 0 && (
        <div className="card">
          {items.map((p) => (
            <Link key={p.owner_id} to={`/app/supporting/${p.owner_id}`} className="item">
              <Avatar name={p.name} />
              <div className="item-body">
                <div className="item-title">{p.name}</div>
                <div className="item-sub">{p.upcoming} upcoming · {p.open_tasks} open task{p.open_tasks === 1 ? "" : "s"}{p.my_tasks ? ` · ${p.my_tasks} taken on by you` : ""}</div>
              </div>
              <span className={`badge ${p.role === "helper" ? "ok" : ""}`}>{ROLE_LABELS[p.role]}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

type SharedBrief = { appointment: { practitioner_name: string; service_type: string; clinic_name: string; starts_at: string }; brief: { updated_at: string; sections: Record<SectionKey, { id: string; text: string }[]> } };

function BriefSheet({ ownerId, apptId, ownerName }: { ownerId: string; apptId: string; ownerName: string }) {
  const [data, setData] = useState<SharedBrief | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.get<SharedBrief>(`/supporting/${ownerId}/appointments/${apptId}/brief`).then(setData).catch((e) => setError(e.message)); }, [ownerId, apptId]);
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <Skeletons rows={2} />;
  return (
    <article className="sheet" style={{ marginTop: ".75rem" }}>
      <header>
        <p className="sheet-kicker">CarePath AI · {ownerName}'s confirmed brief (read-only)</p>
        <h1>{data.appointment.practitioner_name}</h1>
        <p className="muted">{data.appointment.service_type} · {data.appointment.clinic_name} · {fmtDateTime(data.appointment.starts_at)}</p>
      </header>
      {SECTION_KEYS.map((s) => data.brief.sections[s].length > 0 && (
        <section key={s}>
          <h2>{SECTION_TITLES[s]}</h2>
          {s === "timeline" || s === "questions" ? <ol>{data.brief.sections[s].map((p) => <li key={p.id}>{p.text}</li>)}</ol>
            : <ul>{data.brief.sections[s].map((p) => <li key={p.id}>{p.text}</li>)}</ul>}
        </section>
      ))}
      <footer>Prepared by {ownerName} using CarePath, an organisational tool. Not a medical record or medical advice.</footer>
    </article>
  );
}

function SupportTaskRow({ task, canEdit, ownerId, onChange }: { task: SupportTask; canEdit: boolean; ownerId: string; onChange: (t: SupportTask) => void }) {
  const { user, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const mine = task.assignee_user_id === user?.id;
  async function patch(body: { status?: TaskStatus; assign?: "me" | "none" }) {
    setBusy(true);
    try { onChange(await api.patch<SupportTask>(`/supporting/${ownerId}/tasks/${task.id}`, body)); }
    catch (e) { notify(e instanceof ApiError ? e.message : "Could not save", "error"); }
    finally { setBusy(false); }
  }
  return (
    <div className={`task ${task.status === "completed" ? "done" : ""}`}>
      <div className="task-top">
        {canEdit && <input type="checkbox" style={{ width: 22, minHeight: 22, marginTop: 3 }} checked={task.status === "completed"} disabled={busy}
          aria-label={`Mark "${task.title}" ${task.status === "completed" ? "not completed" : "completed"}`}
          onChange={(e) => patch({ status: e.target.checked ? "completed" : "todo" })} />}
        <div className="task-title">{task.title}</div>
        {canEdit ? (
          <select aria-label={`Status of "${task.title}"`} value={task.status} disabled={busy} onChange={(e) => patch({ status: e.target.value as TaskStatus })}>
            {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        ) : <span className={`badge ${task.status === "completed" ? "ok" : ""}`}>{STATUS_LABELS[task.status]}</span>}
      </div>
      <div className="meta">
        {task.deadline && <span className="badge info">Due: {task.deadline}</span>}
        {task.needs_clarification ? <span className="badge warn">Needs confirming with their healthcare professional</span> : null}
        {task.assignee_name ? <span className="badge ok">{mine ? "You're doing this" : `Assigned to ${task.assignee_name}`}</span> : null}
        <span className="small muted">From {task.practitioner_name}</span>
        {canEdit && task.status !== "completed" && !task.assignee_user_id && <button className="btn sm" disabled={busy} onClick={() => patch({ assign: "me" })}>{busy && <Spinner />} I'll take this</button>}
        {canEdit && mine && <button className="btn sm ghost" disabled={busy} onClick={() => patch({ assign: "none" })}>Hand back</button>}
      </div>
    </div>
  );
}

/** /app/supporting/:ownerId: what one person has shared with me. */
export function SupportingDetail() {
  const { ownerId = "" } = useParams();
  const [data, setData] = useState<SupportView | null>(null);
  const [error, setError] = useState("");
  const [openBrief, setOpenBrief] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<SupportView>(`/supporting/${ownerId}`).then(setData).catch((e: ApiError) => setError(e.status === 404 ? "You don't have access to this care circle. You may have been removed, or the link is wrong." : e.message));
  }, [ownerId]);
  useEffect(load, [load]);

  if (error) return <div className="stack"><div className="alert error" role="alert">{error}</div><Link to="/app/supporting">← People I support</Link></div>;
  if (!data) return <Skeletons rows={4} />;
  const first = data.owner.name.split(" ")[0];
  const canEdit = data.role === "helper";
  const open = data.tasks.filter((t) => t.status !== "completed"), done = data.tasks.filter((t) => t.status === "completed");

  return (
    <div className="stack fade-in">
      <Link to="/app/supporting" className="small">← People I support</Link>
      <div className="page-head">
        <div className="row" style={{ alignItems: "center" }}>
          <Avatar name={data.owner.name} />
          <div><h1 style={{ margin: 0 }}>{data.owner.name}</h1><p className="muted small">You're a <strong>{ROLE_LABELS[data.role]}</strong>: {ROLE_HELP[data.role].toLowerCase()}</p></div>
        </div>
      </div>

      <section className="card" aria-labelledby="sup-up">
        <div className="card-head"><h2 id="sup-up">Upcoming appointments</h2></div>
        {data.appointments.length === 0 ? <div className="empty"><h3>No upcoming appointments</h3></div> : data.appointments.map((a) => {
          const d = new Date(a.starts_at);
          return (
            <div key={a.id}>
              <div className="item wrap">
                <div className="item-date"><b>{d.getDate()}</b><span>{d.toLocaleString("en-AU", { month: "short" })}</span></div>
                <div className="item-body">
                  <div className="item-title">{a.practitioner_name}</div>
                  <div className="item-sub">{a.service_type} · {a.clinic_name} · {d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}{a.location ? ` · ${a.location}` : ""}</div>
                </div>
                {a.brief_ready ? (
                  <button className="btn sm" aria-expanded={openBrief === a.id} onClick={() => setOpenBrief(openBrief === a.id ? null : a.id)}>{openBrief === a.id ? "Hide brief" : "View brief"}</button>
                ) : <span className="badge">Brief not shared yet</span>}
              </div>
              {openBrief === a.id && <BriefSheet ownerId={ownerId} apptId={a.id} ownerName={data.owner.name} />}
            </div>
          );
        })}
        <p className="small muted" style={{ margin: ".75rem 0 0" }}>You only see briefs {first} has confirmed. Their notes and drafts stay private.</p>
      </section>

      <div className="grid cols-2">
        <section className="card" aria-labelledby="sup-tasks">
          <div className="card-head"><h2 id="sup-tasks">Follow-up tasks</h2><span className="badge">{open.length} open</span></div>
          {!canEdit && <p className="small muted">You can see these tasks. Ask {first} to make you a Helper if you'd like to tick them off or take them on.</p>}
          {data.tasks.length === 0 && <div className="empty"><h3>No follow-up tasks</h3><p>Tasks {first} confirms after a visit will appear here.</p></div>}
          {open.map((t) => <SupportTaskRow key={t.id} task={t} canEdit={canEdit} ownerId={ownerId} onChange={() => load()} />)}
          {done.length > 0 && <h3 style={{ marginTop: "1rem" }}>Completed</h3>}
          {done.map((t) => <SupportTaskRow key={t.id} task={t} canEdit={canEdit} ownerId={ownerId} onChange={() => load()} />)}
        </section>
        <div className="stack">
          <section className="card" aria-labelledby="sup-act">
            <div className="card-head"><h2 id="sup-act">Recent activity</h2></div>
            <ActivityFeed items={data.activity} empty="Nothing yet." />
          </section>
          <section className="card" aria-labelledby="sup-mem">
            <div className="card-head"><h2 id="sup-mem">{first}'s care circle</h2></div>
            {data.members.map((m, i) => (
              <div key={i} className="item"><Avatar name={m.name} /><div className="item-body"><div className="item-title">{m.name}</div></div><span className="badge">{ROLE_LABELS[m.role]}</span></div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
