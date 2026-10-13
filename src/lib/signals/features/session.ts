// features.session: clock-derived session state (research 1.14). Volume and volatility cluster by session and
// weekend; direction does not, so this is an expected-move scale and a confidence haircut, never a vote.
// Always present (never null). The sizing hooks (sessionVolScale, weekendHaircutPct) are pure helpers for
// be-strategy; this module does not touch the score.

import type { SessionFeature } from "./types";

export const SESSION_TTL = 60e3;
export const WEEKEND_HAIRCUT_PCT = 10;

export type SessionName = SessionFeature["name"];

/** UTC session buckets: Asia 00-07, London 07-13:30, US 13:30-20, off 20-24. */
export function sessionName(d: Date): SessionName {
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  if (h < 7) return "asia";
  if (h < 13.5) return "london";
  if (h < 20) return "us";
  return "off";
}

/** Crypto weekend: Friday 21:00 UTC to Sunday 23:00 UTC. Non-crypto venues are closed in roughly the same window. */
export function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  const h = d.getUTCHours();
  if (dow === 6) return true;
  if (dow === 5 && h >= 21) return true;
  if (dow === 0 && h < 23) return true;
  return false;
}

export function sessionVolScale(name: SessionName, weekend: boolean): number {
  if (weekend) return 0.7;
  switch (name) {
    case "us":
      return 1.3;
    case "asia":
      return 0.8;
    case "london":
      return 1.0;
    default:
      return 0.9;
  }
}

export function buildSessionFeature(now = Date.now(), isCrypto = true): SessionFeature {
  const d = new Date(now);
  const name = sessionName(d);
  const weekend = isWeekend(d);
  const h = d.getUTCHours();
  // Backtest: 21-24 UTC -0.10R n=61 (audit #9). Non-crypto venues are shut on the weekend.
  const gate: SessionFeature["gate"] = !isCrypto && weekend ? "nonc_weekend" : isCrypto && h >= 21 ? "late_utc" : "none";
  return {
    asOf: now,
    ttlMs: SESSION_TTL,
    name,
    volScale: sessionVolScale(name, weekend),
    weekend,
    lowLiquidity: weekend || name === "off",
    haircutPct: weekend ? WEEKEND_HAIRCUT_PCT : 0,
    gate,
    hourUtc: h,
  };
}
