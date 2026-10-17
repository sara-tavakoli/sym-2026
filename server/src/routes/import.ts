import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { parseBooking } from "../import/parse-booking.js";
import { aiAssist } from "../import/ai-assist.js";

// Mounted at /api/appointments/import (before the /api/appointments/:id routers, so "import" is never read as an id).
// Nothing is stored: the result only pre-fills the appointment form for the patient to review and save.
export const importRouter = Router();
importRouter.use(requireAuth);

const parseBody = z.object({
  text: z.string().trim().min(1, "Paste your booking confirmation or choose a calendar file first").max(20000, "That's too long for a booking confirmation (20,000 characters max)"),
});

importRouter.post("/parse", async (req, res) => {
  const { text } = parseBody.parse(req.body);
  const result = parseBooking(text);
  await aiAssist(result, text, req.user!.id);
  res.json(result);
});
