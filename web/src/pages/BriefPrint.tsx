import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, fmtDateTime, SECTION_KEYS, SECTION_TITLES, type Appointment, type Brief } from "../lib/api";
import { Skeletons } from "../components/ui";

export default function BriefPrint() {
  const { id } = useParams();
  const [appt, setAppt] = useState<Appointment | null>(null);
  const [brief, setBrief] = useState<Brief | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get<Appointment>(`/appointments/${id}`), api.get<{ brief: Brief | null }>(`/appointments/${id}/prep`)])
      .then(([a, p]) => { setAppt(a); setBrief(p.brief); })
      .catch((e: ApiError) => setError(e.message));
  }, [id]);

  if (error) return <div className="alert error">{error}</div>;
  if (!appt || brief === undefined) return <Skeletons rows={3} />;
  if (!brief) return <div className="card empty"><h3>No brief yet</h3><Link className="btn primary" to={`/app/appointments/${id}/prepare`}>Prepare a brief</Link></div>;

  return (
    <div className="stack fade-in">
      <div className="row between no-print">
        <Link to={`/app/appointments/${id}/prepare`} className="back-link">← Back to editing</Link>
        <button className="btn primary" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      {brief.status !== "confirmed" && <div className="alert warn no-print">This brief is still a draft. Confirm it before taking it to your appointment.</div>}

      <article className="sheet">
        <header>
          <p className="sheet-kicker">CarePath AI · Appointment brief {brief.status !== "confirmed" && "(DRAFT)"}</p>
          <h1>{appt.practitioner_name}</h1>
          <p className="muted">{appt.service_type} · {appt.clinic_name} · {fmtDateTime(appt.starts_at)}</p>
        </header>
        {SECTION_KEYS.map((s) => brief.sections[s].length > 0 && (
          <section key={s}>
            <h2>{SECTION_TITLES[s]}</h2>
            {s === "timeline" || s === "questions" ? (
              <ol>{brief.sections[s].map((p) => <li key={p.id}>{p.text}</li>)}</ol>
            ) : (
              <ul>{brief.sections[s].map((p) => <li key={p.id}>{p.text}</li>)}</ul>
            )}
          </section>
        ))}
        <footer>Prepared by the patient using CarePath, an organisational tool — not a medical record or medical advice. Content is the patient's own words, organised by software and reviewed by the patient.</footer>
      </article>
    </div>
  );
}
