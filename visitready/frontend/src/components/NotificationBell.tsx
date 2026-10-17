import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiGet, apiPost } from "@/lib/api";
import { formatDateTime } from "@/lib/hooks";
import { usePersonaId } from "@/lib/persona";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function NotificationBell({ audience }: { audience: "patient" | "clinician" }) {
  const persona = usePersonaId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const qs = `?audience=${audience}${audience === "patient" ? `&persona=${persona}` : ""}`;
  const key = ["notifications", audience, audience === "patient" ? persona : "all"];
  // Poll so a booking made in the patient tab shows up in the clinician tab within seconds.
  const q = useQuery({ queryKey: key, queryFn: () => apiGet<AppNotification[]>(`/notifications${qs}`), refetchInterval: 4000 });
  const readAll = useMutation({ mutationFn: () => apiPost<AppNotification[]>(`/notifications/read-all${qs}`), onSuccess: (d) => qc.setQueryData(key, d) });
  const readOne = useMutation({ mutationFn: (id: string) => apiPost<AppNotification>(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: key }) });
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read).length;

  return (
    <Popover>
      <PopoverTrigger
        data-testid={`${audience}-notification-bell`}
        aria-label="Notifications"
        className="relative size-9 rounded-full grid place-items-center border border-line bg-white hover:border-eucalypt/50 transition-colors duration-200"
      >
        <Bell className="size-4 text-ink" />
        {unread > 0 && (
          <span data-testid={`${audience}-notification-count`} className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-terracotta text-white text-[10px] font-semibold grid place-items-center animate-pulse-ring">
            {unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 overflow-hidden" data-testid={`${audience}-notification-panel`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-cream">
          <p className="font-heading text-lg text-ink">Activity</p>
          <button
            data-testid={`${audience}-notifications-read-all`}
            disabled={unread === 0}
            onClick={() => readAll.mutate()}
            className="text-xs text-eucalypt font-semibold inline-flex items-center gap-1 disabled:opacity-40"
          >
            <CheckCheck className="size-3.5" /> Mark all read
          </button>
        </div>
        <ul className="max-h-96 overflow-y-auto divide-y divide-line">
          {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-muted">No activity yet.</li>}
          {items.map((n) => (
            <li key={n.id}>
              <button
                data-testid={`notification-item-${n.id}`}
                onClick={() => { if (!n.read) readOne.mutate(n.id); navigate(n.link); }}
                className={cn("w-full text-left px-4 py-3 flex gap-3 hover:bg-sand/60 transition-colors duration-200", !n.read && "bg-eucalypt-soft/40")}
              >
                <span className={cn("mt-1.5 size-2 rounded-full shrink-0", n.read ? "bg-line" : "bg-terracotta")} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{n.title}</span>
                  <span className="block text-xs text-ink-muted">{n.body}</span>
                  <span className="block text-[10px] text-ink-muted mt-1 font-mono">{formatDateTime(n.created_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
