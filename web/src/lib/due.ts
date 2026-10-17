// Due-date labels ("Due Thu 23 Oct", "Overdue by 2 days") from a task's computed due_date (YYYY-MM-DD).

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const utc = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d); };

export const fmtDueDay = (ymd: string) =>
  new Date(utc(ymd)).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export interface DueInfo { label: string; tone: "danger" | "warn" | "info" }

export function dueInfo(dueDate: string | null | undefined, completed = false): DueInfo | null {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  if (completed) return { label: `Due ${fmtDueDay(dueDate)}`, tone: "info" };
  const days = Math.round((utc(dueDate) - utc(localToday())) / 864e5);
  if (days < 0) return { label: `Overdue by ${-days} day${days === -1 ? "" : "s"}`, tone: "danger" };
  if (days === 0) return { label: "Due today", tone: "warn" };
  if (days === 1) return { label: "Due tomorrow", tone: "warn" };
  return { label: `Due ${fmtDueDay(dueDate)}`, tone: days <= 3 ? "warn" : "info" };
}
