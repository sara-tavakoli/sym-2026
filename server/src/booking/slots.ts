import { db } from "../db.js";
import type { ProviderRecord } from "../providers/directory.js";
import { addDays, weekday, zonedDate, zonedToUtc } from "../import/tz.js";

// Demo appointment times for a fictional clinic: 30-minute times inside its published opening hours (Sydney time),
// over the next two weeks, minus anything already booked. Nothing here comes from a real clinic.
export const SLOT_MINUTES = 30;
export const BOOKING_DAYS = 14;
const LEAD_MINUTES = 60; // earliest bookable time is an hour from now

export interface SlotDay { date: string; slots: string[] }

export function slotsFor(p: ProviderRecord, now = new Date()): SlotDay[] {
  if (!p.hours.length) return [];
  const taken = new Set((db.prepare("SELECT starts_at FROM bookings WHERE provider_id = ? AND starts_at >= ?").all(p.id, now.toISOString()) as { starts_at: string }[]).map((r) => r.starts_at));
  const earliest = now.getTime() + LEAD_MINUTES * 60_000;
  const today = zonedDate(now);
  const out: SlotDay[] = [];
  for (let i = 0; i < BOOKING_DAYS; i++) {
    const date = addDays(today, i);
    const [y, m, d] = date.split("-").map(Number);
    const day = (weekday(y, m, d) + 6) % 7; // clinic_hours: 0 = Monday
    const slots: string[] = [];
    for (const h of p.hours.filter((x) => x.day === day)) {
      for (let t = h.opens; t + SLOT_MINUTES <= h.closes; t += SLOT_MINUTES) {
        const at = zonedToUtc(y, m, d, Math.floor(t / 60), t % 60);
        const iso = at.toISOString();
        if (at.getTime() >= earliest && !taken.has(iso)) slots.push(iso);
      }
    }
    if (slots.length) out.push({ date, slots: [...new Set(slots)].sort() });
  }
  return out;
}

/** True if `iso` is one of the provider's open demo times right now. */
export function isOpenSlot(p: ProviderRecord, iso: string, now = new Date()): boolean {
  return slotsFor(p, now).some((d) => d.slots.includes(iso));
}
