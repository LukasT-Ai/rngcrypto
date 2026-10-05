// Shared, dependency-free helpers for countdowns and local-time display (used by UI and tests).

export function formatCountdown(secondsToRelease: number): string {
  const s = Math.max(0, Math.floor(secondsToRelease));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatCompactCountdown(secondsToRelease: number): string {
  const s = Math.max(0, Math.floor(secondsToRelease));
  if (s < 60) return `${s}s`;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export type Urgency = "normal" | "highlight" | "strong" | "urgent" | "now";

export function urgencyFor(secondsToRelease: number): Urgency {
  if (secondsToRelease <= 60) return "now";
  if (secondsToRelease <= 15 * 60) return "urgent";
  if (secondsToRelease <= 60 * 60) return "strong";
  if (secondsToRelease <= 4 * 3600) return "highlight";
  return "normal";
}

// Local-time rendering: the server always ships ISO UTC; the browser's Intl handles the zone.
export function formatLocalTime(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(d);
}

export function formatLocalDateTime(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(d);
}

export function formatDataAge(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} sec`;
  return `${Math.round(ms / 60_000)} min`;
}
