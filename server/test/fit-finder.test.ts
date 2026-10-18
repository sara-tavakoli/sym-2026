// Fit Finder: deterministic matching over the fictional demo directory, plus AI preference extraction (mocked).
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.DATABASE_PATH = ":memory:";
delete process.env.GEMINI_API_KEY;
const { setAiClient } = await import("../src/ai/client.js");
const { verifyPreferences } = await import("../src/ai/preferences.js");
const { evaluate, prefsSchema } = await import("../src/providers/matching.js");

let server: Server; let base = "";
let c: Client;
after(() => server.close());
afterEach(() => setAiClient(null));

class Client {
  cookie = "";
  async call(method: string, path: string, body?: unknown) {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get("set-cookie"); if (set) this.cookie = set.split(";")[0];
    return { status: r.status, data: (await r.json().catch(() => null)) as any };
  }
}
before(async () => {
  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}`;
  c = new Client();
  await c.call("POST", "/api/auth/register", { email: "ff@example.com", password: "password123", name: "FF" });
});
const status = (item: any, key: string) => item.checks.find((x: any) => x.key === key)?.status;

test("search is public; saved searches and AI request reading need an account", async () => {
  assert.equal((await new Client().call("GET", "/api/fit-finder/search?category=gp")).status, 200);
  assert.equal((await new Client().call("GET", "/api/fit-finder/meta")).status, 200);
  assert.equal((await new Client().call("GET", "/api/fit-finder/saved")).status, 401);
  assert.equal((await new Client().call("POST", "/api/fit-finder/extract", { text: "a GP near Ryde" })).status, 401);
});

test("meta lists categories, covered suburbs and the fictional-data notice", async () => {
  const m = (await c.call("GET", "/api/fit-finder/meta")).data;
  assert.deepEqual(m.categories.map((x: any) => x.id), ["gp", "dentist", "physiotherapist", "psychologist", "optometrist"]);
  assert.ok(m.locations.some((l: any) => l.suburb === "Macquarie Park"));
  assert.match(m.notice, /fictional/);
});

test("search validates input", async () => {
  assert.equal((await c.call("GET", "/api/fit-finder/search")).status, 400);
  assert.equal((await c.call("GET", "/api/fit-finder/search?category=surgeon")).status, 400);
  assert.equal((await c.call("GET", "/api/fit-finder/search?category=gp&radius_km=7")).status, 400);
  assert.equal((await c.call("GET", "/api/fit-finder/search?category=gp&days=funday")).status, 400);
  const unknown = await c.call("GET", "/api/fit-finder/search?category=gp&location=Atlantis");
  assert.equal(unknown.status, 422);
  assert.equal(unknown.data.code, "unknown_location");
});

test("distance is a hard filter and results are only the requested category", async () => {
  const r = (await c.call("GET", "/api/fit-finder/search?category=gp&location=Macquarie%20Park&radius_km=5&pageSize=20")).data;
  assert.ok(r.total >= 2);
  assert.ok(r.items.every((i: any) => i.provider.category.id === "gp" && i.distance_km <= 5));
  assert.ok(r.items.every((i: any) => i.provider.is_fictional === true));
  const byPostcode = (await c.call("GET", "/api/fit-finder/search?category=gp&location=2113&radius_km=5&pageSize=20")).data;
  assert.equal(byPostcode.total, r.total);
});

test("statuses come from stored attributes; missing or unverified data is never a match", async () => {
  const r = (await c.call("GET", "/api/fit-finder/search?category=gp&location=Macquarie%20Park&radius_km=10&days=sat,sun&bulk_billing=true&accessibility=hearing_loop&pageSize=20")).data;
  const ava = r.items.find((i: any) => i.provider.id === "ava-example");
  assert.equal(status(ava, "days"), "met"); // Riverbend: Saturday hours, verified
  assert.equal(status(ava, "billing"), "met"); // verified bulk billing for all
  assert.equal(status(ava, "access:hearing_loop"), "unverified"); // not listed -> not verified, not a match
  const priya = r.items.find((i: any) => i.provider.id === "priya-placeholder");
  assert.equal(status(priya, "billing"), "partial"); // "some" patients
  const sam = r.items.find((i: any) => i.provider.id === "sam-demo");
  assert.equal(status(sam, "billing"), "unverified"); // listed but not verified
  assert.equal(status(sam, "days"), "not_met"); // weekdays only, verified
  // Ranking: Riverbend (2 met) ahead of Campus Corner
  assert.ok(r.items.indexOf(ava) < r.items.indexOf(sam));
  assert.match(ava.why, /Meets \d of \d preferences/);
});

test("published hours are labelled as hours, not availability", async () => {
  const r = (await c.call("GET", "/api/fit-finder/search?category=dentist&location=Parramatta&days=sun&pageSize=20")).data;
  const lina = r.items.find((i: any) => i.provider.id === "lina-example");
  assert.equal(status(lina, "days"), "unverified"); // hours exist but are not verified
  assert.match(lina.checks.find((x: any) => x.key === "days").detail, /published hours, not verified/);
});

test("telehealth searches ignore distance and require verified telehealth for a match", async () => {
  const r = (await c.call("GET", "/api/fit-finder/search?category=psychologist&location=Macquarie%20Park&radius_km=2&mode=telehealth&pageSize=20")).data;
  assert.ok(r.total >= 3); // distance not applied
  assert.equal(status(r.items.find((i: any) => i.provider.id === "grace-testcase"), "mode"), "not_met");
  assert.equal(status(r.items[0], "mode"), "met");
});

test("strict mode removes providers with an unmet preference but keeps unverified ones", async () => {
  const loose = (await c.call("GET", "/api/fit-finder/search?category=gp&location=Macquarie%20Park&radius_km=10&days=sat&pageSize=20")).data;
  const strict = (await c.call("GET", "/api/fit-finder/search?category=gp&location=Macquarie%20Park&radius_km=10&days=sat&strict=true&pageSize=20")).data;
  assert.ok(strict.total < loose.total);
  assert.ok(strict.items.every((i: any) => i.summary.not_met === 0));
  assert.equal(strict.excluded_strict, loose.total - strict.total);
});

test("pagination", async () => {
  const p1 = (await c.call("GET", "/api/fit-finder/search?category=gp&pageSize=2&page=1")).data;
  const p2 = (await c.call("GET", "/api/fit-finder/search?category=gp&pageSize=2&page=2")).data;
  assert.equal(p1.items.length, 2);
  assert.equal(p1.total, p2.total);
  assert.notEqual(p1.items[0].provider.id, p2.items[0].provider.id);
});

test("compare 2–3 providers against the same preferences", async () => {
  const r = await c.call("GET", "/api/fit-finder/compare?ids=ava-example,priya-placeholder,sam-demo&bulk_billing=true&location=Macquarie%20Park");
  assert.equal(r.status, 200);
  assert.equal(r.data.items.length, 3);
  assert.deepEqual(r.data.items.map((i: any) => status(i, "billing")), ["met", "partial", "unverified"]);
  assert.equal((await c.call("GET", "/api/fit-finder/compare?ids=ava-example")).status, 400);
  assert.equal((await c.call("GET", "/api/fit-finder/compare?ids=a,b,c,d")).status, 400);
  assert.equal((await c.call("GET", "/api/fit-finder/compare?ids=nope1,nope2")).status, 404);
});

test("saved searches are validated and private", async () => {
  const s = await c.call("POST", "/api/fit-finder/saved", { name: "Weekend GP", prefs: { category: "gp", location: "Macquarie Park", days: ["sat"] } });
  assert.equal(s.status, 201);
  assert.equal((await c.call("POST", "/api/fit-finder/saved", { name: "Bad", prefs: { category: "gp", radius_km: 3 } })).status, 400);
  const other = new Client();
  await other.call("POST", "/api/auth/register", { email: "ff-other@example.com", password: "password123", name: "O" });
  assert.equal((await other.call("GET", "/api/fit-finder/saved")).data.items.length, 0);
  assert.equal((await other.call("DELETE", `/api/fit-finder/saved/${s.data.id}`)).status, 404);
  assert.equal((await c.call("GET", "/api/fit-finder/saved")).data.items[0].name, "Weekend GP");
  assert.equal((await c.call("DELETE", `/api/fit-finder/saved/${s.data.id}`)).status, 200);
});

const text = "I'm looking for a GP around Macquarie Park, preferably on weekends, with bulk billing if available.";
test("verifyPreferences keeps only quoted, explicit preferences", () => {
  const r = verifyPreferences({ items: [
    { field: "category", value: "gp", quote: "GP" },
    { field: "location", value: "Macquarie Park", quote: "around Macquarie Park" },
    { field: "day", value: "weekend", quote: "on weekends" },
    { field: "bulk_billing", value: "yes", quote: "bulk billing" },
    { field: "mode", value: "telehealth", quote: "on weekends" }, // quote doesn't express telehealth
    { field: "language", value: "Mandarin", quote: "Mandarin" }, // not in text
    { field: "practitioner_gender", value: "female", quote: "GP" }, // not stated
  ] }, text);
  assert.deepEqual(r.prefs, { category: "gp", location: "Macquarie Park", days: ["sat", "sun"], bulk_billing: true });
  assert.equal(r.dropped, 3);
});

test("service type is never inferred from symptoms", () => {
  const r = verifyPreferences({ items: [{ field: "category", value: "physiotherapist", quote: "my back hurts" }] }, "my back hurts, need someone in Epping");
  assert.equal(r.prefs.category, undefined);
});

test("extract endpoint returns verified preferences and location coverage", async () => {
  setAiClient({ async json() { return { items: [
    { field: "category", value: "dentist", quote: "dentist" },
    { field: "location", value: "Sydney", quote: "around Sydney" },
    { field: "day", value: "sat", quote: "Saturday appointments" },
  ] }; } });
  const r = await c.call("POST", "/api/fit-finder/extract", { text: "I need a dentist around Sydney who offers Saturday appointments." });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.prefs, { category: "dentist", location: "Sydney", days: ["sat"] });
  assert.equal(r.data.location_known, true);
  assert.equal((await c.call("POST", "/api/fit-finder/extract", { text: "" })).status, 400);
});

test("evaluate() unit: verified negative is not_met, missing is unverified", () => {
  const base = { id: "x", name: "X", category: { id: "gp", name: "GP" }, is_fictional: true, data_source: "test",
    clinic: { id: "c", name: "C", address: null, suburb: "S", state: "NSW", postcode: "2000", lat: 0, lng: 0, verified_at: null },
    languages: null, telehealth: null, gender: null, hours: [], billing: null, accessibility: {}, booking: null };
  const prefs = prefsSchema.parse({ category: "gp", mode: "telehealth", accessibility: "wheelchair", language: "Greek" });
  const missing = evaluate(base, prefs, null);
  assert.ok(missing.checks.every((ch) => ch.status === "unverified"));
  const neg = evaluate({ ...base, telehealth: { value: false, verified_at: "2026-01-01" }, accessibility: { wheelchair: { value: false, verified_at: "2026-01-01" } }, languages: { values: ["English"], verified_at: "2026-01-01" } }, prefs, null);
  assert.ok(neg.checks.every((ch) => ch.status === "not_met"));
});
