import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, fmtDateTime, SECTION_TITLES, type Appointment, type Brief, type PrepNotes, type SectionKey } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Skeletons, Spinner } from "../components/ui";
import { BriefSections, useBriefDraft } from "../components/BriefEditor";
import { DEMO, DEMO_FILL } from "../lib/demo-fill";
import { copyText } from "../lib/shares";
import "../shares.css";
import "../booking.css";

const EMPTY: PrepNotes = { main_concern: "", onset: "", background: "", experiences: "", questions: "", additional: "" };

export const PROMPTS: { key: keyof PrepNotes; label: string; hint: string; rows?: number }[] = [
  { key: "main_concern", label: "What is your main concern?", hint: "In your own words — what do you want help with?" },
  { key: "onset", label: "When did it start?", hint: "Roughly is fine, e.g. “about three weeks ago”." },
  { key: "experiences", label: "What have you noticed or experienced?", hint: "Anything you've observed, in the order it happened if you can.", rows: 4 },
  { key: "background", label: "Relevant background you choose to share", hint: "Only what you're comfortable including. Leave blank if nothing applies." },
  { key: "questions", label: "Questions you want to ask", hint: "One per line works well. Put the most important first.", rows: 4 },
  { key: "additional", label: "Anything else to remember?", hint: "e.g. things to bring, things to mention." },
];

export default function Prepare() {
  const { id } = useParams();
  const nav = useNavigate();
  const { notify } = useApp();
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [notes, setNotes] = useState<PrepNotes>(EMPTY);
  const [brief, setBrief] = useState<Brief | null>(null);
  const { draft, dirty, adopt: adoptDraft, ops, payload } = useBriefDraft();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState<"" | "generate" | "save" | "notes" | "confirm" | SectionKey>("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    Promise.all([api.get<Appointment>(`/appointments/${id}`), api.get<{ notes: PrepNotes; brief: Brief | null }>(`/appointments/${id}/prep`)])
      .then(([a, p]) => {
        const blank = Object.values(p.notes).every((v) => !v.trim());
        // A booked visit starts from the reason the person gave when booking (their own words); they can edit it.
        // With demo defaults on, the other prompts start filled with fictional notes too.
        const start = blank && a.booking_ref ? { ...p.notes, ...(DEMO_FILL ? DEMO.prep : {}), main_concern: a.purpose ?? (DEMO_FILL ? DEMO.concern : "") } : p.notes;
        setAppt(a); setNotes(start); setBrief(p.brief);
        if (p.brief) { adoptDraft(p.brief); setStep(p.brief.status === "confirmed" ? 3 : 2); }
      })
      .catch((e: ApiError) => setLoadError(e.status === 404 ? "We couldn't find that appointment." : e.message));
  }, [id]);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
  const hasNotes = Object.values(notes).some((v) => v.trim());

  function adopt(b: Brief) { setBrief(b); adoptDraft(b); }

  async function generate(section?: SectionKey) {
    setError(""); setBusy(section ?? "generate");
    try {
      if (dirty && section) await saveEdits(true);
      if (!section) await api.put(`/appointments/${id}/prep-notes`, notes);
      const r = await api.post<{ brief: Brief }>(section ? `/appointments/${id}/brief/sections/${section}/regenerate` : `/appointments/${id}/brief/generate`);
      adopt(r.brief); setStep(2);
      notify(section ? `${SECTION_TITLES[section]} regenerated` : "Brief generated — please review it");
    } catch (e) { fail(e); } finally { setBusy(""); }
  }

  async function saveEdits(silent = false) {
    if (!draft) return null;
    const r = await api.put<{ brief: Brief }>(`/appointments/${id}/brief`, payload());
    adopt(r.brief);
    if (!silent) notify("Edits saved");
    return r.brief;
  }

  // Save the notes (questions included) without generating anything yet.
  async function saveNotes() {
    setError(""); setBusy("notes");
    try { await api.put(`/appointments/${id}/prep-notes`, notes); notify("Notes saved"); } catch (e) { fail(e); } finally { setBusy(""); }
  }

  async function confirm() {
    setError(""); setBusy("confirm");
    try {
      if (dirty) await saveEdits(true);
      const r = await api.post<{ brief: Brief }>(`/appointments/${id}/brief/confirm`);
      adopt(r.brief); setStep(3); notify("Brief saved");
    } catch (e) { fail(e); } finally { setBusy(""); }
  }

  if (loadError) return <div className="card empty"><h3>{loadError}</h3><Link className="btn" to="/app/appointments">Back to appointments</Link></div>;
  if (!appt) return <Skeletons rows={4} />;

  const stepNames = ["Your notes", "Review brief", "Saved"];
  return (
    <div className="stack fade-in">
      <Link to={`/app/appointments/${id}`} className="back-link">← {appt.practitioner_name} · {fmtDateTime(appt.starts_at)}</Link>
      <div className="page-head"><div><h1>Prepare for your appointment</h1>
        <p className="muted">Write in your own words. CarePath organises what you wrote — it never adds medical information.</p></div></div>

      <ol className="steps" aria-label="Progress">
        {stepNames.map((n, i) => (
          <li key={n} className={step > i + 1 ? "done" : step === i + 1 ? "now" : ""} aria-current={step === i + 1 ? "step" : undefined}>
            <span>{step > i + 1 ? "✓" : i + 1}</span>{n}
          </li>
        ))}
      </ol>
      {error && <div className="alert error" role="alert">{error}</div>}

      {step === 1 && (
        <form className="card" onSubmit={(e) => { e.preventDefault(); generate(); }}>
          <div className="alert info">Use fictional information only while CarePath is in demo mode. For symptom advice use the <a href="https://www.healthdirect.gov.au/symptom-checker" target="_blank" rel="noreferrer">Healthdirect Symptom Checker</a>. In an emergency call <strong>000</strong>.</div>
          {PROMPTS.map((p) => (
            <div className="field" key={p.key}>
              <label htmlFor={p.key}>{p.label}</label>
              <textarea id={p.key} rows={p.rows ?? 2} maxLength={3000} value={notes[p.key]} onChange={(e) => setNotes({ ...notes, [p.key]: e.target.value })} aria-describedby={`${p.key}-h`} />
              <div className="hint" id={`${p.key}-h`}>{p.hint}</div>
            </div>
          ))}
          <div className="row between">
            <span className="small muted">{busy === "generate" ? "Generating… this usually takes a few seconds." : "When you generate, your notes are sent to Google Gemini to be organised. Use fictional details only."}</span>
            <div className="row">
              {brief && <button type="button" className="btn" onClick={() => setStep(2)}>Back to brief</button>}
              <button type="button" className="btn" onClick={saveNotes} disabled={!hasNotes || !!busy}>{busy === "notes" && <Spinner />} Save notes</button>
              <button className="btn primary" disabled={!hasNotes || busy === "generate"}>{busy === "generate" && <Spinner />} {brief ? "Regenerate brief" : "Generate brief"}</button>
            </div>
          </div>
          {brief && <p className="small muted" style={{ marginTop: ".75rem" }}>Regenerating replaces the current brief, including your edits.</p>}
        </form>
      )}

      {step >= 2 && draft && brief && (
        <>
          {brief.status === "confirmed" ? (
            <div className="alert info" role="status">This brief is saved. Editing it will return it to draft until you save it again.</div>
          ) : (
            <div className="alert warn" role="status"><strong>Draft — not final yet.</strong> Check each point against what you wrote, edit or delete anything that isn't right, then save.</div>
          )}
          {brief.dropped > 0 && <div className="alert info">{brief.dropped} AI-suggested point{brief.dropped > 1 ? "s were" : " was"} removed because {brief.dropped > 1 ? "they" : "it"} couldn't be traced back to your notes.</div>}

          <BriefSections draft={draft} ops={ops} busy={busy} onRegenerate={(s) => generate(s)} />

          <div className="row between sticky-actions">
            <button className="btn" onClick={() => setStep(1)}>Edit my notes</button>
            <div className="row">
              {dirty && <button className="btn" onClick={() => { setBusy("save"); saveEdits().catch(fail).finally(() => setBusy("")); }} disabled={!!busy}>{busy === "save" && <Spinner />} Save edits</button>}
              {!(brief.status === "confirmed" && !dirty) && (
                <button className="btn primary" onClick={confirm} disabled={!!busy}>{busy === "confirm" && <Spinner />} Save brief</button>
              )}
            </div>
          </div>
          {brief.status === "confirmed" && !dirty && <SendToClinician appt={appt} onPrint={() => nav(`/app/appointments/${id}/brief`)} />}
        </>
      )}
    </div>
  );
}

/** After saving: send the brief to the clinician (a private, expiring link), keep it private, or print it. */
function SendToClinician({ appt, onPrint }: { appt: Appointment; onPrint: () => void }) {
  const { notify } = useApp();
  const [choice, setChoice] = useState<"share" | "private" | null>(appt.share_choice);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"" | "send" | "private">("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function send() {
    setBusy("send"); setError(""); setCopied(false);
    try {
      await api.put(`/appointments/${appt.id}/share-choice`, { choice: "share" });
      const r = await api.post<{ path: string }>(`/appointments/${appt.id}/shares`, { expires_in_days: 7 });
      setLink(`${window.location.origin}${r.path}`); setChoice("share");
      window.dispatchEvent(new Event("carepath:notifications"));
      notify(`Brief ready for ${appt.practitioner_name}`);
    } catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't create the link. Please try again."); } finally { setBusy(""); }
  }
  async function keep() {
    setBusy("private"); setError("");
    try { await api.put(`/appointments/${appt.id}/share-choice`, { choice: "private" }); setChoice("private"); setLink(""); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Couldn't save your choice."); } finally { setBusy(""); }
  }
  async function copy() { setCopied(await copyText(link, input.current)); }

  return (
    <section className="card send-brief" aria-labelledby="send-h">
      <p className="bk-tick" aria-hidden="true">✓</p>
      <h2 id="send-h">Brief saved</h2>
      <p className="muted">Would you like to send it to {appt.practitioner_name} before your visit? They can read it, tick off your questions during the appointment and send your after-visit plan back here.</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="row send-brief-actions">
        <button className="btn primary" onClick={send} disabled={!!busy}>{busy === "send" && <Spinner />} {link ? "Create a new link" : `Send to ${appt.practitioner_name}`}</button>
        <button className="btn" onClick={keep} disabled={!!busy || !!link} aria-pressed={choice === "private"}>{busy === "private" && <Spinner />} Keep it for myself</button>
        <button className="btn ghost" onClick={onPrint}>Open printable brief</button>
      </div>
      {link && (
        <div className="share-link send-brief-link" role="status">
          <label htmlFor="send-url">Your clinician link (expires in 7 days)</label>
          <div className="share-link-row">
            <input id="send-url" ref={input} readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn primary" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <p className="small muted" style={{ margin: ".4rem 0 0" }}>
            Send this link to {appt.practitioner_name} (CarePath doesn't email it for you). <a href={link} target="_blank" rel="noreferrer">See what your clinician sees ↗</a>
            {" · "}<Link to={`/app/appointments/${appt.id}#share`}>Manage or revoke</Link>
          </p>
        </div>
      )}
      {choice === "private" && !link && <div className="alert info" role="status">Your brief stays private to you. Print it or open it on your phone at the visit. You can still send it later.</div>}
    </section>
  );
}
