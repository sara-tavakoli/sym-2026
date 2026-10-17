import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { newId, requireAuth } from "../auth.js";
import { aiLimiter } from "../ai/limit.js";
import { AiError } from "../ai/client.js";
import { FIELDS, SECTIONS, generateBrief, type PrepInput, type Section } from "../ai/brief.js";
import { notesFromChat } from "../ai/chat-notes.js";
import { applyEdits, editBody, emptySections, fromGenerated, type ViewSections } from "../briefs.js";
import { loadBrief, loadNotes, saveBrief } from "./prep.js";

// Draft briefs: preparation that isn't tied to an appointment yet. Every query is scoped to the user.
export const draftsRouter = Router();
draftsRouter.use(requireAuth);

interface DraftRow { id: string; title: string; origin: "chat" | "form"; notes_json: string; content_json: string | null; created_at: string; updated_at: string }
interface DraftContent { sections: ViewSections; dropped: number }

const emptyNotes = (): PrepInput => ({ main_concern: "", onset: "", background: "", experiences: "", questions: "", additional: "" });
const did = (req: Request) => (req.params as Record<string, string>).id;

function load(req: Request): DraftRow | undefined {
  return db.prepare("SELECT * FROM draft_briefs WHERE id = ? AND user_id = ?").get(did(req), req.user!.id) as DraftRow | undefined;
}
function view(row: DraftRow) {
  const content = row.content_json ? (JSON.parse(row.content_json) as DraftContent) : null;
  return {
    id: row.id, title: row.title, origin: row.origin, created_at: row.created_at, updated_at: row.updated_at,
    notes: JSON.parse(row.notes_json) as PrepInput,
    brief: content ? { status: "draft" as const, dropped: content.dropped, sections: content.sections } : null,
  };
}
function save(id: string, uid: string, patch: { title?: string; notes?: PrepInput; content?: DraftContent | null }) {
  const cur = db.prepare("SELECT title, notes_json, content_json FROM draft_briefs WHERE id = ? AND user_id = ?").get(id, uid) as Pick<DraftRow, "title" | "notes_json" | "content_json">;
  db.prepare("UPDATE draft_briefs SET title = ?, notes_json = ?, content_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ?").run(
    patch.title ?? cur.title,
    patch.notes ? JSON.stringify(patch.notes) : cur.notes_json,
    patch.content === undefined ? cur.content_json : patch.content ? JSON.stringify(patch.content) : null,
    id, uid);
}
const titleFrom = (notes: PrepInput) => {
  const t = notes.main_concern.split("\n")[0].trim();
  return t ? (t.length > 70 ? t.slice(0, 67) + "…" : t) : "Draft appointment brief";
};
const notFound = (res: Response) => res.status(404).json({ error: "Draft not found" });
function aiFail(res: Response, e: unknown) {
  if (e instanceof AiError) return res.status(e.status).json({ error: e.message });
  throw e;
}

draftsRouter.get("/", (req, res) => {
  const rows = db.prepare("SELECT id, title, origin, content_json, updated_at FROM draft_briefs WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50").all(req.user!.id) as Pick<DraftRow, "id" | "title" | "origin" | "content_json" | "updated_at">[];
  res.json({
    items: rows.map((r) => {
      const c = r.content_json ? (JSON.parse(r.content_json) as DraftContent) : null;
      return { id: r.id, title: r.title, origin: r.origin, updated_at: r.updated_at, points: c ? SECTIONS.reduce((n, s) => n + c.sections[s].length, 0) : 0 };
    }),
  });
});

draftsRouter.post("/", (req, res) => {
  const { title } = z.object({ title: z.string().trim().max(120).optional() }).parse(req.body ?? {});
  const id = newId();
  db.prepare("INSERT INTO draft_briefs (id, user_id, title, origin, notes_json) VALUES (?,?,?,?,?)").run(id, req.user!.id, title || "Draft appointment brief", "form", JSON.stringify(emptyNotes()));
  res.status(201).json(view(db.prepare("SELECT * FROM draft_briefs WHERE id = ?").get(id) as unknown as DraftRow));
});

// Chat -> verified excerpts -> brief. Only the excerpts (the user's own words) are stored, never the conversation.
const fromChatBody = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) })).min(1).max(30),
});
draftsRouter.post("/from-chat", aiLimiter, async (req, res) => {
  const userMessages = fromChatBody.parse(req.body).messages.filter((m) => m.role === "user").map((m) => m.content);
  if (!userMessages.length) return res.status(400).json({ error: "Share a few details about your appointment first." });
  try {
    const { notes, kept } = await notesFromChat(userMessages);
    if (!kept || !Object.values(notes).some((v) => v.trim())) {
      return res.status(422).json({ error: "There isn't enough detail in the conversation yet. Tell the assistant your main concern or the questions you want to ask, then try again." });
    }
    const draft = await generateBrief(notes);
    const id = newId();
    db.prepare("INSERT INTO draft_briefs (id, user_id, title, origin, notes_json, content_json) VALUES (?,?,?,?,?,?)").run(
      id, req.user!.id, titleFrom(notes), "chat", JSON.stringify(notes), JSON.stringify({ sections: fromGenerated(draft), dropped: draft.dropped } satisfies DraftContent));
    res.status(201).json(view(db.prepare("SELECT * FROM draft_briefs WHERE id = ?").get(id) as unknown as DraftRow));
  } catch (e) { aiFail(res, e); }
});

draftsRouter.get("/:id", (req, res) => {
  const row = load(req);
  if (!row) return notFound(res);
  res.json(view(row));
});

const noteText = z.string().max(3000).optional().default("").transform((s) => s.trim());
const notesBody = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  notes: z.object(Object.fromEntries(FIELDS.map((f) => [f, noteText])) as Record<(typeof FIELDS)[number], typeof noteText>),
});
draftsRouter.put("/:id/notes", (req, res) => {
  if (!load(req)) return notFound(res);
  const b = notesBody.parse(req.body);
  save(did(req), req.user!.id, { title: b.title, notes: b.notes as PrepInput });
  res.json(view(load(req)!));
});

async function generate(req: Request, res: Response, only?: Section) {
  const row = load(req);
  if (!row) return notFound(res);
  const notes = JSON.parse(row.notes_json) as PrepInput;
  if (!Object.values(notes).some((v) => v.trim())) return res.status(400).json({ error: "Add some notes first, then generate your brief." });
  try {
    const draft = await generateBrief(notes);
    const existing = row.content_json ? (JSON.parse(row.content_json) as DraftContent) : null;
    const sections = fromGenerated(draft, existing?.sections, only);
    const title = row.title === "Draft appointment brief" ? titleFrom(notes) : undefined;
    save(row.id, req.user!.id, { title, content: { sections, dropped: (only ? existing?.dropped ?? 0 : 0) + draft.dropped } });
    res.json(view(load(req)!));
  } catch (e) { aiFail(res, e); }
}
draftsRouter.post("/:id/generate", aiLimiter, (req, res) => generate(req, res));
draftsRouter.post("/:id/sections/:section/regenerate", aiLimiter, (req, res) => generate(req, res, z.enum(SECTIONS).parse((req.params as Record<string, string>).section)));

draftsRouter.put("/:id/brief", (req, res) => {
  const row = load(req);
  if (!row) return notFound(res);
  const body = editBody.parse(req.body);
  const existing = row.content_json ? (JSON.parse(row.content_json) as DraftContent) : null;
  save(row.id, req.user!.id, { content: { sections: applyEdits(existing?.sections ?? emptySections(), body), dropped: existing?.dropped ?? 0 } });
  res.json(view(load(req)!));
});

// Attach: copies notes + brief (with source links) onto an appointment the user owns, then removes the draft.
draftsRouter.post("/:id/attach", (req, res) => {
  const row = load(req);
  if (!row) return notFound(res);
  const b = z.object({ appointment_id: z.string().min(1), replace: z.boolean().default(false) }).parse(req.body);
  const uid = req.user!.id;
  if (!db.prepare("SELECT 1 FROM appointments WHERE id = ? AND user_id = ?").get(b.appointment_id, uid)) return res.status(404).json({ error: "Appointment not found" });
  const hasNotes = Object.values(loadNotes(b.appointment_id, uid)).some((v) => v.trim());
  if ((loadBrief(b.appointment_id, uid) || hasNotes) && !b.replace) {
    return res.status(409).json({ error: "That appointment already has preparation notes or a brief. Attaching will replace them.", code: "has_existing" });
  }
  const notes = JSON.parse(row.notes_json) as PrepInput;
  const content = row.content_json ? (JSON.parse(row.content_json) as DraftContent) : null;
  db.exec("BEGIN");
  try {
    db.prepare(`INSERT INTO preparation_notes (id, user_id, appointment_id, main_concern, onset, background, experiences, questions, additional)
                VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(appointment_id) DO UPDATE SET main_concern=excluded.main_concern, onset=excluded.onset, background=excluded.background,
                  experiences=excluded.experiences, questions=excluded.questions, additional=excluded.additional, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .run(newId(), uid, b.appointment_id, notes.main_concern, notes.onset, notes.background, notes.experiences, notes.questions, notes.additional);
    if (content) saveBrief(b.appointment_id, uid, content.sections, content.dropped, "draft"); // the user confirms it on the appointment
    else db.prepare("DELETE FROM appointment_briefs WHERE appointment_id = ? AND user_id = ?").run(b.appointment_id, uid);
    db.prepare("DELETE FROM draft_briefs WHERE id = ? AND user_id = ?").run(row.id, uid);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.json({ appointment_id: b.appointment_id });
});

draftsRouter.delete("/:id", (req, res) => {
  const r = db.prepare("DELETE FROM draft_briefs WHERE id = ? AND user_id = ?").run(did(req), req.user!.id);
  if (r.changes === 0) return notFound(res);
  res.json({ ok: true });
});
