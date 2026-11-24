import type { SignalKey } from "../api/types";

export const SIGNAL_META: Record<SignalKey | "delay_setting_min", { label: string; unit: string; digits: number }> = {
  temperature: { label: "Material temperature", unit: "°C", digits: 1 },
  pump_rpm: { label: "Pump speed (extrusion rate)", unit: "RPM", digits: 0 },
  voltage: { label: "Pump voltage", unit: "V", digits: 2 },
  current: { label: "Pump current", unit: "A", digits: 2 },
  duty: { label: "Pump duty", unit: "%", digits: 3 },
  motor_power: { label: "Motor power", unit: "W", digits: 2 },
  print_speed: { label: "Print speed", unit: "mm/s", digits: 0 },
  sll_width: { label: "Layer width", unit: "mm", digits: 2 },
  sll_height: { label: "Layer height", unit: "mm", digits: 2 },
  total_height: { label: "Wall height", unit: "mm", digits: 0 },
  flow: { label: "Flow", unit: "mm³/s", digits: 0 },
  delay_setting_min: { label: "Interlayer delay", unit: "min", digits: 0 },
};

export function fmt(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
}

export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export function greeting(name: string): string {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Chicago" }));
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name.split(" ")[0]}`;
}
