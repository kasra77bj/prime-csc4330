import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { ControlBar } from "../components/ControlBar";
import { useSessionStream } from "../hooks/useSessionStream";
import { useSession } from "../store/live";
import { AppShell } from "./AppShell";

const TABS = [["live", "Live"], ["vision", "Vision"], ["trends", "Trends"], ["ai", "AI"]] as const;

/** Every /prints/:sessionId/* page: tabs on top, persistent ControlBar at the bottom (US-07). */
export function PrintLayout({ children }: { children: ReactNode }) {
  const { sessionId } = useParams();
  const nav = useNavigate();
  useSessionStream(sessionId);
  const s = useSession(sessionId);
  const d = s.detail;
  const layer = s.lastAny?.layer ?? d?.current_layer ?? 0;
  const title = d ? `${d.job_name} · ${d.printer_name}` : "Loading print…";
  return (
    <AppShell title={title} subtitle={d ? `Job ${d.job_code} · ${d.job?.mixture ?? ""} · nozzle ${d.printer?.nozzle ?? ""}` : undefined}
      actions={<button type="button" onClick={() => nav("/dashboard")} className="hidden items-center gap-1 rounded-ctl px-2 py-1 text-sm text-text-muted hover:bg-canvas md:inline-flex"><ArrowLeft className="h-4 w-4" /> Dashboard</button>}>
      <nav className="flex gap-1 border-b border-border bg-surface px-4 sm:px-6" aria-label="Print views">
        {TABS.map(([path, label]) => (
          <NavLink key={path} to={`/prints/${sessionId}/${path}`}
            className={({ isActive }) => `border-b-2 px-4 py-3 text-sm font-medium ${isActive ? "border-brand-600 text-brand-700" : "border-transparent text-text-muted hover:text-text"}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="flex-1">{children}</div>
      {sessionId && (
        <ControlBar sessionId={sessionId} status={s.status} title={d ? `${d.job_name}` : ""} layer={layer} totalLayers={d?.total_layers ?? null} />
      )}
    </AppShell>
  );
}

export function ComingNext({ title, text }: { title: string; text: string }) {
  return (
    <div className="m-6 rounded-card border border-dashed border-border bg-surface p-10 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-sm text-text-muted">{text}</p>
    </div>
  );
}
