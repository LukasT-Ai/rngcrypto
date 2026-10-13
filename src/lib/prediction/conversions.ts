import type { PMMarket, PMOutcome, PMVenue } from "./types";
import type { FedBucket, FedMeetingOdds } from "./service";

// Pure conversions from prediction-market odds to the numbers the macro engine needs (research-predictive-features
// section 4): Fed expected change in bp from blended meeting buckets, print-implied mean / SD / tail skew from a
// Kalshi threshold ladder, and the horizon shrink that stops far-dated odds from being over-trusted.
// Safe to import from client components (no IO).

// Below this traded notional a ladder's implied SD is not trusted as a surprise prior (research 2.4 / 4.2).
export const LIQUID_LADDER_USD = 50_000;
// Blend weight for the market-implied mean against the published consensus (strategy research 3.3).
export const MARKET_ANCHOR_WEIGHT = 0.6;
// Odds older than this, or further than this from resolution, are shrunk toward the neutral prior (research 4.4).
export const SHRINK_STALE_MS = 24 * 3600e3;
export const SHRINK_HORIZON_MS = 14 * 86400e3;
export const SHRINK_LAMBDA = 0.3;

const FED_DELTA_BP: Record<FedBucket, number> = { hike: 25, hold: 0, cut25: -25, cut50: -50 };

export interface FedExpectation {
  // E[change] in basis points over the meeting buckets (hike +25, hold 0, cut 25 -25, cut 50+ -50).
  expectedChangeBp: number;
  // sqrt(sum p (d - E)^2): the surprise SD in bp. ~7bp when one bucket carries > 90%.
  surpriseSdBp: number;
  modalLabel: string;
  modalProb: number;
  // True when the odds were shrunk toward uniform because the meeting is > 14 days out.
  shrunk: boolean;
}

// Fed expected change from blended meeting odds. Probabilities are renormalised so venue rounding does not leak
// into the mean. Returns null when no bucket has a probability.
export function fedExpectedChange(odds: Pick<FedMeetingOdds, "buckets" | "period">, now = Date.now()): FedExpectation | null {
  const raw = odds.buckets.map((b) => ({ bucket: b.bucket, label: b.label, p: b.blended ?? b.kalshi ?? b.polymarket ?? null })).filter((b): b is { bucket: FedBucket; label: string; p: number } => b.p != null && b.p >= 0);
  if (raw.length === 0) return null;
  const sum = raw.reduce((a, b) => a + b.p, 0);
  if (sum <= 0) return null;
  const meetingMs = meetingTime(odds.period);
  const shrunk = meetingMs != null && meetingMs - now > SHRINK_HORIZON_MS;
  const uniform = 1 / raw.length;
  const probs = raw.map((b) => {
    const p = b.p / sum;
    return { ...b, p: shrunk ? p + SHRINK_LAMBDA * (uniform - p) : p };
  });
  const e = probs.reduce((a, b) => a + b.p * FED_DELTA_BP[b.bucket], 0);
  const v = probs.reduce((a, b) => a + b.p * (FED_DELTA_BP[b.bucket] - e) ** 2, 0);
  let modal = probs[0];
  for (const b of probs) if (b.p > modal.p) modal = b;
  return { expectedChangeBp: round(e, 1), surpriseSdBp: round(Math.sqrt(v), 1), modalLabel: modal.label, modalProb: round(modal.p, 3), shrunk };
}

function meetingTime(period: string): number | null {
  if (!period) return null;
  const iso = period.length === 7 ? `${period}-15` : period;
  const t = new Date(`${iso}T18:00:00Z`).getTime();
  return Number.isFinite(t) ? t : null;
}

// Survival ladder: thresholds k_j ascending with P(X > k_j) non-increasing. Built from an "above" ladder market
// (Kalshi "greater" strikes); probabilities are forced monotone so a noisy rung cannot create negative bucket mass.
export interface SurvivalLadder {
  thresholds: number[];
  survival: number[];
}

export function survivalLadder(m: Pick<PMMarket, "outcomes" | "strikeSide">): SurvivalLadder | null {
  if (m.strikeSide === "below") return null;
  const withValue = m.outcomes.filter((o): o is PMOutcome & { value: number } => typeof o.value === "number" && Number.isFinite(o.value));
  if (withValue.length < 3) return null;
  const sorted = [...withValue].sort((a, b) => a.value - b.value);
  // Must look like an above-ladder: probabilities fall as the threshold rises (allow some noise, as ladder.ts does).
  let down = 0;
  for (let i = 1; i < sorted.length; i++) if (sorted[i].prob <= sorted[i - 1].prob + 0.02) down++;
  if (down < (sorted.length - 1) * 0.7) return null;
  const thresholds: number[] = [];
  const survival: number[] = [];
  let floor = 1;
  for (const o of sorted) {
    const p = Math.min(floor, Math.max(0, o.prob));
    thresholds.push(o.value);
    survival.push(p);
    floor = p;
  }
  return { thresholds, survival };
}

// P(X > x) with linear interpolation between rungs; 1 below the first rung's reach, 0 above the last.
export function survivalAt(l: SurvivalLadder, x: number): number {
  const { thresholds: k, survival: s } = l;
  // Thresholds like 0.3 - 0.1 - 0.1 land a hair off the rung in floating point; snap within 1e-9.
  const EPS = 1e-9;
  if (x <= k[0] + EPS) return Math.abs(x - k[0]) <= EPS ? s[0] : 1;
  if (x >= k[k.length - 1] - EPS) return Math.abs(x - k[k.length - 1]) <= EPS ? s[s.length - 1] : 0;
  for (let i = 1; i < k.length; i++) {
    if (x <= k[i] + EPS) {
      const t = (x - k[i - 1]) / (k[i] - k[i - 1]);
      return s[i - 1] + t * (s[i] - s[i - 1]);
    }
  }
  return 0;
}

export interface ImpliedDistribution {
  mean: number;
  sd: number;
  // Mass sitting beyond the outermost rungs (large = the ladder was trimmed and the moments are approximate).
  tailMass: number;
}

// Mean and SD from the ladder by the bucket rule: mass in (k_{j-1}, k_j] is S(k_{j-1}) - S(k_j).
// `resolution` is the print's step (0.1 for CPI m/m, 1k for payrolls -> 0 = continuous). For a discrete print the
// bucket value is the midpoint of the attainable values in (k_{j-1}, k_j]; for a continuous one the plain midpoint.
export function impliedDistribution(l: SurvivalLadder, resolution = 0): ImpliedDistribution {
  const { thresholds: k, survival: s } = l;
  const n = k.length;
  const step = n > 1 ? (k[n - 1] - k[0]) / (n - 1) : resolution || 1;
  const values: number[] = [];
  const masses: number[] = [];
  // Lower tail: X <= k_0.
  values.push(k[0] - (resolution ? 0 : step / 2));
  masses.push(1 - s[0]);
  for (let j = 1; j < n; j++) {
    values.push(resolution ? (k[j - 1] + resolution + k[j]) / 2 : (k[j - 1] + k[j]) / 2);
    masses.push(s[j - 1] - s[j]);
  }
  // Upper tail: X > k_{n-1}.
  values.push(k[n - 1] + (resolution ? resolution : step / 2));
  masses.push(s[n - 1]);
  const total = masses.reduce((a, b) => a + b, 0) || 1;
  const mean = values.reduce((a, v, i) => a + v * masses[i], 0) / total;
  const v = values.reduce((a, val, i) => a + masses[i] * (val - mean) ** 2, 0) / total;
  return { mean: round(mean, 4), sd: round(Math.sqrt(v), 4), tailMass: round(((1 - s[0]) + s[n - 1]) / total, 3) };
}

export function printImpliedMean(m: Pick<PMMarket, "outcomes" | "strikeSide">, resolution = 0): number | null {
  const l = survivalLadder(m);
  return l ? impliedDistribution(l, resolution).mean : null;
}

export function printImpliedSd(m: Pick<PMMarket, "outcomes" | "strikeSide">, resolution = 0): number | null {
  const l = survivalLadder(m);
  return l ? impliedDistribution(l, resolution).sd : null;
}

// tailSkew = P(X > consensus + band) - P(X < consensus - band), in [-1, 1]. Positive = an upside miss is priced.
// For a discrete print P(X < v) = 1 - P(X > v - resolution), so a 0.1-step CPI with consensus 0.3 compares
// P(> 0.4) against P(<= 0.1).
export function printTailSkew(m: Pick<PMMarket, "outcomes" | "strikeSide">, consensus: number, band: number, resolution = 0): number | null {
  const l = survivalLadder(m);
  if (!l || !Number.isFinite(consensus) || !(band > 0)) return null;
  const above = survivalAt(l, consensus + band);
  const below = 1 - survivalAt(l, consensus - band - resolution);
  return round(above - below, 3);
}

// Shrink a probability toward 0.5 by lambda when the odds are stale (> 24h old) or far from resolution (> 14 days).
export function shouldShrink(m: Pick<PMMarket, "closeTime" | "retrievedAt">, now = Date.now()): boolean {
  const close = m.closeTime ? new Date(m.closeTime).getTime() : NaN;
  const retrieved = m.retrievedAt ? new Date(m.retrievedAt).getTime() : NaN;
  if (Number.isFinite(close) && close - now > SHRINK_HORIZON_MS) return true;
  if (Number.isFinite(retrieved) && now - retrieved > SHRINK_STALE_MS) return true;
  return false;
}

export function shrinkProb(p: number, lambda = SHRINK_LAMBDA): number {
  return round(p + lambda * (0.5 - p), 4);
}

export function shrinkMarket(m: PMMarket, now = Date.now()): { market: PMMarket; shrunk: boolean } {
  if (!shouldShrink(m, now)) return { market: m, shrunk: false };
  return { market: { ...m, outcomes: m.outcomes.map((o) => ({ ...o, prob: shrinkProb(o.prob) })) }, shrunk: true };
}

export interface MarketExpectation {
  // Market-implied mean of the print; shrunk toward the consensus when the market is stale or far out.
  mean: number | null;
  // Implied SD; only trusted (non-null) when the ladder traded >= LIQUID_LADDER_USD.
  sd: number | null;
  tailSkew: number | null;
  venue: PMVenue;
  volumeUsd: number | null;
  asOf: string | null;
  shrunk: boolean;
  liquid: boolean;
  marketId: string;
}

// Pick the ladder for an event and convert it. `eventTime` chooses the ladder resolving soonest after the release
// (Kalshi lists two or three CPI months at once); `consensus` is the published forecast used for the skew band and
// the shrink target. Returns null when no usable ladder exists.
export function marketExpectation(
  markets: PMMarket[],
  opts: { eventTime: number; consensus: number | null; resolution?: number; band?: number; now?: number }
): MarketExpectation | null {
  const now = opts.now ?? Date.now();
  const resolution = opts.resolution ?? 0;
  const candidates = markets
    .filter((m) => survivalLadder(m) != null)
    .map((m) => ({ m, close: m.closeTime ? new Date(m.closeTime).getTime() : NaN }))
    // Prefer the ladder that resolves at or just after the release (within 3 days), then the nearest future one, then volume.
    .sort((a, b) => ladderRank(a.close, opts.eventTime) - ladderRank(b.close, opts.eventTime) || (b.m.volume ?? 0) - (a.m.volume ?? 0));
  const pick = candidates[0]?.m;
  if (!pick) return null;
  const { market, shrunk } = shrinkMarket(pick, now);
  const ladder = survivalLadder(market)!;
  const dist = impliedDistribution(ladder, resolution);
  const volume = market.volume ?? market.liquidity ?? null;
  const liquid = volume != null && volume >= LIQUID_LADDER_USD;
  let mean: number = dist.mean;
  if (shrunk && opts.consensus != null) mean = round(mean + SHRINK_LAMBDA * (opts.consensus - mean), 4);
  const band = opts.band ?? (resolution || dist.sd || 0);
  const tailSkew = opts.consensus != null && band > 0 ? printTailSkew(market, opts.consensus, band, resolution) : null;
  return {
    mean,
    sd: liquid ? dist.sd : null,
    tailSkew,
    venue: market.venue,
    volumeUsd: volume,
    asOf: market.retrievedAt || null,
    shrunk,
    liquid,
    marketId: market.id,
  };
}

function ladderRank(closeMs: number, eventMs: number): number {
  if (!Number.isFinite(closeMs)) return 3;
  const d = closeMs - eventMs;
  if (d >= -3 * 86400e3 && d <= 3 * 86400e3) return 0;
  if (d > 0) return 1;
  return 2;
}

// Blended anchor for the surprise z-score: 0.6 market / 0.4 consensus when both exist (strategy research 3.3).
export function blendedAnchor(marketMean: number | null, consensus: number | null, w = MARKET_ANCHOR_WEIGHT): { anchor: number; source: "blended" | "market" | "consensus" } | null {
  if (marketMean != null && consensus != null) return { anchor: round(w * marketMean + (1 - w) * consensus, 4), source: "blended" };
  if (marketMean != null) return { anchor: marketMean, source: "market" };
  if (consensus != null) return { anchor: consensus, source: "consensus" };
  return null;
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
