import { useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/app-context";
import { Modal, Spinner } from "../components/ui";

export default function Settings() {
  const { user, theme, setTheme, setUser, notify } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function deleteAccount() {
    setBusy(true);
    try { await api.del("/auth/account"); setUser(null); }
    catch { notify("Could not delete the account", "error"); setBusy(false); setConfirming(false); }
  }

  return (
    <div className="fade-in settings">
      <div className="page-head"><div><h1>Settings</h1></div></div>
      <div className="panel settings-panel">
        <section className="setting" aria-labelledby="acc-h">
          <h2 id="acc-h">Account</h2>
          <dl className="setting-body kv">
            <dt>Name</dt><dd>{user?.name}</dd>
            <dt>Email</dt><dd>{user?.email}</dd>
          </dl>
        </section>
        <section className="setting" aria-labelledby="app-h">
          <h2 id="app-h">Appearance</h2>
          <div className="setting-body">
            <div className="seg" role="radiogroup" aria-labelledby="app-h">
              {(["system", "light", "dark"] as const).map((t) => (
                <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
            <p className="hint">System follows your device's light or dark setting.</p>
          </div>
        </section>
        <section className="setting" aria-labelledby="data-h">
          <h2 id="data-h">Your data</h2>
          <div className="setting-body">
            <p>CarePath stores only what you enter. Assistant conversations are not saved.</p>
            <p className="muted small">Deleting your account permanently removes your profile, appointments, briefs, drafts, tasks and saved searches.</p>
            <button className="btn danger" onClick={() => setConfirming(true)}>Delete my account</button>
          </div>
        </section>
      </div>
      {confirming && (
        <Modal title="Delete your account?" onClose={() => setConfirming(false)}>
          <p>All of your data will be permanently deleted. This can't be undone.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
            <button className="btn danger solid" disabled={busy} onClick={deleteAccount}>{busy && <Spinner />} Delete everything</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
