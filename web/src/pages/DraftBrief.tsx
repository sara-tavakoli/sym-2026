import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, fmtDateTime, SECTION_TITLES, type Appointment, type Draft, type Page, type PrepNotes, type SectionKey } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Modal, Skeletons, Spinner } from "../components/ui";
import { BriefSections, useBriefDraft } from "../components/BriefEditor";
import { AppointmentForm } from "../components/AppointmentForm";
import { PROMPTS } from "./Prepare";

export default function DraftBrief() {
  const { id } = useParams();
  const nav = useNavigate();
  const { notify } = useApp();
  const [d, setD] = useState<Draft | null>(null);
  const [notes, setNotes] = useState<PrepNotes | null>(null);
  const [title, setTitle] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "notes" | "generate" | "save" | "attach" | "delete" | SectionKey>("");
  const { draft, dirty, adopt, ops, payload } = useBriefDraft();
  const [appts, setAppts] = useState<Appointment[] | null>(null);
  const [target, setTarget] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function take(x: Draft) { setD(x); setNotes(x.notes); setTitle(x.title); adopt(x.brief); }

  useEffect(() => {
    api.get<Draft>(`/drafts/${id}`).then(take).catch((e: ApiError) => setLoadError(e.status === 404 ? "We couldn't find that draft." : e.message));
    api.get<Page<Appointment>>("/appointments?scope=all&pageSize=50").then((r) => setAppts(r.items)).catch(() => setAppts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
  const notesChanged = !!d && !!notes && (title !== d.title || JSON.stringify(notes) !== JSON.stringify(d.notes));

  async function saveNotes(silent = false) {
    const r = await api.put<Draft>(`/drafts/${id}/notes`, { title: title.trim() || d!.title, notes });
    setD(r); setTitle(r.title); setNotes(r.notes);
    if (!silent) notify("Notes saved");
  }
  async function generate(section?: SectionKey) {
    setError(""); setBusy(section ?? "generate");
    try {
      if (!section && notesChanged) await saveNotes(true);
      if (section && dirty) await saveEdits(true);
      const r = await api.post<Draft>(section ? `/drafts/${id}/sections/${section}/regenerate` : `/drafts/${id}/generate`);
      take(r);
      notify(section ? `${SECTION_TITLES[section]} regenerated` : "Brief generated — please review it");
    } catch (e) { fail(e); } finally { setBusy(""); }
  }
  async function saveEdits(silent = false) {
    const r = await api.put<Draft>(`/drafts/${id}/brief`, payload());
    take(r);
    if (!silent) notify("Draft saved");
  }
  async function attach(appointmentId: string, replace = false) {
    setError(""); setBusy("attach");
    try {
      if (dirty) await saveEdits(true);
      if (notesChanged) await saveNotes(true);
      await api.post(`/drafts/${id}/attach`, { appointment_id: appointmentId, replace });
      notify("Brief attached to the appointment — review and confirm it there");
      nav(`/app/appointments/${appointmentId}/prepare`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConfirmReplace(appointmentId);
      else fail(e);
    } finally { setBusy(""); }
  }
  async function remove() {
    setBusy("delete");
    try { await api.del(`/drafts/${id}`); notify("Draft deleted"); nav("/app/preparation", { replace: true }); }
    catch (e) { fail(e); setBusy(""); }
  }

  if (loadError) return <div className="card empty"><h3>{loadError}</h3><Link className="btn" to="/app/preparation">Back to AI Preparation</Link></div>;
  if (!d || !notes) return <Skeletons rows={4} />;
  const fromChat = d.origin === "chat";
  const hasNotes = Object.values(notes).some((v) => v.trim());

  return (
    <div className="stack fade-in">
      <Link to="/app/preparation" className="back-link">← AI Preparation</Link>
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 260 }}>
          <span className="badge info">{fromChat ? "Draft · from your assistant conversation" : "Draft · not attached to an appointment"}</span>
          <label htmlFor="draft-title" className="sr-only">Draft title</label>
          <input id="draft-title" className="title-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <p className="muted small">Saved {fmtDateTime(d.updated_at)}. Attach it to an appointment whenever you're ready.</p>
        </div>
        <button className="btn ghost danger" onClick={() => setConfirmDelete(true)}>Delete draft</button>
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}

      <details className="card notes-card" open={!d.brief}>
        <summary><h2>{fromChat ? "Your words from the conversation" : "Your notes"}</h2></summary>
        {fromChat && <p className="muted small">These are exact excerpts from what you wrote to the assistant — nothing was added. Only these excerpts were saved, not the conversation.</p>}
        {PROMPTS.map((p) => (
          <div className="field" key={p.key}>
            <label htmlFor={`d-${p.key}`}>{p.label}</label>
            <textarea id={`d-${p.key}`} rows={p.rows ?? 2} maxLength={3000} value={notes[p.key]} onChange={(e) => setNotes({ ...notes, [p.key]: e.target.value })} />
          </div>
        ))}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {notesChanged && <button className="btn" disabled={!!busy} onClick={() => { setBusy("notes"); saveNotes().catch(fail).finally(() => setBusy("")); }}>{busy === "notes" && <Spinner />} Save notes</button>}
          <button className="btn primary" disabled={!hasNotes || !!busy} onClick={() => generate()}>{busy === "generate" && <Spinner />} {d.brief ? "Regenerate brief from notes" : "Generate brief"}</button>
        </div>
        {d.brief && <p className="small muted" style={{ marginTop: ".5rem" }}>Regenerating replaces the current draft brief, including your edits.</p>}
      </details>

      {d.brief && draft && (
        <>
          <div className="alert warn" role="status"><strong>Draft — not final.</strong> Check each point against your own words. You'll confirm the brief after attaching it to an appointment.</div>
          {d.brief.dropped > 0 && <div className="alert info">{d.brief.dropped} AI-suggested point{d.brief.dropped > 1 ? "s were" : " was"} removed because {d.brief.dropped > 1 ? "they" : "it"} couldn't be traced back to your words.</div>}
          <BriefSections draft={draft} ops={ops} busy={busy} onRegenerate={(s) => generate(s)} />
          {dirty && (
            <div className="row sticky-actions" style={{ justifyContent: "flex-end" }}>
              <button className="btn primary" disabled={!!busy} onClick={() => { setBusy("save"); saveEdits().catch(fail).finally(() => setBusy("")); }}>{busy === "save" && <Spinner />} Save draft</button>
            </div>
          )}
        </>
      )}

      <section className="card" aria-labelledby="attach-h">
        <h2 id="attach-h">Attach to an appointment</h2>
        <p className="muted small">Your notes and brief move onto the appointment, where you can confirm and print the brief.</p>
        <div className="row">
          <label htmlFor="attach-select" className="sr-only">Choose an appointment</label>
          <select id="attach-select" value={target} onChange={(e) => setTarget(e.target.value)} style={{ flex: 1, minWidth: 220 }} disabled={!appts}>
            <option value="">{appts?.length ? "Choose an appointment…" : "No appointments yet"}</option>
            {appts?.map((a) => <option key={a.id} value={a.id}>{a.practitioner_name} · {a.service_type} · {fmtDateTime(a.starts_at)}</option>)}
          </select>
          <button className="btn primary" disabled={!target || !!busy} onClick={() => attach(target)}>{busy === "attach" && <Spinner />} Attach</button>
          <button className="btn" disabled={!!busy} onClick={() => setCreating(true)}>New appointment…</button>
        </div>
      </section>

      {creating && <AppointmentForm onClose={() => setCreating(false)} onSaved={(a) => { setCreating(false); attach(a.id); }} />}
      {confirmReplace && (
        <Modal title="Replace existing preparation?" onClose={() => setConfirmReplace(null)}>
          <p>That appointment already has preparation notes or a brief. Attaching this draft will replace them.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setConfirmReplace(null)}>Cancel</button>
            <button className="btn danger solid" onClick={() => { const t = confirmReplace; setConfirmReplace(null); attach(t, true); }}>Replace</button>
          </div>
        </Modal>
      )}
      {confirmDelete && (
        <Modal title="Delete this draft?" onClose={() => setConfirmDelete(false)}>
          <p>This permanently deletes the draft notes and brief.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setConfirmDelete(false)}>Keep it</button>
            <button className="btn danger solid" disabled={busy === "delete"} onClick={remove}>{busy === "delete" && <Spinner />} Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
