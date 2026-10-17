import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, fmtDateTime, type Appointment } from "../lib/api";
import { useApp } from "../lib/app-context";
import { AppointmentForm } from "../components/AppointmentForm";
import { Modal, PrepBadge, Skeletons, Spinner } from "../components/ui";
import { FollowUpPanel } from "../components/FollowUpPanel";
import { ShareCard } from "../components/ShareCard";
import { ClinicianPlans } from "../components/ClinicianPlans";
import { markPlanImported } from "../lib/shares";

export default function AppointmentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { notify } = useApp();
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  // A clinician plan being turned into a checklist; marked imported once its tasks are confirmed.
  const [planDraft, setPlanDraft] = useState<{ id: string; text: string; key: number } | null>(null);
  const [plansKey, setPlansKey] = useState(0);

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
  const prepText = appt.prep_status === "confirmed" ? "Your brief is confirmed and ready to take with you."
    : appt.prep_status === "none" ? "Write down your concerns and questions, and CarePath will organise them into a brief you can edit."
    : "You've started preparing. Pick up where you left off.";
  return (
    <div className="fade-in">
      <Link to="/app/appointments" className="back-link">← All appointments</Link>
      <header className="detail-head">
        <div className="detail-title">
          <h1>{appt.practitioner_name}</h1>
          <p className="detail-when">{fmtDateTime(appt.starts_at)} <span className={`when-tag ${isPast ? "" : "upcoming"}`}>{isPast ? "Past" : "Upcoming"}</span></p>
        </div>
        <div className="row detail-actions">
          <button className="btn" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn ghost danger" onClick={() => setConfirmDelete(true)}>Delete</button>
        </div>
      </header>
      <dl className="facts">
        <div><dt>Service</dt><dd>{appt.service_type}</dd></div>
        <div><dt>Clinic</dt><dd>{appt.clinic_name}</dd></div>
        {appt.location && <div><dt>Location</dt><dd>{appt.location}</dd></div>}
        {appt.purpose && <div><dt>Purpose</dt><dd>{appt.purpose}</dd></div>}
      </dl>

      <div className="detail-sections">
        <section className="panel section-pad" aria-labelledby="prep-h">
          <div className="panel-head">
            <h2 id="prep-h">Preparation</h2>
            <PrepBadge status={appt.prep_status} />
          </div>
          <p className="muted">{prepText}</p>
          <div className="row">
            <Link className={`btn ${appt.prep_status === "confirmed" ? "" : "primary"}`} to={`/app/appointments/${appt.id}/prepare`}>{appt.prep_status === "none" ? "Prepare for this appointment" : "Open preparation"}</Link>
            {(appt.prep_status === "draft" || appt.prep_status === "confirmed") && <Link className={`btn ${appt.prep_status === "confirmed" ? "primary" : ""}`} to={`/app/appointments/${appt.id}/brief`}>Printable brief</Link>}
          </div>
        </section>

        <ShareCard appt={appt} />

        <section className="panel section-pad" id="follow-up" aria-labelledby="fu-h">
          <div className="panel-head">
            <h2 id="fu-h">After the visit</h2>
            <span className="muted small">{appt.open_tasks} open · {appt.done_tasks} done</span>
          </div>
          {!isPast && <p className="muted small">This appointment hasn't happened yet. Add instructions once you've received them.</p>}
          <ClinicianPlans appointmentId={appt.id} reloadKey={plansKey} activeId={planDraft?.id} onUse={(p) => setPlanDraft({ id: p.id, text: p.text, key: Date.now() })} />
          <FollowUpPanel appointmentId={appt.id} onChanged={refresh} prefill={planDraft ?? undefined}
            onConfirmed={() => { if (planDraft) markPlanImported(appt.id, planDraft.id).catch(() => {}).finally(() => { setPlanDraft(null); setPlansKey((k) => k + 1); refresh(); }); }} />
        </section>
      </div>

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
