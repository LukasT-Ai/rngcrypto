/**
 * Elliott Wave detector: impulse (1-2-3-4-5) and corrective (A-B-C) counting
 * on top of an ATR-adaptive zigzag, with fib-guideline scoring, Elliott Wave
 * Oscillator (EWO, 5/35 EMA) divergence, and a signed trading score.
 *
 * Score convention (matches the engine): -100..100, negative = bearish/short.
 *   - Bull impulse, wave 5 complete            => strongly negative (short the top)
 *   - Bull impulse, wave 2 / wave 4 pullback   => positive (buy the dip)
 *   - ABC pullback (down) wave C complete      => positive (trend resumption long)
 *   - Everything mirrored for bear impulses / up corrections.
 *
 * Symmetry guarantee: every count is evaluated on direction-normalised prices
 * (q = s * price, s = +1 bullish / -1 bearish). The zigzag threshold is built
 * from ATR (reflection-invariant) plus a percent floor anchored to the series
 * mean, so a series mirrored about its own mean produces identical pivots,
 * identical |score| and identical confidence with the sign flipped.
 *
 * Research basis (see report): LuxAlgo "Elliott Wave (rules-based)" hard rules
 * (wave 2 holds origin, wave 3 never shortest, wave 4 clear of wave 1
 * territory); MarketFragments "Real Elliott Wave" rule-count confidence score;
 * WillyAlgoTrader "Elliott Impulse Engine" strict state-machine acceptance;
 * classic 5/35 oscillator: wave 3 prints the largest EWO extreme and a smaller
 * EWO peak on a higher wave-5 price extreme flags completion.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PivotType = "high" | "low";

export interface Pivot {
  index: number;
  price: number;
  type: PivotType;
  time: number;
}

export interface ZigzagOptions {
  /** Minimum bars between pivots before a tighter (1.5x) deviation is required. Default 3. */
  depth: number;
  /** Percent-of-mean-price floor for a reversal. Default 1.0 (%). Set 0 to disable. */
  deviationPct: number;
  /** ATR multiple for a reversal. Default 2.0. Set 0 to disable. */
  atrMult: number;
  /** ATR period. Default 14. */
  atrPeriod: number;
}

export interface ZigzagState {
  pivots: Pivot[];
  /** Running extreme that has not yet been confirmed by a reversal. */
  pending: Pivot | null;
  /** Reversal threshold (price units) at the last bar. */
  threshold: number;
  /** Reversal progress from the pending extreme, as fraction of threshold (0..1). */
  pendingReversal: number;
}

export type Direction = "bullish" | "bearish";
export type WaveLabel = "1" | "2" | "3" | "4" | "5" | "A" | "B" | "C";

export interface WaveSegment {
  label: WaveLabel;
  startIdx: number;
  endIdx: number;
  startPrice: number;
  endPrice: number;
}

export type ImpulsePosition =
  | "wave2_pullback"
  | "wave3_progress"
  | "wave4_pullback"
  | "wave5_progress"
  | "wave5_complete"
  | "historical";

export interface ImpulseCandidate {
  kind: "impulse";
  direction: Direction;
  pivots: Pivot[];
  waves: WaveSegment[];
  pivotCount: number;
  complete: boolean;
  /** 0..1 fib-guideline fit. */
  fit: number;
  ratios: {
    w2Retrace: number | null;
    w3Ext: number | null;
    w4Retrace: number | null;
    w5ToW1: number | null;
    w5ToW13: number | null;
  };
  position: ImpulsePosition;
  positionLabel: string;
  truncated: boolean;
  diagonal: boolean;
  endsAtLatest: boolean;
}

export type CorrectionType = "zigzag" | "flat" | "expanded_flat";
export type CorrectionPosition =
  | "waveB_progress"
  | "waveC_progress"
  | "waveC_complete"
  | "historical";

export interface CorrectionCandidate {
  kind: "correction";
  /** Direction of the corrective move itself (bearish = ABC down). */
  direction: Direction;
  type: CorrectionType;
  pivots: Pivot[];
  waves: WaveSegment[];
  pivotCount: number;
  complete: boolean;
  fit: number;
  ratios: { bRetrace: number | null; cToA: number | null };
  /** Wave-C completion targets in price. */
  cTargets: { label: string; price: number }[];
  position: CorrectionPosition;
  positionLabel: string;
  endsAtLatest: boolean;
}

export interface EwoDivergence {
  /** "bearish" = higher price high on lower EWO peak; "bullish" = lower price low on higher EWO trough. */
  type: Direction | null;
  /** 0..1, how much the oscillator peak shrank versus the previous same-side swing. */
  strength: number;
  priceA: number | null;
  priceB: number | null;
  ewoA: number | null;
  ewoB: number | null;
}

export interface EwoResult {
  values: number[];
  divergence: EwoDivergence;
}

export interface FibTarget {
  label: string;
  price: number;
}

export interface ElliottTargets {
  nextWaveTarget: number | null;
  invalidation: number | null;
  fibTargets: FibTarget[];
}

export interface ElliottResult {
  pattern: "impulse" | "correction" | null;
  direction: Direction | null;
  currentWave: string;
  confidence: number;
  score: number;
  targets: ElliottTargets;
  notes: string[];
  waves: WaveSegment[];
  /** Extra diagnostics (not required by the engine). */
  meta: {
    pivots: Pivot[];
    pending: Pivot | null;
    provisional: boolean;
    ewoDivergence: EwoDivergence | null;
    fit: number;
    correctionType?: CorrectionType;
    alternates: { pattern: "impulse" | "correction"; direction: Direction; position: string; fit: number }[];
  };
}

export interface ElliottOptions {
  zigzag?: Partial<ZigzagOptions>;
  /** Permit wave 4 to overlap wave 1 (leading/ending diagonals). Default false. */
  allowDiagonal?: boolean;
  /** Permit a truncated fifth (wave 5 fails to exceed wave 3). Default false. */
  allowTruncation?: boolean;
  /** Use the unconfirmed zigzag extreme as a provisional pivot once price has reversed >= pendingMinReversal of threshold. Default true. */
  usePending?: boolean;
  /** Fraction of the zigzag threshold the reversal from the pending extreme must reach. Default 0.5. */
  pendingMinReversal?: number;
  /** EWO EMA lengths. Default 5 / 35. */
  ewoFast?: number;
  ewoSlow?: number;
}

const DEFAULT_ZZ: ZigzagOptions = { depth: 3, deviationPct: 1.0, atrMult: 2.0, atrPeriod: 14 };

// ── Small helpers ────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Triangular closeness: 1 at ideal, 0 at |x - ideal| >= tol. */
function near(x: number, ideal: number, tol: number): number {
  return clamp(1 - Math.abs(x - ideal) / tol, 0, 1);
}

/** Best closeness over several ideals. */
function nearAny(x: number, ideals: number[], tol: number): number {
  let best = 0;
  for (const i of ideals) best = Math.max(best, near(x, i, tol));
  return best;
}

/** 1 inside [lo, hi], tapering linearly to 0 over `taper` outside. */
function inBand(x: number, lo: number, hi: number, taper: number): number {
  if (x >= lo && x <= hi) return 1;
  const d = x < lo ? lo - x : x - hi;
  return clamp(1 - d / taper, 0, 1);
}

function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length);
  if (values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function atr(candles: Candle[], period = 14): number[] {
  const n = candles.length;
  const out = new Array<number>(n).fill(0);
  if (n === 0) return out;
  const tr = new Array<number>(n);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const pc = candles[i - 1].close;
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  }
  // Wilder smoothing with simple-average seed.
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (i < period) {
      sum += tr[i];
      out[i] = sum / (i + 1);
    } else {
      out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
    }
  }
  return out;
}

function meanClose(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  let s = 0;
  for (const c of candles) s += c.close;
  return s / candles.length;
}

// ── 1. Zigzag ────────────────────────────────────────────────────────────────

/**
 * ATR-adaptive zigzag. A reversal is confirmed when price moves against the
 * running extreme by more than max(atrMult * ATR, deviationPct% * meanClose).
 * If the extreme sits closer than `depth` bars to the previous pivot the move
 * must reach 1.5x that threshold (noise filter).
 */
export function zigzagState(candles: Candle[], opts: Partial<ZigzagOptions> = {}): ZigzagState {
  const o = { ...DEFAULT_ZZ, ...opts };
  const n = candles.length;
  const pivots: Pivot[] = [];
  if (n === 0) return { pivots, pending: null, threshold: 0, pendingReversal: 0 };

  const atrS = atr(candles, o.atrPeriod);
  const ref = meanClose(candles);
  const thr = (i: number): number => {
    const a = o.atrMult > 0 ? o.atrMult * atrS[i] : 0;
    const p = o.deviationPct > 0 ? (o.deviationPct / 100) * ref : 0;
    const t = Math.max(a, p);
    return t > 0 ? t : 1e-9;
  };

  let dir: 1 | -1 | 0 = 0; // 1 = looking for a high (uptrend leg), -1 = looking for a low
  let ext: Pivot = { index: 0, price: candles[0].high, type: "high", time: candles[0].time };
  let curHigh: Pivot = { index: 0, price: candles[0].high, type: "high", time: candles[0].time };
  let curLow: Pivot = { index: 0, price: candles[0].low, type: "low", time: candles[0].time };
  let lastPivotIdx = -1;

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const t = thr(i);

    if (dir === 0) {
      if (c.high > curHigh.price) curHigh = { index: i, price: c.high, type: "high", time: c.time };
      if (c.low < curLow.price) curLow = { index: i, price: c.low, type: "low", time: c.time };
      const upMove = c.high - curLow.price;
      const dnMove = curHigh.price - c.low;
      const upOk = upMove > t;
      const dnOk = dnMove > t;
      if (upOk || dnOk) {
        // Tie-break on the earlier extreme (symmetric).
        const goUp = upOk && (!dnOk || curLow.index <= curHigh.index);
        if (goUp) {
          pivots.push(curLow);
          lastPivotIdx = curLow.index;
          dir = 1;
          ext = { index: i, price: c.high, type: "high", time: c.time };
        } else {
          pivots.push(curHigh);
          lastPivotIdx = curHigh.index;
          dir = -1;
          ext = { index: i, price: c.low, type: "low", time: c.time };
        }
      }
      continue;
    }

    if (dir === 1) {
      if (c.high > ext.price) ext = { index: i, price: c.high, type: "high", time: c.time };
      const move = ext.price - c.low;
      const tight = lastPivotIdx >= 0 && ext.index - lastPivotIdx < o.depth;
      if (move > (tight ? 1.5 * t : t)) {
        pivots.push(ext);
        lastPivotIdx = ext.index;
        dir = -1;
        ext = { index: i, price: c.low, type: "low", time: c.time };
      }
    } else {
      if (c.low < ext.price) ext = { index: i, price: c.low, type: "low", time: c.time };
      const move = c.high - ext.price;
      const tight = lastPivotIdx >= 0 && ext.index - lastPivotIdx < o.depth;
      if (move > (tight ? 1.5 * t : t)) {
        pivots.push(ext);
        lastPivotIdx = ext.index;
        dir = 1;
        ext = { index: i, price: c.high, type: "high", time: c.time };
      }
    }
  }

  const lastT = thr(n - 1);
  let pending: Pivot | null = null;
  let pendingReversal = 0;
  if (dir !== 0) {
    pending = ext;
    const last = candles[n - 1];
    const move = dir === 1 ? ext.price - last.low : last.high - ext.price;
    pendingReversal = clamp(move / lastT, 0, 1);
  }
  return { pivots, pending, threshold: lastT, pendingReversal };
}

export function zigzag(candles: Candle[], opts: Partial<ZigzagOptions> = {}): Pivot[] {
  return zigzagState(candles, opts).pivots;
}

// ── 4. Elliott Wave Oscillator ───────────────────────────────────────────────

/** EWO = EMA(fast) - EMA(slow) of close (default 5/35). */
export function ewoSeries(candles: Candle[], fast = 5, slow = 35): number[] {
  const closes = candles.map((c) => c.close);
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  return closes.map((_, i) => f[i] - s[i]);
}

/** Largest (sign-normalised) EWO reading inside [from, to]. */
function ewoPeak(ewo: number[], from: number, to: number, s: 1 | -1): number {
  let best = -Infinity;
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(ewo.length - 1, Math.max(from, to));
  for (let i = lo; i <= hi; i++) best = Math.max(best, s * ewo[i]);
  return best === -Infinity ? 0 : best;
}

/**
 * Divergence between two same-side swings: price makes a further extreme
 * (in the s-direction) while the EWO peak over the second swing is smaller.
 * Ranges are bar-index windows of the two legs ending at those extremes.
 */
export function ewoDivergenceBetween(
  ewo: number[],
  s: 1 | -1,
  swingA: { from: number; to: number; price: number },
  swingB: { from: number; to: number; price: number },
): EwoDivergence {
  const pa = ewoPeak(ewo, swingA.from, swingA.to, s);
  const pb = ewoPeak(ewo, swingB.from, swingB.to, s);
  const none: EwoDivergence = { type: null, strength: 0, priceA: swingA.price, priceB: swingB.price, ewoA: s * pa, ewoB: s * pb };
  if (!(s * swingB.price > s * swingA.price)) return none; // price must extend
  if (!(pa > 0) || !(pb < pa)) return none;
  const strength = clamp(1 - Math.max(pb, 0) / pa, 0, 1);
  return { type: s === 1 ? "bearish" : "bullish", strength, priceA: swingA.price, priceB: swingB.price, ewoA: s * pa, ewoB: s * pb };
}

/**
 * EWO series plus divergence at the latest swing: compares the last two
 * same-type zigzag pivots (highs for bearish divergence, lows for bullish).
 */
export function elliottWaveOscillator(
  candles: Candle[],
  opts: { fast?: number; slow?: number; zigzag?: Partial<ZigzagOptions>; pivots?: Pivot[] } = {},
): EwoResult {
  const values = ewoSeries(candles, opts.fast ?? 5, opts.slow ?? 35);
  const pivots = opts.pivots ?? zigzag(candles, opts.zigzag);
  const empty: EwoDivergence = { type: null, strength: 0, priceA: null, priceB: null, ewoA: null, ewoB: null };
  if (pivots.length < 4) return { values, divergence: empty };
  const last = pivots[pivots.length - 1];
  const s: 1 | -1 = last.type === "high" ? 1 : -1;
  const prevSame = pivots[pivots.length - 3];
  const legBStart = pivots[pivots.length - 2].index;
  const legAStart = pivots[pivots.length - 4].index;
  const div = ewoDivergenceBetween(
    values,
    s,
    { from: legAStart, to: prevSame.index, price: prevSame.price },
    { from: legBStart, to: last.index, price: last.price },
  );
  return { values, divergence: div };
}

// ── 2. Impulse counting ──────────────────────────────────────────────────────

export interface CountOptions {
  allowDiagonal?: boolean;
  allowTruncation?: boolean;
  /** Latest price; used to resolve the in-progress wave for counts ending at the last pivot. */
  lastPrice?: number;
  /** Index of the latest bar (for wave segments ending "now"). */
  lastIndex?: number;
}

function pivotIsQLow(p: Pivot, s: 1 | -1): boolean {
  return s === 1 ? p.type === "low" : p.type === "high";
}

function segs(pivots: Pivot[], labels: WaveLabel[]): WaveSegment[] {
  const out: WaveSegment[] = [];
  for (let i = 0; i + 1 < pivots.length && i < labels.length; i++) {
    out.push({ label: labels[i], startIdx: pivots[i].index, endIdx: pivots[i + 1].index, startPrice: pivots[i].price, endPrice: pivots[i + 1].price });
  }
  return out;
}

/** Fib-guideline fit for the ratios that are known (0..1). */
function impulseFit(r: ImpulseCandidate["ratios"], durations: number[] | null): number {
  let wsum = 0;
  let acc = 0;
  const add = (w: number, v: number | null) => {
    if (v === null) return;
    wsum += w;
    acc += w * v;
  };
  // Wave 2 retrace: ideal 0.5-0.618, acceptable 0.382-0.786.
  add(0.2, r.w2Retrace === null ? null : Math.max(inBand(r.w2Retrace, 0.5, 0.618, 0.25), 0.6 * inBand(r.w2Retrace, 0.382, 0.786, 0.15)));
  // Wave 3 extension: ideal 1.618 (or 2.618), at least 1.0.
  add(0.25, r.w3Ext === null ? null : Math.max(nearAny(r.w3Ext, [1.618, 2.618], 0.7), r.w3Ext >= 1 ? 0.45 : 0.15));
  // Wave 4 retrace: ideal 0.382, acceptable 0.236-0.5.
  add(0.2, r.w4Retrace === null ? null : Math.max(near(r.w4Retrace, 0.382, 0.25), 0.6 * inBand(r.w4Retrace, 0.236, 0.5, 0.15)));
  // Wave 5: = 0.618/1.0/1.618 x wave 1, or 0.618 x (wave 1 start -> wave 3 end).
  if (r.w5ToW1 !== null || r.w5ToW13 !== null) {
    const a = r.w5ToW1 === null ? 0 : nearAny(r.w5ToW1, [0.618, 1.0, 1.618], 0.3);
    const b = r.w5ToW13 === null ? 0 : near(r.w5ToW13, 0.618, 0.2);
    add(0.2, Math.max(a, b));
  }
  // Alternation: sharp/deep wave 2 vs shallow/sideways wave 4 (or vice versa), and differing durations.
  if (r.w2Retrace !== null && r.w4Retrace !== null) {
    let alt = clamp(Math.abs(r.w2Retrace - r.w4Retrace) / 0.3, 0, 1);
    if (durations && durations.length >= 4 && durations[1] > 0 && durations[3] > 0) {
      const ratio = Math.max(durations[1], durations[3]) / Math.min(durations[1], durations[3]);
      alt = 0.6 * alt + 0.4 * clamp((ratio - 1) / 0.6, 0, 1);
    }
    add(0.15, alt);
  }
  return wsum > 0 ? acc / wsum : 0;
}

/**
 * Enumerate impulse candidates (complete 6-pivot and in-progress 2..5-pivot
 * counts) in both directions. Hard rules are enforced; fib guidelines scored.
 */
export function countImpulse(pivots: Pivot[], opts: CountOptions = {}): ImpulseCandidate[] {
  const out: ImpulseCandidate[] = [];
  const n = pivots.length;
  const lastIdx = n - 1;
  for (const s of [1, -1] as const) {
    const q = (p: Pivot) => s * p.price;
    const dirName: Direction = s === 1 ? "bullish" : "bearish";
    for (let start = 0; start < n - 1; start++) {
      if (!pivotIsQLow(pivots[start], s)) continue;
      for (let count = 6; count >= 2; count--) {
        const end = start + count - 1;
        if (end > lastIdx) continue;
        const endsAtLatest = end === lastIdx;
        // Partial counts are only meaningful at the right edge.
        if (count < 6 && !endsAtLatest) continue;
        const w = pivots.slice(start, end + 1);
        const p = w.map(q);
        const [p0, p1, p2, p3, p4, p5] = [p[0], p[1], p[2], p[3], p[4], p[5]];

        if (!(p1 > p0)) continue; // wave 1 must advance
        const len1 = p1 - p0;
        let truncated = false;
        let diagonal = false;

        if (count >= 3) {
          if (!(p2 > p0)) continue; // Rule: wave 2 never retraces > 100% of wave 1
          if (!(p2 < p1)) continue;
        }
        if (count >= 4) {
          if (!(p3 > p1)) continue; // wave 3 must exceed the end of wave 1
        }
        if (count >= 5) {
          if (!(p4 < p3)) continue;
          if (!(p4 > p1)) {
            // Rule: wave 4 does not enter wave-1 territory (diagonals excepted)
            if (!opts.allowDiagonal) continue;
            diagonal = true;
            if (!(p4 > p2)) continue; // even diagonals hold wave 2 low
          }
        }
        if (count === 6) {
          if (!(p5 > p4)) continue;
          const len3 = p3 - p2;
          const len5 = p5 - p4;
          if (len3 < len1 && len3 < len5) continue; // Rule: wave 3 never shortest
          if (!(p5 > p3)) {
            if (!opts.allowTruncation) continue;
            truncated = true;
          }
        }

        // In-progress consistency with the latest price.
        const lp = opts.lastPrice;
        let position: ImpulsePosition = "historical";
        if (endsAtLatest) {
          if (count === 2) {
            position = "wave2_pullback";
            if (lp !== undefined && !(s * lp > p0 && s * lp < p1)) continue;
          } else if (count === 3) {
            position = "wave3_progress";
            if (lp !== undefined && !(s * lp > p2)) continue;
          } else if (count === 4) {
            position = "wave4_pullback";
            if (lp !== undefined && (!(s * lp < p3) || (!opts.allowDiagonal && !(s * lp > p1)))) continue;
          } else if (count === 5) {
            position = "wave5_progress";
            if (lp !== undefined && !(s * lp > p4)) continue;
          } else {
            position = "wave5_complete";
          }
        }

        const ratios: ImpulseCandidate["ratios"] = {
          w2Retrace: count >= 3 ? (p1 - p2) / len1 : null,
          w3Ext: count >= 4 ? (p3 - p2) / len1 : null,
          w4Retrace: count >= 5 ? (p3 - p4) / (p3 - p2) : null,
          w5ToW1: count >= 6 ? (p5 - p4) / len1 : null,
          w5ToW13: count >= 6 ? (p5 - p4) / (p3 - p0) : null,
        };
        const durations: number[] = [];
        for (let i = 0; i + 1 < w.length; i++) durations.push(w[i + 1].index - w[i].index);
        let fit = impulseFit(ratios, durations);
        if (truncated) fit *= 0.7;
        if (diagonal) fit *= 0.8;

        const labels: WaveLabel[] = ["1", "2", "3", "4", "5"];
        out.push({
          kind: "impulse",
          direction: dirName,
          pivots: w,
          waves: segs(w, labels),
          pivotCount: count,
          complete: count === 6,
          fit,
          ratios,
          position,
          positionLabel: impulsePositionLabel(position, dirName),
          truncated,
          diagonal,
          endsAtLatest,
        });
      }
    }
  }
  return out.sort((a, b) => b.pivotCount - a.pivotCount || b.fit - a.fit);
}

function impulsePositionLabel(pos: ImpulsePosition, dir: Direction): string {
  const trend = dir === "bullish" ? "up" : "down";
  switch (pos) {
    case "wave2_pullback":
      return `wave 2 pullback in a ${trend} impulse`;
    case "wave3_progress":
      return `in wave 3 (${trend})`;
    case "wave4_pullback":
      return `wave 4 pullback in a ${trend} impulse`;
    case "wave5_progress":
      return `in wave 5 (${trend})`;
    case "wave5_complete":
      return `wave 5 likely complete (${trend} impulse finished)`;
    default:
      return `historical ${trend} impulse`;
  }
}

// ── 3. Correction counting ───────────────────────────────────────────────────

function correctionFit(bRetrace: number | null, cToA: number | null, type: CorrectionType, durations: number[]): number {
  let wsum = 0;
  let acc = 0;
  const add = (w: number, v: number | null) => {
    if (v === null) return;
    wsum += w;
    acc += w * v;
  };
  if (bRetrace !== null) {
    const zz = Math.max(inBand(bRetrace, 0.5, 0.786, 0.2), 0.6 * inBand(bRetrace, 0.382, 0.9, 0.1));
    const flat = inBand(bRetrace, 0.9, 1.1, 0.15);
    const exp = inBand(bRetrace, 1.05, 1.382, 0.2);
    add(0.45, type === "zigzag" ? zz : type === "flat" ? flat : exp);
  }
  if (cToA !== null) {
    add(0.4, Math.max(nearAny(cToA, [1.0, 1.618], 0.35), 0.7 * near(cToA, 0.618, 0.2)));
  }
  // Time: wave B rarely much longer than A and C combined.
  if (durations.length >= 3) {
    const tb = durations[1];
    const tac = durations[0] + durations[2];
    add(0.15, tac > 0 ? clamp(1.5 - tb / tac, 0, 1) : 0.5);
  }
  return wsum > 0 ? acc / wsum : 0;
}

/**
 * Enumerate A-B-C candidates (complete 4-pivot and in-progress 2..3-pivot).
 * `direction` is the direction of the corrective move (bearish = ABC down,
 * which corrects a prior bull impulse).
 */
export function countCorrection(pivots: Pivot[], opts: CountOptions = {}): CorrectionCandidate[] {
  const out: CorrectionCandidate[] = [];
  const n = pivots.length;
  const lastIdx = n - 1;
  for (const s of [1, -1] as const) {
    // Normalise so the correction moves DOWN in q-space: s = 1 => down (bearish) correction, q = price.
    const qq = (p: Pivot) => (s === 1 ? p.price : -p.price);
    const qv = (v: number) => (s === 1 ? v : -v);
    const dirName: Direction = s === 1 ? "bearish" : "bullish";
    for (let start = 0; start < n - 1; start++) {
      // Correction starts at a q-high (price high for down correction).
      if (!pivotIsQLow(pivots[start], (s === 1 ? -1 : 1) as 1 | -1)) continue;
      for (let count = 4; count >= 2; count--) {
        const end = start + count - 1;
        if (end > lastIdx) continue;
        const endsAtLatest = end === lastIdx;
        if (count < 4 && !endsAtLatest) continue;
        const w = pivots.slice(start, end + 1);
        const p = w.map(qq);
        const [p0, pA, pB, pC] = [p[0], p[1], p[2], p[3]];
        if (!(pA < p0)) continue;
        const A = p0 - pA;
        let bRetrace: number | null = null;
        let cToA: number | null = null;
        let type: CorrectionType = "zigzag";
        if (count >= 3) {
          if (!(pB > pA)) continue;
          bRetrace = (pB - pA) / A;
          if (bRetrace > 1.382) continue; // B beyond expanded-flat territory: not a correction of A
          type = bRetrace > 1.0 ? "expanded_flat" : bRetrace > 0.786 ? "flat" : "zigzag";
        }
        if (count === 4) {
          if (!(pC < pB)) continue;
          if (!(pC < pA)) continue; // C must exceed A's end (running flats excluded)
          cToA = (pB - pC) / A;
          if (cToA > 3.0) continue; // too impulsive for a C wave
        }
        const lp = opts.lastPrice;
        let position: CorrectionPosition = "historical";
        if (endsAtLatest) {
          if (count === 2) {
            position = "waveB_progress";
            if (lp !== undefined && !(qv(lp) > pA)) continue;
          } else if (count === 3) {
            position = "waveC_progress";
            if (lp !== undefined && !(qv(lp) < pB)) continue;
          } else {
            position = "waveC_complete";
          }
        }
        const durations: number[] = [];
        for (let i = 0; i + 1 < w.length; i++) durations.push(w[i + 1].index - w[i].index);
        const fit = correctionFit(bRetrace, cToA, type, durations);
        const toPrice = (v: number) => (s === 1 ? v : -v);
        const cTargets: FibTarget[] =
          count >= 3
            ? [
                { label: "C = 0.618 A", price: toPrice(pB - 0.618 * A) },
                { label: "C = A", price: toPrice(pB - A) },
                { label: "C = 1.618 A", price: toPrice(pB - 1.618 * A) },
              ]
            : [];
        out.push({
          kind: "correction",
          direction: dirName,
          type,
          pivots: w,
          waves: segs(w, ["A", "B", "C"]),
          pivotCount: count,
          complete: count === 4,
          fit,
          ratios: { bRetrace, cToA },
          cTargets,
          position,
          positionLabel: correctionPositionLabel(position, dirName, type),
          endsAtLatest,
        });
      }
    }
  }
  return out.sort((a, b) => b.pivotCount - a.pivotCount || b.fit - a.fit);
}

function correctionPositionLabel(pos: CorrectionPosition, dir: Direction, type: CorrectionType): string {
  const move = dir === "bearish" ? "down" : "up";
  const t = type.replace("_", " ");
  switch (pos) {
    case "waveB_progress":
      return `wave B bounce inside an ABC ${move} correction`;
    case "waveC_progress":
      return `in wave C of an ABC ${t} ${move}`;
    case "waveC_complete":
      return `wave C likely complete (ABC ${t} ${move} finished)`;
    default:
      return `historical ABC ${move}`;
  }
}

// ── 5. analyzeElliott ────────────────────────────────────────────────────────

function fmt(v: number): string {
  const a = Math.abs(v);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
  return v.toFixed(d);
}

function emptyResult(pivots: Pivot[], pending: Pivot | null, note: string): ElliottResult {
  return {
    pattern: null,
    direction: null,
    currentWave: "none",
    confidence: 0,
    score: 0,
    targets: { nextWaveTarget: null, invalidation: null, fibTargets: [] },
    notes: [note],
    waves: [],
    meta: { pivots, pending, provisional: false, ewoDivergence: null, fit: 0, alternates: [] },
  };
}

interface Scored {
  score: number; // signed
  confidence01: number;
  quality: number; // for ranking
  currentWave: string;
  targets: ElliottTargets;
  notes: string[];
  waves: WaveSegment[];
  pattern: "impulse" | "correction";
  direction: Direction;
  fit: number;
  div: EwoDivergence | null;
  correctionType?: CorrectionType;
  position: string;
}

function scoreImpulse(c: ImpulseCandidate, lastPrice: number, ewo: number[], provisional: boolean): Scored {
  const s: 1 | -1 = c.direction === "bullish" ? 1 : -1;
  const q = c.pivots.map((p) => s * p.price);
  const lp = s * lastPrice;
  const toPrice = (v: number) => s * v;
  const [p0, p1, p2, p3, p4, p5] = [q[0], q[1], q[2], q[3], q[4], q[5]];
  const len1 = p1 - p0;
  const trendWord = s === 1 ? "up" : "down";
  const withTrend = s === 1 ? "long" : "short";
  const against = s === 1 ? "short" : "long";
  const notes: string[] = [];
  const fib: FibTarget[] = [];
  let next: number | null = null;
  let inv: number | null = null;
  let mag = 0; // positive = with the impulse trend; sign applied later
  let quality = 0;
  let div: EwoDivergence | null = null;
  let confBase = 0;

  switch (c.position) {
    case "wave5_complete": {
      const w3 = { from: c.pivots[2].index, to: c.pivots[3].index, price: p3 };
      const w5 = { from: c.pivots[4].index, to: c.pivots[5].index, price: p5 };
      // Divergence computed in q-space: pass sign-normalised prices with s = 1.
      div = ewoDivergenceBetween(ewo.map((v) => s * v), 1, w3, w5);
      // Convert back to the real direction label.
      if (div.type) div = { ...div, type: s === 1 ? "bearish" : "bullish", ewoA: div.ewoA === null ? null : s * div.ewoA, ewoB: div.ewoB === null ? null : s * div.ewoB, priceA: toPrice(p3), priceB: toPrice(p5) };
      mag = -(55 + 30 * c.fit + 15 * div.strength);
      quality = 1.0;
      confBase = 0.3 + 0.4 * c.fit + 0.2 * div.strength + 0.1;
      const whole = p5 - p0;
      fib.push({ label: "38.2% retrace of 1-5", price: toPrice(p5 - 0.382 * whole) });
      fib.push({ label: "wave 4 extreme", price: toPrice(p4) });
      fib.push({ label: "50% retrace of 1-5", price: toPrice(p5 - 0.5 * whole) });
      fib.push({ label: "61.8% retrace of 1-5", price: toPrice(p5 - 0.618 * whole) });
      next = toPrice(p4);
      inv = toPrice(p5);
      notes.push(`Five-wave ${trendWord} impulse looks complete at ${fmt(toPrice(p5))}. Expect an ABC correction; first target is the wave 4 extreme at ${fmt(toPrice(p4))}.`);
      if (div.strength > 0) notes.push(`EWO divergence: wave 5 pushed to a new extreme on weaker momentum than wave 3 (${Math.round(div.strength * 100)}% weaker). Classic ${against} setup.`);
      else notes.push(`No EWO divergence between waves 3 and 5; momentum still firm, so size the ${against} smaller.`);
      if (c.truncated) notes.push(`Truncated fifth: wave 5 failed to exceed wave 3. That is unusually weak for the ${trendWord} trend and favours a sharp reversal.`);
      notes.push(`A move beyond ${fmt(toPrice(p5))} invalidates the completed count (wave 5 still extending).`);
      break;
    }
    case "wave5_progress": {
      const t618 = p4 + 0.618 * len1;
      const t100 = p4 + len1;
      const t1618 = p4 + 1.618 * len1;
      const t13 = p4 + 0.618 * (p3 - p0);
      fib.push({ label: "W5 = 0.618 x W1", price: toPrice(t618) });
      fib.push({ label: "W5 = W1", price: toPrice(t100) });
      fib.push({ label: "W5 = 0.618 x (W1..W3)", price: toPrice(t13) });
      fib.push({ label: "W5 = 1.618 x W1", price: toPrice(t1618) });
      next = toPrice(t100);
      inv = toPrice(p4);
      // Maturity: how far wave 5 has travelled relative to the equality target.
      const travelled = (lp - p4) / len1;
      const w3 = { from: c.pivots[2].index, to: c.pivots[3].index, price: p3 };
      const w5 = { from: c.pivots[4].index, to: c.pivots[4].index + Math.max(1, Math.round((c.pivots[4].index - c.pivots[3].index) / 2)), price: lp };
      const d = ewoDivergenceBetween(ewo.map((v) => s * v), 1, w3, { ...w5, to: ewo.length - 1 });
      if (lp > p3 && d.strength > 0.15 && travelled >= 0.618) {
        div = { ...d, type: s === 1 ? "bearish" : "bullish", priceA: toPrice(p3), priceB: lastPrice, ewoA: d.ewoA === null ? null : s * d.ewoA, ewoB: d.ewoB === null ? null : s * d.ewoB };
        mag = -(20 + 20 * d.strength + 10 * c.fit);
        notes.push(`Wave 5 is maturing: price is beyond wave 3 at ${fmt(toPrice(p3))} with EWO divergence. Start looking for the ${against} rather than chasing.`);
      } else {
        mag = 20 + 25 * c.fit * clamp(1 - travelled, 0, 1);
        notes.push(`Wave 4 held at ${fmt(toPrice(p4))}; wave 5 ${trendWord} is in progress. Equality target (W5 = W1) at ${fmt(toPrice(t100))}.`);
      }
      quality = 0.7;
      confBase = 0.25 + 0.4 * c.fit + 0.1;
      notes.push(`Below ${fmt(toPrice(p4))} wave 4 is still unfolding and the wave 5 read is off.`);
      break;
    }
    case "wave4_pullback": {
      const len3 = p3 - p2;
      const r = (p3 - lp) / len3;
      fib.push({ label: "W4 = 23.6% of W3", price: toPrice(p3 - 0.236 * len3) });
      fib.push({ label: "W4 = 38.2% of W3", price: toPrice(p3 - 0.382 * len3) });
      fib.push({ label: "W4 = 50% of W3", price: toPrice(p3 - 0.5 * len3) });
      fib.push({ label: "wave 1 extreme (overlap limit)", price: toPrice(p1) });
      next = toPrice(p3 - 0.382 * len3);
      inv = toPrice(p1);
      const fit4 = Math.max(near(r, 0.382, 0.25), 0.6 * inBand(r, 0.236, 0.5, 0.15));
      mag = 15 + 30 * fit4 + 10 * c.fit;
      if (r > 0.618) mag *= 0.6;
      quality = 0.5;
      confBase = 0.2 + 0.35 * c.fit + 0.2 * fit4;
      notes.push(`Wave 3 ${trendWord} ran ${fmt(Math.abs(len3))} points; the current pullback has retraced ${Math.round(r * 100)}% of it. Wave 4 typically ends near 38.2% (${fmt(toPrice(p3 - 0.382 * len3))}).`);
      notes.push(`Wave 4 must not enter wave 1 territory: ${fmt(toPrice(p1))} is the hard stop for the ${withTrend} idea.`);
      break;
    }
    case "wave3_progress": {
      fib.push({ label: "W3 = W1", price: toPrice(p2 + len1) });
      fib.push({ label: "W3 = 1.618 x W1", price: toPrice(p2 + 1.618 * len1) });
      fib.push({ label: "W3 = 2.618 x W1", price: toPrice(p2 + 2.618 * len1) });
      next = toPrice(p2 + 1.618 * len1);
      inv = toPrice(p0);
      const progress = (lp - p2) / len1;
      mag = 40 + 35 * c.fit * clamp(1 - progress / 1.618, 0, 1);
      quality = 0.45;
      confBase = 0.2 + 0.35 * c.fit;
      notes.push(`Wave 2 held above the origin and ended at ${fmt(toPrice(p2))} (${Math.round((c.ratios.w2Retrace ?? 0) * 100)}% retrace). Wave 3 ${trendWord} is the strongest leg; target 1.618 x wave 1 at ${fmt(toPrice(p2 + 1.618 * len1))}.`);
      notes.push(`A move beyond the wave 1 origin at ${fmt(toPrice(p0))} invalidates the impulse count.`);
      break;
    }
    case "wave2_pullback": {
      const r = (p1 - lp) / len1;
      fib.push({ label: "W2 = 50% of W1", price: toPrice(p1 - 0.5 * len1) });
      fib.push({ label: "W2 = 61.8% of W1", price: toPrice(p1 - 0.618 * len1) });
      fib.push({ label: "W2 = 78.6% of W1", price: toPrice(p1 - 0.786 * len1) });
      next = toPrice(p1 - 0.618 * len1);
      inv = toPrice(p0);
      const fit2 = Math.max(inBand(r, 0.5, 0.618, 0.25), 0.6 * inBand(r, 0.382, 0.786, 0.15));
      mag = 10 + 30 * fit2;
      quality = 0.3;
      confBase = 0.15 + 0.3 * fit2;
      notes.push(`Possible wave 2 pullback after a wave 1 ${trendWord}: retraced ${Math.round(r * 100)}% so far. Ideal entry zone is 50-61.8% (${fmt(toPrice(p1 - 0.618 * len1))}).`);
      notes.push(`If price retraces more than 100% of wave 1 (${fmt(toPrice(p0))}) this is not an impulse.`);
      break;
    }
    default: {
      mag = 0;
      quality = 0.1;
      confBase = 0.1;
    }
  }

  const confidence01 = clamp(confBase, 0, 1) * (provisional ? 0.85 : 1);
  const score = s * mag * (provisional ? 0.85 : 1);
  if (provisional) notes.push("The latest pivot is provisional (reversal not yet fully confirmed by the zigzag).");
  if (c.diagonal) notes.push("Count relies on a diagonal (wave 4 overlaps wave 1); treat as lower reliability.");

  return {
    score,
    confidence01,
    quality,
    currentWave: c.positionLabel,
    targets: { nextWaveTarget: next, invalidation: inv, fibTargets: fib },
    notes,
    waves: c.waves,
    pattern: "impulse",
    direction: c.direction,
    fit: c.fit,
    div,
    position: c.position,
  };
}

function scoreCorrection(
  c: CorrectionCandidate,
  lastPrice: number,
  provisional: boolean,
  priorImpulse: ImpulseCandidate | null,
): Scored {
  // s = 1 for a down correction (q = price), -1 for an up correction.
  const s: 1 | -1 = c.direction === "bearish" ? 1 : -1;
  const q = c.pivots.map((p) => s * p.price);
  const lp = s * lastPrice;
  const toPrice = (v: number) => s * v;
  const [p0, pA, pB, pC] = [q[0], q[1], q[2], q[3]];
  const A = p0 - pA;
  const moveWord = s === 1 ? "down" : "up";
  const resume = s === 1 ? "long" : "short"; // after an ABC down, the prior uptrend resumes
  const notes: string[] = [];
  const fib: FibTarget[] = [];
  let next: number | null = null;
  let inv: number | null = null;
  let mag = 0; // positive = in the direction of trend resumption (opposite to the correction)
  let quality = 0;
  let confBase = 0;
  const ctx = priorImpulse !== null;
  const ctxBonus = ctx ? 0.15 : 0;
  const typeWord = c.type.replace("_", " ");

  // Prior wave-4 extreme (classic terminal zone for corrections).
  const w4Zone: number | null = priorImpulse ? s * priorImpulse.pivots[4].price : null;

  switch (c.position) {
    case "waveC_complete": {
      let zoneFit = 0;
      if (w4Zone !== null && A > 0) zoneFit = near(pC, w4Zone, 0.5 * A);
      mag = 50 + 35 * c.fit + 15 * zoneFit;
      quality = ctx ? 0.9 : 0.45; // without a preceding impulse a three-swing move is read as trend continuation first
      confBase = 0.25 + 0.4 * c.fit + 0.1 + ctxBonus + 0.1 * zoneFit;
      fib.push({ label: "wave B extreme", price: toPrice(pB) });
      fib.push({ label: "correction origin (wave A start)", price: toPrice(p0) });
      fib.push({ label: "1.618 x (A..C) from C", price: toPrice(pC + 1.618 * (p0 - pC)) });
      next = toPrice(p0);
      inv = toPrice(pC);
      notes.push(`ABC ${typeWord} ${moveWord} looks complete at ${fmt(toPrice(pC))}: C = ${(c.ratios.cToA ?? 0).toFixed(2)} x A, B retraced ${Math.round((c.ratios.bRetrace ?? 0) * 100)}% of A.`);
      notes.push(ctx ? `It corrects a completed ${priorImpulse!.direction === "bullish" ? "up" : "down"} impulse, so this is a trend-resumption ${resume}; first target is the wave B extreme at ${fmt(toPrice(pB))}, then the correction origin at ${fmt(toPrice(p0))}.` : `No completed impulse precedes this three-wave move, so treat the ${resume} as counter-trend until price reclaims ${fmt(toPrice(pB))}.`);
      if (zoneFit > 0.5) notes.push("Wave C ended inside the prior wave 4 zone, the textbook place for a correction to finish.");
      notes.push(`Below ${fmt(toPrice(pC))} wave C is still extending; that is the stop for the ${resume}.`);
      break;
    }
    case "waveC_progress": {
      const tA = pB - A;
      const t1618 = pB - 1.618 * A;
      const t618 = pB - 0.618 * A;
      fib.push({ label: "C = 0.618 A", price: toPrice(t618) });
      fib.push({ label: "C = A", price: toPrice(tA) });
      fib.push({ label: "C = 1.618 A", price: toPrice(t1618) });
      if (w4Zone !== null) fib.push({ label: "prior wave 4 extreme", price: toPrice(w4Zone) });
      next = toPrice(tA);
      inv = toPrice(pB);
      const prog = (pB - lp) / A; // how much of A the C leg has covered
      if (prog >= 1.618) {
        mag = 25 + 15 * c.fit;
        notes.push(`Wave C ${moveWord} has stretched past 1.618 x A (${fmt(toPrice(t1618))}). The correction is over-extended; look for the ${resume} reversal.`);
      } else if (prog >= 0.9) {
        mag = 10 * c.fit;
        notes.push(`Wave C ${moveWord} is at the C = A target zone (${fmt(toPrice(tA))}). Neutral: wait for a pivot to confirm completion.`);
      } else {
        mag = -(15 + 20 * c.fit * clamp(1 - prog, 0, 1));
        notes.push(`Wave C ${moveWord} is under way after a wave B that retraced ${Math.round((c.ratios.bRetrace ?? 0) * 100)}% of A. Minimum target C = A at ${fmt(toPrice(tA))}, extended target ${fmt(toPrice(t1618))}.`);
      }
      quality = ctx ? 0.65 : 0.4;
      confBase = 0.2 + 0.35 * c.fit + ctxBonus;
      notes.push(`Beyond the wave B extreme at ${fmt(toPrice(pB))} the C-wave read fails.`);
      break;
    }
    case "waveB_progress": {
      const r = (lp - pA) / A;
      fib.push({ label: "B = 50% of A", price: toPrice(pA + 0.5 * A) });
      fib.push({ label: "B = 61.8% of A", price: toPrice(pA + 0.618 * A) });
      fib.push({ label: "B = 78.6% of A", price: toPrice(pA + 0.786 * A) });
      next = toPrice(pA + 0.618 * A);
      inv = toPrice(p0 + 0.382 * A); // expanded flats allow B up to 1.382 x A
      const fitB = Math.max(inBand(r, 0.5, 0.786, 0.2), 0.6 * inBand(r, 0.382, 1.0, 0.15));
      mag = -(20 + 25 * fitB);
      quality = ctx ? 0.5 : 0.28;
      confBase = 0.15 + 0.25 * fitB + ctxBonus;
      notes.push(`Wave A ${moveWord} of ${fmt(Math.abs(A))} points; the bounce has retraced ${Math.round(r * 100)}% so far. Wave B usually stalls between 50% and 78.6% (${fmt(toPrice(pA + 0.618 * A))}) before wave C ${moveWord}.`);
      notes.push(`A B wave beyond ${fmt(toPrice(p0 + 0.382 * A))} is no longer a correction of this A leg.`);
      break;
    }
    default: {
      quality = 0.1;
      confBase = 0.1;
    }
  }

  const confidence01 = clamp(confBase, 0, 1) * (provisional ? 0.85 : 1);
  const score = s * mag * (provisional ? 0.85 : 1);
  if (provisional) notes.push("The latest pivot is provisional (reversal not yet fully confirmed by the zigzag).");

  return {
    score,
    confidence01,
    quality,
    currentWave: c.positionLabel,
    targets: { nextWaveTarget: next, invalidation: inv, fibTargets: fib },
    notes,
    waves: c.waves,
    pattern: "correction",
    direction: c.direction,
    fit: c.fit,
    div: null,
    correctionType: c.type,
    position: c.position,
  };
}

function rankValue(sc: Scored): number {
  return sc.quality * (0.5 + 0.5 * sc.fit);
}

/** Find a completed impulse (opposite direction) whose wave-5 pivot is the correction's first pivot. */
function findPriorImpulse(impulses: ImpulseCandidate[], corr: CorrectionCandidate): ImpulseCandidate | null {
  const startIdx = corr.pivots[0].index;
  let best: ImpulseCandidate | null = null;
  for (const im of impulses) {
    if (!im.complete) continue;
    if (im.direction === corr.direction) continue;
    if (im.pivots[5].index !== startIdx) continue;
    if (!best || im.fit > best.fit) best = im;
  }
  return best;
}

export function analyzeElliott(candles: Candle[], opts: ElliottOptions = {}): ElliottResult {
  if (candles.length < 40) return emptyResult([], null, "Not enough candles for an Elliott count (need at least 40).");
  const zz = zigzagState(candles, opts.zigzag);
  const lastPrice = candles[candles.length - 1].close;
  const lastIndex = candles.length - 1;
  const ewo = ewoSeries(candles, opts.ewoFast ?? 5, opts.ewoSlow ?? 35);
  const usePending = opts.usePending ?? true;
  const minRev = opts.pendingMinReversal ?? 0.5;

  const pivotSets: { pivots: Pivot[]; provisional: boolean }[] = [{ pivots: zz.pivots, provisional: false }];
  if (usePending && zz.pending && zz.pendingReversal >= minRev) {
    pivotSets.push({ pivots: [...zz.pivots, zz.pending], provisional: true });
  }

  const scored: Scored[] = [];
  const countOpts: CountOptions = { allowDiagonal: opts.allowDiagonal ?? false, allowTruncation: opts.allowTruncation ?? false, lastPrice, lastIndex };
  for (const set of pivotSets) {
    if (set.pivots.length < 2) continue;
    const impulses = countImpulse(set.pivots, countOpts);
    const corrections = countCorrection(set.pivots, countOpts);
    for (const im of impulses) {
      if (!im.endsAtLatest) continue;
      scored.push(scoreImpulse(im, lastPrice, ewo, set.provisional));
    }
    for (const co of corrections) {
      if (!co.endsAtLatest) continue;
      scored.push(scoreCorrection(co, lastPrice, set.provisional, findPriorImpulse(impulses, co)));
    }
  }

  if (scored.length === 0) {
    return emptyResult(zz.pivots, zz.pending, `No valid Elliott structure at the right edge (${zz.pivots.length} pivots found).`);
  }

  scored.sort((a, b) => rankValue(b) - rankValue(a) || Math.abs(b.score) - Math.abs(a.score));
  const best = scored[0];
  const alternates = scored.slice(1, 4).map((sc) => ({ pattern: sc.pattern, direction: sc.direction, position: sc.position, fit: sc.fit }));

  // Agreement bonus: other right-edge readings pointing the same way lift confidence slightly.
  let agree = 0;
  let disagree = 0;
  for (const sc of scored.slice(1)) {
    if (Math.sign(sc.score) === Math.sign(best.score) && sc.score !== 0) agree++;
    else if (sc.score !== 0) disagree++;
  }
  const agreeAdj = clamp(0.05 * (agree - disagree), -0.15, 0.15);
  const confidence = Math.round(clamp(best.confidence01 + agreeAdj, 0, 1) * 100);
  const score = clamp(best.score, -100, 100);

  const notes = [...best.notes];
  if (disagree > agree && disagree > 0) notes.push("Alternative counts at the right edge disagree with this read; confidence trimmed.");

  return {
    pattern: best.pattern,
    direction: best.direction,
    currentWave: best.currentWave,
    confidence,
    score,
    targets: best.targets,
    notes,
    waves: best.waves,
    meta: {
      pivots: zz.pivots,
      pending: zz.pending,
      provisional: best.notes.some((n) => n.startsWith("The latest pivot is provisional")),
      ewoDivergence: best.div,
      fit: best.fit,
      correctionType: best.correctionType,
      alternates,
    },
  };
}

// ── 6. Multi-timeframe ───────────────────────────────────────────────────────

export interface ElliottMTFConsensus {
  score: number;
  direction: Direction | null;
  confidence: number;
  /** Fraction (0..1) of timeframes with a non-zero score agreeing with the consensus sign. */
  agreement: number;
  notes: string[];
}

export interface ElliottMTFResult {
  perTF: Record<string, ElliottResult>;
  consensus: ElliottMTFConsensus;
}

/** Timeframe label -> minutes, for weighting (higher TF = heavier). */
function tfMinutes(tf: string): number {
  const m = /^(\d+)\s*([mhdwM])$/.exec(tf.trim());
  if (!m) return 60;
  const v = parseInt(m[1], 10);
  switch (m[2]) {
    case "m":
      return v;
    case "h":
      return v * 60;
    case "d":
      return v * 1440;
    case "w":
      return v * 10080;
    case "M":
      return v * 43200;
    default:
      return 60;
  }
}

export function analyzeElliottMTF(
  series: Record<string, Candle[]>,
  opts: ElliottOptions & { weights?: Record<string, number> } = {},
): ElliottMTFResult {
  const perTF: Record<string, ElliottResult> = {};
  let wsum = 0;
  let acc = 0;
  let confAcc = 0;
  let pos = 0;
  let neg = 0;
  const notes: string[] = [];
  for (const tf of Object.keys(series)) {
    const r = analyzeElliott(series[tf], opts);
    perTF[tf] = r;
    const w = opts.weights?.[tf] ?? Math.log2(1 + tfMinutes(tf) / 15); // 15m=1, 1h~2.3, 4h~4.1, 1d~6.6
    const cw = w * (0.3 + 0.7 * (r.confidence / 100));
    wsum += cw;
    acc += cw * r.score;
    confAcc += cw * r.confidence;
    if (r.score > 0) pos++;
    else if (r.score < 0) neg++;
    if (r.pattern) notes.push(`${tf}: ${r.currentWave} (score ${Math.round(r.score)}, conf ${r.confidence}).`);
  }
  const score = wsum > 0 ? acc / wsum : 0;
  const total = pos + neg;
  const agreement = total === 0 ? 0 : Math.max(pos, neg) / total;
  const direction: Direction | null = score > 0 ? "bullish" : score < 0 ? "bearish" : null;
  let confidence = wsum > 0 ? confAcc / wsum : 0;
  confidence = Math.round(confidence * (0.6 + 0.4 * agreement));
  if (total > 0 && agreement < 1) notes.push(`Timeframes disagree (${pos} bullish vs ${neg} bearish); consensus leans ${direction ?? "neutral"}.`);
  return { perTF, consensus: { score, direction, confidence, agreement, notes } };
}
