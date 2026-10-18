import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ACCESS_LABELS, api, ApiError, DAY_LABELS, prefsToQuery, queryToPrefs,
  type AccessFeature, type Day, type ExtractedPrefs, type Prefs, type SavedSearch, type SearchResult,
} from "../lib/api";
import { useApp } from "../lib/app-context";
import { Skeletons, Spinner } from "../components/ui";
import { AppointmentForm } from "../components/AppointmentForm";
import { CATEGORY_TO_SERVICE, ProviderCard, prefChips, useFitMeta } from "../components/fit";
import { PublicShell, carePath } from "../components/PublicShell";

const EMPTY: Partial<Prefs> = { radius_km: 10 };
const PAGE_SIZE = 6;

export default function FitFinder({ publicPage = false }: { publicPage?: boolean }) {
  const { user } = useApp();
  const { search } = useLocation();
  // Signed in on the public search: the same search inside the app (saved searches, compare, AI request reading).
  if (publicPage && user) return <Navigate to={`/app/fit-finder${search}`} replace />;
  return publicPage ? <PublicShell><Finder signedIn={false} /></PublicShell> : <Finder signedIn />;
}

function Finder({ signedIn }: { signedIn: boolean }) {
  const meta = useFitMeta();
  const nav = useNavigate();
  const { notify } = useApp();
  const [params, setParams] = useSearchParams();
  const urlPrefs = useMemo(() => queryToPrefs(params), [params]);
  const page = Math.max(1, Number(params.get("page") ?? 1));

  const [form, setForm] = useState<Partial<Prefs>>({ ...EMPTY, ...urlPrefs });
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<{ message: string; suggestions?: string[] } | null>(null);
  const [nl, setNl] = useState("");
  const [reading, setReading] = useState(false);
  const [understood, setUnderstood] = useState<ExtractedPrefs | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [addFor, setAddFor] = useState<SearchResult["items"][number] | null>(null);
  // On small screens, a search that's already applied starts with the filters collapsed so results come first.
  const [filtersOpen, setFiltersOpen] = useState(() => { try { return !(urlPrefs.category && window.matchMedia("(max-width: 820px)").matches); } catch { return true; } });

  // Keep the form in step with the URL (assistant handoff, back/forward, saved searches).
  useEffect(() => { setForm({ ...EMPTY, ...urlPrefs }); }, [urlPrefs]);

  useEffect(() => {
    if (!urlPrefs.category) { setResult(null); return; }
    let cancelled = false;
    setSearching(true); setError(null);
    api.get<SearchResult>(`/fit-finder/search?${prefsToQuery({ ...urlPrefs })}&page=${page}&pageSize=${PAGE_SIZE}`)
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((e) => {
        if (cancelled) return;
        setResult(null);
        const body = e instanceof ApiError ? e : null;
        setError({ message: body?.message ?? "Search failed. Please try again." });
        if (body?.status === 422) api.get<{ locations: { suburb: string }[] }>("/fit-finder/meta").then((m) => setError({ message: body.message, suggestions: m.locations.map((l) => l.suburb) })).catch(() => {});
      })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [urlPrefs, page]);

  useEffect(() => { if (signedIn) api.get<{ items: SavedSearch[] }>("/fit-finder/saved").then((r) => setSaved(r.items)).catch(() => {}); }, [signedIn]);
  const book = (id: string) => nav(`${carePath(signedIn, "book", encodeURIComponent(id))}${urlPrefs.mode === "telehealth" ? "?mode=telehealth" : ""}`);

  function run(prefs: Partial<Prefs>, p = 1) {
    if (!prefs.category) { setError({ message: "Choose a service type to search." }); return; }
    const q = prefsToQuery(prefs);
    setParams(p > 1 ? `${q}&page=${p}` : q);
  }
  const submit = (e: FormEvent) => {
    e.preventDefault(); setCompare([]); run(form);
    try { if (form.category && window.matchMedia("(max-width: 820px)").matches) setFiltersOpen(false); } catch { /* ignore */ }
  };
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K] | undefined) => setForm((f) => ({ ...f, [k]: v }));
  const toggleDay = (d: Day) => set("days", (form.days ?? []).includes(d) ? form.days!.filter((x) => x !== d) : [...(form.days ?? []), d]);
  const toggleAccess = (a: AccessFeature) => set("accessibility", (form.accessibility ?? []).includes(a) ? form.accessibility!.filter((x) => x !== a) : [...(form.accessibility ?? []), a]);

  async function readRequest() {
    setReading(true); setError(null); setUnderstood(null);
    try {
      const r = await api.post<ExtractedPrefs>("/fit-finder/extract", { text: nl });
      setUnderstood(r);
      setForm({ ...EMPTY, ...r.prefs }); // review in the form before searching
    } catch (e) { setError({ message: e instanceof ApiError ? e.message : "Couldn't read that request." }); }
    finally { setReading(false); }
  }

  async function saveSearch() {
    if (!urlPrefs.category) return;
    const name = window.prompt("Name this search", prefChips(urlPrefs, meta).map((c) => c.label).slice(0, 3).join(" · "));
    if (!name) return;
    try {
      const s = await api.post<SavedSearch>("/fit-finder/saved", { name, prefs: { radius_km: 10, ...urlPrefs } });
      setSaved((x) => [{ ...s, created_at: new Date().toISOString() }, ...x]);
      notify("Search saved");
    } catch (e) { notify(e instanceof ApiError ? e.message : "Couldn't save the search", "error"); }
  }
  async function deleteSaved(id: string) {
    try { await api.del(`/fit-finder/saved/${id}`); setSaved((x) => x.filter((s) => s.id !== id)); } catch { notify("Couldn't delete", "error"); }
  }

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const telehealth = form.mode === "telehealth";

  return (
    <div className="stack fade-in">
      <div className="page-head">
        <div>
          <h1>{signedIn ? "Fit Finder" : "Find a clinic"}</h1>
          <p className="muted">Compare healthcare services by the practical things that matter to you — location, hours, telehealth, accessibility, billing and language. Then choose a time and book.</p>
        </div>
      </div>
      <div className="alert warn" role="note">
        <strong>Demonstration directory.</strong> Every provider shown is fictional. Fit Finder compares practical details only — it doesn't judge clinical quality or tell you which service you medically need. For advice on what kind of care to seek, call Healthdirect on 1800 022 222. In an emergency call 000.
      </div>
      <p className="small muted" style={{ margin: 0 }}>Not sure what kind of service you need? <Link to={carePath(signedIn, "find-care")}>Help me find care</Link></p>

      {signedIn && <section className="card ff-nl" aria-labelledby="nl-h">
        <h2 id="nl-h">Describe what you're looking for</h2>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label htmlFor="nl-input" className="sr-only">Describe what you're looking for</label>
            <textarea id="nl-input" rows={2} maxLength={1000} value={nl} onChange={(e) => setNl(e.target.value)}
              placeholder="e.g. A GP around Macquarie Park on weekends, bulk billing if available, who speaks Mandarin" />
          </div>
          <button className="btn" onClick={readRequest} disabled={nl.trim().length < 3 || reading}>{reading && <Spinner />} Read my request</button>
        </div>
        {understood && (
          <div className="understood" role="status">
            {understood.evidence.length ? (
              <>
                <strong>We picked out:</strong>
                <ul>{understood.evidence.map((e, i) => <li key={i}><span className="pref-chip static">{e.field.replace("_", " ")}: {e.value}</span> from “{e.quote}”</li>)}</ul>
                <p className="small muted">Review the filters below, adjust anything, then search.{understood.dropped ? " Some details couldn't be matched to your exact words and were left out." : ""}</p>
                {understood.location_known === false && <p className="small warn-text">“{understood.prefs.location}” isn't covered by the demo directory — choose a listed suburb below.</p>}
              </>
            ) : <p className="small">We couldn't find specific preferences in that request. Use the filters below instead.</p>}
          </div>
        )}
      </section>}

      <details className="card ff-form" open={filtersOpen} onToggle={(e) => setFiltersOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="ff-summary">
          <h2 id="filters-h">Filters</h2>
          {!filtersOpen && <span className="ff-summary-text">{prefChips(urlPrefs, meta).map((c) => c.label).join(" · ") || "None applied"}</span>}
        </summary>
      <form onSubmit={submit} aria-labelledby="filters-h">
        <div className="ff-grid">
          <div className="field">
            <label htmlFor="ff-cat">Service type *</label>
            <select id="ff-cat" value={form.category ?? ""} onChange={(e) => set("category", e.target.value || undefined)} required>
              <option value="">Choose…</option>
              {meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ff-loc">Suburb or postcode</label>
            <input id="ff-loc" list="ff-suburbs" value={form.location ?? ""} maxLength={80} onChange={(e) => set("location", e.target.value || undefined)} placeholder="e.g. Macquarie Park or 2113" />
            <datalist id="ff-suburbs">{meta?.locations.map((l) => <option key={l.suburb} value={l.suburb}>{l.postcode}</option>)}</datalist>
          </div>
          <div className="field">
            <label htmlFor="ff-radius">Distance</label>
            <select id="ff-radius" value={form.radius_km ?? 10} onChange={(e) => set("radius_km", Number(e.target.value))} disabled={telehealth}>
              {(meta?.radii ?? [2, 5, 10, 20, 50]).map((r) => <option key={r} value={r}>Within {r} km</option>)}
            </select>
            {telehealth && <div className="hint">Telehealth searches aren't limited by distance.</div>}
          </div>
          <div className="field">
            <label htmlFor="ff-time">Time of day</label>
            <select id="ff-time" value={form.time ?? ""} onChange={(e) => set("time", (e.target.value || undefined) as Prefs["time"])}>
              <option value="">Any time</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option>
            </select>
          </div>
          <fieldset className="field ff-wide">
            <legend>Preferred days</legend>
            <div className="toggle-row">
              {(Object.keys(DAY_LABELS) as Day[]).map((d) => (
                <button type="button" key={d} className="toggle" aria-pressed={(form.days ?? []).includes(d)} onClick={() => toggleDay(d)}>{DAY_LABELS[d]}</button>
              ))}
            </div>
          </fieldset>
          <fieldset className="field ff-wide">
            <legend>Appointment type</legend>
            <div className="seg" role="radiogroup" aria-label="Appointment type">
              {([["", "Either"], ["in_person", "In person"], ["telehealth", "Telehealth"]] as const).map(([v, l]) => (
                <button type="button" key={v} role="radio" aria-checked={(form.mode ?? "") === v} onClick={() => set("mode", (v || undefined) as Prefs["mode"])}>{l}</button>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="ff-lang">Language</label>
            <input id="ff-lang" list="ff-langs" value={form.language ?? ""} maxLength={40} onChange={(e) => set("language", e.target.value || undefined)} placeholder="Any" />
            <datalist id="ff-langs">{["Mandarin", "Cantonese", "Arabic", "Hindi", "Korean", "Vietnamese", "Spanish", "Greek", "Japanese", "Indonesian"].map((l) => <option key={l} value={l} />)}</datalist>
          </div>
          <div className="field">
            <label htmlFor="ff-gender">Practitioner</label>
            <select id="ff-gender" value={form.practitioner_gender ?? ""} onChange={(e) => set("practitioner_gender", (e.target.value || undefined) as Prefs["practitioner_gender"])}>
              <option value="">No preference</option><option value="female">Female practitioner</option><option value="male">Male practitioner</option>
            </select>
          </div>
          <fieldset className="field ff-wide">
            <legend>Accessibility</legend>
            <div className="check-row">
              {(Object.keys(ACCESS_LABELS) as AccessFeature[]).map((a) => (
                <label key={a} className="inline-check"><input type="checkbox" checked={(form.accessibility ?? []).includes(a)} onChange={() => toggleAccess(a)} /> {ACCESS_LABELS[a]}</label>
              ))}
            </div>
          </fieldset>
          <fieldset className="field ff-wide">
            <legend>Billing and matching</legend>
            <div className="check-row">
              <label className="inline-check"><input type="checkbox" checked={!!form.bulk_billing} onChange={(e) => set("bulk_billing", e.target.checked || undefined)} /> Bulk billing (where verified)</label>
              <label className="inline-check"><input type="checkbox" checked={!!form.strict} onChange={(e) => set("strict", e.target.checked || undefined)} /> Only show providers that meet every preference</label>
            </div>
          </fieldset>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={() => { setForm(EMPTY); setUnderstood(null); }}>Clear</button>
          <button className="btn primary" disabled={searching}>{searching && <Spinner />} Search</button>
        </div>
      </form>
      </details>

      {saved.length > 0 && (
        <div className="saved-row" aria-label="Saved searches">
          <span className="small muted">Saved:</span>
          {saved.map((s) => (
            <span key={s.id} className="pref-chip">
              <button type="button" className="chip-link" onClick={() => run(s.prefs)}>{s.name}</button>
              <button type="button" aria-label={`Delete saved search ${s.name}`} onClick={() => deleteSaved(s.id)}>×</button>
            </span>
          ))}
        </div>
      )}

      <section aria-labelledby="results-h" aria-busy={searching}>
        {error && (
          <div className="alert error" role="alert">
            {error.message}
            {error.suggestions && (
              <div className="chip-row" style={{ marginTop: ".5rem" }}>
                {error.suggestions.map((s) => <button type="button" key={s} className="pref-chip chip-link" onClick={() => run({ ...urlPrefs, location: s })}>{s}</button>)}
              </div>
            )}
          </div>
        )}
        {!urlPrefs.category && !error && (
          <div className="card empty"><h3>Start with a service type</h3><p>Choose a service and any preferences above, or describe what you need in your own words.</p></div>
        )}
        {searching && !result && <Skeletons rows={3} />}
        {result && (
          <>
            <div className="results-head">
              <div className="results-title">
              <h2 id="results-h">{result.total} {result.total === 1 ? "provider" : "providers"}{result.origin ? ` near ${result.origin.suburb}` : ""}</h2>
                {signedIn && <button type="button" className="btn sm" onClick={saveSearch}>Save search</button>}
              </div>
              <p className="small muted">Ranked by how many of your preferences are met, then by distance. “Not verified” is never counted as a match.{result.excluded_strict ? ` ${result.excluded_strict} hidden because they don't meet every preference.` : ""}</p>
            </div>
            {result.total === 0 && (
              <div className="card empty"><h3>No matching providers</h3><p>Try a larger distance, fewer preferences, or turn off “meet every preference”.</p></div>
            )}
            <div className="provider-list">
              {result.items.map((it) => (
                <ProviderCard key={it.provider.id} item={it}
                  selected={compare.includes(it.provider.id)} compareDisabled={compare.length >= 3}
                  onToggleCompare={signedIn ? () => setCompare((c) => (c.includes(it.provider.id) ? c.filter((x) => x !== it.provider.id) : [...c, it.provider.id])) : undefined}
                  onAddAppointment={signedIn ? () => setAddFor(it) : undefined} onBook={() => book(it.provider.id)} />
              ))}
            </div>
            {result.total > result.pageSize && (
              <nav className="pager" aria-label="Results pages">
                <button className="btn sm" disabled={page <= 1} onClick={() => run(urlPrefs, page - 1)}>Previous</button>
                <span className="small muted">Page {page} of {pages}</span>
                <button className="btn sm" disabled={page >= pages} onClick={() => run(urlPrefs, page + 1)}>Next</button>
              </nav>
            )}
          </>
        )}
      </section>

      {compare.length > 0 && (
        <div className="compare-tray" role="region" aria-label="Compare providers">
          <span><strong>{compare.length}</strong> selected {compare.length < 2 ? "· choose at least 2" : ""}{compare.length >= 3 ? "· maximum 3" : ""}</span>
          <div className="row">
            <button className="btn sm ghost" onClick={() => setCompare([])}>Clear</button>
            <button className="btn sm primary" disabled={compare.length < 2} onClick={() => nav(`/app/fit-finder/compare?ids=${compare.join(",")}&${prefsToQuery(urlPrefs)}`)}>Compare side by side</button>
          </div>
        </div>
      )}

      {addFor && (
        <AppointmentForm
          initial={{ practitioner_name: addFor.provider.name, service_type: CATEGORY_TO_SERVICE[addFor.provider.category.id], clinic_name: addFor.provider.clinic.name, location: addFor.provider.clinic.address ?? addFor.provider.clinic.suburb }}
          onClose={() => setAddFor(null)}
          onSaved={(a) => { setAddFor(null); notify("Added to your appointments — this is your own record, not a booking"); nav(`/app/appointments/${a.id}`); }} />
      )}
    </div>
  );
}
