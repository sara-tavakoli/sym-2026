import { Router } from "express";
import { requireAuth } from "../auth.js";
import { getAttention } from "../nudges.js";

// Mounted at /api/dashboard/attention. Only the signed-in user's rows are ever read.
export const attentionRouter = Router();
attentionRouter.use(requireAuth);

attentionRouter.get("/", (req, res) => {
  res.json(getAttention(req.user!.id));
});
