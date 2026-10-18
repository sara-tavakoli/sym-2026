import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ACCESS_LABELS, api, ApiError, prefsToQuery, queryToPrefs, type AccessFeature, type Evaluated, type MatchStatus } from "../lib/api";
import { Skeletons } from "../components/ui";
import { HoursTable, StatusIcon, STATUS_TEXT, verifiedText } from "../components/fit";

// Worst status among the checks for a row (so a cell is highlighted only when the data actually supports it).
const ORDER: MatchStatus[] = ["not_met", "unverified", "partial", "met"];
function rowStatus(item: Evaluated, keys: (k: string) => boolean): MatchStatus | null {
  const cs = item.checks.filter((c) => keys(c.key));
  if (!cs.length) return null;
  return ORDER.find((s) => cs.some((c) => c.status === s)) ?? null;
}

export default function Compare() {
  const [params] = useSearchParams();
  const ids = params.get("ids") ?? "";
  const prefs = useMemo(() => queryToPrefs(params), [params]);
  const [items, setItems] = useState<Evaluated[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<{ items: Evaluated[] }>(`/fit-finder/compare?ids=${encodeURIComponent(ids)}&${prefsToQuery(prefs)}`)
      .then((r) => setItems(r.items)).catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the comparison."));
  }, [ids, prefs]);

  const back = `/app/fit-finder?${prefsToQuery(prefs)}`;
  if (error) return <div className="card empty"><h3>{error}</h3><Link className="btn" to={back}>Back to Fit Finder</Link></div>;
  if (!items) return <Skeletons rows={4} />;

  const cell = (it: Evaluated, keys: ((k: string) => boolean) | null, content: React.ReactNode) => {
    const s = keys ? rowStatus(it, keys) : null;
    return <td className={s ? `cmp-${s}` : undefined}>{s && <span className="cmp-status"><StatusIcon status={s} /> {STATUS_TEXT[s]}</span>}{content}</td>;
  };

  return (
    <div className="stack fade-in">
      <Link to={back} className="back-link">← Back to results</Link>
      <div className="page-head"><div><h1>Compare providers</h1><p className="muted">Side-by-side practical details, checked against your preferences.</p></div></div>
      <div className="alert info" role="note">This compares practical details only (location, hours, telehealth, accessibility, billing, language). It does not indicate the quality of clinical care. All providers shown are fictional demo listings.</div>

      <div className="cmp-wrap" tabIndex={0} aria-label="Comparison table (scrolls sideways on small screens)">
        <table className="cmp">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Detail</span></th>
              {items.map((it) => (
                <th scope="col" key={it.provider.id}>
                  <div className="cmp-name">{it.provider.name}</div>
                  <div className="small muted">{it.provider.clinic.name}</div>
                  {it.provider.is_fictional && <span className="badge warn">Fictional demo</span>}
                  <div style={{ marginTop: ".5rem" }}><Link className="btn sm primary" to={`/app/book/${encodeURIComponent(it.provider.id)}${prefs.mode === "telehealth" ? "?mode=telehealth" : ""}`}>Book<span className="sr-only"> {it.provider.name}</span></Link></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><th scope="row">Your preferences</th>{items.map((it) => (
              <td key={it.provider.id}>
                {it.checks.length ? (
                  <>
                    <div className="cmp-score">Meets {it.summary.met} of {it.summary.total}{it.summary.partial ? ` · partly ${it.summary.partial}` : ""}{it.summary.unverified ? ` · ${it.summary.unverified} not verified` : ""}</div>
                    <ul className="plain small">{it.checks.map((c) => <li key={c.key}><StatusIcon status={c.status} /> {c.label}</li>)}</ul>
                  </>
                ) : <span className="small muted">No preferences selected</span>}
              </td>
            ))}</tr>
            <tr><th scope="row">Service</th>{items.map((it) => <td key={it.provider.id}>{it.provider.category.name}</td>)}</tr>
            <tr><th scope="row">Location</th>{items.map((it) => <Cell key={it.provider.id}>{cell(it, (k) => k === "location", <>{it.provider.clinic.address ?? it.provider.clinic.suburb}{it.distance_km !== null && <div className="small muted">{it.distance_km} km away (straight line)</div>}</>)}</Cell>)}</tr>
            <tr><th scope="row">Opening hours</th>{items.map((it) => <Cell key={it.provider.id}>{cell(it, (k) => k === "days" || k === "time", <HoursTable hours={it.provider.hours} />)}</Cell>)}</tr>
            <tr><th scope="row">Telehealth</th>{items.map((it) => <Cell key={it.provider.id}>{cell(it, (k) => k === "mode", it.provider.telehealth ? `${it.provider.telehealth.value ? "Offered" : "Not offered"} — ${verifiedText(it.provider.telehealth.verified_at)}` : "Not verified")}</Cell>)}</tr>
            <tr><th scope="row">Accessibility</th>{items.map((it) => <Cell key={it.provider.id}>{cell(it, (k) => k.startsWith("access:"), (
              <ul className="plain small">{(Object.keys(ACCESS_LABELS) as AccessFeature[]).map((f) => { const a = it.provider.accessibility[f]; return <li key={f}>{ACCESS_LABELS[f]}: {a ? `${a.value ? "Yes" : "No"}${a.verified_at ? "" : " (not verified)"}` : "Not verified"}</li>; })}</ul>
            ))}</Cell>)}</tr>
            <tr><th scope="row">Billing</th>{items.map((it) => <Cell key={it.provider.id}>{cell(it, (k) => k === "billing", it.provider.billing ? `${it.provider.billing.details ?? it.provider.billing.bulk_billing} — ${verifiedText(it.provider.billing.verified_at)}` : "Not verified — ask the clinic about fees")}</Cell>)}</tr>
            <tr><th scope="row">Languages</th>{items.map((it) => <Cell key={it.provider.id}>{cell(it, (k) => k === "language", it.provider.languages ? `${it.provider.languages.values.join(", ")}${it.provider.languages.verified_at ? "" : " (not verified)"}` : "Not listed")}</Cell>)}</tr>
            <tr><th scope="row">Booking link</th>{items.map((it) => (
              <td key={it.provider.id}>{it.provider.booking ? <><a href={it.provider.booking.url} target="_blank" rel="noreferrer">Demo booking link ↗</a><div className="small muted">{it.provider.booking.verified_at ? "Link verified (demo)" : "Link not verified"}</div></> : "No verified booking link"}</td>
            ))}</tr>
          </tbody>
        </table>
      </div>
      <p className="small muted">Opening hours are published hours, not appointment availability. CarePath never shows booking slots, fees or eligibility it can't verify.</p>
    </div>
  );
}

// Fragment wrapper so `cell()` can return the <td> while keeping keys on the map.
function Cell({ children }: { children: React.ReactNode }) { return <>{children}</>; }
