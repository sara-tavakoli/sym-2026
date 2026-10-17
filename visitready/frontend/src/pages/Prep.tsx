import { useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowRight, Check, Download, FileText, Printer, Link2, Lock, Pencil, Share2, Sparkles, Wand2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSignedIn, vurl } from "@/lib/persona";
import { apiPost, apiPut } from "@/lib/api";
import { formatDateTime, useCurrentPersona, useVisit, useVisitMutation } from "@/lib/hooks";
import { PREP_LABELS } from "@/lib/types";
import type { Brief, BriefUpdate, GenerateBriefRequest, PrepField, PrepForm, Questionnaire, Visit } from "@/lib/types";
import { cn } from "@/lib/utils";

const FIELDS: { key: PrepField; placeholder: string; rows: number }[] = [
  { key: "main_concern", placeholder: "What's the main thing you want help with?", rows: 2 },
  { key: "symptoms", placeholder: "What does it feel like? When is it better or worse?", rows: 2 },
  { key: "duration", placeholder: "When did it start?", rows: 1 },
  { key: "previous_care", placeholder: "Have you seen anyone or tried anything?", rows: 1 },
  { key: "history", placeholder: "Anything in your past health that might matter", rows: 2 },
  { key: "medications", placeholder: "Medicines, supplements or remedies you're using", rows: 1 },
  { key: "concerns", placeholder: "What are you worried about?", rows: 2 },
  { key: "questions", placeholder: "One question per line", rows: 3 },
];

const EMPTY: PrepForm = {
  main_concern: "", symptoms: "", duration: "", previous_care: "", history: "", medications: "", concerns: "", questions: "", prefilled_fields: [],
};

function initialPrep(v: Visit): PrepForm {
  if (v.prep) return v.prep;
  const q: Questionnaire | null = v.questionnaire;
  if (!q || !q.consent_reuse) return EMPTY;
  const prev = q.consulted_before === "yes" ? "I've already seen a health professional about this." : "I haven't seen a health professional about this yet.";
  return {
    ...EMPTY,
    main_concern: q.main_concern,
    duration: q.duration,
    previous_care: q.referral ? `${prev} Referral: ${q.referral}` : prev,
    prefilled_fields: ["main_concern", "duration", "previous_care"],
  };
}

export default function Prep() {
  const visit = useVisit();
  const v = visit.data;
  return (
    <AppShell>
      <PageHeader
        stage="prep"
        eyebrow="Step 2 · Prepare"
        title="Get ready for your appointment"
        intro="Add what matters to you. AI organises your own words into a one-page brief — every point links back to what you wrote, and you decide whether your doctor sees it."
        aside={
          v?.booking && (
            <div data-testid="prep-appointment-chip" className="rounded-2xl frost-card px-4 py-3 text-sm">
              <p className="text-xs uppercase tracking-[0.15em] text-ink-muted">Appointment</p>
              <p className="text-ink font-medium">{v.booking.practitioner_name}</p>
              <p className="text-ink-muted">{format(parseISO(v.booking.date), "EEE d MMM")} · {v.booking.time} · {v.booking.clinic_name}</p>
            </div>
          )
        }
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-8">
        {visit.isLoading && <div className="h-96 rounded-3xl ai-shimmer" />}
        {!visit.isLoading && (visit.isError || !v?.booking) && <PrepEmpty />}
        {v?.booking && !visit.isError && <PrepWorkspace key={v.id + (v.prep ? "-saved" : "-new")} visit={v} />}
      </div>
    </AppShell>
  );
}

/** The Prepare screen with nothing entered yet — shown to guests and to patients without a booking. */
function PrepEmpty() {
  const signedIn = useSignedIn();
  return (
    <div className="space-y-6">
      <div data-testid="prep-no-booking" className="rounded-2xl bg-eucalypt-soft border border-eucalypt/20 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-eucalypt">
          <strong>Nothing here yet.</strong> {signedIn ? "Book an appointment and your brief will be linked to that visit." : "Find care and sign in to book — then you can fill this in."}
        </p>
        <Link to="/patient/navigate" data-testid="prep-find-care-link" className={cn(buttonVariants(), "rounded-full")}>Find care <ArrowRight className="size-4" /></Link>
      </div>
      <div className="grid lg:grid-cols-12 gap-6 opacity-90">
        <section data-testid="prep-empty-form" className="lg:col-span-5 rounded-3xl frost-card p-5 sm:p-6">
          <h2 className="text-xl text-ink">Your details</h2>
          <div className="mt-4 space-y-4">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <Label htmlFor={`prep-empty-${f.key}`} className="text-ink">{PREP_LABELS[f.key]}</Label>
                <Textarea id={`prep-empty-${f.key}`} data-testid={`prep-empty-${f.key}-input`} disabled value="" rows={f.rows} placeholder={f.placeholder} className="mt-1.5 bg-cream min-h-0" />
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button disabled className="h-11 px-5 rounded-full"><Sparkles className="size-4" /> Generate my brief</Button>
            <Button variant="outline" disabled className="h-11 rounded-full">Save details</Button>
          </div>
        </section>
        <section className="lg:col-span-7">
          <div data-testid="brief-empty" className="rounded-3xl border border-dashed border-line bg-white/60 p-10 text-center lg:sticky lg:top-24">
            <FileText className="mx-auto size-8 text-ink-muted" />
            <h3 className="mt-3 text-xl text-ink">Your one-page brief will appear here</h3>
            <p className="mt-1 text-sm text-ink-muted">Every point links back to what you wrote, and you choose whether your doctor sees it.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function PrepWorkspace({ visit }: { visit: Visit }) {
  const [form, setForm] = useState<PrepForm>(() => initialPrep(visit));
  const [highlight, setHighlight] = useState<string | null>(null);
  const savePrep = useVisitMutation((p: PrepForm) => apiPut<Visit>(vurl("/visit/prep"), p), "Details saved");
  const generate = useVisitMutation((b: GenerateBriefRequest) => apiPost<Visit>(vurl("/visit/brief/generate"), b));
  const prefilled = new Set(form.prefilled_fields);
  const hasAny = FIELDS.some((f) => form[f.key].trim());

  const set = (k: PrepField, val: string) =>
    setForm((f) => ({ ...f, [k]: val, prefilled_fields: f.prefilled_fields.filter((x) => x !== k || val === f[k]) }));

  const persona = useCurrentPersona();
  const fillDemo = () =>
    persona &&
    setForm((f) => {
      const next = { ...f };
      FIELDS.forEach(({ key }) => { if (!next[key].trim() && persona.demo_prep[key]) next[key] = persona.demo_prep[key]; });
      return next;
    });

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      <section className="lg:col-span-5 rounded-3xl frost-card p-5 sm:p-6 animate-fade-up">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl text-ink">Your details</h2>
          {persona && (
            <Button variant="ghost" size="sm" data-testid="prep-fill-demo-btn" onClick={fillDemo}>
              <Wand2 className="size-4" /> Fill {persona.patient.name.split(" ")[0]}'s details
            </Button>
          )}
        </div>
        {form.prefilled_fields.length > 0 && (
          <p data-testid="prep-prefill-notice" className="mt-2 text-xs text-eucalypt bg-eucalypt-soft rounded-xl px-3 py-2">
            Some answers were carried over from your questionnaire because you agreed to reuse them.
          </p>
        )}
        {visit.questionnaire && !visit.questionnaire.consent_reuse && !visit.prep && (
          <p data-testid="prep-no-consent-notice" className="mt-2 text-xs text-ink-muted bg-sand rounded-xl px-3 py-2">
            You chose not to reuse your questionnaire answers, so this form starts blank.
          </p>
        )}
        <div className="mt-4 space-y-4">
          {FIELDS.map((f) => (
            <div
              key={f.key}
              id={`field-${f.key}`}
              className={cn(
                "rounded-2xl p-2 -m-2 transition-[background-color,box-shadow] duration-300",
                highlight === f.key && "bg-terracotta-soft ring-2 ring-terracotta/50",
              )}
            >
              <div className="flex items-center justify-between">
                <Label htmlFor={`prep-${f.key}`} className="text-ink">{PREP_LABELS[f.key]}</Label>
                {prefilled.has(f.key) && <Badge data-testid={`prefilled-badge-${f.key}`} className="bg-eucalypt-soft text-eucalypt text-[11px]">From questionnaire</Badge>}
              </div>
              <Textarea
                id={`prep-${f.key}`}
                data-testid={`prep-${f.key}-input`}
                value={form[f.key]}
                rows={f.rows}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="mt-1.5 bg-cream min-h-0"
              />
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            data-testid="generate-brief-btn"
            disabled={!hasAny || generate.isPending}
            onClick={() => generate.mutate({ prep: form, use_fallback: false })}
            className="h-11 px-5 rounded-full"
          >
            <Sparkles className="size-4" /> {generate.isPending ? "Generating…" : visit.brief ? "Regenerate brief" : "Generate my brief"}
          </Button>
          <Button variant="outline" data-testid="save-prep-btn" disabled={savePrep.isPending} onClick={() => savePrep.mutate(form)} className="h-11 rounded-full">
            Save details
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="generate-brief-fallback-btn"
            disabled={!hasAny || generate.isPending}
            onClick={() => generate.mutate({ prep: form, use_fallback: true })}
            className="text-ink-muted self-center"
          >
            Use prepared fallback
          </Button>
        </div>
      </section>

      <section className="lg:col-span-7">
        {generate.isPending ? (
          <div data-testid="brief-generating" className="rounded-3xl frost-card p-6 space-y-3">
            <p className="text-sm text-eucalypt flex items-center gap-2"><Sparkles className="size-4 animate-pulse" /> GPT-5.2 is organising your words into a brief…</p>
            {[80, 60, 90, 70, 50].map((w, i) => <div key={i} className="h-5 rounded-lg ai-shimmer" style={{ width: `${w}%` }} />)}
          </div>
        ) : visit.brief ? (
          <BriefEditor key={visit.brief.generated_at} brief={visit.brief} visit={visit} onHighlight={setHighlight} />
        ) : (
          <div data-testid="brief-empty" className="rounded-3xl border border-dashed border-line bg-white/60 p-10 text-center lg:sticky lg:top-24">
            <FileText className="mx-auto size-8 text-ink-muted" />
            <h3 className="mt-3 text-xl text-ink">Your one-page brief will appear here</h3>
            <p className="mt-1 text-sm text-ink-muted">Add a few details, then generate. You can edit everything before saving.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function BriefEditor({ brief, visit, onHighlight }: { brief: Brief; visit: Visit; onHighlight: (f: string | null) => void }) {
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(brief.points.map((p) => [p.id, p.text])));
  const [shared, setShared] = useState(brief.shared);
  const [editingId, setEditingId] = useState<string | null>(null);
  const save = useVisitMutation((b: BriefUpdate) => apiPut<Visit>(vurl("/visit/brief"), b), shared ? "Brief saved and shared with your clinician" : "Brief saved privately");
  const dirty = brief.status !== "saved" || shared !== brief.shared || brief.points.some((p) => texts[p.id] !== p.text);

  const sections: string[] = [...new Set(brief.points.map((p) => p.section))];
  const focusSource = (field: string) => {
    onHighlight(field);
    document.getElementById(`field-${field}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => onHighlight(null), 2200);
  };

  return (
    <div data-testid="brief-card" className="rounded-3xl frost-card overflow-hidden lg:sticky lg:top-24 animate-fade-up">
      <div className="px-6 py-4 border-b border-line bg-sand/50 flex flex-wrap items-center gap-2 justify-between">
        <div>
          <p className="tracking-[0.15em] uppercase text-[11px] font-semibold text-ink-muted">Appointment brief · {visit.patient.name}</p>
          <h3 className="text-xl text-ink">For {visit.booking?.practitioner_name}</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge data-testid="brief-status-badge" className={brief.status === "saved" ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#FEF3C7] text-[#92400E]"}>
            {brief.status === "saved" ? "Saved" : "Draft — review me"}
          </Badge>
          <Badge data-testid="brief-ai-source-badge" variant="outline">
            {brief.ai_source === "live" ? "AI · GPT-5.2" : "Prepared fallback"}
          </Badge>
          <Badge data-testid="brief-share-badge" variant="outline" className={brief.shared ? "text-eucalypt border-eucalypt/40" : ""}>
            {brief.shared ? <><Share2 className="size-3" /> Shared</> : <><Lock className="size-3" /> Private</>}
          </Badge>
        </div>
      </div>

      <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
        {sections.map((section) => (
          <div key={section}>
            <p className="font-heading text-sm font-semibold text-eucalypt">{section}</p>
            <ul className="mt-2 space-y-2">
              {brief.points.filter((p) => p.section === section).map((p) => (
                <li key={p.id} data-testid={`brief-point-${p.id}`} className="group rounded-xl hover:bg-cream transition-colors duration-200 p-2 -mx-2">
                  {editingId === p.id ? (
                    <div className="space-y-2">
                      <Textarea
                        data-testid={`brief-point-input-${p.id}`}
                        value={texts[p.id]}
                        autoFocus
                        onChange={(e) => setTexts((t) => ({ ...t, [p.id]: e.target.value }))}
                        className="bg-white"
                      />
                      <Button size="xs" data-testid={`brief-point-done-${p.id}`} onClick={() => setEditingId(null)} disabled={!texts[p.id]?.trim()}>
                        <Check className="size-3" /> Done
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-start">
                      <span className="mt-2 size-1.5 rounded-full bg-terracotta shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-ink leading-relaxed">{texts[p.id]}</p>
                        <button
                          type="button"
                          data-testid={`source-chip-${p.id}`}
                          title={`You wrote: “${p.source_text}”`}
                          onMouseEnter={() => onHighlight(p.source_field)}
                          onMouseLeave={() => onHighlight(null)}
                          onFocus={() => onHighlight(p.source_field)}
                          onBlur={() => onHighlight(null)}
                          onClick={() => focusSource(p.source_field)}
                          className="mt-1 inline-flex items-center gap-1 rounded-full bg-eucalypt-soft text-eucalypt px-2 py-0.5 text-[11px] font-medium hover:bg-eucalypt hover:text-white transition-colors duration-200"
                        >
                          <Link2 className="size-3" /> Source: {PREP_LABELS[p.source_field as PrepField] ?? p.source_field}
                          {(p.edited || texts[p.id] !== p.text) && <span className="opacity-70">· edited</span>}
                        </button>
                      </div>
                      <button
                        type="button"
                        data-testid={`brief-point-edit-${p.id}`}
                        aria-label="Edit point"
                        onClick={() => setEditingId(p.id)}
                        className="opacity-60 group-hover:opacity-100 p-1 rounded-lg hover:bg-white transition-opacity duration-200"
                      >
                        <Pencil className="size-3.5 text-ink-muted" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line p-5 sm:p-6 bg-cream/60 space-y-4">
        <label className={cn("flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-colors duration-200", shared ? "border-eucalypt bg-eucalypt-soft/60" : "border-line bg-white")}>
          <Checkbox data-testid="share-consent-toggle" checked={shared} onCheckedChange={(c) => setShared(c === true)} className="mt-0.5" />
          <span className="text-sm leading-relaxed">
            <strong className="text-ink">Share this brief with {visit.booking?.practitioner_name}</strong>
            <span className="block text-ink-muted">Only shared if you tick this. You can change your mind before your appointment.</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted" data-testid="brief-saved-at">
            {brief.saved_at ? `Last saved ${formatDateTime(brief.saved_at)}` : "Not saved yet"}
          </p>
          <div className="flex flex-wrap gap-2">
            {!dirty && (
              <>
                <a
                  href={`/api${vurl("/visit/brief/pdf")}`}
                  download
                  data-testid="download-brief-pdf-btn"
                  className={cn(buttonVariants({ variant: "outline" }), "rounded-full bg-white")}
                >
                  <Download className="size-4" /> PDF
                </a>
                <Link to="/patient/brief/print" data-testid="print-brief-link" className={cn(buttonVariants({ variant: "outline" }), "rounded-full bg-white")}>
                  <Printer className="size-4" /> Print
                </Link>
              </>
            )}
            {brief.status === "saved" && !dirty && (
              <Link to="/patient/journey" data-testid="brief-continue-link" className={cn(buttonVariants({ variant: "outline" }), "rounded-full")}>
                Back to journey
              </Link>
            )}
            <Button
              data-testid="save-brief-btn"
              disabled={save.isPending || !dirty || editingId !== null}
              onClick={() => save.mutate({ points: brief.points.map((p) => ({ id: p.id, text: texts[p.id] })), shared })}
              className="rounded-full px-5"
            >
              {save.isPending ? "Saving…" : brief.status === "saved" && !dirty ? "Saved" : "Save brief"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
