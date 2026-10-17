import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, ArrowRight, Globe, LocateFixed, Navigation, CalendarCheck, Check, Loader2, MapPin, Pencil, Search, ShieldCheck, Star, Stethoscope, Video } from "lucide-react";
import AppShell from "@/components/AppShell";
import AuthPanel, { type AuthResult } from "@/components/AuthPanel";
import ProfileForm from "@/components/ProfileForm";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { errorMessage, useClinics, useNearbyClinics, useCurrentPersona, useServices, useVisit, useVisitMutation } from "@/lib/hooks";
import { useSessionMode, vurl } from "@/lib/persona";
import type { BookingRequest, Clinic, Slot, Visit } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "clinic", label: "Clinic" }, { id: "doctor", label: "Doctor" }, { id: "time", label: "Date & time" },
  { id: "auth", label: "Sign in" }, { id: "profile", label: "Profile" }, { id: "review", label: "Review" }, { id: "done", label: "Confirmed" },
] as const;
type StepId = (typeof STEPS)[number]["id"];
const modeLabel = (m: Slot["mode"]) => (m === "telehealth" ? "Telehealth (video)" : "In person");

/** Guided booking: Clinic → Doctor → Date & time → Sign in → Profile → Review → Confirmed.
 *  Every selection lives in the URL, so it survives sign-in, sign-up, tab switches and the Google redirect. */
export default function Book() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const clinics = useClinics();
  const services = useServices();
  const mode = useSessionMode();
  const me = useMe();
  const visit = useVisit();
  const demoPersona = useCurrentPersona();

  const service = params.get("service") ?? "all";
  const q = params.get("q") ?? "";
  const step = (params.get("step") as StepId) || "clinic";
  const serviceNames = useMemo(() => Object.fromEntries((services.data ?? []).map((s) => [s.id, s.name])), [services.data]);

  // Location search: the server geocodes the place and returns real straight-line distances.
  const loc = params.get("loc") ?? "";
  const radius = Number(params.get("radius") ?? 10);
  const apptType = params.get("type") ?? "any"; // any | in_person | telehealth
  const avail = params.get("avail") ?? "any"; // any | today
  const nearby = useNearbyClinics(loc, radius);
  const today = clinics.data?.[0]?.slots[0]?.date;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = loc && nearby.data ? [...nearby.data.clinics, ...nearby.data.online] : loc ? [] : (clinics.data ?? []);
    return base.filter((c) => {
      if (service !== "all" && !c.services.includes(service)) return false;
      if (apptType === "telehealth" && !c.online) return false;
      if (apptType === "in_person" && c.online) return false;
      if (avail === "today" && !c.slots.some((s) => s.date === today)) return false;
      if (!needle) return true;
      const hay = [c.name, ...c.practitioners.map((p) => p.name)].join(" ").toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
  }, [clinics.data, nearby.data, loc, service, q, apptType, avail, today]);
  const inPerson = filtered.filter((c) => !c.online);
  const onlineList = filtered.filter((c) => c.online);

  const clinic: Clinic | undefined = clinics.data?.find((c) => c.id === params.get("clinic"));
  const doctor = clinic?.practitioners.find((p) => p.id === params.get("doctor"));
  const docSlots = clinic?.slots.filter((s) => s.practitioner_id === doctor?.id) ?? [];
  const days = [...new Set(docSlots.map((s) => s.date))];
  const day = params.get("date") && days.includes(params.get("date")!) ? params.get("date")! : days[0];
  const slot = docSlots.find((s) => s.id === params.get("slot"));
  const bookingService = clinic ? (service !== "all" && clinic.services.includes(service) ? service : clinic.services[0]) : "gp";
  const needsProfile = mode === "account" && !!me.data && !me.data.profile_complete;
  const afterTime: StepId = !mode ? "auth" : needsProfile ? "profile" : "review";

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Keep the user on a step they're allowed to be on (e.g. after returning from Google sign-in).
  useEffect(() => {
    if (!clinics.data) return;
    const want = (s: StepId) => s !== step && go({ step: s });
    if (step === "done") return;
    if (step !== "clinic" && !clinic) return void want("clinic");
    if (["time", "auth", "profile", "review"].includes(step) && !doctor) return void want("doctor");
    if (["auth", "profile", "review"].includes(step) && !slot) return void want("time");
    if (step === "auth" && mode && (mode === "demo" || me.data)) return void want(afterTime);
    if ((step === "profile" || step === "review") && !mode) return void want("auth");
    if (step === "profile" && mode === "demo") return void want("review");
    if (step === "review" && needsProfile) return void want("profile");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, clinics.data, clinic, doctor, slot, mode, me.data, needsProfile]);

  const book = useVisitMutation((b: BookingRequest) => apiPost<Visit>(vurl("/visit/booking"), b));
  const confirm = () => {
    if (!clinic || !slot || book.isPending || book.isSuccess) return; // never double-book on repeated clicks
    book.mutate({ clinic_id: clinic.id, slot_id: slot.id, service_id: bookingService }, { onSuccess: () => go({ step: "done" }) });
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const booking = visit.data?.booking;
  const patientName = mode === "account" ? me.data?.profile.full_name : demoPersona?.patient.name;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 sm:pt-10">
        <p className="tracking-[0.15em] uppercase text-[11px] font-semibold text-terracotta">Book an appointment · simulated</p>
        <h1 data-testid="book-title" className="mt-1 text-[30px] sm:text-[38px] leading-tight tracking-tight text-ink">
          {{ clinic: "Choose a clinic", doctor: "Choose your doctor", time: "Pick a date and time", auth: "Sign in to book", profile: "Your details", review: "Review your appointment", done: "You're booked in" }[step]}
        </h1>

        <ol data-testid="booking-stepper" className="mt-5 flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((s, i) => {
            const past = i < stepIndex;
            const canJump = past && i <= 2 && step !== "done";
            return (
              <li key={s.id} className="flex items-center gap-1 shrink-0">
                <button type="button" data-testid={`booking-step-${s.id}`} data-active={s.id === step} disabled={!canJump} onClick={() => go({ step: s.id })}
                  className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors duration-200 disabled:cursor-default",
                    s.id === step ? "bg-eucalypt text-white font-semibold" : past ? "bg-eucalypt-soft text-eucalypt hover:bg-eucalypt/15" : "text-ink-muted")}>
                  <span className={cn("size-5 rounded-full grid place-items-center text-[11px] font-semibold", s.id === step ? "bg-white/20" : past ? "bg-eucalypt text-white" : "bg-sand")}>
                    {past ? <Check className="size-3" /> : i + 1}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <span className="w-3 sm:w-5 h-px bg-line" aria-hidden />}
              </li>
            );
          })}
        </ol>

        {clinic && step !== "clinic" && step !== "done" && (
          <div data-testid="booking-selection-summary" className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span className="rounded-full bg-white border border-line px-3 py-1"><MapPin className="inline size-3.5 mr-1" />{clinic.name}</span>
            {doctor && step !== "doctor" && <span className="rounded-full bg-white border border-line px-3 py-1"><Stethoscope className="inline size-3.5 mr-1" />{doctor.name}</span>}
            {slot && !["doctor", "time"].includes(step) && <span className="rounded-full bg-white border border-line px-3 py-1"><CalendarCheck className="inline size-3.5 mr-1" />{format(parseISO(slot.date), "EEE d MMM")} · {slot.time}</span>}
          </div>
        )}

        <div key={step} className="mt-6 animate-fade-up">
          {step === "clinic" && (
            <>
              <LocationSearch initial={loc} onSearch={(v) => go({ loc: v || null })} />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.15em] font-semibold text-ink-muted mr-1">Within</span>
                {[5, 10, 20, 50].map((r) => (
                  <button key={r} data-testid={`radius-${r}`} data-active={radius === r} onClick={() => go({ radius: String(r) })}
                    className={cn("rounded-full px-3 py-1 text-sm border transition-colors duration-200", radius === r ? "bg-eucalypt text-white border-eucalypt" : "bg-white border-line text-ink hover:border-eucalypt/50")}>
                    {r} km
                  </button>
                ))}
              </div>
              <div className="mt-3 grid sm:grid-cols-4 gap-2">
                <select data-testid="clinic-service-select" value={service} onChange={(e) => go({ service: e.target.value === "all" ? null : e.target.value })} className="h-10 rounded-md border border-input bg-white px-3 text-sm">
                  <option value="all">All services</option>
                  {(services.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select data-testid="clinic-type-select" value={apptType} onChange={(e) => go({ type: e.target.value === "any" ? null : e.target.value })} className="h-10 rounded-md border border-input bg-white px-3 text-sm">
                  <option value="any">Any appointment type</option>
                  <option value="in_person">In person</option>
                  <option value="telehealth">Telehealth (video)</option>
                </select>
                <select data-testid="clinic-availability-select" value={avail} onChange={(e) => go({ avail: e.target.value === "any" ? null : e.target.value })} className="h-10 rounded-md border border-input bg-white px-3 text-sm">
                  <option value="any">Any availability</option>
                  <option value="today">Available today</option>
                </select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-muted" />
                  <Input data-testid="clinic-search-input" value={q} onChange={(e) => { const n = new URLSearchParams(params); if (e.target.value) n.set("q", e.target.value); else n.delete("q"); setParams(n, { replace: true }); }} placeholder="Clinic or doctor name" className="pl-9 h-10 bg-white" />
                </div>
              </div>

              {loc && nearby.data && (
                <p data-testid="location-resolved" className="mt-4 text-sm text-ink-muted">
                  <Navigation className="inline size-3.5 mr-1 text-eucalypt" />
                  Showing clinics within <strong className="text-ink">{radius} km</strong> of <strong className="text-ink">{nearby.data.location.label.split(",").slice(0, 3).join(",")}</strong>, nearest first · straight-line distance ({nearby.data.location.source})
                </p>
              )}
              {!loc && <p className="mt-4 text-sm text-ink-muted">Enter a suburb, postcode or address to see clinics near you and their distance.</p>}
              {loc && nearby.isError && (
                <p data-testid="location-error" role="alert" className="mt-4 rounded-2xl bg-[#FEF3F2] border border-[#FECDCA] px-4 py-3 text-sm text-[#B42318]">{errorMessage(nearby.error)}</p>
              )}
              <p className="mt-2 text-[11px] text-ink-muted">All clinics and practitioners are fictional demo data — not real medical providers.</p>

              <div data-testid="clinic-list" className="mt-4 grid md:grid-cols-2 gap-4">
                {(clinics.isLoading || nearby.isFetching) && [0, 1, 2, 3].map((i) => <div key={i} className="h-36 rounded-3xl ai-shimmer" />)}
                {!clinics.isLoading && !nearby.isFetching && !nearby.isError && inPerson.length === 0 && (
                  <div data-testid="clinic-empty-state" className="md:col-span-2 rounded-3xl border border-dashed border-line p-8 text-center">
                    <p className="text-ink">{loc && nearby.data ? `No in-person clinics within ${radius} km match your filters.` : "No clinics match. Try another service or filter."}</p>
                    {loc && nearby.data && radius < 50 && (
                      <Button data-testid="expand-radius-btn" variant="outline" className="mt-4 rounded-full" onClick={() => go({ radius: String([5, 10, 20, 50].find((r) => r > radius)) })}>
                        Expand search to {[5, 10, 20, 50].find((r) => r > radius)} km
                      </Button>
                    )}
                    {loc && nearby.data?.nearest_outside_km != null && <p className="mt-2 text-xs text-ink-muted">Nearest clinic outside this area is {nearby.data.nearest_outside_km} km away.</p>}
                  </div>
                )}
                {!nearby.isFetching && inPerson.map((c) => <ClinicCard key={c.id} c={c} serviceNames={serviceNames} onPick={() => go({ clinic: c.id, doctor: null, slot: null, date: null, step: "doctor" })} />)}
              </div>
              {!nearby.isFetching && onlineList.length > 0 && (
                <div className="mt-6">
                  <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-ink-muted mb-2"><Globe className="inline size-3.5 mr-1" />Available online — no distance</p>
                  <div className="grid md:grid-cols-2 gap-4">
                    {onlineList.map((c) => <ClinicCard key={c.id} c={c} serviceNames={serviceNames} onPick={() => go({ clinic: c.id, doctor: null, slot: null, date: null, step: "doctor" })} />)}
                  </div>
                </div>
              )}
            </>
          )}

          {step === "doctor" && clinic && (
            <div className="grid md:grid-cols-2 gap-4">
              {clinic.practitioners.map((p) => {
                const first = clinic.slots.find((s) => s.practitioner_id === p.id);
                return (
                  <button key={p.id} data-testid={`practitioner-${p.id}`} onClick={() => go({ doctor: p.id, slot: null, date: null, step: "time" })}
                    className="group text-left rounded-3xl frost-card p-5 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-eucalypt/40">
                    <div className="flex items-center gap-3">
                      <span className="size-12 rounded-full bg-eucalypt text-white grid place-items-center font-semibold">{p.name.replace("Dr ", "").split(" ").map((w) => w[0]).join("")}</span>
                      <div>
                        <p className="font-heading text-xl text-ink">{p.name}</p>
                        <p className="text-xs text-ink-muted">{p.role} · {p.languages.join(", ")}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-ink-muted leading-relaxed">{p.bio}</p>
                    {first && <p className="mt-3 text-xs font-medium text-eucalypt">Next available: {format(parseISO(first.date), "EEE d MMM")} · {first.time}</p>}
                  </button>
                );
              })}
              <BackLink onClick={() => go({ step: "clinic" })} label="Change clinic" />
            </div>
          )}

          {step === "time" && doctor && (
            <div className="rounded-3xl frost-card p-5 sm:p-7 max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.15em] font-semibold text-ink-muted">Date</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {days.map((d) => (
                  <button key={d} data-testid={`slot-day-${d}`} onClick={() => go({ date: d, slot: null })}
                    className={cn("rounded-xl px-3 py-2 text-sm border shrink-0 transition-colors duration-200", day === d ? "bg-eucalypt-deep text-white border-eucalypt-deep" : "border-line bg-white text-ink hover:bg-sand")}>
                    {format(parseISO(d), "EEE d MMM")}
                  </button>
                ))}
              </div>
              <p className="mt-5 text-[11px] uppercase tracking-[0.15em] font-semibold text-ink-muted">Time</p>
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
                {docSlots.filter((s) => s.date === day).map((s) => (
                  <button key={s.id} data-testid={`slot-${s.time.replace(":", "")}`} onClick={() => go({ slot: s.id, date: s.date })}
                    className={cn("rounded-xl border py-2.5 text-sm font-mono transition-[background-color,border-color,transform] duration-200 active:scale-95",
                      slot?.id === s.id ? "bg-terracotta text-white border-terracotta" : "border-line bg-white hover:border-terracotta/60")}>
                    {s.time}{s.mode === "telehealth" && <Video className="inline size-3 ml-1" />}
                  </button>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                <p data-testid="booking-summary" className="text-sm text-ink-muted">
                  {slot ? <><span className="text-ink font-medium">{doctor.name}</span> · {format(parseISO(slot.date), "EEEE d MMMM")} at {slot.time} · {modeLabel(slot.mode)}</> : "Select a time to continue"}
                </p>
                <Button data-testid="book-appointment-btn" disabled={!slot} onClick={() => go({ step: afterTime })} className="h-11 px-6 rounded-full text-[15px]">
                  Book appointment <ArrowRight className="size-4" />
                </Button>
              </div>
              <BackLink onClick={() => go({ step: "doctor" })} label="Change doctor" />
            </div>
          )}

          {step === "auth" && (
            <>
              <p className="mb-4 text-sm text-ink-muted">Your selected appointment is saved — sign in or create an account to continue.</p>
              <AuthPanel returnPath={location.pathname + location.search} onDone={(r: AuthResult) => go({ step: r.kind === "account" && !r.user.profile_complete ? "profile" : "review" })} />
              <BackLink onClick={() => go({ step: "time" })} label="Change time" />
            </>
          )}

          {step === "profile" && me.data && (
            <ProfileForm key={params.get("edit") ?? "missing"} user={me.data} editAll={params.get("edit") === "1"} onSaved={() => go({ step: "review", edit: null })}
              onCancel={params.get("edit") === "1" ? () => go({ step: "review", edit: null }) : undefined} />
          )}

          {step === "review" && clinic && doctor && slot && (
            <div className="grid lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 rounded-3xl frost-card p-6">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl text-ink">Appointment</h2>
                  <Button variant="ghost" size="sm" data-testid="review-change-appointment-btn" onClick={() => go({ step: "time" })}><ArrowLeft className="size-4" /> Change appointment</Button>
                </div>
                <dl className="mt-3 divide-y divide-line text-sm">
                  {[
                    ["Clinic", `${clinic.name} — ${clinic.address}`], ["Doctor", `${doctor.name}, ${doctor.role}`],
                    ["Date & time", `${format(parseISO(slot.date), "EEEE d MMMM yyyy")} at ${slot.time}`], ["Appointment type", modeLabel(slot.mode)],
                    ["Service", serviceNames[bookingService] ?? bookingService],
                  ].map(([k, v]) => (
                    <div key={k} className="py-2.5 grid grid-cols-[130px_1fr] gap-3"><dt className="text-ink-muted">{k}</dt><dd data-testid={`review-${k.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="text-ink">{v}</dd></div>
                  ))}
                </dl>
                {booking && booking.slot_id !== slot.id && <p className="mt-3 rounded-xl bg-[#FEF3C7] px-3 py-2 text-xs text-[#92400E]">Confirming will replace your current appointment ({booking.practitioner_name}, {format(parseISO(booking.date), "EEE d MMM")} {booking.time}).</p>}
              </div>
              <div className="lg:col-span-5 space-y-4">
                <div className="rounded-3xl frost-card p-6">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xl text-ink">Patient</h2>
                    {mode === "account" && <Button variant="ghost" size="sm" data-testid="review-edit-details-btn" onClick={() => go({ step: "profile", edit: "1" })}><Pencil className="size-4" /> Edit details</Button>}
                  </div>
                  <p data-testid="review-patient-name" className="mt-2 font-heading text-2xl text-ink">{patientName}</p>
                  {mode === "account" && me.data ? (
                    <p className="mt-1 text-sm text-ink-muted">DOB {me.data.profile.date_of_birth && format(parseISO(me.data.profile.date_of_birth), "d MMM yyyy")} · {me.data.profile.mobile}<br />{me.data.email}</p>
                  ) : (
                    <p className="mt-1 text-sm text-ink-muted"><Badge className="bg-[#FEF3C7] text-[#92400E]">Demo</Badge> Fictional patient, age {demoPersona?.patient.age}</p>
                  )}
                </div>
                <p data-testid="review-privacy-notice" className="flex gap-2 rounded-2xl bg-eucalypt-soft/60 p-4 text-xs text-ink-muted leading-relaxed">
                  <ShieldCheck className="size-4 shrink-0 text-eucalypt" />
                  Your name, date of birth and contact details go to the (fictional) clinic for this appointment. Your preparation brief is not shared — you decide that separately in Prepare.
                </p>
                <Button data-testid="confirm-booking-btn" disabled={book.isPending || book.isSuccess} onClick={confirm} className="w-full h-12 rounded-full text-[15px]">
                  {book.isPending ? <><Loader2 className="size-4 animate-spin" /> Confirming…</> : "Confirm booking"}
                </Button>
                <p className="text-center text-[11px] text-ink-muted">Simulated booking — no real appointment is made.</p>
              </div>
            </div>
          )}

          {step === "done" && (
            <div data-testid="booking-confirmation" className="max-w-2xl rounded-3xl bg-eucalypt-deep text-white p-6 sm:p-8">
              <span className="size-12 rounded-full bg-[#6EE7B7] text-eucalypt-deep grid place-items-center"><CalendarCheck className="size-6" /></span>
              {booking ? (
                <>
                  <p className="mt-4 font-heading text-2xl">{booking.practitioner_name} · {booking.service_name}</p>
                  <p className="mt-1 text-[#D1E7DF]">{format(parseISO(booking.date), "EEEE d MMMM")} at {booking.time} · {modeLabel(booking.mode)}</p>
                  <p className="text-[#ADC5BE] text-sm">{booking.clinic_name}, {booking.clinic_address}</p>
                  <p className="mt-3 font-mono text-xs text-[#ADC5BE]">Appointment ID <span data-testid="booking-reference" className="text-white">{booking.reference}</span> · shared with your clinician's dashboard</p>
                </>
              ) : <div className="mt-4 h-16 rounded-xl bg-white/10 animate-pulse" />}
              <div className="mt-6 flex flex-wrap gap-2">
                <Link to="/patient/journey" data-testid="booking-go-journey-btn" className={cn(buttonVariants(), "h-11 rounded-full px-6 bg-white text-eucalypt-deep hover:bg-[#FCD34D]")}>Go to My Journey <ArrowRight className="size-4" /></Link>
                <Link to="/patient/prep" data-testid="booking-go-prep-btn" className={cn(buttonVariants({ variant: "outline" }), "h-11 rounded-full bg-transparent text-white border-white/40 hover:bg-white/10 hover:text-white")}>Prepare for my visit</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function LocationSearch({ initial, onSearch }: { initial: string; onSearch: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return (
    <form data-testid="location-search-form" className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); onSearch(value.trim()); }}>
      <div className="relative flex-1">
        <LocateFixed className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-eucalypt" />
        <Input data-testid="location-search-input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Suburb, postcode or address — e.g. Chatswood NSW or 2113" className="pl-9 h-12 bg-white text-[15px]" aria-label="Suburb, postcode or address" />
      </div>
      <Button type="submit" data-testid="location-search-btn" className="h-12 rounded-full px-6">Search nearby</Button>
      {initial && <Button type="button" variant="ghost" data-testid="location-clear-btn" className="h-12 rounded-full" onClick={() => onSearch("")}>Clear</Button>}
    </form>
  );
}

function ClinicCard({ c, serviceNames, onPick }: { c: Clinic; serviceNames: Record<string, string>; onPick: () => void }) {
  return (
    <button data-testid={`clinic-card-${c.id}`} onClick={onPick}
      className="group text-left rounded-3xl frost-card p-3 flex gap-4 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-eucalypt/40">
      <img src={c.image} alt="" className="size-24 rounded-2xl object-cover shrink-0" />
      <div className="min-w-0 py-1 flex-1">
        <p className="font-heading text-lg text-ink leading-tight">{c.name}</p>
        <p className="mt-1 text-xs text-ink-muted flex items-center gap-1"><MapPin className="size-3" />{c.suburb}</p>
        {c.distance_km != null && <p data-testid={`clinic-distance-${c.id}`} className="mt-1 text-xs font-semibold text-eucalypt">{c.distance_km} km away <span className="font-normal text-ink-muted">(straight-line)</span></p>}
        {c.online && <p className="mt-1 text-xs font-semibold text-eucalypt">Online — no distance</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[11px]">Fictional demo</Badge>
          {c.bulk_billing && <Badge className="bg-eucalypt-soft text-eucalypt">Bulk billing</Badge>}
          <Badge variant="outline" className="gap-1"><Star className="size-3 fill-[#FBBF24] text-[#FBBF24]" />{c.rating}</Badge>
          {c.services.slice(0, 2).map((s) => <Badge key={s} variant="secondary">{serviceNames[s] ?? s}</Badge>)}
        </div>
      </div>
      <ArrowRight className="size-5 self-center text-ink-muted transition-transform duration-200 group-hover:translate-x-1" />
    </button>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" data-testid={`booking-back-${label.toLowerCase().replace(/\s+/g, "-")}`} onClick={onClick} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-eucalypt hover:underline">
      <ArrowLeft className="size-4" /> {label}
    </button>
  );
}
