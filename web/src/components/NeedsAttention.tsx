import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Modal } from "./ui";
import "./nudges.css";

type Kind = "overdue" | "due_soon" | "clarify" | "prepare" | "add_instructions";
type Severity = "high" | "medium" | "low";
export interface AttentionItem {
  id: string; kind: Kind; severity: Severity; title: string; detail: string;
  appointment_id: string; practitioner_name: string; clinic_name: string; starts_at: string;
  action: { label: string; href: string };
  task?: { id: string; title: string; source_text: string; deadline: string | null; due_date: string | null; needs_clarification: boolean; days_overdue: number | null; days_until_due: number | null };
}
interface AttentionData { items: AttentionItem[]; today: string; counts: Record<Severity, number> }

const KIND_LABEL: Record<Kind, string> = { overdue: "Overdue", due_soon: "Due soon", clarify: "Needs clarification", prepare: "Prepare now", add_instructions: "After your visit" };
const TONE: Record<Severity, string> = { high: "danger", medium: "warn", low: "info" };
const COLLAPSED = 4;

/** A polite, editable message built only from the task's own source text and the appointment record. No AI. */
export function clinicMessage(item: AttentionItem, userName?: string): string {
  const day = new Date(item.starts_at).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const source = (item.task?.source_text ?? "").trim().replace(/[.\s]+$/, "");
  return [
    `Hi ${item.clinic_name} team,`,
    "",
    `I had an appointment with ${item.practitioner_name} on ${day}. My instructions say: "${source}".`,
    "",
    "Could you please confirm exactly what I need to do for this, including any timing, where to go, and anything I need to bring or prepare?",
    "",
    "Thank you,",
    userName?.split(" ")[0] ?? "",
  ].join("\n").trimEnd();
}

function ClarifyModal({ item, onClose }: { item: AttentionItem; onClose: () => void }) {
  const { user, notify } = useApp();
  const id = useId();
  const [text, setText] = useState(() => clinicMessage(item, user?.name));
  const ref = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      notify("Message copied");
    } catch {
      ref.current?.select();
      const ok = document.execCommand?.("copy");
      notify(ok ? "Message copied" : "Select the text and copy it manually", ok ? "ok" : "error");
    }
  }

  return (
    <Modal title="Draft a message to the clinic" onClose={onClose}>
      <p className="small muted">
        Built only from your own instructions. Edit it as you like, then copy it into an email or the clinic's contact form, or read it out on the phone.
        CarePath doesn't send anything.
      </p>
      <label htmlFor={`${id}-msg`}>Your message</label>
      <textarea id={`${id}-msg`} ref={ref} rows={10} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ justifyContent: "flex-end", marginTop: ".75rem" }}>
        <button type="button" className="btn" onClick={onClose}>Close</button>
        <button type="button" className="btn primary" onClick={copy} disabled={!text.trim()}>Copy message</button>
      </div>
    </Modal>
  );
}

export function NeedsAttention() {
  const [data, setData] = useState<AttentionData | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [drafting, setDrafting] = useState<AttentionItem | null>(null);

  useEffect(() => { api.get<AttentionData>("/dashboard/attention").then(setData).catch(() => setError(true)); }, []);

  if (error || !data) return null; // the rest of the dashboard still works; this card is an extra
  if (!data.items.length) {
    return (
      <section className="panel attn attn-clear" aria-label="Needs attention">
        <span className="attn-ok" aria-hidden="true">✓</span>
        <div><b>Nothing needs your attention right now.</b> <span className="muted small">Overdue tasks, unprepared visits and missing after-visit notes will show up here.</span></div>
      </section>
    );
  }
  const shown = expanded ? data.items : data.items.slice(0, COLLAPSED);
  const urgent = data.counts.high;

  return (
    <section className="panel attn" aria-labelledby="attn-h">
      <div className="panel-head">
        <h2 id="attn-h">Needs attention</h2>
        <span className={`badge ${urgent ? "danger" : "warn"}`}>{urgent ? `${urgent} urgent` : `${data.items.length} to review`}</span>
      </div>
      <ul className="attn-list">
        {shown.map((item) => (
          <li key={item.id} className={`attn-item sev-${item.severity}`}>
            <div className="attn-body">
              <span className={`badge ${TONE[item.severity]}`}>{KIND_LABEL[item.kind]}</span>
              <div className="attn-title">{item.title}</div>
              <div className="attn-detail">{item.detail}</div>
              {item.task && item.task.source_text !== "Added manually" && <div className="attn-src">From your instructions: <q>{item.task.source_text}</q></div>}
            </div>
            <div className="attn-actions">
              <Link className={`btn sm ${item.severity === "high" ? "primary" : ""}`} to={item.action.href}>{item.action.label}</Link>
              {item.task?.needs_clarification && (
                <button type="button" className="btn sm" onClick={() => setDrafting(item)}>Draft a message to the clinic</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {data.items.length > COLLAPSED && (
        <button type="button" className="btn sm ghost attn-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer" : `Show all ${data.items.length}`}
        </button>
      )}
      {drafting && <ClarifyModal item={drafting} onClose={() => setDrafting(null)} />}
    </section>
  );
}
