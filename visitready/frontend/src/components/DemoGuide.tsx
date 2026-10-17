import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ListChecks, ArrowRight } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCurrentPersona, useVisit } from "@/lib/hooks";
import type { Visit } from "@/lib/types";
import { cn } from "@/lib/utils";

interface GuideStep { id: string; time: string; role: "Patient" | "Clinician"; title: string; hint: string; path: (v?: Visit) => string; done: (v?: Visit) => boolean }

const STEPS: GuideStep[] = [
  { id: "navigate", time: "0:15", role: "Patient", title: "Answer the guided questions", hint: "Help me find the right care → Fill demo answers → Show me where to start", path: () => "/patient/navigate", done: (v) => !!v?.questionnaire },
  { id: "book", time: "0:45", role: "Patient", title: "Book a fictional clinic", hint: "Pick a time and confirm the simulated booking", path: (v) => `/patient/clinics${v?.pathway ? `?service=${v.pathway.service_id}` : ""}`, done: (v) => !!v?.booking },
  { id: "brief", time: "1:05", role: "Patient", title: "Generate, share & save the brief", hint: "Fill details → Generate → tick Share → Save brief (PDF optional)", path: () => "/patient/prep", done: (v) => v?.brief?.status === "saved" && !!v.brief.shared },
  { id: "draft", time: "1:35", role: "Clinician", title: "Clinician: open the consultation & draft notes", hint: "Continue as Dr Sarah Lin → Open Consultation → Load sample consultation → Generate AI draft notes", path: () => "/clinician", done: (v) => (v?.consult.status ?? "none") !== "none" },
  { id: "edit", time: "1:50", role: "Clinician", title: "Edit one sentence, approve each item", hint: "Change a sentence, tick every follow-up item, check Before / After", path: (v) => `/clinician/consult/${v?.persona ?? "alex"}`, done: (v) => !!v?.consult.edited },
  { id: "release", time: "2:10", role: "Clinician", title: "Approve & release to patient", hint: "Notes lock and the plan is released as suggested tasks", path: (v) => `/clinician/consult/${v?.persona ?? "alex"}`, done: (v) => v?.consult.status === "approved" },
  { id: "confirm", time: "2:15", role: "Patient", title: "Open the notification & accept the plan", hint: "Bell → 'released your treatment plan' → Accept items (AI sorts daily / follow-up / urgent)", path: () => "/patient/follow-through", done: (v) => !!v?.tasks.some((t) => t.status !== "suggested") },
  { id: "track", time: "2:30", role: "Patient", title: "Tick today on the calendar", hint: "Tick a daily task (or complete a one-time task) — a motivational quote appears when the day is done", path: () => "/patient/follow-through", done: (v) => !!v?.tasks.some((t) => t.status === "completed" || t.done_dates.length > 0) },
  { id: "close", time: "2:45", role: "Patient", title: "Close on the journey dashboard", hint: "All four stages linked to one visit", path: () => "/patient/journey", done: (v) => !!v?.tasks.length && v.tasks.every((t) => t.status === "completed") },
];

export default function DemoGuide() {
  const [open, setOpen] = useState(false);
  const { data: v } = useVisit();
  const persona = useCurrentPersona();
  const doneCount = STEPS.filter((s) => s.done(v)).length;
  const nextId = STEPS.find((s) => !s.done(v))?.id;

  return (
    <>
      <button
        data-testid="demo-guide-btn"
        onClick={() => setOpen(true)}
        aria-label="Open demo guide"
        className="group fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full bg-eucalypt-deep/90 backdrop-blur text-white px-2.5 py-2 shadow-[0_10px_30px_-12px_rgba(23,46,39,0.7)] transition-[opacity,background-color] duration-200 opacity-80 hover:opacity-100 hover:bg-eucalypt-deep"
      >
        <ListChecks className="size-4 text-[#FCD34D]" />
        <span className="text-xs font-semibold max-w-0 overflow-hidden whitespace-nowrap transition-[max-width] duration-300 group-hover:max-w-24">Demo guide</span>
        <span data-testid="demo-guide-progress" className="font-mono text-xs bg-white/15 rounded-full px-2 py-0.5">{doneCount}/{STEPS.length}</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent data-testid="demo-guide-panel" className="w-full sm:max-w-md overflow-y-auto bg-cream">
          <SheetHeader>
            <SheetTitle className="font-heading text-2xl">3-minute demo guide</SheetTitle>
            <SheetDescription>
              Running as <strong className="text-ink">{persona?.patient.name ?? "…"}</strong> — {persona?.tagline}. Steps tick off as you go.
            </SheetDescription>
            <div className="mt-2 h-1.5 rounded-full bg-sand overflow-hidden">
              <div className="h-full bg-eucalypt transition-[width] duration-500" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
            </div>
          </SheetHeader>
          <ol className="px-4 pb-6 space-y-2">
            {STEPS.map((s, i) => {
              const done = s.done(v);
              const isNext = s.id === nextId;
              return (
                <li
                  key={s.id}
                  data-testid={`guide-step-${s.id}`}
                  data-done={done}
                  className={cn(
                    "rounded-2xl border p-3 flex gap-3 items-start transition-[border-color,background-color] duration-200",
                    isNext ? "border-terracotta bg-white" : done ? "border-line bg-eucalypt-soft/40" : "border-line bg-white/60",
                  )}
                >
                  <span className={cn("mt-0.5 size-6 rounded-full grid place-items-center text-[11px] font-semibold shrink-0", done ? "bg-eucalypt text-white" : isNext ? "bg-terracotta text-white" : "bg-sand text-ink-muted")}>
                    {done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-ink-muted">
                      <span className="font-mono">{s.time}</span>
                      <span className={s.role === "Clinician" ? "text-[#92400E]" : "text-eucalypt"}>{s.role}</span>
                    </div>
                    <p className={cn("text-sm font-medium text-ink", done && "text-ink-muted")}>{s.title}</p>
                    <p className="text-xs text-ink-muted leading-relaxed">{s.hint}</p>
                  </div>
                  <Link
                    to={s.path(v)}
                    data-testid={`guide-go-${s.id}`}
                    onClick={() => setOpen(false)}
                    className="shrink-0 self-center inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-eucalypt hover:border-eucalypt transition-colors duration-200"
                  >
                    Go <ArrowRight className="size-3" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </SheetContent>
      </Sheet>
    </>
  );
}
