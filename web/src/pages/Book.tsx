import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError, type PatientProfile, type ProviderRecord, type User } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Field, Skeletons, Spinner } from "../components/ui";
import { PublicShell, carePath, recallConcern, rememberConcern } from "../components/PublicShell";
import { DEMO, fill } from "../lib/demo-fill";
import "../booking.css";

// Choose clinic and time → signed in already? (sign in / sign up) → complete profile if needed → review → confirm.
// The chosen time lives in the URL (?slot=…&mode=…) so it survives the trip through sign-in.

interface ProviderTimes { provider: ProviderRecord; days: { date: string; slots: string[] }[]; slot_minutes: number; window_days: number; notice: string }
type Step = "time" | "account" | "profile" | "review" | "done";
type Mode = "in_person" | "telehealth";
interface Booked { appointment_id: string; reference: string; starts_at: string; mode: Mode }

const TZ = "Australia/Sydney";
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: TZ });
const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-AU", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: TZ });
const dayParts = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  return { wd: d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" }), day: d.getUTCDate(), mon: d.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" }) };
};
const hourIn = (iso: string) => Number(new Date(iso).toLocaleString("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: TZ }));
const fmtDob = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const todayYmd = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

const STEPS: { id: Step; label: string }[] = [
  { id: "time", label: "Choose a time" }, { id: "account", label: "Sign in" }, { id: "profile", label: "Your details" }, { id: "review", label: "Review & confirm" },
];

export default function Book({ publicPage = false }: { publicPage?: boolean }) {
  const { user } = useApp();
  const { search } = useLocation();
  const { providerId = "" } = useParams();
  // Signed in on the public link (e.g. straight back from sign-in): continue inside the app.
  if (publicPage && user) return <Navigate to={`/app/book/${encodeURIComponent(providerId)}${search}`} replace />;
  const body = <Booking providerId={providerId} user={user} />;
  return publicPage ? <PublicShell>{body}</PublicShell> : body;
}

function Booking({ providerId, user }: { providerId: string; user: User | null }) {
  const nav = useNavigate();
  const { setUser } = useApp();
  const [params, setParams] = useSearchParams();
  const slot = params.get("slot");
  const mode: Mode = params.get("mode") === "telehealth" ? "telehealth" : "in_person";

  const [data, setData] = useState<ProviderTimes | null>(null);
  const [loadError, setLoadError] = useState("");
  const [profile, setProfile] = useState<PatientProfile | null | undefined>(undefined);
  const [step, setStep] = useState<Step>("time");
  const [reason, setReason] = useState(() => recallConcern() || (fill(DEMO.concern) ?? ""));
  const [day, setDay] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [booked, setBooked] = useState<Booked | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const loadTimes = useCallback(() => api.get<ProviderTimes>(`/booking/providers/${encodeURIComponent(providerId)}`)
    .then((r) => { setData(r); return r; })
    .catch((e) => { setLoadError(e instanceof ApiError && e.status === 404 ? "We couldn't find that clinic." : "Couldn't load appointment times. Please try again."); return null; }), [providerId]);
  useEffect(() => { void loadTimes(); }, [loadTimes]);
  useEffect(() => { if (user) api.get<{ profile: PatientProfile | null }>("/profile").then((r) => setProfile(r.profile)).catch(() => setProfile(null)); }, [user]);

  // On arrival (including straight back from sign-in) resume where the URL says, once times and profile are known.
  const slotOpen = !!(slot && data?.days.some((d) => d.slots.includes(slot)));
  const resumed = useRef(false);
  useEffect(() => {
    if (!data || resumed.current || (user && profile === undefined)) return;
    resumed.current = true;
    if (!slot) return;
    if (!slotOpen) { setError("That time is no longer available. Please choose another."); return; }
    setStep(!user ? "account" : profile ? "review" : "profile");
  }, [data, slot, slotOpen, user, profile]);
  // Signed in from the account step without leaving the page (demo account): carry on.
  useEffect(() => { if (step === "account" && user && profile !== undefined) setStep(profile ? "review" : "profile"); }, [step, user, profile]);

  useEffect(() => { if (firstRender.current) { firstRender.current = false; return; } headRef.current?.focus(); }, [step]);
  // Demo default: the earliest open time is pre-selected, so "Continue" works straight away.
  useEffect(() => { if (fill(true) && data && !slot && step === "time" && data.days[0]?.slots[0]) choose(data.days[0].slots[0]); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (data && !day) setDay((slot && data.days.find((d) => d.slots.includes(slot))?.date) || data.days[0]?.date || null); }, [data, day, slot]);

  const choose = (iso: string) => { setError(""); setParams((p) => { p.set("slot", iso); return p; }, { replace: true }); };
  const setMode = (m: Mode) => setParams((p) => { if (m === "telehealth") p.set("mode", m); else p.delete("mode"); return p; }, { replace: true });

  function continueFromTime(e: FormEvent) {
    e.preventDefault();
    if (!slot || !slotOpen) { setError("Choose an appointment time to continue."); return; }
    rememberConcern(reason);
    setError("");
    setStep(!user ? "account" : profile ? "review" : "profile");
  }

  async function tryDemo() {
    setBusy(true); setError("");
    try { rememberConcern(reason); const r = await api.post<{ user: User }>("/demo"); setUser(r.user); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't open the demo. Please try again."); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!slot) return;
    setBusy(true); setError("");
    try {
      const r = await api.post<Booked>("/booking", { provider_id: providerId, starts_at: slot, mode, reason: reason.trim() || undefined });
      rememberConcern("");
      setBooked(r); setStep("done");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await loadTimes();
        setParams((p) => { p.delete("slot"); return p; }, { replace: true });
        setStep("time");
        setError(err.message);
      } else if (err instanceof ApiError && err.status === 422) { setStep("profile"); setError(err.message); }
      else setError(err instanceof ApiError ? err.message : "Couldn't confirm the booking. Please try again.");
    } finally { setBusy(false); }
  }

  if (loadError) return <div className="bk"><div className="card empty"><h3>{loadError}</h3><Link className="btn" to={carePath(!!user, "search")}>Back to search</Link></div></div>;
  if (!data) return <div className="bk"><Skeletons rows={3} /></div>;

  const p = data.provider;
  const nextPath = `/book/${encodeURIComponent(providerId)}?${params.toString()}`;
  const stepIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="bk fade-in">
      <Link to={carePath(!!user, "search")} className="back-link">← Back to clinics</Link>
      <header className="bk-head">
        <p className="eyebrow">Book an appointment</p>
        <h1>{p.name}</h1>
        <p className="muted">{p.category.name} · {p.clinic.name} · {p.clinic.suburb} {p.clinic.state}{p.is_fictional ? <> · <span className="badge warn">Fictional demo</span></> : null}</p>
      </header>

      {step !== "done" && (
        <ol className="fc-steps bk-steps" aria-label="Booking progress">
          {STEPS.map((s, i) => (
            <li key={s.id} className={i === stepIdx ? "is-current" : i < stepIdx ? "is-done" : ""} aria-current={i === stepIdx ? "step" : undefined}>
              <span className="fc-dot" aria-hidden="true">{i < stepIdx ? "✓" : i + 1}</span><span className="fc-step-label">{s.label}</span>
            </li>
          ))}
        </ol>
      )}

      {error && <div className="alert error" role="alert">{error}</div>}

      {step === "time" && (
        <form className="card bk-card" onSubmit={continueFromTime} aria-labelledby="bk-h">
          <h2 id="bk-h" ref={headRef} tabIndex={-1}>Choose a day and time</h2>
          <p className="small muted">Times shown in Sydney time. {data.notice}</p>
          {p.telehealth?.value && (
            <fieldset className="bk-modes">
              <legend className="fc-label">Appointment type</legend>
              <div className="seg" role="radiogroup" aria-label="Appointment type">
                {([["in_person", "In person"], ["telehealth", "Telehealth"]] as const).map(([v, l]) => (
                  <button type="button" key={v} role="radio" aria-checked={mode === v} onClick={() => setMode(v)}>{l}</button>
                ))}
              </div>
            </fieldset>
          )}
          {data.days.length === 0 ? (
            <div className="alert info">This clinic has no published opening hours in the next {data.window_days} days, so we can't offer times. Please contact the clinic directly, or choose another clinic.</div>
          ) : (
            <>
              <div className="bk-days" role="tablist" aria-label="Day">
                {data.days.map((d) => {
                  const dp = dayParts(d.date);
                  return (
                    <button type="button" role="tab" key={d.date} aria-selected={day === d.date} className={`bk-day${day === d.date ? " is-on" : ""}`} onClick={() => setDay(d.date)}>
                      <span className="bk-wd">{d.date === todayYmd() ? "Today" : dp.wd}</span><b>{dp.day}</b><span className="bk-mon">{dp.mon}</span>
                      <span className="bk-n">{d.slots.length} times</span>
                    </button>
                  );
                })}
              </div>
              <SlotGrid slots={data.days.find((d) => d.date === day)?.slots ?? []} selected={slot} onChoose={choose} />
            </>
          )}
          <div className="field" style={{ marginTop: "1rem" }}>
            <label htmlFor="bk-reason">Reason for visit <span className="muted">(optional, in your own words)</span></label>
            <textarea id="bk-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Headaches for a few weeks and I'm not sure what to do" />
            <div className="hint">Saved with your appointment so you can build on it when you prepare. It isn't sent to the clinic.</div>
          </div>
          <div className="fc-nav">
            <span className="small muted">{slot && slotOpen ? <>Selected: <strong>{fmtWhen(slot)}</strong></> : "No time selected yet"}</span>
            <button className="btn primary" disabled={!slot || !slotOpen}>Continue</button>
          </div>
        </form>
      )}

      {step === "account" && (
        <section className="card bk-card" aria-labelledby="bk-h">
          <h2 id="bk-h" ref={headRef} tabIndex={-1}>Sign in to finish booking</h2>
          <p>You've chosen <strong>{slot && fmtWhen(slot)}</strong>. To confirm it, sign in or create an account. We'll bring you straight back here with your time held in this page.</p>
          <div className="row">
            <Link className="btn primary" to={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in</Link>
            <Link className="btn" to={`/register?next=${encodeURIComponent(nextPath)}`}>Create an account</Link>
            <button type="button" className="btn ghost" onClick={tryDemo} disabled={busy}>{busy && <Spinner />} Use a demo account</button>
          </div>
          <p className="small muted" style={{ marginTop: ".8rem" }}>A demo account is a private sandbox with fictional data, deleted after 24 hours.</p>
          <button type="button" className="btn ghost sm" onClick={() => setStep("time")}>← Change time</button>
        </section>
      )}

      {step === "profile" && user && (
        <ProfileStep headRef={headRef} initial={profile ?? null} onBack={() => setStep(profile ? "review" : "time")}
          onSaved={(pr) => { setProfile(pr); setError(""); setStep("review"); }} />
      )}

      {step === "review" && user && profile && slot && (
        <section className="card bk-card" aria-labelledby="bk-h">
          <h2 id="bk-h" ref={headRef} tabIndex={-1}>Review your booking</h2>
          <div className="bk-review">
            <div>
              <div className="bk-review-head"><h3>Appointment</h3><button type="button" className="btn ghost sm" onClick={() => setStep("time")}>Change</button></div>
              <dl className="bk-dl">
                <div><dt>When</dt><dd>{fmtWhen(slot)} <span className="muted small">(Sydney time, {data.slot_minutes} min)</span></dd></div>
                <div><dt>Type</dt><dd>{mode === "telehealth" ? "Telehealth (video or phone)" : "In person"}</dd></div>
                <div><dt>Practitioner</dt><dd>{p.name}</dd></div>
                <div><dt>Service</dt><dd>{p.category.name}</dd></div>
                <div><dt>Clinic</dt><dd>{p.clinic.name}{mode === "in_person" ? <><br /><span className="muted small">{p.clinic.address ?? `${p.clinic.suburb} ${p.clinic.state} ${p.clinic.postcode}`}</span></> : null}</dd></div>
                {reason.trim() && <div><dt>Reason</dt><dd>{reason.trim()}</dd></div>}
              </dl>
            </div>
            <div>
              <div className="bk-review-head"><h3>Your details</h3><button type="button" className="btn ghost sm" onClick={() => setStep("profile")}>Edit</button></div>
              <dl className="bk-dl">
                <div><dt>Name</dt><dd>{user.name}</dd></div>
                <div><dt>Email</dt><dd>{user.email}</dd></div>
                <div><dt>Date of birth</dt><dd>{fmtDob(profile.date_of_birth)}</dd></div>
                <div><dt>Phone</dt><dd>{profile.phone}</dd></div>
                {profile.emergency_name && <div><dt>Emergency contact</dt><dd>{profile.emergency_name}{profile.emergency_phone ? `, ${profile.emergency_phone}` : ""}</dd></div>}
              </dl>
            </div>
          </div>
          <p className="alert warn small">Demo booking: this clinic is fictional and no real clinic is contacted. The appointment is saved to your CarePath account, and you can cancel it by deleting it.</p>
          <div className="fc-nav">
            <button type="button" className="btn ghost" onClick={() => setStep("time")}>Back</button>
            <button type="button" className="btn primary fc-big" onClick={confirm} disabled={busy}>{busy && <Spinner />} Confirm appointment</button>
          </div>
        </section>
      )}

      {step === "done" && booked && (
        <section className="card bk-card bk-done" aria-labelledby="bk-h">
          <p className="bk-tick" aria-hidden="true">✓</p>
          <h2 id="bk-h" ref={headRef} tabIndex={-1}>Appointment confirmed</h2>
          <p className="bk-when">{fmtWhen(booked.starts_at)} with {p.name}</p>
          <p className="muted">Reference <strong className="bk-ref">{booked.reference}</strong> · {booked.mode === "telehealth" ? "Telehealth" : p.clinic.name}</p>
          <p>It's on your dashboard and in My Journey. A good next step: get ready for the visit. Add your symptoms, concerns and questions, and the AI organises them into a brief you can edit and choose whether to share.</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <button type="button" className="btn primary" onClick={() => nav(`/app/appointments/${booked.appointment_id}/prepare`)}>Prepare for this appointment</button>
            <Link className="btn" to={`/app/appointments/${booked.appointment_id}`}>View appointment</Link>
            <Link className="btn ghost" to="/app">Go to dashboard</Link>
          </div>
        </section>
      )}
    </div>
  );
}

function SlotGrid({ slots, selected, onChoose }: { slots: string[]; selected: string | null; onChoose: (iso: string) => void }) {
  const groups = useMemo(() => {
    const g: { label: string; items: string[] }[] = [{ label: "Morning", items: [] }, { label: "Afternoon", items: [] }, { label: "Evening", items: [] }];
    for (const s of slots) { const h = hourIn(s); g[h < 12 ? 0 : h < 17 ? 1 : 2].items.push(s); }
    return g.filter((x) => x.items.length);
  }, [slots]);
  if (!slots.length) return <p className="muted small">No times left on this day.</p>;
  return (
    <div className="bk-slots">
      {groups.map((g) => (
        <div key={g.label} className="bk-slot-group" role="group" aria-label={g.label}>
          <h3>{g.label}</h3>
          <div className="bk-slot-row">
            {g.items.map((s) => (
              <button type="button" key={s} className={`bk-slot${selected === s ? " is-on" : ""}`} aria-pressed={selected === s} onClick={() => onChoose(s)}>{fmtTime(s)}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileStep({ initial, headRef, onSaved, onBack }: {
  initial: PatientProfile | null; headRef: React.RefObject<HTMLHeadingElement | null>; onSaved: (p: PatientProfile) => void; onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError(""); setFields({});
    try {
      const r = await api.put<{ profile: PatientProfile }>("/profile", Object.fromEntries(["date_of_birth", "phone", "emergency_name", "emergency_phone"].map((k) => [k, String(f.get(k) ?? "")])));
      onSaved(r.profile);
    } catch (err) {
      if (err instanceof ApiError) { setError(err.message); setFields(Object.fromEntries(err.fields.map((x) => [x.path, x.message]))); }
      else setError("Couldn't save your details. Please try again.");
    } finally { setBusy(false); }
  }
  return (
    <form className="card bk-card" onSubmit={submit} aria-labelledby="bk-h" noValidate>
      <h2 id="bk-h" ref={headRef} tabIndex={-1}>{initial ? "Your patient details" : "Complete your patient profile"}</h2>
      <p className="small muted">{initial ? "Update anything that's changed." : "Clinics need a few details to book you in. You only do this once."} Demo only: please use fictional details.</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="bk-form">
        <Field label="Date of birth" error={fields.date_of_birth}><input name="date_of_birth" type="date" required max={todayYmd()} min="1900-01-01" defaultValue={initial?.date_of_birth ?? fill(DEMO.profile.date_of_birth)} autoComplete="bday" /></Field>
        <Field label="Mobile phone" error={fields.phone}><input name="phone" type="tel" required maxLength={20} defaultValue={initial?.phone ?? fill(DEMO.profile.phone)} autoComplete="tel" placeholder="0400 000 000" /></Field>
        <Field label="Emergency contact (optional)" error={fields.emergency_name}><input name="emergency_name" maxLength={100} defaultValue={initial ? initial.emergency_name ?? "" : fill(DEMO.profile.emergency_name) ?? ""} placeholder="Name" /></Field>
        <Field label="Emergency contact phone (optional)" error={fields.emergency_phone}><input name="emergency_phone" type="tel" maxLength={20} defaultValue={initial ? initial.emergency_phone ?? "" : fill(DEMO.profile.emergency_phone) ?? ""} /></Field>
      </div>
      <div className="fc-nav">
        <button type="button" className="btn ghost" onClick={onBack}>Back</button>
        <button className="btn primary" disabled={busy}>{busy && <Spinner />} Save and continue</button>
      </div>
    </form>
  );
}
