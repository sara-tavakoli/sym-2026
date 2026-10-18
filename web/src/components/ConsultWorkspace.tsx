import { useEffect, useRef, useState } from "react";
import { api, ApiError, fmtDateTime } from "../lib/api";
import {
  KIND_LABELS, NOTE_KEYS, NOTE_LABELS,
  type ClinicianPlan, type Consult, type ConsultInstruction, type ConsultNotes, type ConsultResponse, type ShareEvent,
} from "../lib/shares";
import { BeforeAfter, countChanges } from "./BeforeAfter";
import { Spinner } from "./ui";

const AUTHOR_KEY = "carepath_clinician_author";
const readAuthor = () => { try { return localStorage.getItem(AUTHOR_KEY) ?? ""; } catch { return ""; } };
const saveAuthor = (a: string) => { try { localStorage.setItem(AUTHOR_KEY, a.trim()); } catch { /* storage unavailable */ } };
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

type Tab = "edit" | "diff" | "transcript";
interface Draft { notes: ConsultNotes; instructions: ConsultInstruction[] }

/** Clinician consult workspace: transcript -> draft notes + patient instructions -> review, tick, approve -> released to the patient. */
export function ConsultWorkspace({ token, name, initial, onEvents, onPlans }: {
  token: string; name: string; initial: Consult | null;
  onEvents: (e: ShareEvent[]) => void; onPlans: (p: ClinicianPlan[]) => void;
}) {
  const [consult, setConsult] = useState<Consult | null>(initial);
  const [redraft, setRedraft] = useState(false);
  const apply = (r: ConsultResponse) => { setConsult(r.consult); onEvents(r.events); if (r.plans) onPlans(r.plans); };

  return (
    <section className="panel cv-consult no-print" aria-labelledby="consult-h">
      <div className="panel-head">
        <h2 id="consult-h">Consultation</h2>
        {consult && <StatusBadges consult={consult} />}
      </div>
      {!consult || redraft
        ? <TranscriptForm token={token} name={name} initial={redraft ? consult?.transcript ?? "" : ""}
            onCancel={redraft ? () => setRedraft(false) : undefined}
            onDrafted={(r) => { apply(r); setRedraft(false); }} />
        : <Review key={consult.id + consult.created_at} token={token} name={name} consult={consult} onApply={apply} onRedraft={() => setRedraft(true)} />}
    </section>
  );
}

function StatusBadges({ consult: c }: { consult: Consult }) {
  return (
    <div className="row cv-badges">
      <span className={`badge ${c.source === "ai" ? "info" : ""}`}>{c.source === "ai" ? "Drafted by AI" : `Drafted by rules (${c.source_note?.startsWith("AI unavailable") ? "AI unavailable" : "AI not configured"})`}</span>
      {c.edited && <span className="badge warn">Edited</span>}
      {c.status === "approved" ? <span className="badge ok">Approved &amp; released</span> : <span className="badge">Draft, not released</span>}
    </div>
  );
}

function TranscriptForm({ token, name, initial, onDrafted, onCancel }: {
  token: string; name: string; initial: string; onDrafted: (r: ConsultResponse) => void; onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const [sample, setSample] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function loadSample() {
    setBusy("sample"); setError("");
    try { const s = await api.get<{ title: string; transcript: string }>(`/share/${token}/consult/sample`); setText(s.transcript); setSample(s.title); }
    catch (e) { setError(errMsg(e, "Could not load the sample.")); } finally { setBusy(""); }
  }
  async function draft(e: React.FormEvent) {
    e.preventDefault();
    setBusy("draft"); setError("");
    try { onDrafted(await api.post<ConsultResponse>(`/share/${token}/consult/draft`, { transcript: text })); }
    catch (err) { setError(errMsg(err, "Could not draft the notes. Please try again.")); } finally { setBusy(""); }
  }

  return (
    <form onSubmit={draft} noValidate>
      <p className="muted">Turn the consultation into draft clinical notes and a list of patient instructions. You review, edit and approve everything before anything reaches {name}.</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="row cv-transcript-tools">
        <button type="button" className="btn" onClick={loadSample} disabled={!!busy}>{busy === "sample" && <Spinner />} Load sample consultation transcript</button>
        {sample && <span className="badge info">{sample}</span>}
      </div>
      <div className="field">
        <label htmlFor="consult-transcript">Consultation transcript or notes</label>
        <textarea id="consult-transcript" rows={10} value={text} maxLength={20000} className="cv-transcript"
          placeholder={"Paste a transcript (e.g. \"Dr Lee: Please book a review in two weeks.\") or your own notes."}
          onChange={(e) => { setText(e.target.value); setSample(""); }} aria-describedby="consult-transcript-hint" />
        <div className="hint" id="consult-transcript-hint">Sample transcripts are fictional. Instructions are only drawn from what the clinician said. {text.length.toLocaleString()} / 20,000 characters</div>
      </div>
      <div className="row">
        <button className="btn primary" disabled={!!busy || text.trim().length < 20}>{busy === "draft" && <Spinner />} Draft notes and patient instructions</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function Review({ token, name, consult, onApply, onRedraft }: {
  token: string; name: string; consult: Consult; onApply: (r: ConsultResponse) => void; onRedraft: () => void;
}) {
  const locked = consult.status === "approved";
  const [tab, setTab] = useState<Tab>("edit");
  const [draft, setDraft] = useState<Draft>({ notes: consult.notes, instructions: consult.instructions });
  const [saved, setSaved] = useState<Consult>(consult); // last server state: baseline for "edited -> unticked"
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newText, setNewText] = useState("");
  const [author, setAuthor] = useState(readAuthor);
  const [reviewed, setReviewed] = useState(false);
  const [approving, setApproving] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const version = useRef(0);

  useEffect(() => { if (locked) { setDraft({ notes: consult.notes, instructions: consult.instructions }); setSaved(consult); } }, [consult, locked]);

  /** Saves are serialised; each one sends a snapshot taken when it was queued. */
  function save(snapshot: Draft): Promise<void> {
    const v = version.current;
    setSaving(true);
    queue.current = queue.current.then(async () => {
      try {
        const r = await api.put<ConsultResponse>(`/share/${token}/consult`, {
          notes: snapshot.notes,
          instructions: snapshot.instructions.map(({ id, text, approved }) => ({ id: id.startsWith("new-") ? undefined : id, text, approved })),
        });
        setSaved(r.consult!); onApply(r);
        // Only adopt the server copy if nothing changed locally meanwhile.
        if (version.current === v) { setDraft({ notes: r.consult!.notes, instructions: r.consult!.instructions }); setDirty(false); }
        setError("");
      } catch (e) { setError(errMsg(e, "Could not save. Please try again.")); throw e; } finally { setSaving(false); }
    });
    return queue.current;
  }
  const change = (next: Draft) => { version.current++; setDraft(next); setDirty(true); };
  const flush = () => (dirty ? save(draft).catch(() => {}) : Promise.resolve());

  function editInstruction(id: string, text: string) {
    const base = saved.instructions.find((i) => i.id === id);
    change({ ...draft, instructions: draft.instructions.map((i) => (i.id === id ? { ...i, text, approved: base?.text === text ? i.approved : false } : i)) });
  }
  function tick(id: string, approved: boolean) {
    const next = { ...draft, instructions: draft.instructions.map((i) => (i.id === id ? { ...i, approved } : i)) };
    version.current++; setDraft(next);
    save(next).catch(() => {});
  }
  function remove(id: string) {
    const next = { ...draft, instructions: draft.instructions.filter((i) => i.id !== id) };
    version.current++; setDraft(next);
    save(next).catch(() => {});
  }
  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    const next = { ...draft, instructions: [...draft.instructions, { id: `new-${Date.now()}`, text: newText.trim(), quote: null, kind: "self_care" as const, approved: false }] };
    version.current++; setDraft(next); setNewText("");
    save(next).catch(() => {});
  }
  async function approve(e: React.FormEvent) {
    e.preventDefault();
    setApproving(true); setError("");
    try {
      await flush();
      await queue.current.catch(() => {});
      const r = await api.post<ConsultResponse>(`/share/${token}/consult/approve`, { author, reviewed });
      saveAuthor(author);
      onApply(r);
    } catch (err) { setError(errMsg(err, "Could not approve. Please try again.")); } finally { setApproving(false); }
  }

  const ins = draft.instructions;
  const ticked = ins.filter((i) => i.approved).length;
  const allTicked = ins.length > 0 && ticked === ins.length;
  const changes = countChanges(consult.draft_notes, draft.notes, consult.draft_instructions, ins);

  return (
    <div className="cv-review">
      {consult.source === "rules" && !locked && (
        <div className="alert info cv-source-note">
          <strong>Drafted by rules{consult.source_note?.startsWith("AI unavailable") ? " (AI unavailable)" : " (AI not configured)"}.</strong> Each instruction is a sentence the clinician said, lightly tidied, with its source shown. Notes sections are sentences copied from the transcript. Check and edit before approving.
        </div>
      )}
      {consult.source === "ai" && !locked && (
        <div className="alert info cv-source-note"><strong>Drafted by AI.</strong> Every instruction was checked against the transcript; anything that couldn't be traced, or named a medicine not said, was removed.{consult.source_note ? ` ${consult.source_note}.` : ""} Check and edit before approving.</div>
      )}
      {locked && (
        <div className="cv-approved" role="status">
          <strong>Approved by {consult.approved_by} on {fmtDateTime(consult.approved_at!)}</strong> and released to {name} with {ins.length} instruction{ins.length === 1 ? "" : "s"}. The notes are now locked.
        </div>
      )}
      {error && <div className="alert error" role="alert">{error}</div>}

      <div className="seg cv-tabs" role="radiogroup" aria-label="Consult view">
        {([["edit", locked ? "Notes & instructions" : "Review & edit"], ["diff", `Before / After${changes ? ` (${changes})` : ""}`], ["transcript", "Transcript"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "transcript" && (
        <div>
          <pre className="cv-transcript-view">{consult.transcript}</pre>
          {!locked && <button className="btn" onClick={onRedraft}>Redraft from a new transcript</button>}
        </div>
      )}

      {tab === "diff" && <BeforeAfter source={consult.source} draftNotes={consult.draft_notes} notes={draft.notes} draftInstructions={consult.draft_instructions} instructions={ins} />}

      {tab === "edit" && (
        <div className="cv-grid">
          <div className="cv-notes">
            <h3 className="cv-sub">Clinical notes <span className="small muted">(for the clinician; not sent to the patient)</span></h3>
            {NOTE_KEYS.map((k) => (
              <div className="field" key={k}>
                <label htmlFor={`note-${k}`}>{NOTE_LABELS[k]}{draft.notes[k] !== consult.draft_notes[k] && <span className="badge warn cv-edited">Edited</span>}</label>
                {locked ? <div className="cv-readonly">{draft.notes[k]}</div> : (
                  <textarea id={`note-${k}`} rows={k === "plan" ? 6 : 3} maxLength={4000} value={draft.notes[k]}
                    onChange={(e) => change({ ...draft, notes: { ...draft.notes, [k]: e.target.value } })} onBlur={flush} />
                )}
              </div>
            ))}
          </div>

          <div className="cv-instr">
            <h3 className="cv-sub">Patient instructions <span className={`badge ${allTicked ? "ok" : ""}`}>{ticked} of {ins.length} approved</span></h3>
            {!locked && <p className="small muted">Tick each instruction once you're happy with it. Editing an instruction unticks it.</p>}
            {ins.length === 0 && <p className="small muted">No instructions found. Add them below.</p>}
            <ol className="cv-ins-list">
              {ins.map((i, n) => {
                const base = consult.draft_instructions.find((d) => d.id === i.id);
                return (
                  <li key={i.id} className={`cv-ins ${i.approved ? "approved" : ""}`}>
                    <div className="cv-ins-head">
                      <label className="cv-ins-tick">
                        <input type="checkbox" checked={i.approved} disabled={locked || i.id.startsWith("new-")} onChange={(e) => tick(i.id, e.target.checked)} aria-label={`Approve instruction ${n + 1}`} />
                        <span>{n + 1}.</span>
                      </label>
                      <span className="badge">{KIND_LABELS[i.kind]}</span>
                      {!base ? <span className="badge warn">Added by clinician</span> : base.text !== i.text && <span className="badge warn">Edited</span>}
                      {!locked && <button type="button" className="btn sm ghost cv-ins-remove" onClick={() => remove(i.id)} aria-label={`Remove instruction ${n + 1}`}>Remove</button>}
                    </div>
                    {locked ? <div className="cv-readonly">{i.text}</div> : (
                      <textarea rows={2} maxLength={500} value={i.text} aria-label={`Instruction ${n + 1}`}
                        onChange={(e) => editInstruction(i.id, e.target.value)} onBlur={flush} />
                    )}
                    {i.quote && <details className="cv-ins-src"><summary>From the transcript</summary><q>{i.quote}</q></details>}
                  </li>
                );
              })}
            </ol>
            {!locked && (
              <form className="cv-add" onSubmit={add}>
                <label htmlFor="consult-add" className="sr-only">New instruction</label>
                <input id="consult-add" value={newText} maxLength={500} placeholder="Add an instruction for the patient" onChange={(e) => setNewText(e.target.value)} />
                <button className="btn" disabled={!newText.trim()}>Add</button>
              </form>
            )}
          </div>
        </div>
      )}

      {!locked && (
        <form className="cv-approve" onSubmit={approve} noValidate>
          <div className="row between cv-save-row">
            <span className="small muted" aria-live="polite">{saving ? "Saving..." : dirty ? "Unsaved changes" : "All changes saved"}</span>
            <button type="button" className="btn sm" onClick={flush} disabled={!dirty || saving}>Save draft</button>
          </div>
          <div className="field">
            <label htmlFor="consult-author">Approving clinician (name and role)</label>
            <input id="consult-author" value={author} maxLength={120} placeholder="e.g. Dr Lee, GP" autoComplete="name" onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <label className="cv-reviewed">
            <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
            <span>I have reviewed these notes and every patient instruction.</span>
          </label>
          {!allTicked && <p className="small muted">{ins.length ? `${ins.length - ticked} instruction${ins.length - ticked === 1 ? "" : "s"} still to tick.` : "Add at least one instruction."}</p>}
          <button className="btn primary" disabled={approving || saving || !allTicked || !reviewed || !author.trim()}>{approving && <Spinner />} Approve &amp; release to {name}</button>
        </form>
      )}

      {locked && consult.summary && (
        <div className="cv-summary">
          <h3 className="cv-sub">Patient-friendly summary <span className="badge">{consult.summary_source === "ai" ? "Written by AI from the approved instructions" : "Built from the approved instructions"}</span></h3>
          <div className="cv-summary-text">{consult.summary}</div>
        </div>
      )}
    </div>
  );
}
