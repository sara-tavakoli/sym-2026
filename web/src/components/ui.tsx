import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PrepStatus } from "../lib/api";

export function Logo({ size = 32 }: { size?: number }) {
  // Eucalypt disc with a leaf: the prototype's brand mark. Colours follow the theme tokens.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <circle cx="16" cy="16" r="16" style={{ fill: "var(--primary)" }} />
      <g transform="translate(7.2 7.2) scale(.73)" fill="none" style={{ stroke: "var(--on-primary)" }} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
      </g>
    </svg>
  );
}

const paths: Record<string, string> = {
  home: "M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z",
  calendar: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  check: "M5 12l5 5 9-10M4 4h16v16H4z",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4M8 11h6M11 8v6",
  chat: "M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-5 4V6a1 1 0 011-1zM8 10h8M8 13h5",
  people: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  phone: "M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
};
export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

/** Thin top strip: demo boundary notice plus an always-visible emergency call link. */
export function DemoStrip() {
  return (
    <div className="demo-strip" role="note" aria-label="Demo notice">
      <div className="wrap strip-row">
        <span>
          <span className="strip-tag">Demo</span>
          <span className="strip-long">Fictional patients, clinics and clinicians. Not a real healthcare service.</span>
          <span className="strip-short">Fictional data. Not a healthcare service.</span>
        </span>
        <a className="sos-pill" href="tel:000"><Icon name="phone" /> In an emergency call <b>000</b></a>
      </div>
    </div>
  );
}

export const Spinner =() => <span className="spinner" aria-hidden="true" />;

export function Skeletons({ rows = 3 }: { rows?: number }) {
  return <div aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 56, marginBottom: 10 }} />)}</div>;
}

/** Preparation status as quiet text with a status dot (colour is never the only signal). */
export function PrepBadge({ status }: { status: PrepStatus }) {
  const [tone, label] = status === "confirmed" ? ["ok", "Brief ready"] : status === "draft" ? ["info", "Brief in draft"] : status === "notes" ? ["info", "Notes started"] : ["muted", "Not prepared"];
  return <span className={`status status-${tone}`}>{label}</span>;
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
  // Portalled to <body> so the overlay always covers the viewport, even inside an animated page container.
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
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
