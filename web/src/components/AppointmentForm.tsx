import { useState, type FormEvent } from "react";
import { api, ApiError, toLocalInput, type Appointment } from "../lib/api";
import { Field, Modal, Spinner } from "./ui";
import { ImportBooking } from "./ImportBooking";
import { sourceHint, type ImportFieldKey, type ImportResult } from "../lib/booking-import";

const SERVICES = ["General Practitioner (GP)", "Dentist", "Physiotherapy", "Psychology / Counselling", "Optometry", "Dermatology", "Specialist", "Pathology / Imaging", "Other"];

export function AppointmentForm({ existing, onSaved, onClose, startWithImport }: { existing?: Appointment; onSaved: (a: Appointment) => void; onClose: () => void; startWithImport?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Imported values only pre-fill the (uncontrolled) form; re-keying the form applies them. Nothing is saved until submit.
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [formKey, setFormKey] = useState(0);
  const pv = (k: ImportFieldKey) => imported?.fields[k].value ?? undefined;
  const hint = (k: ImportFieldKey) => sourceHint(imported?.fields[k], k);
  const importedService = pv("service_type");
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const when = String(f.get("when") ?? "");
    const payload = {
      starts_at: when ? new Date(when).toISOString() : "",
      practitioner_name: f.get("practitioner_name"),
      service_type: f.get("service_type"),
      clinic_name: f.get("clinic_name"),
      location: f.get("location"),
      purpose: f.get("purpose"),
    };
    setBusy(true); setError(""); setFieldErrors({});
    try {
      const saved = existing ? await api.put<Appointment>(`/appointments/${existing.id}`, payload) : await api.post<Appointment>("/appointments", payload);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(Object.fromEntries(err.fields.map((x) => [x.path === "starts_at" ? "when" : x.path, x.message])));
      } else setError("Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <Modal title={existing ? "Edit appointment" : "New appointment"} onClose={onClose}>
      <p className="muted small">This is your own record of an appointment. CarePath does not book appointments with providers.</p>
      {!existing && <ImportBooking defaultOpen={startWithImport} onParsed={(r) => { setImported(r); setFieldErrors({}); setFormKey((k) => k + 1); }} />}
      {error && <div className="alert error" role="alert">{error}</div>}
      <form key={formKey} onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="Date and time *" error={fieldErrors.when} full
            hint={pv("starts_at") && imported && deviceTz !== imported.timezone ? `${hint("starts_at")} · Shown in your device's time zone (${deviceTz}).` : hint("starts_at")}>
            <input name="when" type="datetime-local" required defaultValue={existing ? toLocalInput(existing.starts_at) : pv("starts_at") ? toLocalInput(pv("starts_at")!) : ""} aria-invalid={!!fieldErrors.when} />
          </Field>
          <Field label="Practitioner name *" error={fieldErrors.practitioner_name} hint={hint("practitioner_name")}>
            <input name="practitioner_name" required maxLength={120} placeholder="e.g. Dr Example" defaultValue={existing?.practitioner_name ?? pv("practitioner_name")} aria-invalid={!!fieldErrors.practitioner_name} />
          </Field>
          <Field label="Service type *" error={fieldErrors.service_type} hint={hint("service_type")}>
            <select name="service_type" required defaultValue={existing?.service_type ?? importedService ?? SERVICES[0]}>
              {existing && !SERVICES.includes(existing.service_type) && <option>{existing.service_type}</option>}
              {!existing && importedService && !SERVICES.includes(importedService) && <option>{importedService}</option>}
              {SERVICES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Clinic name *" error={fieldErrors.clinic_name} hint={hint("clinic_name")}>
            <input name="clinic_name" required maxLength={120} placeholder="e.g. Campus Health Clinic" defaultValue={existing?.clinic_name ?? pv("clinic_name")} aria-invalid={!!fieldErrors.clinic_name} />
          </Field>
          <Field label="Location (optional)" hint={hint("location")}>
            <input name="location" maxLength={200} placeholder="Address or suburb" defaultValue={existing?.location ?? pv("location")?.slice(0, 200) ?? ""} />
          </Field>
          <Field label="Purpose (optional)" hint={hint("purpose") ?? "A short reason, e.g. “Routine check-up”"} full>
            <input name="purpose" maxLength={500} defaultValue={existing?.purpose ?? pv("purpose") ?? ""} />
          </Field>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy && <Spinner />} {existing ? "Save changes" : "Create appointment"}</button>
        </div>
      </form>
    </Modal>
  );
}
