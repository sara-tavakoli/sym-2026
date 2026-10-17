import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, MessageCircleHeart, Search } from "lucide-react";
import AppShell from "@/components/AppShell";
import JourneyShowcase from "@/components/JourneyShowcase";
import Testimonials from "@/components/Testimonials";
import { useServices } from "@/lib/hooks";

// GP talking with a patient — Unsplash (free to use), photo-1631217868264-e5b90bb7e133.
const HERO_IMG = "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?crop=entropy&cs=srgb&fm=jpg&w=2000&q=75";
const EXAMPLES = ["I have a fever", "I have a sore throat"];

// Frosted, see-through cards: the photo shows through while white text stays readable.
const GLASS = "rounded-3xl bg-eucalypt-deep/35 backdrop-blur-md border border-white/25 p-5 text-white shadow-[0_20px_50px_-30px_rgba(0,0,0,0.6)] transition-[background-color,border-color] duration-200 hover:bg-eucalypt-deep/45 hover:border-white/40";
const FIELD = "w-full h-11 rounded-xl bg-white/95 text-ink placeholder:text-ink-muted pl-9 pr-3 text-[15px] outline-none border border-transparent focus:border-[#FCD34D] focus:ring-2 focus:ring-[#FCD34D]/40 transition-[border-color,box-shadow] duration-200";
const GO = "h-11 shrink-0 rounded-xl bg-[#FCD34D] text-eucalypt-deep px-4 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-white transition-colors duration-200";

export default function Home() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const services = useServices();
  const search = () => navigate(`/patient/clinics${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
  const typed = symptoms.trim().toLowerCase();
  const matches = typed.length < 3 ? [] : (services.data ?? []).filter((s) =>
    s.keywords.some((k) => new RegExp(`\\b${k}\\b`).test(typed) || typed.split(/\s+/).some((w) => w.length >= 3 && k.startsWith(w))),
  ).slice(0, 3);
  const guided = (text: string) => navigate(`/patient/navigate${text.trim() ? `?concern=${encodeURIComponent(text.trim())}` : ""}`);

  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-8 sm:pt-10">
        <div className="max-w-3xl animate-fade-up">
          <h1 data-testid="home-hero-title" className="text-[38px] sm:text-[52px] leading-[1.06] tracking-tight text-ink">Your health journey, connected.</h1>
          <p data-testid="home-hero-subtitle" className="mt-3 text-lg text-ink-muted leading-relaxed max-w-2xl">
            Find the care you need, prepare with confidence, and stay on track after every visit — all in one place.
          </p>
        </div>

        <div data-testid="home-hero-banner" className="mt-6 relative rounded-3xl overflow-hidden min-h-[560px] lg:h-[540px] lg:min-h-0 flex flex-col">
          <img src={HERO_IMG} alt="A GP talking with a patient in a calm clinic room" data-testid="home-hero-image" className="absolute inset-0 size-full object-cover object-[center_25%]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,38,32,0.55)_0%,rgba(17,38,32,0.05)_30%,rgba(17,38,32,0.05)_50%,rgba(17,38,32,0.75)_100%)]" />
          <h2 data-testid="pathways-heading" className="relative px-5 sm:px-8 pt-6 text-[26px] sm:text-[30px] tracking-tight text-white drop-shadow">How can we help you today?</h2>

          <div className="relative mt-auto p-4 sm:p-6 grid md:grid-cols-2 gap-4">
            <div data-testid="pathway-direct-card" className={GLASS}>
              <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#FCD34D]">I know what I need</p>
              <h3 className="mt-1 text-[22px] leading-tight">Book the care you need</h3>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-muted" />
                  <input data-testid="pathway-direct-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a service, clinic or suburb" aria-label="Search services or clinics" className={FIELD} />
                </div>
                <button type="submit" data-testid="pathway-direct-btn" className={GO}>Search</button>
              </form>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(services.data ?? []).slice(0, 4).map((s) => (
                  <Link key={s.id} to={`/patient/clinics?service=${s.id}`} data-testid={`service-chip-${s.id}`} className="rounded-full border border-white/35 bg-white/10 px-3 py-1 text-[13px] text-white hover:bg-white hover:text-eucalypt-deep transition-colors duration-200">
                    {s.name}
                  </Link>
                ))}
              </div>
            </div>

            <div data-testid="pathway-guided-card" className={GLASS}>
              <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#FCD34D]">Help me find care</p>
              <h3 className="mt-1 text-[22px] leading-tight">Not sure? Tell us how you feel</h3>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); guided(symptoms); }}>
                <div className="relative flex-1">
                  <MessageCircleHeart className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-muted" />
                  <input data-testid="pathway-symptom-input" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Just type your symptoms here" aria-label="Tell us your symptoms" className={FIELD} />
                </div>
                <button type="submit" data-testid="pathway-guided-btn" className={GO}>Start <ArrowRight className="size-4" /></button>
              </form>
              {matches.length > 0 ? (
                <div data-testid="symptom-matches" className="mt-3 flex flex-wrap items-center gap-1.5 animate-fade-up">
                  <span className="text-[12px] text-white/75">Might suit:</span>
                  {matches.map((m) => (
                    <Link key={m.id} to={`/patient/clinics?service=${m.id}`} data-testid={`symptom-match-${m.id}`} className="rounded-full bg-[#FCD34D] text-eucalypt-deep px-3 py-1 text-[13px] font-medium hover:bg-white transition-colors duration-200">
                      {m.name}
                    </Link>
                  ))}
                  <span className="text-[11px] text-white/60">Guidance only — not a diagnosis</span>
                </div>
              ) : (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-white/75">Try:</span>
                {EXAMPLES.map((x) => (
                  <button key={x} type="button" data-testid={`symptom-example-${x.split(" ").slice(-1)[0]}`} onClick={() => guided(x)} className="rounded-full border border-white/35 bg-white/10 px-3 py-1 text-[13px] text-white hover:bg-white hover:text-eucalypt-deep transition-colors duration-200">
                    “{x}”
                  </button>
                ))}
              </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 mt-16" aria-labelledby="steps-heading">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-6">
          <h2 id="steps-heading" data-testid="steps-heading" className="text-[28px] sm:text-[34px] tracking-tight text-ink lg:whitespace-nowrap">One journey. Four connected steps.</h2>
          <p className="text-[14px] text-ink-muted">AI support and clinician-reviewed care instructions.</p>
        </div>
        <JourneyShowcase />
      </section>

      <Testimonials />
    </AppShell>
  );
}
