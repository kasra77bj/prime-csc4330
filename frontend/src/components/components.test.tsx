import { act, fireEvent, render, screen } from "@testing-library/react";
import type { AlertOut, MeOut, Recommendation } from "../api/types";
import { useAuth } from "../store/auth";
import { AiRecommendationCard } from "./AiRecommendationCard";
import { topAlert } from "./AlertBanner";
import { HoldToStopButton } from "./HoldToStopButton";
import { MetricTile } from "./MetricTile";

const rec: Recommendation = {
  id: "r1", session_id: "s1", prediction_id: "p1", parameter: "pump_rpm", current_value: 27, proposed_value: 34,
  title: "Increase pump speed 27 → 34 RPM", reason_lines: ["Layer width fell from 19.2 to 18.1 mm."],
  predicted_effect: { signal: "sll_width", unit: "mm", history: [19.2, 18.8, 18.4, 18.1], with_change: [18.6, 19.0, 19.5], without_change: [17.8, 17.5, 17.2], target: 19.5, tolerance: 1 },
  risk_text: "Low", confidence: 0.91, status: "pending", created_at_layer: 5, expires_at_layer: 6, decided_by: null,
  decided_at: null, final_value: null, reject_reason: null, reject_note: null, created_at: null,
};
const me = (role: string, permissions: string[]) =>
  ({ id: "u", email: "x", full_name: "X", role, mfa_enrolled: true, is_active: true, permissions, sites: [], onboarding: {} }) as unknown as MeOut;

test("operator sees a locked Accept and an escalate action; engineer sees Accept/Modify/Reject", () => {
  useAuth.setState({ me: me("operator", ["view_live", "escalate"]) });
  const { unmount } = render(<AiRecommendationCard rec={rec} onEscalate={() => undefined} />);
  expect(screen.getByRole("button", { name: /Accept/ })).toBeDisabled();
  expect(screen.getByRole("tooltip")).toHaveTextContent("Engineer approval required");
  expect(screen.getByRole("button", { name: /Escalate to engineer/ })).toBeEnabled();
  unmount();
  useAuth.setState({ me: me("engineer", ["view_live", "decide_recommendation"]) });
  render(<AiRecommendationCard rec={rec} />);
  for (const n of [/Accept/, /Modify/, /Reject/]) expect(screen.getByRole("button", { name: n })).toBeEnabled();
  expect(screen.getByText("91%")).toBeInTheDocument();
});

test("status is shown with color, icon and text", () => {
  render(<MetricTile label="Layer width" value={18.05} unit="mm" digits={2} level="warning" levelLabel="Below target" />);
  expect(screen.getByText("Below target")).toBeInTheDocument();
  expect(screen.getByText("18.05")).toBeInTheDocument();
});

test("hold-to-stop only fires after a full 1.5 s hold", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  const onStop = vi.fn();
  render(<HoldToStopButton onStop={onStop} />);
  const btn = screen.getByRole("button", { name: /Hold to stop/ });
  fireEvent.pointerDown(btn);
  act(() => { vi.advanceTimersByTime(800); });
  fireEvent.pointerUp(btn);
  expect(onStop).not.toHaveBeenCalled();
  fireEvent.pointerDown(btn);
  act(() => { vi.advanceTimersByTime(1600); });
  expect(onStop).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

test("alert banner picks the most severe open alert", () => {
  const a = (id: string, severity: "warning" | "critical" | "info", status = "open") =>
    ({ id, severity, status, raised_at: "2026-11-20T10:00:00Z" }) as unknown as AlertOut;
  expect(topAlert({ a: a("a", "warning"), b: a("b", "critical"), c: a("c", "critical", "resolved") })?.id).toBe("b");
});
