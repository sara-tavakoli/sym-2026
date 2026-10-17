// Creates a demo account with FICTIONAL appointments only (no AI content: generate that live in the demo).
// Usage: npm run seed      Login: demo@carepath.example / demo-password-1
import { db } from "../src/db.js";
import { hashPassword, newId } from "../src/auth.js";

const email = "demo@carepath.example";
if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
  console.log("Demo user already exists — nothing to do.");
  process.exit(0);
}
const uid = newId();
db.prepare("INSERT INTO users (id, email, name, password_hash) VALUES (?,?,?,?)").run(uid, email, "Demo Student", await hashPassword("demo-password-1"));

const day = (offset: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const ins = db.prepare("INSERT INTO appointments (id, user_id, starts_at, practitioner_name, service_type, clinic_name, location, purpose) VALUES (?,?,?,?,?,?,?,?)");
ins.run(newId(), uid, day(3, 10), "Dr Alex Example", "General Practitioner (GP)", "Campus Health Clinic (fictional)", "Building 4, Demo University", "Ongoing headaches (fictional scenario)");
ins.run(newId(), uid, day(-4, 14), "Sam Sample", "Physiotherapy", "Riverside Physio (fictional)", null, "Sore ankle review (fictional scenario)");
console.log("Seeded demo user:", email, "/ demo-password-1");
