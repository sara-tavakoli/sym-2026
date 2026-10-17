import { createApp } from "./app.js";
import { db } from "./db.js";

const port = Number(process.env.PORT ?? 4000);
const server = createApp().listen(port, () => console.log(`CarePath AI server listening on http://localhost:${port}`));

// Hosting platforms stop containers with SIGTERM on every deploy or restart: finish in-flight
// requests, checkpoint and close SQLite so the WAL is folded into the database file, then exit cleanly.
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); db.close(); } catch (e) { console.error(e); }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
