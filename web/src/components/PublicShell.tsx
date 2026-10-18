import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { Logo } from "./ui";
import "../findcare.css";

/** Frame for pages people can use before signing in: getting care, searching clinics and starting a booking. */
export function PublicShell({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const { pathname, search } = useLocation();
  const next = encodeURIComponent(pathname + search);
  return (
    <div className="fc-public">
      <header className="fc-public-head">
        <Link to="/" className="fc-brand" aria-label="CarePath AI home"><Logo size={26} /><span>CarePath <b>AI</b></span></Link>
        <nav className="row" aria-label="Account">
          {user ? <Link className="btn sm" to="/app">Dashboard</Link>
            : <><Link className="btn sm ghost" to={`/login?next=${next}`}>Sign in</Link><Link className="btn sm primary" to="/try">Try the demo</Link></>}
        </nav>
      </header>
      <main id="main" className="fc-public-main">{children}</main>
      <footer className="fc-public-foot" role="note">
        CarePath organises information. It isn't a medical service and doesn't diagnose or recommend treatment. In an emergency call <strong>000</strong>.
        Every clinic in the demo directory is fictional.
      </footer>
    </div>
  );
}

/** Where a care path continues: inside the app when signed in, on the public pages otherwise. */
export const carePath = (signedIn: boolean, page: "get-care" | "find-care" | "search" | "book", id?: string) => {
  const inApp = { "get-care": "/app/get-care", "find-care": "/app/find-care", search: "/app/fit-finder", book: `/app/book/${id}` };
  const pub = { "get-care": "/get-care", "find-care": "/find-care", search: "/search", book: `/book/${id}` };
  return (signedIn ? inApp : pub)[page];
};

/** The person's own words from "Help me find care", kept for this tab only so the booking can carry them. */
const CONCERN_KEY = "carepath.concern";
export function rememberConcern(text: string) {
  try { if (text.trim()) sessionStorage.setItem(CONCERN_KEY, text.trim().slice(0, 500)); else sessionStorage.removeItem(CONCERN_KEY); } catch { /* storage unavailable */ }
}
export function recallConcern(): string {
  try { return sessionStorage.getItem(CONCERN_KEY) ?? ""; } catch { return ""; }
}
