import { useCallback, useRef, useState } from "react";
import { FIELD_LABELS, SECTION_KEYS, SECTION_TITLES, type BriefPoint, type SectionKey } from "../lib/api";
import { Spinner } from "./ui";

/** Editable brief state shared by appointment preparation and standalone draft briefs. */
export interface DraftPoint { id?: string; key: string; text: string; field: string | null; quote: string | null; edited: boolean; user: boolean }
export type Draft = Record<SectionKey, DraftPoint[]>;
type BriefLike = { sections: Record<SectionKey, BriefPoint[]> };

const toDraft = (b: BriefLike): Draft =>
  Object.fromEntries(SECTION_KEYS.map((s) => [s, b.sections[s].map((p) => ({ ...p, key: p.id }))])) as Draft;

export function useBriefDraft() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const counter = useRef(0);

  const adopt = useCallback((b: BriefLike | null) => { setDraft(b ? toDraft(b) : null); setDirty(false); }, []);
  const change = (fn: (d: Draft) => Draft) => { setDraft((d) => (d ? fn(d) : d)); setDirty(true); };
  const ops = {
    update: (s: SectionKey, i: number, text: string) => change((d) => ({ ...d, [s]: d[s].map((p, j) => (j === i ? { ...p, text } : p)) })),
    remove: (s: SectionKey, i: number) => change((d) => ({ ...d, [s]: d[s].filter((_, j) => j !== i) })),
    move: (s: SectionKey, i: number, dir: -1 | 1) => change((d) => {
      const list = [...d[s]]; const j = i + dir;
      if (j < 0 || j >= list.length) return d;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...d, [s]: list };
    }),
    add: (s: SectionKey) => change((d) => ({ ...d, [s]: [...d[s], { key: `new-${counter.current++}`, text: "", field: null, quote: null, edited: false, user: true }] })),
  };
  /** Payload for the save endpoints: only ids and text — source links are kept server-side. */
  const payload = () => ({
    sections: Object.fromEntries(SECTION_KEYS.map((s) => [s, (draft?.[s] ?? []).filter((p) => p.text.trim()).map((p) => ({ id: p.id, text: p.text }))])),
  });
  return { draft, dirty, adopt, ops, payload };
}

export function BriefSections({ draft, ops, busy, onRegenerate, sourceNote }: {
  draft: Draft;
  ops: ReturnType<typeof useBriefDraft>["ops"];
  busy: string;
  onRegenerate: (s: SectionKey) => void;
  sourceNote?: string;
}) {
  return (
    <div className="panel brief-doc">
      {SECTION_KEYS.map((s) => (
        <section className="brief-sec" key={s} aria-labelledby={`sec-${s}`}>
          <div className="brief-sec-head">
            <h2 id={`sec-${s}`}>{SECTION_TITLES[s]}</h2>
            <button className="text-btn" onClick={() => onRegenerate(s)} disabled={!!busy}>{busy === s ? <Spinner /> : null} Regenerate<span className="sr-only"> {SECTION_TITLES[s]}</span></button>
          </div>
          {draft[s].length === 0 && <p className="muted small">{s === "reason" ? "Nothing here yet." : "Nothing was entered for this section."} You can add your own point.</p>}
          <ol className={`points ${s === "timeline" || s === "questions" ? "numbered" : ""}`}>
            {draft[s].map((p, i) => (
              <li key={p.key} className="point">
                <div className="point-row">
                  <textarea className="point-input" aria-label={`${SECTION_TITLES[s]} point ${i + 1}`} rows={1} value={p.text} onChange={(e) => ops.update(s, i, e.target.value)} maxLength={600} placeholder="Write a point" />
                  <div className="point-actions">
                    <button className="icon-btn" onClick={() => ops.move(s, i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
                    <button className="icon-btn" onClick={() => ops.move(s, i, 1)} disabled={i === draft[s].length - 1} aria-label="Move down" title="Move down">↓</button>
                    <button className="icon-btn danger" onClick={() => ops.remove(s, i)} aria-label="Delete point" title="Delete">✕</button>
                  </div>
                </div>
                <p className="source">
                  {p.user ? "Added by you" : <>Source: {FIELD_LABELS[p.field ?? ""] ?? p.field}{sourceNote ? ` · ${sourceNote}` : ""} — <q>{p.quote}</q></>}
                  {p.edited && <span className="edited"> · Edited</span>}
                </p>
              </li>
            ))}
          </ol>
          <button className="text-btn add-point" onClick={() => ops.add(s)}>+ Add a point<span className="sr-only"> to {SECTION_TITLES[s]}</span></button>
        </section>
      ))}
    </div>
  );
}
