import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { listNotifications } from "../notifications.js";

// Mounted at /api/notifications. Only the signed-in user's rows are read or changed; anyone else's id is a 404.
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

notificationsRouter.get("/", (req, res) => {
  res.json(listNotifications(req.user!.id));
});

notificationsRouter.post("/read-all", (req, res) => {
  db.prepare(`UPDATE notifications SET read_at = ${NOW} WHERE user_id = ? AND read_at IS NULL`).run(req.user!.id);
  res.json(listNotifications(req.user!.id));
});

notificationsRouter.post("/:id/read", (req, res) => {
  const r = db.prepare(`UPDATE notifications SET read_at = COALESCE(read_at, ${NOW}) WHERE id = ? AND user_id = ?`).run(req.params.id, req.user!.id);
  if (r.changes === 0) return res.status(404).json({ error: "Notification not found" });
  res.json(listNotifications(req.user!.id));
});
