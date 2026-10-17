import { Link, Navigate } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { Logo } from "../components/ui";

const icons = {
  clipboard: "M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1zM8 6H6a1 1 0 00-1 1v13a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2M9 12h6M9 16h4",
  checklist: "M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9",
  shield: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z M9 12l2 2 4-4",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 018 0v3",
  info: "M12 8h.01M11 12h1v5h1M12 21a9 9 0 100-18 9 9 0 000 18z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7",
  share: "M8 12h8M14 8l4 4-4 4M4 5v14",
  people: "M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3 3 0 010 5.5M18 14c2 .7 3 2.6 3 6",
};

// Verified against the sources; caveats and exact wording are in docs/EVIDENCE.md.
const STATS = [
  { stat: "40–80%", label: "of medical information is forgotten by patients immediately", source: "Kessels, J R Soc Med 2003", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC539473/" },
  { stat: "4 in 35", label: "GP patients voiced everything they came to discuss", source: "Barry et al., BMJ 2000", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC27368/" },
  { stat: "11 sec", label: "median time before a patient's opening concern was interrupted", source: "Singh Ospina et al., JGIM 2019", url: "https://pubmed.ncbi.nlm.nih.gov/29968051/" },
  { stat: "up to 62%", label: "of lab tests were not followed up, in some ambulatory care studies", source: "Callen et al., JGIM 2012", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3445672/" },
  { stat: "3.0 million", label: "unpaid carers in Australia, many helping with appointments", source: "ABS SDAC 2022", url: "https://www.abs.gov.au/statistics/health/disability/disability-ageing-and-carers-australia-summary-findings/2022/key-findings-plain-language" },
  { stat: "59%", label: "of Australians aged 15–74 had below-adequate health literacy (2006)", source: "ABS 4233.0, 2006", url: "https://www.abs.gov.au/ausstats/abs@.nsf/latestproducts/4233.0main%20features22006" },
];
function I({ d, size = 20 }: { d: keyof typeof icons; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icons[d]} />
    </svg>
  );
}

export default function Landing() {
  const { user, loading } = useApp();
  if (!loading && user) return <Navigate to="/app" replace />;

  return (
    <div className="lp">
      <header className="lp-header">
        <div className="lp-wrap lp-nav">
          <Link to="/" className="lp-brand" aria-label="CarePath AI home"><Logo size={30} /><span>CarePath <b>AI</b></span></Link>
          <nav className="lp-links" aria-label="Page sections">
            <a href="#problem">The problem</a>
            <a href="#how">How it works</a>
            <a href="#principles">Our principles</a>
            <a href="#safety">Safety</a>
          </nav>
          <div className="lp-auth">
            <Link className="lp-btn lp-btn-text" to="/login">Log in</Link>
            <Link className="lp-btn lp-btn-primary lp-btn-sm" to="/register">Create account</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <p className="lp-pill">Better prepared. Better organised. Better care.</p>
              <h1>Your healthcare journey doesn't start and end with an appointment.</h1>
              <p className="lp-lead">
                You booked on HotDoc. CarePath gets you ready for the consult, shares your brief with your clinician, and makes sure the follow-ups actually happen, with your family or carer helping if you want.
              </p>
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

            <div className="lp-preview" aria-label="Example of an appointment brief, using fictional details">
              <div className="lp-preview-card">
                <div className="lp-preview-head">
                  <div>
                    <span className="lp-kicker">Appointment brief</span>
                    <strong>GP consultation</strong>
                  </div>
                  <span className="lp-tag lp-tag-ok">Confirmed</span>
                </div>
                <div className="lp-preview-sec">
                  <span className="lp-preview-label">Main reason</span>
                  <p>Headaches most afternoons</p>
                  <span className="lp-source">From your notes: “I keep getting headaches in the afternoon”</span>
                </div>
                <div className="lp-preview-sec">
                  <span className="lp-preview-label">Questions to ask</span>
                  <ol>
                    <li>Could my screen time matter?</li>
                    <li>Should I get my eyes checked?</li>
                  </ol>
                </div>
              </div>
              <div className="lp-preview-card lp-preview-tasks">
                <span className="lp-kicker">After your visit</span>
                <div className="lp-task done"><span className="lp-box"><I d="check" size={13} /></span>Book a follow-up in 2 weeks</div>
                <div className="lp-task"><span className="lp-box" />Blood test at pathology clinic</div>
              </div>
              <p className="lp-caption">Example with fictional details</p>
            </div>
          </div>
        </section>

        <section id="problem" className="lp-section lp-section-alt">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2>Booking is solved. What happens around the appointment isn't.</h2>
              <p>Apps like HotDoc made it easy to get an appointment. The research shows where patients still struggle: before, during and after it.</p>
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

        <section id="how" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2>One loop around every appointment</h2>
              <p>Booked on HotDoc? Paste the confirmation. CarePath connects you, your clinician and the people who help you.</p>
            </div>
            <div className="lp-steps lp-steps-4">
              <article className="lp-card">
                <span className="lp-icon lp-icon-teal"><I d="clipboard" size={22} /></span>
                <span className="lp-kicker">1 · Before</span>
                <h3>Prepare</h3>
                <p>Import your booking, then write down your concern and questions. AI turns them into a one-page brief.</p>
                <ul className="lp-list">
                  <li>Every point links to what you wrote</li>
                  <li>Your questions, in priority order</li>
                </ul>
              </article>
              <article className="lp-card">
                <span className="lp-icon lp-icon-blue"><I d="share" size={22} /></span>
                <span className="lp-kicker">2 · During</span>
                <h3>Share with your clinician</h3>
                <p>A secure, expiring link. Your GP sees your brief, ticks off your questions, and sends back the plan.</p>
                <ul className="lp-list">
                  <li>No clinician account needed</li>
                  <li>Revoke the link anytime</li>
                </ul>
              </article>
              <article className="lp-card">
                <span className="lp-icon lp-icon-teal"><I d="checklist" size={22} /></span>
                <span className="lp-kicker">3 · After</span>
                <h3>Follow through</h3>
                <p>The plan becomes a checklist with due dates. Overdue or unclear items are flagged before they're forgotten.</p>
                <ul className="lp-list">
                  <li>Medication wording kept exactly</li>
                  <li>Draft a message to the clinic</li>
                </ul>
              </article>
              <article className="lp-card">
                <span className="lp-icon lp-icon-blue"><I d="people" size={22} /></span>
                <span className="lp-kicker">4 · Together</span>
                <h3>Your care circle</h3>
                <p>Invite a parent, partner or carer to see what's coming up and take ownership of tasks.</p>
                <ul className="lp-list">
                  <li>Viewer or helper roles</li>
                  <li>See who did what</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section id="principles" className="lp-section lp-section-alt">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2>Designed to be trusted</h2>
              <p>An organiser for your healthcare, built around a few firm rules.</p>
            </div>
            <div className="lp-features">
              <article className="lp-feature">
                <span className="lp-icon lp-icon-teal"><I d="shield" /></span>
                <h3>Organise, don't diagnose</h3>
                <p>CarePath never diagnoses or suggests treatment. It only structures what you and your clinician have already said.</p>
              </article>
              <article className="lp-feature">
                <span className="lp-icon lp-icon-blue"><I d="edit" /></span>
                <h3>You stay in control</h3>
                <p>Everything generated can be reviewed and edited, and nothing is final until you confirm it.</p>
              </article>
              <article className="lp-feature">
                <span className="lp-icon lp-icon-slate"><I d="lock" /></span>
                <h3>Private by design</h3>
                <p>Your records belong to your account only. Notes are sent to the AI only when you ask it to organise them, and you can delete everything at any time.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-wrap">
            <div className="lp-cta-band">
              <div>
                <h2>Walk into your next appointment prepared.</h2>
                <p>Create a free account and add your first appointment in under a minute.</p>
              </div>
              <Link className="lp-btn lp-btn-light" to="/register">Get started <I d="arrow" size={18} /></Link>
            </div>
          </div>
        </section>

        <section id="safety" className="lp-wrap lp-safety-wrap">
          <div className="lp-safety" role="note">
            <span className="lp-icon lp-icon-blue"><I d="info" /></span>
            <div>
              <h2>CarePath is an organisational tool, not a medical service</h2>
              <p>It does not diagnose, recommend treatment or replace a healthcare professional. For help with symptoms, use the{" "}
                <a href="https://www.healthdirect.gov.au/symptom-checker" target="_blank" rel="noreferrer">Healthdirect Symptom Checker</a>.
                This demo should only be used with fictional information.</p>
            </div>
            <div className="lp-emergency"><span>Emergency</span><strong>Call 000</strong></div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-row">
          <span className="lp-brand lp-brand-sm"><Logo size={22} /><span>CarePath <b>AI</b></span></span>
          <span>Built for the SymAI Open 2026 Hackathon · Demo only</span>
        </div>
      </footer>
    </div>
  );
}
