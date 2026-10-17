import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useVisit } from "@/lib/hooks";
import { vurl } from "@/lib/persona";
import { PREP_LABELS } from "@/lib/types";
import type { PrepField } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function BriefPrint() {
  const { data: v, isLoading } = useVisit();
  const brief = v?.brief;
  const sections = brief ? [...new Set(brief.points.map((p) => p.section))] : [];

  return (
    <div className="min-h-screen bg-sand print:bg-white py-8 print:py-0">
      <div className="mx-auto max-w-[210mm] px-4 print:px-0 flex flex-wrap items-center justify-between gap-2 mb-4 print:hidden">
        <Link to="/patient/prep" data-testid="print-back-link" className={cn(buttonVariants({ variant: "ghost" }))}>
          <ArrowLeft className="size-4" /> Back to preparation
        </Link>
        <div className="flex gap-2">
          {brief && (
            <a href={`/api${vurl("/visit/brief/pdf")}`} download data-testid="print-download-pdf-btn" className={cn(buttonVariants({ variant: "outline" }), "bg-white")}>
              <Download className="size-4" /> Download PDF
            </a>
          )}
          <Button data-testid="print-brief-btn" onClick={() => window.print()} disabled={!brief}>
            <Printer className="size-4" /> Print / Save as PDF
          </Button>
        </div>
      </div>

      <article data-testid="print-brief-sheet" className="mx-auto max-w-[210mm] min-h-[270mm] bg-white shadow-xl print:shadow-none px-[16mm] py-[14mm] text-ink">
        {isLoading && <p className="text-ink-muted">Loading…</p>}
        {!isLoading && !brief && <p data-testid="print-no-brief" className="text-ink-muted">No brief generated yet. Go back to preparation to create one.</p>}
        {v && brief && (
          <>
            <p className="tracking-[0.15em] uppercase text-[10px] font-semibold text-terracotta">VisitReady · Appointment brief · Fictional demo</p>
            <h1 className="mt-1 text-3xl tracking-tight">{v.patient.name}, {v.patient.age}</h1>
            <p className="text-sm text-ink-muted">{v.patient.pronouns} · {v.patient.suburb}</p>
            {v.booking && (
              <p className="text-sm text-ink-muted">
                {v.booking.practitioner_name}, {v.booking.clinic_name} · {format(parseISO(v.booking.date), "EEE d MMM yyyy")} {v.booking.time} · Ref {v.booking.reference}
              </p>
            )}
            <p className="text-xs text-ink-muted mt-1">
              {brief.status === "saved" ? "Saved" : "Draft"} · {brief.shared ? "Shared with clinician" : "Private"} · {brief.ai_source === "live" ? "AI-organised (GPT-5.2)" : "Prepared fallback"}
            </p>
            <hr className="my-4 border-line" />
            <div className="space-y-4">
              {sections.map((sec) => (
                <section key={sec} className="break-inside-avoid">
                  <h2 className="text-base font-semibold text-eucalypt">{sec}</h2>
                  <ul className="mt-1 space-y-1.5">
                    {brief.points.filter((p) => p.section === sec).map((p) => (
                      <li key={p.id} className="pl-4 relative">
                        <span className="absolute left-0 top-2 size-1.5 rounded-full bg-terracotta" />
                        <p className="text-sm leading-relaxed">{p.text}</p>
                        <p className="text-[11px] italic text-ink-muted">
                          Source — {PREP_LABELS[p.source_field as PrepField] ?? p.source_field}: “{p.source_text}”{p.edited && " · edited by patient"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <p className="mt-6 rounded-lg bg-sand p-3 text-[11px] text-ink-muted">
              Organised from the patient's own words. Not a diagnosis or medical advice. All people, clinics and details are fictional. In an emergency call 000.
            </p>
          </>
        )}
      </article>
    </div>
  );
}
