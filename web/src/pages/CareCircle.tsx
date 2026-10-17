import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, fmtDay } from "../lib/api";
import { useApp } from "../lib/app-context";
import { invalidateHelpers, ROLE_HELP, ROLE_LABELS, type CircleData, type CircleInvite, type CircleRole, type Supported } from "../lib/circle";
import { ActivityFeed, Avatar } from "../components/CircleBits";
import { Field, Skeletons, Spinner } from "../components/ui";

function InviteForm({ onCreated }: { onCreated: (link: string, invite: CircleInvite) => void }) {
  const { notify } = useApp();
  const [role, setRole] = useState<CircleRole>("helper");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form);
    setBusy(true); setError("");
    try {
      const r = await api.post<{ invite: CircleInvite; path: string }>("/circle/invites", { name: f.get("name"), email: f.get("email"), role });
      form.reset();
      onCreated(window.location.origin + r.path, r.invite);
      notify("Invite link created");
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not create the invite"); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="form-grid">
        <Field label="Their name"><input name="name" required maxLength={100} autoComplete="off" placeholder="e.g. Mia Chen" /></Field>
        <Field label="Their email" hint="Used only so you can recognise the invite. CarePath doesn't email them."><input name="email" type="email" required maxLength={254} autoComplete="off" placeholder="mia@example.com" /></Field>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small" style={{ fontWeight: 600, marginBottom: ".4rem" }}>What can they do?</legend>
        <div className="role-pick">
          {(["viewer", "helper"] as const).map((r) => (
            <label key={r}>
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
              <span><strong>{ROLE_LABELS[r]}</strong><span className="small muted">{ROLE_HELP[r]}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="small muted">They will never see your preparation notes, draft briefs or the instructions you pasted, and they can't edit or delete anything.</p>
      <button className="btn primary" disabled={busy}>{busy && <Spinner />} Create invite link</button>
    </form>
  );
}

function InviteLink({ link, name, onDone }: { link: string; name: string; onDone: () => void }) {
  const { notify } = useApp();
  async function copy() {
    try { await navigator.clipboard.writeText(link); notify("Link copied"); }
    catch { notify("Couldn't copy automatically. Select the link and copy it.", "error"); }
  }
  return (
    <div className="invite-link stack" role="status">
      <div>
        <h3 style={{ marginBottom: ".2rem" }}>Send this link to {name}</h3>
        <p className="small muted" style={{ margin: 0 }}>Share it yourself by text, email or chat. CarePath doesn't send emails in this demo. It works once and expires in 7 days. For your security it's shown only now.</p>
      </div>
      <div className="row">
        <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
        <button className="btn primary" type="button" onClick={copy}>Copy</button>
      </div>
      <button className="btn sm ghost" type="button" onClick={onDone} style={{ alignSelf: "flex-start" }}>Done</button>
    </div>
  );
}

export default function CareCircle() {
  const { notify } = useApp();
  const [data, setData] = useState<CircleData | null>(null);
  const [supporting, setSupporting] = useState<Supported[]>([]);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ link: string; name: string } | null>(null);

  const load = useCallback(() => {
    api.get<CircleData>("/circle").then(setData).catch((e) => setError(e.message));
    api.get<{ items: Supported[] }>("/supporting").then((r) => setSupporting(r.items)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); invalidateHelpers(); notify(ok); load(); }
    catch (e) { notify(e instanceof ApiError ? e.message : "Something went wrong", "error"); }
  }

  return (
    <div className="stack fade-in">
      <div className="page-head">
        <div><h1>Care circle</h1><p className="muted">Share the load with the family member or carer who helps with your appointments.</p></div>
        {supporting.length > 0 && <Link className="btn" to="/app/supporting">People I support ({supporting.length})</Link>}
      </div>

      <section className="card" aria-labelledby="inv">
        <h2 id="inv">Invite someone</h2>
        {created ? <InviteLink link={created.link} name={created.name} onDone={() => setCreated(null)} />
          : <InviteForm onCreated={(link, invite) => { setCreated({ link, name: invite.name }); load(); }} />}
      </section>

      {error && <div className="alert error" role="alert">{error}</div>}
      {!data && !error && <Skeletons rows={3} />}
      {data && (
        <div className="grid cols-2">
          <section className="card" aria-labelledby="mem">
            <div className="card-head"><h2 id="mem">Members</h2><span className="badge">{data.members.length}</span></div>
            {data.members.length === 0 ? (
              <div className="empty"><h3>No one yet</h3><p>When someone opens your invite link and accepts, they appear here.</p></div>
            ) : data.members.map((m) => (
              <div key={m.id} className="item wrap">
                <Avatar name={m.name} />
                <div className="item-body">
                  <div className="item-title">{m.name}</div>
                  <div className="item-sub">{m.email} · since {fmtDay(m.created_at)}{m.open_tasks ? ` · ${m.open_tasks} open task${m.open_tasks === 1 ? "" : "s"}` : ""}</div>
                </div>
                <select aria-label={`Role for ${m.name}`} value={m.role}
                  onChange={(e) => act(() => api.patch(`/circle/members/${m.id}`, { role: e.target.value }), `${m.name} is now a ${ROLE_LABELS[e.target.value as CircleRole]}`)}>
                  <option value="viewer">Viewer</option><option value="helper">Helper</option>
                </select>
                <button className="btn sm ghost danger" onClick={() => {
                  if (window.confirm(`Remove ${m.name}? They lose access straight away and any tasks they took on come back to you.`)) act(() => api.del(`/circle/members/${m.id}`), `${m.name} removed`);
                }}>Remove</button>
              </div>
            ))}

            {data.invites.length > 0 && (
              <>
                <h3 style={{ marginTop: "1.25rem" }}>Pending invites</h3>
                {data.invites.map((i) => (
                  <div key={i.id} className="item wrap">
                    <Avatar name={i.name} />
                    <div className="item-body">
                      <div className="item-title">{i.name} <span className="badge">{ROLE_LABELS[i.role]}</span></div>
                      <div className="item-sub">{i.email} · expires {fmtDay(i.expires_at)}</div>
                    </div>
                    <button className="btn sm ghost danger" onClick={() => act(() => api.del(`/circle/invites/${i.id}`), "Invite cancelled")}>Cancel invite</button>
                  </div>
                ))}
              </>
            )}
          </section>

          <section className="card" aria-labelledby="act">
            <div className="card-head"><h2 id="act">Recent activity</h2></div>
            <ActivityFeed items={data.activity} empty="Joins, tasks taken on and tasks completed by your circle will show up here." />
          </section>
        </div>
      )}
    </div>
  );
}
