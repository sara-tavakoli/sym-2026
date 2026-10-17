import { useState } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, eachDayOfInterval, format, parseISO } from "date-fns";
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, CheckCircle2, Download, Lock, Quote, RotateCcw, Sparkles, Stethoscope } from "lucide-react";
import AppShell from "@/components/AppShell";
import AuditTimeline from "@/components/AuditTimeline";
import CareCalendar, { DayQuote, isActiveOn } from "@/components/CareCalendar";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiPatch, apiPost } from "@/lib/api";
import { formatDateTime, useToday, useVisit, useVisitMutation } from "@/lib/hooks";
import { useSignedIn, vurl } from "@/lib/persona";
import { CATEGORY_META } from "@/lib/types";
import type { ConfirmTasksRequest, Task, TaskCategory, TaskDayToggle, TaskStatusUpdate, Visit } from "@/lib/types";
import { cn } from "@/lib/utils";

const ORDER: TaskCategory[] = ["urgent", "follow_up", "one_time", "daily"];

function CategoryChip({ c }: { c: TaskCategory }) {
  return <Badge className={cn("text-[11px] gap-1", CATEGORY_META[c].chip)}><span className={cn("size-1.5 rounded-full", CATEGORY_META[c].dot)} />{CATEGORY_META[c].label}</Badge>;
}

function schedule(t: Task, today: string): string | null {
  if (t.category === "daily") return t.start_date ? `Every day · ${format(parseISO(t.start_date), "d MMM")} – ${format(parseISO(t.end_date!), "d MMM")} (${t.duration_days} days)` : `Every day for ${t.duration_days} days, starting when you accept`;
  if (t.category === "follow_up") {
    if (!t.due_date) return t.due_in_days ? `Due ${t.due_in_days} days after your visit` : null;
    const left = differenceInCalendarDays(parseISO(t.due_date), parseISO(today));
    return `Deadline ${format(parseISO(t.due_date), "EEE d MMM")} · ${left > 0 ? `${left} days left` : left === 0 ? "due today" : `${-left} days overdue`}`;
  }
  if (t.category === "urgent") return "Keep in mind — act straight away if this happens";
  return null;
}

function SourceQuote({ task }: { task: Task }) {
  return (
    <div className="mt-2 rounded-xl bg-cream border border-line p-2.5 text-xs text-ink-muted">
      <span className="flex items-center gap-1 font-semibold text-eucalypt"><Quote className="size-3" /> Approved instruction{task.verbatim && " · verbatim"}</span>
      <p data-testid={`task-source-${task.id}`} className="mt-1 text-ink leading-relaxed">“{task.source_text}”</p>
    </div>
  );
}

export default function FollowThrough() {
  const { data: v, isLoading, isError } = useVisit();
  const approved = v?.consult.status === "approved";
  const tasks = v?.tasks ?? [];
  const suggested = tasks.filter((t) => t.status === "suggested");
  const active = tasks.filter((t) => t.status !== "suggested");
  const done = active.filter((t) => t.status === "completed").length;
  const toggle = useVisitMutation((b: { id: string } & TaskDayToggle) => apiPost<Visit>(vurl(`/visit/tasks/${b.id}/day`), { date: b.date, done: b.done }));
  const onToggle = (t: Task, date: string, d: boolean) => toggle.mutate({ id: t.id, date, done: d });
  const today = v?.today ?? "";
  const todayDaily = active.filter((t) => isActiveOn(t, today));
  const todayAllDone = todayDaily.length > 0 && todayDaily.every((t) => t.done_dates.includes(today));

  return (
    <AppShell>
      <PageHeader
        stage="follow"
        eyebrow="Step 3 · Follow-through"
        title="Your follow-through plan"
        intro="Everything here comes from the plan your clinician approved. Accept the items, then track them day by day."
        aside={
          approved && (
            <a href={`/api${vurl("/visit/summary/pdf")}`} download data-testid="download-summary-pdf-btn" className={cn(buttonVariants({ variant: "outline" }), "rounded-full bg-white h-11")}>
              <Download className="size-4" /> Visit summary (PDF)
            </a>
          )
        }
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-8 space-y-8">
        {isLoading && <div className="h-64 rounded-3xl ai-shimmer" />}
        {!isLoading && (isError || !approved) && <FollowEmpty draft={v?.consult.status === "draft"} />}

        {v && approved && (
          <>
            <div className="grid lg:grid-cols-12 gap-5">
              <div data-testid="followthrough-visit-card" className="lg:col-span-5 rounded-3xl bg-eucalypt-deep text-white p-6">
                <p className="text-[11px] uppercase tracking-[0.15em] text-[#6EE7B7] flex items-center gap-1.5"><Stethoscope className="size-3.5" /> Your consultation</p>
                <p className="mt-3 font-heading text-2xl">{v.consult.approved_by}</p>
                <p className="text-sm text-[#ADC5BE]">General Practitioner · reviewed and approved your plan</p>
                {v.booking && (
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex gap-2"><CalendarClock className="size-4 mt-0.5 text-[#6EE7B7]" /><span>{format(parseISO(v.booking.date), "EEEE d MMMM")} at {v.booking.time} · {v.booking.service_name}</span></div>
                    <div className="text-[#D1E7DF]">{v.booking.clinic_name}, {v.booking.clinic_address}</div>
                    <div className="font-mono text-[11px] text-[#ADC5BE]">Ref {v.booking.reference} · approved {v.consult.approved_at && formatDateTime(v.consult.approved_at)}</div>
                  </dl>
                )}
              </div>
              <div data-testid="followthrough-results-card" className="lg:col-span-7 rounded-3xl frost-card p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl text-ink">What happened at your visit</h2>
                  <Badge variant="outline" className="text-[11px]"><Sparkles className="size-3" /> {v.consult.classified_by === "ai" ? "Plain-language summary · GPT-5.2" : "Prepared summary"}</Badge>
                </div>
                <p data-testid="patient-summary-text" className="mt-3 text-ink leading-relaxed">{v.consult.patient_summary ?? v.consult.notes?.assessment}</p>
                <p className="mt-3 text-[11px] text-ink-muted">Summarised from your clinician's approved notes. It doesn't add new medical advice.</p>
              </div>
            </div>

            {suggested.length > 0 && <SuggestedTasks key={suggested.map((t) => t.id).join()} tasks={suggested} today={today} />}

            {todayDaily.length > 0 && (
              <section data-testid="today-daily-section" className="rounded-3xl frost-card p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-2xl text-ink">Today · {format(parseISO(today), "EEEE d MMM")}</h2>
                  <CategoryChip c="daily" />
                </div>
                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                  {todayDaily.map((t) => {
                    const checked = t.done_dates.includes(today);
                    return (
                      <label key={t.id} className={cn("flex gap-3 items-start rounded-2xl border border-l-4 p-4 cursor-pointer transition-colors duration-200", CATEGORY_META.daily.border, checked ? "bg-[#F0FDF4] border-[#BBF7D0]" : "border-line")}>
                        <Checkbox data-testid={`today-tick-${t.id}`} checked={checked} disabled={toggle.isPending} onCheckedChange={(c) => onToggle(t, today, c === true)} className="mt-0.5" />
                        <span>
                          <span className={cn("block font-medium text-ink", checked && "line-through text-ink-muted")}>{t.title}</span>
                          <span className="block text-xs text-ink-muted">Day {differenceInCalendarDays(parseISO(today), parseISO(t.start_date!)) + 1} of {t.duration_days}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {todayAllDone && <div className="mt-4"><DayQuote date={today} testid="today-quote" /></div>}
              </section>
            )}

            {active.length > 0 && (
              <section>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h2 className="text-2xl text-ink">Your checklist</h2>
                  <div data-testid="task-progress" className="min-w-56">
                    <p className="text-sm text-ink-muted"><strong className="text-ink">{done} of {active.length}</strong> complete</p>
                    <div className="mt-1 h-1.5 rounded-full bg-sand overflow-hidden"><div className="h-full bg-eucalypt transition-[width] duration-500" style={{ width: `${(done / active.length) * 100}%` }} /></div>
                  </div>
                </div>
                <div className="mt-4 grid md:grid-cols-2 gap-3">
                  {ORDER.flatMap((c) => active.filter((t) => t.category === c)).map((t) => (
                    <TaskCard key={t.id} task={t} today={today} onToggle={onToggle} busy={toggle.isPending} />
                  ))}
                </div>
              </section>
            )}

            {active.length > 0 && (
              <section>
                <h2 className="text-2xl text-ink">Calendar</h2>
                <p className="text-sm text-ink-muted mb-4">Daily tasks appear on every day they run; follow-up deadlines are set from your clinician's timeframe.</p>
                <CareCalendar tasks={tasks} today={today} onToggle={onToggle} busy={toggle.isPending} />
              </section>
            )}

            {active.length > 0 && done === active.length && suggested.length === 0 && (
              <div data-testid="all-done-card" className="rounded-3xl bg-eucalypt-soft border border-eucalypt/20 p-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-eucalypt font-heading text-xl">All follow-up actions complete. Nice work, {v.patient.name.split(" ")[0]}.</p>
                <Link to="/patient/journey" data-testid="actions-journey-link" className={cn(buttonVariants(), "rounded-full")}>See full journey</Link>
              </div>
            )}

            <AuditTimeline events={v.events} title="Visit timeline" />
          </>
        )}
      </div>
    </AppShell>
  );
}

/** Every follow-through feature, laid out but with no data until a clinician releases a plan. */
function FollowEmpty({ draft }: { draft: boolean }) {
  const signedIn = useSignedIn();
  const today = useToday().data?.today;
  return (
    <>
      <div data-testid="actions-locked" className="rounded-2xl bg-eucalypt-soft border border-eucalypt/20 px-5 py-4 flex items-start gap-3">
        <Lock className="size-4 mt-0.5 text-eucalypt shrink-0" />
        <p className="text-sm text-eucalypt">
          <strong>Nothing to show yet.</strong>{" "}
          {!signedIn ? "Sign in and complete a visit — your clinician's approved plan will fill this page."
            : draft ? "Your clinician is reviewing draft notes. Your plan is only released once they approve it."
            : "After your appointment, your clinician's approved plan will appear here."}
        </p>
      </div>
      <div className="grid lg:grid-cols-12 gap-5">
        <div data-testid="followthrough-empty-visit-card" className="lg:col-span-5 rounded-3xl bg-eucalypt-deep text-white p-6">
          <p className="text-[11px] uppercase tracking-[0.15em] text-[#6EE7B7] flex items-center gap-1.5"><Stethoscope className="size-3.5" /> Your consultation</p>
          <p className="mt-3 font-heading text-2xl text-white/60">No consultation yet</p>
          <p className="text-sm text-[#ADC5BE]">Your clinician, appointment time and clinic will show here.</p>
        </div>
        <div data-testid="followthrough-empty-results-card" className="lg:col-span-7 rounded-3xl frost-card p-6">
          <h2 className="text-xl text-ink">What happened at your visit</h2>
          <p className="mt-3 text-ink-muted leading-relaxed">A plain-language summary of your clinician's approved notes will appear here.</p>
        </div>
      </div>
      <section data-testid="followthrough-empty-checklist">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl text-ink">Your checklist</h2>
          <div className="min-w-56">
            <p className="text-sm text-ink-muted"><strong className="text-ink">0 of 0</strong> complete</p>
            <div className="mt-1 h-1.5 rounded-full bg-sand" />
          </div>
        </div>
        <div className="mt-4 rounded-3xl border border-dashed border-line bg-white/60 p-6">
          <p className="text-sm text-ink-muted">Approved instructions become checklist items, colour-coded by type:</p>
          <div className="mt-3 flex flex-wrap gap-2">{ORDER.map((c) => <CategoryChip key={c} c={c} />)}</div>
        </div>
      </section>
      {today && (
        <section data-testid="followthrough-empty-calendar">
          <h2 className="text-2xl text-ink">Calendar</h2>
          <p className="text-sm text-ink-muted mb-4">Daily tasks and follow-up deadlines will appear on the days they apply.</p>
          <CareCalendar tasks={[]} today={today} onToggle={() => {}} busy={false} />
        </section>
      )}
      <AuditTimeline events={[]} title="Visit timeline" />
    </>
  );
}

function SuggestedTasks({ tasks, today }: { tasks: Task[]; today: string }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(tasks.map((t) => t.id)));
  const confirm = useVisitMutation((b: ConfirmTasksRequest) => apiPost<Visit>(vurl("/visit/tasks/confirm"), b), "Accepted — your calendar is ready");
  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const byAi = tasks[0]?.classified_by === "ai";

  return (
    <div data-testid="suggested-tasks" className="rounded-3xl frost-card p-5 sm:p-6 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-1.5">
            <Badge className="bg-[#FEF3C7] text-[#92400E]">From your clinician · not active yet</Badge>
            <Badge data-testid="classified-by-badge" variant="outline"><Sparkles className="size-3" /> {byAi ? "Sorted by GPT-5.2" : "Sorted by keyword rules (fallback)"}</Badge>
          </div>
          <h2 className="mt-2 text-2xl text-ink">Review and accept your checklist</h2>
          <p className="text-sm text-ink-muted">Each item is tagged as urgent, daily, follow-up or one-time. Daily items start the day you accept them.</p>
        </div>
        <Button data-testid="task-confirm-btn" disabled={selected.size === 0 || confirm.isPending} onClick={() => confirm.mutate({ task_ids: [...selected] })} className="rounded-full px-5">
          {confirm.isPending ? "Accepting…" : `Accept ${selected.size} item${selected.size === 1 ? "" : "s"}`}
        </Button>
      </div>
      <ul className="mt-5 grid sm:grid-cols-2 gap-3">
        {tasks.map((t) => (
          <li key={t.id}>
            <label data-testid={`suggested-task-${t.id}`} className={cn("block rounded-2xl border border-l-4 p-4 cursor-pointer transition-[border-color,background-color] duration-200", CATEGORY_META[t.category].border, selected.has(t.id) ? "bg-eucalypt-soft/30 border-eucalypt/40" : "border-line")}>
              <div className="flex items-start gap-3">
                <Checkbox data-testid={`suggested-task-checkbox-${t.id}`} checked={selected.has(t.id)} onCheckedChange={(c) => toggle(t.id, c === true)} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium text-ink">{t.title}</p>
                    <CategoryChip c={t.category} />
                    {t.verbatim && <Badge data-testid={`verbatim-badge-${t.id}`} className="bg-terracotta-soft text-terracotta text-[11px]"><Lock className="size-2.5" /> Verbatim</Badge>}
                  </div>
                  {schedule(t, today) && <p data-testid={`suggested-schedule-${t.id}`} className="mt-1 text-xs text-ink-muted">{schedule(t, today)}</p>}
                  <SourceQuote task={t} />
                </div>
              </div>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskCard({ task, today, onToggle, busy }: { task: Task; today: string; onToggle: (t: Task, d: string, done: boolean) => void; busy: boolean }) {
  const update = useVisitMutation((b: TaskStatusUpdate) => apiPatch<Visit>(vurl(`/visit/tasks/${task.id}`), b));
  const pending = update.isPending;
  const days = task.category === "daily" && task.start_date && task.end_date ? eachDayOfInterval({ start: parseISO(task.start_date), end: parseISO(task.end_date) }).map((d) => format(d, "yyyy-MM-dd")) : [];
  const finishedDaily = days.length > 0 && task.done_dates.length >= days.length;

  return (
    <div data-testid={`task-card-${task.id}`} data-status={task.status} data-category={task.category} className={cn("rounded-2xl frost-card border-l-4 p-4", CATEGORY_META[task.category].border)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <p className={cn("font-medium text-ink", task.status === "completed" && "line-through text-ink-muted")}>{task.title}</p>
        <CategoryChip c={task.category} />
        {task.status === "completed" && <Badge className="bg-[#DCFCE7] text-[#166534] text-[11px]"><BadgeCheck className="size-3" /> Done</Badge>}
      </div>
      {schedule(task, today) && <p data-testid={`task-schedule-${task.id}`} className={cn("mt-1 text-xs", task.category === "follow_up" ? "text-[#1E40AF] font-medium" : task.category === "urgent" ? "text-[#991B1B]" : "text-ink-muted")}>{schedule(task, today)}</p>}
      <SourceQuote task={task} />

      {task.category === "daily" ? (
        <div className="mt-3">
          <p className="text-[11px] text-ink-muted mb-1.5">{task.done_dates.length} of {days.length} days ticked</p>
          <div data-testid={`day-strip-${task.id}`} className="flex flex-wrap gap-1">
            {days.map((d, i) => {
              const checked = task.done_dates.includes(d);
              const future = d > today;
              return (
                <button
                  key={d}
                  type="button"
                  title={`${format(parseISO(d), "EEE d MMM")}${future ? " (upcoming)" : ""}`}
                  data-testid={`day-box-${task.id}-${d}`}
                  disabled={future || busy}
                  onClick={() => onToggle(task, d, !checked)}
                  className={cn(
                    "size-6 rounded-md border text-[11px] font-mono grid place-items-center transition-[background-color,border-color,transform] duration-150 active:scale-90",
                    checked ? "bg-[#16A34A] border-[#16A34A] text-white" : future ? "border-dashed border-line text-ink-muted/50" : "border-[#86EFAC] text-[#166534] hover:bg-[#DCFCE7]",
                    d === today && !checked && "ring-2 ring-[#16A34A]/40",
                  )}
                >
                  {checked ? "✓" : i + 1}
                </button>
              );
            })}
          </div>
          {finishedDaily && <p className="mt-2 text-xs text-[#166534] font-semibold">All {days.length} days complete — brilliant consistency.</p>}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {task.status === "todo" && (
            <Button size="xs" data-testid={`task-start-btn-${task.id}`} disabled={pending} onClick={() => update.mutate({ status: "in_progress" })}>
              {task.category === "urgent" ? "I understand" : "Start"} <ArrowRight className="size-3" />
            </Button>
          )}
          {task.status === "in_progress" && (
            <>
              <Button size="xs" variant="outline" data-testid={`task-back-btn-${task.id}`} disabled={pending} onClick={() => update.mutate({ status: "todo" })}><ArrowLeft className="size-3" /> To Do</Button>
              <Button size="xs" data-testid={`task-complete-btn-${task.id}`} disabled={pending} onClick={() => update.mutate({ status: "completed" })}><CheckCircle2 className="size-3" /> Complete</Button>
            </>
          )}
          {task.status === "completed" && (
            <Button size="xs" variant="ghost" data-testid={`task-reopen-btn-${task.id}`} disabled={pending} onClick={() => update.mutate({ status: "in_progress" })}><RotateCcw className="size-3" /> Reopen</Button>
          )}
          <span className="text-[11px] text-ink-muted self-center ml-1">{task.status === "todo" ? "To Do" : task.status === "in_progress" ? "In Progress" : "Completed"}</span>
        </div>
      )}
    </div>
  );
}
