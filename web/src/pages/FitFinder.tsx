import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../fit-finder.css";
import {
  ACCESS_LABELS, api, ApiError, DAY_LABELS, prefsToQuery, queryToPrefs,
  type AccessFeature, type Day, type Evaluated, type ExtractedPrefs, type FitMeta, type Prefs, type SavedSearch, type SearchResult,
} from "../lib/api";
import { useApp } from "../lib/app-context";
import { CompareTable, ResultCard } from "../components/FitFinderParts";
import { Skeletons, Spinner } from "../components/ui";
import { cleanPrefs, DEFAULT_PREFS, describePrefs, EXAMPLES, FIELD_NAMES, LANGUAGE_SUGGESTIONS, SERVICE_FOR_CATEGORY } from "../lib/fit-finder";

const PAGE_SIZE = 6;
const TIME_OPTIONS = [["morning", "Morning (6 am–12 pm)"], ["afternoon", "Afternoon (12–5 pm)"], ["evening", "Evening (5–9 pm)"]] as const;

export default function FitFinder() {
  const { notify } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const qs = params.toString();
  const urlPrefs = useMemo(() => queryToPrefs(new URLSearchParams(qs)), [qs]);
  const prefsKey = prefsToQuery(cleanPrefs(urlPrefs));
  const page = Math.max(1, Number(params.get("page")) || 1);
  const fromAssistant = params.get("from") === "assistant";

  const [meta, setMeta] = useState<FitMeta | null>(null);
  const [metaError, setMetaError] = useState("");
  const [form, setForm] = useState<Prefs>({ ...DEFAULT_PREFS, ...urlPrefs });
  const [formError, setFormError] = useState("");

  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<{ message: string; unknownLocation: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);
  const scrollOnResult = useRef(false);
  const resultsRef = useRef<HTMLElement>(null);
  const compareRef = useRef<HTMLElement>(null);

  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedPrefs | null>(null);
  const [extractError, setExtractError] = useState("");

  const [saved, setSaved] = useState<SavedSearch[] | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<{ id: string; name: string }[]>([]);
  const [compare, setCompare] = useState<Evaluated[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState("");

  const loadMeta = useCallback(() => { setMetaError(""); api.get<FitMeta>("/fit-finder/meta").then(setMeta).catch((e) => setMetaError(e.message)); }, []);
  const loadSaved = useCallback(() => { api.get<{ items: SavedSearch[] }>("/fit-finder/saved").then((r) => setSaved(r.items)).catch(() => setSaved([])); }, []);
  useEffect(() => { loadMeta(); loadSaved(); }, [loadMeta, loadSaved]);

  // The URL is the source of truth for the executed search (shareable, back/forward, assistant hand-off).
  useEffect(() => { setForm({ ...DEFAULT_PREFS, ...urlPrefs }); }, [urlPrefs]);
  useEffect(() => { setSelected([]); setCompare(null); setCompareError(""); }, [prefsKey]);
  useEffect(() => {
    if (!urlPrefs.category) { setResult(null); setSearchError(null); return; }
    let live = true;
    setSearching(true); setSearchError(null);
    api.get<SearchResult>(`/fit-finder/search?${prefsKey}&page=${page}&pageSize=${PAGE_SIZE}`)
      .then((r) => { if (live) setResult(r); })
      .catch((e) => { if (live) { setResult(null); setSearchError({ message: e.message, unknownLocation: e instanceof ApiError && e.status === 422 }); } })
      .finally(() => {
        if (!live) return;
        setSearching(false);
        if (scrollOnResult.current) { scrollOnResult.current = false; requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }
      });
    return () => { live = false; };
  }, [prefsKey, page, nonce, urlPrefs.category]);

  const catName = (id: string) => meta?.categories.find((c) => c.id === id)?.name ?? id;
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => { setForm((f) => ({ ...f, [k]: v })); setFormError(""); };
  const toggle = <T extends string>(list: T[] | undefined, v: T) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]);

  function runSearch(p: Prefs) {
    if (!p.category) { setFormError("Choose a service type to search."); document.getElementById("ff-category")?.focus(); return; }
    const next = prefsToQuery(cleanPrefs(p));
    scrollOnResult.current = true;
    if (next === qs) setNonce((n) => n + 1);
    else setParams(next);
  }
  const submit = (e: FormEvent) => { e.preventDefault(); runSearch(form); };
  const goPage = (n: number) => { const q = new URLSearchParams(prefsKey); if (n > 1) q.set("page", String(n)); scrollOnResult.current = true; setParams(q); };

  async function extract(input = text) {
    const t = input.trim();
    if (t.length < 3) { setExtractError("Describe what you're looking for in a few words."); return; }
    setExtracting(true); setExtractError(""); setExtracted(null);
    try {
      const r = await api.post<ExtractedPrefs>("/fit-finder/extract", { text: t });
      setExtracted(r);
      const next = cleanPrefs({ ...DEFAULT_PREFS, category: form.category, radius_km: form.radius_km, ...r.prefs });
      setForm(next);
      if (next.category && r.location_known !== false && r.evidence.length) runSearch(next);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setExtractError(status === 503 ? "AI reading isn't available right now. Fill in the form below instead; search works without AI."
        : status === 429 ? "Too many requests just now. Wait a moment, or use the form below."
        : (e as Error).message);
    } finally { setExtracting(false); }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.category) { setFormError("Choose a service type before saving."); return; }
    const name = saveName.trim() || describePrefs(cleanPrefs(form), catName(form.category)).slice(0, 80);
    setSaving(true);
    try {
      await api.post("/fit-finder/saved", { name, prefs: cleanPrefs(form) });
      setSaveName(""); notify("Search saved"); loadSaved();
    } catch (err) { notify((err as Error).message, "error"); } finally { setSaving(false); }
  }
  async function removeSaved(s: SavedSearch) {
    try { await api.del(`/fit-finder/saved/${s.id}`); notify("Saved search deleted"); loadSaved(); } catch (err) { notify((err as Error).message, "error"); }
  }

  function toggleSelect(e: Evaluated) {
    setSelected((s) => (s.some((x) => x.id === e.provider.id) ? s.filter((x) => x.id !== e.provider.id) : s.length >= 3 ? s : [...s, { id: e.provider.id, name: e.provider.name }]));
  }
  async function runCompare() {
    setComparing(true); setCompareError("");
    try {
      const r = await api.get<{ items: Evaluated[] }>(`/fit-finder/compare?ids=${selected.map((s) => encodeURIComponent(s.id)).join(",")}&${prefsKey}`);
      setCompare(r.items);
      requestAnimationFrame(() => compareRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) { setCompareError((e as Error).message); } finally { setComparing(false); }
  }

  function addToAppointments(e: Evaluated) {
    const p = e.provider;
    const q = new URLSearchParams({ new: "1", practitioner: p.name, clinic: p.clinic.name, service: SERVICE_FOR_CATEGORY[p.category.id] ?? "Other", location: p.clinic.address ?? `${p.clinic.suburb} ${p.clinic.state} ${p.clinic.postcode}` });
    navigate(`/app/appointments?${q}`);
  }

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const telehealth = form.mode === "telehealth";

  return (
    <div className="fade-in ff">
      <div className="page-head">
        <div>
          <h1>Appointment Fit Finder</h1>
          <p className="muted">Compare clinics by location, hours, accessibility, billing and practitioner, with reasons for every match and clear flags on anything that isn't verified.</p>
        </div>
      </div>

      <div className="alert warn ff-notice" role="note">
        <strong>Demonstration data.</strong> {meta?.notice ?? "All providers are fictional. Opening hours are published hours, not appointment availability."} Nothing here books an appointment.
      </div>
      {fromAssistant && <div className="alert info">Preferences from the AI Assistant are filled in below. Check them, then search.</div>}
      {metaError && <div className="alert error" role="alert">{metaError} <button className="btn sm" onClick={loadMeta}>Retry</button></div>}

      <section className="card ff-describe" aria-labelledby="ff-describe-h">
        <div className="card-head"><h2 id="ff-describe-h">Describe what you need</h2><span className="badge info">AI reads your request</span></div>
        <form onSubmit={(e) => { e.preventDefault(); extract(); }}>
          <label htmlFor="ff-text" className="sr-only">Describe what you need</label>
          <textarea id="ff-text" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)}
            placeholder="e.g. A bulk-billing GP near Ryde, open Saturday morning, who speaks Hindi"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); extract(); } }} />
          <div className="ff-describe-foot">
            <div className="assistant-chips" aria-label="Examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="assistant-chip" disabled={extracting} onClick={() => { setText(ex); extract(ex); }}>{ex}</button>
              ))}
            </div>
            <button className="btn primary" disabled={extracting}>{extracting && <Spinner />} Fill in preferences</button>
          </div>
        </form>
        <p className="small muted ff-mt">The AI only fills in the form from words you wrote; it never picks a service from symptoms. Matching and ranking are done by fixed rules, not AI.</p>
        {extractError && <div className="alert warn" role="alert">{extractError}</div>}
        {extracted && (
          <div className="ff-understood" role="status">
            {extracted.evidence.length ? (
              <>
                <strong>Understood:</strong>
                <ul>
                  {extracted.evidence.map((ev, i) => <li key={i}><span className="badge ok">{FIELD_NAMES[ev.field] ?? ev.field}: {ev.field === "category" ? catName(ev.value) : ev.value}</span> <q className="small muted">{ev.quote}</q></li>)}
                </ul>
              </>
            ) : <p className="ff-m0">Couldn't pick out any preferences from that. Try naming the service, a suburb or a day, or use the form.</p>}
            {extracted.location_known === false && <p className="ff-m0 ff-warn-text">"{extracted.prefs.location}" isn't in the demo coverage area. Choose a suburb from the list below.</p>}
            {extracted.location_resolved && <p className="ff-m0 small muted">Location: {extracted.location_resolved}</p>}
            {!extracted.prefs.category && !form.category && extracted.evidence.length > 0 && <p className="ff-m0 ff-warn-text">Choose a service type below to search.</p>}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="ff-prefs-h">
        <div className="card-head"><h2 id="ff-prefs-h">Your preferences</h2>
          <button type="button" className="btn sm ghost" onClick={() => { setForm({ ...DEFAULT_PREFS }); setExtracted(null); setFormError(""); }}>Clear</button>
        </div>
        {!meta && !metaError ? <Skeletons rows={4} /> : (
          <form onSubmit={submit} noValidate>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="ff-category">Service type *</label>
                <select id="ff-category" value={form.category} onChange={(e) => set("category", e.target.value)} aria-invalid={!!formError && !form.category} required>
                  <option value="">Choose a service…</option>
                  {meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {formError && <div className="err" role="alert">{formError}</div>}
              </div>
              <div className="field">
                <span className="ff-label" id="ff-mode-l">Appointment type</span>
                <div className="ff-seg" role="radiogroup" aria-labelledby="ff-mode-l">
                  {([["", "Either"], ["in_person", "In person"], ["telehealth", "Telehealth"]] as const).map(([v, l]) => (
                    <label key={v} className={(form.mode ?? "") === v ? "on" : ""}>
                      <input type="radio" name="ff-mode" value={v} checked={(form.mode ?? "") === v} onChange={() => set("mode", (v || undefined) as Prefs["mode"])} />{l}
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="ff-location">Suburb or postcode</label>
                <input id="ff-location" list="ff-locations" value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Macquarie Park or 2113" autoComplete="off" />
                <datalist id="ff-locations">
                  {meta?.locations.map((l) => <option key={l.postcode + l.suburb} value={l.suburb}>{l.state} {l.postcode}</option>)}
                </datalist>
                <div className="hint">Demo covers {meta?.locations.length ?? 15} Sydney suburbs. Leave blank to search everywhere.</div>
              </div>
              <div className="field">
                <label htmlFor="ff-radius">Distance</label>
                <select id="ff-radius" value={form.radius_km ?? 10} disabled={telehealth} onChange={(e) => set("radius_km", Number(e.target.value))}>
                  {(meta?.radii ?? [2, 5, 10, 20, 50]).map((r) => <option key={r} value={r}>Within {r} km</option>)}
                </select>
                <div className="hint">{telehealth ? "Telehealth isn't limited by distance." : "Straight-line distance from your suburb."}</div>
              </div>
              <fieldset className="field full ff-fieldset">
                <legend className="ff-label">Days you can attend</legend>
                <div className="ff-toggles">
                  {(meta?.days ?? (Object.keys(DAY_LABELS) as Day[])).map((d) => (
                    <label key={d} className={form.days?.includes(d) ? "on" : ""}>
                      <input type="checkbox" checked={!!form.days?.includes(d)} onChange={() => set("days", toggle(form.days, d))} />{DAY_LABELS[d]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="field">
                <label htmlFor="ff-time">Time of day</label>
                <select id="ff-time" value={form.time ?? ""} onChange={(e) => set("time", (e.target.value || undefined) as Prefs["time"])}>
                  <option value="">Any time</option>
                  {TIME_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ff-gender">Practitioner gender</label>
                <select id="ff-gender" value={form.practitioner_gender ?? ""} onChange={(e) => set("practitioner_gender", (e.target.value || undefined) as Prefs["practitioner_gender"])}>
                  <option value="">No preference</option><option value="female">Female</option><option value="male">Male</option>
                </select>
              </div>
              <fieldset className="field full ff-fieldset">
                <legend className="ff-label">Accessibility needs</legend>
                <div className="ff-toggles">
                  {(meta?.accessibility ?? (Object.keys(ACCESS_LABELS) as AccessFeature[])).map((a) => (
                    <label key={a} className={form.accessibility?.includes(a) ? "on" : ""}>
                      <input type="checkbox" checked={!!form.accessibility?.includes(a)} onChange={() => set("accessibility", toggle(form.accessibility, a))} />{ACCESS_LABELS[a]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="field">
                <label htmlFor="ff-language">Language spoken</label>
                <input id="ff-language" list="ff-languages" maxLength={40} value={form.language ?? ""} onChange={(e) => set("language", e.target.value)} placeholder="Any language" autoComplete="off" />
                <datalist id="ff-languages">{LANGUAGE_SUGGESTIONS.map((l) => <option key={l} value={l} />)}</datalist>
              </div>
              <div className="field ff-checks-col">
                <span className="ff-label">Billing and filtering</span>
                <label className="ff-check"><input type="checkbox" checked={!!form.bulk_billing} onChange={(e) => set("bulk_billing", e.target.checked)} /> Bulk billing</label>
                <label className="ff-check"><input type="checkbox" checked={!!form.strict} onChange={(e) => set("strict", e.target.checked)} /> Hide options that clearly don't meet a preference</label>
              </div>
            </div>
            <div className="row ff-form-actions">
              <button className="btn primary" disabled={searching}>{searching && <Spinner />} Find matching clinics</button>
              <span className="small muted">Unverified details are never counted as a match.</span>
            </div>
          </form>
        )}

        <div className="ff-saved">
          <h3>Saved searches</h3>
          <form className="ff-save-row" onSubmit={save}>
            <label htmlFor="ff-save-name" className="sr-only">Name for this search</label>
            <input id="ff-save-name" maxLength={80} value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={form.category ? "Name, e.g. Weekend GP for Mum" : "Choose a service type first"} />
            <button className="btn" disabled={saving || !form.category}>{saving && <Spinner />} Save current preferences</button>
          </form>
          {saved === null ? <Skeletons rows={1} /> : saved.length === 0 ? <p className="small muted ff-m0">No saved searches yet.</p> : (
            <ul className="ff-saved-list">
              {saved.map((s) => (
                <li key={s.id}>
                  <div className="ff-saved-text"><strong>{s.name}</strong><span className="small muted">{describePrefs(s.prefs, catName(s.prefs.category))}</span></div>
                  <div className="row ff-saved-btns">
                    <button type="button" className="btn sm" onClick={() => runSearch({ ...DEFAULT_PREFS, ...s.prefs })} aria-label={`Run saved search ${s.name}`}>Run</button>
                    <button type="button" className="btn sm ghost danger" onClick={() => removeSaved(s)} aria-label={`Delete saved search ${s.name}`}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {compare && (
        <section className="card ff-compare-card" ref={compareRef} aria-labelledby="ff-compare-h" tabIndex={-1}>
          <div className="card-head"><h2 id="ff-compare-h">Side-by-side comparison</h2><button className="btn sm ghost" onClick={() => setCompare(null)}>Close</button></div>
          <p className="small muted">Each row is one of your preferences. “Not verified” means the directory has no confirmed information: check with the clinic.</p>
          <CompareTable items={compare} />
        </section>
      )}

      <section ref={resultsRef} className="ff-results" aria-labelledby="ff-results-h" aria-busy={searching}>
        <h2 id="ff-results-h" className={urlPrefs.category ? "" : "sr-only"}>Ranked shortlist</h2>
        {searchError && (
          <div className={`alert ${searchError.unknownLocation ? "warn" : "error"}`} role="alert">
            {searchError.message}
            {searchError.unknownLocation && meta && (
              <div className="assistant-chips ff-mt">
                {meta.locations.map((l) => <button key={l.suburb} type="button" className="assistant-chip" onClick={() => runSearch({ ...form, location: l.suburb })}>{l.suburb} {l.postcode}</button>)}
              </div>
            )}
          </div>
        )}
        {!urlPrefs.category && !searchError && (
          <div className="card empty">
            <h3>Your shortlist will appear here</h3>
            <p>Describe what you need above, or choose a service type and press “Find matching clinics”.</p>
          </div>
        )}
        {urlPrefs.category && searching && !result && <Skeletons rows={3} />}
        {result && (
          <>
            <div className="ff-results-head">
              <p className="ff-m0"><strong>{result.total} {result.total === 1 ? "option" : "options"}</strong> for {describePrefs(result.prefs, catName(result.prefs.category))}{result.origin && result.prefs.mode !== "telehealth" ? ` (${result.origin.suburb} ${result.origin.postcode})` : ""}</p>
              <p className="small muted ff-m0">Ranked by most preferences met, then partly met, then fewest unmet, then distance. Opening hours are published hours, not appointment availability.</p>
              {result.excluded_strict > 0 && <p className="small ff-m0">{result.excluded_strict} option{result.excluded_strict > 1 ? "s" : ""} hidden because they clearly don't meet a preference. <button className="btn sm ghost" onClick={() => runSearch({ ...form, strict: false })}>Show all</button></p>}
            </div>
            {result.items.length === 0 ? (
              <div className="card empty">
                <h3>No clinics match yet</h3>
                <p>Try a larger distance, fewer days, or turn off “Hide options that clearly don't meet a preference”.</p>
              </div>
            ) : (
              <ol className={`ff-list ${searching ? "loading" : ""}`}>
                {result.items.map((e, i) => (
                  <li key={e.provider.id}>
                    <ResultCard e={e} rank={(result.page - 1) * result.pageSize + i + 1}
                      selected={selected.some((s) => s.id === e.provider.id)} canSelect={selected.length < 3}
                      onToggle={() => toggleSelect(e)} onAdd={() => addToAppointments(e)} />
                  </li>
                ))}
              </ol>
            )}
            {result.total > result.pageSize && (
              <nav className="pager" aria-label="Pagination">
                <button className="btn sm" disabled={page <= 1 || searching} onClick={() => goPage(page - 1)}>Previous</button>
                <span className="small muted">Page {page} of {pages}</span>
                <button className="btn sm" disabled={page >= pages || searching} onClick={() => goPage(page + 1)}>Next</button>
              </nav>
            )}
          </>
        )}
      </section>

      {selected.length > 0 && (
        <div className="sticky-actions ff-comparebar" role="region" aria-label="Compare selection">
          <div className="ff-comparebar-text">
            <strong>{selected.length} selected</strong>
            <span className="small muted">{selected.map((s) => s.name).join(", ")}{selected.length < 2 ? " · choose at least 2" : selected.length === 3 ? " · maximum 3" : ""}</span>
            {compareError && <span className="small ff-warn-text" role="alert">{compareError}</span>}
          </div>
          <div className="row">
            <button className="btn sm ghost" onClick={() => setSelected([])}>Clear</button>
            <button className="btn sm primary" disabled={selected.length < 2 || comparing} onClick={runCompare}>{comparing && <Spinner />} Compare {selected.length}</button>
          </div>
        </div>
      )}
    </div>
  );
}
