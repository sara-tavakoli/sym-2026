import { Router, type Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { db } from "../db.js";
import { SESSION_COOKIE, createSession, currentUser, destroySession, hashPassword, newId, requireAuth, verifyPassword } from "../auth.js";

export const authRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});
const registerBody = credentials.extend({ name: z.string().trim().min(1, "Name is required").max(100) });

function setCookie(res: Response, token: string, expires: Date) {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires, path: "/" });
}

authRouter.post("/register", limiter, async (req, res) => {
  const body = registerBody.parse(req.body);
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(body.email)) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }
  const id = newId();
  db.prepare("INSERT INTO users (id, email, name, password_hash) VALUES (?,?,?,?)")
    .run(id, body.email, body.name, await hashPassword(body.password));
  const { token, expires } = createSession(id);
  setCookie(res, token, expires);
  res.status(201).json({ user: { id, email: body.email, name: body.name } });
});

authRouter.post("/login", limiter, async (req, res) => {
  const body = credentials.parse(req.body);
  const row = db.prepare("SELECT id, email, name, password_hash FROM users WHERE email = ?").get(body.email) as
    | { id: string; email: string; name: string; password_hash: string } | undefined;
  // Same message for unknown email and wrong password to avoid account enumeration.
  if (!row || !(await verifyPassword(body.password, row.password_hash))) {
    return res.status(401).json({ error: "Incorrect email or password" });
  }
  const { token, expires } = createSession(row.id);
  setCookie(res, token, expires);
  res.json({ user: { id: row.id, email: row.email, name: row.name } });
});

authRouter.post("/logout", (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) destroySession(token);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));
// Signed-out is a normal state for public pages, so this answers 200 with user: null instead of 401.
authRouter.get("/session", (req, res) => res.json({ user: currentUser(req) ?? null }));

// Settings: delete the account and everything it owns (data minimisation).
authRouter.delete("/account", requireAuth, (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ?").run(req.user!.id); // cascades to every owned table
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});
