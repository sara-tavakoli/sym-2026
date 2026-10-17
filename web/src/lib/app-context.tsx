import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type ChatMessage, type User } from "./api";

type Theme = "light" | "dark" | "system";
interface Toast { id: number; text: string; kind: "ok" | "error" }

interface Ctx {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
  theme: Theme;
  setTheme: (t: Theme) => void;
  notify: (text: string, kind?: Toast["kind"]) => void;
  /** Assistant conversation: memory only (never persisted), shared by the dashboard panel and the assistant page. */
  chat: ChatMessage[];
  setChat: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}
const AppCtx = createContext<Ctx>(null!);
export const useApp = () => useContext(AppCtx);

const readTheme = (): Theme => {
  try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") return t; } catch { /* storage unavailable */ }
  return "system";
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);

  useEffect(() => {
    api.get<{ user: User | null }>("/auth/session").then((r) => setUser(r.user)).catch((e) => console.error(e)).finally(() => setLoading(false));
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try { t === "system" ? localStorage.removeItem("theme") : localStorage.setItem("theme", t); } catch { /* ignore */ }
    if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  }, []);

  const notify = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const logout = useCallback(async () => { await api.post("/auth/logout").catch(() => {}); setChat([]); setUser(null); }, []);

  return (
    <AppCtx.Provider value={{ user, loading, setUser, logout, theme, setTheme, notify, chat, setChat }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind === "error" ? "error" : ""}`}>{t.text}</div>)}
      </div>
    </AppCtx.Provider>
  );
}
