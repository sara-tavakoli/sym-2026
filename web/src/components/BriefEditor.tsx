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
    <>
      {SECTION_KEYS.map((s) => (
        <section className="card" key={s} aria-labelledby={`sec-${s}`}>
          <div className="card-head">
            <h2 id={`sec-${s}`}>{SECTION_TITLES[s]}</h2>
            <button className="btn sm" onClick={() => onRegenerate(s)} disabled={!!busy}>{busy === s ? <Spinner /> : null} Regenerate</button>
          </div>
          {draft[s].length === 0 && <p className="muted small">Nothing here{s === "reason" ? "" : " — nothing was entered for this section"}. You can add your own point.</p>}
          {draft[s].map((p, i) => (
            <div key={p.key} className="point">
              <div className="point-row">
                <textarea aria-label={`${SECTION_TITLES[s]} point ${i + 1}`} rows={2} value={p.text} onChange={(e) => ops.update(s, i, e.target.value)} maxLength={600} />
                <div className="point-actions">
                  <button className="btn sm ghost" onClick={() => ops.move(s, i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button className="btn sm ghost" onClick={() => ops.move(s, i, 1)} disabled={i === draft[s].length - 1} aria-label="Move down">↓</button>
                  <button className="btn sm ghost danger" onClick={() => ops.remove(s, i)} aria-label="Delete point">✕</button>
                </div>
              </div>
              <div className="source">
                {p.user ? <span className="badge">Added by you</span> : (
                  <><span className="badge info">Source: {FIELD_LABELS[p.field ?? ""] ?? p.field}{sourceNote ? ` · ${sourceNote}` : ""}</span> <q>{p.quote}</q></>
                )}
                {p.edited && <span className="badge warn" style={{ marginLeft: 6 }}>Edited</span>}
              </div>
            </div>
          ))}
          <button className="btn sm" onClick={() => ops.add(s)}>+ Add a point</button>
        </section>
      ))}
    </>
  );
}
