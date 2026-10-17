import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api, ApiError, FIELD_LABELS, fmtDateTime, SECTION_KEYS, SECTION_TITLES,
  type Appointment, type Brief, type BriefPoint, type PrepNotes, type SectionKey,
} from "../lib/api";
import { useApp } from "../lib/app-context";
import { Skeletons, Spinner } from "../components/ui";

const EMPTY: PrepNotes = { main_concern: "", onset: "", background: "", experiences: "", questions: "", additional: "" };

const PROMPTS: { key: keyof PrepNotes; label: string; hint: string; rows?: number }[] = [
  { key: "main_concern", label: "What is your main concern?", hint: "In your own words — what do you want help with?" },
  { key: "onset", label: "When did it start?", hint: "Roughly is fine, e.g. “about three weeks ago”." },
  { key: "experiences", label: "What have you noticed or experienced?", hint: "Anything you've observed, in the order it happened if you can.", rows: 4 },
  { key: "background", label: "Relevant background you choose to share", hint: "Only what you're comfortable including. Leave blank if nothing applies." },
  { key: "questions", label: "Questions you want to ask", hint: "One per line works well. Put the most important first.", rows: 4 },
  { key: "additional", label: "Anything else to remember?", hint: "e.g. things to bring, things to mention." },
];

type Draft = Record<SectionKey, { id?: string; key: string; text: string; field: string | null; quote: string | null; edited: boolean; user: boolean }[]>;
const toDraft = (b: Brief): Draft =>
  Object.fromEntries(SECTION_KEYS.map((s) => [s, b.sections[s].map((p: BriefPoint) => ({ ...p, key: p.id }))])) as Draft;

export default function Prepare() {
  const { id } = useParams();
  const nav = useNavigate();
  const { notify } = useApp();
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [notes, setNotes] = useState<PrepNotes>(EMPTY);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState<"" | "generate" | "save" | "confirm" | SectionKey>("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const counter = useRef(0);

  useEffect(() => {
    Promise.all([api.get<Appointment>(`/appointments/${id}`), api.get<{ notes: PrepNotes; brief: Brief | null }>(`/appointments/${id}/prep`)])
      .then(([a, p]) => {
        setAppt(a); setNotes(p.notes); setBrief(p.brief);
        if (p.brief) { setDraft(toDraft(p.brief)); setStep(p.brief.status === "confirmed" ? 3 : 2); }
      })
      .catch((e: ApiError) => setLoadError(e.status === 404 ? "We couldn't find that appointment." : e.message));
  }, [id]);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
  const hasNotes = Object.values(notes).some((v) => v.trim());

  function adopt(b: Brief) { setBrief(b); setDraft(toDraft(b)); setDirty(false); }

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
    const payload = { sections: Object.fromEntries(SECTION_KEYS.map((s) => [s, draft[s].filter((p) => p.text.trim()).map((p) => ({ id: p.id, text: p.text }))])) };
    const r = await api.put<{ brief: Brief }>(`/appointments/${id}/brief`, payload);
    adopt(r.brief);
    if (!silent) notify("Edits saved");
    return r.brief;
  }

  async function confirm() {
    setError(""); setBusy("confirm");
    try {
      if (dirty) await saveEdits(true);
      const r = await api.post<{ brief: Brief }>(`/appointments/${id}/brief/confirm`);
      adopt(r.brief); setStep(3); notify("Brief confirmed and saved");
    } catch (e) { fail(e); } finally { setBusy(""); }
  }

  const update = (s: SectionKey, i: number, text: string) => { setDraft((d) => d && { ...d, [s]: d[s].map((p, j) => (j === i ? { ...p, text } : p)) }); setDirty(true); };
  const remove = (s: SectionKey, i: number) => { setDraft((d) => d && { ...d, [s]: d[s].filter((_, j) => j !== i) }); setDirty(true); };
  const move = (s: SectionKey, i: number, dir: -1 | 1) => setDraft((d) => {
    if (!d) return d;
    const list = [...d[s]]; const j = i + dir; if (j < 0 || j >= list.length) return d;
    [list[i], list[j]] = [list[j], list[i]]; setDirty(true); return { ...d, [s]: list };
  });
  const add = (s: SectionKey) => { setDraft((d) => d && { ...d, [s]: [...d[s], { key: `new-${counter.current++}`, text: "", field: null, quote: null, edited: false, user: true }] }); setDirty(true); };

  if (loadError) return <div className="card empty"><h3>{loadError}</h3><Link className="btn" to="/app/appointments">Back to appointments</Link></div>;
  if (!appt) return <Skeletons rows={4} />;

  const stepNames = ["Your notes", "Review brief", "Confirmed"];
  return (
    <div className="stack fade-in">
      <Link to={`/app/appointments/${id}`} className="small">← {appt.practitioner_name} · {fmtDateTime(appt.starts_at)}</Link>
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
              <button className="btn primary" disabled={!hasNotes || busy === "generate"}>{busy === "generate" && <Spinner />} {brief ? "Regenerate brief" : "Generate brief"}</button>
            </div>
          </div>
          {brief && <p className="small muted" style={{ marginTop: ".75rem" }}>Regenerating replaces the current brief, including your edits.</p>}
        </form>
      )}

      {step >= 2 && draft && brief && (
        <>
          {brief.status === "confirmed" ? (
            <div className="alert info" role="status">This brief is confirmed. Editing it will return it to draft until you confirm again.</div>
          ) : (
            <div className="alert warn" role="status"><strong>Draft — not final yet.</strong> Check each point against what you wrote, edit or delete anything that isn't right, then confirm.</div>
          )}
          {brief.dropped > 0 && <div className="alert info">{brief.dropped} AI-suggested point{brief.dropped > 1 ? "s were" : " was"} removed because {brief.dropped > 1 ? "they" : "it"} couldn't be traced back to your notes.</div>}

          {SECTION_KEYS.map((s) => (
            <section className="card" key={s} aria-labelledby={`sec-${s}`}>
              <div className="card-head">
                <h2 id={`sec-${s}`}>{SECTION_TITLES[s]}</h2>
                <button className="btn sm" onClick={() => generate(s)} disabled={!!busy}>{busy === s ? <Spinner /> : null} Regenerate</button>
              </div>
              {draft[s].length === 0 && <p className="muted small">Nothing here{s === "reason" ? "" : " — nothing was entered for this section"}. You can add your own point.</p>}
              {draft[s].map((p, i) => (
                <div key={p.key} className="point">
                  <div className="point-row">
                    <textarea aria-label={`${SECTION_TITLES[s]} point ${i + 1}`} rows={2} value={p.text} onChange={(e) => update(s, i, e.target.value)} maxLength={600} />
                    <div className="point-actions">
                      <button className="btn sm ghost" onClick={() => move(s, i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button className="btn sm ghost" onClick={() => move(s, i, 1)} disabled={i === draft[s].length - 1} aria-label="Move down">↓</button>
                      <button className="btn sm ghost danger" onClick={() => remove(s, i)} aria-label="Delete point">✕</button>
                    </div>
                  </div>
                  <div className="source">
                    {p.user ? <span className="badge">Added by you</span> : (
                      <><span className="badge info">Source: {FIELD_LABELS[p.field ?? ""] ?? p.field}</span> <q>{p.quote}</q></>
                    )}
                    {p.edited && <span className="badge warn" style={{ marginLeft: 6 }}>Edited</span>}
                  </div>
                </div>
              ))}
              <button className="btn sm" onClick={() => add(s)}>+ Add a point</button>
            </section>
          ))}

          <div className="row between sticky-actions">
            <button className="btn" onClick={() => setStep(1)}>Edit my notes</button>
            <div className="row">
              {dirty && <button className="btn" onClick={() => { setBusy("save"); saveEdits().catch(fail).finally(() => setBusy("")); }} disabled={!!busy}>{busy === "save" && <Spinner />} Save edits</button>}
              {brief.status === "confirmed" && !dirty ? (
                <button className="btn primary" onClick={() => nav(`/app/appointments/${id}/brief`)}>Open printable brief</button>
              ) : (
                <button className="btn primary" onClick={confirm} disabled={!!busy}>{busy === "confirm" && <Spinner />} Confirm brief</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
