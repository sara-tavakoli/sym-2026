import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, fmtDateTime, type Appointment } from "../lib/api";
import { copyText, type Share, type ShareEvent, type SharesData } from "../lib/shares";
import { AuditTimeline } from "./AuditTimeline";
import { useApp } from "../lib/app-context";
import { Spinner } from "./ui";
import "../shares.css";

const STATUS: Record<Share["status"], { label: string; cls: string }> = {
  active: { label: "Active", cls: "ok" }, expired: { label: "Expired", cls: "" }, revoked: { label: "Revoked", cls: "danger" },
};

/** Patient side of the clinician share loop: create a link, copy it once, see views and revoke. */
export function ShareCard({ appt }: { appt: Appointment }) {
  const { notify } = useApp();
  const [data, setData] = useState<SharesData | null>(null);
  const [events, setEvents] = useState<ShareEvent[]>([]);
  const [days, setDays] = useState(7);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api.get<SharesData>(`/appointments/${appt.id}/shares`).then(setData).catch((e) => setError(e.message));
    api.get<{ events: ShareEvent[] }>(`/appointments/${appt.id}/share-activity`).then((r) => setEvents(r.events)).catch(() => setEvents([]));
  }, [appt.id]);
  useEffect(load, [load, appt.prep_status]);

  async function create() {
    setError(""); setBusy("create"); setCopied(false);
    try {
      const r = await api.post<{ path: string }>(`/appointments/${appt.id}/shares`, { expires_in_days: days });
      setLink(`${window.location.origin}${r.path}`);
      load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not create the link"); } finally { setBusy(""); }
  }
  async function copy() {
    const ok = await copyText(link, input.current);
    setCopied(ok);
    if (!ok) notify("Couldn't copy automatically. Select the link and copy it.", "error");
  }
  async function revoke(s: Share) {
    setBusy(s.id);
    try { await api.post(`/appointments/${appt.id}/shares/${s.id}/revoke`); notify("Link revoked. It no longer works."); load(); }
    catch (e) { notify(e instanceof ApiError ? e.message : "Could not revoke", "error"); } finally { setBusy(""); }
  }

  const hasBrief = appt.prep_status === "draft" || appt.prep_status === "confirmed";
  const addressed = data?.questions.filter((q) => q.addressed_at).length ?? 0;

  return (
    <section className="card" aria-labelledby="share-h">
      <div className="card-head"><h2 id="share-h">Share with your clinician</h2>
        {data && data.shares.some((s) => s.status === "active") && <span className="badge ok">Link active</span>}</div>
      <p className="muted">Send your brief to your GP before or during the visit. They can tick off your questions as they go and send you an after-visit plan, which you can turn into a checklist here.</p>

      {error && <div className="alert error" role="alert">{error}</div>}

      {!hasBrief ? (
        <div className="alert info">Prepare and save a brief for this appointment first. Then you can share it. <Link to={`/app/appointments/${appt.id}/prepare`}>Prepare your brief</Link></div>
      ) : (
        <>
          {appt.prep_status === "draft" && <div className="alert warn">Your brief is still a draft. Your clinician will see it marked "Draft, not yet confirmed by patient". You can confirm it first in preparation.</div>}
          <div className="row share-create">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`share-days-${appt.id}`}>Link expires after</label>
              <select id={`share-days-${appt.id}`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[1, 3, 7, 14].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}
              </select>
            </div>
            <button className="btn primary" onClick={create} disabled={busy === "create"}>{busy === "create" && <Spinner />} Create share link</button>
          </div>
        </>
      )}

      {link && (
        <div className="share-link" role="status">
          <label htmlFor={`share-url-${appt.id}`}>Your clinician link</label>
          <div className="share-link-row">
            <input id={`share-url-${appt.id}`} ref={input} readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn primary" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <p className="small muted" style={{ margin: ".4rem 0 0" }}>Copy it now: for your privacy we only show this link once. Anyone with the link can view your brief until it expires or you revoke it.</p>
        </div>
      )}

      {data && data.shares.length > 0 && (
        <div className="share-list">
          <h3>Your links</h3>
          {data.shares.map((s) => (
            <div className="item" key={s.id}>
              <div className="item-body">
                <div className="item-title">Created {fmtDateTime(s.created_at)}</div>
                <div className="item-sub">
                  {s.status === "revoked" ? `Revoked ${fmtDateTime(s.revoked_at!)}` : `${s.status === "expired" ? "Expired" : "Expires"} ${fmtDateTime(s.expires_at)}`}
                  {" · "}{s.first_viewed_at ? `First viewed ${fmtDateTime(s.first_viewed_at)} · ${s.view_count} view${s.view_count === 1 ? "" : "s"}` : "Not viewed yet"}
                </div>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <span className={`badge ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                {s.status === "active" && <button className="btn sm danger" onClick={() => revoke(s)} disabled={busy === s.id} aria-label={`Revoke link created ${fmtDateTime(s.created_at)}`}>{busy === s.id && <Spinner />} Revoke</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.shares.length > 0 && data.questions.length > 0 && (
        <div className="share-qs">
          <h3>Your questions <span className="badge">{addressed} of {data.questions.length} addressed</span></h3>
          <ul>
            {data.questions.map((q) => (
              <li key={q.id} className={q.addressed_at ? "done" : ""}>
                <span className="share-tick" aria-hidden="true">{q.addressed_at ? "✓" : ""}</span>
                <span>{q.text}{q.addressed_at && <span className="sr-only"> (marked addressed by your clinician)</span>}</span>
              </li>
            ))}
          </ul>
          <p className="small muted" style={{ margin: 0 }}>Your clinician can tick questions off on the shared page during your visit.</p>
        </div>
      )}

      {events.length > 0 && (
        <div className="share-activity">
          <AuditTimeline compact events={events} title="Activity" limit={5} />
        </div>
      )}
    </section>
  );
}
