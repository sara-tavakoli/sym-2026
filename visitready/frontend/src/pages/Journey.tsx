import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowRight, Check, ClipboardCheck, Compass, ListChecks, Stethoscope } from "lucide-react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { journeyStages, useVisit } from "@/lib/hooks";
import type { Visit } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS = { find: Compass, prep: ClipboardCheck, consult: Stethoscope, follow: ListChecks } as const;

function summary(key: string, v?: Visit): string {
  if (!v) return "Not started yet";
  switch (key) {
    case "find":
      if (v.booking) return `${v.booking.practitioner_name} at ${v.booking.clinic_name} · ${format(parseISO(v.booking.date), "EEE d MMM")} ${v.booking.time} · Appointment ID ${v.booking.reference}`;
      if (v.pathway) return `Suggested: ${v.pathway.service_name}. Choose a clinic to book.`;
      return "Search directly or answer four guided questions.";
    case "prep":
      if (v.brief?.status === "saved") return `${v.brief.points.length}-point brief saved · ${v.brief.shared ? "shared with clinician" : "kept private"}`;
      if (v.brief) return "Draft brief generated — review and save it.";
      return v.booking ? "Add your questions and generate an AI brief." : "Available after booking.";
    case "consult":
      if (v.consult.status === "approved") return `Notes approved by ${v.consult.approved_by}. ${v.consult.instructions.length} instructions released.`;
      if (v.consult.status === "draft") return "Draft notes awaiting clinician review.";
      return "Clinician loads the transcript and drafts notes.";
    default: {
      const active = v.tasks.filter((t) => t.status !== "suggested");
      if (!v.tasks.length) return "Unlocks after clinician approval.";
      if (!active.length) return `${v.tasks.length} suggested tasks waiting for your confirmation.`;
      return `${active.filter((t) => t.status === "completed").length} of ${active.length} tasks complete.`;
    }
  }
}

export default function Journey() {
  const visit = useVisit();
  const v = visit.data;
  const stages = journeyStages(v);
  const next = stages.find((s) => !s.done);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Journey dashboard"
        title={`${v?.patient.name ?? "Alex"}'s visit, end to end`}
        intro={
          <span>
            Every step below is linked to one fictional visit <span data-testid="journey-visit-id" className="font-mono text-xs bg-sand text-ink rounded px-1.5 py-0.5">{v?.id ?? "visit-alex-001"}</span>.
          </span>
        }
        aside={
          next ? (
            <Link to={next.path} data-testid="journey-next-step-link" className="rounded-full bg-eucalypt text-white px-5 py-3 text-sm font-semibold inline-flex items-center gap-2 hover:bg-eucalypt-deep transition-colors duration-200">
              Next: {next.label} <ArrowRight className="size-4" />
            </Link>
          ) : (
            <Badge data-testid="journey-complete-badge" className="bg-[#DCFCE7] text-[#166534] px-3 py-1.5 text-sm">Journey complete</Badge>
          )
        }
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-10 relative">
        <div className="absolute left-[39px] sm:left-[47px] top-6 bottom-6 w-px bg-line hidden sm:block" aria-hidden />
        <ol className="space-y-4">
          {stages.map((s, i) => {
            const Icon = ICONS[s.key as keyof typeof ICONS];
            const isNext = next?.key === s.key;
            return (
              <li key={s.key} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                <Link
                  to={s.path}
                  data-testid={`journey-stage-${s.key}`}
                  data-done={s.done}
                  className={cn(
                    "group relative flex items-center gap-5 rounded-3xl border bg-white p-5 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5",
                    isNext ? "border-terracotta shadow-[0_16px_40px_-28px_rgba(200,90,50,0.8)]" : "border-line",
                    i % 2 === 1 && "sm:ml-10",
                  )}
                >
                  <span className={cn("relative z-10 size-12 rounded-2xl grid place-items-center shrink-0", s.done ? "bg-eucalypt text-white" : isNext ? "bg-terracotta text-white" : "bg-sand text-ink-muted")}>
                    {s.done ? <Check className="size-5" /> : <Icon className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-ink-muted">0{i + 1}</span>
                      <h2 className="text-xl text-ink">{s.label}</h2>
                      {s.key === "consult" && <Badge variant="outline" className="text-[10px]">Clinician</Badge>}
                    </div>
                    <p data-testid={`journey-stage-${s.key}-summary`} className="mt-1 text-sm text-ink-muted">{summary(s.key, v)}</p>
                  </div>
                  <ArrowRight className="size-5 text-ink-muted transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </AppShell>
  );
}
