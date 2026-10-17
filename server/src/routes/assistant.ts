import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { chatLimiter } from "../ai/limit.js";
import { AiError } from "../ai/client.js";
import { assistantReply, type Intent } from "../ai/assistant.js";
import { verifyPreferences, type ExtractedPrefs } from "../ai/preferences.js";
import { directory } from "../providers/directory.js";

export const assistantRouter = Router();
assistantRouter.use(requireAuth);

const body = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1, "Message can't be empty").max(2000, "Please keep messages under 2,000 characters"),
  })).min(1).max(30),
}).refine((b) => b.messages.at(-1)?.role === "user", { message: "The last message must be from the user" })
  .refine((b) => b.messages.reduce((n, m) => n + m.content.length, 0) <= 16_000, { message: "This conversation is too long. Please start a new one." });

export interface AssistantAction { label: string; href: string; kind: "internal" | "external" | "phone" | "create_brief" }

const HEALTHDIRECT_SYMPTOMS = "https://www.healthdirect.gov.au/symptom-checker";
const HEALTHDIRECT_SERVICES = "https://www.healthdirect.gov.au/australian-health-services";

/** Actions are chosen by the server from a fixed set plus the user's own records; the model never supplies links. */
function actionsFor(intent: Intent, selfHarm: boolean, appts: { id: string; practitioner_name: string; starts_at: string }[], canBrief: boolean): AssistantAction[] {
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  switch (intent) {
    case "emergency":
      return [{ label: "Call 000", href: "tel:000", kind: "phone" }, ...(selfHarm ? [{ label: "Lifeline 13 11 14", href: "tel:131114", kind: "phone" as const }] : [])];
    case "symptom_question":
      return [{ label: "Healthdirect Symptom Checker", href: HEALTHDIRECT_SYMPTOMS, kind: "external" }, { label: "Prepare questions for an appointment", href: "/app/preparation", kind: "internal" }];
    case "prepare":
      return [
        ...(canBrief ? [{ label: "Create a brief from this conversation", href: "", kind: "create_brief" as const }] : []),
        ...appts.slice(0, 3).map((a) => ({ label: `Prepare: ${a.practitioner_name} · ${day(a.starts_at)}`, href: `/app/appointments/${a.id}/prepare`, kind: "internal" as const })),
        { label: appts.length ? "Add another appointment" : "Add an appointment", href: "/app/appointments?new=1", kind: "internal" },
      ];
    case "find_provider":
      return [{ label: "Open Fit Finder", href: "/app/fit-finder", kind: "internal" }, { label: "Healthdirect: Find a health service", href: HEALTHDIRECT_SERVICES, kind: "external" }];
    case "follow_up":
      return [{ label: "Open Follow-Up Tracker", href: "/app/follow-up", kind: "internal" }];
    default:
      return [];
  }
}

// Stateless: the conversation lives in the browser and is never written to the database.
assistantRouter.post("/chat", chatLimiter, async (req, res) => {
  const { messages } = body.parse(req.body);
  const appts = db.prepare(
    "SELECT id, practitioner_name, service_type, starts_at FROM appointments WHERE user_id = ? AND starts_at >= ? ORDER BY starts_at ASC LIMIT 5"
  ).all(req.user!.id, new Date().toISOString()) as { id: string; practitioner_name: string; service_type: string; starts_at: string }[];
  try {
    const r = await assistantReply(messages, appts);
    const userText = messages.filter((m) => m.role === "user").map((m) => m.content);
    // Offer a brief once the user has shared details (a follow-up message or one substantial message),
    // not on the opening request alone. The server still refuses if nothing usable was said.
    const canBrief = r.intent === "prepare" && (userText.length >= 2 || userText.join(" ").length >= 120);
    // Provider requests: the model's proposed preferences are kept only if quoted from the user's own recent messages.
    let search: (ExtractedPrefs & { location_known: boolean | null; location_resolved: string | null }) | null = null;
    if (r.intent === "find_provider") {
      const ex = verifyPreferences({ items: r.preferences }, userText.slice(-3).join("\n"));
      const loc = ex.prefs.location ? directory.resolveLocation(ex.prefs.location) : null;
      search = { ...ex, location_known: ex.prefs.location ? !!loc : null, location_resolved: loc ? `${loc.suburb} ${loc.state} ${loc.postcode}` : null };
    }
    res.json({ reply: r.reply, intent: r.intent, safety: r.safety, actions: actionsFor(r.intent, r.selfHarm, appts, canBrief), search });
  } catch (e) {
    if (e instanceof AiError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});
