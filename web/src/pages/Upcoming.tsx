import { Link } from "react-router-dom";

// Honest placeholder: these features are scheduled for later phases and have no controls.
export default function Upcoming({ title, phase, description }: { title: string; phase: string; description: string }) {
  return (
    <div className="fade-in">
      <div className="page-head"><div><h1>{title}</h1></div></div>
      <div className="card empty">
        <span className="badge info">Coming in {phase}</span>
        <h3 style={{ marginTop: ".75rem" }}>Not built yet</h3>
        <p>{description}</p>
        <Link className="btn" to="/app/appointments">Go to appointments</Link>
      </div>
    </div>
  );
}
