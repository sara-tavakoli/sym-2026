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
    <section className="panel section-pad" aria-labelledby="cc">
      <div className="panel-head"><h2 id="cc">Your care circle</h2><Link to="/app/circle" className="panel-link">Manage</Link></div>
      {s.members === 0 && s.pending_invites === 0 ? (
        <div className="panel-empty">
          <p className="muted">Invite a family member or carer to see your appointments and help with follow-up tasks.</p>
          <Link className="btn sm" to="/app/circle"><Icon name="people" /> Invite someone</Link>
        </div>
      ) : (
        <ul className="overview">
          <li><Link to="/app/circle"><span className="glance-n">{s.members}</span><span className="glance-l">{s.members === 1 ? "person" : "people"} in your circle</span></Link></li>
          <li><Link to="/app/follow-up"><span className="glance-n">{s.tasks_taken}</span><span className="glance-l">open {s.tasks_taken === 1 ? "task" : "tasks"} they've taken on</span></Link></li>
          {s.pending_invites > 0 && <li><Link to="/app/circle"><span className="glance-n">{s.pending_invites}</span><span className="glance-l">{s.pending_invites === 1 ? "invite" : "invites"} waiting</span></Link></li>}
        </ul>
      )}
      {s.supporting > 0 && (
        <p className="panel-foot">You're also supporting {s.supporting} {s.supporting === 1 ? "person" : "people"}. <Link to="/app/supporting">Open People I support</Link></p>
      )}
    </section>
  );
}
