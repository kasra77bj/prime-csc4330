// Types for the PRIME API. Typed endpoints come from the generated OpenAPI schema (npm run gen:api);
// endpoints that return free-form JSON are described by hand below (keep in sync with backend/app/ml/recommend.py
// rec_dict, backend/app/api/v1/ai.py and the WebSocket envelopes in backend/app/ws/hub.py).
import type { components } from "./schema";

type S = components["schemas"];
export type UserOut = S["UserOut"];
export type MeOut = S["MeOut"];
export type LoginOut = S["LoginOut"];
export type TokenOut = S["TokenOut"];
export type EnrollOut = S["EnrollOut"];
export type SessionSummary = S["SessionSummary"];
export type SessionDetail = S["SessionDetail"];
export type PrinterLive = S["PrinterLive"];
export type AlertOut = S["AlertOut"];
export type NotificationOut = S["NotificationOut"];
export type ControlOut = S["ControlOut"];
export type EscalateOut = S["EscalateOut"];
export type LimitOut = S["LimitOut"];
export type UserRole = S["UserRole"];
export type SessionStatus = S["SessionStatus"];
export type Severity = S["Severity"];

export const SIGNALS = [
  "temperature", "pump_rpm", "voltage", "current", "duty", "motor_power", "print_speed",
  "sll_width", "sll_height", "total_height", "flow",
] as const;
export type SignalKey = (typeof SIGNALS)[number];

export interface Reading {
  seq: number;
  ts: string;
  sim_t_s: number;
  layer: number;
  checkpoint: number | null;
  phase: "printing" | "interlayer_delay";
  source: "recorded" | "scenario_override" | "adjusted";
  delay_setting_min: number | null;
  temperature: number | null;
  pump_rpm: number | null;
  voltage: number | null;
  current: number | null;
  duty: number | null;
  motor_power: number | null;
  print_speed: number | null;
  sll_width: number | null;
  sll_height: number | null;
  total_height: number | null;
  flow: number | null;
}

export interface TopFactor { feature: string; value: number; contribution: number }

export interface Prediction {
  id: string;
  target: "extrusion_rate" | "interlayer_delay";
  layer: number;
  checkpoint: number | null;
  value: number;
  unit: string;
  lower: number | null;
  upper: number | null;
  confidence: number | null;
  class_probabilities: Record<string, number> | null;
  observed: number | null;
  top_factors: TopFactor[] | null;
}

export interface WidthEffect {
  signal: "sll_width"; unit: "mm"; history: number[]; with_change: number[]; without_change: number[];
  target: number; tolerance: number;
}
export interface DelayEffect { signal: "interlayer_delay"; unit: "min"; current: number; proposed: number }

export type RecStatus = "pending" | "accepted" | "modified" | "rejected" | "expired" | "superseded";
export type AdjustParam = "pump_rpm" | "print_speed" | "interlayer_delay";

export interface Recommendation {
  id: string;
  session_id: string;
  prediction_id: string;
  parameter: AdjustParam;
  current_value: number;
  proposed_value: number;
  title: string;
  reason_lines: string[];
  predicted_effect: WidthEffect | DelayEffect | null;
  risk_text: string | null;
  confidence: number | null;
  status: RecStatus;
  created_at_layer: number;
  expires_at_layer: number;
  decided_by: string | null;
  decided_at: string | null;
  final_value: number | null;
  reject_reason: string | null;
  reject_note: string | null;
  created_at: string | null;
}

export interface Adjustment {
  id: string;
  session_id: string;
  parameter: AdjustParam;
  from_value: number;
  to_value: number;
  source: "ai_accepted" | "ai_modified" | "manual";
  recommendation_id: string | null;
  user_id: string;
  user_name: string | null;
  note: string | null;
  requested_at_layer: number;
  applied_at_layer: number | null;
  status?: "queued" | "applied";
}

export interface DashboardSummary {
  active_prints: number;
  open_alerts: number;
  open_alerts_by_severity: Record<"info" | "warning" | "critical", number>;
  ai_suggestions_pending: number;
  shift_quality_score: number | null;
}

export type RejectReason = "sensor_artifact" | "material_change" | "disagree_model" | "other";

export interface WsEnvelope<T = unknown> {
  seq?: number;
  type: string;
  channel?: string;
  session_id?: string | null;
  ts?: string;
  data: T;
}
