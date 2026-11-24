import { create } from "zustand";
import type { MeOut } from "../api/types";

interface AuthState {
  token: string | null;
  me: MeOut | null;
  mfaToken: string | null;
  enrollRequired: boolean;
  setToken: (t: string | null) => void;
  setMe: (m: MeOut | null) => void;
  setMfa: (t: string | null, enroll?: boolean) => void;
  signOut: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  me: null,
  mfaToken: null,
  enrollRequired: false,
  setToken: (token) => set({ token }),
  setMe: (me) => set({ me }),
  setMfa: (mfaToken, enroll = false) => set({ mfaToken, enrollRequired: enroll }),
  signOut: () => set({ token: null, me: null, mfaToken: null }),
}));

export type Permission =
  | "view_live" | "control_session" | "acknowledge_alert" | "flag_frame" | "escalate" | "view_raw_data"
  | "decide_recommendation" | "manual_adjust" | "resolve_alert" | "manage_sessions" | "view_reports"
  | "export_data" | "manage_users" | "demo_controls" | "view_audit";

/** Permission check mirrored from the server (`/me.permissions`, source of truth: backend core/rbac.py). */
export function useCan(perm: Permission): boolean {
  return useAuth((s) => !!s.me?.permissions.includes(perm));
}
