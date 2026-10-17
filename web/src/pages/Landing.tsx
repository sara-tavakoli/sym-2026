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
};
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
                CarePath helps you get ready for a consultation and keep track of what comes after — organised in plain language, from your own words.
              </p>
              <div className="lp-ctas">
                <Link className="lp-btn lp-btn-primary" to="/register?next=preparation">Prepare for an Appointment <I d="arrow" size={18} /></Link>
                <Link className="lp-btn lp-btn-secondary" to="/register?next=follow-up">Manage Follow-Up Tasks</Link>
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

        <section id="how" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2>Support on both sides of your appointment</h2>
              <p>Booking is only one step. CarePath helps with the parts that usually live on scraps of paper.</p>
            </div>
            <div className="lp-steps">
              <article className="lp-card">
                <span className="lp-icon lp-icon-teal"><I d="clipboard" size={22} /></span>
                <span className="lp-kicker">Before</span>
                <h3>AI appointment preparation</h3>
                <p>Write down your concern, when it started and what you want to ask. CarePath turns it into a short brief you can edit, confirm and print.</p>
                <ul className="lp-list">
                  <li>Every point links back to what you wrote</li>
                  <li>Edit, delete or regenerate any section</li>
                  <li>Printable one-page view</li>
                </ul>
              </article>
              <article className="lp-card">
                <span className="lp-icon lp-icon-blue"><I d="checklist" size={22} /></span>
                <span className="lp-kicker">After</span>
                <h3>After-visit action tracker</h3>
                <p>Paste the instructions you were given. CarePath lists the actions they contain so you can track them through to done.</p>
                <ul className="lp-list">
                  <li>Only actions that are actually written down</li>
                  <li>Unclear items flagged to check with your clinician</li>
                  <li>Medication wording kept exactly as given</li>
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
