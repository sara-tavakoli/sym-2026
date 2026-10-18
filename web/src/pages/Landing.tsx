import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { DemoStrip, Logo } from "../components/ui";

const icons = {
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7",
  left: "M15 18l-6-6 6-6",
  right: "M9 18l6-6-6-6",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z",
  hand: "M12 21c-4 0-7-3-7-7V9a1.5 1.5 0 013 0v3M8 12V5.5a1.5 1.5 0 013 0V11M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6.5a1.5 1.5 0 013 0V14c0 4-2 7-5 7",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 018 0v3",
  share: "M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13",
};
function I({ d, size = 20 }: { d: keyof typeof icons; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icons[d]} />
    </svg>
  );
}

// Verified against the sources; caveats and exact wording are in docs/EVIDENCE.md.
const STATS = [
  { stat: "40–80%", label: "of medical information is forgotten by patients immediately", source: "Kessels, J R Soc Med 2003", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC539473/" },
  { stat: "4 in 35", label: "GP patients voiced everything they came to discuss", source: "Barry et al., BMJ 2000", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC27368/" },
  { stat: "11 sec", label: "median time before a patient's opening concern was interrupted", source: "Singh Ospina et al., JGIM 2019", url: "https://pubmed.ncbi.nlm.nih.gov/29968051/" },
  { stat: "up to 62%", label: "of lab tests were not followed up, in some ambulatory care studies", source: "Callen et al., JGIM 2012", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3445672/" },
  { stat: "3.0 million", label: "unpaid carers in Australia, many helping with appointments", source: "ABS SDAC 2022", url: "https://www.abs.gov.au/statistics/health/disability/disability-ageing-and-carers-australia-summary-findings/2022/key-findings-plain-language" },
  { stat: "59%", label: "of Australians aged 15–74 had below-adequate health literacy (2006)", source: "ABS 4233.0, 2006", url: "https://www.abs.gov.au/ausstats/abs@.nsf/latestproducts/4233.0main%20features22006" },
];

// Self-hosted copy of the prototype's Unsplash hero (GP talking with a patient, photo-1631217868264-e5b90bb7e133).
const HERO_IMG = "/img/hero-consult.jpg";

/* ---------- Journey showcase: the loop around an appointment, as an auto-advancing accordion ---------- */
const STEPS: { tag: string; title: string; text: string; points: string[]; preview: () => ReactNode }[] = [
  {
    tag: "Before", title: "Import your booking, prepare your brief",
    text: "Paste your booking confirmation and the details fill themselves in. Write your concern and questions in your own words: CarePath turns them into a one-page brief.",
    points: ["Every brief point links back to what you wrote", "Nothing is final until you confirm it"],
    preview: () => (
      <>
        <div className="bub bub-me">I keep getting headaches in the afternoon</div>
        <div className="bub bub-app d1"><small>Your brief · main concern</small><strong>Headaches most afternoons</strong><em>From your notes, word for word</em></div>
        <span className="pill-ok d2"><I d="check" size={14} /> Brief confirmed</span>
      </>
    ),
  },
  {
    tag: "During", title: "Share it with your clinician",
    text: "Send your brief through a secure, expiring link. Your GP sees your questions in priority order, ticks them off, and sends back the after-visit plan.",
    points: ["No clinician account needed", "Revoke the link at any time"],
    preview: () => (
      <>
        <div className="bub bub-app"><small>Shared with Dr Lee</small><strong>3 questions · in your order</strong></div>
        <div className="bub bub-me d1">Should I get my eyes checked?</div>
        <span className="pill-ok d2"><I d="check" size={14} /> 1 of 3 addressed</span>
      </>
    ),
  },
  {
    tag: "After", title: "Follow through, together",
    text: "The plan becomes a checklist with due dates. Overdue and unclear items are surfaced, and someone in your care circle can take tasks on.",
    points: ["Medication wording kept exactly as given", "A ready-to-send message for anything unclear"],
    preview: () => (
      <>
        <div className="days" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <span key={i} className={i < 5 ? "on" : ""} style={i < 5 ? { animationDelay: `${i * 0.15}s` } : undefined}>{i < 5 && <I d="check" size={15} />}</span>)}</div>
        <div className="bub bub-me d2">Mia picked up the blood test form</div>
      </>
    ),
  },
  {
    tag: "Find a service", title: "Not sure where to go? Find care that fits",
    text: "Fit Finder compares services by the practical things that matter: location, hours, telehealth, billing, language and accessibility. Missing details show as “Not verified”.",
    points: ["Clear reasons for every match", "Never judges clinical quality"],
    preview: () => (
      <>
        <div className="bub bub-me">A GP near Macquarie Park on Saturdays, bulk billed, who speaks Mandarin</div>
        <div className="bub bub-app d1"><small>Best practical fit</small><strong>Riverbend Family Practice</strong><em>Fictional demo directory</em></div>
        <span className="pill-ok d2"><I d="check" size={14} /> Open Saturdays · Bulk billing · Mandarin</span>
      </>
    ),
  },
];
const DURATION = 6000;

function JourneyShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (paused || reduced) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % STEPS.length), DURATION);
    return () => window.clearTimeout(t);
  }, [active, paused, reduced]);
  const s = STEPS[active];
  return (
    <div className="showcase" onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)}>
      <ol>
        {STEPS.map((step, i) => {
          const on = i === active;
          return (
            <li key={step.tag} className={`sc-item ${on ? "on" : ""}`} onMouseEnter={() => { setActive(i); setPaused(true); }}>
              <button className="sc-tab" aria-expanded={on} aria-controls={`sc-panel-${i}`} onClick={() => { setActive(i); setPaused(true); }}>
                <span className="sc-line">
                  <span className="sc-n" aria-hidden="true">0{i + 1}</span>
                  <span className="sc-titles"><span className="sc-title">{step.title}</span><span className="sc-tag">{step.tag}</span></span>
                </span>
                <span className="sc-bar" aria-hidden="true">
                  {on && <span key={`${active}-${paused}`} style={paused || reduced ? { width: "100%" } : { animation: `showcase-progress ${DURATION}ms linear forwards` }} />}
                </span>
              </button>
              {on && (
                <div className="sc-panel" id={`sc-panel-${i}`}>
                  <div>
                    <p>{s.text}</p>
                    <ul className="lp-list">{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
                  </div>
                  <div className="sc-preview" aria-hidden="true">{s.preview()}</div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------- Illustrative voices (fictional) ---------- */
const PEOPLE = [
  { id: "anh", name: "Mrs Anh", age: 45, tag: "Helps her mum", tone: { background: "#FCD34D", color: "#172E27" }, quote: "I'm in Mum's care circle now. I can see her appointments and tick off the tasks I take on, without chasing her for updates." },
  { id: "robert", name: "Mr Robert", age: 67, tag: "Follow-ups sorted", tone: { background: "#0D5C4D", color: "#fff" }, quote: "My GP's plan came straight back as a checklist. The blood test I always forget was right at the top, with a date." },
  { id: "chloe", name: "Miss Chloe", age: 19, tag: "First appointment alone", tone: { background: "#C85A32", color: "#fff" }, quote: "I wrote what I wanted to say the night before. In the room I just went down my list instead of freezing up." },
  { id: "mei", name: "Ms Mei", age: 52, tag: "Ready to talk", tone: { background: "#DBEAFE", color: "#1E40AF" }, quote: "My doctor had already read my brief when I sat down. We spent the time on my questions, not on the backstory." },
  { id: "tom", name: "Mr Tom", age: 34, tag: "Found a weekend GP", tone: { background: "#DCFCE7", color: "#166534" }, quote: "I needed a bulk-billing GP open on Saturdays who speaks Mandarin for my dad. Fit Finder showed me why each one matched." },
];

function Voices() {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section className="lp-section" aria-labelledby="voices-h">
      <div className="lp-wrap">
        <div className="lp-section-head">
          <div>
            <h2 id="voices-h">People like you, every step of the way. <span className="tag-illus">Illustrative</span></h2>
            <p>Fictional stories showing how the demo is meant to help. Not real users or testimonials.</p>
          </div>
          <div className="voices-nav">
            <button className="round-btn" aria-label="Previous stories" onClick={() => scroll(-1)}><I d="left" size={18} /></button>
            <button className="round-btn" aria-label="Next stories" onClick={() => scroll(1)}><I d="right" size={18} /></button>
          </div>
        </div>
        <div className="voices" ref={ref} tabIndex={0} aria-label="Illustrative stories">
          {PEOPLE.map((p) => (
            <figure key={p.id} className="voice">
              <span className="voice-q" aria-hidden="true">“</span>
              <blockquote>{p.quote}</blockquote>
              <figcaption>
                <span className="voice-av" style={p.tone} aria-hidden="true">{p.name.split(" ")[1][0]}</span>
                <span><b>{p.name}, {p.age}</b><small>{p.tag} · fictional</small></span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const { user, loading } = useApp();
  const [imgOk, setImgOk] = useState(true);
  if (!loading && user) return <Navigate to="/app" replace />;

  return (
    <div className="lp">
      <DemoStrip />
      <header className="app-header">
        <div className="lp-wrap header-row">
          <Link to="/" className="brand" aria-label="CarePath AI home"><Logo size={32} /><span className="wordmark">CarePath</span><span className="wordmark-ai">AI</span></Link>
          <nav className="lp-links" aria-label="Page sections">
            <a href="#problem">The problem</a>
            <a href="#how">How it works</a>
            <a href="#principles">Our principles</a>
            <a href="#safety">Safety</a>
          </nav>
          <div className="header-actions">
            <Link className="lp-btn lp-btn-text lp-btn-sm" to="/login">Log in</Link>
            <Link className="lp-btn lp-btn-primary lp-btn-sm" to="/register">Sign up</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-wrap">
            <div className="lp-hero-top fade-in">
              <div>
                <h1>Your health journey, connected.</h1>
                <p className="lp-lead">You booked the appointment. CarePath helps with everything around it: find a service that fits, prepare what you want to say, share it with your clinician, and make sure the follow-ups actually happen.</p>
              </div>
              <div>
                <div className="lp-ctas">
                  <Link className="lp-btn lp-btn-primary" to="/try">Try the live demo <I d="arrow" size={18} /></Link>
                  <Link className="lp-btn lp-btn-secondary" to="/register">Create a free account</Link>
                </div>
                <ul className="lp-trust">
                  <li><I d="check" size={16} /> Never diagnoses</li>
                  <li><I d="check" size={16} /> You review everything</li>
                  <li><I d="check" size={16} /> Delete your data anytime</li>
                </ul>
              </div>
            </div>

            <div className="lp-banner">
              {imgOk && <img src={HERO_IMG} alt="A GP talking with a patient in a calm clinic room" onError={() => setImgOk(false)} />}
              <h2>How can we help you today?</h2>
              <div className="lp-paths">
                <div className="glass">
                  <p className="glass-kicker">I have an appointment</p>
                  <h3>Prepare for an appointment</h3>
                  <p>Import your booking, turn your notes into a one-page brief, and share it with your clinician before you go.</p>
                  <div className="lp-ctas">
                    <Link className="lp-btn lp-btn-gold" to="/try">Try the live demo <I d="arrow" size={18} /></Link>
                    <Link className="lp-btn lp-btn-glass" to="/register">Start with my own</Link>
                  </div>
                </div>
                <div className="glass">
                  <p className="glass-kicker">Help me find care</p>
                  <h3>Not sure where to start? Find care that fits</h3>
                  <ul className="glass-chips" aria-label="Things you can filter by">
                    <li>Bulk billing</li><li>Open weekends</li><li>Telehealth</li><li>Speaks Mandarin</li><li>Wheelchair access</li>
                  </ul>
                  <div className="lp-ctas">
                    <Link className="lp-btn lp-btn-gold" to="/try?next=fit-finder">Explore Fit Finder <I d="arrow" size={18} /></Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="problem" className="lp-section" aria-labelledby="problem-h">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <div>
                <p className="lp-label">The evidence</p>
                <h2 id="problem-h">Booking is solved. What happens around the appointment isn't.</h2>
                <p>Apps like HotDoc made it easy to get an appointment. The research shows where patients still struggle: before, during and after it.</p>
              </div>
            </div>
            <div className="lp-stats">
              {STATS.map((s) => (
                <a key={s.stat} className="lp-stat" href={s.url} target="_blank" rel="noreferrer">
                  <strong>{s.stat}</strong>
                  <span>{s.label}</span>
                  <small>{s.source} ↗</small>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="lp-section" aria-labelledby="how-h">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <div>
                <p className="lp-label">How it works</p>
                <h2 id="how-h">One loop around every appointment.</h2>
              </div>
              <p>AI organises your own words. You and your clinician decide.</p>
            </div>
            <JourneyShowcase />
          </div>
        </section>

        <section id="principles" className="lp-section" aria-labelledby="rules-h">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <div>
                <p className="lp-label">Our principles</p>
                <h2 id="rules-h">Built around a few firm rules.</h2>
              </div>
              <p>CarePath is an organiser for your healthcare. These rules apply to everything it does.</p>
            </div>
            <dl className="lp-rules">
              <div><dt><span><I d="shield" size={18} /></span>Organise, don't diagnose</dt><dd>CarePath never diagnoses or suggests treatment. It only structures what you and your clinician have already said.</dd></div>
              <div><dt><span><I d="hand" size={18} /></span>You stay in control</dt><dd>Everything generated can be reviewed and edited, and nothing is final until you confirm it.</dd></div>
              <div><dt><span><I d="lock" size={18} /></span>Private by design</dt><dd>Your records belong to your account only. Notes go to the AI only when you ask it to organise them, and you can delete everything at any time.</dd></div>
            </dl>
          </div>
        </section>

        <Voices />

        <section className="lp-wrap" aria-labelledby="cta-h">
          <div className="lp-cta">
            <div className="lp-cta-band">
              <div>
                <h2 id="cta-h">Walk into your next appointment prepared.</h2>
                <p>Explore a ready-made demo, or create a free account and add your first appointment in under a minute.</p>
              </div>
              <div className="lp-ctas">
                <Link className="lp-btn lp-btn-gold" to="/try">Try the live demo <I d="arrow" size={18} /></Link>
                <Link className="lp-btn lp-btn-glass" to="/register">Get started</Link>
              </div>
            </div>
          </div>
        </section>

        <section id="safety" className="lp-wrap" aria-labelledby="safety-h">
          <div className="lp-safety" role="note">
            <div>
              <h2 id="safety-h">CarePath is an organisational tool, not a medical service</h2>
              <p>It does not diagnose, recommend treatment or replace a healthcare professional. For help with symptoms, use the{" "}
                <a href="https://www.healthdirect.gov.au/symptom-checker" target="_blank" rel="noreferrer">Healthdirect Symptom Checker</a>{" "}
                or call Healthdirect on 1800 022 222. This demo should only be used with fictional information.</p>
            </div>
            <a className="lp-emergency" href="tel:000"><span>In an emergency</span> <strong>Call 000</strong></a>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-row">
          <span className="brand"><Logo size={22} /><span className="wordmark" style={{ fontSize: "1.05rem" }}>CarePath</span></span>
          <span>Better prepared. Better organised. Better care.</span>
          <span>Built for the SymAI Open 2026 Hackathon · Demo only</span>
        </div>
      </footer>
    </div>
  );
}
