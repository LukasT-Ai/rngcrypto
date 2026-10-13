// TREND / TIMING / FLOW blocks (PR 26, engine audit 1.6 / research section 2). Three orthogonal blocks, one vote
// per idea, combined by weighted vote instead of the 18-weight sum. Pure functions over numbers the engine has
// already computed (indicators, regime, trend system, Phase 4 features); nothing here fetches or reads the clock.
// Behind TUNING.blockMode: "off" keeps the weighted-sum path, "vote" / "sum" let the blocks decide the call.

import type { BookFeature, CvdFeature, FundingFeature, OiFeature } from "./features/types";

export type BlockName = "trend" | "timing" | "flow";
export type BlockVoteValue = -1 | 0 | 1;

export interface BlockMember {
  name: string;
  /** -100..100 */
  score: number;
  weight: number;
  note?: string;
}

export interface BlockResult {
  /** -100..100; 0 when the block abstains. */
  score: number;
  /** -1 / 0 / +1; 0 below the vote threshold, when gated, or when abstaining. */
  vote: BlockVoteValue;
  /** |score|, 0..100 */
  magnitude: number;
  members: BlockMember[];
  notes: string[];
  /** Reason the vote was withheld even though the score is beyond the threshold (HTF gate, reversal gate). */
  gate: string | null;
  /** No member had data. */
  abstained: boolean;
}

export interface BlockOptions {
  /** Block weights in the vote and in the sum. */
  weights: Record<BlockName, number>;
  /** |score| at or above which a block casts a vote. */
  voteThreshold: number;
  /** Intra-block aggregation: weighted mean, or median of the member signs scaled by the strongest magnitude (R2.5). */
  agg: "mean" | "median";
  /** Ablation: blocks that abstain unconditionally. */
  drop: BlockName[];
}

export const DEFAULT_BLOCK_OPTIONS: Readonly<BlockOptions> = Object.freeze({
  weights: Object.freeze({ trend: 0.45, timing: 0.3, flow: 0.25 }),
  voteThreshold: 25,
  agg: "mean" as const,
  drop: [] as BlockName[],
});

let BLOCK_OPTIONS: BlockOptions = { ...DEFAULT_BLOCK_OPTIONS, weights: { ...DEFAULT_BLOCK_OPTIONS.weights }, drop: [] };

/** Backtest hook (--block-weights, --block-agg, --drop-block); the live server never calls it. */
export function setBlockOptions(partial: Partial<BlockOptions>): BlockOptions {
  BLOCK_OPTIONS = {
    ...BLOCK_OPTIONS,
    ...partial,
    weights: { ...BLOCK_OPTIONS.weights, ...(partial.weights ?? {}) },
    drop: partial.drop ? [...partial.drop] : BLOCK_OPTIONS.drop,
  };
  return getBlockOptions();
}
export function resetBlockOptions(): void {
  BLOCK_OPTIONS = { ...DEFAULT_BLOCK_OPTIONS, weights: { ...DEFAULT_BLOCK_OPTIONS.weights }, drop: [] };
}
export function getBlockOptions(): BlockOptions {
  return { ...BLOCK_OPTIONS, weights: { ...BLOCK_OPTIONS.weights }, drop: [...BLOCK_OPTIONS.drop] };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const sgn = (v: number): BlockVoteValue => (v > 0 ? 1 : v < 0 ? -1 : 0);
/** Sign-symmetric rounding so round(-x) === -round(x) exactly (Math.round is not symmetric at .5); eps absorbs float dust. */
const rnd = (v: number, decimals = 0): number => {
  const m = Math.pow(10, decimals);
  return (Math.sign(v) * Math.round(Math.abs(v) * m + 1e-9)) / m;
};
const r1 = (v: number) => rnd(v, 2);

/** Aggregate members into one -100..100 score. Members with weight <= 0 are ignored. */
export function aggregateMembers(members: BlockMember[], agg: BlockOptions["agg"]): number {
  const live = members.filter((m) => m.weight > 0 && Number.isFinite(m.score));
  if (live.length === 0) return 0;
  if (agg === "median") {
    // Median of the member signs scaled by the strongest magnitude (research 2.2): robust to one member going wild.
    const signs = live.map((m) => sgn(m.score)).sort((a, b) => a - b);
    const mid = signs.length % 2 ? signs[(signs.length - 1) / 2] : (signs[signs.length / 2 - 1] + signs[signs.length / 2]) / 2;
    const strongest = Math.max(...live.map((m) => Math.abs(m.score)));
    return clamp(rnd(mid * strongest), -100, 100);
  }
  let num = 0;
  let den = 0;
  for (const m of live) {
    num += m.score * m.weight;
    den += m.weight;
  }
  return den > 0 ? clamp(rnd(num / den), -100, 100) : 0;
}

function finish(members: BlockMember[], notes: string[], gate: string | null, opts: BlockOptions, scale = 1): BlockResult {
  const live = members.filter((m) => m.weight > 0);
  if (live.length === 0) return { score: 0, vote: 0, magnitude: 0, members, notes: [...notes, "no data: abstains"], gate: null, abstained: true };
  const raw = aggregateMembers(live, opts.agg);
  const score = clamp(rnd(raw * scale), -100, 100);
  const vote: BlockVoteValue = gate ? 0 : Math.abs(score) >= opts.voteThreshold ? sgn(score) : 0;
  return { score, vote, magnitude: Math.abs(score), members, notes, gate, abstained: false };
}

const abstain = (name: BlockName, why: string): BlockResult => ({ score: 0, vote: 0, magnitude: 0, members: [], notes: [`${name}: ${why}`], gate: null, abstained: true });

// ── TREND ──────────────────────────────────────────────────────────────────────────────────────────────────────
// One vote per idea: the 15m EMA stack once, the Cloud/200MA/ADX regime (already multi-timeframe), market
// structure (BOS/CHoCH from the trend system), Supertrend. The higher-timeframe EMA trend is a GATE on the vote,
// not another vote (research 2.1): a block that fights the 4h trend keeps its score for display but does not vote.

export interface TrendInput {
  ema9: number;
  ema21: number;
  ema50: number;
  /** +1 / -1 */
  supertrendDir: number;
  /** computeRegime().score, null when the regime could not be computed */
  regimeScore: number | null;
  /** TF-weighted market-structure component of the trend system (BOS/CHoCH), null when unavailable */
  structureScore: number | null;
  trend1h: string;
  trend4h: string;
}

export function scoreTrendBlock(i: TrendInput, opts: BlockOptions = getBlockOptions()): BlockResult {
  if (opts.drop.includes("trend")) return abstain("trend", "dropped (ablation)");
  const members: BlockMember[] = [];
  const notes: string[] = [];
  const stack = i.ema9 > i.ema21 && i.ema21 > i.ema50 ? 100 : i.ema9 < i.ema21 && i.ema21 < i.ema50 ? -100 : i.ema9 > i.ema50 ? 30 : i.ema9 < i.ema50 ? -30 : 0;
  members.push({ name: "emaStack", score: stack, weight: 0.2, note: stack === 100 ? "EMA 9 > 21 > 50" : stack === -100 ? "EMA 9 < 21 < 50" : "EMA stack mixed" });
  if (i.regimeScore != null && Number.isFinite(i.regimeScore)) members.push({ name: "regime", score: clamp(rnd(i.regimeScore), -100, 100), weight: 0.4, note: "Cloud / 200MA / ADX regime" });
  if (i.structureScore != null && Number.isFinite(i.structureScore)) members.push({ name: "structure", score: clamp(rnd(i.structureScore), -100, 100), weight: 0.25, note: "market structure (BOS / CHoCH)" });
  members.push({ name: "supertrend", score: i.supertrendDir >= 0 ? 100 : -100, weight: 0.15, note: i.supertrendDir >= 0 ? "Supertrend bullish" : "Supertrend bearish" });
  const raw = aggregateMembers(members, opts.agg);
  let gate: string | null = null;
  let scale = 1;
  const side = sgn(raw);
  const opposes = (t: string) => (side > 0 && t === "bear") || (side < 0 && t === "bull");
  if (side !== 0 && opposes(i.trend4h)) {
    gate = `4h trend ${i.trend4h} opposes the ${side > 0 ? "bullish" : "bearish"} trend read: vote withheld`;
    scale = 0.5;
    notes.push(gate);
  } else if (side !== 0 && i.trend4h === "mixed" && opposes(i.trend1h)) {
    scale = 0.75;
    notes.push(`4h mixed, 1h ${i.trend1h} against the read: trend score trimmed`);
  }
  return finish(members, notes, gate, opts, scale);
}

// ── TIMING ─────────────────────────────────────────────────────────────────────────────────────────────────────
// One momentum rank (RSI, Stoch RSI, MACD histogram reduced to a single -1..1 read), Bollinger position as the
// mean-reversion member (only toward the regime when the regime is trending, PR 15), divergences / candle
// pattern / liquidity sweep as CONFIRMATION only (they add magnitude when they agree, never flip the sign), the
// volatility squeeze as a state haircut. A TIMING vote against the TREND vote needs a confirmed reversal.

export interface TimingInput {
  price: number;
  rsi: number;
  stochK: number;
  stochD: number;
  macdHist: number;
  atr: number;
  bbUpper: number;
  bbLower: number;
  squeeze: string | null;
  rsiDiv15m: string | null;
  rsiDiv1h: string | null;
  macdDiv: string | null;
  volDiv: string | null;
  pattern: string | null;
  /** TF-weighted liquidity-sweep component of the trend system, null when unavailable */
  sweepScore: number | null;
  /** +1 / -1 when the regime is trending (Bull / Bear, blended ADX >= 20), 0 otherwise */
  regimeDir: 1 | -1 | 0;
  /** The TREND block's vote (counter-trend gate) */
  trendVote: BlockVoteValue;
  /** taSystem.setup === "reversal_confirmed" and its direction */
  reversalConfirmed: 1 | -1 | 0;
}

const BULL_PATTERNS = new Set(["hammer", "inverted_hammer", "bullish_engulfing", "morning_star", "piercing_line"]);
const BEAR_PATTERNS = new Set(["shooting_star", "hanging_man", "bearish_engulfing", "evening_star", "dark_cloud_cover"]);

function divergenceRead(i: TimingInput): number {
  const one = (d: string | null, w: number) => (d === "bullish" ? w : d === "bearish" ? -w : d === "hidden_bullish" ? w * 0.7 : d === "hidden_bearish" ? -w * 0.7 : 0);
  return clamp(one(i.rsiDiv15m, 20) + one(i.rsiDiv1h, 30) + one(i.macdDiv, 25) + one(i.volDiv, 20), -100, 100);
}

export function scoreTimingBlock(i: TimingInput, opts: BlockOptions = getBlockOptions()): BlockResult {
  if (opts.drop.includes("timing")) return abstain("timing", "dropped (ablation)");
  const members: BlockMember[] = [];
  const notes: string[] = [];
  // Momentum rank: RSI level, Stoch RSI level + K/D cross, MACD histogram in ATR units.
  const rsiRead = clamp((i.rsi - 50) / 25, -1, 1);
  const stochRead = clamp((i.stochK - 50) / 50, -1, 1) * 0.5 + (i.stochK > i.stochD ? 0.5 : i.stochK < i.stochD ? -0.5 : 0);
  const macdRead = i.atr > 0 ? clamp(i.macdHist / (0.25 * i.atr), -1, 1) : sgn(i.macdHist);
  const momentum = rnd(100 * (0.4 * rsiRead + 0.3 * stochRead + 0.3 * macdRead));
  members.push({ name: "momentum", score: clamp(momentum, -100, 100), weight: 0.5, note: `RSI ${i.rsi.toFixed(0)}, Stoch K ${i.stochK.toFixed(0)}${i.stochK > i.stochD ? " > D" : " < D"}, MACD hist ${i.macdHist > 0 ? "+" : "-"}` });
  // Location: Bollinger %B as a mean-reversion read, only toward a trending regime.
  const width = i.bbUpper - i.bbLower;
  if (width > 0) {
    const pctB = clamp((i.price - i.bbLower) / width, 0, 1);
    const loc = rnd((0.5 - pctB) * 200);
    const fades = i.regimeDir !== 0 && sgn(loc) === -i.regimeDir;
    if (fades) notes.push(`Band position ${loc > 0 ? "near the lower band" : "near the upper band"} fades the ${i.regimeDir > 0 ? "bull" : "bear"} regime: mean reversion muted`);
    members.push({ name: "location", score: fades ? 0 : loc, weight: 0.5, note: `Bollinger %B ${(pctB * 100).toFixed(0)}%${fades ? " (muted)" : ""}` });
  }
  const base = aggregateMembers(members, opts.agg);
  let score = base;
  const side = sgn(base);
  // Confirmations: add magnitude only when they agree with the base read.
  const divs = divergenceRead(i);
  if (side !== 0 && divs !== 0) {
    if (sgn(divs) === side) {
      score += side * Math.min(15, Math.abs(divs) * 0.3);
      notes.push(`${divs > 0 ? "Bullish" : "Bearish"} divergence confirms`);
    } else notes.push(`${divs > 0 ? "Bullish" : "Bearish"} divergence against the read: ignored (confirmation only)`);
  }
  const pat = i.pattern ? (BULL_PATTERNS.has(i.pattern) ? 1 : BEAR_PATTERNS.has(i.pattern) ? -1 : 0) : 0;
  if (side !== 0 && pat !== 0) {
    if (pat === side) {
      score += side * 10;
      notes.push(`Candle pattern ${i.pattern!.replace(/_/g, " ")} confirms`);
    } else notes.push(`Candle pattern ${i.pattern!.replace(/_/g, " ")} against the read: ignored`);
  }
  if (side !== 0 && i.sweepScore != null && Math.abs(i.sweepScore) >= 40) {
    if (sgn(i.sweepScore) === side) {
      score += side * 10;
      notes.push(`Liquidity sweep confirms`);
    } else notes.push("Liquidity sweep against the read: ignored");
  }
  if (i.squeeze === "volatility_compression") {
    score *= 0.7;
    notes.push("Volatility compression: timing read trimmed until the squeeze releases");
  }
  score = clamp(rnd(score), -100, 100);
  // Counter-trend gate: a TIMING vote against the TREND vote counts only with a confirmed reversal structure.
  let gate: string | null = null;
  const vote0 = Math.abs(score) >= opts.voteThreshold ? sgn(score) : 0;
  if (vote0 !== 0 && i.trendVote !== 0 && vote0 === -i.trendVote && i.reversalConfirmed !== vote0) {
    gate = `Timing read against the trend with no confirmed reversal: vote withheld`;
    notes.push(gate);
    score = rnd(score * 0.5);
  }
  members.push({ name: "confirmations", score: clamp(rnd(score - base), -100, 100), weight: 0, note: "divergences / pattern / sweep / squeeze (magnitude only)" });
  const vote: BlockVoteValue = gate ? 0 : Math.abs(score) >= opts.voteThreshold ? sgn(score) : 0;
  return { score, vote, magnitude: Math.abs(score), members, notes, gate, abstained: false };
}

// ── FLOW ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Real order flow from features.*: CVD slope / taker ratio, OI quadrant, book imbalance, liquidation skew,
// quarter-hour boundary imbalance. Funding is a crowding GATE (haircut on the crowded side), never a direction.
// Null feature = that member abstains. Without the CVD feed (the candles-only backtest) the candle volume factor
// stands in for the CVD member so the block still votes on something; it is excluded when real CVD exists.

export interface FlowInput {
  cvd: CvdFeature | null;
  oi: OiFeature | null;
  funding: FundingFeature | null;
  book: BookFeature | null;
  longLiqs24h: number | null;
  shortLiqs24h: number | null;
  /** Candle-based volume factor score (-100..100), null when volume is unavailable */
  volumeProxy: number | null;
  /** Legacy crowding read from the raw funding rate when the funding feature is absent */
  crowdedFallback: "long" | "short" | null;
}

export function scoreFlowBlock(i: FlowInput, opts: BlockOptions = getBlockOptions()): BlockResult {
  if (opts.drop.includes("flow")) return abstain("flow", "dropped (ablation)");
  const members: BlockMember[] = [];
  const notes: string[] = [];
  if (i.cvd) {
    const imb1h = i.cvd.takerRatio1h != null && i.cvd.takerRatio1h > 0 ? (i.cvd.takerRatio1h - 1) / (i.cvd.takerRatio1h + 1) : null;
    const imb15 = i.cvd.takerImbalance15m;
    let read: number;
    if (imb1h != null && imb15 != null) read = 0.6 * clamp(3 * imb1h, -1, 1) + 0.4 * clamp(3 * imb15, -1, 1);
    else if (imb1h != null) read = clamp(3 * imb1h, -1, 1);
    else if (imb15 != null) read = clamp(3 * imb15, -1, 1);
    else read = 0.3 * sgn(i.cvd.slope1hUsd);
    members.push({ name: "cvd", score: rnd(100 * read), weight: 0.35, note: `taker ratio 1h ${i.cvd.takerRatio1h?.toFixed(2) ?? "n/a"}, 15m imbalance ${imb15 != null ? (imb15 * 100).toFixed(0) + "%" : "n/a"}` });
    if (i.cvd.qhImbalance != null) members.push({ name: "qhImbalance", score: rnd(100 * clamp(2 * i.cvd.qhImbalance, -1, 1)), weight: 0.1, note: "quarter-hour boundary imbalance (EMA4)" });
  } else if (i.volumeProxy != null) {
    members.push({ name: "volumeCandles", score: clamp(rnd(i.volumeProxy), -100, 100), weight: 0.35, note: "candle volume / colour proxy (no taker feed)" });
  }
  if (i.oi?.quadrant) {
    const q = i.oi.quadrant;
    const read = q === "new_longs" ? 0.6 : q === "short_cover" ? 0.3 : q === "new_shorts" ? -0.6 : -0.3;
    members.push({ name: "oiQuadrant", score: rnd(100 * read), weight: 0.2, note: `OI ${q.replace(/_/g, " ")}` });
  }
  if (i.book) members.push({ name: "book", score: rnd(100 * clamp(2.5 * i.book.imbalance, -1, 1)), weight: 0.2, note: `book imbalance ${(i.book.imbalance * 100).toFixed(0)}% within ${(i.book.band * 100).toFixed(0)}%` });
  if (i.longLiqs24h != null && i.shortLiqs24h != null && i.longLiqs24h + i.shortLiqs24h > 0) {
    const longPct = i.longLiqs24h / (i.longLiqs24h + i.shortLiqs24h);
    // Longs being flushed is contrarian bullish (the flush is behind), as in the liquidation factor.
    members.push({ name: "liqSkew", score: rnd((longPct - 0.5) * 200), weight: 0.15, note: `${(longPct * 100).toFixed(0)}% of 24h liquidations were longs` });
  }
  if (members.length === 0) return abstain("flow", "no order-flow data");
  const raw = aggregateMembers(members, opts.agg);
  let scale = 1;
  const crowded = i.funding?.crowded ?? i.crowdedFallback;
  if (crowded && ((crowded === "long" && raw > 0) || (crowded === "short" && raw < 0))) {
    scale = 0.6;
    notes.push(`Funding crowded ${crowded}: ${raw > 0 ? "bullish" : "bearish"} flow haircut (crowding is a gate, not a direction)`);
  }
  return finish(members, notes, null, opts, scale);
}

// ── Combination ────────────────────────────────────────────────────────────────────────────────────────────────

export interface CombinedBlocks {
  mode: "vote" | "sum";
  /** Signed composite -100..100; confidence = 50 + |composite| / 2 like the weighted score it replaces. */
  composite: number;
  direction: BlockVoteValue;
  /** Weighted vote agreement with the direction, -1..1 (agreeing weights minus opposing weights; abstentions 0). */
  agreement: number;
  /** Number of blocks voting with the direction, 0..3. */
  agreeing: number;
  /** Weighted mean magnitude of the agreeing blocks, 0..100. */
  magnitude: number;
}

export function combineBlocks(b: Record<BlockName, BlockResult>, mode: "vote" | "sum", opts: BlockOptions = getBlockOptions()): CombinedBlocks {
  const names: BlockName[] = ["trend", "timing", "flow"];
  const w = opts.weights;
  if (mode === "sum") {
    let num = 0;
    let den = 0;
    for (const n of names) {
      if (b[n].abstained) continue;
      num += w[n] * b[n].score;
      den += w[n];
    }
    const composite = den > 0 ? clamp(rnd(num / den), -100, 100) : 0;
    const direction = sgn(composite);
    const agreeing = names.filter((n) => b[n].vote !== 0 && b[n].vote === direction).length;
    const agreement = direction === 0 ? 0 : names.reduce((s, n) => s + w[n] * b[n].vote * direction, 0);
    return { mode, composite, direction, agreement: r1(agreement), agreeing, magnitude: Math.abs(composite) };
  }
  const wv = names.reduce((s, n) => s + w[n] * b[n].vote, 0);
  const direction = sgn(rnd(wv * 1000));
  if (direction === 0) return { mode, composite: 0, direction: 0, agreement: 0, agreeing: 0, magnitude: 0 };
  let agreement = 0;
  let magNum = 0;
  let magDen = 0;
  let agreeing = 0;
  for (const n of names) {
    agreement += w[n] * b[n].vote * direction;
    if (b[n].vote === direction) {
      agreeing++;
      magNum += w[n] * b[n].magnitude;
      magDen += w[n];
    }
  }
  const magnitude = magDen > 0 ? magNum / magDen : 0;
  const strength = Math.max(0, agreement) * magnitude;
  return { mode, composite: clamp(rnd(direction * strength), -100, 100), direction, agreement: r1(agreement), agreeing, magnitude: rnd(magnitude) };
}

/** Re-run the combiner with one block's vote replaced (flip distances). */
export function combineWithVote(b: Record<BlockName, BlockResult>, name: BlockName, vote: BlockVoteValue, mode: "vote" | "sum", opts: BlockOptions = getBlockOptions()): CombinedBlocks {
  const alt: BlockResult = { ...b[name], vote, magnitude: vote === 0 ? b[name].magnitude : Math.max(b[name].magnitude, opts.voteThreshold), abstained: false };
  return combineBlocks({ ...b, [name]: alt }, mode, opts);
}
