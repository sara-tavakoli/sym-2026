import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, type Appointment, type Page } from "../lib/api";
import { useApp } from "../lib/app-context";
import "../findcare.css";

// Floating checklist of the judge's 3-minute journey (docs/DEMO.md). Only for one-click demo sandbox accounts.
// Steps tick off from real state where it's cheap to check, otherwise from pages visited or "Mark done" clicks.

const DEMO_DOMAIN = "@demo.carepath.example";
const SEEDED_APPOINTMENTS = 3; // server/src/demo.ts seeds three for the sandbox owner

interface State { total: number; briefApptId: string | null; shared: boolean; planSent: boolean; planImported: boolean }
interface Step { id: string; time: string; title: string; hint: string; go: (s: State | null) => string; auto: (s: State | null, visited: Set<string>) => boolean }

const STEPS: Step[] = [
  { id: "attention", time: "0:20", title: "See what needs attention", hint: "Dashboard → Needs attention: overdue blood test, tomorrow's dentist, unclear instructions.",
    go: () => "/app", auto: (_s, v) => v.has("dashboard") },
  { id: "import", time: "0:40", title: "Import a booking confirmation", hint: "Appointments → Import booking confirmation → Sample email → Fill in the form → Create.",
    go: () => "/app/appointments", auto: (s) => !!s && s.total > SEEDED_APPOINTMENTS },
  { id: "brief", time: "1:00", title: "Open the prepared brief", hint: "Open the GP appointment, show the confirmed brief and expand a source quote.",
    go: (s) => (s?.briefApptId ? `/app/appointments/${s.briefApptId}` : "/app/appointments"), auto: (_s, v) => v.has("appointment") },
  { id: "share", time: "1:25", title: "Share with your clinician", hint: "Share with your clinician → Create link → open it in a second tab.",
    go: (s) => (s?.briefApptId ? `/app/appointments/${s.briefApptId}` : "/app/appointments"), auto: (s) => !!s?.shared },
  { id: "plan", time: "1:40", title: "Clinician sends a plan back", hint: "In the second tab, as the GP: tick two questions, write the plan, Send.",
    go: (s) => (s?.briefApptId ? `/app/appointments/${s.briefApptId}` : "/app/appointments"), auto: (s) => !!s?.planSent },
  { id: "checklist", time: "2:00", title: "Turn the plan into a checklist", hint: "Back as Alex: refresh → New plan from clinician → Turn into checklist → Extract → Confirm.",
    go: (s) => (s?.briefApptId ? `/app/appointments/${s.briefApptId}` : "/app/follow-up"), auto: (s) => !!s?.planImported },
  { id: "circle", time: "2:25", title: "Show the care circle", hint: "Care circle → Mia took the blood test → People I support → Grandpa Joe.",
    go: () => "/app/circle", auto: (_s, v) => v.has("circle") },
  { id: "find", time: "2:40", title: "Book care", hint: "Book care → Help me find care: describe a concern, see the summary and pathway, pick a clinic and a time, confirm.",
    go: () => "/app/get-care", auto: (_s, v) => v.has("find") },
];

function visitKey(path: string): string | null {
  if (path === "/app") return "dashboard";
  if (/^\/app\/appointments\/[^/]+$/.test(path)) return "appointment";
  if (path.startsWith("/app/circle") || path.startsWith("/app/supporting")) return "circle";
  if (["/app/get-care", "/app/find-care", "/app/fit-finder", "/app/book/"].some((p) => path.startsWith(p))) return "find";
  return null;
}

const load = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) ?? "[]"); } catch { return []; } };
const save = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

export function DemoGuide() {
  const { user } = useApp();
  if (!user?.email.endsWith(DEMO_DOMAIN)) return null;
  return <Guide userId={user.id} />;
}

function Guide({ userId }: { userId: string }) {
  const { pathname } = useLocation();
  const visitsKey = `demo-guide:${userId}:visited`, marksKey = `demo-guide:${userId}:marked`;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [visited, setVisited] = useState(() => new Set(load(visitsKey)));
  const [marked, setMarked] = useState(() => new Set(load(marksKey)));
  const fabRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const k = visitKey(pathname);
    if (k && !visited.has(k)) setVisited((v) => { const n = new Set(v).add(k); save(visitsKey, [...n]); return n; });
  }, [pathname, visited, visitsKey]);

  const refresh = useCallback(async () => {
    try {
      const list = await api.get<Page<Appointment>>("/appointments?scope=all&pageSize=50");
      const briefed = list.items.filter((a) => a.prep_status === "confirmed");
      const upcomingBrief = briefed.filter((a) => a.starts_at >= new Date().toISOString()).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? briefed[0];
      const per = await Promise.all(briefed.slice(0, 4).map((a) => Promise.all([
        api.get<{ shares: unknown[] }>(`/appointments/${a.id}/shares`).catch(() => ({ shares: [] })),
        api.get<{ plans: { imported_at: string | null }[] }>(`/appointments/${a.id}/clinician-plans`).catch(() => ({ plans: [] })),
      ])));
      setState({
        total: list.total,
        briefApptId: upcomingBrief?.id ?? null,
        shared: per.some(([s]) => s.shares.length > 0),
        planSent: per.some(([, p]) => p.plans.length > 0),
        planImported: per.some(([, p]) => p.plans.some((x) => x.imported_at)),
      });
    } catch { /* the checklist still works from visits and clicks */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (open) void refresh(); }, [open, pathname, refresh]);

  // Focus management: move focus into the sheet, trap Tab inside it, Escape closes, focus returns to the button.
  useEffect(() => {
    if (!open) { if (wasOpen.current) fabRef.current?.focus(); wasOpen.current = false; return; }
    wasOpen.current = true;
    sheetRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
      if (e.key !== "Tab" || !sheetRef.current) return;
      const els = [...sheetRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isDone = (s: Step) => s.auto(state, visited) || marked.has(s.id);
  const toggleMark = (id: string) => setMarked((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); save(marksKey, [...n]); return n; });
  const reset = () => { setMarked(new Set()); setVisited(new Set()); save(marksKey, []); save(visitsKey, []); };
  const doneCount = STEPS.filter(isDone).length;
  const nextId = STEPS.find((s) => !isDone(s))?.id;

  return (
    <>
      <button ref={fabRef} type="button" className="dg-fab" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Demo guide, ${doneCount} of ${STEPS.length} steps done`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9" /></svg>
        <span>Demo guide</span>
        <span className="dg-count" aria-hidden="true">{doneCount}/{STEPS.length}</span>
      </button>
      {open && (
        <div className="dg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div ref={sheetRef} className="dg-sheet" role="dialog" aria-modal="true" aria-labelledby="dg-h" aria-describedby="dg-d">
            <div className="dg-top">
              <div>
                <h2 id="dg-h">3-minute demo guide</h2>
                <p id="dg-d">The judge's journey through your sandbox. Steps tick off as you go.</p>
              </div>
              <button type="button" className="btn sm ghost" onClick={() => setOpen(false)} aria-label="Close demo guide" data-autofocus>✕</button>
            </div>
            <div className="dg-bar" role="progressbar" aria-label="Demo progress" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={doneCount}>
              <span style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
            </div>
            <ol className="dg-list">
              {STEPS.map((s, i) => {
                const done = isDone(s), auto = s.auto(state, visited);
                return (
                  <li key={s.id} className={`dg-item${done ? " is-done" : ""}${s.id === nextId ? " is-next" : ""}`} data-step={s.id} data-done={done}>
                    <span className="dg-num" aria-hidden="true">{done ? "✓" : i + 1}</span>
                    <div className="dg-body">
                      <span className="dg-time">{s.time}{done ? <span className="sr-only">, done</span> : null}</span>
                      <p className="dg-title">{s.title}</p>
                      <p className="dg-hint">{s.hint}</p>
                      {!auto && (
                        <button type="button" className="link-btn small" onClick={() => toggleMark(s.id)} aria-pressed={marked.has(s.id)}>
                          {marked.has(s.id) ? "Undo" : "Mark done"}
                        </button>
                      )}
                    </div>
                    <Link className="btn sm dg-go" to={s.go(state)} onClick={() => setOpen(false)} aria-label={`Go: ${s.title}`}>Go</Link>
                  </li>
                );
              })}
            </ol>
            <div className="dg-foot">
              <span>Fictional sandbox, deleted after 24 hours.</span>
              <button type="button" className="link-btn small" onClick={reset}>Reset ticks</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
