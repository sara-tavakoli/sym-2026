import type { ReactNode } from "react";
import { diffWords } from "../lib/diff";
import { KIND_LABELS, NOTE_KEYS, NOTE_LABELS, type ConsultInstruction, type ConsultNotes } from "../lib/shares";

function Inline({ before, after }: { before: string; after: string }) {
  return (
    <p className="ba-text">
      {diffWords(before, after).map((p, i) =>
        p.type === "same" ? <span key={i}>{p.text}</span>
          : p.type === "del" ? <del key={i}>{p.text}</del>
            : <ins key={i}>{p.text}</ins>)}
    </p>
  );
}

function Row({ label, changed, tag, children }: { label: string; changed: boolean; tag?: string; children: ReactNode }) {
  return (
    <div className={`ba-row ${changed ? "changed" : ""}`}>
      <div className="ba-row-head">
        <span className="ba-label">{label}</span>
        <span className={`badge ${changed ? "warn" : ""}`}>{tag ?? (changed ? "Edited by clinician" : "Unchanged from draft")}</span>
      </div>
      {children}
    </div>
  );
}

export function countChanges(draftNotes: ConsultNotes, notes: ConsultNotes, draftIns: ConsultInstruction[], ins: ConsultInstruction[]): number {
  const byId = new Map(draftIns.map((i) => [i.id, i]));
  const ids = new Set(ins.map((i) => i.id));
  return NOTE_KEYS.filter((k) => draftNotes[k] !== notes[k]).length
    + ins.filter((i) => byId.get(i.id)?.text !== i.text).length
    + draftIns.filter((i) => !ids.has(i.id)).length;
}

/** Word diff between the untouched draft (AI or rules) and what the clinician approved, so every change is visible. */
export function BeforeAfter({ source, draftNotes, notes, draftInstructions, instructions }: {
  source: "ai" | "rules"; draftNotes: ConsultNotes; notes: ConsultNotes; draftInstructions: ConsultInstruction[]; instructions: ConsultInstruction[];
}) {
  const byId = new Map(draftInstructions.map((i) => [i.id, i]));
  const ids = new Set(instructions.map((i) => i.id));
  const removed = draftInstructions.filter((i) => !ids.has(i.id));
  const n = countChanges(draftNotes, notes, draftInstructions, instructions);
  const who = source === "ai" ? "AI" : "rules";
  return (
    <div className="ba">
      <div className="ba-legend small muted">
        <span><del>{who} draft text</del> removed</span>
        <span><ins>clinician text</ins> added</span>
        <span className="badge">{n === 0 ? "No changes yet" : `${n} change${n === 1 ? "" : "s"}`}</span>
      </div>
      <h3 className="ba-h">Clinical notes</h3>
      {NOTE_KEYS.map((k) => (
        <Row key={k} label={NOTE_LABELS[k]} changed={draftNotes[k] !== notes[k]}>
          <Inline before={draftNotes[k]} after={notes[k]} />
        </Row>
      ))}
      <h3 className="ba-h">Patient instructions</h3>
      {instructions.map((ins, i) => {
        const o = byId.get(ins.id);
        return (
          <Row key={ins.id} label={`${i + 1}. ${KIND_LABELS[ins.kind]}`} changed={!o || o.text !== ins.text} tag={o ? undefined : "Added by clinician"}>
            <Inline before={o?.text ?? ""} after={ins.text} />
          </Row>
        );
      })}
      {removed.map((ins) => (
        <Row key={ins.id} label={KIND_LABELS[ins.kind]} changed tag="Removed by clinician">
          <Inline before={ins.text} after="" />
        </Row>
      ))}
    </div>
  );
}
