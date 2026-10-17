import express, { type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ZodError } from "zod";
import "./db.js";
import "./schema-nudges.js";
import { authRouter } from "./routes/auth.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { prepRouter } from "./routes/prep.js";
import { instructionsRouter, tasksRouter } from "./routes/tasks.js";
import { aiInfo } from "./ai/client.js";
import { assistantRouter } from "./routes/assistant.js";
import { draftsRouter } from "./routes/drafts.js";
import { fitFinderRouter } from "./routes/fit-finder.js";
import { ensureDemoDirectory } from "./providers/demo-data.js";
import { importRouter } from "./routes/import.js";
import { attentionRouter } from "./routes/attention.js";

export function createApp() {
  ensureDemoDirectory();
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.get("/api/ai/info", (_req, res) => res.json(aiInfo()));
  app.use("/api/appointments/import", importRouter); // must precede the /:id routers
  app.use("/api/appointments/:id", prepRouter);
  app.use("/api/appointments/:id", instructionsRouter);
  app.use("/api/appointments", appointmentsRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/assistant", assistantRouter);
  app.use("/api/drafts", draftsRouter);
  app.use("/api/fit-finder", fitFinderRouter);
  app.use("/api/dashboard/attention", attentionRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

  // Serve the built frontend (single deployable). Unknown paths fall back to the SPA shell.
  const dist = resolve("web/dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(dist, "index.html")));
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? "Invalid input", fields: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    }
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON" });
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  };
  app.use(onError);
  return app;
}
