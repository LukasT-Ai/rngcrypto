/**
 * Short-side and symmetric technical indicators.
 *
 * Pure, dependency-free TypeScript. Every public indicator returns an
 * {@link IndicatorResult} with a `bias`, a `score` in [-100, 100]
 * (negative = bearish, positive = bullish) and human readable `notes`.
 *
 * SYMMETRY GUARANTEE
 * ------------------
 * All functions are translation and reflection invariant in price:
 * reflecting a candle series (p' = c - p, with highs and lows swapped)
 * negates every score exactly and swaps bullish/bearish bias. Directional
 * pattern detectors (double top, head and shoulders, rising wedge,
 * liquidity sweep of highs, buying climax) are implemented ONCE in the
 * bearish orientation and the bullish counterpart is computed by running
 * the same code on {@link mirrorCandles}. Tolerances are always expressed
 * in ATR units, never as a percentage of price, so symmetry holds exactly.
 *
 * Candle shape matches the signals engine (`parseKlines` in
 * src/app/api/signals/route.ts). Helper names are suffixed with `Series`
 * to avoid collisions with src/lib/ta/elliott.ts if a barrel is ever added.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Bias = "bullish" | "bearish" | "neutral";

export interface IndicatorResult {
  /** Stable machine name, e.g. "squeezeMomentum". */
  name: string;
  bias: Bias;
  /** -100 (max bearish) .. +100 (max bullish). 0 = no information. */
  score: number;
  notes: string[];
}

// ── Generic math helpers ────────────────────────────────────────────────────

export function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Sign-symmetric rounding (Math.round rounds -0.5 toward +inf, which breaks mirroring). */
export function sround(n: number, decimals = 1): number {
  const f = Math.pow(10, decimals);
  const r = Math.round(Math.abs(n) * f) / f;
  return n < 0 ? -r : r;
}

export function smaSeries(arr: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= period) sum -= arr[i - period];
    out.push(sum / Math.min(i + 1, period));
  }
  return out;
}

export function emaSeries(arr: number[], period: number): number[] {
  const out: number[] = [];
  if (arr.length === 0) return out;
  const k = 2 / (period + 1);
  out.push(arr[0]);
  for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k));
  return out;
}

/** Wilder smoothing (RMA), seeded with the first value. */
export function rmaSeries(arr: number[], period: number): number[] {
  const out: number[] = [];
  if (arr.length === 0) return out;
  const a = 1 / period;
  out.push(arr[0]);
  for (let i = 1; i < arr.length; i++) out.push(arr[i] * a + out[i - 1] * (1 - a));
  return out;
}

/** Population standard deviation over a rolling window (TradingView ta.stdev style). */
export function stdevSeries(arr: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const s = Math.max(0, i - period + 1);
    const n = i - s + 1;
    let mean = 0;
    for (let j = s; j <= i; j++) mean += arr[j];
    mean /= n;
    let v = 0;
    for (let j = s; j <= i; j++) v += (arr[j] - mean) * (arr[j] - mean);
    out.push(Math.sqrt(v / n));
  }
  return out;
}

export function highestSeries(arr: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    let m = -Infinity;
    for (let j = Math.max(0, i - period + 1); j <= i; j++) if (arr[j] > m) m = arr[j];
    out.push(m);
  }
  return out;
}

export function lowestSeries(arr: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    let m = Infinity;
    for (let j = Math.max(0, i - period + 1); j <= i; j++) if (arr[j] < m) m = arr[j];
    out.push(m);
  }
  return out;
}

export function trueRangeSeries(c: Candle[]): number[] {
  return c.map((k, i) => {
    if (i === 0) return k.high - k.low;
    const pc = c[i - 1].close;
    return Math.max(k.high - k.low, Math.abs(k.high - pc), Math.abs(k.low - pc));
  });
}

/** Wilder ATR. */
export function atrSeries(c: Candle[], period = 14): number[] {
  return rmaSeries(trueRangeSeries(c), period);
}

/** TradingView `ta.linreg(src, len, 0)`: value of the least-squares line at the current bar. */
export function linregSeries(arr: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const s = Math.max(0, i - period + 1);
    const n = i - s + 1;
    if (n < 2) {
      out.push(arr[i]);
      continue;
    }
    let sx = 0,
      sy = 0,
      sxy = 0,
      sxx = 0;
    for (let j = 0; j < n; j++) {
      const y = arr[s + j];
      sx += j;
      sy += y;
      sxy += j * y;
      sxx += j * j;
    }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    out.push(intercept + slope * (n - 1));
  }
  return out;
}

/** Least squares slope and intercept over (x, y) points. */
export function fitLine(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: ys[0] };
  let sx = 0,
    sy = 0,
    sxy = 0,
    sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxy += xs[i] * ys[i];
    sxx += xs[i] * xs[i];
  }
  const d = n * sxx - sx * sx;
  const slope = d === 0 ? 0 : (n * sxy - sx * sy) / d;
  return { slope, intercept: (sy - slope * sx) / n };
}

function typicalPrices(c: Candle[]): number[] {
  return c.map((k) => (k.high + k.low + k.close) / 3);
}

function closesOf(c: Candle[]): number[] {
  return c.map((k) => k.close);
}

function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

export function biasFromScore(score: number, threshold = 10): Bias {
  if (score > threshold) return "bullish";
  if (score < -threshold) return "bearish";
  return "neutral";
}

function result(name: string, score: number, notes: string[], threshold = 10): IndicatorResult {
  const s = sround(clampNum(score, -100, 100), 1);
  return { name, bias: biasFromScore(s, threshold), score: s, notes };
}

function neutral(name: string, note: string): IndicatorResult {
  return { name, bias: "neutral", score: 0, notes: [note] };
}

/**
 * Reflect a candle series vertically (price p -> axis - p, highs and lows swapped).
 * Negates every return, so an uptrend becomes the identical downtrend. Volume
 * and time are unchanged. Used to derive bullish detectors from bearish ones.
 */
export function mirrorCandles(c: Candle[]): Candle[] {
  if (c.length === 0) return [];
  let hi = -Infinity,
    lo = Infinity;
  for (const k of c) {
    if (k.high > hi) hi = k.high;
    if (k.low < lo) lo = k.low;
  }
  const axis = hi + lo; // keeps the mirrored series inside the same price range
  return c.map((k) => ({
    time: k.time,
    open: axis - k.open,
    high: axis - k.low,
    low: axis - k.high,
    close: axis - k.close,
    volume: k.volume,
  }));
}

function mirrorAxis(c: Candle[], m: Candle[]): number {
  return c.length ? m[0].open + c[0].open : 0;
}

/** Negate an IndicatorResult (used after running a bearish detector on mirrored data). */
function negate(r: IndicatorResult, name: string): IndicatorResult {
  return {
    name,
    score: -r.score,
    bias: r.bias === "bullish" ? "bearish" : r.bias === "bearish" ? "bullish" : "neutral",
    notes: r.notes.map(swapWords),
  };
}

const SWAP_PAIRS: [string, string][] = [
  ["bearish", "bullish"],
  ["top", "bottom"],
  ["peaks", "troughs"],
  ["high", "low"],
  ["highs", "lows"],
  ["higher", "lower"],
  ["above", "below"],
  ["rising", "falling"],
  ["buying", "selling"],
  ["upper", "lower"],
  ["apex", "apex"],
  ["head and shoulders", "inverse head and shoulders"],
];
const SWAP_MAP = new Map<string, string>();
for (const [a, b] of SWAP_PAIRS) {
  SWAP_MAP.set(a, b);
  SWAP_MAP.set(b, a);
}

/** Swap directional vocabulary in a note when mirroring. */
function swapWords(s: string): string {
  let out = s.replace(/inverse head and shoulders/gi, "\u0000IHS\u0000").replace(/head and shoulders/gi, "inverse head and shoulders").replace(/\u0000IHS\u0000/g, "head and shoulders");
  out = out.replace(/[A-Za-z]+/g, (w) => {
    const lw = w.toLowerCase();
    const r = SWAP_MAP.get(lw);
    if (!r || lw === "head" || lw === "and" || lw === "shoulders" || lw === "inverse") return w;
    return w[0] === w[0].toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r;
  });
  return out;
}

// ── Pivots ──────────────────────────────────────────────────────────────────

export interface TaPivot {
  index: number;
  price: number;
  type: "high" | "low";
}

/**
 * Fractal pivots. A pivot high at i has high[i] strictly greater than the
 * `left` bars before it and >= the `right` bars after it (same strictness
 * pattern for lows, so mirroring maps pivot highs exactly onto pivot lows).
 * A pivot is only "confirmed" `right` bars after it forms.
 */
export function findPivots(c: Candle[], left = 5, right = 5): TaPivot[] {
  const out: TaPivot[] = [];
  for (let i = left; i < c.length - right; i++) {
    let isHigh = true,
      isLow = true;
    for (let j = i - left; j < i && (isHigh || isLow); j++) {
      if (c[j].high >= c[i].high) isHigh = false;
      if (c[j].low <= c[i].low) isLow = false;
    }
    for (let j = i + 1; j <= i + right && (isHigh || isLow); j++) {
      if (c[j].high > c[i].high) isHigh = false;
      if (c[j].low < c[i].low) isLow = false;
    }
    if (isHigh) out.push({ index: i, price: c[i].high, type: "high" });
    if (isLow) out.push({ index: i, price: c[i].low, type: "low" });
  }
  return out;
}

// ── 1. LazyBear Squeeze Momentum ────────────────────────────────────────────

export interface SqueezeMomentumOpts {
  bbLength?: number;
  bbMult?: number;
  kcLength?: number;
  kcMult?: number;
}

export interface SqueezeMomentumResult extends IndicatorResult {
  momentum: number;
  /** momentum in ATR units */
  momentumAtr: number;
  squeezeOn: boolean;
  /** squeeze released on the latest bar */
  fired: boolean;
  color: "lime" | "green" | "red" | "maroon";
  barsInSqueeze: number;
}

/**
 * LazyBear "Squeeze Momentum Indicator" (TTM Squeeze derivative).
 * Source: https://www.tradingview.com/script/nqQ1DT5a-Squeeze-Momentum-Indicator-LazyBear/
 *
 * squeezeOn = lowerBB > lowerKC && upperBB < upperKC
 *   BB = SMA(close, 20) ± 2.0 * stdev(close, 20)
 *   KC = SMA(close, 20) ± 1.5 * SMA(trueRange, 20)
 * momentum = linreg(close - avg(avg(highest(high,20), lowest(low,20)), sma(close,20)), 20)
 * color: lime (mom>0 rising), green (mom>0 falling), red (mom<0 falling), maroon (mom<0 rising)
 *
 * Short use: squeeze fires (black -> gray) with a red histogram, or green -> red flip
 * at a trend high. Score = momentum / ATR scaled, boosted when the color confirms
 * acceleration and when the squeeze has just fired.
 */
export function squeezeMomentum(c: Candle[], opts: SqueezeMomentumOpts = {}): SqueezeMomentumResult {
  const { bbLength = 20, bbMult = 2.0, kcLength = 20, kcMult = 1.5 } = opts;
  const name = "squeezeMomentum";
  const base = { momentum: 0, momentumAtr: 0, squeezeOn: false, fired: false, color: "green" as const, barsInSqueeze: 0 };
  if (c.length < Math.max(bbLength, kcLength) + 2) return { ...neutral(name, "insufficient data"), ...base };
  const cl = closesOf(c);
  const basis = smaSeries(cl, bbLength);
  const dev = stdevSeries(cl, bbLength).map((d) => d * bbMult);
  const kcMa = smaSeries(cl, kcLength);
  const rangeMa = smaSeries(trueRangeSeries(c), kcLength);
  const hh = highestSeries(c.map((k) => k.high), kcLength);
  const ll = lowestSeries(c.map((k) => k.low), kcLength);
  const src = cl.map((v, i) => v - ((hh[i] + ll[i]) / 2 + kcMa[i]) / 2);
  const mom = linregSeries(src, kcLength);
  const a = atrSeries(c, 14);
  const sqz = cl.map(
    (_, i) => basis[i] - dev[i] > kcMa[i] - rangeMa[i] * kcMult && basis[i] + dev[i] < kcMa[i] + rangeMa[i] * kcMult
  );
  const n = c.length - 1;
  const m = mom[n];
  const prev = mom[n - 1];
  const color: SqueezeMomentumResult["color"] = m > 0 ? (m > prev ? "lime" : "green") : m < prev ? "red" : "maroon";
  const fired = !sqz[n] && sqz[n - 1];
  let barsInSqueeze = 0;
  for (let i = n; i >= 0 && sqz[i]; i--) barsInSqueeze++;
  const momAtr = a[n] > 0 ? m / a[n] : 0;
  let score = clampNum(momAtr * 30, -70, 70);
  const accelerating = color === "lime" || color === "red";
  if (accelerating) score += Math.sign(m) * 15;
  if (fired) score *= 1.3;
  if (sqz[n]) score *= 0.6; // momentum inside a squeeze is less reliable
  const notes: string[] = [`momentum ${sround(momAtr, 2)} ATR (${color}, ${accelerating ? "accelerating" : "decelerating"})`];
  if (sqz[n]) notes.push(`squeeze ON for ${barsInSqueeze} bars (breakout pending)`);
  if (fired) notes.push(`squeeze FIRED this bar ${m < 0 ? "to the downside" : "to the upside"}`);
  return { ...result(name, score, notes), momentum: m, momentumAtr: momAtr, squeezeOn: sqz[n], fired, color, barsInSqueeze };
}

// ── 2. Chandelier Exit ──────────────────────────────────────────────────────

export interface ChandelierResult extends IndicatorResult {
  longStop: number;
  shortStop: number;
  direction: 1 | -1;
  barsSinceFlip: number;
}

/**
 * Chandelier Exit (Chuck LeBeau; TradingView port by everget).
 * Source: https://www.tradingview.com/script/AqXxNS7j-Chandelier-Exit/
 *
 * longStop  = highest(high, 22) - 3.0 * ATR(22), ratcheted up while close stays above it
 * shortStop = lowest(low, 22)  + 3.0 * ATR(22), ratcheted down while close stays below it
 * direction flips to -1 when close < previous longStop (short signal), +1 when close > previous shortStop.
 *
 * Short use: the flip to -1 is the entry trigger; shortStop is the trailing stop.
 */
export function chandelierExit(c: Candle[], length = 22, mult = 3.0): ChandelierResult {
  const name = "chandelierExit";
  if (c.length < length + 2) return { ...neutral(name, "insufficient data"), longStop: 0, shortStop: 0, direction: 1, barsSinceFlip: 0 };
  const a = atrSeries(c, length);
  const hh = highestSeries(c.map((k) => k.high), length);
  const ll = lowestSeries(c.map((k) => k.low), length);
  const longStop: number[] = [];
  const shortStop: number[] = [];
  const dir: number[] = [];
  for (let i = 0; i < c.length; i++) {
    let ls = hh[i] - a[i] * mult;
    let ss = ll[i] + a[i] * mult;
    if (i > 0) {
      const lsPrev = longStop[i - 1];
      const ssPrev = shortStop[i - 1];
      if (c[i - 1].close > lsPrev) ls = Math.max(ls, lsPrev);
      if (c[i - 1].close < ssPrev) ss = Math.min(ss, ssPrev);
      const aboveShort = c[i].close > ssPrev;
      const belowLong = c[i].close < lsPrev;
      let d = dir[i - 1];
      if (aboveShort && belowLong) {
        // both stops violated in one bar (range > 2*mult*ATR): take the larger excursion (symmetric tie-break)
        const upEx = c[i].close - ssPrev;
        const dnEx = lsPrev - c[i].close;
        d = upEx > dnEx ? 1 : dnEx > upEx ? -1 : dir[i - 1];
      } else if (aboveShort) d = 1;
      else if (belowLong) d = -1;
      dir.push(d);
    } else {
      dir.push(c[i].close >= (c[i].high + c[i].low) / 2 ? 1 : -1);
    }
    longStop.push(ls);
    shortStop.push(ss);
  }
  const n = c.length - 1;
  const d = dir[n] as 1 | -1;
  let barsSinceFlip = 0;
  while (n - barsSinceFlip - 1 >= 0 && dir[n - barsSinceFlip - 1] === d) barsSinceFlip++;
  const stop = d === 1 ? longStop[n] : shortStop[n];
  const distAtr = a[n] > 0 ? Math.abs(c[n].close - stop) / a[n] : 0;
  let score = d * (40 + clampNum(distAtr * 8, 0, 25));
  if (barsSinceFlip <= 3) score += d * 20;
  const notes = [`direction ${d === 1 ? "LONG" : "SHORT"} for ${barsSinceFlip + 1} bars, stop ${sround(stop, 4)} (${sround(distAtr, 2)} ATR away)`];
  if (barsSinceFlip <= 3) notes.push(`fresh ${d === 1 ? "long" : "short"} flip (${barsSinceFlip} bars ago)`);
  return { ...result(name, score, notes), longStop: longStop[n], shortStop: shortStop[n], direction: d, barsSinceFlip };
}

// ── 3. Parabolic SAR ────────────────────────────────────────────────────────

export interface ParabolicSarResult extends IndicatorResult {
  sar: number;
  direction: 1 | -1;
  barsSinceFlip: number;
  /** acceleration factor currently in use */
  af: number;
}

/**
 * Parabolic SAR (J. Welles Wilder). Source: https://en.wikipedia.org/wiki/Parabolic_SAR
 *
 * SAR[t+1] = SAR[t] + AF * (EP - SAR[t]); AF starts 0.02, +0.02 on each new extreme, max 0.20.
 * Reversal when price crosses the SAR. Short use: dots flipping above price = short entry /
 * trailing stop. A high AF (>= 0.14) means the trend is mature and parabolic (exhaustion warning).
 */
export function parabolicSAR(c: Candle[], step = 0.02, maxAf = 0.2): ParabolicSarResult {
  const name = "parabolicSAR";
  if (c.length < 5) return { ...neutral(name, "insufficient data"), sar: 0, direction: 1, barsSinceFlip: 0, af: step };
  let up = c[1].close > c[0].close || (c[1].close === c[0].close && c[1].high - c[0].high > c[0].low - c[1].low);
  let sar = up ? c[0].low : c[0].high;
  let ep = up ? c[0].high : c[0].low;
  let af = step;
  const dirs: number[] = [up ? 1 : -1];
  const sars: number[] = [sar];
  for (let i = 1; i < c.length; i++) {
    let next = sar + af * (ep - sar);
    if (up) {
      next = Math.min(next, c[i - 1].low, i >= 2 ? c[i - 2].low : c[i - 1].low);
      if (c[i].low < next) {
        up = false;
        next = ep;
        ep = c[i].low;
        af = step;
      } else if (c[i].high > ep) {
        ep = c[i].high;
        af = Math.min(maxAf, af + step);
      }
    } else {
      next = Math.max(next, c[i - 1].high, i >= 2 ? c[i - 2].high : c[i - 1].high);
      if (c[i].high > next) {
        up = true;
        next = ep;
        ep = c[i].high;
        af = step;
      } else if (c[i].low < ep) {
        ep = c[i].low;
        af = Math.min(maxAf, af + step);
      }
    }
    sar = next;
    sars.push(sar);
    dirs.push(up ? 1 : -1);
  }
  const n = c.length - 1;
  const d = dirs[n] as 1 | -1;
  let barsSinceFlip = 0;
  while (n - barsSinceFlip - 1 >= 0 && dirs[n - barsSinceFlip - 1] === d) barsSinceFlip++;
  const a = last(atrSeries(c, 14));
  const distAtr = a > 0 ? Math.abs(c[n].close - sars[n]) / a : 0;
  let score = d * (35 + clampNum(distAtr * 8, 0, 25));
  if (barsSinceFlip <= 2) score += d * 25;
  const notes = [`SAR ${d === 1 ? "below" : "above"} price for ${barsSinceFlip + 1} bars, AF ${sround(af, 2)}`];
  if (barsSinceFlip <= 2) notes.push(`fresh SAR flip to ${d === 1 ? "long" : "short"}`);
  if (af >= 0.14) notes.push("acceleration factor high: parabolic / mature trend, exhaustion risk");
  return { ...result(name, score, notes), sar: sars[n], direction: d, barsSinceFlip, af };
}

// ── 4. Ichimoku ─────────────────────────────────────────────────────────────

export interface IchimokuResult extends IndicatorResult {
  tenkan: number;
  kijun: number;
  /** cloud under the current bar (computed 26 bars ago) */
  senkouA: number;
  senkouB: number;
  /** projected cloud (computed now, plotted 26 ahead) */
  futureSenkouA: number;
  futureSenkouB: number;
  chikou: number;
  pricePosition: "above" | "inside" | "below";
  tkCross: "bullish" | "bearish" | "none";
  tkCrossBarsAgo: number;
  kumoTwist: "bullish" | "bearish" | "none";
}

/**
 * Ichimoku Kinko Hyo (9 / 26 / 52 / displacement 26).
 * Source: https://school.stockcharts.com/doku.php?id=technical_indicators:ichimoku_cloud
 *
 * tenkan = (HH9 + LL9) / 2, kijun = (HH26 + LL26) / 2
 * senkouA = (tenkan + kijun) / 2 shifted +26, senkouB = (HH52 + LL52) / 2 shifted +26
 * chikou = close shifted -26
 *
 * Bearish grading: price below cloud (+ cloud red) is the strongest filter, bearish TK cross
 * below the cloud is a "strong" sell, bearish kumo twist ahead and chikou below price 26 bars
 * ago are confirmations. Scores are additive and mirror exactly for the bullish case.
 */
export function ichimoku(c: Candle[], tenkanLen = 9, kijunLen = 26, senkouBLen = 52, displacement = 26): IchimokuResult {
  const name = "ichimoku";
  const empty = {
    tenkan: 0, kijun: 0, senkouA: 0, senkouB: 0, futureSenkouA: 0, futureSenkouB: 0, chikou: 0,
    pricePosition: "inside" as const, tkCross: "none" as const, tkCrossBarsAgo: -1, kumoTwist: "none" as const,
  };
  if (c.length < senkouBLen + displacement + 2) return { ...neutral(name, "insufficient data"), ...empty };
  const hs = c.map((k) => k.high);
  const ls = c.map((k) => k.low);
  const mid = (len: number) => {
    const h = highestSeries(hs, len);
    const l = lowestSeries(ls, len);
    return h.map((v, i) => (v + l[i]) / 2);
  };
  const tenkan = mid(tenkanLen);
  const kijun = mid(kijunLen);
  const spanA = tenkan.map((v, i) => (v + kijun[i]) / 2);
  const spanB = mid(senkouBLen);
  const n = c.length - 1;
  const close = c[n].close;
  const a = last(atrSeries(c, 14)) || 1;
  const cloudTop = Math.max(spanA[n - displacement], spanB[n - displacement]);
  const cloudBot = Math.min(spanA[n - displacement], spanB[n - displacement]);
  const pricePosition: IchimokuResult["pricePosition"] = close > cloudTop ? "above" : close < cloudBot ? "below" : "inside";
  let tkCross: IchimokuResult["tkCross"] = "none";
  let tkCrossBarsAgo = -1;
  for (let i = n; i >= Math.max(1, n - 10); i--) {
    const d = tenkan[i] - kijun[i];
    const dp = tenkan[i - 1] - kijun[i - 1];
    if (d > 0 && dp <= 0) { tkCross = "bullish"; tkCrossBarsAgo = n - i; break; }
    if (d < 0 && dp >= 0) { tkCross = "bearish"; tkCrossBarsAgo = n - i; break; }
  }
  let kumoTwist: IchimokuResult["kumoTwist"] = "none";
  for (let i = n; i >= Math.max(1, n - 5); i--) {
    const d = spanA[i] - spanB[i];
    const dp = spanA[i - 1] - spanB[i - 1];
    if (d > 0 && dp <= 0) { kumoTwist = "bullish"; break; }
    if (d < 0 && dp >= 0) { kumoTwist = "bearish"; break; }
  }
  const chikouRef = c[n - displacement].close;
  const notes: string[] = [];
  let score = 0;
  if (pricePosition === "above") { score += 30; notes.push("price above cloud"); }
  else if (pricePosition === "below") { score -= 30; notes.push("price below cloud"); }
  else notes.push("price inside cloud (no trend)");
  const curCloud = spanA[n - displacement] - spanB[n - displacement];
  score += clampNum((curCloud / a) * 10, -10, 10);
  const tk = tenkan[n] - kijun[n];
  score += clampNum((tk / a) * 10, -10, 10);
  if (tkCross !== "none" && tkCrossBarsAgo <= 5) {
    const sgn = tkCross === "bullish" ? 1 : -1;
    const strong = (sgn === 1 && pricePosition === "above") || (sgn === -1 && pricePosition === "below");
    score += sgn * (strong ? 25 : 15);
    notes.push(`${tkCross} TK cross ${tkCrossBarsAgo} bars ago${strong ? " (strong: on correct side of cloud)" : ""}`);
  }
  if (close > chikouRef) score += 10;
  else if (close < chikouRef) score -= 10;
  notes.push(`chikou ${close > chikouRef ? "above" : close < chikouRef ? "below" : "at"} price ${displacement} bars ago`);
  score += close > kijun[n] ? 5 : close < kijun[n] ? -5 : 0;
  if (kumoTwist !== "none") {
    score += kumoTwist === "bullish" ? 15 : -15;
    notes.push(`${kumoTwist} kumo twist ahead`);
  } else {
    score += clampNum(((spanA[n] - spanB[n]) / a) * 5, -5, 5);
  }
  return {
    ...result(name, score, notes),
    tenkan: tenkan[n], kijun: kijun[n],
    senkouA: spanA[n - displacement], senkouB: spanB[n - displacement],
    futureSenkouA: spanA[n], futureSenkouB: spanB[n],
    chikou: close, pricePosition, tkCross, tkCrossBarsAgo, kumoTwist,
  };
}

// ── 5. VWAP with standard deviation bands ──────────────────────────────────

export interface VwapBandsOpts {
  /** "auto" anchors at the most recent major extreme (highest high or lowest low over `lookback`), "start" at bar 0, or a bar index. */
  anchor?: "auto" | "start" | number;
  lookback?: number;
}

export interface VwapBandsResult extends IndicatorResult {
  vwap: number;
  sd: number;
  /** (close - vwap) / sd */
  z: number;
  bands: { upper1: number; upper2: number; upper3: number; lower1: number; lower2: number; lower3: number };
  anchorIndex: number;
  rejection: "bearish" | "bullish" | "none";
}

/**
 * Anchored VWAP with ±1/2/3 standard deviation bands.
 * Source: https://www.tradingview.com/support/solutions/43000502018-volume-weighted-average-price-vwap/
 *   and Brian Shannon, "Maximum Trading Gains with Anchored VWAP".
 *
 * vwap = Σ(tp·v) / Σ(v) from the anchor; sd = sqrt(Σ(tp²·v)/Σ(v) - vwap²)
 * Short use: price failing at AVWAP from below (high pokes above, close back under) is a
 * classic short entry; z >= +2 marks over-extension (fade / tighten stops).
 */
export function vwapBands(c: Candle[], opts: VwapBandsOpts = {}): VwapBandsResult {
  const { anchor = "auto", lookback = 100 } = opts;
  const name = "vwapBands";
  const empty = {
    vwap: 0, sd: 0, z: 0, anchorIndex: 0, rejection: "none" as const,
    bands: { upper1: 0, upper2: 0, upper3: 0, lower1: 0, lower2: 0, lower3: 0 },
  };
  if (c.length < 10) return { ...neutral(name, "insufficient data"), ...empty };
  const n = c.length - 1;
  let anchorIndex = 0;
  if (typeof anchor === "number") anchorIndex = clampNum(anchor, 0, n - 1);
  else if (anchor === "auto") {
    const s = Math.max(0, n - lookback + 1);
    let hiI = s, loI = s;
    for (let i = s; i <= n; i++) {
      if (c[i].high >= c[hiI].high) hiI = i;
      if (c[i].low <= c[loI].low) loI = i;
    }
    anchorIndex = Math.max(0, Math.min(n - 3, Math.max(hiI, loI)));
  }
  const tp = typicalPrices(c);
  let sv = 0, spv = 0, sppv = 0;
  const vwapArr: number[] = [];
  const sdArr: number[] = [];
  for (let i = anchorIndex; i <= n; i++) {
    const v = c[i].volume > 0 ? c[i].volume : 1;
    sv += v;
    spv += tp[i] * v;
    sppv += tp[i] * tp[i] * v;
    const vw = spv / sv;
    vwapArr.push(vw);
    sdArr.push(Math.sqrt(Math.max(0, sppv / sv - vw * vw)));
  }
  const vwap = last(vwapArr);
  const sd = last(sdArr) || last(atrSeries(c, 14)) || 1;
  const z = (c[n].close - vwap) / sd;
  const prevVwap = vwapArr.length >= 2 ? vwapArr[vwapArr.length - 2] : vwap;
  let rejection: VwapBandsResult["rejection"] = "none";
  if (c[n - 1].close < prevVwap && c[n].high > vwap && c[n].close < vwap) rejection = "bearish";
  else if (c[n - 1].close > prevVwap && c[n].low < vwap && c[n].close > vwap) rejection = "bullish";
  let score = clampNum(z * 25, -60, 60);
  const notes: string[] = [`close ${sround(z, 2)} sd ${z >= 0 ? "above" : "below"} AVWAP (anchor ${n - anchorIndex} bars ago)`];
  if (rejection === "bearish") { score -= 40; notes.push("bearish rejection at AVWAP (poked above, closed below)"); }
  if (rejection === "bullish") { score += 40; notes.push("bullish reclaim at AVWAP (dipped below, closed above)"); }
  if (z >= 2) notes.push("extended above +2 sd: mean-reversion risk for longs");
  if (z <= -2) notes.push("extended below -2 sd: mean-reversion risk for shorts");
  return {
    ...result(name, score, notes),
    vwap, sd, z, anchorIndex, rejection,
    bands: {
      upper1: vwap + sd, upper2: vwap + 2 * sd, upper3: vwap + 3 * sd,
      lower1: vwap - sd, lower2: vwap - 2 * sd, lower3: vwap - 3 * sd,
    },
  };
}

// ── 6. Keltner channel ──────────────────────────────────────────────────────

export interface KeltnerResult extends IndicatorResult {
  upper: number;
  middle: number;
  lower: number;
  /** -1 = at lower band, +1 = at upper band, beyond ±1 = outside */
  position: number;
}

/**
 * Keltner Channel (TradingView defaults: EMA 20, ATR 10, multiplier 2).
 * Source: https://www.tradingview.com/support/solutions/43000502266-keltner-channels-kc/
 * Short use: close below the lower band in a downtrend = momentum continuation; repeated
 * failure at the upper band = exhaustion. Score = position within channel, capped.
 */
export function keltner(c: Candle[], length = 20, atrLength = 10, mult = 2): KeltnerResult {
  const name = "keltner";
  if (c.length < length + 2) return { ...neutral(name, "insufficient data"), upper: 0, middle: 0, lower: 0, position: 0 };
  const mid = last(emaSeries(closesOf(c), length));
  const a = last(atrSeries(c, atrLength));
  const upper = mid + mult * a;
  const lower = mid - mult * a;
  const close = last(c).close;
  const position = a > 0 ? (close - mid) / (mult * a) : 0;
  const score = clampNum(position * 40, -60, 60);
  const notes = [`close at ${sround(position * 100, 0)}% of channel half-width ${position >= 0 ? "above" : "below"} the EMA`];
  if (position > 1) notes.push("outside upper Keltner band (strong momentum / overextended)");
  if (position < -1) notes.push("outside lower Keltner band (strong momentum / overextended)");
  return { ...result(name, score, notes), upper, middle: mid, lower, position };
}

// ── 7. Donchian breakout ────────────────────────────────────────────────────

export interface DonchianResult extends IndicatorResult {
  upper: number;
  lower: number;
  middle: number;
  breakout: "up" | "down" | "none";
  barsSinceBreakout: number;
}

/**
 * Donchian Channel breakout (Turtle rules, 20 bars).
 * Source: https://www.tradingview.com/support/solutions/43000502253-donchian-channels-dc/
 * upper/lower = highest high / lowest low of the PRIOR `length` bars (current bar excluded).
 * Short use: close below the 20-bar low = breakdown entry (Turtle System 1 short).
 */
export function donchian(c: Candle[], length = 20): DonchianResult {
  const name = "donchian";
  if (c.length < length + 2) return { ...neutral(name, "insufficient data"), upper: 0, lower: 0, middle: 0, breakout: "none", barsSinceBreakout: -1 };
  const n = c.length - 1;
  const hs = highestSeries(c.map((k) => k.high), length);
  const ls = lowestSeries(c.map((k) => k.low), length);
  let breakout: DonchianResult["breakout"] = "none";
  let barsSinceBreakout = -1;
  for (let i = n; i >= Math.max(length, n - 5); i--) {
    if (c[i].close > hs[i - 1]) { breakout = "up"; barsSinceBreakout = n - i; break; }
    if (c[i].close < ls[i - 1]) { breakout = "down"; barsSinceBreakout = n - i; break; }
  }
  const upper = hs[n - 1], lower = ls[n - 1];
  const middle = (upper + lower) / 2;
  const half = (upper - lower) / 2 || 1;
  const pos = (c[n].close - middle) / half;
  let score = clampNum(pos * 30, -30, 30);
  const notes: string[] = [];
  if (breakout === "up") { score += 50 * (barsSinceBreakout === 0 ? 1 : 0.6); notes.push(`${length}-bar high breakout ${barsSinceBreakout} bars ago`); }
  else if (breakout === "down") { score -= 50 * (barsSinceBreakout === 0 ? 1 : 0.6); notes.push(`${length}-bar low breakdown ${barsSinceBreakout} bars ago`); }
  else notes.push(`inside ${length}-bar channel at ${sround(pos * 50 + 50, 0)}% of range`);
  return { ...result(name, score, notes), upper, lower, middle, breakout, barsSinceBreakout };
}

// ── 8. Williams %R ──────────────────────────────────────────────────────────

export interface WilliamsRResult extends IndicatorResult {
  value: number;
  prev: number;
}

/**
 * Williams %R (Larry Williams), length 14, overbought > -20, oversold < -80.
 * Source: https://school.stockcharts.com/doku.php?id=technical_indicators:williams_r
 * %R = (HH14 - close) / (HH14 - LL14) * -100
 * Short use: %R leaving the overbought zone (crosses back below -20) = momentum failure.
 * Mean-reversion oscillator: overbought scores mildly bearish, oversold mildly bullish.
 */
export function williamsR(c: Candle[], length = 14): WilliamsRResult {
  const name = "williamsR";
  if (c.length < length + 2) return { ...neutral(name, "insufficient data"), value: -50, prev: -50 };
  const hs = highestSeries(c.map((k) => k.high), length);
  const ls = lowestSeries(c.map((k) => k.low), length);
  const calc = (i: number) => {
    const r = hs[i] - ls[i];
    return r === 0 ? -50 : ((hs[i] - c[i].close) / r) * -100;
  };
  const n = c.length - 1;
  const v = calc(n), p = calc(n - 1);
  let score: number;
  const notes: string[] = [`%R ${sround(v, 1)}`];
  if (p > -20 && v <= -20) { score = -65; notes.push("exited overbought zone (bearish momentum failure)"); }
  else if (p < -80 && v >= -80) { score = 65; notes.push("exited oversold zone (bullish momentum recovery)"); }
  else if (v > -20) { score = -25; notes.push("overbought (fade risk for longs)"); }
  else if (v < -80) { score = 25; notes.push("oversold (fade risk for shorts)"); }
  else score = -((v + 50) / 30) * 15;
  return { ...result(name, score, notes), value: v, prev: p };
}

// ── 9. CCI ──────────────────────────────────────────────────────────────────

export interface CciResult extends IndicatorResult {
  value: number;
  prev: number;
}

/**
 * Commodity Channel Index (Donald Lambert), length 20, constant 0.015.
 * Source: https://school.stockcharts.com/doku.php?id=technical_indicators:commodity_channel_index_cci
 * CCI = (tp - SMA(tp,20)) / (0.015 * meanDeviation)
 * Lambert's rules: short when CCI falls back below +100 after being above; long when it rises
 * back above -100. Readings beyond ±100 are treated as trend momentum in that direction.
 */
export function cci(c: Candle[], length = 20): CciResult {
  const name = "cci";
  if (c.length < length + 2) return { ...neutral(name, "insufficient data"), value: 0, prev: 0 };
  const tp = typicalPrices(c);
  const m = smaSeries(tp, length);
  const calc = (i: number) => {
    const s = Math.max(0, i - length + 1);
    let md = 0;
    for (let j = s; j <= i; j++) md += Math.abs(tp[j] - m[i]);
    md /= i - s + 1;
    return md === 0 ? 0 : (tp[i] - m[i]) / (0.015 * md);
  };
  const n = c.length - 1;
  const v = calc(n), p = calc(n - 1);
  let score: number;
  const notes = [`CCI ${sround(v, 0)}`];
  if (p > 100 && v <= 100) { score = -65; notes.push("fell back below +100 (Lambert sell)"); }
  else if (p < -100 && v >= -100) { score = 65; notes.push("rose back above -100 (Lambert buy)"); }
  else if (v > 100) { score = 35; notes.push("above +100: bullish momentum"); }
  else if (v < -100) { score = -35; notes.push("below -100: bearish momentum"); }
  else score = (v / 100) * 25;
  return { ...result(name, score, notes), value: v, prev: p };
}

// ── 10. TD Sequential ───────────────────────────────────────────────────────

export interface TdSequentialResult extends IndicatorResult {
  /** consecutive closes > close[4] (sell setup) */
  sellSetup: number;
  /** consecutive closes < close[4] (buy setup) */
  buySetup: number;
  perfected: boolean;
  /** countdown progress after the most recent completed setup, 0..13 */
  sellCountdown: number;
  buyCountdown: number;
  lastCompleted: "sell" | "buy" | "none";
  barsSinceCompleted: number;
}

/**
 * TD Sequential (Tom DeMark) setup + countdown.
 * Source: https://www.luxalgo.com/library/concept/td-sequential/ ,
 *         https://www.tradingview.com/script/gVMuxasg-DeMARK-9-13/
 *
 * Sell setup: 9 consecutive closes each > close 4 bars earlier (buy: <). Reset on break.
 * Perfected sell setup: high of bar 8 or 9 >= highs of bars 6 and 7 (buy: lows <=).
 * Sell countdown (after a completed sell setup): count non-consecutive bars with close >= high[2],
 * completes at 13 (buy: close <= low[2]).
 *
 * Short use: a completed/perfected sell 9 marks buying exhaustion; the 13 is the higher-conviction
 * exhaustion signal. Scores are exhaustion-type (sell setup => negative).
 */
export function tdSequential(c: Candle[]): TdSequentialResult {
  const name = "tdSequential";
  const empty = { sellSetup: 0, buySetup: 0, perfected: false, sellCountdown: 0, buyCountdown: 0, lastCompleted: "none" as const, barsSinceCompleted: -1 };
  if (c.length < 15) return { ...neutral(name, "insufficient data"), ...empty };
  let sell = 0, buy = 0;
  let sellCd = 0, buyCd = 0;
  let cdMode: "sell" | "buy" | "none" = "none";
  let lastCompleted: TdSequentialResult["lastCompleted"] = "none";
  let completedAt = -1;
  let perfected = false;
  for (let i = 4; i < c.length; i++) {
    if (c[i].close > c[i - 4].close) { sell++; buy = 0; }
    else if (c[i].close < c[i - 4].close) { buy++; sell = 0; }
    else { sell = 0; buy = 0; }
    if (sell === 9) {
      lastCompleted = "sell"; completedAt = i; cdMode = "sell"; sellCd = 0; buyCd = 0;
      const h67 = Math.max(c[i - 3].high, c[i - 2].high);
      perfected = c[i - 1].high >= h67 || c[i].high >= h67;
    } else if (buy === 9) {
      lastCompleted = "buy"; completedAt = i; cdMode = "buy"; sellCd = 0; buyCd = 0;
      const l67 = Math.min(c[i - 3].low, c[i - 2].low);
      perfected = c[i - 1].low <= l67 || c[i].low <= l67;
    }
    if (cdMode === "sell" && sellCd < 13 && c[i].close >= c[i - 2].high) sellCd++;
    if (cdMode === "buy" && buyCd < 13 && c[i].close <= c[i - 2].low) buyCd++;
  }
  const n = c.length - 1;
  const barsSince = completedAt >= 0 ? n - completedAt : -1;
  let score = 0;
  const notes: string[] = [];
  if (sell >= 7 && sell < 9) { score -= 30; notes.push(`sell setup at ${sell}/9 (buying exhaustion building)`); }
  if (buy >= 7 && buy < 9) { score += 30; notes.push(`buy setup at ${buy}/9 (selling exhaustion building)`); }
  if (lastCompleted !== "none" && barsSince >= 0 && barsSince <= 8) {
    const sgn = lastCompleted === "sell" ? -1 : 1;
    const base = perfected ? 85 : 70;
    const decay = barsSince <= 3 ? 1 : 0.6;
    score += sgn * base * decay;
    notes.push(`${lastCompleted.toUpperCase()} setup 9 completed ${barsSince} bars ago${perfected ? " (perfected)" : ""}`);
  }
  if (cdMode === "sell" && sellCd >= 13) { score -= 60; notes.push("sell countdown 13 complete (DeMark exhaustion)"); }
  else if (cdMode === "sell" && sellCd >= 10) { score -= 20; notes.push(`sell countdown ${sellCd}/13`); }
  if (cdMode === "buy" && buyCd >= 13) { score += 60; notes.push("buy countdown 13 complete (DeMark exhaustion)"); }
  else if (cdMode === "buy" && buyCd >= 10) { score += 20; notes.push(`buy countdown ${buyCd}/13`); }
  if (notes.length === 0) notes.push(`no active TD setup (sell ${sell}, buy ${buy})`);
  return {
    ...result(name, score, notes),
    sellSetup: sell, buySetup: buy, perfected, sellCountdown: sellCd, buyCountdown: buyCd,
    lastCompleted, barsSinceCompleted: barsSince,
  };
}

// ── 11. Heikin-Ashi ─────────────────────────────────────────────────────────

export interface HeikinAshiResult extends IndicatorResult {
  candles: Candle[];
  /** +N = N consecutive green HA candles, -N = N consecutive red */
  run: number;
  /** last candle has no wick against the trend (open == low for green, open == high for red) */
  strong: boolean;
  /** last HA candle is a doji / indecision (small body relative to range) */
  indecision: boolean;
}

/**
 * Heikin-Ashi candles and trend run length.
 * Source: https://school.stockcharts.com/doku.php?id=chart_analysis:heikin_ashi
 * haClose = (o+h+l+c)/4, haOpen = (prevHaOpen + prevHaClose)/2, haHigh = max(h, haOpen, haClose), haLow = min(...)
 * Short use: consecutive red HA candles with flat tops (no upper wick) = strong downtrend;
 * a red candle appearing after a long green run with a doji is an early reversal warning.
 */
export function heikinAshi(c: Candle[]): HeikinAshiResult {
  const name = "heikinAshi";
  if (c.length < 3) return { ...neutral(name, "insufficient data"), candles: [], run: 0, strong: false, indecision: false };
  const ha: Candle[] = [];
  for (let i = 0; i < c.length; i++) {
    const k = c[i];
    const haClose = (k.open + k.high + k.low + k.close) / 4;
    const haOpen = i === 0 ? (k.open + k.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
    ha.push({ time: k.time, open: haOpen, close: haClose, high: Math.max(k.high, haOpen, haClose), low: Math.min(k.low, haOpen, haClose), volume: k.volume });
  }
  const n = ha.length - 1;
  const dirOf = (k: Candle) => (k.close > k.open ? 1 : k.close < k.open ? -1 : 0);
  const d = dirOf(ha[n]);
  let run = 0;
  for (let i = n; i >= 0 && d !== 0 && dirOf(ha[i]) === d; i--) run++;
  const lastHa = ha[n];
  const range = lastHa.high - lastHa.low;
  const body = Math.abs(lastHa.close - lastHa.open);
  const strong = d === 1 ? lastHa.open === lastHa.low : d === -1 ? lastHa.open === lastHa.high : false;
  const indecision = range > 0 && body / range < 0.1;
  let score = d * Math.min(60, 12 * run);
  if (strong) score += d * 20;
  if (indecision) score *= 0.5;
  const notes = [`${run} consecutive ${d === 1 ? "green" : d === -1 ? "red" : "flat"} HA candles${strong ? " (no counter-wick: strong)" : ""}`];
  if (indecision) notes.push("HA doji: indecision, possible trend pause/reversal");
  if (run >= 8) notes.push("mature run: watch for exhaustion");
  return { ...result(name, score, notes), candles: ha, run: d * run, strong, indecision };
}

// ── 12. MACD zero-line cross ────────────────────────────────────────────────

export interface MacdZeroCrossResult extends IndicatorResult {
  macd: number;
  signal: number;
  histogram: number;
  zeroCross: "bullish" | "bearish" | "none";
  zeroCrossBarsAgo: number;
  signalCross: "bullish" | "bearish" | "none";
}

/**
 * MACD (12, 26, 9) zero-line and signal-line crosses.
 * Source: https://school.stockcharts.com/doku.php?id=technical_indicators:moving_average_convergence_divergence_macd
 * Short use: MACD line crossing below zero = EMA12 crossed under EMA26 (trend turned bearish);
 * a bearish signal cross while the MACD is above zero is an early short/pullback trigger.
 * Magnitude is normalised by ATR so scores are scale and level independent.
 */
export function macdZeroCross(c: Candle[], fast = 12, slow = 26, signalLen = 9, recentBars = 3): MacdZeroCrossResult {
  const name = "macdZeroCross";
  const empty = { macd: 0, signal: 0, histogram: 0, zeroCross: "none" as const, zeroCrossBarsAgo: -1, signalCross: "none" as const };
  if (c.length < slow + signalLen + 2) return { ...neutral(name, "insufficient data"), ...empty };
  const cl = closesOf(c);
  const ef = emaSeries(cl, fast), es = emaSeries(cl, slow);
  const macd = ef.map((v, i) => v - es[i]);
  const sig = emaSeries(macd, signalLen);
  const hist = macd.map((v, i) => v - sig[i]);
  const n = c.length - 1;
  const a = last(atrSeries(c, 14)) || 1;
  let zeroCross: MacdZeroCrossResult["zeroCross"] = "none";
  let zeroCrossBarsAgo = -1;
  for (let i = n; i >= Math.max(1, n - 10); i--) {
    if (macd[i] > 0 && macd[i - 1] <= 0) { zeroCross = "bullish"; zeroCrossBarsAgo = n - i; break; }
    if (macd[i] < 0 && macd[i - 1] >= 0) { zeroCross = "bearish"; zeroCrossBarsAgo = n - i; break; }
  }
  let signalCross: MacdZeroCrossResult["signalCross"] = "none";
  if (hist[n] > 0 && hist[n - 1] <= 0) signalCross = "bullish";
  else if (hist[n] < 0 && hist[n - 1] >= 0) signalCross = "bearish";
  let score = clampNum((macd[n] / a) * 20, -40, 40);
  const notes = [`MACD ${sround(macd[n] / a, 2)} ATR ${macd[n] >= 0 ? "above" : "below"} zero`];
  if (zeroCross !== "none" && zeroCrossBarsAgo <= recentBars) {
    score += zeroCross === "bullish" ? 35 : -35;
    notes.push(`${zeroCross} zero-line cross ${zeroCrossBarsAgo} bars ago`);
  }
  if (signalCross !== "none") {
    score += signalCross === "bullish" ? 15 : -15;
    notes.push(`${signalCross} signal cross this bar`);
  } else {
    score += clampNum(((hist[n] - hist[n - 1]) / a) * 20, -10, 10);
  }
  return { ...result(name, score, notes), macd: macd[n], signal: sig[n], histogram: hist[n], zeroCross, zeroCrossBarsAgo, signalCross };
}

// ── 13. Death / golden cross ────────────────────────────────────────────────

export interface MaCrossResult extends IndicatorResult {
  fast: number;
  slow: number;
  state: "golden" | "death";
  barsSinceCross: number;
  /** (fast - slow) / ATR */
  separationAtr: number;
}

/**
 * Death cross / golden cross (SMA 50 vs SMA 200 by default).
 * Source: https://www.investopedia.com/terms/d/deathcross.asp
 * Death cross = fast SMA crosses below slow SMA (bearish regime). Needs >= slow bars of data.
 * Score: regime sign * (base + separation), boosted for a recent cross.
 */
export function deathGoldenCross(c: Candle[], fastLen = 50, slowLen = 200, recentBars = 10): MaCrossResult {
  const name = "deathGoldenCross";
  if (c.length < slowLen + 2) return { ...neutral(name, `insufficient data (need ${slowLen + 2} bars)`), fast: 0, slow: 0, state: "golden", barsSinceCross: -1, separationAtr: 0 };
  const cl = closesOf(c);
  const f = smaSeries(cl, fastLen), s = smaSeries(cl, slowLen);
  const n = c.length - 1;
  const a = last(atrSeries(c, 14)) || 1;
  const above = (i: number) => f[i] - s[i] > 0 || (f[i] - s[i] === 0 && i > 0 && f[i - 1] - s[i - 1] > 0);
  const isGolden = above(n);
  const state: MaCrossResult["state"] = isGolden ? "golden" : "death";
  let barsSinceCross = 0;
  while (n - barsSinceCross - 1 >= slowLen - 1 && above(n - barsSinceCross - 1) === isGolden) barsSinceCross++;
  const sep = (f[n] - s[n]) / a;
  const sgn = isGolden ? 1 : -1;
  let score = sgn * (20 + clampNum(Math.abs(sep) * 5, 0, 25));
  if (barsSinceCross <= recentBars) score += sgn * 30;
  const notes = [`${state} cross regime, SMA${fastLen} ${sround(sep, 2)} ATR ${sep >= 0 ? "above" : "below"} SMA${slowLen}`];
  if (barsSinceCross <= recentBars) notes.push(`${state} cross occurred ${barsSinceCross} bars ago`);
  return { ...result(name, score, notes), fast: f[n], slow: s[n], state, barsSinceCross, separationAtr: sep };
}

// ── 14. Double top / double bottom ──────────────────────────────────────────

export interface PatternOpts {
  pivotLen?: number;
  lookback?: number;
  /** peak equality tolerance in ATR units */
  tolAtr?: number;
  /** minimum pattern depth in ATR units */
  minDepthAtr?: number;
}

export interface DoubleTopResult extends IndicatorResult {
  found: boolean;
  confirmed: boolean;
  peaks: [TaPivot, TaPivot] | null;
  neckline: number;
}

/**
 * Double top (M pattern). Source: Bulkowski, Encyclopedia of Chart Patterns;
 * https://www.tradingview.com/script/gMOZ3uxP-Auto-Chart-Patterns/
 * Rules: two consecutive pivot highs within `tolAtr` ATR of each other, trough between them
 * at least `minDepthAtr` ATR below the lower peak, no higher high after the second peak.
 * Confirmed when close breaks below the trough (neckline). Forming = second peak confirmed,
 * price still above neckline.
 */
export function detectDoubleTop(c: Candle[], opts: PatternOpts = {}): DoubleTopResult {
  const { pivotLen = 5, lookback = 120, tolAtr = 1.0, minDepthAtr = 2.0 } = opts;
  const name = "doubleTop";
  const miss = (note: string): DoubleTopResult => ({ ...neutral(name, note), found: false, confirmed: false, peaks: null, neckline: 0 });
  if (c.length < pivotLen * 4 + 5) return miss("insufficient data");
  const n = c.length - 1;
  const start = Math.max(0, n - lookback);
  const a = last(atrSeries(c, 14)) || 1;
  const highs = findPivots(c, pivotLen, pivotLen).filter((p) => p.type === "high" && p.index >= start);
  if (highs.length < 2) return miss("fewer than two pivot highs");
  const p2 = highs[highs.length - 1];
  const p1 = highs[highs.length - 2];
  if (Math.abs(p1.price - p2.price) > tolAtr * a) return miss("last two peaks not equal");
  let trough = Infinity;
  for (let i = p1.index; i <= p2.index; i++) trough = Math.min(trough, c[i].low);
  const peak = Math.min(p1.price, p2.price);
  if (peak - trough < minDepthAtr * a) return miss("trough too shallow");
  let maxAfter = -Infinity;
  for (let i = p2.index + 1; i <= n; i++) maxAfter = Math.max(maxAfter, c[i].high);
  if (maxAfter > Math.max(p1.price, p2.price) + 0.25 * a) return miss("pattern invalidated by higher high");
  const confirmed = c[n].close < trough;
  let barsSinceBreak = -1;
  if (confirmed) for (let i = n; i > p2.index; i--) { if (c[i].close < trough) barsSinceBreak = n - i; else break; }
  let score: number;
  if (confirmed) score = barsSinceBreak <= 5 ? -80 : -55;
  else {
    const prog = clampNum((peak - c[n].close) / (peak - trough), 0, 1);
    score = -(30 + prog * 20);
  }
  const notes = [`double top: peaks ${sround(p1.price, 4)} / ${sround(p2.price, 4)}, neckline ${sround(trough, 4)}, ${confirmed ? `neckline broken ${barsSinceBreak} bars ago` : "forming (neckline intact)"}`];
  return { ...result(name, score, notes), found: true, confirmed, peaks: [p1, p2], neckline: trough };
}

export interface DoubleBottomResult extends IndicatorResult {
  found: boolean;
  confirmed: boolean;
  troughs: [TaPivot, TaPivot] | null;
  neckline: number;
}

/** Double bottom (W pattern): exact mirror of {@link detectDoubleTop}. */
export function detectDoubleBottom(c: Candle[], opts: PatternOpts = {}): DoubleBottomResult {
  const m = mirrorCandles(c);
  const r = detectDoubleTop(m, opts);
  const axis = mirrorAxis(c, m);
  return {
    ...negate(r, "doubleBottom"),
    found: r.found,
    confirmed: r.confirmed,
    troughs: r.peaks ? [{ ...r.peaks[0], price: axis - r.peaks[0].price, type: "low" }, { ...r.peaks[1], price: axis - r.peaks[1].price, type: "low" }] : null,
    neckline: r.found ? axis - r.neckline : 0,
  };
}

/** Net double top / bottom result (sum of both, clamped). */
export function detectDoubleTopBottom(c: Candle[], opts: PatternOpts = {}): IndicatorResult {
  const t = detectDoubleTop(c, opts);
  const b = detectDoubleBottom(c, opts);
  const notes = [...(t.found ? t.notes : []), ...(b.found ? b.notes : [])];
  return result("doubleTopBottom", t.score + b.score, notes.length ? notes : ["no double top/bottom"]);
}

// ── 15. Head and shoulders ──────────────────────────────────────────────────

export interface HeadShouldersResult extends IndicatorResult {
  found: boolean;
  confirmed: boolean;
  leftShoulder: TaPivot | null;
  head: TaPivot | null;
  rightShoulder: TaPivot | null;
  /** neckline value projected to the latest bar */
  necklineNow: number;
}

/**
 * Head and shoulders top. Source: Bulkowski; Edwards & Magee, Technical Analysis of Stock Trends.
 * Rules: last three pivot highs LS < Head > RS, head at least `minDepthAtr`/2 ATR above both shoulders,
 * shoulders within `tolAtr`*2 ATR of each other, neckline through the two intervening troughs,
 * no high above the head after the right shoulder. Confirmed = close below projected neckline.
 */
export function detectHeadAndShoulders(c: Candle[], opts: PatternOpts = {}): HeadShouldersResult {
  const { pivotLen = 5, lookback = 150, tolAtr = 1.0, minDepthAtr = 2.0 } = opts;
  const name = "headAndShoulders";
  const miss = (note: string): HeadShouldersResult => ({ ...neutral(name, note), found: false, confirmed: false, leftShoulder: null, head: null, rightShoulder: null, necklineNow: 0 });
  if (c.length < pivotLen * 6 + 5) return miss("insufficient data");
  const n = c.length - 1;
  const start = Math.max(0, n - lookback);
  const a = last(atrSeries(c, 14)) || 1;
  const highs = findPivots(c, pivotLen, pivotLen).filter((p) => p.type === "high" && p.index >= start);
  if (highs.length < 3) return miss("fewer than three pivot highs");
  const [ls, hd, rs] = highs.slice(-3);
  if (!(hd.price > ls.price + (minDepthAtr / 2) * a && hd.price > rs.price + (minDepthAtr / 2) * a)) return miss("middle peak is not a head");
  if (Math.abs(ls.price - rs.price) > tolAtr * 2 * a) return miss("shoulders not level");
  const troughBetween = (i0: number, i1: number) => {
    let idx = i0, v = Infinity;
    for (let i = i0; i <= i1; i++) if (c[i].low < v) { v = c[i].low; idx = i; }
    return { index: idx, price: v };
  };
  const t1 = troughBetween(ls.index, hd.index);
  const t2 = troughBetween(hd.index, rs.index);
  if (hd.price - Math.max(t1.price, t2.price) < minDepthAtr * a) return miss("pattern too shallow");
  let maxAfter = -Infinity;
  for (let i = rs.index + 1; i <= n; i++) maxAfter = Math.max(maxAfter, c[i].high);
  if (maxAfter > hd.price) return miss("invalidated: high above head after right shoulder");
  const slope = (t2.price - t1.price) / Math.max(1, t2.index - t1.index);
  const necklineAt = (i: number) => t2.price + slope * (i - t2.index);
  const necklineNow = necklineAt(n);
  const confirmed = c[n].close < necklineNow;
  let barsSinceBreak = -1;
  if (confirmed) for (let i = n; i > rs.index; i--) { if (c[i].close < necklineAt(i)) barsSinceBreak = n - i; else break; }
  let score: number;
  if (confirmed) score = barsSinceBreak <= 5 ? -85 : -60;
  else {
    const prog = clampNum((rs.price - c[n].close) / Math.max(1e-9, rs.price - necklineNow), 0, 1);
    score = -(35 + prog * 15);
  }
  const notes = [`head and shoulders: LS ${sround(ls.price, 4)} / head ${sround(hd.price, 4)} / RS ${sround(rs.price, 4)}, neckline ${sround(necklineNow, 4)}, ${confirmed ? `broken ${barsSinceBreak} bars ago` : "forming"}`];
  return { ...result(name, score, notes), found: true, confirmed, leftShoulder: ls, head: hd, rightShoulder: rs, necklineNow };
}

/** Inverse head and shoulders: exact mirror of {@link detectHeadAndShoulders}. */
export function detectInverseHeadAndShoulders(c: Candle[], opts: PatternOpts = {}): HeadShouldersResult {
  const m = mirrorCandles(c);
  const r = detectHeadAndShoulders(m, opts);
  const axis = mirrorAxis(c, m);
  const flip = (p: TaPivot | null): TaPivot | null => (p ? { ...p, price: axis - p.price, type: "low" } : null);
  return {
    ...negate(r, "inverseHeadAndShoulders"),
    found: r.found, confirmed: r.confirmed,
    leftShoulder: flip(r.leftShoulder), head: flip(r.head), rightShoulder: flip(r.rightShoulder),
    necklineNow: r.found ? axis - r.necklineNow : 0,
  };
}

/** Net H&S / inverse H&S. */
export function detectHeadAndShouldersBoth(c: Candle[], opts: PatternOpts = {}): IndicatorResult {
  const t = detectHeadAndShoulders(c, opts);
  const b = detectInverseHeadAndShoulders(c, opts);
  const notes = [...(t.found ? t.notes : []), ...(b.found ? b.notes : [])];
  return result("headAndShouldersBoth", t.score + b.score, notes.length ? notes : ["no head and shoulders"]);
}

// ── 16. Rising / falling wedge ──────────────────────────────────────────────

export interface WedgeOpts {
  pivotLen?: number;
  lookback?: number;
  /** minimum number of pivots on each side */
  minTouches?: number;
}

export interface WedgeResult extends IndicatorResult {
  found: boolean;
  confirmed: boolean;
  upperSlopeAtr: number;
  lowerSlopeAtr: number;
  upperNow: number;
  lowerNow: number;
}

/**
 * Rising wedge via pivot trendlines (bearish). Source: Bulkowski;
 * https://www.tradingview.com/script/w7TbGKul-Pattern-Atlas-Geometric-AxeAlgo/
 * Rules: least squares lines through the last `minTouches`+ pivot highs and pivot lows,
 * both slopes > 0 (in ATR/bar), lower slope steeper than upper (converging), channel width
 * at the end < 70% of width at the start. Confirmed = close below the lower trendline.
 */
export function detectRisingWedge(c: Candle[], opts: WedgeOpts = {}): WedgeResult {
  const { pivotLen = 3, lookback = 80, minTouches = 3 } = opts;
  const name = "risingWedge";
  const miss = (note: string): WedgeResult => ({ ...neutral(name, note), found: false, confirmed: false, upperSlopeAtr: 0, lowerSlopeAtr: 0, upperNow: 0, lowerNow: 0 });
  if (c.length < lookback / 2) return miss("insufficient data");
  const n = c.length - 1;
  const start = Math.max(0, n - lookback);
  const a = last(atrSeries(c, 14)) || 1;
  const piv = findPivots(c, pivotLen, pivotLen).filter((p) => p.index >= start);
  const hs = piv.filter((p) => p.type === "high").slice(-minTouches - 1);
  const ls = piv.filter((p) => p.type === "low").slice(-minTouches - 1);
  if (hs.length < minTouches || ls.length < minTouches) return miss("not enough pivots");
  const up = fitLine(hs.map((p) => p.index), hs.map((p) => p.price));
  const lo = fitLine(ls.map((p) => p.index), ls.map((p) => p.price));
  const upS = up.slope / a, loS = lo.slope / a;
  if (!(upS > 0.02 && loS > 0.02)) return miss("trendlines not both rising");
  if (!(loS > upS)) return miss("not converging");
  const x0 = Math.min(hs[0].index, ls[0].index);
  const w0 = up.intercept + up.slope * x0 - (lo.intercept + lo.slope * x0);
  const upperNow = up.intercept + up.slope * n;
  const lowerNow = lo.intercept + lo.slope * n;
  const w1 = upperNow - lowerNow;
  if (!(w0 > 0 && w1 < 0.7 * w0)) return miss("insufficient convergence");
  const confirmed = c[n].close < lowerNow;
  const score = confirmed ? -80 : -45;
  const notes = [`rising wedge: upper slope ${sround(upS, 3)} ATR/bar, lower slope ${sround(loS, 3)} ATR/bar, ${confirmed ? "lower trendline broken" : "forming (apex approaching)"}`];
  return { ...result(name, score, notes), found: true, confirmed, upperSlopeAtr: upS, lowerSlopeAtr: loS, upperNow, lowerNow };
}

/** Falling wedge (bullish): exact mirror of {@link detectRisingWedge}. */
export function detectFallingWedge(c: Candle[], opts: WedgeOpts = {}): WedgeResult {
  const m = mirrorCandles(c);
  const r = detectRisingWedge(m, opts);
  const axis = mirrorAxis(c, m);
  return {
    ...negate(r, "fallingWedge"),
    found: r.found, confirmed: r.confirmed,
    upperSlopeAtr: -r.lowerSlopeAtr, lowerSlopeAtr: -r.upperSlopeAtr,
    upperNow: r.found ? axis - r.lowerNow : 0, lowerNow: r.found ? axis - r.upperNow : 0,
  };
}

/** Net rising/falling wedge. */
export function detectRisingFallingWedge(c: Candle[], opts: WedgeOpts = {}): IndicatorResult {
  const r = detectRisingWedge(c, opts);
  const f = detectFallingWedge(c, opts);
  const notes = [...(r.found ? r.notes : []), ...(f.found ? f.notes : [])];
  return result("wedge", r.score + f.score, notes.length ? notes : ["no wedge"]);
}

// ── 17. Market structure: BOS / CHoCH ───────────────────────────────────────

export interface StructureEvent {
  index: number;
  type: "BOS" | "CHoCH";
  direction: "bullish" | "bearish";
  level: number;
}

export interface MarketStructureResult extends IndicatorResult {
  trend: 1 | -1 | 0;
  lastEvent: StructureEvent | null;
  events: StructureEvent[];
  /** labels of the most recent swing high and swing low */
  lastHighLabel: "HH" | "LH" | "none";
  lastLowLabel: "HL" | "LL" | "none";
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
}

/**
 * Smart Money Concepts market structure (LuxAlgo style, non-repainting).
 * Source: https://www.luxalgo.com/library/indicator/SRsr9SLs-smart-money-concepts
 * Swings = fractal pivots (length 5 = "internal" structure; use 50 for swing structure).
 * A close above the last unbroken swing high is a bullish BOS if trend is already bullish,
 * otherwise a bullish CHoCH (change of character). Mirror for lows.
 * Short use: bearish CHoCH (close below the last higher low in an uptrend) is the SMC short
 * trigger; bearish BOS confirms continuation; LH + LL labelling confirms the sequence.
 */
export function marketStructure(c: Candle[], pivotLen = 5, recentBars = 20): MarketStructureResult {
  const name = "marketStructure";
  const empty = { trend: 0 as const, lastEvent: null, events: [], lastHighLabel: "none" as const, lastLowLabel: "none" as const, lastSwingHigh: null, lastSwingLow: null };
  if (c.length < pivotLen * 4 + 2) return { ...neutral(name, "insufficient data"), ...empty };
  const piv = findPivots(c, pivotLen, pivotLen);
  const byConfirm = new Map<number, TaPivot[]>();
  for (const p of piv) {
    const k = p.index + pivotLen;
    if (!byConfirm.has(k)) byConfirm.set(k, []);
    byConfirm.get(k)!.push(p);
  }
  let trend: 1 | -1 | 0 = 0;
  let lastHigh: { price: number; broken: boolean } | null = null;
  let lastLow: { price: number; broken: boolean } | null = null;
  let prevHighPrice: number | null = null, prevLowPrice: number | null = null;
  let lastHighLabel: MarketStructureResult["lastHighLabel"] = "none";
  let lastLowLabel: MarketStructureResult["lastLowLabel"] = "none";
  const events: StructureEvent[] = [];
  for (let i = 0; i < c.length; i++) {
    const confirmed = byConfirm.get(i);
    if (confirmed) {
      for (const p of confirmed) {
        if (p.type === "high") {
          if (prevHighPrice !== null) lastHighLabel = p.price > prevHighPrice ? "HH" : "LH";
          prevHighPrice = p.price;
          lastHigh = { price: p.price, broken: false };
        } else {
          if (prevLowPrice !== null) lastLowLabel = p.price < prevLowPrice ? "LL" : "HL";
          prevLowPrice = p.price;
          lastLow = { price: p.price, broken: false };
        }
      }
    }
    if (lastHigh && !lastHigh.broken && c[i].close > lastHigh.price) {
      events.push({ index: i, type: trend === -1 ? "CHoCH" : "BOS", direction: "bullish", level: lastHigh.price });
      lastHigh.broken = true;
      trend = 1;
    }
    if (lastLow && !lastLow.broken && c[i].close < lastLow.price) {
      events.push({ index: i, type: trend === 1 ? "CHoCH" : "BOS", direction: "bearish", level: lastLow.price });
      lastLow.broken = true;
      trend = -1;
    }
  }
  const n = c.length - 1;
  const lastEvent = events.length ? events[events.length - 1] : null;
  let score = 0;
  const notes: string[] = [];
  if (lastEvent) {
    const sgn = lastEvent.direction === "bullish" ? 1 : -1;
    const base = lastEvent.type === "CHoCH" ? 75 : 60;
    const age = n - lastEvent.index;
    score += sgn * base * (age <= recentBars ? 1 : 0.5);
    notes.push(`${lastEvent.direction} ${lastEvent.type} ${age} bars ago at ${sround(lastEvent.level, 4)}`);
  } else notes.push("no structure break yet");
  if (lastHighLabel === "LH" && lastLowLabel === "LL") { score -= 15; notes.push("LH + LL sequence (bearish structure)"); }
  if (lastHighLabel === "HH" && lastLowLabel === "HL") { score += 15; notes.push("HH + HL sequence (bullish structure)"); }
  return {
    ...result(name, score, notes),
    trend, lastEvent, events, lastHighLabel, lastLowLabel,
    lastSwingHigh: lastHigh ? lastHigh.price : null, lastSwingLow: lastLow ? lastLow.price : null,
  };
}

/** Bearish-only view of market structure (score <= 0). */
export function bearishBosChoch(c: Candle[], pivotLen = 5, recentBars = 20): IndicatorResult {
  const r = marketStructure(c, pivotLen, recentBars);
  const bearish = r.lastEvent?.direction === "bearish";
  return result("bearishBosChoch", bearish ? Math.min(0, r.score) : 0, bearish ? r.notes : ["no bearish structure break"]);
}

/** Bullish-only view of market structure (score >= 0). */
export function bullishBosChoch(c: Candle[], pivotLen = 5, recentBars = 20): IndicatorResult {
  const r = marketStructure(c, pivotLen, recentBars);
  const bullish = r.lastEvent?.direction === "bullish";
  return result("bullishBosChoch", bullish ? Math.max(0, r.score) : 0, bullish ? r.notes : ["no bullish structure break"]);
}

// ── 18. Liquidity sweep ─────────────────────────────────────────────────────

export interface SweepInfo {
  index: number;
  level: number;
  penetrationAtr: number;
}

export interface LiquiditySweepResult extends IndicatorResult {
  sweepHigh: SweepInfo | null;
  sweepLow: SweepInfo | null;
}

/** Sweep of highs only (bearish). */
function sweepOfHighs(c: Candle[], pivotLen: number, recentBars: number): { score: number; note: string | null; info: SweepInfo | null } {
  const n = c.length - 1;
  const a = last(atrSeries(c, 14)) || 1;
  const piv = findPivots(c, pivotLen, pivotLen).filter((p) => p.type === "high");
  for (let i = n; i >= Math.max(pivotLen * 2, n - recentBars); i--) {
    let level: TaPivot | null = null;
    for (let k = piv.length - 1; k >= 0; k--) {
      if (piv[k].index + pivotLen <= i) { level = piv[k]; break; }
    }
    if (!level) continue;
    let brokenBefore = false;
    for (let j = level.index + 1; j < i; j++) if (c[j].close > level.price) { brokenBefore = true; break; }
    if (brokenBefore) continue;
    if (c[i].high > level.price && c[i].close < level.price) {
      let reclaimed = false;
      for (let j = i + 1; j <= n; j++) if (c[j].close > level.price) { reclaimed = true; break; }
      if (reclaimed) continue;
      const pen = (c[i].high - level.price) / a;
      const age = n - i;
      let s = 55 + clampNum(pen * 10, 0, 15);
      if (c[i].close < c[i].open) s += 10;
      s *= age <= 3 ? 1 : 0.7;
      return {
        score: -s,
        note: `liquidity sweep of swing high ${sround(level.price, 4)} ${age} bars ago (wick ${sround(pen, 2)} ATR through, closed back below)`,
        info: { index: i, level: level.price, penetrationAtr: pen },
      };
    }
  }
  return { score: 0, note: null, info: null };
}

/**
 * Liquidity sweep / stop hunt (ICT "turtle soup", SMC "sweep").
 * Source: https://www.luxalgo.com/library/indicator/RkQQOeI2-smart-money-concepts-smt-sweep/
 * Bearish: a bar's high trades above the most recent unbroken swing high but the bar closes
 * back below it (buy-side liquidity taken, then rejected). Bullish is the exact mirror.
 * Score decays after 3 bars and is cancelled if a later close reclaims the level.
 */
export function liquiditySweep(c: Candle[], pivotLen = 5, recentBars = 10): LiquiditySweepResult {
  const name = "liquiditySweep";
  if (c.length < pivotLen * 4 + 2) return { ...neutral(name, "insufficient data"), sweepHigh: null, sweepLow: null };
  const hi = sweepOfHighs(c, pivotLen, recentBars);
  const m = mirrorCandles(c);
  const lo = sweepOfHighs(m, pivotLen, recentBars);
  const axis = mirrorAxis(c, m);
  const notes: string[] = [];
  if (hi.note) notes.push(hi.note);
  if (lo.note) notes.push(swapWords(lo.note));
  if (!notes.length) notes.push("no recent liquidity sweep");
  return {
    ...result(name, hi.score - lo.score, notes),
    sweepHigh: hi.info,
    sweepLow: lo.info ? { ...lo.info, level: axis - lo.info.level } : null,
  };
}

// ── 19. Volume climax ───────────────────────────────────────────────────────

export interface VolumeClimaxOpts {
  volLength?: number;
  /** volume must exceed this multiple of the prior average */
  volMult?: number;
  /** extension from the 20 SMA in ATR units required to call it a climax */
  minExtensionAtr?: number;
  recentBars?: number;
}

export interface ClimaxInfo {
  index: number;
  volRatio: number;
  extensionAtr: number;
}

export interface VolumeClimaxResult extends IndicatorResult {
  buyingClimax: ClimaxInfo | null;
  sellingClimax: ClimaxInfo | null;
}

function buyingClimaxOnly(c: Candle[], o: Required<VolumeClimaxOpts>): { score: number; note: string | null; info: ClimaxInfo | null } {
  const n = c.length - 1;
  const a = atrSeries(c, 14);
  const vol = c.map((k) => k.volume);
  const vAvg = smaSeries(vol, o.volLength);
  const m = smaSeries(closesOf(c), 20);
  for (let i = n; i >= Math.max(o.volLength + 1, n - o.recentBars); i--) {
    const prevAvg = vAvg[i - 1];
    if (prevAvg <= 0) continue;
    const volRatio = vol[i] / prevAvg;
    if (volRatio < o.volMult) continue;
    const ext = (c[i].high - m[i]) / (a[i] || 1);
    if (ext < o.minExtensionAtr) continue;
    const range = c[i].high - c[i].low;
    const wide = range >= 1.5 * a[i];
    const churn = range <= 0.6 * a[i];
    if (!wide && !churn) continue;
    const closePos = range > 0 ? (c[i].high - c[i].close) / range : 0; // 1 = closed at low
    let s = 45 + clampNum((volRatio - o.volMult) * 10, 0, 25) + clampNum(closePos * 25, 0, 25);
    if (churn) s += 5;
    const age = n - i;
    s *= age <= 2 ? 1 : 0.7;
    if (c[n].close > c[i].high) s *= 0.3; // follow-through above the climax high: climax failed
    return {
      score: -s,
      note: `buying climax ${age} bars ago: volume ${sround(volRatio, 1)}x avg, ${sround(ext, 1)} ATR above 20 SMA, ${wide ? "wide range" : "churn (high volume, no progress)"}, closed ${sround(closePos * 100, 0)}% off the high`,
      info: { index: i, volRatio, extensionAtr: ext },
    };
  }
  return { score: 0, note: null, info: null };
}

/**
 * Volume climax / exhaustion (Wyckoff buying climax (BC) & selling climax (SC)).
 * Source: https://school.stockcharts.com/doku.php?id=market_analysis:the_wyckoff_method
 * Buying climax: volume >= 2.5x its 20-bar average on a bar that is >= 1.5 ATR above the 20 SMA,
 * with either a wide range (>= 1.5 ATR) or churn (<= 0.6 ATR). A close well off the high adds
 * conviction; follow-through above the climax high cancels most of the signal.
 * Selling climax is the exact mirror (bullish).
 */
export function volumeClimax(c: Candle[], opts: VolumeClimaxOpts = {}): VolumeClimaxResult {
  const o: Required<VolumeClimaxOpts> = { volLength: 20, volMult: 2.5, minExtensionAtr: 1.5, recentBars: 5, ...opts };
  const name = "volumeClimax";
  if (c.length < o.volLength + 22) return { ...neutral(name, "insufficient data"), buyingClimax: null, sellingClimax: null };
  const bc = buyingClimaxOnly(c, o);
  const sc = buyingClimaxOnly(mirrorCandles(c), o);
  const notes: string[] = [];
  if (bc.note) notes.push(bc.note);
  if (sc.note) notes.push(swapWords(sc.note));
  if (!notes.length) notes.push("no volume climax");
  return { ...result(name, bc.score - sc.score, notes), buyingClimax: bc.info, sellingClimax: sc.info };
}

// ── 20. Composite ───────────────────────────────────────────────────────────

export type ComponentGroup = "trend" | "exhaustion";

export interface CompositeComponent {
  name: string;
  score: number;
  bias: Bias;
  weight: number;
  group: ComponentGroup;
  note: string;
}

export interface CompositeResult {
  score: number;
  bias: Bias;
  /** weighted mean of trend-following components */
  trendScore: number;
  /** weighted mean of exhaustion / reversal components */
  exhaustionScore: number;
  components: CompositeComponent[];
  notes: string[];
}

export interface CompositeOpts {
  /** override default weights by component name */
  weights?: Partial<Record<string, number>>;
  /** skip components that return exactly 0 when averaging (default true) */
  skipZero?: boolean;
  /** blend of trend vs exhaustion groups (default 0.6) */
  trendBlend?: number;
}

/** Default weights. Trend-following tools and exhaustion tools are averaged separately and then blended. */
export const DEFAULT_COMPOSITE_WEIGHTS: Record<string, { weight: number; group: ComponentGroup }> = {
  marketStructure: { weight: 1.0, group: "trend" },
  ichimoku: { weight: 1.0, group: "trend" },
  squeezeMomentum: { weight: 0.9, group: "trend" },
  chandelierExit: { weight: 0.8, group: "trend" },
  macdZeroCross: { weight: 0.7, group: "trend" },
  donchian: { weight: 0.7, group: "trend" },
  deathGoldenCross: { weight: 0.7, group: "trend" },
  vwapBands: { weight: 0.7, group: "trend" },
  parabolicSAR: { weight: 0.6, group: "trend" },
  heikinAshi: { weight: 0.6, group: "trend" },
  keltner: { weight: 0.4, group: "trend" },
  doubleTopBottom: { weight: 0.9, group: "exhaustion" },
  headAndShouldersBoth: { weight: 0.9, group: "exhaustion" },
  liquiditySweep: { weight: 0.8, group: "exhaustion" },
  tdSequential: { weight: 0.8, group: "exhaustion" },
  wedge: { weight: 0.7, group: "exhaustion" },
  volumeClimax: { weight: 0.7, group: "exhaustion" },
  cci: { weight: 0.5, group: "exhaustion" },
  williamsR: { weight: 0.4, group: "exhaustion" },
};

/** Run every indicator once and return the raw results (useful for the engine's factor list). */
export function runAllIndicators(c: Candle[]): IndicatorResult[] {
  return [
    marketStructure(c),
    ichimoku(c),
    squeezeMomentum(c),
    chandelierExit(c),
    macdZeroCross(c),
    donchian(c),
    deathGoldenCross(c),
    vwapBands(c),
    parabolicSAR(c),
    heikinAshi(c),
    keltner(c),
    detectDoubleTopBottom(c),
    detectHeadAndShouldersBoth(c),
    liquiditySweep(c),
    tdSequential(c),
    detectRisingFallingWedge(c),
    volumeClimax(c),
    cci(c),
    williamsR(c),
  ];
}

/**
 * Run every indicator and blend them into one symmetric score.
 * score = trendBlend * trendScore + (1 - trendBlend) * exhaustionScore, each a weight-normalised mean.
 * Because every component is reflection-antisymmetric, mirroring the candles negates
 * the composite exactly. Use `trendScore` and `exhaustionScore` separately to detect
 * "strong uptrend + bearish exhaustion" (short setup forming) vs. "downtrend + no bullish
 * exhaustion" (short continuation).
 */
export function scoreShortSideComposite(c: Candle[], opts: CompositeOpts = {}): CompositeResult {
  const { weights = {}, skipZero = true, trendBlend = 0.6 } = opts;
  const components: CompositeComponent[] = runAllIndicators(c).map((r) => {
    const def = DEFAULT_COMPOSITE_WEIGHTS[r.name] ?? { weight: 0.5, group: "trend" as const };
    const w = weights[r.name] ?? def.weight;
    return { name: r.name, score: r.score, bias: r.bias, weight: w, group: def.group, note: r.notes[0] ?? "" };
  });
  const avg = (group: ComponentGroup) => {
    let sw = 0, ss = 0;
    for (const k of components) {
      if (k.group !== group) continue;
      if (skipZero && k.score === 0) continue;
      sw += k.weight;
      ss += k.weight * k.score;
    }
    return sw > 0 ? ss / sw : 0;
  };
  const trendScore = sround(avg("trend"), 1);
  const exhaustionScore = sround(avg("exhaustion"), 1);
  const score = sround(clampNum(trendBlend * trendScore + (1 - trendBlend) * exhaustionScore, -100, 100), 1);
  const notes: string[] = [`trend ${trendScore >= 0 ? "+" : ""}${trendScore}, exhaustion ${exhaustionScore >= 0 ? "+" : ""}${exhaustionScore}`];
  if (trendScore > 25 && exhaustionScore < -25) notes.push("uptrend with bearish exhaustion: short setup forming, wait for structure break");
  if (trendScore < -25 && exhaustionScore > 25) notes.push("downtrend with bullish exhaustion: long setup forming, wait for structure break");
  if (trendScore < -25 && exhaustionScore <= 0) notes.push("downtrend without bullish exhaustion: short continuation regime");
  if (trendScore > 25 && exhaustionScore >= 0) notes.push("uptrend without bearish exhaustion: long continuation regime");
  for (const k of components) if (Math.abs(k.score) >= 50) notes.push(`${k.name}: ${k.note}`);
  return { score, bias: biasFromScore(score, 15), trendScore, exhaustionScore, components, notes };
}
