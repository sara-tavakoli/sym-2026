import { useEffect, useId, useRef, type ReactNode } from "react";
import type { PrepStatus } from "../lib/api";

export function Logo({ size = 32 }: { size?: number }) {
  // Unique gradient id per instance: a shared id breaks when another copy of the logo is hidden.
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#14b8a6" /><stop offset="1" stopColor="#2563eb" /></linearGradient></defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <path d="M8 17l5 5 11-12" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const paths: Record<string, string> = {
  home: "M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z",
  calendar: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  check: "M5 12l5 5 9-10M4 4h16v16H4z",
  chat: "M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-5 4V6a1 1 0 011-1zM8 10h8M8 13h5",
  people: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
};
export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export const Spinner = () => <span className="spinner" aria-hidden="true" />;

export function Skeletons({ rows = 3 }: { rows?: number }) {
  return <div aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 56, marginBottom: 10 }} />)}</div>;
}

export function PrepBadge({ status }: { status: PrepStatus }) {
  if (status === "confirmed") return <span className="badge ok">Brief ready</span>;
  if (status === "draft") return <span className="badge info">Brief draft</span>;
  if (status === "notes") return <span className="badge info">Notes started</span>;
  return <span className="badge">Not prepared</span>;
}

/** Small marker for an after-visit plan a clinician sent back that the patient hasn't turned into a checklist yet. */
export function PlanBadge({ count }: { count?: number }) {
  return count ? <span className="badge info">{count === 1 ? "New plan from clinician" : `${count} new plans from clinician`}</span> : null;
}

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div className="disclaimer" role="note">
      <strong>CarePath is an organisational tool, not a medical service.</strong>{" "}
      It does not diagnose, recommend treatment or replace a healthcare professional.{" "}
      {!compact && <>For symptom advice use the <a href="https://www.healthdirect.gov.au/symptom-checker" target="_blank" rel="noreferrer">Healthdirect Symptom Checker</a>. </>}
      <strong>In an emergency call 000.</strong>
      {!compact && <> Demo only — use fictional information, not real health records.</>}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>("input, select, textarea, button:not([disabled]), a[href]");
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, error, hint, children, full }: { label: string; error?: string; hint?: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label>{label}{children}</label>
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="err" role="alert">{error}</div>}
    </div>
  );
}
