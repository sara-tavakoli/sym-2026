import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api, type AppNotification, type NotificationList } from "../lib/api";
import "./followthrough.css";

const POLL_MS = 20_000;

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/**
 * In-app notifications: an unread badge and a dropdown list, polled every 20 s while the tab is visible.
 * Mounted once in the layout. If its slot is hidden (e.g. the top bar on wide screens) it floats in the top-right corner instead.
 */
export function NotificationBell() {
  const [data, setData] = useState<NotificationList | null>(null);
  const [open, setOpen] = useState(false);
  const [floating, setFloating] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const listId = useId();

  const load = useCallback(() => { api.get<NotificationList>("/notifications").then(setData).catch(() => {}); }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  // Float when the slot we were mounted in is not displayed.
  useLayoutEffect(() => {
    const check = () => setFloating(!!anchor.current && anchor.current.offsetParent === null);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Escape closes and returns focus; clicking elsewhere closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  async function openItem(n: AppNotification) {
    setOpen(false);
    if (!n.read_at) api.post<NotificationList>(`/notifications/${n.id}/read`).then(setData).catch(() => {});
    if (n.link) navigate(n.link);
  }
  async function readAll() {
    try { setData(await api.post<NotificationList>("/notifications/read-all")); } catch { /* keep the list as it is */ }
  }

  const unread = data?.unread ?? 0;
  const bell = (
    <div className={`notif ${floating ? "floating" : ""}`}>
      <button ref={button} type="button" className="notif-btn" aria-haspopup="true" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} onClick={() => { setOpen((o) => !o); if (!open) load(); }}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unread > 0 && <span className="notif-count" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div ref={panel} id={listId} className="notif-panel" role="region" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            {unread > 0 && <button type="button" className="text-btn" onClick={readAll}>Mark all as read</button>}
          </div>
          {!data && <p className="notif-empty">Loading…</p>}
          {data && data.items.length === 0 && <p className="notif-empty">Nothing new. We'll let you know when your clinician or care circle does something.</p>}
          {data && data.items.length > 0 && (
            <ul className="notif-list">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`notif-item ${n.read_at ? "" : "unread"}`} onClick={() => openItem(n)}>
                    <span className={`notif-dot k-${n.kind}`} aria-hidden="true" />
                    <span className="notif-text">
                      <span className="notif-msg">{n.message}{n.read_at ? "" : <span className="sr-only"> (unread)</span>}</span>
                      <span className="notif-time">{ago(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <span ref={anchor} className="notif-anchor" aria-hidden="true" />
      {floating ? createPortal(bell, document.body) : bell}
    </>
  );
}
