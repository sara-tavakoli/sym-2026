import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, prefsToQuery, type User } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Logo, Spinner } from "../components/ui";
import { EmergencyBanner } from "../components/EmergencyBanner";
import "../findcare.css";

// "Not sure where to start? Find care that fits": four short questions, then a rule-based, non-diagnostic suggestion
// of the kind of service people often start with, handed to Fit Finder with the answers prefilled.

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

const STEPS = ["What's going on", "How long", "Seen anyone?", "Where and how"];
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

function fitFinderUrl(category: string, location: string | null | undefined, mode: string | null | undefined) {
  return `/app/fit-finder?${prefsToQuery({ category, location: location ?? undefined, mode: mode === "in_person" || mode === "telehealth" ? mode : undefined })}`;
}

export default function FindCare({ publicPage = false }: { publicPage?: boolean }) {
  const { user, setUser } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [concern, setConcern] = useState(() => (params.get("concern") ?? "").slice(0, 1000));
  const [duration, setDuration] = useState<Duration | "">("");
  const [seen, setSeen] = useState<Seen | "">("");
  const [location, setLocation] = useState("");
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

  async function openFitFinder(url: string) {
    if (user) { nav(url); return; }
    // Signed out on the public page: open a private demo sandbox (fictional data), then go straight to the results.
    setBusy(true); setError("");
    try { const r = await api.post<{ user: User }>("/demo"); setUser(r.user); nav(url); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't open the demo. Please try again."); setBusy(false); }
  }

  function restart() { setResult(null); setStep(0); setConcern(""); setDuration(""); setSeen(""); setLocation(""); setMode("either"); setAck(false); }

  const body = (
    <div className="fc">
      <header className="fc-head">
        <p className="eyebrow">Not sure where to start?</p>
        <h1>Find care that fits</h1>
        <p className="muted">Answer four quick questions and we'll suggest the kind of service people often start with, then show matching services nearby.</p>
      </header>

      <div className="fc-disclaimer" role="note">
        <strong>Guidance only, not a diagnosis.</strong> This uses simple keyword rules, not a clinician, and can't tell how urgent something is.
        For health advice any time, call Healthdirect on <a href="tel:1800022222">1800 022 222</a> or use the{" "}
        <a href="https://www.healthdirect.gov.au/symptom-checker" target="_blank" rel="noreferrer">Symptom Checker</a>. <strong>In an emergency call 000.</strong>
      </div>

      {result?.suggestion ? (
        <Result
          r={result} acknowledged={ack} busy={busy} signedIn={!!user} error={error}
          headRef={headRef} onOpen={openFitFinder} onEdit={() => { setResult(null); setStep(3); }} onRestart={restart}
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
          <p className="fc-count">Step {step + 1} of 4</p>

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

  if (!publicPage) return body;
  return (
    <div className="fc-public">
      <header className="fc-public-head">
        <Link to="/" className="fc-brand" aria-label="CarePath AI home"><Logo size={26} /><span>CarePath <b>AI</b></span></Link>
        <nav className="row" aria-label="Account">
          {user ? <Link className="btn sm" to="/app">Dashboard</Link> : <><Link className="btn sm ghost" to="/login">Sign in</Link><Link className="btn sm primary" to="/try">Try the demo</Link></>}
        </nav>
      </header>
      <main id="main" className="fc-public-main">{body}</main>
      <footer className="fc-public-foot" role="note">
        CarePath organises information. It isn't a medical service and doesn't diagnose or recommend treatment. In an emergency call <strong>000</strong>.
        Every clinic in the demo directory is fictional.
      </footer>
    </div>
  );
}

function Result({ r, acknowledged, busy, signedIn, error, headRef, onOpen, onEdit, onRestart }: {
  r: SuggestResponse; acknowledged: boolean; busy: boolean; signedIn: boolean; error: string;
  headRef: React.RefObject<HTMLHeadingElement | null>; onOpen: (url: string) => void; onEdit: () => void; onRestart: () => void;
}) {
  const s = r.suggestion!;
  const loc = r.location?.known ? r.location.suburb : null;
  const mainUrl = s.category ? fitFinderUrl(s.category, loc, s.mode) : null;
  return (
    <section className="fc-result" aria-labelledby="fc-result-h">
      {r.emergency && <EmergencyBanner selfHarm={r.emergency.selfHarm} acknowledged={acknowledged} />}
      <div className="card fc-suggest">
        <p className="eyebrow">A place to start</p>
        <h2 id="fc-result-h" ref={headRef} tabIndex={-1}>{s.headline}</h2>
        <p className="fc-reason">{s.reason}</p>
        {s.notes.length > 0 && <ul className="fc-notes">{s.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        {r.location && !r.location.known && (
          <p className="alert warn">“{r.location.query}” isn't in the demo directory's coverage yet, so we'll show services without a location filter. You can choose a suburb in Fit Finder.</p>
        )}
        {mainUrl && (
          <div className="fc-cta">
            <button type="button" className="btn primary fc-big" onClick={() => onOpen(mainUrl)} disabled={busy}>
              {busy ? <Spinner /> : null}See matching services
            </button>
            <p className="fc-hint">
              Opens Fit Finder with <strong>{s.label}</strong>{loc ? <> near <strong>{r.location!.resolved}</strong></> : null}
              {s.mode === "telehealth" ? <>, <strong>telehealth</strong></> : s.mode === "in_person" ? <>, <strong>in person</strong></> : null} prefilled.
              {!signedIn && " No sign-up: it opens a private demo sandbox with fictional clinics."}
            </p>
          </div>
        )}
        {error && <p className="alert error" role="alert">{error}</p>}
        {s.alternatives.length > 0 && (
          <div className="fc-alts">
            <h3>Other options</h3>
            <ul>
              {s.alternatives.map((a) => (
                <li key={a.id}>
                  <div><strong>{a.label}</strong> <span className="muted">{a.reason}</span></div>
                  {a.category && <button type="button" className="btn sm" onClick={() => onOpen(fitFinderUrl(a.category!, loc, a.id === "telehealth_gp" ? "telehealth" : s.mode))} disabled={busy}>Search {a.label}</button>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="fc-fine">This is general guidance based on the words you used, not a diagnosis or a judgement about urgency. If you're unsure, a GP or Healthdirect (<a href="tel:1800022222">1800 022 222</a>) can help you decide.</p>
        <div className="row">
          <button type="button" className="btn ghost sm" onClick={onEdit}>Change my answers</button>
          <button type="button" className="btn ghost sm" onClick={onRestart}>Start over</button>
        </div>
      </div>
    </section>
  );
}
