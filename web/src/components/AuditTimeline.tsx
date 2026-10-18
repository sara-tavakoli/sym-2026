import { useState } from "react";
import { fmtDateTime } from "../lib/api";
import type { EventActor, ShareEvent } from "../lib/shares";

const ACTOR: Record<EventActor, { mark: string; label: string }> = {
  patient: { mark: "P", label: "Patient" },
  clinician: { mark: "C", label: "Clinician" },
  ai: { mark: "AI", label: "AI" },
  system: { mark: "R", label: "Rules" },
};

/** Who did what, and when, on a shared appointment: every AI or rules step and every human approval. */
export function AuditTimeline({ events, title = "Audit timeline", lede, compact = false, limit }: {
  events: ShareEvent[]; title?: string; lede?: string; compact?: boolean; limit?: number;
}) {
  const [all, setAll] = useState(false);
  const newestFirst = [...events].reverse();
  const shown = limit && !all ? newestFirst.slice(0, limit) : newestFirst;
  const Heading = compact ? "h3" : "h2";
  return (
    <div className={`timeline ${compact ? "compact" : ""}`}>
      <Heading className="timeline-h">{title}</Heading>
      {lede && <p className="small muted timeline-lede">{lede}</p>}
      {events.length === 0 ? <p className="small muted">Nothing recorded yet.</p> : (
        <ol className="timeline-list">
          {shown.map((e) => {
            const a = ACTOR[e.actor];
            return (
              <li key={e.id} className={`timeline-item actor-${e.actor}`}>
                <span className="timeline-mark" aria-hidden="true">{a.mark}</span>
                <div className="timeline-body">
                  <div className="timeline-msg">{e.message}</div>
                  <div className="timeline-meta">{a.label} · <time dateTime={e.created_at}>{fmtDateTime(e.created_at)}</time></div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {limit && events.length > limit && (
        <button className="btn sm ghost" onClick={() => setAll(!all)} aria-expanded={all}>{all ? "Show fewer" : `Show all ${events.length}`}</button>
      )}
    </div>
  );
}
