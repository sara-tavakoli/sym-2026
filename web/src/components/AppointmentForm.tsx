import { useState, type FormEvent } from "react";
import { api, ApiError, toLocalInput, type Appointment } from "../lib/api";
import { Field, Modal, Spinner } from "./ui";

const SERVICES = ["General Practitioner (GP)", "Dentist", "Physiotherapy", "Psychology / Counselling", "Optometry", "Dermatology", "Specialist", "Pathology / Imaging", "Other"];

export function AppointmentForm({ existing, onSaved, onClose }: { existing?: Appointment; onSaved: (a: Appointment) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
      {error && <div className="alert error" role="alert">{error}</div>}
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="Date and time *" error={fieldErrors.when} full>
            <input name="when" type="datetime-local" required defaultValue={existing ? toLocalInput(existing.starts_at) : ""} aria-invalid={!!fieldErrors.when} />
          </Field>
          <Field label="Practitioner name *" error={fieldErrors.practitioner_name}>
            <input name="practitioner_name" required maxLength={120} placeholder="e.g. Dr Example" defaultValue={existing?.practitioner_name} aria-invalid={!!fieldErrors.practitioner_name} />
          </Field>
          <Field label="Service type *" error={fieldErrors.service_type}>
            <select name="service_type" required defaultValue={existing?.service_type ?? SERVICES[0]}>
              {existing && !SERVICES.includes(existing.service_type) && <option>{existing.service_type}</option>}
              {SERVICES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Clinic name *" error={fieldErrors.clinic_name}>
            <input name="clinic_name" required maxLength={120} placeholder="e.g. Campus Health Clinic" defaultValue={existing?.clinic_name} aria-invalid={!!fieldErrors.clinic_name} />
          </Field>
          <Field label="Location (optional)">
            <input name="location" maxLength={200} placeholder="Address or suburb" defaultValue={existing?.location ?? ""} />
          </Field>
          <Field label="Purpose (optional)" hint="A short reason, e.g. “Routine check-up”" full>
            <input name="purpose" maxLength={500} defaultValue={existing?.purpose ?? ""} />
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
