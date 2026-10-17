import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { newId, requireAuth } from "../auth.js";
import { aiLimiter } from "../ai/limit.js";
import { AiError } from "../ai/client.js";
import { FIELDS, SECTIONS, generateBrief, type Field, type PrepInput, type Section } from "../ai/brief.js";

export const prepRouter = Router({ mergeParams: true });
prepRouter.use(requireAuth);

const MAX_POINTS = 20;
const pid = (req: Request) => (req.params as Record<string, string>).id;

function ownsAppointment(req: Request, res: Response): boolean {
  const row = db.prepare("SELECT 1 FROM appointments WHERE id = ? AND user_id = ?").get(pid(req), req.user!.id);
  if (!row) res.status(404).json({ error: "Appointment not found" });
  return !!row;
}

const emptyNotes = (): PrepInput => ({ main_concern: "", onset: "", background: "", experiences: "", questions: "", additional: "" });

function loadNotes(apptId: string, uid: string): PrepInput {
  const row = db.prepare("SELECT main_concern, onset, background, experiences, questions, additional FROM preparation_notes WHERE appointment_id = ? AND user_id = ?").get(apptId, uid) as Record<Field, string | null> | undefined;
  const out = emptyNotes();
  if (row) for (const f of FIELDS) out[f] = row[f] ?? "";
  return out;
}

interface StoredPoint { id: string; text: string; edited: boolean; user: boolean }
interface StoredContent { sections: Record<Section, StoredPoint[]>; dropped: number }
interface ViewPoint extends StoredPoint { field: string | null; quote: string | null }

function loadBrief(apptId: string, uid: string) {
  const row = db.prepare("SELECT id, status, content_json, updated_at FROM appointment_briefs WHERE appointment_id = ? AND user_id = ?").get(apptId, uid) as
    { id: string; status: "draft" | "confirmed"; content_json: string; updated_at: string } | undefined;
  if (!row) return null;
  const content = JSON.parse(row.content_json) as StoredContent;
  const refs = db.prepare("SELECT point_id, source_field, source_text FROM brief_source_refs WHERE brief_id = ? AND user_id = ?").all(row.id, uid) as { point_id: string; source_field: string; source_text: string }[];
  const byPoint = new Map(refs.map((r) => [r.point_id, r]));
  const sections = {} as Record<Section, ViewPoint[]>;
  for (const s of SECTIONS) {
    sections[s] = (content.sections[s] ?? []).map((p) => ({ ...p, field: byPoint.get(p.id)?.source_field ?? null, quote: byPoint.get(p.id)?.source_text ?? null }));
  }
  return { id: row.id, status: row.status, updated_at: row.updated_at, dropped: content.dropped, sections };
}

function saveBrief(apptId: string, uid: string, sections: Record<Section, ViewPoint[]>, dropped: number, status: "draft" | "confirmed") {
  const stored: StoredContent = { dropped, sections: {} as StoredContent["sections"] };
  for (const s of SECTIONS) stored.sections[s] = sections[s].map(({ id, text, edited, user }) => ({ id, text, edited, user }));
  db.exec("BEGIN");
  try {
    const existing = db.prepare("SELECT id FROM appointment_briefs WHERE appointment_id = ? AND user_id = ?").get(apptId, uid) as { id: string } | undefined;
    const briefId = existing?.id ?? newId();
    if (existing) {
      db.prepare("UPDATE appointment_briefs SET status = ?, content_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(status, JSON.stringify(stored), briefId);
      db.prepare("DELETE FROM brief_source_refs WHERE brief_id = ?").run(briefId);
    } else {
      db.prepare("INSERT INTO appointment_briefs (id, user_id, appointment_id, status, content_json) VALUES (?,?,?,?,?)").run(briefId, uid, apptId, status, JSON.stringify(stored));
    }
    const ins = db.prepare("INSERT INTO brief_source_refs (id, user_id, brief_id, section, point_id, source_field, source_text) VALUES (?,?,?,?,?,?,?)");
    for (const s of SECTIONS) for (const p of sections[s]) if (p.field && p.quote) ins.run(newId(), uid, briefId, s, p.id, p.field, p.quote);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}

const noteText = z.string().max(3000).optional().default("").transform((s) => s.trim());
const notesBody = z.object({ main_concern: noteText, onset: noteText, background: noteText, experiences: noteText, questions: noteText, additional: noteText });

prepRouter.get("/prep", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  res.json({ notes: loadNotes(pid(req), req.user!.id), brief: loadBrief(pid(req), req.user!.id) });
});

prepRouter.put("/prep-notes", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const b = notesBody.parse(req.body);
  db.prepare(`INSERT INTO preparation_notes (id, user_id, appointment_id, main_concern, onset, background, experiences, questions, additional)
              VALUES (?,?,?,?,?,?,?,?,?)
              ON CONFLICT(appointment_id) DO UPDATE SET main_concern=excluded.main_concern, onset=excluded.onset, background=excluded.background,
                experiences=excluded.experiences, questions=excluded.questions, additional=excluded.additional,
                updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .run(newId(), req.user!.id, pid(req), b.main_concern, b.onset, b.background, b.experiences, b.questions, b.additional);
  res.json({ notes: b });
});

function aiFail(res: Response, e: unknown) {
  if (e instanceof AiError) return res.status(e.status).json({ error: e.message });
  throw e;
}

// Generates a whole brief, or only one section when `section` is given (other sections are kept as the user left them).
async function generate(req: Request, res: Response, only?: Section) {
  if (!ownsAppointment(req, res)) return;
  const uid = req.user!.id, apptId = pid(req);
  const notes = loadNotes(apptId, uid);
  if (!Object.values(notes).some((v) => v.trim())) return res.status(400).json({ error: "Add some notes first, then generate your brief." });
  try {
    const draft = await generateBrief(notes);
    const existing = loadBrief(apptId, uid);
    const sections = {} as Record<Section, ViewPoint[]>;
    for (const s of SECTIONS) {
      if (only && existing && s !== only) { sections[s] = existing.sections[s]; continue; }
      sections[s] = draft.sections[s].map((p) => ({ id: newId(), text: p.text, edited: false, user: false, field: p.field, quote: p.quote }));
    }
    saveBrief(apptId, uid, sections, (existing?.dropped ?? 0) * (only ? 1 : 0) + draft.dropped, "draft");
    res.json({ brief: loadBrief(apptId, uid) });
  } catch (e) { aiFail(res, e); }
}

prepRouter.post("/brief/generate", aiLimiter, (req, res) => generate(req, res));
prepRouter.post("/brief/sections/:section/regenerate", aiLimiter, (req, res) => {
  const section = z.enum(SECTIONS).parse(req.params.section);
  return generate(req, res, section);
});

const editBody = z.object({
  sections: z.object(Object.fromEntries(SECTIONS.map((s) => [s, z.array(z.object({ id: z.string().optional(), text: z.string().trim().min(1, "A point can't be empty").max(600) })).max(MAX_POINTS)])) as Record<Section, z.ZodArray<z.ZodObject<{ id: z.ZodOptional<z.ZodString>; text: z.ZodString }>>>),
});

// Saves the user's edits. Source links (field + quote) are taken from the stored brief by point id, never from the client.
prepRouter.put("/brief", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const uid = req.user!.id, apptId = pid(req);
  const body = editBody.parse(req.body);
  const existing = loadBrief(apptId, uid);
  const known = new Map<string, ViewPoint>();
  if (existing) for (const s of SECTIONS) for (const p of existing.sections[s]) known.set(p.id, p);
  const sections = {} as Record<Section, ViewPoint[]>;
  for (const s of SECTIONS) {
    sections[s] = body.sections[s].map((p) => {
      const old = p.id ? known.get(p.id) : undefined;
      if (old) return { ...old, text: p.text, edited: old.edited || old.text !== p.text };
      return { id: newId(), text: p.text, edited: false, user: true, field: null, quote: null };
    });
  }
  saveBrief(apptId, uid, sections, existing?.dropped ?? 0, "draft"); // any edit returns the brief to draft until re-confirmed
  res.json({ brief: loadBrief(apptId, uid) });
});

prepRouter.post("/brief/confirm", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const uid = req.user!.id, apptId = pid(req);
  const existing = loadBrief(apptId, uid);
  if (!existing || SECTIONS.every((s) => existing.sections[s].length === 0)) return res.status(400).json({ error: "There is nothing to confirm yet." });
  saveBrief(apptId, uid, existing.sections, existing.dropped, "confirmed");
  res.json({ brief: loadBrief(apptId, uid) });
});

prepRouter.delete("/brief", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  db.prepare("DELETE FROM appointment_briefs WHERE appointment_id = ? AND user_id = ?").run(pid(req), req.user!.id);
  res.json({ ok: true });
});
