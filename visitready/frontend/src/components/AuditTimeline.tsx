import { Bot, Stethoscope, User, Cog } from "lucide-react";
import { formatDateTime } from "@/lib/hooks";
import type { VisitEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACTOR = {
  patient: { icon: User, cls: "bg-[#FCD34D] text-eucalypt-deep", label: "Patient" },
  clinician: { icon: Stethoscope, cls: "bg-eucalypt text-white", label: "Clinician" },
  ai: { icon: Bot, cls: "bg-[#EDE9FE] text-[#5B21B6]", label: "AI" },
  system: { icon: Cog, cls: "bg-sand text-ink-muted", label: "System" },
} as const;

export default function AuditTimeline({ events, title = "Audit timeline" }: { events: VisitEvent[]; title?: string }) {
  return (
    <div data-testid="audit-timeline" className="rounded-3xl bg-white border border-line p-5">
      <h2 className="text-lg text-ink">{title}</h2>
      <p className="text-xs text-ink-muted">Who did what, and when — every AI step and human approval.</p>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="mt-4 relative space-y-4 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-line">
          {events.map((e) => {
            const a = ACTOR[e.actor];
            return (
              <li key={e.id} data-testid={`timeline-event-${e.type}`} className="relative flex gap-3 animate-fade-up">
                <span className={cn("relative z-10 size-8 rounded-full grid place-items-center shrink-0", a.cls)}><a.icon className="size-4" /></span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm text-ink leading-snug">{e.message}</p>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    <span className="font-semibold">{e.actor_name}</span> · {a.label} · <span className="font-mono">{formatDateTime(e.at)}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
