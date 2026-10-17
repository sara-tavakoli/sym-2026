import { NavLink, Outlet, Link } from "react-router-dom";
import { useApp } from "../lib/app-context";
import { Disclaimer, Icon, Logo } from "./ui";

const links = [
  { to: "/app", label: "Dashboard", short: "Home", icon: "home", end: true },
  { to: "/app/appointments", label: "Appointments", short: "Visits", icon: "calendar" },
  { to: "/app/preparation", label: "AI Preparation", short: "Prepare", icon: "sparkle" },
  { to: "/app/follow-up", label: "Follow-Up Tracker", short: "Tasks", icon: "check" },
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
            <button className="btn sm" onClick={logout}>Log out</button>
          </header>
          <main id="main" className="main">
            <Outlet />
            <div style={{ marginTop: "2rem" }}><Disclaimer /></div>
          </main>
        </div>
      </div>
      <nav className="bottomnav" aria-label="Main mobile">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={"end" in l && l.end}><Icon name={l.icon} />{l.short}</NavLink>
        ))}
      </nav>
    </>
  );
}
