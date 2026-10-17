import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowLeft, BadgeCheck, CalendarClock, CheckCheck, FileAudio, GitCompareArrows, Lock, Pencil, Plus, ShieldCheck, Sparkles, Trash2, User } from "lucide-react";
import AppShell from "@/components/AppShell";
import BeforeAfter, { countChanges } from "@/components/BeforeAfter";
import AuditTimeline from "@/components/AuditTimeline";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { setPersona, usePersonaId, vurl } from "@/lib/persona";
import { useClinicianSignedIn } from "@/lib/clinicianSession";
import { apiPost, apiPut } from "@/lib/api";
import { formatDateTime, useTranscript, useVisit, useVisitMutation } from "@/lib/hooks";
import { KIND_LABELS } from "@/lib/types";
import type { ApproveRequest, ClinicalNotes, Consult, ConsultUpdate, GenerateNotesRequest, Instruction, InstructionKind, Visit } from "@/lib/types";
import { cn } from "@/lib/utils";

const SOAP: { key: keyof ClinicalNotes; label: string }[] = [
  { key: "subjective", label: "Subjective" },
  { key: "objective", label: "Objective" },
  { key: "assessment", label: "Assessment" },
  { key: "plan", label: "Plan" },
];
const WORKFLOW = ["Generate draft", "Review & edit", "Approve & release"];

function TranscriptView({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <div data-testid="transcript-view" className="mt-3 max-h-[420px] overflow-y-auto space-y-2 pr-1">
      {lines.map((line, i) => {
        const m = line.match(/^([^:]{2,24}):\s*(.*)$/);
        const speaker = m?.[1] ?? "";
        const body = m?.[2] ?? line;
        const isDoctor = /^dr\b/i.test(speaker);
        return (
          <div key={i} className={cn("flex animate-fade-up", isDoctor ? "justify-start" : "justify-end")} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
            <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed", isDoctor ? "bg-eucalypt-soft text-ink rounded-bl-sm" : "bg-sand text-ink rounded-br-sm")}>
              {speaker && <p className={cn("text-[10px] uppercase tracking-[0.15em] font-semibold", isDoctor ? "text-eucalypt" : "text-terracotta")}>{speaker}</p>}
              <p>{body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Clinician() {
  const { persona: routePersona = "alex" } = useParams();
  const personaId = usePersonaId();
  const signedIn = useClinicianSignedIn();
  // The URL decides which patient's visit is open; keep the shared persona store in step with it.
  useEffect(() => { if (routePersona !== personaId) setPersona(routePersona); }, [routePersona, personaId]);
  const visit = useVisit();
  const v = routePersona === personaId ? visit.data : undefined;
  const transcriptQ = useTranscript();
  const [draftText, setDraftText] = useState<{ visitId: string; text: string } | null>(null);
  const [editingTranscript, setEditingTranscript] = useState(false);
  const generate = useVisitMutation((b: GenerateNotesRequest) => apiPost<Visit>(vurl("/visit/consult/generate"), b), "AI draft ready — review before approving");

  // Local transcript belongs to the current persona's visit; switching persona drops it.
  const text = (draftText && draftText.visitId === v?.id ? draftText.text : null) ?? v?.consult.transcript ?? "";
  const setText = (t: string) => v && setDraftText({ visitId: v.id, text: t });
  const status = v?.consult.status ?? "none";
  const stepIndex = status === "none" ? 0 : status === "draft" ? 1 : 3;
  const briefShared = v?.brief?.shared && v.brief.status === "saved";
  const canGenerate = text.trim().length >= 20 && !generate.isPending && status !== "approved" && !!v?.booking;
  if (!signedIn) return <Navigate to="/clinician" replace />;

  return (
    <AppShell mode="clinician">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-8 animate-fade-up">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link to="/clinician/dashboard" data-testid="back-to-dashboard-link" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-eucalypt transition-colors duration-200">
              <ArrowLeft className="size-4" /> Today's appointments
            </Link>
            <p className="mt-3 tracking-[0.15em] uppercase text-xs font-semibold text-terracotta">Consultation workspace · Simulated</p>
            <h1 data-testid="consult-heading" className="mt-2 text-3xl sm:text-[42px] leading-tight tracking-tight text-ink">{v ? `Consultation · ${v.patient.name}` : "Consultation"}</h1>
            <p className="mt-2 text-ink-muted max-w-2xl">AI drafts notes from the transcript. They stay in Draft until you review, approve each follow-up item and release them — nothing reaches the patient before then.</p>
          </div>
          <ol data-testid="clinician-workflow-stepper" className="flex items-center gap-2">
            {WORKFLOW.map((w, i) => (
              <li key={w} className="flex items-center gap-2">
                <span
                  data-testid={`workflow-step-${i + 1}`}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium border",
                    i < stepIndex ? "bg-eucalypt text-white border-eucalypt" : i === stepIndex ? "bg-white border-terracotta text-terracotta" : "border-line text-ink-muted",
                  )}
                >
                  {i + 1}. {w}
                </span>
                {i < 2 && <span className="w-4 h-px bg-line" />}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-8 grid lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-5 space-y-5">
          <div data-testid="clinician-appointment-card" className="rounded-3xl bg-eucalypt-deep text-white p-5">
            <div className="flex items-center gap-3">
              <span className="size-11 rounded-full bg-[#FCD34D] text-eucalypt-deep grid place-items-center font-semibold"><User className="size-5" /></span>
              <div>
                <p data-testid="clinician-patient-name" className="font-heading text-xl">{v?.patient.name ?? "Fictional patient"}</p>
                <p className="text-xs text-[#ADC5BE]">{v ? `${v.patient.age} · ${v.patient.pronouns} · ${v.patient.suburb}` : "Fictional patient"}</p>
              </div>
            </div>
            {v?.booking ? (
              <p data-testid="clinician-appointment-time" className="mt-4 text-sm text-[#D1E7DF] flex items-center gap-2">
                <CalendarClock className="size-4" /> {format(parseISO(v.booking.date), "EEE d MMM")} · {v.booking.time} · {v.booking.practitioner_name}, {v.booking.clinic_name}
              </p>
            ) : (
              <p data-testid="clinician-no-appointment" className="mt-4 text-sm text-[#FCD34D]">No appointment booked yet. Switch to Patient mode to book one.</p>
            )}
            <p className="mt-2 font-mono text-[11px] text-[#ADC5BE]">Visit {v?.id ?? "—"}{v?.booking && ` · Ref ${v.booking.reference}`}</p>
          </div>

          <div data-testid="clinician-shared-brief" className="rounded-3xl bg-white border border-line p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg text-ink">Patient preparation brief</h2>
              {briefShared ? <Badge className="bg-eucalypt-soft text-eucalypt">Shared by patient</Badge> : <Badge variant="outline"><Lock className="size-3" /> Not shared</Badge>}
            </div>
            {briefShared && v?.brief ? (
              <ul className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
                {v.brief.points.map((p) => (
                  <li key={p.id} className="text-sm">
                    <span className="text-xs font-semibold text-eucalypt">{p.section}</span>
                    <p className="text-ink leading-relaxed">{p.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p data-testid="clinician-brief-locked" className="mt-3 text-sm text-ink-muted">
                The patient hasn't chosen to share a preparation brief. It stays private unless they opt in.
              </p>
            )}
          </div>

          <div className="rounded-3xl bg-white border border-line p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg text-ink flex items-center gap-2"><FileAudio className="size-4 text-eucalypt" /> Consultation transcript</h2>
              <div className="flex gap-1">
                {text && status !== "approved" && (
                  <Button variant="ghost" size="sm" data-testid="toggle-transcript-edit-btn" onClick={() => setEditingTranscript((e) => !e)}>
                    <Pencil className="size-3.5" /> {editingTranscript ? "View" : "Edit text"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="load-transcript-btn"
                  disabled={!transcriptQ.data || status === "approved"}
                  onClick={() => { if (transcriptQ.data) { setText(transcriptQ.data.text); setEditingTranscript(false); } }}
                >
                  Load sample consultation
                </Button>
              </div>
            </div>
            {text && transcriptQ.data && text === transcriptQ.data.text && (
              <p data-testid="transcript-title" className="mt-2 text-xs text-ink-muted">{transcriptQ.data.title}</p>
            )}
            {text && !editingTranscript ? (
              <TranscriptView text={text} />
            ) : (
              <Textarea
                data-testid="transcript-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={status === "approved"}
                rows={12}
                placeholder="Load the sample consultation, or paste a fictional transcript."
                className="mt-3 font-mono text-xs leading-relaxed bg-[#F5F7F6]"
              />
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button data-testid="generate-soap-btn" disabled={!canGenerate} onClick={() => generate.mutate({ transcript: text, use_fallback: false })} className="rounded-full">
                <Sparkles className="size-4" /> {generate.isPending ? "Drafting notes…" : status === "draft" ? "Regenerate AI draft notes" : "Generate AI draft notes"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="generate-soap-fallback-btn"
                disabled={!canGenerate}
                onClick={() => generate.mutate({ transcript: text, use_fallback: true })}
                className="text-ink-muted self-center"
              >
                Use prepared fallback draft
              </Button>
            </div>
          </div>
          {v && <AuditTimeline events={v.events} />}
        </aside>

        <section className="lg:col-span-7">
          {generate.isPending ? (
            <div data-testid="notes-generating" className="rounded-3xl bg-white border border-line p-6 space-y-4">
              <p className="text-sm text-eucalypt flex items-center gap-2"><Sparkles className="size-4 animate-pulse" /> GPT-5.2 is drafting SOAP notes and a patient plan…</p>
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl ai-shimmer" />)}
            </div>
          ) : v && v.consult.status !== "none" && v.consult.notes ? (
            <NotesEditor key={`${v.id}-${v.consult.generated_at ?? "x"}`} consult={v.consult} />
          ) : (
            <div data-testid="notes-empty" className="rounded-3xl border border-dashed border-line bg-white/70 p-10 text-center">
              <ShieldCheck className="mx-auto size-8 text-ink-muted" />
              <h3 className="mt-3 text-xl text-ink">No draft yet</h3>
              <p className="mt-1 text-sm text-ink-muted">Load the sample consultation and generate AI draft notes. You'll review and correct them before anything is released.</p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function NotesEditor({ consult }: { consult: Consult }) {
  const [notes, setNotes] = useState<ClinicalNotes>(consult.notes!);
  const [instructions, setInstructions] = useState<Instruction[]>(consult.instructions);
  const [view, setView] = useState<"edit" | "compare">(consult.status === "approved" ? "compare" : "edit");
  const save = useVisitMutation((b: ConsultUpdate) => apiPut<Visit>(vurl("/visit/consult"), b), "Edits saved — still in Draft");
  const approve = useVisitMutation((b: ApproveRequest) => apiPost<Visit>(vurl("/visit/consult/approve"), b), "Approved & released to the patient");
  const approved = consult.status === "approved";
  const valid = instructions.length > 0 && instructions.every((i) => i.text.trim()) && SOAP.every((s) => notes[s.key].trim());
  const approvedCount = instructions.filter((i) => i.approved).length;
  const allApproved = instructions.length > 0 && approvedCount === instructions.length;
  const changes = countChanges(consult.ai_notes, notes, consult.ai_instructions, instructions);

  // Changing an item's wording or type withdraws its approval so the clinician re-confirms the final text.
  const updateIns = (id: string, patch: Partial<Instruction>) =>
    setInstructions((list) => list.map((i) => (i.id === id ? { ...i, ...patch, approved: "approved" in patch ? !!patch.approved : false } : i)));
  const addIns = () => setInstructions((list) => [...list, { id: `ins-${Date.now()}`, kind: "self_care", text: "", approved: false }]);

  return (
    <div className="space-y-5 animate-fade-up">
      <div
        data-testid="notes-status-banner"
        className={cn(
          "rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm border",
          approved ? "bg-[#DCFCE7] border-[#BBF7D0] text-[#166534]" : "bg-[#FEF3C7] border-[#FDE68A] text-[#92400E]",
        )}
      >
        <span className="flex items-center gap-2 font-semibold">
          {approved ? <BadgeCheck className="size-4" /> : <Sparkles className="size-4" />}
          <span data-testid="notes-status-badge">{approved ? "APPROVED & RELEASED" : "DRAFT — not visible to patient"}</span>
        </span>
        <span className="text-xs">
          {approved
            ? `Approved by ${consult.approved_by} · ${formatDateTime(consult.approved_at!)}`
            : `${consult.ai_source === "live" ? "AI draft · GPT-5.2" : "Prepared fallback draft"}`}
        </span>
      </div>

      <div role="tablist" className="inline-flex rounded-full bg-white border border-line p-1">
        <button
          role="tab"
          aria-selected={view === "edit"}
          data-testid="view-edit-tab"
          onClick={() => setView("edit")}
          className={cn("rounded-full px-4 py-1.5 text-sm flex items-center gap-1.5 transition-[background-color,color] duration-200", view === "edit" ? "bg-eucalypt text-white" : "text-ink-muted hover:text-ink")}
        >
          <Pencil className="size-3.5" /> {approved ? "Final notes" : "Review & edit"}
        </button>
        <button
          role="tab"
          aria-selected={view === "compare"}
          data-testid="view-compare-tab"
          onClick={() => setView("compare")}
          className={cn("rounded-full px-4 py-1.5 text-sm flex items-center gap-1.5 transition-[background-color,color] duration-200", view === "compare" ? "bg-eucalypt text-white" : "text-ink-muted hover:text-ink")}
        >
          <GitCompareArrows className="size-3.5" /> Before / After
          <span data-testid="change-count" className={cn("font-mono text-[10px] rounded-full px-1.5", view === "compare" ? "bg-white/20" : changes ? "bg-terracotta text-white" : "bg-sand")}>{changes}</span>
        </button>
      </div>

      {view === "compare" ? (
        <div className="rounded-3xl bg-white border border-line p-5 sm:p-6">
          <h2 className="text-xl text-ink">AI draft vs clinician final</h2>
          <p className="text-xs text-ink-muted mb-4">
            {changes === 0 ? "No edits yet — the notes match the AI draft exactly." : `${changes} section${changes === 1 ? "" : "s"} changed by the clinician.`}
          </p>
          <BeforeAfter aiNotes={consult.ai_notes} notes={notes} aiInstructions={consult.ai_instructions} instructions={instructions} />
        </div>
      ) : (
        <>
          <div className="rounded-3xl bg-white border border-line p-5 sm:p-6">
            <h2 className="text-xl text-ink">Clinical notes <span className="text-sm text-ink-muted font-sans">(SOAP)</span></h2>
            <div className="mt-4 space-y-4">
              {SOAP.map((s) => {
                const edited = consult.ai_notes ? consult.ai_notes[s.key] !== notes[s.key] : false;
                return (
                  <div key={s.key}>
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`soap-${s.key}`} className="text-xs uppercase tracking-[0.15em] text-ink-muted">{s.label}</Label>
                      {edited && <span data-testid={`soap-${s.key}-edited`} className="text-[10px] font-semibold text-terracotta">Edited</span>}
                    </div>
                    <Textarea
                      id={`soap-${s.key}`}
                      data-testid={`soap-${s.key}-input`}
                      value={notes[s.key]}
                      disabled={approved}
                      onChange={(e) => setNotes((n) => ({ ...n, [s.key]: e.target.value }))}
                      rows={3}
                      className={cn("mt-1 bg-[#F5F7F6] leading-relaxed", edited && "border-terracotta/50")}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl bg-white border border-line p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl text-ink">Suggested patient-facing plan</h2>
                <p className="text-xs text-ink-muted max-w-md">Approve each item before release. These become the patient's suggested tasks; medication text is passed on word-for-word.</p>
              </div>
              {!approved && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="approve-all-items-btn"
                    disabled={allApproved || !valid}
                    onClick={() => setInstructions((l) => l.map((i) => ({ ...i, approved: true })))}
                  >
                    <CheckCheck className="size-4" /> Approve all
                  </Button>
                  <Button variant="outline" size="sm" data-testid="add-instruction-btn" onClick={addIns}>
                    <Plus className="size-4" /> Add
                  </Button>
                </div>
              )}
            </div>
            <ul className="mt-4 space-y-3">
              {instructions.map((ins, idx) => (
                <li
                  key={ins.id}
                  data-testid={`instruction-row-${idx}`}
                  data-approved={ins.approved}
                  className={cn("rounded-2xl border p-3 transition-[border-color,background-color] duration-200", ins.approved ? "border-[#86EFAC] bg-[#F0FDF4]" : "border-line bg-cream/50")}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={ins.kind} onValueChange={(val: string) => updateIns(ins.id, { kind: val as InstructionKind })} disabled={approved}>
                      <SelectTrigger size="sm" data-testid={`instruction-kind-${idx}`} className="w-36 bg-white">
                        <SelectValue>{(val) => KIND_LABELS[val as InstructionKind]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(KIND_LABELS) as InstructionKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {ins.kind === "medication" && <Badge className="bg-terracotta-soft text-terracotta">Released verbatim</Badge>}
                    <label className="ml-auto flex items-center gap-2 text-xs font-medium text-ink cursor-pointer">
                      <Checkbox
                        data-testid={`instruction-approve-${idx}`}
                        checked={ins.approved}
                        disabled={approved || !ins.text.trim()}
                        onCheckedChange={(c) => updateIns(ins.id, { approved: c === true })}
                      />
                      {ins.approved ? <span className="text-[#166534]">Approved</span> : "Approve item"}
                    </label>
                    {!approved && (
                      <Button variant="ghost" size="icon-sm" aria-label="Remove instruction" data-testid={`instruction-remove-${idx}`} onClick={() => setInstructions((l) => l.filter((i) => i.id !== ins.id))}>
                        <Trash2 className="size-4 text-ink-muted" />
                      </Button>
                    )}
                  </div>
                  <Textarea
                    data-testid={`instruction-text-${idx}`}
                    value={ins.text}
                    disabled={approved}
                    onChange={(e) => updateIns(ins.id, { text: e.target.value })}
                    rows={2}
                    className="mt-2 bg-white"
                  />
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {approved ? (
        <div data-testid="approved-panel" className="rounded-3xl bg-eucalypt-deep text-white p-6 relative overflow-hidden animate-fade-up">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-eucalypt/60 blur-2xl" aria-hidden />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="size-11 rounded-full bg-[#6EE7B7] text-eucalypt-deep grid place-items-center"><BadgeCheck className="size-6" /></span>
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-[#ADC5BE]">Approval confirmation</p>
                <p className="font-heading text-2xl">Approved &amp; Released</p>
              </div>
            </div>
            <dl className="mt-5 grid sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-2xl bg-white/10 border border-white/10 p-3">
                <dt className="text-[10px] uppercase tracking-[0.15em] text-[#ADC5BE]">Status</dt>
                <dd data-testid="confirm-status" className="mt-1 font-semibold">Approved &amp; Released</dd>
              </div>
              <div className="rounded-2xl bg-white/10 border border-white/10 p-3">
                <dt className="text-[10px] uppercase tracking-[0.15em] text-[#ADC5BE]">Approved by</dt>
                <dd data-testid="confirm-approved-by" className="mt-1 font-semibold">{consult.approved_by}</dd>
                <dd className="text-xs text-[#ADC5BE]">{consult.approved_at && formatDateTime(consult.approved_at)}</dd>
              </div>
              <div className="rounded-2xl bg-white/10 border border-white/10 p-3">
                <dt className="text-[10px] uppercase tracking-[0.15em] text-[#ADC5BE]">Released to patient</dt>
                <dd data-testid="confirm-released-count" className="mt-1 font-semibold">{instructions.length} patient-facing instruction{instructions.length === 1 ? "" : "s"}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-[#ADC5BE]">Notes are now locked. The patient sees these as suggested tasks and must confirm them before they become active.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/clinician/dashboard" data-testid="confirm-back-dashboard-link" className={cn(buttonVariants({ variant: "secondary" }), "rounded-full")}>
                Back to today's appointments
              </Link>
              <Link to="/patient/follow-through" data-testid="clinician-view-patient-actions-link" className={cn(buttonVariants({ variant: "outline" }), "rounded-full bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white")}>
                Switch to patient view
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-line p-5 flex flex-wrap items-center justify-between gap-3">
          <p data-testid="approval-progress" className="text-sm text-ink-muted">
            <strong className={allApproved ? "text-[#166534]" : "text-ink"}>{approvedCount} of {instructions.length}</strong> follow-up items approved
            {!allApproved && " — approve every item to release"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" data-testid="save-notes-btn" disabled={!valid || save.isPending} onClick={() => save.mutate({ notes, instructions })} className="rounded-full">
              Save edits (keep as draft)
            </Button>
            <Button
              data-testid="approve-release-btn"
              disabled={!allApproved || !valid || approve.isPending}
              onClick={() => approve.mutate({ notes, instructions })}
              className={cn("rounded-full px-5", allApproved && valid && "animate-pulse-ring")}
            >
              <BadgeCheck className="size-4" /> {approve.isPending ? "Releasing…" : "Approve & release to patient"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
