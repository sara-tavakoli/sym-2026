import { randomBytes, scrypt, timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { db } from "./db.js";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = "carepath_session";
const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 14);

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scryptAsync(pw, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
export const newId = () => randomUUID();

export function createSession(userId: string): { token: string; expires: Date } {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TTL_DAYS * 864e5);
  // Only a hash of the token is stored, so a database leak does not expose live sessions.
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)").run(sha(token), userId, expires.toISOString());
  return { token, expires };
}

export function destroySession(token: string) {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
}

export interface AuthedUser { id: string; email: string; name: string }
declare module "express-serve-static-core" { interface Request { user?: AuthedUser } }

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    const row = db.prepare(
      `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    ).get(sha(token), new Date().toISOString()) as AuthedUser | undefined;
    if (row) { req.user = row; return next(); }
  }
  res.status(401).json({ error: "Not signed in" });
}
