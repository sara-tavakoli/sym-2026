import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, prefsToQuery, type SearchResult } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Spinner } from "../components/ui";
import { EmergencyBanner } from "../components/EmergencyBanner";
import { PublicShell, carePath, rememberConcern } from "../components/PublicShell";
import { DEMO, fill } from "../lib/demo-fill";
import "../findcare.css";

// "Help me find care": the person describes the concern in their own words, answers a few follow-up questions,
// sees a summary of what they told us, then a rule-based, non-diagnostic suggestion of the kind of service people
// often start with (e.g. a GP), handed to clinic search with the answers prefilled so they can choose a time and book.

type Duration = "under_week" | "weeks" | "months" | "over_3_months";
type Seen = "no" | "yes" | "referral";
type Mode = "in_person" | "telehealth" | "either";
interface Chip { id: string; label: string; category: string | null }
interface Emergency { selfHarm: boolean; message: string }
interface Suggestion {
  id: string; label: string; category: string | null; mode: "in_person" | "telehealth" | null;
  headline: string; reason: string; notes: string[];
  alternatives: { id: string; label: string; category: string | null; reason: string }[];
}
interface SuggestResponse {
  emergency: Emergency | null; chips: Chip[]; suggestion: Suggestion | null;
  location: { query: string; known: boolean; resolved: string | null; suburb: string | null } | null;
}
interface Meta { durations: { id: Duration; label: string }[]; coverage: { suburb: string; state: string; postcode: string }[] }

const STEPS = ["Your concern", "How long", "Seen anyone?", "Where and how"];
const DURATIONS: { id: Duration; label: string }[] = [
  { id: "under_week", label: "Less than a week" }, { id: "weeks", label: "1 to 4 weeks" },
  { id: "months", label: "1 to 3 months" }, { id: "over_3_months", label: "More than 3 months" },
];
const SEEN: { id: Seen; label: string }[] = [
  { id: "no", label: "No, not yet" }, { id: "yes", label: "Yes, I've seen someone about it" }, { id: "referral", label: "Yes, and I have a referral" },
];
const MODES: { id: Mode; label: string }[] = [
  { id: "in_person", label: "In person" }, { id: "telehealth", label: "Telehealth (video or phone)" }, { id: "either", label: "Either is fine" },
];
const EXAMPLES = ["Sore ankle after a fall last week", "Toothache when I drink something cold", "Feeling stressed and not sleeping well"];

function searchUrl(signedIn: boolean, category: string, location: string | null | undefined, mode: string | null | undefined) {
  return `${carePath(signedIn, "search")}?${prefsToQuery({ category, location: location ?? undefined, mode: mode === "in_person" || mode === "telehealth" ? mode : undefined })}`;
}

export default function FindCare({ publicPage = false }: { publicPage?: boolean }) {
  const { user } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [concern, setConcern] = useState(() => (params.get("concern") ?? fill(DEMO.concern) ?? "").slice(0, 1000));
  const [duration, setDuration] = useState<Duration | "">(fill(DEMO.duration) ?? "");
  const [seen, setSeen] = useState<Seen | "">(fill(DEMO.seen) ?? "");
  const [location, setLocation] = useState(fill(DEMO.location) ?? "");
  const [mode, setMode] = useState<Mode>("either");
  const [preview, setPreview] = useState<{ chips: Chip[]; emergency: Emergency | null }>({ chips: [], emergency: null });
  const [ack, setAck] = useState(false);
  const [result, setResult] = useState<SuggestResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => { api.get<Meta>("/find-care/meta").then(setMeta).catch(() => {}); }, []);

  // Live "Might suit" chips and the red-flag screen, debounced while typing.
  useEffect(() => {
    const text = concern.trim();
    if (text.length < 3) { setPreview({ chips: [], emergency: null }); return; }
    const t = setTimeout(() => {
      api.post<SuggestResponse>("/find-care/suggest", { concern: text })
        .then((r) => setPreview({ chips: r.chips, emergency: r.emergency }))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [concern]);
  useEffect(() => { if (!preview.emergency) setAck(false); }, [preview.emergency]);

  // Move focus to the new step's heading so screen reader and keyboard users land in the right place.
  useEffect(() => { if (first.current) { first.current = false; return; } headRef.current?.focus(); }, [step, result]);

  const blocked = !!preview.emergency && !ack;
  const canNext = [concern.trim().length >= 3 && !blocked, !!duration, !!seen, true][step];

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await api.post<SuggestResponse>("/find-care/suggest", {
        concern: concern.trim(), duration: duration || undefined, seen: seen || undefined,
        location: location.trim() || undefined, mode, acknowledged_emergency: ack || undefined,
      });
      setResult(r);
      if (r.emergency && !r.suggestion) { setPreview({ chips: [], emergency: r.emergency }); setStep(0); }
    } catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't get a suggestion. Please try again."); }
    finally { setBusy(false); }
  }

  function next(e: FormEvent) {
    e.preventDefault();
    if (!canNext) return;
    if (step < 3) setStep(step + 1); else void submit();
  }

  // Clinic search works signed out; an account is only needed when the booking is confirmed.
  // The concern goes along (this tab only) so it can become the booking's reason for visit.
  function openSearch(url: string) { rememberConcern(concern); nav(url); }

  function restart() { setResult(null); setStep(0); setConcern(""); setDuration(""); setSeen(""); setLocation(""); setMode("either"); setAck(false); }

  const body = (
    <div className="fc">
      <header className="fc-head">
        <p className="eyebrow">Not sure where to start?</p>
        <h1>Help me find care</h1>
        <p className="muted">Describe what's going on in simple words. We'll ask a few follow-up questions, summarise your concern, suggest the kind of service people often start with, and show clinics you can book.</p>
      </header>

      <div className="fc-disclaimer" role="note">
        <strong>Guidance only, not a diagnosis.</strong> This uses simple keyword rules, not a clinician, and can't tell how urgent something is.
        For health advice any time, call Healthdirect on <a href="tel:1800022222">1800 022 222</a> or use the{" "}
        <a href="https://www.healthdirect.gov.au/symptom-checker" target="_blank" rel="noreferrer">Symptom Checker</a>. <strong>In an emergency call 000.</strong>
      </div>

      {result?.suggestion ? (
        <Result
          r={result} acknowledged={ack} busy={busy} signedIn={!!user} error={error}
          answers={{ concern: concern.trim(), duration, seen, mode }}
          headRef={headRef} onOpen={openSearch} onEdit={() => { setResult(null); setStep(3); }} onRestart={restart}
        />
      ) : (
        <form className="fc-card card" onSubmit={next} noValidate aria-labelledby="fc-step-h">
          <ol className="fc-steps" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li key={s} className={i === step ? "is-current" : i < step ? "is-done" : ""} aria-current={i === step ? "step" : undefined}>
                <span className="fc-dot" aria-hidden="true">{i < step ? "✓" : i + 1}</span><span className="fc-step-label">{s}</span>
              </li>
            ))}
          </ol>
          <p className="fc-count">Step {step + 1} of 4{step > 0 ? " · a few follow-up questions" : ""}</p>

          {step === 0 && (
            <div className="fc-step">
              <h2 id="fc-step-h" ref={headRef} tabIndex={-1}>What's going on?</h2>
              <label htmlFor="fc-concern" className="fc-label">In your own words. A sentence or two is plenty.</label>
              <textarea id="fc-concern" value={concern} maxLength={1000} rows={4} onChange={(e) => setConcern(e.target.value)}
                placeholder="e.g. My ankle has been sore since I fell over on the weekend" aria-describedby="fc-chips-h" />
              <div className="fc-examples" aria-label="Examples">
                {EXAMPLES.map((x) => <button type="button" key={x} className="fc-example" onClick={() => setConcern(x)}>{x}</button>)}
              </div>
              <div className="fc-chips" aria-live="polite">
                <span id="fc-chips-h" className="fc-chips-label">Might suit:</span>
                {preview.chips.length
                  ? preview.chips.map((c) => <span key={c.id} className="fc-chip">{c.label}</span>)
                  : <span className="muted small">{blocked ? "Please read the notice below first." : "keep typing and we'll show services that might fit"}</span>}
              </div>
              {preview.emergency && <EmergencyBanner selfHarm={preview.emergency.selfHarm} acknowledged={ack} onAcknowledge={() => setAck(true)} />}
            </div>
          )}

          {step === 1 && (
            <fieldset className="fc-step">
              <legend><h2 id="fc-step-h" ref={headRef} tabIndex={-1}>How long has this been going on?</h2></legend>
              <div className="fc-options">
                {DURATIONS.map((d) => (
                  <label key={d.id} className={`fc-option${duration === d.id ? " is-on" : ""}`}>
                    <input type="radio" name="duration" value={d.id} checked={duration === d.id} onChange={() => setDuration(d.id)} /> {d.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {step === 2 && (
            <fieldset className="fc-step">
              <legend><h2 id="fc-step-h" ref={headRef} tabIndex={-1}>Have you seen anyone about it before?</h2></legend>
              <div className="fc-options">
                {SEEN.map((d) => (
                  <label key={d.id} className={`fc-option${seen === d.id ? " is-on" : ""}`}>
                    <input type="radio" name="seen" value={d.id} checked={seen === d.id} onChange={() => setSeen(d.id)} /> {d.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {step === 3 && (
            <div className="fc-step">
              <h2 id="fc-step-h" ref={headRef} tabIndex={-1}>Where, and how would you like to be seen?</h2>
              <label htmlFor="fc-loc" className="fc-label">Suburb or postcode <span className="muted">(optional)</span></label>
              <input id="fc-loc" value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} list="fc-coverage" placeholder="e.g. Macquarie Park or 2113" autoComplete="off" />
              <datalist id="fc-coverage">{meta?.coverage.map((l) => <option key={l.suburb} value={l.suburb}>{`${l.state} ${l.postcode}`}</option>)}</datalist>
              {meta && <p className="fc-hint">Demo directory covers: {meta.coverage.map((l) => l.suburb).join(", ")}.</p>}
              <fieldset className="fc-modes">
                <legend className="fc-label">Appointment type</legend>
                <div className="fc-options fc-options-row">
                  {MODES.map((m) => (
                    <label key={m.id} className={`fc-option${mode === m.id ? " is-on" : ""}`}>
                      <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} /> {m.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {error && <p className="alert error" role="alert">{error}</p>}
          <div className="fc-nav">
            {step > 0 ? <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>Back</button> : <span />}
            <button className="btn primary" disabled={!canNext || busy}>
              {busy ? <Spinner /> : null}{step < 3 ? "Next" : "Show me where to start"}
            </button>
          </div>
        </form>
      )}
    </div>
  );

  return publicPage ? <PublicShell>{body}</PublicShell> : body;
}

interface Answers { concern: string; duration: Duration | ""; seen: Seen | ""; mode: Mode }

interface Target { category: string; label: string; mode: "in_person" | "telehealth" | null }

function Result({ r, acknowledged, busy, signedIn, error, answers, headRef, onOpen, onEdit, onRestart }: {
  r: SuggestResponse; acknowledged: boolean; busy: boolean; signedIn: boolean; error: string; answers: Answers;
  headRef: React.RefObject<HTMLHeadingElement | null>; onOpen: (url: string) => void; onEdit: () => void; onRestart: () => void;
}) {
  const s = r.suggestion!;
  const loc = r.location?.known ? r.location.suburb : null;
  const [target, setTarget] = useState<Target | null>(null);
  const [clinics, setClinics] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const listRef = useRef<HTMLHeadingElement>(null);

  // "Find a clinic": suitable clinics of the suggested type straight away, nearest first when a suburb is known.
  async function findClinics(t: Target) {
    setTarget(t); setLoading(true); setListError(""); setClinics(null);
    const q = (radius: number) => `/fit-finder/search?${prefsToQuery({ category: t.category, location: loc ?? undefined, mode: t.mode ?? undefined, radius_km: radius })}&pageSize=6`;
    try {
      let res = await api.get<SearchResult>(q(20));
      if (loc && t.mode !== "telehealth" && res.total === 0) res = await api.get<SearchResult>(q(50));
      setClinics(res);
      setTimeout(() => listRef.current?.focus(), 0);
    } catch (e) { setListError(e instanceof ApiError ? e.message : "Couldn't load clinics. Please try again."); }
    finally { setLoading(false); }
  }
  const book = (id: string, mode: Target["mode"]) => onOpen(`${carePath(signedIn, "book", encodeURIComponent(id))}${mode === "telehealth" ? "?mode=telehealth" : ""}`);
  const shown = target ?? (s.category ? { category: s.category, label: s.label, mode: s.mode } : null);
  const where = r.location?.known ? r.location.resolved : r.location ? `${r.location.query} (outside the demo area)` : null;

  return (
    <section className="fc-result" aria-labelledby="fc-result-h">
      {r.emergency && <EmergencyBanner selfHarm={r.emergency.selfHarm} acknowledged={acknowledged} />}

      <div className="card fc-suggest fc-type">
        <p className="eyebrow">Where to go</p>
        <h2 id="fc-result-h" ref={headRef} tabIndex={-1}>The kind of clinic to start with</h2>
        <p className="fc-type-name"><span className="fc-type-icon" aria-hidden="true">+</span>{shown?.label ?? s.label}</p>
        <p className="fc-reason">{s.reason}</p>

        <div className="fc-summary" aria-label="Your concern, summarised">
          <span className="fc-summary-label">Your concern:</span> “{answers.concern}”
          {answers.duration && <> · {DURATIONS.find((d) => d.id === answers.duration)?.label}</>}
          {answers.seen && <> · {SEEN.find((d) => d.id === answers.seen)?.label}</>}
          {where && <> · {where}</>} · {MODES.find((m) => m.id === answers.mode)?.label}
          {" "}<button type="button" className="chip-link fc-edit" onClick={onEdit}>Edit</button>
        </div>

        {r.location && !r.location.known && <p className="alert warn small">“{r.location.query}” isn't in the demo directory's area yet, so clinics are shown without a location filter.</p>}

        {shown && (
          <div className="fc-cta">
            <button type="button" className="btn primary fc-big" onClick={() => findClinics(shown)} disabled={busy || loading}>
              {loading ? <Spinner /> : null}Find a clinic
            </button>
            {!clinics && <p className="fc-hint">Shows {shown.label} clinics{loc ? <> near <strong>{r.location!.resolved}</strong></> : null}{shown.mode === "telehealth" ? " offering telehealth" : ""}. {!signedIn && "No sign-up needed to look."}</p>}
          </div>
        )}
        {error && <p className="alert error" role="alert">{error}</p>}

        {s.alternatives.some((a) => a.category) && (
          <p className="fc-alt-line small">
            <span className="muted">Not quite right? Try </span>
            {s.alternatives.filter((a) => a.category).map((a) => (
              <button key={a.id} type="button" className="pref-chip chip-link" title={a.reason} disabled={loading}
                onClick={() => findClinics({ category: a.category!, label: a.label, mode: a.id === "telehealth_gp" ? "telehealth" : s.mode })}>{a.label}</button>
            ))}
          </p>
        )}
      </div>

      {(clinics || listError) && target && (
        <section className="card fc-clinics" aria-labelledby="fc-clinics-h" aria-busy={loading}>
          <h2 id="fc-clinics-h" ref={listRef} tabIndex={-1}>
            {clinics ? `${clinics.total} ${target.label} ${clinics.total === 1 ? "clinic" : "clinics"}${clinics.origin && target.mode !== "telehealth" ? ` near ${clinics.origin.suburb}` : ""}` : "Clinics"}
          </h2>
          {listError && <p className="alert error" role="alert">{listError}</p>}
          {clinics && clinics.total === 0 && <p className="muted">No {target.label} clinics in the demo directory match yet. Try another option above, or open the full search.</p>}
          {clinics && clinics.items.length > 0 && (
            <ul className="fc-clinic-list">
              {clinics.items.map((it) => (
                <li key={it.provider.id} className="fc-clinic">
                  <div className="fc-clinic-body">
                    <h3>{it.provider.name}</h3>
                    <p className="fc-clinic-sub">{it.provider.clinic.name} · {it.provider.clinic.suburb}{it.distance_km !== null ? ` · ${it.distance_km} km` : ""}</p>
                    <p className="fc-clinic-tags">
                      {it.provider.telehealth?.value && <span className="pref-chip static">Telehealth</span>}
                      {it.provider.billing?.bulk_billing === "all" && <span className="pref-chip static">Bulk billing</span>}
                      {it.provider.hours.some((h) => h.day >= 5) && <span className="pref-chip static">Open weekends</span>}
                      {it.provider.is_fictional && <span className="badge warn">Fictional demo</span>}
                    </p>
                  </div>
                  <button type="button" className="btn primary sm" onClick={() => book(it.provider.id, target.mode)}>Book appointment<span className="sr-only"> with {it.provider.name}</span></button>
                </li>
              ))}
            </ul>
          )}
          <p className="small muted" style={{ margin: ".8rem 0 0" }}>
            Nearest first. Want to filter by hours, language or accessibility?{" "}
            <button type="button" className="chip-link" onClick={() => onOpen(searchUrl(signedIn, target.category, loc, target.mode))}>Open the full search</button>
          </p>
        </section>
      )}

      <p className="fc-fine">This is general guidance based on the words you used, not a diagnosis or a judgement about urgency. If you're unsure, a GP or Healthdirect (<a href="tel:1800022222">1800 022 222</a>) can help you decide.</p>
      <div className="row">
        <button type="button" className="btn ghost sm" onClick={onEdit}>Change my answers</button>
        <button type="button" className="btn ghost sm" onClick={onRestart}>Start over</button>
      </div>
    </section>
  );
}
