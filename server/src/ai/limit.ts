import rateLimit from "express-rate-limit";

// Per-user AI budget (keyed by the authenticated user, not IP). In-memory: with several API instances
// this should move to a shared store such as Redis (see docs/ARCHITECTURE.md).
export const aiLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: Number(process.env.AI_RATE_LIMIT_PER_HOUR ?? 20),
  keyGenerator: (req) => req.user?.id ?? "anon",
  standardHeaders: true, legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  message: { error: "You've reached the hourly limit for AI requests. Please try again later." },
});

// Chat turns are smaller and more frequent than brief/task generation, so they get their own budget.
export const chatLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: Number(process.env.AI_CHAT_RATE_LIMIT_PER_HOUR ?? 60),
  keyGenerator: (req) => req.user?.id ?? "anon",
  standardHeaders: true, legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  message: { error: "You've reached the hourly limit for assistant messages. Please try again later." },
});
