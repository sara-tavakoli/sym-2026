import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../lib/app-context";
import { initials, timeAgo, type Activity, type CircleSummary } from "../lib/circle";
import { Icon } from "./ui";

export const Avatar = ({ name }: { name: string }) => <span className="avatar" aria-hidden="true">{initials(name)}</span>;

/** Latest circle events, e.g. "Mia marked 'Book blood test' done · 2h ago". The viewer's own actions read "You". */
export function ActivityFeed({ items, empty }: { items: Activity[]; empty: string }) {
  const { user } = useApp();
  if (!items.length) return <p className="muted small" style={{ margin: 0 }}>{empty}</p>;
  return (
    <ul className="feed">
      {items.map((a) => {
        const who = a.actor_id === user?.id ? "You" : a.actor_name;
        return (
          <li key={a.id}>
            <Avatar name={a.actor_name} />
            <span><strong>{who}</strong> {a.message} <span className="muted">· <time dateTime={a.created_at} title={new Date(a.created_at).toLocaleString("en-AU")}>{timeAgo(a.created_at)}</time></span></span>
          </li>
        );
      })}
    </ul>
  );
}

/** Dashboard card: the patient's own circle, plus a link to the people they support. */
export function CircleCard() {
  const [s, setS] = useState<CircleSummary | null>(null);
  useEffect(() => { api.get<CircleSummary>("/circle/summary").then(setS).catch(() => {}); }, []);
  if (!s) return null;
  return (
    <section className="card" aria-labelledby="cc">
      <div className="card-head"><h2 id="cc">Your care circle</h2><Link to="/app/circle" className="small">Manage</Link></div>
      {s.members === 0 && s.pending_invites === 0 ? (
        <div className="row between">
          <p className="muted small" style={{ margin: 0, flex: "1 1 240px" }}>Invite a family member or carer to see your appointments and help with follow-up tasks.</p>
          <Link className="btn sm" to="/app/circle"><Icon name="people" /> Invite someone</Link>
        </div>
      ) : (
        <div className="stats circle-stats">
          <div className="stat"><b>{s.members}</b><span>{s.members === 1 ? "Person" : "People"} in your circle</span></div>
          <div className="stat"><b>{s.tasks_taken}</b><span>Open tasks they've taken on</span></div>
          {s.pending_invites > 0 && <div className="stat"><b>{s.pending_invites}</b><span>Invites waiting</span></div>}
        </div>
      )}
      {s.supporting > 0 && (
        <p className="small" style={{ margin: ".75rem 0 0" }}>You're also supporting {s.supporting} {s.supporting === 1 ? "person" : "people"}. <Link to="/app/supporting">Open People I support</Link></p>
      )}
    </section>
  );
}
