/** Per-browser nudge preferences (docs/17 §9: users can mute nudge types in Settings). Critical alerts are never muted. */
export type NudgeType = "nudge" | "unack" | "badge";
export const NUDGE_TYPES: { type: NudgeType; label: string; hint: string }[] = [
  { type: "nudge", label: "AI heads-ups and change confirmations", hint: "For example \"Change applied at layer 6\"." },
  { type: "unack", label: "Reminder for warnings left unacknowledged", hint: "Shown after 30 seconds without a response." },
  { type: "badge", label: "Badge celebrations", hint: "A short note when you earn a badge." },
];
const KEY = "prime.mutedNudges";

export function mutedNudges(): Set<NudgeType> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as NudgeType[]);
  } catch {
    return new Set();
  }
}

export function setMuted(type: NudgeType, muted: boolean): void {
  const s = mutedNudges();
  if (muted) s.add(type);
  else s.delete(type);
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* storage unavailable: preference lasts for this page only */
  }
}
