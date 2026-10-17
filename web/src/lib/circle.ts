import { useEffect, useState } from "react";
import { api, type TaskStatus } from "./api";

/** Care circle shapes (owner management, supporter view, activity feed). */
export type CircleRole = "viewer" | "helper";
export const ROLE_LABELS: Record<CircleRole, string> = { viewer: "Viewer", helper: "Helper" };
export const ROLE_HELP: Record<CircleRole, string> = {
  viewer: "Can see upcoming appointments, confirmed briefs and follow-up tasks.",
  helper: "Everything a Viewer can see, plus can update task status and take on tasks.",
};

export interface Activity { id: string; kind: string; message: string; created_at: string; actor_id: string | null; actor_name: string }
export interface CircleMember { id: string; member_id: string; name: string; email: string; role: CircleRole; created_at: string; open_tasks: number }
export interface CircleInvite { id: string; name: string; email: string; role: CircleRole; created_at: string; expires_at: string }
export interface CircleData { members: CircleMember[]; invites: CircleInvite[]; activity: Activity[] }
export interface CircleSummary { members: number; helpers: number; pending_invites: number; tasks_taken: number; supporting: number }
export interface Supported { owner_id: string; name: string; role: CircleRole; created_at: string; upcoming: number; open_tasks: number; my_tasks: number }
export interface SupportTask {
  id: string; appointment_id: string; title: string; deadline: string | null; status: TaskStatus; needs_clarification: number;
  assignee_user_id: string | null; assignee_name: string | null; updated_at: string; practitioner_name: string; starts_at: string;
}
export interface SupportView {
  owner: { id: string; name: string }; role: CircleRole;
  appointments: { id: string; starts_at: string; practitioner_name: string; service_type: string; clinic_name: string; location: string | null; brief_ready: number }[];
  tasks: SupportTask[]; members: { name: string; role: CircleRole }[]; activity: Activity[];
}
export interface InviteInfo { owner_name: string; name: string; role: CircleRole; state: "pending" | "accepted" | "expired" | "cancelled"; expires_at: string }

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export const initials = (name: string) => name.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

// One shared request for the patient's helpers, so every TaskCard on a page can show the assign select.
type Helper = { member_id: string; name: string };
// Keyed by user id so a different account signing in on the same tab never sees a stale list.
let cache: { uid: string; promise: Promise<Helper[]> } | null = null;
export const invalidateHelpers = () => { cache = null; };
export function useHelpers(uid: string | undefined): Helper[] {
  const [helpers, setHelpers] = useState<Helper[]>([]);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    if (cache?.uid !== uid) cache = { uid, promise: api.get<{ helpers: Helper[] }>("/circle/helpers").then((r) => r.helpers).catch(() => { cache = null; return []; }) };
    cache.promise.then((h) => { if (live) setHelpers(h); });
    return () => { live = false; };
  }, [uid]);
  return helpers;
}
