import { Link } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { PublicShell, carePath } from "../components/PublicShell";
import "../booking.css";

// The start of the care path: "Do you know what care you need?" No → Help me find care. Yes → search clinics directly.
// Both end at the same place: choose a clinic and a time, then book.
export default function GetCare({ publicPage = false }: { publicPage?: boolean }) {
  const { user } = useApp();
  const signedIn = !!user;
  const body = (
    <div className="gc fade-in">
      <header className="gc-head">
        <p className="eyebrow">Book care</p>
        <h1>Do you know what kind of care you need?</h1>
        <p className="muted">Either way, you'll end up choosing a clinic and a time that suits you. You only need an account when you confirm the booking.</p>
      </header>

      <div className="gc-paths">
        <Link className="gc-path" to={carePath(signedIn, "find-care")}>
          <span className="gc-kicker">No, I'm not sure</span>
          <span className="gc-title">Help me find care</span>
          <span className="gc-text">Describe what's going on in simple words. We'll ask a couple of follow-up questions, summarise your concern and suggest where people usually start, such as a GP.</span>
          <span className="gc-go" aria-hidden="true">Start →</span>
        </Link>
        <Link className="gc-path" to={carePath(signedIn, "search")}>
          <span className="gc-kicker">Yes, I know what I need</span>
          <span className="gc-title">Search clinics directly</span>
          <span className="gc-text">Choose a service type and filter by location, opening days, telehealth, bulk billing, accessibility and language.</span>
          <span className="gc-go" aria-hidden="true">Search →</span>
        </Link>
      </div>

      <ol className="gc-steps" aria-label="How booking works">
        <li><b>1</b> Find a clinic</li>
        <li><b>2</b> Choose a time</li>
        <li><b>3</b> Sign in and check your details</li>
        <li><b>4</b> Confirm. It appears on your dashboard</li>
      </ol>

      <p className="gc-fine">
        CarePath doesn't diagnose or judge urgency. In an emergency call <strong>000</strong>. For health advice call Healthdirect on <a href="tel:1800022222">1800 022 222</a>.
        Every clinic in this demo is fictional and no real booking is made.
      </p>
    </div>
  );
  return publicPage ? <PublicShell>{body}</PublicShell> : body;
}
