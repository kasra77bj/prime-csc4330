import { useQuery } from "@tanstack/react-query";
import { Bell, BellRing, ChartLine, ClipboardList, Gauge, LayoutDashboard, LogOut, OctagonAlert, Settings, ShieldCheck, Sparkles, Trophy, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { get, post } from "../api/client";
import type { AlertOut } from "../api/types";
import { ConnectionPill } from "../components/ConnectionPill";
import { Logo, LogoMark } from "../components/Logo";
import { useNotes } from "../hooks/useNotifications";
import { useAuth, useCan } from "../store/auth";
import { socket } from "../ws/socket";

const ROLE_LABEL: Record<string, string> = { operator: "Operator", engineer: "Engineer", admin: "Admin", manager: "Manager", lead: "Team lead" };

function NavItem({ to, icon: Icon, label, locked }: { to: string; icon: typeof Gauge; label: string; locked?: boolean }) {
  return (
    <NavLink to={to} title={label}
      className={({ isActive }) => `flex items-center gap-3 rounded-ctl px-3 py-2 text-sm font-medium ${isActive ? "bg-white/10 text-white shadow-[inset_3px_0_0_var(--brand-600)]" : "text-white/70 hover:bg-white/5 hover:text-white"} ${locked ? "opacity-60" : ""}`}>
      <Icon aria-hidden className="h-5 w-5 shrink-0" />
      <span className="hidden xl:inline">{label}</span>
    </NavLink>
  );
}

/** Critical alerts follow the user to every route (docs/02 global elements). The print page of the same
 *  session shows its own banner, so it passes `quietSession`. */
function GlobalCritical({ quietSession }: { quietSession?: string }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["alerts", "critical"], queryFn: () => get<AlertOut[]>("/alerts?status=open&severity=critical&active=true&limit=5"), refetchInterval: 5000 });
  const a = (q.data ?? []).find((x) => x.session_id !== quietSession);
  if (!a) return null;
  return (
    <div role="alert" className="no-print flex flex-wrap items-center gap-3 border-l-4 border-critical bg-critical-50 px-4 py-2 text-sm">
      <OctagonAlert aria-hidden className="h-5 w-5 text-critical" />
      <span className="font-semibold text-critical">Critical</span>
      <span className="flex-1">{a.message}{a.printer_name ? ` · ${a.printer_name}` : ""}</span>
      <button type="button" className="font-semibold text-brand-700 underline" onClick={() => nav(`/prints/${a.session_id}/live`)}>Open print</button>
    </div>
  );
}

export function AppShell({ title, subtitle, children, actions, quietSession }: { title: string; subtitle?: string; children: ReactNode; actions?: ReactNode; quietSession?: string }) {
  const me = useAuth((s) => s.me);
  const signOut = useAuth((s) => s.signOut);
  const nav = useNavigate();
  const isAdmin = useCan("manage_users");
  const { items, unread } = useNotes();
  const [open, setOpen] = useState(false);
  const logout = async () => {
    await post("/auth/logout").catch(() => undefined);
    socket.disconnect();
    signOut();
    nav("/login");
  };
  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="no-print sticky top-0 flex h-screen w-16 shrink-0 flex-col bg-charcoal px-2 py-4 xl:w-60 xl:px-3">
        <div className="mb-6 px-1">
          <div className="hidden xl:block"><Logo light tagline /></div>
          <div className="xl:hidden"><span className="inline-flex rounded-ctl bg-white p-1"><LogoMark className="h-7 w-7" /></span></div>
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavItem to="/alerts" icon={BellRing} label="Alerts" />
          <NavItem to="/ai" icon={Sparkles} label="AI suggestions" />
          <NavItem to="/sessions" icon={ClipboardList} label="Sessions" />
          <NavItem to="/trends" icon={ChartLine} label="Trends" />
          <NavItem to="/me/achievements" icon={Trophy} label="Achievements" />
          <NavItem to="/admin/users" icon={Users} label="Admin" locked={!isAdmin} />
        </nav>
        <NavItem to="/settings" icon={Settings} label="Settings" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {subtitle && <p className="truncate text-xs text-text-muted">{subtitle}</p>}
          </div>
          {actions}
          <ConnectionPill />
          <div className="relative">
            <button type="button" aria-label={`Notifications, ${unread} unread`} onClick={() => setOpen((o) => !o)}
              className="relative rounded-ctl p-2 text-text-muted hover:bg-canvas hover:text-text">
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-critical px-1 text-center text-[11px] font-semibold text-white">{unread}</span>}
            </button>
            {open && (
              <div className="absolute right-0 top-11 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-surface p-2 shadow-lg">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Notifications</p>
                <ul className="max-h-96 overflow-auto">
                  {items.length === 0 && <li className="px-2 py-4 text-sm text-text-muted">Nothing new.</li>}
                  {items.map((n) => (
                    <li key={n.id}>
                      <button type="button" className="w-full rounded-ctl px-2 py-2 text-left hover:bg-canvas"
                        onClick={() => { setOpen(false); if (n.link) nav(n.link); post(`/me/notifications/${n.id}/read`).catch(() => undefined); }}>
                        <p className="text-sm font-medium">{n.title}</p>
                        {n.body && <p className="line-clamp-2 text-xs text-text-muted">{n.body}</p>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <span className="hidden items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 sm:inline-flex">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5" /> {ROLE_LABEL[me?.role ?? ""] ?? ""}
          </span>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white" aria-hidden>
              {(me?.full_name ?? "?").split(" ").map((x) => x[0]).join("").slice(0, 2)}
            </span>
            <button type="button" onClick={logout} aria-label="Sign out" className="rounded-ctl p-2 text-text-muted hover:bg-canvas hover:text-text">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <GlobalCritical quietSession={quietSession} />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
