import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Info, Pencil, ShieldCheck, Wand2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import EmergencyBanner from "@/components/EmergencyBanner";
import PageHeader from "@/components/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { setGuest, useGuest, useSignedIn, vurl } from "@/lib/persona";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { errorMessage, useCurrentPersona, useServices, useVisit, useVisitMutation } from "@/lib/hooks";
import type { PathwaySuggestion, Preference, Questionnaire, Visit } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY: Questionnaire = {
  main_concern: "", duration: "", consulted_before: "no", referral: "", location: "", preference: "any", consent_reuse: false,
};
const CONCERN_CHIPS = ["Persistent cough", "Sore throat", "A new skin spot", "Lower back pain", "Feeling anxious lately"];
const DURATIONS = ["less than a week", "1–3 weeks", "more than 3 weeks", "several months"];
const PREFS: { v: Preference; l: string }[] = [
  { v: "in_person", l: "In person" }, { v: "telehealth", l: "Telehealth" }, { v: "any", l: "No preference" },
];
const STEP_TITLES = ["Not sure? Tell us how you feel", "How long has this been happening?", "Have you seen anyone about it?", "Where and how would you like to be seen?"];

function Option({ active, onClick, children, testid }: { active: boolean; onClick: () => void; children: React.ReactNode; testid: string }) {
  return (
    <button
      type="button"
      data-testid={testid}
      data-active={active}
      onClick={onClick}
      className={cn(
        "rounded-2xl border px-4 py-3 text-left text-sm transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.98]",
        active ? "border-eucalypt bg-eucalypt-soft text-eucalypt font-semibold" : "border-line bg-white text-ink hover:border-eucalypt/50",
      )}
    >
      {children}
    </button>
  );
}

export default function Navigate() {
  const visit = useVisit();
  const services = useServices();
  const persona = useCurrentPersona();
  // A concern typed on the homepage ("I have a fever") pre-fills question 1 and jumps to question 2.
  const [params] = useSearchParams();
  const initialConcern = params.get("concern") ?? "";
  const [form, setForm] = useState<Questionnaire>({ ...EMPTY, main_concern: initialConcern });
  const [step, setStep] = useState(initialConcern ? 1 : 0);
  const [editing, setEditing] = useState(!!initialConcern);
  const submit = useVisitMutation((q: Questionnaire) => apiPost<Visit>(vurl("/visit/questionnaire"), q), "Answers saved");

  const signedIn = useSignedIn();
  const guest = useGuest();
  const [guestBusy, setGuestBusy] = useState(false);
  // Signed-in patients save to their visit; guests keep answers in the browser until they sign in to book.
  const pathway = signedIn ? visit.data?.pathway : guest.pathway;
  const answers = signedIn ? visit.data?.questionnaire : guest.questionnaire;
  const showResult = !!pathway && !editing && !visit.isError;
  const set = <K extends keyof Questionnaire>(k: K, val: Questionnaire[K]) => setForm((f) => ({ ...f, [k]: val }));
  const canNext = [form.main_concern.trim().length >= 2, !!form.duration, true, form.location.trim().length >= 2][step];
  const serviceName = (id: string) => services.data?.find((s) => s.id === id)?.name ?? id;

  const onSubmit = () => {
    if (signedIn) return submit.mutate(form, { onSuccess: () => { setEditing(false); setStep(0); } });
    setGuestBusy(true);
    apiPost<PathwaySuggestion>("/pathway/suggest", form)
      .then((p) => { setGuest({ questionnaire: form, pathway: p }); setEditing(false); setStep(0); })
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => setGuestBusy(false));
  };
  const busy = submit.isPending || guestBusy;

  return (
    <AppShell>
      <PageHeader
        stage="find"
        eyebrow="Step 1 · Find care"
        title={showResult ? "Here's a place to start" : "Help me find the right care"}
        intro="Answer in your own words. We'll show services people with similar concerns often explore. This is guidance for finding care — not a diagnosis."
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-6">
        <EmergencyBanner strong={!!pathway?.emergency && showResult} />
      </div>

      {!showResult ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-6 grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 rounded-3xl frost-card p-6 sm:p-8 animate-fade-up">
            <div className="flex items-center justify-between gap-3">
              <span data-testid="questionnaire-step-indicator" className="font-mono text-xs text-ink-muted">
                Question {step + 1} of 4
              </span>
              {persona && (
                <Button variant="ghost" size="sm" data-testid="fill-demo-answers-btn" onClick={() => { setForm(persona.demo_questionnaire); setStep(3); }}>
                  <Wand2 className="size-4" /> Fill {persona.patient.name.split(" ")[0]}'s demo answers
                </Button>
              )}
            </div>
            <div className="mt-3 h-1 rounded-full bg-sand overflow-hidden">
              <div className="h-full bg-eucalypt transition-[width] duration-500" style={{ width: `${((step + 1) / 4) * 100}%` }} />
            </div>
            <h2 className="mt-6 text-2xl text-ink">{STEP_TITLES[step]}</h2>

            <div key={step} className="mt-5 animate-fade-up">
              {step === 0 && (
                <div className="space-y-4">
                  <Label htmlFor="concern" className="text-ink-muted">Describe how you feel in your own words</Label>
                  <Textarea
                    id="concern"
                    data-testid="q-concern-input"
                    value={form.main_concern}
                    onChange={(e) => set("main_concern", e.target.value)}
                    rows={4}
                    placeholder="e.g. I've had a cough for a few weeks and it's keeping me up at night"
                    className="bg-cream text-base"
                  />
                  <div className="flex flex-wrap gap-2">
                    {CONCERN_CHIPS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        data-testid={`q-concern-chip-${c.split(" ").join("-").toLowerCase()}`}
                        onClick={() => set("main_concern", c)}
                        className="rounded-full border border-line px-3 py-1 text-xs hover:border-eucalypt hover:text-eucalypt transition-colors duration-200"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {step === 1 && (
                <div className="grid sm:grid-cols-2 gap-3">
                  {DURATIONS.map((d) => (
                    <Option key={d} testid={`q-duration-${DURATIONS.indexOf(d)}`} active={form.duration === d} onClick={() => set("duration", d)}>
                      <span className="capitalize">{d}</span>
                    </Option>
                  ))}
                </div>
              )}
              {step === 2 && (
                <div className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Option testid="q-consulted-no" active={form.consulted_before === "no"} onClick={() => set("consulted_before", "no")}>
                      Not yet
                    </Option>
                    <Option testid="q-consulted-yes" active={form.consulted_before === "yes"} onClick={() => set("consulted_before", "yes")}>
                      Yes, I've seen a health professional
                    </Option>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="referral" className="text-ink-muted">Existing referral (optional)</Label>
                    <Input
                      id="referral"
                      data-testid="q-referral-input"
                      value={form.referral}
                      onChange={(e) => set("referral", e.target.value)}
                      placeholder="e.g. Referral to a respiratory physician"
                      className="bg-cream"
                    />
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="location" className="text-ink-muted">Suburb or postcode</Label>
                    <Input
                      id="location"
                      data-testid="q-location-input"
                      value={form.location}
                      onChange={(e) => set("location", e.target.value)}
                      placeholder="e.g. Carlton VIC 3053"
                      className="bg-cream"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-ink-muted">Booking preference (optional)</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {PREFS.map((p) => (
                        <Option key={p.v} testid={`q-pref-${p.v}`} active={form.preference === p.v} onClick={() => set("preference", p.v)}>
                          {p.l}
                        </Option>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-start gap-3 rounded-2xl bg-eucalypt-soft/60 border border-eucalypt/20 p-4 cursor-pointer">
                    <Checkbox
                      data-testid="q-consent-reuse-checkbox"
                      checked={form.consent_reuse}
                      onCheckedChange={(c) => set("consent_reuse", c === true)}
                      className="mt-0.5"
                    />
                    <span className="text-sm text-ink leading-relaxed">
                      <strong>Save my answers to help prepare for my appointment.</strong>
                      <span className="block text-ink-muted">You can review and change them later. Nothing is shared with a clinician without your say-so.</span>
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="mt-8 flex items-center justify-between">
              <Button variant="ghost" data-testid="q-back-btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              {step < 3 ? (
                <Button data-testid="q-next-btn" disabled={!canNext} onClick={() => setStep((s) => s + 1)} className="px-5">
                  {step === 0 ? "Start" : "Next"} <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button data-testid="q-submit-btn" disabled={!canNext || busy} onClick={onSubmit} className="px-5">
                  {busy ? "Finding options…" : "Show me where to start"}
                </Button>
              )}
            </div>
          </div>

          <aside className="lg:col-span-4 space-y-4">
            <div className="rounded-3xl border border-line bg-sand/60 p-6">
              <ShieldCheck className="size-5 text-eucalypt" />
              <h3 className="mt-3 text-lg text-ink">How this works</h3>
              <ul className="mt-2 space-y-2 text-sm text-ink-muted leading-relaxed">
                <li>We match your answers to a small set of predefined, fictional demo pathways.</li>
                <li>We never diagnose or decide how urgent something is.</li>
                <li>A health professional will always assess you properly.</li>
              </ul>
            </div>
            <div className="rounded-3xl frost-card p-6 text-sm text-ink-muted">
              <p className="text-ink font-medium">Not sure it can wait?</p>
              <p className="mt-1">Call healthdirect on <strong className="text-ink">1800 022 222</strong> for free advice from a registered nurse, 24/7.</p>
            </div>
          </aside>
        </div>
      ) : (
        pathway && (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-6 grid lg:grid-cols-12 gap-8">
            <div data-testid="pathway-suggestion-card" className="lg:col-span-7 rounded-3xl frost-card p-6 sm:p-8 animate-fade-up">
              <p className="tracking-[0.15em] uppercase text-xs font-semibold text-eucalypt">Suggested starting point</p>
              <h2 data-testid="pathway-service-name" className="mt-2 text-3xl text-ink">{pathway.service_name}</h2>
              <p className="mt-2 text-ink">{pathway.headline}.</p>
              <p className="mt-3 text-ink-muted leading-relaxed">{pathway.explanation}</p>
              <div className="mt-6">
                <p className="text-sm font-semibold text-ink">Why we're showing this</p>
                <ul className="mt-2 space-y-2">
                  {pathway.reasons.map((r) => (
                    <li key={r} className="flex gap-2 text-sm text-ink-muted"><span className="mt-2 size-1.5 rounded-full bg-terracotta shrink-0" />{r}</li>
                  ))}
                </ul>
              </div>
              <div data-testid="pathway-disclaimer" className="mt-6 flex gap-2 rounded-2xl bg-sand p-4 text-sm text-ink-muted">
                <Info className="size-4 shrink-0 mt-0.5 text-eucalypt" />
                This is not a diagnosis or a judgement about how serious things are. It's a starting point for finding the right health professional.
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to={`/patient/clinics?service=${pathway.service_id}`}
                  data-testid="pathway-find-clinics-btn"
                  className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 rounded-full")}
                >
                  Find {pathway.service_name} clinics <ArrowRight className="size-4" />
                </Link>
                {pathway.alternatives.map((a) => (
                  <Link
                    key={a}
                    to={`/patient/clinics?service=${a}`}
                    data-testid={`pathway-alt-${a}-link`}
                    className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 rounded-full bg-white")}
                  >
                    Or explore {serviceName(a)}
                  </Link>
                ))}
              </div>
            </div>
            {answers && (
              <aside data-testid="saved-answers-card" className="lg:col-span-5 rounded-3xl bg-eucalypt-deep text-white p-6 sm:p-8 animate-fade-up [animation-delay:100ms]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl">Your answers</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="edit-answers-btn"
                    className="text-[#6EE7B7] hover:bg-white/10 hover:text-white"
                    onClick={() => { setForm(answers); setEditing(true); setStep(0); }}
                  >
                    <Pencil className="size-4" /> Edit
                  </Button>
                </div>
                <dl className="mt-4 space-y-3 text-sm">
                  {[
                    ["Main concern", answers.main_concern],
                    ["Duration", answers.duration],
                    ["Seen someone before", answers.consulted_before === "yes" ? "Yes" : "Not yet"],
                    ["Referral", answers.referral || "None"],
                    ["Location", answers.location],
                  ].map(([k, val]) => (
                    <div key={k} className="border-b border-white/10 pb-2">
                      <dt className="text-xs uppercase tracking-[0.15em] text-[#ADC5BE]">{k}</dt>
                      <dd className="mt-0.5">{val}</dd>
                    </div>
                  ))}
                </dl>
                <p data-testid="consent-status" className="mt-4 text-xs text-[#ADC5BE]">
                  {answers.consent_reuse
                    ? "✓ You agreed to reuse these answers to prepare for your appointment."
                    : "You chose not to reuse these answers — your preparation form will start blank."}
                </p>
              </aside>
            )}
          </div>
        )
      )}
    </AppShell>
  );
}
