import { Link, Navigate } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { Disclaimer, Logo } from "../components/ui";

export default function Landing() {
  const { user, loading } = useApp();
  if (!loading && user) return <Navigate to="/app" replace />;
  return (
    <>
      <header className="pub-nav">
        <span className="brand" style={{ padding: 0 }}><Logo /> CarePath AI</span>
        <div className="row">
          <Link className="btn ghost" to="/login">Log in</Link>
          <Link className="btn primary" to="/register">Create account</Link>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="fade-in">
            <p className="eyebrow">Better prepared. Better organised. Better care.</p>
            <h1>Your healthcare journey doesn't start and end with an appointment.</h1>
            <p className="lead">CarePath AI helps you get ready for a consultation and keep track of what comes afterwards — in plain language, in your own words.</p>
            <div className="row" style={{ marginTop: "1.5rem" }}>
              <Link className="btn primary" to="/register?next=preparation">Prepare for an Appointment</Link>
              <Link className="btn" to="/register?next=follow-up">Manage Follow-Up Tasks</Link>
            </div>
          </div>
          <div className="hero-art fade-in" aria-hidden="true">
            <div className="mini"><h4>Appointment brief</h4>Your concern, timeline and questions — organised, editable, and linked back to what you wrote.</div>
            <div className="mini"><h4>Before</h4>Keep everything you want to ask in one place so nothing is forgotten in the room.</div>
            <div className="mini"><h4>After</h4>Turn the instructions you were given into a checklist you review and confirm.</div>
          </div>
        </section>
        <section className="feat">
          <div className="card"><h3>Organise, don't diagnose</h3><p className="muted">CarePath never diagnoses or suggests treatment. It only structures what you and your clinician have already said.</p></div>
          <div className="card"><h3>You stay in control</h3><p className="muted">Everything generated is reviewable and editable, and nothing is saved as final until you confirm it.</p></div>
          <div className="card"><h3>Built for students</h3><p className="muted">Clear, jargon-free steps for people finding their way through the Australian healthcare system.</p></div>
        </section>
        <div className="pub-foot"><Disclaimer /></div>
      </main>
    </>
  );
}
