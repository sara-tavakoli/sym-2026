import { NavLink, Outlet, Link } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { Disclaimer, Icon, Logo } from "./ui";

const links = [
  { to: "/app", label: "Dashboard", short: "Home", icon: "home", end: true },
  { to: "/app/appointments", label: "Appointments", short: "Visits", icon: "calendar" },
  { to: "/app/assistant", label: "AI Assistant", short: "Assistant", icon: "chat" },
  { to: "/app/preparation", label: "AI Preparation", short: "Prepare", icon: "sparkle" },
  { to: "/app/follow-up", label: "Follow-Up Tracker", short: "Tasks", icon: "check" },
  { to: "/app/circle", label: "Care circle", short: "Circle", icon: "people" },
  { to: "/app/settings", label: "Settings", short: "Settings", icon: "gear" },
] as const;

export function Layout() {
  const { user, logout } = useApp();
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <div className="shell">
        <aside className="sidebar">
          <Link to="/app" className="brand"><Logo /> CarePath AI</Link>
          <nav className="nav" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={"end" in l && l.end}>
                <Icon name={l.icon} /> {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="side-foot stack">
            <div className="small muted" style={{ padding: "0 .5rem" }}>Signed in as<br /><strong style={{ color: "var(--text)" }}>{user?.name}</strong></div>
            <button className="btn sm" onClick={logout} style={{ width: "100%" }}>Log out</button>
          </div>
        </aside>
        <div>
          <header className="topbar">
            <Link to="/app" className="brand"><Logo size={28} /> CarePath AI</Link>
            <div className="row" style={{ gap: ".4rem" }}>
              <NavLink to="/app/circle" className="btn sm ghost" aria-label="Care circle"><Icon name="people" /></NavLink>
              <NavLink to="/app/settings" className="btn sm ghost" aria-label="Settings"><Icon name="gear" /></NavLink>
              <button className="btn sm" onClick={logout}>Log out</button>
            </div>
          </header>
          <main id="main" className="main">
            <Outlet />
            <div style={{ marginTop: "2rem" }}><Disclaimer /></div>
          </main>
        </div>
      </div>
      <nav className="bottomnav" aria-label="Main mobile">
        {links.filter((l) => l.to !== "/app/settings" && l.to !== "/app/circle").map((l) => (
          <NavLink key={l.to} to={l.to} end={"end" in l && l.end}><Icon name={l.icon} />{l.short}</NavLink>
        ))}
      </nav>
    </>
  );
}
