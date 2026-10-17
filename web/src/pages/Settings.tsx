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
    <div className="stack fade-in">
      <div className="page-head"><div><h1>Settings</h1></div></div>
      <section className="card">
        <h2>Account</h2>
        <dl className="details" style={{ margin: 0 }}><dt>Name</dt><dd>{user?.name}</dd><dt>Email</dt><dd>{user?.email}</dd></dl>
      </section>
      <section className="card">
        <h2>Appearance</h2>
        <div className="tabs" role="radiogroup" aria-label="Theme" style={{ marginBottom: 0 }}>
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} role="radio" aria-checked={theme === t} aria-selected={theme === t} onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Your data</h2>
        <p className="muted">CarePath stores only what you enter. Deleting your account permanently removes your profile, appointments and everything attached to them.</p>
        <button className="btn danger" onClick={() => setConfirming(true)}>Delete my account</button>
      </section>
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
