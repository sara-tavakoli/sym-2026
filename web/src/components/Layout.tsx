import { NavLink, Outlet, Link } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { DemoStrip, Icon, Logo } from "./ui";
import { DemoGuide } from "./DemoGuide";
import { NotificationBell } from "./NotificationBell";

type NavItem = { to: string; label: string; short: string; icon: Parameters<typeof Icon>[0]["name"]; end?: boolean };

// Care records first, then the tools that help people prepare and find services.
const nav: NavItem[] = [
  { to: "/app", label: "Dashboard", short: "Home", icon: "home", end: true },
  { to: "/app/appointments", label: "Appointments", short: "Visits", icon: "calendar" },
  { to: "/app/follow-up", label: "Follow-up tracker", short: "Tasks", icon: "check" },
  { to: "/app/circle", label: "Care circle", short: "Circle", icon: "people" },
  { to: "/app/assistant", label: "AI Assistant", short: "Assistant", icon: "chat" },
  { to: "/app/find-care", label: "Find care", short: "Find care", icon: "check" },
  { to: "/app/fit-finder", label: "Fit Finder", short: "Fit Finder", icon: "search" },
];
const MOBILE = ["/app", "/app/appointments", "/app/assistant", "/app/fit-finder", "/app/follow-up"];

export function Layout() {
  const { user, logout } = useApp();
  const initials = (user?.name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <DemoStrip />
      <header className="app-header">
        <div className="wrap header-row">
          <Link to="/app" className="brand" aria-label="CarePath AI, dashboard"><Logo size={32} /><span className="wordmark">CarePath</span><span className="wordmark-ai">AI</span></Link>
          <nav className="topnav" aria-label="Main">
            {nav.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} aria-label={l.label}>
                <Icon name={l.icon} /><span className="nav-full">{l.label}</span><span className="nav-short" aria-hidden="true">{l.short}</span>
              </NavLink>
            ))}
          </nav>
          {/* Header actions: other features (e.g. a notification bell) mount at the start of this group. */}
          <div className="header-actions">
            <NotificationBell />
            <NavLink to="/app/preparation" className="icon-link hide-xs" aria-label="AI Preparation" title="AI Preparation"><Icon name="sparkle" /></NavLink>
            <NavLink to="/app/circle" className="icon-link mobile-only" aria-label="Care circle" title="Care circle"><Icon name="people" /></NavLink>
            <NavLink to="/app/settings" className="icon-link" aria-label="Settings" title="Settings"><Icon name="gear" /></NavLink>
            <span className="user-chip" title={user?.email}>
              <span className="avatar" aria-hidden="true">{initials}</span>
              <span className="user-name">{user?.name?.split(" ")[0]}</span>
            </span>
            <button className="icon-link" onClick={logout} aria-label="Log out" title="Log out"><Icon name="logout" /></button>
          </div>
        </div>
      </header>
      <main id="main" className="main wrap">
        <Outlet />
      </main>
      <footer className="app-foot" role="note" aria-label="Safety information">
        <p>
          <strong>CarePath organises information. It isn't a medical service</strong> and doesn't diagnose or recommend treatment.
          In an emergency call <strong>000</strong>. For health advice call Healthdirect on <a href="tel:1800022222">1800 022 222</a> or use the{" "}
          <a href="https://www.healthdirect.gov.au/symptom-checker" target="_blank" rel="noreferrer">Symptom Checker</a>. Demo only: use fictional details.
        </p>
      </footer>
      <nav className="bottomnav" aria-label="Main mobile">
        {MOBILE.map((to) => nav.find((l) => l.to === to)!).map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}><Icon name={l.icon} />{l.short}</NavLink>
        ))}
      </nav>
      <DemoGuide />
    </div>
  );
}
