import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, fmtDateTime, type Appointment } from "../lib/api";
import { useApp } from "../lib/app-context";
import { AppointmentForm } from "../components/AppointmentForm";
import { Modal, PrepBadge, Skeletons, Spinner } from "../components/ui";
import { FollowUpPanel } from "../components/FollowUpPanel";

export default function AppointmentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { notify } = useApp();
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Appointment>(`/appointments/${id}`).then(setAppt).catch((e: ApiError) => setError(e.status === 404 ? "We couldn't find that appointment." : e.message));
  }, [id]);

  const refresh = () => { api.get<Appointment>(`/appointments/${id}`).then(setAppt).catch(() => {}); };

  async function remove() {
    setBusy(true);
    try { await api.del(`/appointments/${id}`); notify("Appointment deleted"); nav("/app/appointments", { replace: true }); }
    catch (e) { notify(e instanceof ApiError ? e.message : "Could not delete", "error"); setBusy(false); setConfirmDelete(false); }
  }

  useEffect(() => { if (appt && location.hash === "#follow-up") document.getElementById("follow-up")?.scrollIntoView(); }, [appt?.id]);

  if (error) return <div className="card empty"><h3>{error}</h3><Link className="btn" to="/app/appointments">Back to appointments</Link></div>;
  if (!appt) return <Skeletons rows={3} />;

  const isPast = new Date(appt.starts_at) < new Date();
  return (
    <div className="stack fade-in">
      <Link to="/app/appointments" className="small">← All appointments</Link>
      <div className="page-head">
        <div>
          <h1>{appt.practitioner_name}</h1>
          <p className="muted">{appt.service_type} · {fmtDateTime(appt.starts_at)}</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn danger" onClick={() => setConfirmDelete(true)}>Delete</button>
        </div>
      </div>

      <section className="card">
        <div className="card-head"><h2>Details</h2><span className={`badge ${isPast ? "" : "info"}`}>{isPast ? "Past" : "Upcoming"}</span></div>
        <dl className="details" style={{ margin: 0 }}>
          <dt>Clinic</dt><dd>{appt.clinic_name}</dd>
          {appt.location && <><dt>Location</dt><dd>{appt.location}</dd></>}
          {appt.purpose && <><dt>Purpose</dt><dd>{appt.purpose}</dd></>}
        </dl>
      </section>

      <section className="card" aria-labelledby="prep-h">
        <div className="card-head"><h2 id="prep-h">Appointment preparation</h2><PrepBadge status={appt.prep_status} /></div>
        <p className="muted">{appt.prep_status === "confirmed" ? "Your brief is confirmed and ready to take with you." : appt.prep_status === "none" ? "Write down your concerns and questions and CarePath will organise them into a brief you can edit." : "You've started preparing. Pick up where you left off."}</p>
        <div className="row">
          <Link className="btn primary" to={`/app/appointments/${appt.id}/prepare`}>{appt.prep_status === "none" ? "Prepare for this appointment" : "Open preparation"}</Link>
          {(appt.prep_status === "draft" || appt.prep_status === "confirmed") && <Link className="btn" to={`/app/appointments/${appt.id}/brief`}>Printable brief</Link>}
        </div>
      </section>

      <section className="card" id="follow-up" aria-labelledby="fu-h">
        <div className="card-head"><h2 id="fu-h">After the visit</h2>
          <span className="badge">{appt.open_tasks} open · {appt.done_tasks} done</span></div>
        {!isPast && <div className="alert info">This appointment hasn't happened yet. You can add instructions once you've received them.</div>}
        <FollowUpPanel appointmentId={appt.id} onChanged={refresh} />
      </section>

      {editing && <AppointmentForm existing={appt} onClose={() => setEditing(false)} onSaved={(a) => { setAppt(a); setEditing(false); notify("Changes saved"); }} />}
      {confirmDelete && (
        <Modal title="Delete this appointment?" onClose={() => setConfirmDelete(false)}>
          <p>This permanently deletes the appointment and anything attached to it, including briefs and tasks. This can't be undone.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setConfirmDelete(false)}>Keep it</button>
            <button className="btn danger solid" onClick={remove} disabled={busy}>{busy && <Spinner />} Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
