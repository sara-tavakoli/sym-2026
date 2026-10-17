import { db } from "../db.js";

/**
 * Provider data layer. Matching code depends only on `ProviderDirectory` and `ProviderRecord`,
 * so a verified external provider API can be added later as another implementation.
 */
export type Verified<T> = { value: T; verified_at: string | null };
export type AccessFeature = "wheelchair" | "accessible_parking" | "hearing_loop" | "accessible_toilet";
export const ACCESS_FEATURES: AccessFeature[] = ["wheelchair", "accessible_parking", "hearing_loop", "accessible_toilet"];

export interface Category { id: string; name: string }
export interface Location { id: string; suburb: string; state: string; postcode: string; lat: number; lng: number }
export interface ProviderRecord {
  id: string;
  name: string;
  category: Category;
  is_fictional: boolean;
  data_source: string;
  clinic: { id: string; name: string; address: string | null; suburb: string; state: string; postcode: string; lat: number; lng: number; verified_at: string | null };
  languages: { values: string[]; verified_at: string | null } | null;
  telehealth: Verified<boolean> | null;
  gender: Verified<string> | null;
  hours: { day: number; opens: number; closes: number; verified_at: string | null }[];
  billing: { bulk_billing: "all" | "some" | "none"; details: string | null; verified_at: string | null } | null;
  accessibility: Partial<Record<AccessFeature, Verified<boolean>>>;
  booking: { url: string; verified_at: string | null } | null;
}
export interface BBox { minLat: number; maxLat: number; minLng: number; maxLng: number }

export interface ProviderDirectory {
  categories(): Category[];
  resolveLocation(query: string): Location | null;
  locations(): Location[];
  candidates(categoryId: string, bbox: BBox | null): ProviderRecord[];
  byIds(ids: string[]): ProviderRecord[];
}

interface Row {
  id: string; display_name: string; category_id: string; category_name: string; is_fictional: number; data_source: string;
  clinic_id: string; clinic_name: string; address: string | null; lat: number; lng: number; clinic_verified_at: string | null;
  suburb: string; state: string; postcode: string;
}

const BASE = `
  SELECT p.id, p.display_name, p.category_id, sc.name AS category_name, p.is_fictional, p.data_source,
         c.id AS clinic_id, c.name AS clinic_name, c.address, c.lat, c.lng, c.verified_at AS clinic_verified_at,
         l.suburb, l.state, l.postcode
  FROM providers p
  JOIN clinics c ON c.id = p.clinic_id
  JOIN locations l ON l.id = c.location_id
  JOIN service_categories sc ON sc.id = p.category_id`;

export class SqliteProviderDirectory implements ProviderDirectory {
  categories(): Category[] {
    return db.prepare("SELECT id, name FROM service_categories ORDER BY sort").all() as unknown as Category[];
  }
  locations(): Location[] {
    return db.prepare("SELECT * FROM locations ORDER BY suburb").all() as unknown as Location[];
  }
  resolveLocation(query: string): Location | null {
    const q = query.trim().replace(/\s+(nsw|vic|qld|wa|sa|tas|act|nt)$/i, "").replace(/,.*$/, "").trim();
    if (!q) return null;
    const row = /^\d{4}$/.test(q)
      ? db.prepare("SELECT * FROM locations WHERE postcode = ? ORDER BY suburb LIMIT 1").get(q)
      : db.prepare("SELECT * FROM locations WHERE suburb = ? COLLATE NOCASE LIMIT 1").get(q);
    return (row as unknown as Location) ?? null;
  }
  candidates(categoryId: string, bbox: BBox | null): ProviderRecord[] {
    // Category + bounding box use idx_providers_category and idx_clinics_geo; exact distance is computed after.
    const rows = bbox
      ? db.prepare(`${BASE} WHERE p.category_id = ? AND c.lat BETWEEN ? AND ? AND c.lng BETWEEN ? AND ?`).all(categoryId, bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng)
      : db.prepare(`${BASE} WHERE p.category_id = ?`).all(categoryId);
    return this.hydrate(rows as unknown as Row[]);
  }
  byIds(ids: string[]): ProviderRecord[] {
    if (!ids.length) return [];
    const rows = db.prepare(`${BASE} WHERE p.id IN (${ids.map(() => "?").join(",")})`).all(...ids) as unknown as Row[];
    const byId = new Map(this.hydrate(rows).map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is ProviderRecord => !!r);
  }

  /** Loads attributes for a batch of providers with one query per table (no N+1). */
  private hydrate(rows: Row[]): ProviderRecord[] {
    if (!rows.length) return [];
    const pIds = rows.map((r) => r.id), cIds = [...new Set(rows.map((r) => r.clinic_id))];
    const ph = (n: number) => Array(n).fill("?").join(",");
    const attrs = db.prepare(`SELECT provider_id, key, value, verified_at FROM provider_attributes WHERE provider_id IN (${ph(pIds.length)})`).all(...pIds) as { provider_id: string; key: string; value: string; verified_at: string | null }[];
    const hours = db.prepare(`SELECT clinic_id, day, opens_min, closes_min, verified_at FROM clinic_hours WHERE clinic_id IN (${ph(cIds.length)}) ORDER BY day, opens_min`).all(...cIds) as { clinic_id: string; day: number; opens_min: number; closes_min: number; verified_at: string | null }[];
    const billing = db.prepare(`SELECT clinic_id, category_id, bulk_billing, details, verified_at FROM clinic_billing WHERE clinic_id IN (${ph(cIds.length)})`).all(...cIds) as { clinic_id: string; category_id: string; bulk_billing: "all" | "some" | "none"; details: string | null; verified_at: string | null }[];
    const access = db.prepare(`SELECT clinic_id, feature, available, verified_at FROM clinic_accessibility WHERE clinic_id IN (${ph(cIds.length)})`).all(...cIds) as { clinic_id: string; feature: AccessFeature; available: number; verified_at: string | null }[];
    const booking = db.prepare(`SELECT clinic_id, url, verified_at FROM booking_links WHERE clinic_id IN (${ph(cIds.length)})`).all(...cIds) as { clinic_id: string; url: string; verified_at: string | null }[];

    return rows.map((r) => {
      const a = attrs.filter((x) => x.provider_id === r.id);
      const langs = a.filter((x) => x.key === "language");
      const tele = a.find((x) => x.key === "telehealth");
      const gender = a.find((x) => x.key === "gender");
      const bill = billing.find((b) => b.clinic_id === r.clinic_id && b.category_id === r.category_id);
      const book = booking.find((b) => b.clinic_id === r.clinic_id);
      const acc: ProviderRecord["accessibility"] = {};
      for (const x of access.filter((x) => x.clinic_id === r.clinic_id)) acc[x.feature] = { value: x.available === 1, verified_at: x.verified_at };
      return {
        id: r.id, name: r.display_name, category: { id: r.category_id, name: r.category_name },
        is_fictional: r.is_fictional === 1, data_source: r.data_source,
        clinic: { id: r.clinic_id, name: r.clinic_name, address: r.address, suburb: r.suburb, state: r.state, postcode: r.postcode, lat: r.lat, lng: r.lng, verified_at: r.clinic_verified_at },
        languages: langs.length ? { values: langs.map((l) => l.value), verified_at: langs.every((l) => l.verified_at) ? langs[0].verified_at : null } : null,
        telehealth: tele ? { value: tele.value === "yes", verified_at: tele.verified_at } : null,
        gender: gender ? { value: gender.value, verified_at: gender.verified_at } : null,
        hours: hours.filter((x) => x.clinic_id === r.clinic_id).map((x) => ({ day: x.day, opens: x.opens_min, closes: x.closes_min, verified_at: x.verified_at })),
        billing: bill ? { bulk_billing: bill.bulk_billing, details: bill.details, verified_at: bill.verified_at } : null,
        accessibility: acc,
        booking: book ? { url: book.url, verified_at: book.verified_at } : null,
      };
    });
  }
}

export const directory: ProviderDirectory = new SqliteProviderDirectory();
