import { useEffect, useState } from "react";
import { api, fmtDateTime } from "../lib/api";
import type { ClinicianPlan } from "../lib/shares";
import "../shares.css";

/** After-visit plans sent back by a clinician through a share link. Pending plans can be turned into a checklist. */
export function ClinicianPlans({ appointmentId, reloadKey, activeId, onUse }:
  { appointmentId: string; reloadKey: number; activeId?: string; onUse: (p: ClinicianPlan) => void }) {
  const [plans, setPlans] = useState<ClinicianPlan[]>([]);

  useEffect(() => {
    api.get<{ plans: ClinicianPlan[] }>(`/appointments/${appointmentId}/clinician-plans`).then((r) => setPlans(r.plans)).catch(() => setPlans([]));
  }, [appointmentId, reloadKey]);

  if (!plans.length) return null;
  const pending = plans.filter((p) => !p.imported_at);
  const done = plans.filter((p) => p.imported_at);

  return (
    <div className="stack plans">
      {pending.map((p) => (
        <div className="plan" key={p.id}>
          <div className="row between">
            <h3 style={{ margin: 0 }}>New after-visit plan from {p.author}</h3>
            <span className="badge info">From your clinician</span>
          </div>
          <p className="small muted" style={{ margin: ".15rem 0 .6rem" }}>Sent {fmtDateTime(p.created_at)} via your share link</p>
          <blockquote className="plan-text">{p.text}</blockquote>
          <div className="row">
            <button className="btn primary" onClick={() => onUse(p)} disabled={activeId === p.id}>{activeId === p.id ? "Added below: review and extract" : "Turn into checklist"}</button>
          </div>
        </div>
      ))}
      {done.length > 0 && (
        <details className="plan-history">
          <summary>{done.length} earlier plan{done.length > 1 ? "s" : ""} already turned into a checklist</summary>
          {done.map((p) => (
            <div key={p.id} className="plan-old">
              <div className="small muted">{p.author} · {fmtDateTime(p.created_at)}</div>
              <div className="plan-text">{p.text}</div>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
