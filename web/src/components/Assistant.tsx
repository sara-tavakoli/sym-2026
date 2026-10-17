import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, type AssistantReply, type ChatMessage, type Draft } from "../lib/api";
import { SearchSummary } from "./fit";
import { Spinner } from "./ui";
import { useApp } from "../lib/app-context";

const EXAMPLES = [
  "I have an appointment coming up and want help organising what to discuss",
  "What should I bring to my first GP appointment in Australia?",
  "I got instructions after my visit and want to keep track of them",
  "I need a dentist around Sydney who offers Saturday appointments",
];
const MAX_LEN = 2000;
const HISTORY = 20; // most recent messages sent as context

/** Renders plain text safely: paragraphs and "- " bullets only (no HTML from the model). */
function Text({ content }: { content: string }) {
  const blocks: (string | string[])[] = [];
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^[-•*]\s+/.test(t)) {
      const last = blocks[blocks.length - 1];
      const item = t.replace(/^[-•*]\s+/, "");
      Array.isArray(last) ? last.push(item) : blocks.push([item]);
    } else blocks.push(t);
  }
  return <>{blocks.map((b, i) => (Array.isArray(b) ? <ul key={i}>{b.map((x, j) => <li key={j}>{x}</li>)}</ul> : <p key={i}>{b}</p>))}</>;
}

export function Assistant({ variant = "panel" }: { variant?: "panel" | "page" }) {
  const { chat, setChat, notify } = useApp();
  const nav = useNavigate();
  const [briefing, setBriefing] = useState(false);
  // The limits panel sits beside the chat on wide screens; on smaller screens it starts collapsed so the chat stays in view.
  const [scopeOpen] = useState(() => { try { return window.matchMedia("(min-width: 1081px)").matches; } catch { return true; } });
  // Text typed into the dashboard entry point arrives as router state; it prefills the box and is never auto-sent.
  const location = useLocation();
  const [input, setInput] = useState(() => (location.state as { draft?: string } | null)?.draft ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [chat.length, busy]);

  async function send(text: string, history: ChatMessage[] = chat) {
    const content = text.trim();
    if (!content || busy) return;
    const next: ChatMessage[] = [...history, { role: "user", content }];
    setChat(next); setInput(""); setError(""); setBusy(true);
    try {
      const r = await api.post<AssistantReply>("/assistant/chat", {
        messages: next.slice(-HISTORY).map(({ role, content }) => ({ role, content })),
      });
      setChat([...next, { role: "assistant", content: r.reply, actions: r.actions, safety: r.safety, search: r.search }]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  // Turns the user's own messages into a draft brief (server keeps only verified excerpts, not the chat).
  async function createBrief() {
    setBriefing(true); setError("");
    try {
      const d = await api.post<Draft>("/drafts/from-chat", { messages: chat.slice(-30).map(({ role, content }) => ({ role, content })) });
      notify("Draft brief created from your conversation");
      nav(`/app/drafts/${d.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create the brief. Please try again.");
    } finally { setBriefing(false); }
  }

  // Retry re-sends the last user message that didn't get a reply.
  function retry() {
    const last = chat[chat.length - 1];
    if (last?.role === "user") send(last.content, chat.slice(0, -1));
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); }
  }

  const empty = chat.length === 0;
  const scope = (
    <div className="scope-grid">
      <div>
        <h2 className="scope-title">It can help you</h2>
        <ul>
          <li>Organise your concerns and questions, then turn your own words into a draft brief</li>
          <li>Turn what you're looking for into Fit Finder filters you can check and edit</li>
          <li>Explain CarePath and point you to official resources</li>
        </ul>
      </div>
      <div>
        <h2 className="scope-title">It won't</h2>
        <ul>
          <li>Diagnose, explain symptoms or judge how urgent something is</li>
          <li>Recommend medicines, tests or treatments</li>
          <li>Book appointments, show availability, or say which provider is medically best</li>
        </ul>
      </div>
    </div>
  );

  return (
    <section className={`assistant assistant-${variant}`} aria-labelledby="assistant-title">
      <header className="assistant-head">
        <div>
          <h1 id="assistant-title">CarePath AI Assistant</h1>
          <p className="muted">Get ready for an appointment, or describe the kind of service you're looking for.</p>
        </div>
        {!empty && <button className="btn sm" onClick={() => { setChat([]); setError(""); }} disabled={busy}>New conversation</button>}
      </header>

      <div className="assistant-layout">
        <div className="assistant-main">
          <div className="assistant-log" ref={logRef} aria-live="polite" aria-busy={busy}>
            {empty && (
              <div className="assistant-empty">
                <p className="assistant-hello">Start with one of these, or write your own below.</p>
                <ul className="suggestions">
                  {EXAMPLES.map((ex) => (
                    <li key={ex}><button className="assistant-chip" onClick={() => send(ex)} disabled={busy}>{ex}</button></li>
                  ))}
                </ul>
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i} className={`msg msg-${m.role}`}>
                <span className="msg-who">{m.role === "user" ? "You" : "CarePath"}</span>
                {m.safety && <p className={`msg-safety ${m.safety === "emergency" ? "danger" : "warn"}`}>{m.safety === "emergency" ? "Safety message" : "Safety response"}</p>}
                <div className="msg-bubble"><Text content={m.content} /></div>
                {m.actions && m.actions.length > 0 && (
                  <div className="msg-actions">
                    {m.actions.map((a) =>
                      a.kind === "create_brief" ? <button key="create_brief" className="btn sm primary" onClick={createBrief} disabled={briefing || busy}>{briefing && <Spinner />} {a.label}</button>
                      : a.kind === "internal" ? <Link key={a.href} className="btn sm" to={a.href}>{a.label}</Link>
                      : a.kind === "phone" ? <a key={a.href} className="btn sm danger solid" href={a.href}>{a.label}</a>
                      : <a key={a.href} className="btn sm" href={a.href} target="_blank" rel="noreferrer">{a.label} <span aria-hidden="true">↗</span><span className="sr-only">(opens in a new tab)</span></a>
                    )}
                  </div>
                )}
                {m.search && <SearchSummary extracted={m.search} />}
              </div>
            ))}
            {busy && (
              <div className="msg msg-assistant" role="status">
                <span className="msg-who">CarePath</span>
                <div className="msg-bubble typing"><span className="typing-dots" aria-hidden="true"><span /><span /><span /></span> Writing a reply…</div>
              </div>
            )}
            {error && (
              <div className="alert error assistant-error" role="alert">
                {error} {chat[chat.length - 1]?.role === "user" && <button className="btn sm" onClick={retry}>Try again</button>}
              </div>
            )}
          </div>

          <form className="assistant-input" onSubmit={(e: FormEvent) => { e.preventDefault(); send(input); }}>
            <label htmlFor={`assistant-input-${variant}`} className="sr-only">Message the CarePath AI Assistant</label>
            <textarea
              id={`assistant-input-${variant}`} ref={inputRef} rows={2} maxLength={MAX_LEN} value={input}
              onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
              placeholder="Write a message. Press Enter to send, Shift + Enter for a new line."
            />
            <div className="assistant-input-bar">
              <span className="assistant-foot">
                {input.length > MAX_LEN - 200 && <>{MAX_LEN - input.length} characters left · </>}
                Not saved. Use fictional details. In an emergency call <strong>000</strong>.
              </span>
              <button className="btn primary sm" disabled={busy || !input.trim()} aria-label="Send message">Send</button>
            </div>
          </form>
        </div>

        <aside className="assistant-scope" aria-label="What the assistant can and can't do">
          <details open={scopeOpen}>
            <summary>What the assistant can and can't do</summary>
            {scope}
          </details>
        </aside>
      </div>
    </section>
  );
}
