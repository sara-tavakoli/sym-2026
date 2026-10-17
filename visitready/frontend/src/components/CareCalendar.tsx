import { useState } from "react";
import { addMonths, differenceInCalendarDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { CalendarCheck2, ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CATEGORY_META } from "@/lib/types";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

export const QUOTES = [
  "Small steps every day add up to big changes.",
  "You showed up for yourself today. That matters.",
  "Healing isn't a race — consistency wins.",
  "Another day done. Your future self says thank you.",
  "Progress, not perfection.",
  "Taking care of yourself is a quiet kind of strength.",
  "One day at a time is still moving forward.",
  "You're building a habit that helps you heal.",
  "Rest, recover, repeat. You're doing great.",
  "Every tick is a promise kept to yourself.",
  "Your body is doing the work — you're giving it what it needs.",
  "Halfway there or nearly done — either way, keep going.",
  "Well done. Tomorrow-you will be glad you did this.",
  "Steady care today, a better tomorrow.",
];

export const quoteFor = (iso: string) => QUOTES[Math.abs(differenceInCalendarDays(parseISO(iso), parseISO("2026-01-01"))) % QUOTES.length];

export const isActiveOn = (t: Task, iso: string) => t.category === "daily" && !!t.start_date && !!t.end_date && t.start_date <= iso && iso <= t.end_date;

export function DayQuote({ date, testid }: { date: string; testid: string }) {
  return (
    <div data-testid={testid} className="rounded-2xl bg-[#DCFCE7] border border-[#BBF7D0] p-4 text-[#166534] animate-fade-up">
      <p className="text-[10px] uppercase tracking-[0.15em] font-semibold flex items-center gap-1"><CalendarCheck2 className="size-3.5" /> All done for {format(parseISO(date), "EEE d MMM")}</p>
      <p className="mt-1 font-heading text-lg leading-snug flex gap-2"><Quote className="size-4 shrink-0 mt-1 opacity-60" />{quoteFor(date)}</p>
    </div>
  );
}

export default function CareCalendar({ tasks, today, onToggle, busy }: {
  tasks: Task[]; today: string; onToggle: (task: Task, date: string, done: boolean) => void; busy: boolean;
}) {
  const [month, setMonth] = useState(() => startOfMonth(parseISO(today)));
  const [selected, setSelected] = useState(today);
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const daily = tasks.filter((t) => t.category === "daily" && t.status !== "suggested");
  const followUps = tasks.filter((t) => t.category === "follow_up" && t.due_date && t.status !== "suggested");
  const dayDaily = daily.filter((t) => isActiveOn(t, selected));
  const dayFollow = followUps.filter((t) => t.due_date === selected);
  const allDone = dayDaily.length > 0 && dayDaily.every((t) => t.done_dates.includes(selected));

  return (
    <div data-testid="care-calendar" className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="rounded-3xl bg-white border border-line p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h3 data-testid="calendar-month-label" className="text-xl text-ink">{format(month, "MMMM yyyy")}</h3>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous month" data-testid="calendar-prev-btn" onClick={() => setMonth((m) => subMonths(m, 1))}><ChevronLeft className="size-4" /></Button>
            <Button variant="outline" size="sm" data-testid="calendar-today-btn" onClick={() => { setMonth(startOfMonth(parseISO(today))); setSelected(today); }}>Today</Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next month" data-testid="calendar-next-btn" onClick={() => setMonth((m) => addMonths(m, 1))}><ChevronRight className="size-4" /></Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 text-[10px] uppercase tracking-[0.15em] text-ink-muted">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-1 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 border-t border-l border-line">
          {days.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const dt = daily.filter((t) => isActiveOn(t, iso));
            const fu = followUps.filter((t) => t.due_date === iso);
            const done = dt.length > 0 && dt.every((t) => t.done_dates.includes(iso));
            return (
              <button
                key={iso}
                data-testid={`calendar-day-${iso}`}
                onClick={() => setSelected(iso)}
                className={cn(
                  "min-h-20 sm:min-h-24 border-r border-b border-line p-1 text-left align-top transition-colors duration-150 hover:bg-cream",
                  !isSameMonth(d, month) && "bg-sand/30 text-ink-muted/60",
                  selected === iso && "bg-eucalypt-soft/60",
                )}
              >
                <span className={cn("inline-grid place-items-center size-6 rounded-full text-xs", iso === today ? "bg-eucalypt text-white font-semibold" : "text-ink")}>{format(d, "d")}</span>
                <div className="mt-0.5 space-y-0.5">
                  {fu.map((t) => <span key={t.id} className={cn("block truncate rounded px-1 text-[10px] font-medium", CATEGORY_META.follow_up.chip)}>{t.title}</span>)}
                  {dt.length > 0 && (
                    <span className={cn("block truncate rounded px-1 text-[10px] font-medium", CATEGORY_META.daily.chip)}>
                      {done ? "✓ " : ""}{dt.length} daily
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-muted">
          {(["daily", "follow_up", "one_time", "urgent"] as const).map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", CATEGORY_META[c].dot)} />{CATEGORY_META[c].label}</span>
          ))}
        </div>
      </div>

      <aside data-testid="calendar-day-panel" className="rounded-3xl bg-white border border-line p-5 space-y-3 h-fit">
        <p className="text-[10px] uppercase tracking-[0.15em] text-ink-muted">{selected === today ? "Today" : selected < today ? "Past day" : "Upcoming"}</p>
        <h3 data-testid="calendar-selected-date" className="text-xl text-ink -mt-2">{format(parseISO(selected), "EEEE d MMMM")}</h3>
        {dayDaily.length === 0 && dayFollow.length === 0 && <p className="text-sm text-ink-muted">Nothing scheduled for this day.</p>}
        {dayDaily.map((t) => {
          const dayNum = differenceInCalendarDays(parseISO(selected), parseISO(t.start_date!)) + 1;
          const checked = t.done_dates.includes(selected);
          return (
            <label key={t.id} className={cn("flex gap-3 items-start rounded-2xl border border-l-4 p-3 cursor-pointer", CATEGORY_META.daily.border, checked ? "bg-[#F0FDF4] border-[#BBF7D0]" : "border-line")}>
              <Checkbox
                data-testid={`calendar-tick-${t.id}`}
                checked={checked}
                disabled={busy || selected > today}
                onCheckedChange={(c) => onToggle(t, selected, c === true)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{t.title}</span>
                <span className="block text-[11px] text-ink-muted">Day {dayNum} of {t.duration_days}{selected > today && " · can't tick future days"}</span>
              </span>
            </label>
          );
        })}
        {dayFollow.map((t) => (
          <div key={t.id} className={cn("rounded-2xl border border-line border-l-4 p-3", CATEGORY_META.follow_up.border)}>
            <p className="text-sm font-medium text-ink">{t.title}</p>
            <p className="text-[11px] text-[#1E40AF]">Deadline set from your clinician's timeframe</p>
          </div>
        ))}
        {allDone && <DayQuote date={selected} testid="calendar-day-quote" />}
        {dayDaily.length > 0 && !allDone && selected <= today && (
          <p className="text-[11px] text-ink-muted">Tick off today's daily tasks to unlock a little encouragement.</p>
        )}
        {selected !== today && <button className="text-xs text-eucalypt font-semibold" data-testid="calendar-jump-today" onClick={() => setSelected(today)}>Jump to today</button>}
      </aside>
    </div>
  );
}
