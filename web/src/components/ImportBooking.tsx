import { useId, useState, type ChangeEvent } from "react";
import { api, ApiError } from "../lib/api";
import { IMPORT_LABELS, SAMPLES, type ImportFieldKey, type ImportResult } from "../lib/booking-import";
import { Spinner } from "./ui";
import "./nudges.css";

const MAX_FILE_BYTES = 90_000;

/** Paste a booking confirmation (or pick a .ics file) to pre-fill the appointment form. Nothing is saved here. */
export function ImportBooking({ defaultOpen, onParsed }: { defaultOpen?: boolean; onParsed: (r: ImportResult) => void }) {
  const id = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function parse(input = text) {
    if (!input.trim()) { setError("Paste your booking confirmation or choose a calendar file first."); return; }
    setBusy(true); setError("");
    try {
      const r = await api.post<ImportResult>("/appointments/import/parse", { text: input });
      setResult(r);
      onParsed(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not read that confirmation. Please try again.");
    } finally { setBusy(false); }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setError("That file is too large for a single booking. Choose the .ics file for one appointment."); return; }
    const content = await file.text();
    if (!/BEGIN:VEVENT/i.test(content) && !/\.(txt|eml)$/i.test(file.name)) { setError("That doesn't look like a calendar (.ics) file."); return; }
    setText(content);
    await parse(content);
  }

  const keys = Object.keys(IMPORT_LABELS) as ImportFieldKey[];
  const filled = result ? keys.filter((k) => result.fields[k].value) : [];
  const missing = result ? keys.filter((k) => !result.fields[k].value && ["starts_at", "practitioner_name", "service_type", "clinic_name"].includes(k)) : [];

  return (
    <details className="import-panel" open={defaultOpen}>
      <summary>Import from a booking confirmation</summary>
      <p className="small muted">
        Paste your booking confirmation (e.g. from HotDoc), or choose the calendar (.ics) file you added to your calendar.
        We'll fill in the form below for you to check. Nothing is saved until you press Create. CarePath isn't affiliated with any booking service.
      </p>
      <div className="import-samples" role="group" aria-label="Try a fictional sample">
        <span className="small muted">Try a fictional sample:</span>
        {SAMPLES.map((s) => (
          <button key={s.id} type="button" className="btn sm" onClick={() => { const t = s.text(); setText(t); setResult(null); setError(""); }}>{s.label}</button>
        ))}
      </div>
      <label htmlFor={`${id}-text`}>Paste your booking confirmation (e.g. from HotDoc)</label>
      <textarea id={`${id}-text`} rows={6} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={"e.g. Your appointment with Dr … at … is confirmed.\nWhen: Thursday, 22 October 2026 at 10:15am"} />
      <div className="import-row">
        <div className="import-file">
          <label htmlFor={`${id}-file`} className="small">Or choose a calendar file (.ics)</label>
          <input id={`${id}-file`} type="file" accept=".ics,text/calendar" onChange={onFile} />
          <a className="small" href="/samples/sample-booking.ics" download>Download a fictional sample .ics</a>
        </div>
        <button type="button" className="btn primary" disabled={busy || !text.trim()} onClick={() => parse()}>{busy && <Spinner />} Fill in the form</button>
      </div>
      {error && <div className="alert error" role="alert" style={{ marginTop: ".75rem" }}>{error}</div>}
      {result && (
        <div className={`alert ${missing.length ? "warn" : "info"}`} role="status" style={{ marginTop: ".75rem", marginBottom: 0 }}>
          {filled.length
            ? <>Filled {filled.length} of {keys.length} fields from your {result.format === "ics" ? "calendar file" : "confirmation"}. Each one shows the text it came from: please check them below, then save.</>
            : <>We couldn't find appointment details in that text. Please fill in the form yourself.</>}
          {missing.length > 0 && filled.length > 0 && <> Not found: {missing.map((k) => IMPORT_LABELS[k].toLowerCase()).join(", ")}.</>}
          {result.warnings.map((w) => <div key={w} className="small">{w}</div>)}
        </div>
      )}
    </details>
  );
}
