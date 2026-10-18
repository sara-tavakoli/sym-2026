import type { Task, TaskCategory } from "./api";

// Colour legend (VisitReady's CATEGORY_META): urgent red, daily green, follow-up blue, one-time amber.
// The colours themselves live in components/followthrough.css as CSS variables (--cat-*), so a re-skin can retune them.
export const CATEGORY_META: Record<TaskCategory, { label: string; short: string; hint: string }> = {
  urgent: { label: "Urgent", short: "Urgent", hint: "Know when to get help quickly" },
  daily: { label: "Daily", short: "Daily", hint: "Something to do every day for a while" },
  follow_up: { label: "Follow-up appointment", short: "Follow-up", hint: "Appointments, tests or referrals to arrange" },
  one_time: { label: "One-time", short: "One-time", hint: "Do once" },
};
export const CATEGORY_ORDER: TaskCategory[] = ["urgent", "daily", "follow_up", "one_time"];
export const categoryOf = (t: Pick<Task, "category">): TaskCategory => t.category ?? "one_time";

/** Today's calendar date in Sydney (the server checks ticks against the same zone). */
export function sydneyToday(now = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const utc = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (ymd: string, n: number) => new Date(utc(ymd) + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 864e5);
export const fmtDay = (ymd: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  new Date(utc(ymd)).toLocaleDateString("en-AU", { ...opts, timeZone: "UTC" });

export const isActiveOn = (t: Task, day: string) => categoryOf(t) === "daily" && !!t.start_date && !!t.end_date && t.start_date <= day && day <= t.end_date;

/** Sorts by the legend order, keeping the original order within a category. */
export const byCategory = (tasks: Task[]) =>
  tasks.map((t, i) => ({ t, i })).sort((a, b) => CATEGORY_ORDER.indexOf(categoryOf(a.t)) - CATEGORY_ORDER.indexOf(categoryOf(b.t)) || a.i - b.i).map((x) => x.t);

// Non-clinical encouragement, shown once every daily task for today is ticked. Chosen by date so it stays put all day.
const ENCOURAGEMENTS = [
  "Small steps every day add up.",
  "You showed up for yourself today. That matters.",
  "Another day done. Nice work keeping on track.",
  "Progress, not perfection.",
  "One day at a time is still moving forward.",
  "Every tick is a promise kept to yourself.",
  "Well done. Tomorrow-you will be glad you did this.",
  "Steady and consistent. You're doing well.",
];
export const encouragementFor = (day: string) => ENCOURAGEMENTS[Math.abs(Math.floor(utc(day) / 864e5)) % ENCOURAGEMENTS.length];
