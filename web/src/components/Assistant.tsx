import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
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

function SparkIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
    </svg>
  );
}

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
  const [input, setInput] = useState("");
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
  return (
    <section className={`assistant assistant-${variant}`} aria-labelledby="assistant-title">
      <header className="assistant-head">
        <span className="assistant-mark"><SparkIcon /></span>
        <div className="assistant-titles">
          <h2 id="assistant-title">CarePath AI Assistant</h2>
          <p>Get ready for appointments and find your way around CarePath — in plain language.</p>
        </div>
        {!empty && <button className="btn sm ghost" onClick={() => { setChat([]); setError(""); }} disabled={busy}>New conversation</button>}
      </header>

      <details className="assistant-scope" open={variant === "page" ? true : undefined}>
        <summary>What the assistant can and can't do</summary>
        <div className="assistant-scope-grid">
          <div>
            <strong className="can">Can help you</strong>
            <ul>
              <li>Organise your concerns and questions, then turn your own words into a draft brief</li>
              <li>Turn what you're looking for into Fit Finder search preferences you can check and edit</li>
              <li>Explain CarePath and point you to official resources</li>
            </ul>
          </div>
          <div>
            <strong className="cant">Can't</strong>
            <ul>
              <li>Diagnose, explain symptoms or judge urgency</li>
              <li>Recommend medicines, tests or treatments</li>
              <li>Book appointments, show real availability, or say which provider is medically best</li>
            </ul>
          </div>
        </div>
      </details>

      <div className="assistant-log" ref={logRef} aria-live="polite" aria-busy={busy}>
        {empty && (
          <div className="assistant-empty">
            <p className="assistant-hello">Hi! What would you like help with?</p>
            <div className="assistant-chips" role="list">
              {EXAMPLES.map((ex) => (
                <button key={ex} role="listitem" className="assistant-chip" onClick={() => send(ex)} disabled={busy}>{ex}</button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.role === "assistant" && <span className="msg-avatar" aria-hidden="true"><SparkIcon size={15} /></span>}
            <div className="msg-body">
              <span className="sr-only">{m.role === "user" ? "You said:" : "Assistant:"}</span>
              {m.safety && <span className={`badge ${m.safety === "emergency" ? "danger" : "warn"} msg-safety`}>{m.safety === "emergency" ? "Safety message" : "Safety response"}</span>}
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
          </div>
        ))}
        {busy && (
          <div className="msg msg-assistant">
            <span className="msg-avatar" aria-hidden="true"><SparkIcon size={15} /></span>
            <div className="msg-bubble typing" aria-label="Assistant is typing"><span /><span /><span /></div>
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
          id={`assistant-input-${variant}`} ref={inputRef} rows={1} maxLength={MAX_LEN} value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
          placeholder="Ask about preparing for an appointment, or how CarePath can help…"
        />
        <button className="btn primary assistant-send" disabled={busy || !input.trim()} aria-label="Send message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </form>
      <p className="assistant-foot">
        {input.length > MAX_LEN - 200 && <span>{MAX_LEN - input.length} characters left · </span>}
        Conversations aren't saved. Use fictional details only. Not for emergencies — call <strong>000</strong>.
      </p>
    </section>
  );
}
