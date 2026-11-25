import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { get, restoreSession } from "./api/client";
import type { MeOut, SessionSummary } from "./api/types";
import { Toaster } from "./components/Toaster";
import { useNotificationFeed } from "./hooks/useNotifications";
import { AppShell } from "./layouts/AppShell";
import { ComingNext } from "./layouts/PrintLayout";
import { AdminAuditPage, AdminUsersPage } from "./pages/AdminPages";
import { AiPage } from "./pages/AiPage";
import { AlertsPage } from "./pages/AlertsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LiveMonitorPage } from "./pages/LiveMonitorPage";
import { EnrollPage, LoginPage, MfaPage } from "./pages/LoginPages";
import { AchievementsPage, DemoPage, SettingsPage } from "./pages/MorePages";
import { PrinterSetupPage, RolePage, TourPage, WelcomePage } from "./pages/OnboardingPages";
import { ReportPage, SessionsPage } from "./pages/ReportPages";
import { TrendsPage } from "./pages/TrendsPage";
import { VisionPage } from "./pages/VisionPage";
import { useAuth } from "./store/auth";
import { socket } from "./ws/socket";

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = useAuth((s) => s.token);
  const me = useAuth((s) => s.me);
  const loc = useLocation();
  if (!token || !me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

const ACTIVE = ["running", "paused", "prechecking"];

/** Sidebar "Trends" / "AI suggestions": open that tab of the most relevant print (the live demo print first). */
function ToPrintTab({ tab, title }: { tab: "trends" | "ai"; title: string }) {
  const q = useQuery({ queryKey: ["sessions"], queryFn: () => get<SessionSummary[]>("/sessions") });
  if (q.isLoading) return <AppShell title={title}><p className="p-6 text-sm text-text-muted">Finding the current print…</p></AppShell>;
  const all = q.data ?? [];
  const pick = all.find((s) => ACTIVE.includes(s.status) && s.scenario_name === "demo") ?? all.find((s) => ACTIVE.includes(s.status))
    ?? all.find((s) => s.scenario_name === "demo") ?? all[0];
  if (!pick) return <AppShell title={title}><ComingNext title="No prints yet" text="Once a print is scheduled or running, its trends and AI suggestions show here." /></AppShell>;
  return <Navigate to={`/prints/${pick.id}/${tab}`} replace />;
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
  const auth = (el: JSX.Element) => <RequireAuth>{el}</RequireAuth>;
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/verify" element={<MfaPage />} />
        <Route path="/login/enroll" element={<EnrollPage />} />
        <Route path="/onboarding/welcome" element={auth(<WelcomePage />)} />
        <Route path="/onboarding/role" element={auth(<RolePage />)} />
        <Route path="/onboarding/tour" element={auth(<TourPage />)} />
        <Route path="/onboarding/printer" element={auth(<PrinterSetupPage />)} />
        <Route path="/dashboard" element={auth(<DashboardPage />)} />
        <Route path="/prints/:sessionId/live" element={auth(<LiveMonitorPage />)} />
        <Route path="/prints/:sessionId/vision" element={auth(<VisionPage />)} />
        <Route path="/prints/:sessionId/trends" element={auth(<TrendsPage />)} />
        <Route path="/prints/:sessionId/ai" element={auth(<AiPage />)} />
        <Route path="/trends" element={auth(<ToPrintTab tab="trends" title="Trends" />)} />
        <Route path="/ai" element={auth(<ToPrintTab tab="ai" title="AI suggestions" />)} />
        <Route path="/alerts" element={auth(<AlertsPage />)} />
        <Route path="/sessions" element={auth(<SessionsPage />)} />
        <Route path="/sessions/:sessionId/report" element={auth(<ReportPage />)} />
        <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
        <Route path="/admin/users" element={auth(<AdminUsersPage />)} />
        <Route path="/admin/audit" element={auth(<AdminAuditPage />)} />
        <Route path="/me/achievements" element={auth(<AchievementsPage />)} />
        <Route path="/settings" element={auth(<SettingsPage />)} />
        <Route path="/demo" element={auth(<DemoPage />)} />
        <Route path="*" element={<Navigate to={token ? "/dashboard" : "/login"} replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
