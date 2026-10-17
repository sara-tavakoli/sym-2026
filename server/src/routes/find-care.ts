import { Router } from "express";
import rateLimit from "express-rate-limit";
import { directory } from "../providers/directory.js";
import { DURATIONS, DURATION_LABELS, mightSuit, redFlag, suggest, suggestBody } from "../findcare/rules.js";

// "Find care that fits": public, stateless, deterministic. Nothing the person types is stored or sent to an AI.
export const findCareRouter = Router();

// Per IP: generous enough for live "Might suit" chips while typing (debounced client-side).
const limiter = rateLimit({
  windowMs: 60_000, limit: Number(process.env.FIND_CARE_RATE_LIMIT_PER_MIN ?? 90), standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment and try again." },
});
findCareRouter.use(limiter);

findCareRouter.get("/meta", (_req, res) => {
  res.json({
    durations: DURATIONS.map((id) => ({ id, label: DURATION_LABELS[id] })),
    coverage: directory.locations().map((l) => ({ suburb: l.suburb, state: l.state, postcode: l.postcode })),
  });
});

findCareRouter.post("/suggest", (req, res) => {
  const input = suggestBody.parse(req.body);
  const emergency = redFlag(input.concern);
  const chips = mightSuit(input.concern);
  // Red flags come first: no service suggestion until the person has acknowledged the emergency notice.
  if (emergency && !input.acknowledged_emergency) return res.json({ emergency, chips: [], suggestion: null, location: null });

  let location: { query: string; known: boolean; resolved: string | null; suburb: string | null } | null = null;
  if (input.location) {
    const loc = directory.resolveLocation(input.location);
    location = { query: input.location, known: !!loc, resolved: loc ? `${loc.suburb} ${loc.state} ${loc.postcode}` : null, suburb: loc?.suburb ?? null };
  }
  const suggestion = suggest(input, directory.categories().map((c) => c.id));
  res.json({ emergency, chips, suggestion, location });
});
