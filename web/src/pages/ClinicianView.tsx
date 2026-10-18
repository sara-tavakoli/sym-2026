import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, fmtDateTime, SECTION_KEYS, type SectionKey } from "../lib/api";
import { CLINICIAN_TITLES, type ClinicianPlan, type ConsultResponse, type SharedPoint, type SharedView } from "../lib/shares";
import { Logo, Skeletons, Spinner } from "../components/ui";
import { ConsultWorkspace } from "../components/ConsultWorkspace";
import { AuditTimeline } from "../components/AuditTimeline";
import "../shares.css";

const PLACEHOLDER = "Blood test (FBC, iron studies) this week. Book a review in 2 weeks. Continue current medication as prescribed. Call if symptoms worsen.";
const AUTHOR_KEY = "carepath_clinician_author";
const readAuthor = () => { try { return localStorage.getItem(AUTHOR_KEY) ?? ""; } catch { return ""; } };

/** Public, login-free page a patient's clinician opens from a share link. The token in the URL is the only credential. */
export default function ClinicianView() {
  const { token } = useParams();
  const [view, setView] = useState<SharedView | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState("");
  const [allSources, setAllSources] = useState(false);

  useEffect(() => {
    document.title = "Patient pre-consult brief · CarePath";
    api.get<SharedView>(`/share/${token}`).then(setView)
      .catch((e: ApiError) => (e.status === 404 ? setGone(true) : setError(e.message)));
  }, [token]);

  async function toggle(p: SharedPoint) {
    if (!view?.brief) return;
    const want = !p.addressed_at;
    const set = (addressed_at: string | null) => setView((v) => v && v.brief && ({
      ...v, brief: { ...v.brief, sections: { ...v.brief.sections, questions: v.brief.sections.questions.map((q) => (q.id === p.id ? { ...q, addressed_at } : q)) } },
    }));
    set(want ? new Date().toISOString() : null); // optimistic; reverted if the server refuses
    try { set((await api.post<{ addressed_at: string | null }>(`/share/${token}/questions/${p.id}`, { addressed: want })).addressed_at); }
    catch (e) { set(p.addressed_at ?? null); setError(e instanceof ApiError ? e.message : "Could not save. Please try again."); return; }
    refreshEvents();
  }
  const refreshEvents = () => api.get<ConsultResponse>(`/share/${token}/consult`).then((r) => setView((v) => v && { ...v, events: r.events })).catch(() => {});

  if (gone) return (
    <div className="cv-page"><main className="cv-wrap"><div className="card empty cv-gone">
      <Logo size={40} />
      <h1>This link isn't available</h1>
      <p>It may have expired or been revoked by the patient. Ask the patient to share a new link from their CarePath account.</p>
    </div></main></div>
  );
  if (!view) return <div className="cv-page"><main className="cv-wrap">{error ? <div className="alert error" role="alert">{error}</div> : <Skeletons rows={4} />}</main></div>;

  const { appointment: a, brief, patient_first_name: name } = view;
  const qs = brief?.sections.questions ?? [];
  const done = qs.filter((q) => q.addressed_at).length;

  return (
    <div className="cv-page">
      <header className="cv-top no-print">
        <div className="cv-wrap cv-top-row">
          <span className="brand" style={{ padding: 0 }}><Logo size={28} /> CarePath</span>
          <button className="btn sm" onClick={() => window.print()}>Print</button>
        </div>
      </header>

      <main className="cv-wrap stack">
        <div className="cv-banner" role="note"><strong>Prepared by the patient using CarePath.</strong> Patient-reported information, not a clinical record or diagnosis.</div>
        {error && <div className="alert error no-print" role="alert">{error}</div>}

        <article className="cv-sheet" aria-labelledby="cv-h">
          <header className="cv-head">
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div>
                <p className="cv-kicker">Patient pre-consult brief</p>
                <h1 id="cv-h">{name}</h1>
              </div>
              {brief && (brief.status === "confirmed"
                ? <span className="badge ok">Confirmed by patient</span>
                : <span className="badge warn">Draft, not yet confirmed by patient</span>)}
            </div>
            <dl className="cv-meta">
              <div><dt>Appointment</dt><dd>{fmtDateTime(a.starts_at)}</dd></div>
              <div><dt>Practitioner</dt><dd>{a.practitioner_name}</dd></div>
              <div><dt>Clinic</dt><dd>{a.clinic_name}</dd></div>
              <div><dt>Service</dt><dd>{a.service_type}</dd></div>
            </dl>
          </header>

          {!brief ? (
            <p className="muted">The patient has not prepared a brief for this appointment yet.</p>
          ) : (
            <>
              <div className="row between no-print cv-tools">
                <span className="small muted">Every point is traced to what the patient wrote.</span>
                <button className="btn sm ghost" aria-pressed={allSources} onClick={() => setAllSources(!allSources)}>{allSources ? "Hide" : "Show"} all patient quotes</button>
              </div>
              {SECTION_KEYS.map((s) => brief.sections[s].length > 0 && (
                <section key={s} className="cv-section" aria-labelledby={`cv-${s}`}>
                  <h2 id={`cv-${s}`}>{CLINICIAN_TITLES[s]}
                    {s === "questions" && <span className="cv-count">{done} of {qs.length} addressed</span>}</h2>
                  {s === "questions" && <p className="small muted no-print" style={{ margin: "0 0 .5rem" }}>In the patient's priority order. Tick each one as you cover it; the patient sees which were addressed.</p>}
                  <ol className={`cv-points ${s === "questions" ? "q" : ""}`}>
                    {brief.sections[s].map((p, i) => <Point key={p.id} p={p} n={i + 1} section={s} showAll={allSources} onToggle={toggle} />)}
                  </ol>
                </section>
              ))}
            </>
          )}
          <footer className="cv-foot">Shared by the patient from CarePath, an organisational tool. Content is the patient's own words, organised by software and reviewed by the patient. It is not medical advice, a diagnosis or a clinical record.</footer>
        </article>

        <ConsultWorkspace token={token!} name={name} initial={view.consult}
          onEvents={(events) => setView((v) => v && { ...v, events })} onPlans={(plans) => setView((v) => v && { ...v, plans })} />

        <PlanForm key={view.plans.length} token={token!} name={name} initial={view.plans} onSent={refreshEvents} />

        <section className="panel no-print" aria-label="Audit timeline">
          <AuditTimeline events={view.events} lede="Who did what, and when: every drafting step and human approval on this shared visit. The patient sees the same list." />
        </section>
      </main>
    </div>
  );
}

function Point({ p, n, section, showAll, onToggle }: { p: SharedPoint; n: number; section: SectionKey; showAll: boolean; onToggle: (p: SharedPoint) => void }) {
  const [open, setOpen] = useState(false);
  const shown = open || showAll;
  const isQ = section === "questions";
  const qid = `q-${p.id}`;
  return (
    <li className={`cv-point ${isQ && p.addressed_at ? "addressed" : ""}`}>
      {isQ && <input type="checkbox" id={qid} className="cv-check" checked={!!p.addressed_at} onChange={() => onToggle(p)} />}
      <span className="cv-n" aria-hidden="true">{n}.</span>
      <div className="cv-body">
        {isQ ? <label htmlFor={qid} className="cv-text">{p.text}{p.addressed_at && <span className="badge ok cv-done">Addressed</span>}</label> : <span className="cv-text">{p.text}</span>}
        {p.quote ? (
          <>
            <button className="cv-src no-print" aria-expanded={shown} onClick={() => setOpen(!open)}>{shown ? "Hide" : "Patient wrote"}</button>
            <blockquote className={`cv-quote ${shown ? "open" : ""}`}>Patient wrote: <q>{p.quote}</q></blockquote>
          </>
        ) : <span className="cv-src static">Added by patient</span>}
      </div>
    </li>
  );
}

function PlanForm({ token, name, initial, onSent }: { token: string; name: string; initial: ClinicianPlan[]; onSent: () => void }) {
  const [author, setAuthor] = useState(readAuthor);
  const [text, setText] = useState("");
  const [plans, setPlans] = useState(initial);
  const [sent, setSent] = useState<ClinicianPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; fields: Record<string, string> }>({ msg: "", fields: {} });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError({ msg: "", fields: {} });
    try {
      const r = await api.post<{ plan: ClinicianPlan; plans: ClinicianPlan[] }>(`/share/${token}/plan`, { author, text });
      setPlans(r.plans); setSent(r.plan); setText(""); onSent();
      try { localStorage.setItem(AUTHOR_KEY, author.trim()); } catch { /* storage unavailable */ }
    } catch (err) {
      if (err instanceof ApiError) setError({ msg: err.message, fields: Object.fromEntries(err.fields.map((f) => [f.path, f.message])) });
      else setError({ msg: "Could not send. Please try again.", fields: {} });
    } finally { setBusy(false); }
  }

  return (
    <section className="card cv-plan no-print" aria-labelledby="plan-h">
      <h2 id="plan-h">Or write a quick after-visit plan for {name}</h2>
      {sent ? (
        <div className="cv-sent" role="status">
          <strong>Sent to {name}.</strong> They'll see "New after-visit plan from {sent.author}" in CarePath and can turn it into a checklist.
          <div><button className="btn sm" onClick={() => setSent(null)} style={{ marginTop: ".6rem" }}>Send another update</button></div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="small muted">No transcript? Write it as you would in a note to the patient. They review it and decide what goes on their checklist; nothing is changed by software.</p>
          {error.msg && !Object.keys(error.fields).length && <div className="alert error" role="alert">{error.msg}</div>}
          <div className="field">
            <label htmlFor="plan-author">Your name and role</label>
            <input id="plan-author" value={author} maxLength={120} placeholder="e.g. Dr Lee, GP" autoComplete="name"
              aria-invalid={!!error.fields.author} onChange={(e) => setAuthor(e.target.value)} />
            {error.fields.author && <div className="err" role="alert">{error.fields.author}</div>}
          </div>
          <div className="field">
            <label htmlFor="plan-text">After-visit instructions for the patient</label>
            <textarea id="plan-text" rows={6} value={text} maxLength={6000} placeholder={PLACEHOLDER}
              aria-invalid={!!error.fields.text} aria-describedby="plan-count" onChange={(e) => setText(e.target.value)} />
            <div className="hint" id="plan-count">{text.length.toLocaleString()} / 6,000 characters</div>
            {error.fields.text && <div className="err" role="alert">{error.fields.text}</div>}
          </div>
          <button className="btn primary" disabled={busy || !author.trim() || !text.trim()}>{busy && <Spinner />} Send to {name}</button>
        </form>
      )}
      {plans.length > 0 && (
        <div className="cv-history">
          <h3>Sent from this link</h3>
          {plans.map((p) => (
            <div key={p.id} className="plan-old">
              <div className="small muted">{p.author} · {fmtDateTime(p.created_at)}</div>
              <div className="plan-text">{p.text}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
