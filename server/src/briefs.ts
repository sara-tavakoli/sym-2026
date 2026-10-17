import { z } from "zod";
import { newId } from "./auth.js";
import { SECTIONS, type BriefDraft, type Section } from "./ai/brief.js";

/** Shared brief shapes for appointment briefs and standalone draft briefs. */
export interface StoredPoint { id: string; text: string; edited: boolean; user: boolean }
export interface ViewPoint extends StoredPoint { field: string | null; quote: string | null }
export type ViewSections = Record<Section, ViewPoint[]>;

export const MAX_POINTS = 20;

export const editBody = z.object({
  sections: z.object(Object.fromEntries(SECTIONS.map((s) => [s, z.array(z.object({
    id: z.string().optional(),
    text: z.string().trim().min(1, "A point can't be empty").max(600),
  })).max(MAX_POINTS)])) as Record<Section, z.ZodArray<z.ZodObject<{ id: z.ZodOptional<z.ZodString>; text: z.ZodString }>>>),
});
export type EditBody = z.infer<typeof editBody>;

/**
 * Applies a user's edits. Source links (field + quote) are copied from the stored brief by point id,
 * never accepted from the client; unknown ids become user-added points with no source link.
 */
export function applyEdits(existing: ViewSections | null | undefined, body: EditBody): ViewSections {
  const known = new Map<string, ViewPoint>();
  if (existing) for (const s of SECTIONS) for (const p of existing[s]) known.set(p.id, p);
  const out = {} as ViewSections;
  for (const s of SECTIONS) {
    out[s] = body.sections[s].map((p) => {
      const old = p.id ? known.get(p.id) : undefined;
      if (old) return { ...old, text: p.text, edited: old.edited || old.text !== p.text };
      return { id: newId(), text: p.text, edited: false, user: true, field: null, quote: null };
    });
  }
  return out;
}

/** Turns verified model output into view points, optionally keeping other sections when regenerating one. */
export function fromGenerated(draft: BriefDraft, existing?: ViewSections | null, only?: Section): ViewSections {
  const out = {} as ViewSections;
  for (const s of SECTIONS) {
    if (only && existing && s !== only) { out[s] = existing[s]; continue; }
    out[s] = draft.sections[s].map((p) => ({ id: newId(), text: p.text, edited: false, user: false, field: p.field, quote: p.quote }));
  }
  return out;
}

export const emptySections = (): ViewSections => Object.fromEntries(SECTIONS.map((s) => [s, []])) as unknown as ViewSections;
