import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Lock, UserPlus, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { ApiError, get, patch, post } from "../api/client";
import type { AuditRow, SiteOut, UserCreateOut, UserOut, UserRole } from "../api/types";
import { Button } from "../components/Button";
import { StatusPill } from "../components/StatusPill";
import { toast } from "../components/Toaster";
import { AppShell } from "../layouts/AppShell";
import { useAuth, useCan } from "../store/auth";

const ROLES: { v: UserRole; label: string; can: string }[] = [
  { v: "operator", label: "Operator", can: "Watches prints live, pauses or stops them, acknowledges and escalates alerts." },
  { v: "engineer", label: "Engineer", can: "Everything an operator sees, plus AI decisions, manual changes, raw data and reports." },
  { v: "manager", label: "Manager", can: "Read-only: session history, reports and data export. No live control." },
  { v: "admin", label: "Administrator", can: "Creates users, assigns roles, sets up printers. No print control." },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.v, r.label])) as Record<UserRole, string>;
const when = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "Never";

function AdminFrame({ children }: { children: ReactNode }) {
  const canManage = useCan("manage_users");
  const tab = ({ isActive }: { isActive: boolean }) => `border-b-2 px-4 py-3 text-sm font-medium ${isActive ? "border-brand-600 text-brand-700" : "border-transparent text-text-muted hover:text-text"}`;
  return (
    <AppShell title="Admin" subtitle="Users, roles and the audit trail">
      <nav className="flex gap-1 border-b border-border bg-surface px-4 sm:px-6" aria-label="Admin sections">
        <NavLink to="/admin/users" className={tab}>Users</NavLink>
        <NavLink to="/admin/audit" className={tab}>Audit log</NavLink>
      </nav>
      {canManage ? children : (
        <div className="m-6 flex items-center gap-3 rounded-card bg-surface p-6 text-sm shadow-sm"><Lock aria-hidden className="h-5 w-5 text-text-muted" /> Only administrators can manage users and read the audit log.</div>
      )}
    </AppShell>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => get<SiteOut[]>("/sites") });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("engineer");
  const [siteIds, setSiteIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<UserCreateOut | null>(null);
  const [copied, setCopied] = useState(false);
  const chosen = siteIds ?? (sites.data ?? []).map((s) => s.id);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const submit = async () => {
    setBusy(true);
    try {
      setCreated(await post<UserCreateOut>("/users", { full_name: name.trim(), email: email.trim(), role, site_ids: chosen }));
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      toast({ kind: "critical", title: "Could not create the user", body: e instanceof ApiError ? (e.code === "VALIDATION_ERROR" ? "Check the name and email address." : e.message) : null });
    } finally {
      setBusy(false);
    }
  };
  const copy = () => { navigator.clipboard?.writeText(created!.temporary_password).then(() => setCopied(true)).catch(() => undefined); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="cu-title" className="max-h-full w-[560px] max-w-full overflow-auto rounded-card bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <h2 id="cu-title" className="text-lg font-semibold">{created ? "User created" : "Create user"}</h2>
          <Button variant="ghost" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        {created ? (
          <div className="space-y-4 text-sm">
            <p><strong>{created.user.full_name}</strong> ({created.user.email}) can now sign in as <strong>{ROLE_LABEL[created.user.role]}</strong>.</p>
            <div className="rounded-card bg-warn-50 p-4">
              <p className="flex items-center gap-2 font-semibold"><KeyRound aria-hidden className="h-4 w-4 text-viz-ochre" /> Temporary password, shown only once</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded-ctl bg-surface px-3 py-2 font-mono text-base">{created.temporary_password}</code>
                <Button variant="secondary" onClick={copy}>{copied ? <><Check aria-hidden className="h-4 w-4" /> Copied</> : <><Copy aria-hidden className="h-4 w-4" /> Copy</>}</Button>
              </div>
            </div>
            <p className="text-text-muted">{created.note}</p>
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Full name<input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-ctl border border-border px-2 py-2 font-normal" /></label>
              <label className="text-sm font-medium">Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-ctl border border-border px-2 py-2 font-normal" /></label>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Role</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {ROLES.map((r) => (
                  <label key={r.v} className={`cursor-pointer rounded-card border p-3 text-sm ${role === r.v ? "border-brand-600 bg-brand-50" : "border-border hover:bg-canvas"}`}>
                    <input type="radio" name="role" value={r.v} checked={role === r.v} onChange={() => setRole(r.v)} className="sr-only" />
                    <span className="font-semibold">{r.label}</span>
                    <span className="mt-1 block text-xs text-text-muted">{r.can}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Site access</legend>
              {(sites.data ?? []).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={chosen.includes(s.id)} onChange={(e) => setSiteIds(e.target.checked ? [...chosen, s.id] : chosen.filter((x) => x !== s.id))} /> {s.name}
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2 text-sm text-text-muted"><input type="checkbox" checked disabled className="h-4 w-4" /> Require 2-factor enrollment on first sign-in (always on)</label>
            <Button type="submit" disabled={busy || !name.trim() || !email.trim()}><UserPlus aria-hidden className="h-4 w-4" /> Create user</Button>
          </form>
        )}
      </div>
    </div>
  );
}

export function AdminUsersPage() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.me);
  const canManage = useCan("manage_users");
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const users = useQuery({ queryKey: ["users"], queryFn: () => get<UserOut[]>("/users"), enabled: canManage });
  const rows = (users.data ?? []).filter((u) => !q || `${u.full_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  const update = async (u: UserOut, body: Partial<Pick<UserOut, "role" | "is_active">>) => {
    try {
      await patch(`/users/${u.id}`, body);
      qc.invalidateQueries({ queryKey: ["users"] });
      toast({ kind: "success", title: `${u.full_name} updated` });
    } catch (e) {
      toast({ kind: "critical", title: "Could not update the user", body: e instanceof ApiError ? e.message : null });
    }
  };
  const showNew = params.get("new") === "1";
  return (
    <AdminFrame>
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search users" className="w-72 rounded-ctl border border-border px-3 py-2 text-sm" />
          <Button className="ml-auto" onClick={() => setParams({ new: "1" })}><UserPlus aria-hidden className="h-4 w-4" /> Create user</Button>
        </div>
        <div className="overflow-x-auto rounded-card bg-surface shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-text-muted"><tr><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Role</th><th className="p-3 font-medium">2-factor</th><th className="p-3 font-medium">Last sign-in</th><th className="p-3 font-medium">Account</th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className={`border-t border-border ${u.is_active ? "" : "opacity-60"}`}>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-surface">{u.full_name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
                      <span><span className="block font-medium">{u.full_name}</span><span className="text-xs text-text-muted">{u.email}</span></span>
                    </div>
                  </td>
                  <td className="p-3">
                    <select aria-label={`Role of ${u.full_name}`} value={u.role} disabled={u.id === me?.id} onChange={(e) => update(u, { role: e.target.value as UserRole })} className="rounded-ctl border border-border px-2 py-1.5">
                      {ROLES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="p-3">{u.mfa_enrolled ? <StatusPill level="ok" label="Enrolled" /> : <StatusPill level="warning" label="Pending first sign-in" />}</td>
                  <td className="tabular p-3 text-text-muted">{when(u.last_login_at)}</td>
                  <td className="p-3">
                    {u.id === me?.id ? <span className="text-xs text-text-muted">This is you</span> :
                      <Button variant={u.is_active ? "ghost" : "secondary"} onClick={() => update(u, { is_active: !u.is_active })}>{u.is_active ? "Deactivate" : "Reactivate"}</Button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-text-muted">{users.isLoading ? "Loading users…" : "No users match."}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-text-muted">Users are deactivated, never deleted, so the audit trail stays complete.</p>
      </div>
      {showNew && <CreateUserModal onClose={() => setParams({})} />}
    </AdminFrame>
  );
}

export function AdminAuditPage() {
  const canAudit = useCan("view_audit");
  const [action, setAction] = useState("");
  const q = useQuery({ queryKey: ["audit", action], queryFn: () => get<AuditRow[]>(`/audit?limit=300${action ? `&action=${encodeURIComponent(action)}` : ""}`), enabled: canAudit, refetchInterval: 10000 });
  const FILTERS = [["", "Everything"], ["auth", "Sign-ins"], ["user", "Users"], ["session", "Print control"], ["recommendation", "AI decisions"], ["adjustment", "Manual changes"], ["alert", "Alerts"], ["demo", "Demo controls"]] as const;
  return (
    <AdminFrame>
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(([v, l]) => (
            <button key={l} type="button" aria-pressed={action === v} onClick={() => setAction(v)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${action === v ? "border-brand-600 bg-brand-50 text-brand-700" : "border-border bg-surface text-text-muted"}`}>{l}</button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-card bg-surface shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-text-muted"><tr><th className="p-3 font-medium">When</th><th className="p-3 font-medium">Who</th><th className="p-3 font-medium">Action</th><th className="p-3 font-medium">Details</th></tr></thead>
            <tbody>
              {(q.data ?? []).map((a) => (
                <tr key={a.id} className="border-t border-border align-top">
                  <td className="tabular whitespace-nowrap p-3">{when(a.at)}</td>
                  <td className="p-3">{a.user_name ?? "System"}<span className="block text-xs text-text-muted">{a.user_email}</span></td>
                  <td className="p-3 font-mono text-xs">{a.action}</td>
                  <td className="max-w-[480px] p-3 text-xs text-text-muted">{a.after ? Object.entries(a.after).filter(([, v]) => v != null).map(([k2, v]) => `${k2}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ") : a.entity_type ?? ""}</td>
                </tr>
              ))}
              {(q.data ?? []).length === 0 && <tr><td colSpan={4} className="p-8 text-center text-text-muted">{q.isLoading ? "Loading…" : "No entries."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AdminFrame>
  );
}
