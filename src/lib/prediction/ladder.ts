import type { PMMarket, PMOutcome } from "./types";

// Pure helpers for multi-strike "ladder" markets (e.g. "BTC $85,000 or above 0.96, $85,500 or above 0.52 …").
// Safe to import from client components.

export function isAboveLadder(m: PMMarket): boolean {
  const withValue = m.outcomes.filter((o) => o.value != null);
  if (withValue.length < 3) return false;
  if (m.strikeSide === "below") return false;
  // Probabilities should fall as the threshold rises (allow some noise).
  const sorted = [...withValue].sort((a, b) => a.value! - b.value!);
  let down = 0;
  for (let i = 1; i < sorted.length; i++) if (sorted[i].prob <= sorted[i - 1].prob + 0.02) down++;
  return down >= (sorted.length - 1) * 0.7;
}

// Threshold at which the market gives ~50/50: the market-implied median price/print.
export function impliedMedian(m: PMMarket): { value: number; prob: number } | null {
  if (!isAboveLadder(m)) return null;
  const sorted = m.outcomes.filter((o) => o.value != null).sort((a, b) => a.value! - b.value!);
  let best: PMOutcome | null = null;
  for (const o of sorted) if (best == null || Math.abs(o.prob - 0.5) < Math.abs(best.prob - 0.5)) best = o;
  if (!best) return null;
  // Interpolate between the two outcomes that straddle 0.5 when possible.
  const i = sorted.indexOf(best);
  const lo = best.prob > 0.5 ? best : sorted[i - 1];
  const hi = best.prob > 0.5 ? sorted[i + 1] : best;
  if (lo && hi && lo.prob > 0.5 && hi.prob <= 0.5 && lo.prob !== hi.prob) {
    const t = (lo.prob - 0.5) / (lo.prob - hi.prob);
    return { value: lo.value! + t * (hi.value! - lo.value!), prob: 0.5 };
  }
  return { value: best.value!, prob: best.prob };
}

// Up to `n` outcomes centred on the 50% point, so a 30-rung ladder shows the part that is actually in play.
export function ladderWindow(m: PMMarket, n = 7): PMOutcome[] {
  const withValue = m.outcomes.filter((o) => o.value != null).sort((a, b) => a.value! - b.value!);
  if (withValue.length <= n) return withValue.length ? withValue : [...m.outcomes].sort((a, b) => b.prob - a.prob).slice(0, n);
  let c = 0;
  for (let i = 0; i < withValue.length; i++) if (Math.abs(withValue[i].prob - 0.5) < Math.abs(withValue[c].prob - 0.5)) c = i;
  const half = Math.floor(n / 2);
  const start = Math.max(0, Math.min(c - half, withValue.length - n));
  return withValue.slice(start, start + n);
}
