import { Link, Navigate } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { Logo } from "../components/ui";

const icons = {
  clipboard: "M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1zM8 6H6a1 1 0 00-1 1v13a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2M9 12h6M9 16h4",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  checklist: "M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9",
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
          <Link to="/" className="lp-brand" aria-label="CarePath AI home"><Logo size={28} /><span>CarePath <b>AI</b></span></Link>
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
              <h1>Your healthcare journey doesn't start and end with an appointment.</h1>
              <p className="lp-lead">
                CarePath helps you get ready for a consultation, find a service that suits your practical needs, and keep track of what you were asked to do afterwards. Everything is organised in plain language, from your own words.
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

            <figure className="lp-preview" aria-label="Example of an appointment brief, using fictional details">
              <div className="lp-preview-card">
                <div className="lp-preview-head">
                  <div>
                    <span className="lp-preview-label">Appointment brief</span>
                    <strong>GP consultation</strong>
                  </div>
                  <span className="lp-tag-ok">Confirmed</span>
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
                <div className="lp-preview-sec lp-preview-tasks">
                  <span className="lp-preview-label">After your visit</span>
                  <div className="lp-task done"><span className="lp-box"><I d="check" size={13} /></span>Book a follow-up in 2 weeks</div>
                  <div className="lp-task"><span className="lp-box" />Blood test at pathology clinic</div>
                </div>
              </div>
              <figcaption className="lp-caption">Example with fictional details</figcaption>
            </figure>
          </div>
        </section>

        <section id="how" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2>Support on both sides of your appointment</h2>
              <p>Booking is one step. CarePath helps with the parts that usually end up on scraps of paper.</p>
            </div>
            <div className="lp-steps">
              <article className="lp-step">
                <h3><I d="clipboard" /> Before you go</h3>
                <p>Write down your concern, when it started and what you want to ask. CarePath turns it into a short brief you can edit, confirm and print.</p>
                <ul className="lp-list">
                  <li>Every point links back to what you wrote</li>
                  <li>Edit, delete or regenerate any section</li>
                  <li>Printable one-page view</li>
                </ul>
              </article>
              <article className="lp-step">
                <h3><I d="search" /> Finding a service</h3>
                <p>Describe what matters to you, such as location, opening days, telehealth, accessibility or language, and compare services side by side.</p>
                <ul className="lp-list">
                  <li>Clear reasons for every result</li>
                  <li>Missing details shown as “Not verified”</li>
                  <li>No claims about clinical quality</li>
                </ul>
              </article>
              <article className="lp-step">
                <h3><I d="checklist" /> After the visit</h3>
                <p>Paste the instructions you were given. CarePath lists the actions they contain so you can track each one through to done.</p>
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
          <div className="lp-wrap lp-principles">
            <div>
              <h2>Built around a few firm rules</h2>
              <p className="lp-muted">CarePath is an organiser for your healthcare. These rules apply to everything it does.</p>
            </div>
            <dl className="lp-rules">
              <div><dt>Organise, don't diagnose</dt><dd>CarePath never diagnoses or suggests treatment. It only structures what you and your clinician have already said.</dd></div>
              <div><dt>You stay in control</dt><dd>Everything generated can be reviewed and edited, and nothing is final until you confirm it.</dd></div>
              <div><dt>Private by design</dt><dd>Your records belong to your account only. Notes are sent to the AI only when you ask it to organise them, and you can delete everything at any time.</dd></div>
            </dl>
          </div>
        </section>

        <section className="lp-section lp-cta-section">
          <div className="lp-wrap lp-cta-band">
            <div>
              <h2>Walk into your next appointment prepared.</h2>
              <p>Create a free account and add your first appointment in under a minute.</p>
            </div>
            <Link className="lp-btn lp-btn-primary" to="/register">Get started <I d="arrow" size={18} /></Link>
          </div>
        </section>

        <section id="safety" className="lp-wrap lp-safety-wrap">
          <div className="lp-safety" role="note">
            <div>
              <h2>CarePath is an organisational tool, not a medical service</h2>
              <p>It does not diagnose, recommend treatment or replace a healthcare professional. For help with symptoms, use the{" "}
                <a href="https://www.healthdirect.gov.au/symptom-checker" target="_blank" rel="noreferrer">Healthdirect Symptom Checker</a>{" "}
                or call Healthdirect on 1800 022 222. This demo should only be used with fictional information.</p>
            </div>
            <p className="lp-emergency"><span>In an emergency</span> <strong>Call 000</strong></p>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-row">
          <span className="lp-brand lp-brand-sm"><Logo size={20} /><span>CarePath <b>AI</b></span></span>
          <span>Better prepared. Better organised. Better care.</span>
          <span>Built for the SymAI Open 2026 Hackathon · Demo only</span>
        </div>
      </footer>
    </div>
  );
}
