import { DAY_LABELS, fmtMinutes, type Check, type Evaluated, type MatchStatus } from "../lib/api";
import { STATUS_META, unverifiedDetails } from "../lib/fit-finder";

export function StatusPill({ status }: { status: MatchStatus }) {
  const m = STATUS_META[status];
  return <span className={`ff-pill ${m.cls}`}><span aria-hidden="true">{m.symbol}</span> {m.label}</span>;
}

function CheckList({ title, checks, tone }: { title: string; checks: Check[]; tone: string }) {
  if (!checks.length) return null;
  return (
    <div className={`ff-group ${tone}`}>
      <h4>{title}</h4>
      <ul>
        {checks.map((c) => {
          const m = STATUS_META[c.status];
          return (
            <li key={c.key}>
              <span className={`ff-sym ${m.cls}`} aria-hidden="true">{m.symbol}</span>
              <span><strong>{c.label}</strong>{c.status === "partial" && <> <span className="ff-pill info">Partly</span></>}<span className="sr-only"> ({m.label})</span><br /><span className="small muted">{c.detail}</span></span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Verified({ at }: { at: string | null }) {
  return at ? <span className="ff-pill ok">✓ Verified {at.slice(0, 10)}</span> : <span className="ff-pill warn">? Not verified</span>;
}

export function ResultCard({ e, rank, selected, canSelect, onToggle, onAdd }: {
  e: Evaluated; rank: number; selected: boolean; canSelect: boolean; onToggle: () => void; onAdd: () => void;
}) {
  const p = e.provider, s = e.summary;
  const matches = e.checks.filter((c) => c.status === "met" || c.status === "partial");
  const misses = e.checks.filter((c) => c.status === "not_met");
  const unverified = e.checks.filter((c) => c.status === "unverified");
  const otherFlags = unverifiedDetails(e);
  const hoursVerified = p.hours.length > 0 && p.hours.every((h) => h.verified_at);
  const pct = s.total ? Math.round(((s.met + s.partial * 0.5) / s.total) * 100) : 100;
  const headingId = `ff-r-${p.id}`;

  return (
    <article className={`card ff-result ${selected ? "selected" : ""}`} aria-labelledby={headingId}>
      <div className="ff-result-head">
        <div className="ff-rank" aria-hidden="true">#{rank}</div>
        <div className="ff-title">
          <h3 id={headingId}><span className="sr-only">Rank {rank}: </span>{p.name}</h3>
          <div className="small muted">{p.clinic.name} · {p.clinic.suburb} {p.clinic.state} {p.clinic.postcode}</div>
          <div className="row ff-badges">
            <span className="badge">{p.category.name}</span>
            {e.distance_km !== null && <span className="badge info">{e.distance_km} km away</span>}
            {p.telehealth?.value && <span className="badge">Telehealth{p.telehealth.verified_at ? "" : " (unverified)"}</span>}
            {p.is_fictional && <span className="badge warn">Fictional</span>}
          </div>
        </div>
        <div className="ff-score" aria-label={s.total ? `Meets ${s.met} of ${s.total} preferences` : "No extra preferences set"}>
          <div className="ff-ring" style={{ ["--pct" as string]: `${pct}%` }}><b>{s.total ? `${s.met}/${s.total}` : "–"}</b></div>
          <span className="small muted">met</span>
        </div>
      </div>

      <p className="ff-why">{e.why}</p>

      <div className="ff-groups">
        <CheckList title="Why it matches" checks={matches} tone="ok" />
        <CheckList title="What doesn't match" checks={misses} tone="bad" />
        <CheckList title="Not verified: confirm with the clinic" checks={unverified} tone="warn" />
      </div>

      {otherFlags.length > 0 && (
        <p className="ff-flags small"><span className="ff-pill warn">? Not verified</span> {otherFlags.join(" · ")}</p>
      )}

      <details className="ff-details">
        <summary>Clinic details and published hours</summary>
        <dl>
          <dt>Address</dt><dd>{p.clinic.address ?? "Not listed"}</dd>
          <dt>Hours</dt>
          <dd>
            {p.hours.length ? (
              <>
                <ul className="ff-hours">{p.hours.map((h, i) => <li key={i}><span>{Object.values(DAY_LABELS)[h.day]}</span> {fmtMinutes(h.opens)}–{fmtMinutes(h.closes)}</li>)}</ul>
                <Verified at={hoursVerified ? p.hours[0].verified_at : null} /> <span className="small muted">Published hours, not appointment availability.</span>
              </>
            ) : <span className="ff-pill warn">? Not listed</span>}
          </dd>
          <dt>Billing</dt><dd>{p.billing ? <>{p.billing.details ?? p.billing.bulk_billing} <Verified at={p.billing.verified_at} /></> : <span className="ff-pill warn">? Not listed: ask the clinic about fees</span>}</dd>
          <dt>Languages</dt><dd>{p.languages ? <>{p.languages.values.join(", ")} <Verified at={p.languages.verified_at} /></> : "Not listed"}</dd>
          {p.gender && <><dt>Practitioner</dt><dd>{p.gender.value} <Verified at={p.gender.verified_at} /></dd></>}
          <dt>Source</dt><dd className="small muted">{p.data_source}</dd>
        </dl>
      </details>

      <div className="ff-actions">
        {p.booking ? (
          <a className="btn sm primary" href={p.booking.url} target="_blank" rel="noopener noreferrer">
            Book (opens external site) <span aria-hidden="true">↗</span>
          </a>
        ) : <span className="small muted">No online booking link listed</span>}
        {p.booking && !p.booking.verified_at && <span className="ff-pill warn">? Link not verified</span>}
        <button type="button" className="btn sm" onClick={onAdd}>Add to my appointments</button>
        <label className={`ff-compare-toggle ${!canSelect && !selected ? "disabled" : ""}`}>
          <input type="checkbox" checked={selected} disabled={!canSelect && !selected} onChange={onToggle} />
          Compare
        </label>
      </div>
    </article>
  );
}

export function CompareTable({ items }: { items: Evaluated[] }) {
  const rows: { key: string; label: string }[] = [];
  for (const e of items) for (const c of e.checks) if (!rows.some((r) => r.key === c.key)) rows.push({ key: c.key, label: c.label });
  const cell = (e: Evaluated, key: string) => e.checks.find((c) => c.key === key);

  return (
    <div className="ff-table-wrap" role="region" aria-label="Comparison table" tabIndex={0}>
      <table className="ff-compare">
        <thead>
          <tr>
            <th scope="col">Requirement</th>
            {items.map((e) => (
              <th scope="col" key={e.provider.id}>{e.provider.name}<span className="small muted">{e.provider.clinic.name}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="ff-sum">
            <th scope="row">Overall</th>
            {items.map((e) => <td key={e.provider.id}><strong>{e.summary.total ? `Meets ${e.summary.met} of ${e.summary.total}` : "No extra preferences"}</strong>{e.summary.unverified > 0 && <span className="small muted">{e.summary.unverified} not verified</span>}</td>)}
          </tr>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              {items.map((e) => {
                const c = cell(e, r.key);
                return <td key={e.provider.id}>{c ? <><StatusPill status={c.status} /><span className="small muted">{c.detail}</span></> : <span className="muted">n/a</span>}</td>;
              })}
            </tr>
          ))}
          <tr>
            <th scope="row">Distance</th>
            {items.map((e) => <td key={e.provider.id}>{e.distance_km !== null ? `${e.distance_km} km` : <span className="muted">Set a location</span>}</td>)}
          </tr>
          <tr>
            <th scope="row">Billing</th>
            {items.map((e) => <td key={e.provider.id}>{e.provider.billing ? <><span className="small">{e.provider.billing.details}</span><Verified at={e.provider.billing.verified_at} /></> : <span className="ff-pill warn">? Not listed</span>}</td>)}
          </tr>
          <tr>
            <th scope="row">Languages</th>
            {items.map((e) => <td key={e.provider.id}><span className="small">{e.provider.languages?.values.join(", ") ?? "Not listed"}</span></td>)}
          </tr>
          <tr>
            <th scope="row">Online booking</th>
            {items.map((e) => <td key={e.provider.id}>{e.provider.booking ? <a href={e.provider.booking.url} target="_blank" rel="noopener noreferrer" className="small">Book (opens external site) ↗</a> : <span className="muted small">Not listed</span>}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
