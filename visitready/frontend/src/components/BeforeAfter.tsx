import { diffWords } from "@/lib/diff";
import { KIND_LABELS } from "@/lib/types";
import type { ClinicalNotes, Instruction } from "@/lib/types";
import { cn } from "@/lib/utils";

const SOAP: { key: keyof ClinicalNotes; label: string }[] = [
  { key: "subjective", label: "Subjective" },
  { key: "objective", label: "Objective" },
  { key: "assessment", label: "Assessment" },
  { key: "plan", label: "Plan" },
];

function Inline({ before, after, testid }: { before: string; after: string; testid: string }) {
  return (
    <p data-testid={testid} className="text-sm leading-relaxed text-ink whitespace-pre-wrap">
      {diffWords(before, after).map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.type === "del" ? (
          <del key={i} className="bg-[#FEE2E2] text-[#991B1B] decoration-[#991B1B]/60 rounded px-0.5">{p.text}</del>
        ) : (
          <ins key={i} className="bg-[#DCFCE7] text-[#166534] no-underline rounded px-0.5 font-medium">{p.text}</ins>
        ),
      )}
    </p>
  );
}

function Row({ label, changed, children, testid }: { label: string; changed: boolean; children: React.ReactNode; testid: string }) {
  return (
    <div data-testid={testid} data-changed={changed} className={cn("rounded-2xl border p-4", changed ? "border-terracotta/40 bg-terracotta-soft/30" : "border-line bg-white")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-[0.15em] text-ink-muted font-semibold">{label}</span>
        <span className={cn("text-[10px] font-semibold rounded-full px-2 py-0.5", changed ? "bg-terracotta text-white" : "bg-sand text-ink-muted")}>
          {changed ? "Edited by clinician" : "Unchanged from AI"}
        </span>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function countChanges(aiNotes: ClinicalNotes | null, notes: ClinicalNotes, aiIns: Instruction[], ins: Instruction[]): number {
  let n = aiNotes ? SOAP.filter((s) => aiNotes[s.key] !== notes[s.key]).length : 0;
  const aiById = new Map(aiIns.map((i) => [i.id, i]));
  const ids = new Set(ins.map((i) => i.id));
  n += ins.filter((i) => { const o = aiById.get(i.id); return !o || o.text !== i.text || o.kind !== i.kind; }).length;
  n += aiIns.filter((i) => !ids.has(i.id)).length;
  return n;
}

export default function BeforeAfter({ aiNotes, notes, aiInstructions, instructions }: {
  aiNotes: ClinicalNotes | null; notes: ClinicalNotes; aiInstructions: Instruction[]; instructions: Instruction[];
}) {
  const aiById = new Map(aiInstructions.map((i) => [i.id, i]));
  const ids = new Set(instructions.map((i) => i.id));
  const removed = aiInstructions.filter((i) => !ids.has(i.id));
  return (
    <div data-testid="before-after-view" className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1"><del className="bg-[#FEE2E2] text-[#991B1B] rounded px-1">AI draft text</del> removed</span>
        <span className="inline-flex items-center gap-1"><ins className="bg-[#DCFCE7] text-[#166534] no-underline rounded px-1">clinician text</ins> added</span>
      </div>
      <div className="space-y-3">
        <h3 className="text-lg text-ink">Clinical notes</h3>
        {SOAP.map((s) => {
          const before = aiNotes?.[s.key] ?? "";
          return (
            <Row key={s.key} label={s.label} changed={before !== notes[s.key]} testid={`diff-soap-${s.key}`}>
              <Inline before={before} after={notes[s.key]} testid={`diff-soap-${s.key}-text`} />
            </Row>
          );
        })}
      </div>
      <div className="space-y-3">
        <h3 className="text-lg text-ink">Patient-facing plan</h3>
        {instructions.map((ins, idx) => {
          const o = aiById.get(ins.id);
          const changed = !o || o.text !== ins.text || o.kind !== ins.kind;
          return (
            <Row key={ins.id} label={`${KIND_LABELS[ins.kind]}${o ? "" : " · added by clinician"}`} changed={changed} testid={`diff-instruction-${idx}`}>
              <Inline before={o?.text ?? ""} after={ins.text} testid={`diff-instruction-${idx}-text`} />
            </Row>
          );
        })}
        {removed.map((ins) => (
          <Row key={ins.id} label={`${KIND_LABELS[ins.kind]} · removed by clinician`} changed testid={`diff-removed-${ins.id}`}>
            <Inline before={ins.text} after="" testid={`diff-removed-${ins.id}-text`} />
          </Row>
        ))}
      </div>
    </div>
  );
}
