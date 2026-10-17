// FICTIONAL demonstration directory. None of these clinics or practitioners exist.
// Suburbs and approximate coordinates are real public geography so distance search can be demonstrated.
// "verified" dates are illustrative only; some attributes are deliberately unverified or missing.
import { db } from "../db.js";

export const DEMO_SOURCE = "CarePath fictional demo dataset";
const V = "2026-10-01T00:00:00.000Z"; // illustrative verification date
const h = (hhmm: string) => { const [hh, mm] = hhmm.split(":").map(Number); return hh * 60 + (mm || 0); };

export const CATEGORIES = [
  { id: "gp", name: "General practitioner (GP)" },
  { id: "dentist", name: "Dentist" },
  { id: "physiotherapist", name: "Physiotherapist" },
  { id: "psychologist", name: "Psychologist" },
  { id: "optometrist", name: "Optometrist" },
] as const;

export const LOCATIONS = [
  ["macquarie-park", "Macquarie Park", "NSW", "2113", -33.7766, 151.1255],
  ["marsfield", "Marsfield", "NSW", "2122", -33.779, 151.105],
  ["ryde", "Ryde", "NSW", "2112", -33.815, 151.104],
  ["epping", "Epping", "NSW", "2121", -33.7727, 151.082],
  ["chatswood", "Chatswood", "NSW", "2067", -33.7969, 151.1803],
  ["north-sydney", "North Sydney", "NSW", "2060", -33.8389, 151.207],
  ["sydney", "Sydney", "NSW", "2000", -33.8688, 151.2093],
  ["ultimo", "Ultimo", "NSW", "2007", -33.879, 151.198],
  ["parramatta", "Parramatta", "NSW", "2150", -33.815, 151.0011],
  ["strathfield", "Strathfield", "NSW", "2135", -33.873, 151.094],
  ["burwood", "Burwood", "NSW", "2134", -33.877, 151.104],
  ["newtown", "Newtown", "NSW", "2042", -33.897, 151.179],
  ["kensington", "Kensington", "NSW", "2033", -33.91, 151.223],
  ["bondi-junction", "Bondi Junction", "NSW", "2022", -33.893, 151.25],
  ["hornsby", "Hornsby", "NSW", "2077", -33.704, 151.099],
] as const;

type Hours = [day: number, open: string, close: string][]; // day: 0 = Monday … 6 = Sunday
const weekdays = (o: string, c: string): Hours => [0, 1, 2, 3, 4].map((d) => [d, o, c]);
type Access = Partial<Record<"wheelchair" | "accessible_parking" | "hearing_loop" | "accessible_toilet", [available: boolean, verified: boolean]>>;
interface DemoProvider { id: string; name: string; category: string; languages?: [string[], boolean]; telehealth?: [boolean, boolean]; gender?: [string, boolean] }
interface DemoClinic {
  id: string; name: string; location: string; address: string; dLat: number; dLng: number;
  hours: Hours; hoursVerified: boolean;
  billing?: { category: string; bulk: "all" | "some" | "none"; details: string; verified: boolean }[];
  access: Access; booking?: boolean; bookingVerified?: boolean;
  providers: DemoProvider[];
}

export const CLINICS: DemoClinic[] = [
  { id: "riverbend", name: "Riverbend Family Practice (Demo)", location: "macquarie-park", address: "12 Example Rd, Macquarie Park NSW", dLat: 0.002, dLng: -0.003,
    hours: [...weekdays("8:00", "18:00"), [5, "9:00", "13:00"]], hoursVerified: true,
    billing: [{ category: "gp", bulk: "all", details: "Bulk billing for all Medicare card holders (demo data)", verified: true }],
    access: { wheelchair: [true, true], accessible_parking: [true, true] }, booking: true, bookingVerified: true,
    providers: [
      { id: "ava-example", name: "Dr Ava Example", category: "gp", languages: [["English", "Mandarin"], true], telehealth: [true, true], gender: ["female", true] },
      { id: "leo-sample", name: "Dr Leo Sample", category: "gp", languages: [["English", "Arabic"], true], telehealth: [false, true], gender: ["male", true] },
    ] },
  { id: "northgate", name: "Northgate Medical Centre (Demo)", location: "ryde", address: "88 Sample St, Ryde NSW", dLat: -0.001, dLng: 0.002,
    hours: [...weekdays("9:00", "17:00"), [6, "10:00", "14:00"]], hoursVerified: true,
    billing: [{ category: "gp", bulk: "some", details: "Bulk billing for concession card holders and children under 16 (demo data)", verified: true }],
    access: { wheelchair: [true, false] }, booking: true, bookingVerified: false,
    providers: [{ id: "priya-placeholder", name: "Dr Priya Placeholder", category: "gp", languages: [["English", "Hindi", "Tamil"], true], telehealth: [true, true], gender: ["female", true] }] },
  { id: "campus-corner", name: "Campus Corner Health (Demo)", location: "marsfield", address: "3 Demo Ave, Marsfield NSW", dLat: 0.001, dLng: 0.001,
    hours: weekdays("8:30", "17:30"), hoursVerified: true,
    billing: [{ category: "gp", bulk: "all", details: "Listed as bulk billing — not yet verified (demo data)", verified: false }],
    access: { wheelchair: [true, true] },
    providers: [{ id: "sam-demo", name: "Dr Sam Demo", category: "gp", languages: [["English", "Korean"], true], telehealth: [true, true] }] },
  { id: "kensington-student", name: "Kensington Student Health (Demo)", location: "kensington", address: "1 Placeholder Walk, Kensington NSW", dLat: 0.001, dLng: -0.002,
    hours: weekdays("8:30", "19:00"), hoursVerified: true,
    billing: [{ category: "gp", bulk: "all", details: "Bulk billing for students with Medicare or OSHC (demo data)", verified: true }],
    access: { wheelchair: [true, true], accessible_toilet: [true, true] }, booking: true, bookingVerified: true,
    providers: [
      { id: "ivy-example", name: "Dr Ivy Example", category: "gp", languages: [["English", "Indonesian", "Malay"], true], telehealth: [true, true], gender: ["female", true] },
      { id: "max-placeholder", name: "Dr Max Placeholder", category: "gp", languages: [["English", "Mandarin"], true], telehealth: [true, true], gender: ["male", true] },
    ] },
  { id: "strathfield-family", name: "Strathfield Family Doctors (Demo)", location: "strathfield", address: "45 Fixture Rd, Strathfield NSW", dLat: 0.001, dLng: 0.001,
    hours: [[0, "8:00", "20:00"], [1, "8:00", "20:00"], [2, "8:00", "20:00"], [3, "8:00", "20:00"], [4, "8:00", "20:00"], [5, "8:00", "20:00"], [6, "8:00", "20:00"]], hoursVerified: true,
    billing: [{ category: "gp", bulk: "all", details: "Bulk billing for Medicare card holders (demo data)", verified: true }],
    access: {},
    providers: [{ id: "jun-sample", name: "Dr Jun Sample", category: "gp", languages: [["English", "Korean", "Mandarin"], true], telehealth: [false, true], gender: ["male", true] }] },
  { id: "harbour-smiles", name: "Harbour Smiles Dental (Demo)", location: "north-sydney", address: "200 Example St, North Sydney NSW", dLat: -0.001, dLng: -0.001,
    hours: [...weekdays("8:00", "17:00"), [5, "8:00", "14:00"]], hoursVerified: true,
    billing: [{ category: "dentist", bulk: "none", details: "Private fees apply (demo data)", verified: true }],
    access: { wheelchair: [true, true] }, booking: true, bookingVerified: true,
    providers: [
      { id: "mia-testcase", name: "Dr Mia Testcase", category: "dentist", languages: [["English", "Cantonese"], true], gender: ["female", true] },
      { id: "omar-fixture", name: "Dr Omar Fixture", category: "dentist", languages: [["English", "Arabic", "French"], true], gender: ["male", true] },
    ] },
  { id: "chatswood-dental", name: "Chatswood Dental Studio (Demo)", location: "chatswood", address: "9 Mockup Lane, Chatswood NSW", dLat: 0.001, dLng: -0.001,
    hours: [[1, "9:00", "17:00"], [2, "9:00", "17:00"], [3, "9:00", "17:00"], [4, "9:00", "17:00"], [5, "9:00", "17:00"]], hoursVerified: true,
    billing: [{ category: "dentist", bulk: "some", details: "Bulk billing for eligible children under the Child Dental Benefits Schedule (demo data)", verified: true }],
    access: { wheelchair: [false, true] }, booking: true, bookingVerified: true,
    providers: [{ id: "ken-mockup", name: "Dr Ken Mockup", category: "dentist", languages: [["English", "Mandarin", "Japanese"], true], gender: ["male", true] }] },
  { id: "parramatta-dental", name: "Parramatta Dental Care (Demo)", location: "parramatta", address: "77 Sample Pde, Parramatta NSW", dLat: 0.002, dLng: 0.001,
    hours: [...weekdays("8:00", "18:00"), [5, "8:00", "18:00"], [6, "9:00", "13:00"]], hoursVerified: false,
    access: {}, booking: true, bookingVerified: true,
    providers: [{ id: "lina-example", name: "Dr Lina Example", category: "dentist", languages: [["English", "Vietnamese"], true], gender: ["female", true] }] },
  { id: "movewell", name: "MoveWell Physiotherapy (Demo)", location: "epping", address: "5 Demo Cres, Epping NSW", dLat: -0.001, dLng: 0.001,
    hours: [...weekdays("7:00", "19:00"), [5, "8:00", "12:00"]], hoursVerified: true,
    billing: [{ category: "physiotherapist", bulk: "none", details: "Private fees apply (demo data)", verified: true }],
    access: { wheelchair: [true, true], accessible_parking: [true, true], accessible_toilet: [true, true] }, booking: true, bookingVerified: true,
    providers: [
      { id: "jordan-sample", name: "Jordan Sample", category: "physiotherapist", languages: [["English", "Greek"], true], telehealth: [true, true], gender: ["male", true] },
      { id: "chloe-demo", name: "Chloe Demo", category: "physiotherapist", languages: [["English"], true], telehealth: [false, true], gender: ["female", true] },
    ] },
  { id: "city-sports", name: "City Sports Physio (Demo)", location: "sydney", address: "300 Placeholder St, Sydney NSW", dLat: 0.001, dLng: -0.002,
    hours: [...weekdays("6:30", "20:00"), [5, "8:00", "14:00"]], hoursVerified: true,
    billing: [{ category: "physiotherapist", bulk: "none", details: "Private fees apply (demo data)", verified: true }],
    access: { wheelchair: [true, false] }, booking: true, bookingVerified: true,
    providers: [{ id: "ravi-placeholder", name: "Ravi Placeholder", category: "physiotherapist", languages: [["English", "Hindi", "Punjabi"], true], telehealth: [true, false], gender: ["male", true] }] },
  { id: "parramatta-physio", name: "Parramatta Physio Hub (Demo)", location: "parramatta", address: "12 Fixture St, Parramatta NSW", dLat: -0.002, dLng: 0.002,
    hours: [...weekdays("7:00", "18:00"), [5, "7:00", "18:00"]], hoursVerified: true,
    billing: [{ category: "physiotherapist", bulk: "none", details: "Private fees apply (demo data)", verified: true }],
    access: { wheelchair: [true, true] },
    providers: [{ id: "sofia-example", name: "Sofia Example", category: "physiotherapist", languages: [["English", "Spanish", "Arabic"], true], telehealth: [false, true], gender: ["female", true] }] },
  { id: "clearview", name: "Clearview Psychology (Demo)", location: "chatswood", address: "50 Example Way, Chatswood NSW", dLat: -0.002, dLng: 0.001,
    hours: [...weekdays("9:00", "20:00"), [5, "9:00", "13:00"]], hoursVerified: true,
    billing: [{ category: "psychologist", bulk: "some", details: "Some sessions bulk billed under a Mental Health Treatment Plan — confirm eligibility (demo data)", verified: true }],
    access: { wheelchair: [true, true], hearing_loop: [true, true] }, booking: true, bookingVerified: true,
    providers: [
      { id: "hannah-example", name: "Dr Hannah Example", category: "psychologist", languages: [["English", "Mandarin"], true], telehealth: [true, true], gender: ["female", true] },
      { id: "theo-sample", name: "Dr Theo Sample", category: "psychologist", languages: [["English"], true], telehealth: [true, true], gender: ["male", true] },
    ] },
  { id: "inner-west", name: "Inner West Wellbeing (Demo)", location: "newtown", address: "21 Mockup St, Newtown NSW", dLat: 0.001, dLng: 0.001,
    hours: [[1, "12:00", "20:00"], [2, "12:00", "20:00"], [3, "12:00", "20:00"]], hoursVerified: false,
    access: {},
    providers: [{ id: "alex-fixture", name: "Alex Fixture", category: "psychologist", languages: [["English", "Spanish"], false], telehealth: [true, true] }] },
  { id: "hornsby-mind", name: "Hornsby Mind Clinic (Demo)", location: "hornsby", address: "8 Sample Rd, Hornsby NSW", dLat: 0.001, dLng: -0.001,
    hours: weekdays("9:00", "17:00"), hoursVerified: true,
    billing: [{ category: "psychologist", bulk: "none", details: "Private fees apply (demo data)", verified: true }],
    access: { wheelchair: [true, true], accessible_parking: [true, true] },
    providers: [{ id: "grace-testcase", name: "Dr Grace Testcase", category: "psychologist", languages: [["English", "Korean"], true], telehealth: [false, true], gender: ["female", true] }] },
  { id: "clearsight", name: "ClearSight Optometry (Demo)", location: "macquarie-park", address: "Shop 4, 1 Demo Plaza, Macquarie Park NSW", dLat: -0.002, dLng: 0.002,
    hours: [...weekdays("9:00", "18:00"), [5, "9:00", "18:00"], [6, "10:00", "16:00"]], hoursVerified: true,
    billing: [{ category: "optometrist", bulk: "all", details: "Bulk-billed standard eye tests for Medicare card holders (demo data)", verified: true }],
    access: { wheelchair: [true, true], accessible_parking: [true, true] }, booking: true, bookingVerified: true,
    providers: [{ id: "noah-demo", name: "Noah Demo", category: "optometrist", languages: [["English", "Mandarin", "Cantonese"], true], gender: ["male", true] }] },
  { id: "bondi-eye", name: "Bondi Eye Care (Demo)", location: "bondi-junction", address: "60 Placeholder Rd, Bondi Junction NSW", dLat: 0.001, dLng: -0.001,
    hours: [...weekdays("9:00", "17:30"), [5, "9:00", "15:00"]], hoursVerified: false,
    billing: [{ category: "optometrist", bulk: "some", details: "Listed as bulk billing some eye tests — not yet verified (demo data)", verified: false }],
    access: {},
    providers: [{ id: "ella-sample", name: "Ella Sample", category: "optometrist", languages: [["English", "Portuguese"], true], gender: ["female", true] }] },
  { id: "burwood-optical", name: "Burwood Optical (Demo)", location: "burwood", address: "15 Example Pde, Burwood NSW", dLat: -0.001, dLng: 0.001,
    hours: [...weekdays("9:00", "17:30"), [5, "9:00", "16:00"]], hoursVerified: true,
    billing: [{ category: "optometrist", bulk: "all", details: "Bulk-billed standard eye tests for Medicare card holders (demo data)", verified: true }],
    access: { wheelchair: [true, true] }, booking: true, bookingVerified: true,
    providers: [{ id: "daniel-mockup", name: "Daniel Mockup", category: "optometrist", languages: [["English", "Cantonese"], true], gender: ["male", true] }] },
];

/** Idempotent: categories/locations upsert; the demo clinics are inserted once if the directory is empty. */
export function ensureDemoDirectory() {
  const insCat = db.prepare("INSERT OR IGNORE INTO service_categories (id, name, sort) VALUES (?,?,?)");
  CATEGORIES.forEach((c, i) => insCat.run(c.id, c.name, i));
  const insLoc = db.prepare("INSERT OR IGNORE INTO locations (id, suburb, state, postcode, lat, lng) VALUES (?,?,?,?,?,?)");
  for (const l of LOCATIONS) insLoc.run(...l);
  if ((db.prepare("SELECT COUNT(*) AS n FROM clinics").get() as { n: number }).n > 0) return;

  const loc = new Map(LOCATIONS.map((l) => [l[0], l]));
  db.exec("BEGIN");
  try {
    const insClinic = db.prepare("INSERT INTO clinics (id, name, location_id, address, lat, lng, is_fictional, data_source, source_ref, verified_at) VALUES (?,?,?,?,?,?,1,?,?,?)");
    const insHours = db.prepare("INSERT INTO clinic_hours (clinic_id, day, opens_min, closes_min, verified_at, source) VALUES (?,?,?,?,?,?)");
    const insBill = db.prepare("INSERT INTO clinic_billing (clinic_id, category_id, bulk_billing, details, verified_at, source) VALUES (?,?,?,?,?,?)");
    const insAcc = db.prepare("INSERT INTO clinic_accessibility (clinic_id, feature, available, verified_at, source) VALUES (?,?,?,?,?)");
    const insBook = db.prepare("INSERT INTO booking_links (clinic_id, url, verified_at, source) VALUES (?,?,?,?)");
    const insProv = db.prepare("INSERT INTO providers (id, clinic_id, display_name, category_id, is_fictional, data_source, verified_at) VALUES (?,?,?,?,1,?,?)");
    const insAttr = db.prepare("INSERT INTO provider_attributes (provider_id, key, value, verified_at, source) VALUES (?,?,?,?,?)");
    for (const c of CLINICS) {
      const l = loc.get(c.location as (typeof LOCATIONS)[number][0])!;
      insClinic.run(c.id, c.name, c.location, c.address, l[4] + c.dLat, l[5] + c.dLng, DEMO_SOURCE, `demo:${c.id}`, V);
      for (const [d, o, cl] of c.hours) insHours.run(c.id, d, h(o), h(cl), c.hoursVerified ? V : null, DEMO_SOURCE);
      for (const b of c.billing ?? []) insBill.run(c.id, b.category, b.bulk, b.details, b.verified ? V : null, DEMO_SOURCE);
      for (const [f, [avail, ver]] of Object.entries(c.access)) insAcc.run(c.id, f, avail ? 1 : 0, ver ? V : null, DEMO_SOURCE);
      if (c.booking) insBook.run(c.id, `https://example.com/carepath-demo/book/${c.id}`, c.bookingVerified ? V : null, DEMO_SOURCE);
      for (const p of c.providers) {
        insProv.run(p.id, c.id, p.name, p.category, DEMO_SOURCE, V);
        if (p.languages) for (const lang of p.languages[0]) insAttr.run(p.id, "language", lang, p.languages[1] ? V : null, DEMO_SOURCE);
        if (p.telehealth) insAttr.run(p.id, "telehealth", p.telehealth[0] ? "yes" : "no", p.telehealth[1] ? V : null, DEMO_SOURCE);
        if (p.gender) insAttr.run(p.id, "gender", p.gender[0], p.gender[1] ? V : null, DEMO_SOURCE);
      }
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}
