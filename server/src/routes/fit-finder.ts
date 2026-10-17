import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { newId, requireAuth } from "../auth.js";
import { chatLimiter } from "../ai/limit.js";
import { AiError } from "../ai/client.js";
import { extractPreferences } from "../ai/preferences.js";
import { directory, ACCESS_FEATURES } from "../providers/directory.js";
import { DAYS, RADII, bboxAround, evaluate, prefsSchema, search } from "../providers/matching.js";

// Fit Finder: deterministic provider matching over the directory. AI is used only to read the user's request.
export const fitFinderRouter = Router();
fitFinderRouter.use(requireAuth);

fitFinderRouter.get("/meta", (_req, res) => {
  res.json({
    categories: directory.categories(),
    locations: directory.locations().map((l) => ({ suburb: l.suburb, state: l.state, postcode: l.postcode })),
    accessibility: ACCESS_FEATURES, days: DAYS, radii: RADII,
    notice: "Demonstration directory: all providers are fictional. Opening hours are published hours, not appointment availability.",
  });
});

function resolveOrigin(location: string | undefined) {
  if (!location) return { origin: null, unknown: false };
  const origin = directory.resolveLocation(location);
  return { origin, unknown: !origin };
}

const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(100).default(1), pageSize: z.coerce.number().int().min(1).max(20).default(6) });

fitFinderRouter.get("/search", (req, res) => {
  const prefs = prefsSchema.parse(req.query);
  const { page, pageSize } = pageQuery.parse(req.query);
  if (!directory.categories().some((c) => c.id === prefs.category)) return res.status(400).json({ error: "Choose a service type" });
  const { origin, unknown } = resolveOrigin(prefs.location);
  if (unknown) {
    return res.status(422).json({
      error: `"${prefs.location}" isn't in the demo directory's coverage area yet. Try one of the listed suburbs or postcodes.`,
      code: "unknown_location",
      suggestions: directory.locations().map((l) => l.suburb),
    });
  }
  const bbox = origin && prefs.mode !== "telehealth" ? bboxAround(origin, prefs.radius_km) : null;
  res.json({ ...search(directory.candidates(prefs.category, bbox), prefs, origin, page, pageSize), prefs });
});

// Comparison of 2–3 providers against the same preferences.
fitFinderRouter.get("/compare", (req, res) => {
  const ids = z.preprocess((v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v), z.array(z.string().max(80)).min(2, "Choose at least two providers").max(3, "Compare up to three providers")).parse(req.query.ids);
  const prefs = prefsSchema.partial({ category: true }).parse(req.query);
  const { origin } = resolveOrigin(prefs.location);
  const records = directory.byIds([...new Set(ids)]);
  if (records.length < 2) return res.status(404).json({ error: "Some of those providers could not be found" });
  res.json({ origin, items: records.map((r) => evaluate(r, { ...prefs, category: prefs.category ?? r.category.id }, origin)) });
});

fitFinderRouter.post("/extract", chatLimiter, async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(3, "Describe what you're looking for").max(1000) }).parse(req.body);
  try {
    const r = await extractPreferences(text);
    const loc = r.prefs.location ? directory.resolveLocation(r.prefs.location) : null;
    res.json({ ...r, location_known: r.prefs.location ? !!loc : null, location_resolved: loc ? `${loc.suburb} ${loc.state} ${loc.postcode}` : null });
  } catch (e) {
    if (e instanceof AiError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

// Saved searches (user-owned).
fitFinderRouter.get("/saved", (req, res) => {
  const rows = db.prepare("SELECT id, name, prefs_json, created_at FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").all(req.user!.id) as { id: string; name: string; prefs_json: string; created_at: string }[];
  res.json({ items: rows.map((r) => ({ id: r.id, name: r.name, created_at: r.created_at, prefs: JSON.parse(r.prefs_json) })) });
});
fitFinderRouter.post("/saved", (req, res) => {
  const b = z.object({ name: z.string().trim().min(1, "Give the search a name").max(80), prefs: prefsSchema }).parse(req.body);
  const n = (db.prepare("SELECT COUNT(*) AS n FROM saved_searches WHERE user_id = ?").get(req.user!.id) as { n: number }).n;
  if (n >= 20) return res.status(400).json({ error: "You can save up to 20 searches. Delete one first." });
  const id = newId();
  db.prepare("INSERT INTO saved_searches (id, user_id, name, prefs_json) VALUES (?,?,?,?)").run(id, req.user!.id, b.name, JSON.stringify(b.prefs));
  res.status(201).json({ id, name: b.name, prefs: b.prefs });
});
fitFinderRouter.delete("/saved/:id", (req, res) => {
  const r = db.prepare("DELETE FROM saved_searches WHERE id = ? AND user_id = ?").run(req.params.id, req.user!.id);
  if (r.changes === 0) return res.status(404).json({ error: "Saved search not found" });
  res.json({ ok: true });
});
