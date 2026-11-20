import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { get, restoreSession } from "./api/client";
import type { MeOut } from "./api/types";
import { Toaster } from "./components/Toaster";
import { useNotificationFeed } from "./hooks/useNotifications";
import { AppShell } from "./layouts/AppShell";
import { ComingNext, PrintLayout } from "./layouts/PrintLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { LiveMonitorPage } from "./pages/LiveMonitorPage";
import { EnrollPage, LoginPage, MfaPage } from "./pages/LoginPages";
import { useAuth } from "./store/auth";
import { socket } from "./ws/socket";

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = useAuth((s) => s.token);
  const me = useAuth((s) => s.me);
  const loc = useLocation();
  if (!token || !me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

function Later({ title }: { title: string }) {
  return <AppShell title={title}><ComingNext title={`${title} arrives in Phase 3`} text="This page is planned in docs/19_agent_tasks.md (Phase 3). The live monitor, dashboard and AI suggestions already work." /></AppShell>;
}

function PrintLater({ title, text }: { title: string; text: string }) {
  return <PrintLayout><ComingNext title={title} text={text} /></PrintLayout>;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const token = useAuth((s) => s.token);
  useNotificationFeed(!!token);
  useEffect(() => {
    (async () => {
      if (await restoreSession()) {
        try {
          useAuth.getState().setMe(await get<MeOut>("/me"));
          socket.connect(useAuth.getState().token!);
        } catch {
          useAuth.getState().signOut();
        }
      }
      setBooting(false);
    })();
  }, []);
  useEffect(() => { if (token) socket.connect(token); }, [token]);
  if (booting) return <div className="flex min-h-screen items-center justify-center text-sm text-text-muted">Loading PRIME…</div>;
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/verify" element={<MfaPage />} />
        <Route path="/login/enroll" element={<EnrollPage />} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/prints/:sessionId/live" element={<RequireAuth><LiveMonitorPage /></RequireAuth>} />
        <Route path="/prints/:sessionId/vision" element={<RequireAuth><PrintLater title="Vision arrives in Phase 3" text="Camera view with measured layer width and height drawn over the bead." /></RequireAuth>} />
        <Route path="/prints/:sessionId/trends" element={<RequireAuth><PrintLater title="Trends arrive in Phase 3" text="Any signal over a time window you choose, with the AI's predicted line." /></RequireAuth>} />
        <Route path="/prints/:sessionId/ai" element={<RequireAuth><PrintLater title="Full AI review page arrives in Phase 3" text="For now, accept, modify or reject suggestions on the Live tab." /></RequireAuth>} />
        {["alerts", "ai", "sessions", "trends", "me/achievements", "admin/users", "settings"].map((p) => (
          <Route key={p} path={`/${p}`} element={<RequireAuth><Later title={p === "me/achievements" ? "Achievements" : p === "admin/users" ? "Admin" : p === "ai" ? "AI suggestions" : p[0].toUpperCase() + p.slice(1)} /></RequireAuth>} />
        ))}
        <Route path="*" element={<Navigate to={token ? "/dashboard" : "/login"} replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
