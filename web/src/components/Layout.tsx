import { NavLink, Outlet, Link } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { Icon, Logo } from "./ui";
import { DemoGuide } from "./DemoGuide";
import { NotificationBell } from "./NotificationBell";

type NavItem = { to: string; label: string; short: string; icon: Parameters<typeof Icon>[0]["name"]; end?: boolean };

// Grouped by what people are doing: their care records, then the tools that help them prepare and find services.
const groups: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [{ to: "/app", label: "Dashboard", short: "Home", icon: "home", end: true }] },
  { label: "Your care", items: [
    { to: "/app/appointments", label: "Appointments", short: "Visits", icon: "calendar" },
    { to: "/app/follow-up", label: "Follow-up tracker", short: "Tasks", icon: "check" },
    { to: "/app/circle", label: "Care circle", short: "Circle", icon: "people" },
  ] },
  { label: "Prepare and find", items: [
    { to: "/app/assistant", label: "AI Assistant", short: "Assistant", icon: "chat" },
    { to: "/app/preparation", label: "AI Preparation", short: "Prepare", icon: "sparkle" },
    { to: "/app/find-care", label: "Find care", short: "Find care", icon: "check" },
    { to: "/app/fit-finder", label: "Fit Finder", short: "Find", icon: "search" },
  ] },
];
const settings: NavItem = { to: "/app/settings", label: "Settings", short: "Settings", icon: "gear" };
const all = groups.flatMap((g) => g.items);
const MOBILE = ["/app", "/app/appointments", "/app/assistant", "/app/fit-finder", "/app/follow-up"];

export function Layout() {
  const { user, logout } = useApp();
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <div className="shell">
        <aside className="sidebar">
          <Link to="/app" className="brand" aria-label="CarePath AI, dashboard"><Logo size={28} /><span className="wordmark">CarePath</span><span className="wordmark-ai">AI</span></Link>
          <nav className="nav" aria-label="Main">
            {groups.map((g, i) => (
              <div className="nav-group" key={i} role="group" aria-label={g.label ?? "Overview"}>
                {g.label && <span className="nav-label" aria-hidden="true">{g.label}</span>}
                {g.items.map((l) => (
                  <NavLink key={l.to} to={l.to} end={l.end}><Icon name={l.icon} /> {l.label}</NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <NavLink to={settings.to} className="side-link"><Icon name={settings.icon} /> {settings.label}</NavLink>
            <div className="side-user">
              <span className="avatar" aria-hidden="true">{(user?.name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
              <span className="side-name" title={user?.email}>{user?.name}</span>
              <button className="link-btn" onClick={logout}>Log out</button>
            </div>
          </div>
        </aside>
        <div>
          <header className="topbar">
            <Link to="/app" className="brand" aria-label="CarePath AI, dashboard"><Logo size={26} /><span className="wordmark">CarePath</span><span className="wordmark-ai">AI</span></Link>
            <div className="row" style={{ gap: ".25rem" }}>
              <NotificationBell />
              <NavLink to="/app/circle" className="btn sm ghost" aria-label="Care circle"><Icon name="people" /></NavLink>
              <NavLink to="/app/settings" className="btn sm ghost" aria-label="Settings"><Icon name="gear" /></NavLink>
              <button className="btn sm ghost" onClick={logout}>Log out</button>
            </div>
          </header>
          <main id="main" className="main">
            <Outlet />
          </main>
          <footer className="app-foot" role="note" aria-label="Safety information">
            <p>
              <strong>CarePath organises information. It isn't a medical service</strong> and doesn't diagnose or recommend treatment.
              In an emergency call <strong>000</strong>. For health advice call Healthdirect on <a href="tel:1800022222">1800 022 222</a> or use the{" "}
              <a href="https://www.healthdirect.gov.au/symptom-checker" target="_blank" rel="noreferrer">Symptom Checker</a>. Demo only: use fictional details.
            </p>
          </footer>
        </div>
      </div>
      <nav className="bottomnav" aria-label="Main mobile">
        {MOBILE.map((to) => all.find((l) => l.to === to)!).map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}><Icon name={l.icon} />{l.short}</NavLink>
        ))}
      </nav>
      <DemoGuide />
    </>
  );
}
