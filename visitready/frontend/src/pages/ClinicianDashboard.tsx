import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowRight, BadgeCheck, CalendarClock, FileCheck2, FileX2, Sparkles } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { useClinicianSignedIn } from "@/lib/clinicianSession";
import { setPersona } from "@/lib/persona";
import type { ClinicianAppointment, ClinicianDashboard as Dashboard } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "brief" | "awaiting";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All patients" },
  { id: "brief", label: "Brief shared" },
  { id: "awaiting", label: "Awaiting approval" },
];

const STATUS: Record<ClinicianAppointment["consult_status"], { label: string; cls: string }> = {
  none: { label: "Awaiting consult", cls: "bg-sand text-ink" },
  draft: { label: "Draft notes", cls: "bg-[#FEF3C7] text-[#92400E]" },
  approved: { label: "Approved & Released", cls: "bg-[#DCFCE7] text-[#166534]" },
};

function Row({ a, onOpen }: { a: ClinicianAppointment; onOpen: () => void }) {
  const s = STATUS[a.consult_status];
  return (
    <li
      data-testid={`appointment-row-${a.persona}`}
      className="rounded-3xl bg-white border border-line p-4 sm:p-5 grid gap-4 sm:grid-cols-[auto_1fr_auto] items-center transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-30px_rgba(23,46,39,0.6)]"
    >
      <div className="flex items-center gap-4">
        <div className="w-16 text-center">
          <p data-testid={`appointment-time-${a.persona}`} className="font-mono text-lg text-ink">{a.booking?.time ?? "—"}</p>
          <p className="text-[10px] uppercase tracking-[0.15em] text-ink-muted">{a.booking ? format(parseISO(a.booking.date), "EEE d MMM") : "No booking"}</p>
          {a.booking && <p data-testid={`appointment-ref-${a.persona}`} className="font-mono text-[10px] text-ink-muted">{a.booking.reference}</p>}
        </div>
        <span className="size-11 rounded-full bg-[#FCD34D] text-eucalypt-deep grid place-items-center text-sm font-semibold shrink-0">{a.initials}</span>
      </div>
      <div className="min-w-0">
        <p data-testid={`appointment-patient-${a.persona}`} className="font-heading text-lg text-ink leading-tight">
          {a.patient.name} <span className="text-sm text-ink-muted font-sans">· {a.patient.age} · {a.patient.pronouns}</span>
        </p>
        <p className="mt-0.5 text-sm text-ink-muted truncate">{a.concern ?? "Reason for visit not provided yet"}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge data-testid={`appointment-status-${a.persona}`} className={s.cls}>
            {a.consult_status === "approved" && <BadgeCheck className="size-3" />}
            {a.consult_status === "draft" && <Sparkles className="size-3" />}
            {s.label}
          </Badge>
          {a.brief_shared ? (
            <Badge data-testid={`appointment-brief-${a.persona}`} className="bg-eucalypt-soft text-eucalypt"><FileCheck2 className="size-3" /> Preparation brief available</Badge>
          ) : (
            <Badge data-testid={`appointment-brief-${a.persona}`} variant="outline" className="text-ink-muted"><FileX2 className="size-3" /> Brief not yet shared</Badge>
          )}
          {a.booking && <Badge variant="outline" className="text-ink-muted">{a.booking.service_name} · {a.booking.clinic_name}</Badge>}
        </div>
      </div>
      <Button
        data-testid={`open-consultation-btn-${a.persona}`}
        disabled={!a.booking}
        onClick={onOpen}
        className="rounded-full h-10 px-5"
        title={a.booking ? undefined : "The patient hasn't booked yet"}
      >
        Open Consultation <ArrowRight className="size-4" />
      </Button>
    </li>
  );
}

export default function ClinicianDashboard() {
  const signedIn = useClinicianSignedIn();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const q = useQuery({ queryKey: ["clinician-dashboard"], queryFn: () => apiGet<Dashboard>("/clinician/dashboard"), enabled: signedIn, refetchInterval: 5000 });
  if (!signedIn) return <Navigate to="/clinician" replace />;

  const d = q.data;
  const all = d?.appointments ?? [];
  const appts = all.filter((a) => filter === "all" || (filter === "brief" ? a.brief_shared : a.consult_status === "draft"));
  const today = appts.filter((a) => a.booking && a.booking.date <= (d?.today ?? ""));
  const upcoming = appts.filter((a) => a.booking && a.booking.date > (d?.today ?? ""));
  const unbooked = appts.filter((a) => !a.booking);
  const open = (persona: string) => { setPersona(persona); navigate(`/clinician/consult/${persona}`); };

  const stats = [
    { id: "today", label: "Today's appointments", value: today.length },
    { id: "briefs", label: "Briefs shared", value: all.filter((a) => a.brief_shared).length },
    { id: "drafts", label: "Awaiting your approval", value: all.filter((a) => a.consult_status === "draft").length },
  ];

  const section = (title: string, list: ClinicianAppointment[], testid: string, empty: string) => (
    <section data-testid={testid} className="mt-10">
      <h2 className="text-2xl text-ink">{title}</h2>
      {list.length === 0 ? (
        <p className="mt-3 rounded-3xl border border-dashed border-line bg-white/60 p-6 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3">{list.map((a) => <Row key={a.persona} a={a} onOpen={() => open(a.persona)} />)}</ul>
      )}
    </section>
  );

  return (
    <AppShell mode="clinician">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 animate-fade-up">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="tracking-[0.15em] uppercase text-xs font-semibold text-terracotta flex items-center gap-1.5">
              <CalendarClock className="size-3.5" /> {d ? format(parseISO(d.today), "EEEE d MMMM yyyy") : "Today"}
            </p>
            <h1 data-testid="clinician-welcome-heading" className="mt-2 text-3xl sm:text-[44px] leading-tight tracking-tight text-ink">
              Welcome back, {d?.clinician.name ?? "Dr Sarah Lin"}
            </h1>
            <p className="mt-2 text-ink-muted">{d ? `${d.clinician.role} · ${d.clinician.clinic}` : "General Practitioner"} · fictional demo patients</p>
          </div>
          <div className="flex gap-3">
            {stats.map((s) => (
              <div key={s.id} data-testid={`stat-${s.id}`} className="rounded-2xl bg-white border border-line px-4 py-3 min-w-28">
                <p className="font-heading text-3xl text-ink">{q.isLoading ? "–" : s.value}</p>
                <p className="text-[11px] text-ink-muted leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {q.isLoading && <div className="mt-10 space-y-3">{[0, 1].map((i) => <div key={i} className="h-28 rounded-3xl ai-shimmer" />)}</div>}
        {q.isError && <p data-testid="dashboard-error" className="mt-10 text-sm text-ink-muted">Appointments are unavailable right now.</p>}
        {d && (
          <div data-testid="dashboard-filters" role="tablist" className="mt-8 flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const count = all.filter((a) => f.id === "all" || (f.id === "brief" ? a.brief_shared : a.consult_status === "draft")).length;
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={filter === f.id}
                  data-testid={`filter-${f.id}`}
                  onClick={() => setFilter(f.id)}
                  className={cn("rounded-full border px-4 py-1.5 text-sm transition-[background-color,border-color,color] duration-200", filter === f.id ? "bg-eucalypt-deep text-white border-eucalypt-deep" : "bg-white border-line text-ink hover:border-eucalypt/50")}
                >
                  {f.label} <span className="ml-1 font-mono text-xs opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        )}
        {d && (
          <>
            {section("Today's appointments", today, "today-appointments", filter === "all" ? "No appointments booked for today yet. Book one in Patient mode — same-day slots are available." : "No patients match this filter today.")}
            {upcoming.length > 0 && section("Upcoming", upcoming, "upcoming-appointments", "")}
            {unbooked.length > 0 && section("Not booked yet", unbooked, "unbooked-patients", "")}
          </>
        )}
      </div>
    </AppShell>
  );
}
