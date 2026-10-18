import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ACCESS_LABELS, api, DAY_LABELS, fmtMinutes, prefsToQuery,
  type AccessFeature, type Check, type Evaluated, type ExtractedPrefs, type FitMeta, type MatchStatus, type Prefs,
} from "../lib/api";

let metaCache: Promise<FitMeta> | null = null;
export function useFitMeta() {
  const [meta, setMeta] = useState<FitMeta | null>(null);
  useEffect(() => {
    metaCache ??= api.get<FitMeta>("/fit-finder/meta").catch((e) => { metaCache = null; throw e; });
    metaCache.then(setMeta).catch(() => setMeta(null));
  }, []);
  return meta;
}

export const STATUS_TEXT: Record<MatchStatus, string> = { met: "Meets", partial: "Partly meets", not_met: "Doesn't meet", unverified: "Not verified" };
export function StatusIcon({ status }: { status: MatchStatus }) {
  const glyph = { met: "✓", partial: "◐", not_met: "✕", unverified: "?" }[status];
  return <span className={`st st-${status}`} aria-hidden="true">{glyph}</span>;
}

export const CATEGORY_TO_SERVICE: Record<string, string> = {
  gp: "General Practitioner (GP)", dentist: "Dentist", physiotherapist: "Physiotherapy", psychologist: "Psychology / Counselling", optometrist: "Optometry",
};

/** Human-readable chips for a set of preferences. */
export function prefChips(p: Partial<Prefs>, meta: FitMeta | null): { key: keyof Prefs | string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  if (p.category) out.push({ key: "category", label: meta?.categories.find((c) => c.id === p.category)?.name ?? p.category });
  if (p.location) out.push({ key: "location", label: `Near ${p.location}` });
  if (p.days?.length) out.push({ key: "days", label: p.days.length === 2 && p.days.includes("sat") && p.days.includes("sun") ? "Weekends" : p.days.map((d) => DAY_LABELS[d]).join(", ") });
  if (p.time) out.push({ key: "time", label: `${p.time[0].toUpperCase()}${p.time.slice(1)}s` });
  if (p.mode) out.push({ key: "mode", label: p.mode === "telehealth" ? "Telehealth" : "In person" });
  for (const a of p.accessibility ?? []) out.push({ key: `accessibility:${a}`, label: ACCESS_LABELS[a] });
  if (p.bulk_billing) out.push({ key: "bulk_billing", label: "Bulk billing" });
  if (p.language) out.push({ key: "language", label: `Speaks ${p.language}` });
  if (p.practitioner_gender) out.push({ key: "practitioner_gender", label: `${p.practitioner_gender === "female" ? "Female" : "Male"} practitioner` });
  return out;
}
export function withoutChip(p: Partial<Prefs>, key: string): Partial<Prefs> {
  const n = { ...p };
  if (key.startsWith("accessibility:")) { n.accessibility = (n.accessibility ?? []).filter((a) => a !== key.split(":")[1]); return n; }
  delete (n as Record<string, unknown>)[key];
  return n;
}

/** Editable summary of preferences the AI read from a message; the search itself runs on the server's directory. */
export function SearchSummary({ extracted }: { extracted: ExtractedPrefs }) {
  const meta = useFitMeta();
  const nav = useNavigate();
  const [prefs, setPrefs] = useState<Partial<Prefs>>(extracted.prefs);
  const chips = prefChips(prefs, meta);
  const locationProblem = prefs.location && extracted.location_known === false && prefs.location === extracted.prefs.location;
  return (
    <div className="search-summary" aria-label="Search preferences to review">
      <div className="search-summary-head"><strong>Your search preferences</strong><span className="muted small">Check and edit before searching</span></div>
      {chips.length > 0 ? (
        <div className="chip-row">
          {chips.filter((c) => c.key !== "category").map((c) => (
            <span key={c.key} className="pref-chip">{c.label}<button type="button" aria-label={`Remove ${c.label}`} onClick={() => setPrefs(withoutChip(prefs, c.key))}>×</button></span>
          ))}
        </div>
      ) : <p className="muted small">No specific preferences were found in your message.</p>}
      <div className="row" style={{ marginTop: ".5rem" }}>
        <label className="sr-only" htmlFor="ss-cat">Service type</label>
        <select id="ss-cat" value={prefs.category ?? ""} onChange={(e) => setPrefs({ ...prefs, category: e.target.value || undefined })} style={{ flex: 1, minWidth: 180 }}>
          <option value="">Choose a service type…</option>
          {meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" className="btn primary sm" disabled={!prefs.category} onClick={() => nav(`/app/fit-finder?${prefsToQuery(prefs)}`)}>Find providers</button>
      </div>
      {locationProblem && <p className="small warn-text">“{prefs.location}” isn't covered by the demo directory yet — you can pick a covered suburb on the next page.</p>}
      {extracted.dropped > 0 && <p className="small muted">Some details couldn't be matched to your exact words and were left out.</p>}
    </div>
  );
}

const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function HoursTable({ hours }: { hours: Evaluated["provider"]["hours"] }) {
  if (!hours.length) return <p className="small muted">Opening hours not listed — contact the clinic.</p>;
  const verified = hours.every((h) => h.verified_at);
  return (
    <>
      <table className="hours">
        <tbody>
          {DAY_ORDER.map((d) => {
            const hs = hours.filter((h) => h.day === d);
            return <tr key={d}><th scope="row">{DAY_SHORT[d]}</th><td>{hs.length ? hs.map((h) => `${fmtMinutes(h.opens)}–${fmtMinutes(h.closes)}`).join(", ") : <span className="muted">Closed</span>}</td></tr>;
          })}
        </tbody>
      </table>
      <p className="small muted">Published opening hours{verified ? "" : " (not verified)"} — not appointment availability.</p>
    </>
  );
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null);
export const verifiedText = (iso: string | null) => (iso ? `verified ${date(iso)} (demo)` : "not verified");

export function ProviderCard({ item, selected, onToggleCompare, compareDisabled, onAddAppointment, onBook }: {
  item: Evaluated; selected: boolean; onToggleCompare?: () => void; compareDisabled: boolean; onAddAppointment?: () => void; onBook: () => void;
}) {
  const p = item.provider;
  const groups: [MatchStatus, Check[]][] = (["met", "partial", "not_met", "unverified"] as MatchStatus[]).map((s) => [s, item.checks.filter((c) => c.status === s)]);
  return (
    <article className="provider-card" aria-labelledby={`p-${p.id}`}>
      <header className="provider-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id={`p-${p.id}`}>{p.name}</h3>
          <p className="provider-sub">{p.category.name} · {p.clinic.name}</p>
          <p className="provider-sub">{p.clinic.suburb} {p.clinic.state} {p.clinic.postcode}{item.distance_km !== null ? ` · ${item.distance_km} km away` : ""}</p>
        </div>
        {p.is_fictional && <span className="badge warn" title="This provider does not exist">Fictional demo</span>}
      </header>

      <p className="provider-why"><strong>Why it's here:</strong> {item.why}</p>

      {item.checks.length > 0 && (
        <div className="check-groups">
          {groups.filter(([, cs]) => cs.length).map(([s, cs]) => (
            <div key={s} className="check-group">
              <span className={`check-title st-text-${s}`}>{s === "unverified" ? "Needs verification" : STATUS_TEXT[s]}</span>
              <ul>{cs.map((c) => <li key={c.key}><StatusIcon status={c.status} /><span><strong>{c.label}</strong> — {c.detail}</span></li>)}</ul>
            </div>
          ))}
        </div>
      )}

      <details className="provider-details">
        <summary>Opening hours, billing, accessibility and booking</summary>
        <div className="provider-detail-grid">
          <div><h4>Opening hours</h4><HoursTable hours={p.hours} /></div>
          <div>
            <h4>Billing</h4>
            <p className="small">{p.billing ? `${p.billing.details ?? p.billing.bulk_billing} — ${verifiedText(p.billing.verified_at)}` : "Not verified — no billing information listed. Ask the clinic about fees."}</p>
            <h4>Telehealth</h4>
            <p className="small">{p.telehealth ? `${p.telehealth.value ? "Offered" : "Not offered"} — ${verifiedText(p.telehealth.verified_at)}` : "Not verified"}</p>
            <h4>Languages</h4>
            <p className="small">{p.languages ? `${p.languages.values.join(", ")} — ${verifiedText(p.languages.verified_at)}` : "Not listed"}</p>
          </div>
          <div>
            <h4>Accessibility</h4>
            <ul className="plain small">
              {(Object.keys(ACCESS_LABELS) as AccessFeature[]).map((f) => {
                const a = p.accessibility[f];
                return <li key={f}>{ACCESS_LABELS[f]}: {a ? `${a.value ? "Yes" : "No"} — ${verifiedText(a.verified_at)}` : "Not verified"}</li>;
              })}
            </ul>
            <h4>Booking</h4>
            {p.booking ? (
              <p className="small"><a href={p.booking.url} target="_blank" rel="noreferrer">Booking link (demo, example.com) ↗</a><br /><span className="muted">{p.booking.verified_at ? `Link ${verifiedText(p.booking.verified_at)}` : "Link not verified"}</span></p>
            ) : <p className="small">No verified booking link — contact the clinic.</p>}
          </div>
        </div>
        <p className="small muted">Source: {p.data_source}. CarePath does not show real appointment availability, fees or eligibility.</p>
      </details>

      <footer className="provider-foot">
        {onToggleCompare ? (
          <label className="compare-toggle">
            <input type="checkbox" checked={selected} disabled={!selected && compareDisabled} onChange={onToggleCompare} /> Compare
          </label>
        ) : <span />}
        <div className="row">
          {onAddAppointment && <button type="button" className="btn sm ghost" onClick={onAddAppointment} title="Already booked somewhere else? Record it here.">Already booked? Add it</button>}
          <button type="button" className="btn sm primary" onClick={onBook}>Book appointment<span className="sr-only"> with {p.name}</span></button>
        </div>
      </footer>
    </article>
  );
}
