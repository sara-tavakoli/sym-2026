import { useEffect, useState } from "react";
import { BadgeCheck, Check, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { tag: "Discover", title: "Find your next step", text: "Not sure where to start? Explore care options and find an appointment that fits." },
  { tag: "Prepare", title: "Make every conversation count", text: "Turn your concerns and questions into a clear, editable appointment brief." },
  { tag: "Consult", title: "AI assists. Clinicians decide.", text: "AI drafts consultation notes while clinicians review and approve the care plan." },
  { tag: "Follow through", title: "Know what comes next", text: "Turn approved instructions into a personal checklist you can confirm and track." },
];
const DURATION = 5200;
const d = (ms: number) => ({ animationDelay: `${ms}ms` });

function Discover() {
  return (
    <div className="space-y-3">
      <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-[#FCD34D] text-eucalypt-deep px-4 py-2.5 text-sm animate-fade-up">I've had a dry cough for three weeks</div>
      <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-white/10 border border-white/15 px-4 py-3 text-sm animate-fade-up" style={d(500)}>
        <p className="text-[10px] uppercase tracking-[0.15em] text-[#6EE7B7]">Suggested starting point</p>
        <p className="mt-1 font-heading text-lg">General Practice (GP)</p>
        <p className="text-xs text-[#ADC5BE]">Guidance only — not a diagnosis</p>
      </div>
      <div className="flex flex-wrap gap-2 animate-fade-up" style={d(1100)}>
        {["08:45", "10:15", "13:30"].map((t, i) => (
          <span key={t} className={cn("rounded-xl border px-3 py-2 font-mono text-sm", i === 1 ? "bg-terracotta border-terracotta text-white" : "border-white/20 text-[#D1E7DF]")}>{t}</span>
        ))}
      </div>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-[#6EE7B7] text-eucalypt-deep px-3 py-1 text-xs font-semibold animate-fade-up" style={d(1700)}><Check className="size-3.5" /> Booked with Dr Sarah Lin</p>
    </div>
  );
}

function Prepare() {
  return (
    <div className="space-y-3">
      <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-white/10 border border-white/15 px-4 py-3 animate-fade-up">
        <p className="text-[11px] uppercase tracking-[0.15em] text-[#6EE7B7]">Your brief</p>
        <p className="mt-1 font-heading text-lg">Dry cough · 3 weeks · worse at night</p>
      </div>
      <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-[#FCD34D] text-eucalypt-deep px-4 py-2.5 text-sm animate-fade-up" style={d(600)}>Could this be asthma coming back?</div>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-[#6EE7B7] text-eucalypt-deep px-3 py-1 text-xs font-semibold animate-fade-up" style={d(1200)}><Share2 className="size-3.5" /> Shared with Dr Lin</p>
    </div>
  );
}

function Consult() {
  return (
    <div className="space-y-3">
      <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-white/10 border border-white/15 px-4 py-3 animate-fade-up">
        <p className="text-[11px] uppercase tracking-[0.15em] text-[#6EE7B7]">AI draft</p>
        <p className="mt-1 font-heading text-lg">Notes &amp; care plan ready to review</p>
      </div>
      <p className="w-fit rounded-xl border-2 border-[#6EE7B7] px-4 py-2 font-semibold tracking-wide text-[#6EE7B7] animate-fade-up" style={d(800)}>
        <BadgeCheck className="inline size-4 mr-1.5" />APPROVED BY DR LIN
      </p>
    </div>
  );
}

function Follow() {
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} className={cn("size-9 rounded-xl grid place-items-center", i < 5 ? "bg-[#6EE7B7] text-eucalypt-deep animate-fade-up" : "border border-dashed border-white/30")} style={i < 5 ? d(i * 180) : undefined}>
            {i < 5 && <Check className="size-4" />}
          </span>
        ))}
      </div>
      <p className="w-fit rounded-2xl bg-[#FCD34D] text-eucalypt-deep px-4 py-2.5 font-heading text-base animate-fade-up" style={d(1100)}>Small steps add up. Day 5 of 14.</p>
    </div>
  );
}

const PREVIEWS = [Discover, Prepare, Consult, Follow];

export default function JourneyShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % STEPS.length), DURATION);
    return () => window.clearTimeout(t);
  }, [active, paused]);
  const Preview = PREVIEWS[active];

  return (
    <div
      data-testid="journey-showcase"
      className="relative overflow-hidden rounded-[32px] bg-eucalypt-deep text-white p-4 sm:p-6 lg:p-8"
    >
      <div className="absolute -left-24 -bottom-24 size-80 rounded-full bg-eucalypt/50 blur-3xl pointer-events-none" aria-hidden />
      <ol role="tablist" aria-label="VisitReady journey" className="relative space-y-1" onMouseLeave={() => setPaused(false)}>
        {STEPS.map((s, i) => {
          const on = i === active;
          return (
            <li key={s.tag} onMouseEnter={() => { setActive(i); setPaused(true); }} className={cn("rounded-2xl transition-[background-color] duration-300", on ? "bg-white/10" : "hover:bg-white/5")}>
              <button role="tab" aria-selected={on} data-testid={`showcase-tab-${i + 1}`} onClick={() => setActive(i)} className="group w-full text-left px-4 pt-3 pb-3">
                <div className="flex items-baseline gap-4">
                  <span className={cn("font-heading text-3xl sm:text-4xl tabular-nums transition-colors duration-300", on ? "text-[#FCD34D]" : "text-white/30")}>0{i + 1}</span>
                  <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-4">
                    <p className={cn("font-heading text-xl sm:text-2xl leading-snug transition-colors duration-300", on ? "text-white" : "text-white/55 group-hover:text-white/80")}>{s.title}</p>
                    <p className={cn("text-[11px] uppercase tracking-[0.18em] font-semibold", on ? "text-[#6EE7B7]" : "text-white/40")}>{s.tag}</p>
                  </div>
                </div>
                <div className="mt-3 h-0.5 rounded-full bg-white/10 overflow-hidden">
                  {on && <div key={`${active}-${paused}`} className="h-full bg-[#FCD34D]" style={{ width: paused ? "100%" : undefined, animation: paused ? undefined : `showcase-progress ${DURATION}ms linear forwards` }} />}
                </div>
              </button>
              {on && (
                <div data-testid={`showcase-preview-${i + 1}`} className="px-4 pb-5 grid md:grid-cols-[1fr_1.1fr] gap-6 items-center animate-fade-up">
                  <div className="md:pl-[52px]">
                    <p className="text-[15px] text-[#D1E7DF] leading-relaxed max-w-md">{s.text}</p>
                  </div>
                  <Preview />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
