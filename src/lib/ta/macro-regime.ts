// Symmetric macro regime scorer over daily candles.
//
// Every bullish pattern in the legacy BTC macro layer (weekly stochastic 80-line, golden cross,
// 21/377 EMA, weekly engulfing) has a bearish mirror here, plus weekly structure, 200-day slope,
// range position and Pi Cycle. Output is a signed score in [-100, 100]; positive = bullish regime.
//
// Pure functions only. No fetching, no caching, no side effects.

export interface DailyCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type RegimeBias = "strong_bear" | "bear" | "lean_bear" | "neutral" | "lean_bull" | "bull" | "strong_bull";

export interface RegimeComponent {
  name: string;
  score: number;
  note: string;
}

export interface CrossState {
  /** +1 = golden (50 > 200), -1 = death (50 < 200), 0 = insufficient data */
  direction: 1 | -1 | 0;
  sma50: number | null;
  sma200: number | null;
  daysSinceCross: number | null;
  crossPrice: number | null;
  /** Fractional return since the cross, signed in price terms (not in cross-direction terms). */
  returnSinceCross: number | null;
  /** Golden: first 10 days did not dip more than 5.5%. Death: first 10 days did not bounce more than 5.5%. */
  cleanStart: boolean | null;
}

export interface StochasticState {
  k: number;
  d: number;
  weeksBelow80: number;
  weeksAbove20: number;
  weeksAbove80: number;
  weeksBelow20: number;
  signal:
    | "BULL_TRIGGER" // K crossed above 80 after >= 8 weeks below
    | "BULL_APPROACH" // K in [70, 80) after >= 8 weeks below 80
    | "BULL_MOMENTUM" // K >= 80 regime
    | "BULL_EXHAUST_RESET" // K rose back above 20 after an extended stay below
    | "BEAR_TRIGGER" // K crossed below 20 after >= 8 weeks above
    | "BEAR_APPROACH" // K in (20, 30] after >= 8 weeks above 20
    | "BEAR_MOMENTUM" // K <= 20 regime
    | "BEAR_EXHAUST" // K fell back below 80 after an extended stay above
    | "NONE";
}

export interface EmaState {
  direction: 1 | -1 | 0;
  ema21: number | null;
  ema377: number | null;
  gap: number | null;
  priceAboveBoth: boolean;
  priceBelowBoth: boolean;
}

export interface WeeklyStructure {
  pattern: "HH_HL" | "LH_LL" | "MIXED" | "NONE";
  lastHighs: number[];
  lastLows: number[];
}

export interface PiCycleState {
  sma111: number | null;
  sma350x2: number | null;
  /** sma111 / (2 * sma350). >= 1 means the top signal has fired. */
  topRatio: number | null;
  topFired: boolean;
  /** Days since 111 SMA crossed above 2x350 SMA (null if it is below or the cross is outside the window). */
  daysSinceTopCross: number | null;
  /** Pi Cycle bottom: 0.745 x 150 SMA vs 471 SMA. Needs 471 days; null when unavailable. */
  bottomRatio: number | null;
  bottomFired: boolean;
  daysSinceBottomCross: number | null;
}

export interface MacroRegimeResult {
  score: number;
  bias: RegimeBias;
  signals: string[];
  components: RegimeComponent[];
  details: {
    cross: CrossState;
    stochastic: StochasticState | null;
    ema21_377: EmaState;
    weeklyEngulfing: 1 | -1 | 0;
    structure: WeeklyStructure;
    sma200SlopePct: number | null;
    rangePosition: number | null;
    drawdownFromHigh: number | null;
    runupFromLow: number | null;
    piCycle: PiCycleState;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

// ── Primitives ──────────────────────────────────────────────────────────────

export function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  if (values.length === 0) return out;
  const k = 2 / (period + 1);
  out.push(values[0]);
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

/** Trailing SMA; entries before `period - 1` are NaN so misaligned comparisons are impossible. */
export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function buildWeeklyCandles(daily: DailyCandle[]): DailyCandle[] {
  const weeks: DailyCandle[] = [];
  let cur: DailyCandle | null = null;
  for (const d of daily) {
    if (new Date(d.time).getUTCDay() === 1 && cur) {
      weeks.push(cur);
      cur = null;
    }
    if (!cur) cur = { ...d };
    else {
      cur.high = Math.max(cur.high, d.high);
      cur.low = Math.min(cur.low, d.low);
      cur.close = d.close;
    }
  }
  if (cur) weeks.push(cur);
  return weeks;
}

// ── 50/200 SMA cross (golden and death, same code path) ─────────────────────

export function computeCross(daily: DailyCandle[]): CrossState {
  const empty: CrossState = { direction: 0, sma50: null, sma200: null, daysSinceCross: null, crossPrice: null, returnSinceCross: null, cleanStart: null };
  if (daily.length < 210) return empty;
  const closes = daily.map((c) => c.close);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const last = closes.length - 1;
  const direction: 1 | -1 = s50[last] > s200[last] ? 1 : -1;

  let crossIdx: number | null = null;
  for (let i = last; i >= 200; i--) {
    const nowAbove = s50[i] > s200[i];
    const prevAbove = s50[i - 1] > s200[i - 1];
    if ((direction === 1) !== nowAbove) break;
    if (nowAbove !== prevAbove) {
      crossIdx = i;
      break;
    }
  }

  if (crossIdx == null) {
    return { direction, sma50: s50[last], sma200: s200[last], daysSinceCross: null, crossPrice: null, returnSinceCross: null, cleanStart: null };
  }
  const crossPrice = closes[crossIdx];
  const first10 = daily.slice(crossIdx, crossIdx + 10);
  let cleanStart: boolean;
  if (direction === 1) {
    const lo = Math.min(...first10.map((c) => c.low));
    cleanStart = (lo - crossPrice) / crossPrice > -0.055;
  } else {
    const hi = Math.max(...first10.map((c) => c.high));
    cleanStart = (hi - crossPrice) / crossPrice < 0.055;
  }
  return {
    direction,
    sma50: s50[last],
    sma200: s200[last],
    daysSinceCross: last - crossIdx,
    crossPrice,
    returnSinceCross: crossPrice > 0 ? (closes[last] - crossPrice) / crossPrice : null,
    cleanStart,
  };
}

function scoreCross(c: CrossState): RegimeComponent {
  if (c.direction === 0) return { name: "sma50_200", score: 0, note: "Insufficient data for 50/200 SMA" };
  const label = c.direction === 1 ? "Golden cross" : "Death cross";
  if (c.daysSinceCross == null || c.returnSinceCross == null) {
    return { name: "sma50_200", score: 10 * c.direction, note: `${label} active (cross date outside window)` };
  }
  // Both crosses are late signals. Full weight for ~6 weeks, then fade. If price has already moved
  // against the cross by >10% the cross has failed and carries little information.
  const ageFactor = c.daysSinceCross <= 45 ? 1 : c.daysSinceCross <= 120 ? 0.7 : 0.5;
  const alignedReturn = c.returnSinceCross * c.direction;
  const failed = alignedReturn < -0.1;
  let score = 10 * ageFactor * (failed ? 0.4 : 1);
  let note = `${label} day ${c.daysSinceCross} (${pct(c.returnSinceCross)} since cross)`;
  if (c.cleanStart && !failed) {
    score += 5;
    note += c.direction === 1 ? ", shallow start (historically strongest)" : ", no relief bounce (historically weakest)";
  }
  if (failed) note += ", price has moved against the cross: faded";
  return { name: "sma50_200", score: Math.round(score) * c.direction, note };
}

// ── Weekly stochastic 80/20 regime ──────────────────────────────────────────

export function computeWeeklyStochastic(weekly: DailyCandle[], kPeriod = 14, dPeriod = 6, smooth = 3): StochasticState | null {
  if (weekly.length < kPeriod + dPeriod + smooth) return null;
  const closes = weekly.map((c) => c.close);
  const highs = weekly.map((c) => c.high);
  const lows = weekly.map((c) => c.low);
  const raw: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    const range = hh - ll;
    raw.push(range > 0 ? ((closes[i] - ll) / range) * 100 : 50);
  }
  const ks: number[] = [];
  for (let i = smooth - 1; i < raw.length; i++) {
    let s = 0;
    for (let j = i - smooth + 1; j <= i; j++) s += raw[j];
    ks.push(s / smooth);
  }
  const ds: number[] = [];
  for (let i = dPeriod - 1; i < ks.length; i++) {
    let s = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) s += ks[j];
    ds.push(s / dPeriod);
  }
  const k = ks[ks.length - 1];
  const d = ds[ds.length - 1];
  const prevK = ks.length >= 2 ? ks[ks.length - 2] : k;

  const streak = (pred: (v: number) => boolean) => {
    let n = 0;
    for (let i = ks.length - 2; i >= 0; i--) {
      if (pred(ks[i])) n++;
      else break;
    }
    return n;
  };
  const weeksBelow80 = streak((v) => v < 80);
  const weeksAbove20 = streak((v) => v > 20);
  const weeksAbove80 = streak((v) => v >= 80);
  const weeksBelow20 = streak((v) => v <= 20);

  let signal: StochasticState["signal"] = "NONE";
  if (k >= 80 && weeksBelow80 >= 8) signal = "BULL_TRIGGER";
  else if (k <= 20 && weeksAbove20 >= 8) signal = "BEAR_TRIGGER";
  else if (k < 80 && prevK >= 80 && weeksAbove80 >= 8) signal = "BEAR_EXHAUST";
  else if (k > 20 && prevK <= 20 && weeksBelow20 >= 8) signal = "BULL_EXHAUST_RESET";
  else if (k >= 70 && k < 80 && weeksBelow80 >= 8) signal = "BULL_APPROACH";
  else if (k > 20 && k <= 30 && weeksAbove20 >= 8) signal = "BEAR_APPROACH";
  else if (k >= 80) signal = "BULL_MOMENTUM";
  else if (k <= 20) signal = "BEAR_MOMENTUM";

  return { k, d, weeksBelow80, weeksAbove20, weeksAbove80, weeksBelow20, signal };
}

function scoreStochastic(s: StochasticState | null): RegimeComponent {
  const name = "weekly_stochastic";
  if (!s) return { name, score: 0, note: "Insufficient weekly data" };
  const kTxt = s.k.toFixed(1);
  switch (s.signal) {
    case "BULL_TRIGGER":
      return { name, score: 15, note: `Weekly stoch K crossed above 80 (${kTxt}) after ${s.weeksBelow80}w below` };
    case "BEAR_TRIGGER":
      return { name, score: -15, note: `Weekly stoch K crossed below 20 (${kTxt}) after ${s.weeksAbove20}w above` };
    case "BEAR_EXHAUST":
      return { name, score: -12, note: `Weekly stoch K lost 80 (${kTxt}) after ${s.weeksAbove80}w overbought: momentum exhaustion` };
    case "BULL_EXHAUST_RESET":
      return { name, score: 12, note: `Weekly stoch K reclaimed 20 (${kTxt}) after ${s.weeksBelow20}w oversold: capitulation reset` };
    case "BULL_APPROACH":
      return { name, score: 8, note: `Weekly stoch K approaching 80 (${kTxt}) after ${s.weeksBelow80}w below` };
    case "BEAR_APPROACH":
      return { name, score: -8, note: `Weekly stoch K approaching 20 (${kTxt}) after ${s.weeksAbove20}w above` };
    case "BULL_MOMENTUM": {
      const extended = s.weeksAbove80 >= 12;
      return { name, score: extended ? 6 : 10, note: `Weekly stoch K in momentum regime (${kTxt})${extended ? `, ${s.weeksAbove80 + 1}w overbought: exhaustion risk` : ""}` };
    }
    case "BEAR_MOMENTUM": {
      const extended = s.weeksBelow20 >= 12;
      return { name, score: extended ? -6 : -10, note: `Weekly stoch K in bear momentum regime (${kTxt})${extended ? `, ${s.weeksBelow20 + 1}w oversold: capitulation risk` : ""}` };
    }
    default:
      return { name, score: 0, note: `Weekly stoch K ${kTxt}, no regime signal` };
  }
}

// ── 21/377 EMA ──────────────────────────────────────────────────────────────

export function computeEma21_377(daily: DailyCandle[]): EmaState {
  if (daily.length < 377) return { direction: 0, ema21: null, ema377: null, gap: null, priceAboveBoth: false, priceBelowBoth: false };
  const closes = daily.map((c) => c.close);
  const e21 = ema(closes, 21);
  const e377 = ema(closes, 377);
  const a = e21[e21.length - 1];
  const b = e377[e377.length - 1];
  const p = closes[closes.length - 1];
  return { direction: a > b ? 1 : -1, ema21: a, ema377: b, gap: a - b, priceAboveBoth: p > a && p > b, priceBelowBoth: p < a && p < b };
}

function scoreEma(e: EmaState): RegimeComponent {
  const name = "ema21_377";
  if (e.direction === 0) return { name, score: 0, note: "Insufficient data for 21/377 EMA" };
  let score = 8 * e.direction;
  let note = `Daily 21/377 EMA ${e.direction === 1 ? "bullish" : "bearish"} (gap ${Math.round(e.gap ?? 0).toLocaleString()})`;
  if (e.direction === 1 && e.priceAboveBoth) {
    score += 3;
    note += ", price above both";
  } else if (e.direction === -1 && e.priceBelowBoth) {
    score -= 3;
    note += ", price below both";
  }
  return { name, score, note };
}

// ── Weekly engulfing ────────────────────────────────────────────────────────

export function computeWeeklyEngulfing(weekly: DailyCandle[]): 1 | -1 | 0 {
  if (weekly.length < 2) return 0;
  const p = weekly[weekly.length - 2];
  const c = weekly[weekly.length - 1];
  if (p.close < p.open && c.close > c.open && c.close > p.open && c.open <= p.close) return 1;
  if (p.close > p.open && c.close < c.open && c.close < p.open && c.open >= p.close) return -1;
  return 0;
}

// ── Weekly swing structure ──────────────────────────────────────────────────

export function computeWeeklyStructure(weekly: DailyCandle[], wing = 2): WeeklyStructure {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = wing; i < weekly.length - wing; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - wing; j <= i + wing; j++) {
      if (j === i) continue;
      if (weekly[j].high >= weekly[i].high) isHigh = false;
      if (weekly[j].low <= weekly[i].low) isLow = false;
    }
    if (isHigh) highs.push(weekly[i].high);
    if (isLow) lows.push(weekly[i].low);
  }
  const lastHighs = highs.slice(-2);
  const lastLows = lows.slice(-2);
  if (lastHighs.length < 2 || lastLows.length < 2) return { pattern: "NONE", lastHighs, lastLows };
  const hh = lastHighs[1] > lastHighs[0];
  const hl = lastLows[1] > lastLows[0];
  const pattern: WeeklyStructure["pattern"] = hh && hl ? "HH_HL" : !hh && !hl ? "LH_LL" : "MIXED";
  return { pattern, lastHighs, lastLows };
}

function scoreStructure(s: WeeklyStructure): RegimeComponent {
  const name = "weekly_structure";
  if (s.pattern === "HH_HL") return { name, score: 8, note: "Weekly higher highs and higher lows" };
  if (s.pattern === "LH_LL") return { name, score: -8, note: "Weekly lower highs and lower lows" };
  if (s.pattern === "MIXED") return { name, score: 0, note: "Weekly structure mixed" };
  return { name, score: 0, note: "Not enough weekly swings" };
}

// ── 200-day SMA slope ───────────────────────────────────────────────────────

export function computeSma200Slope(daily: DailyCandle[], lookback = 20): number | null {
  if (daily.length < 200 + lookback) return null;
  const s = sma(daily.map((c) => c.close), 200);
  const a = s[s.length - 1 - lookback];
  const b = s[s.length - 1];
  return a > 0 ? (b - a) / a : null;
}

function scoreSlope(slope: number | null): RegimeComponent {
  const name = "sma200_slope";
  if (slope == null) return { name, score: 0, note: "Insufficient data for 200 SMA slope" };
  const score = Math.round(clamp((slope / 0.02) * 5, -5, 5));
  return { name, score, note: `200-day SMA ${slope >= 0 ? "rising" : "falling"} (${pct(slope)} over 20d)` };
}

// ── Range position / drawdown regime ────────────────────────────────────────

export function computeRangePosition(daily: DailyCandle[]): { position: number; drawdownFromHigh: number; runupFromLow: number } | null {
  if (daily.length < 30) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of daily) {
    if (c.high > hi) hi = c.high;
    if (c.low < lo) lo = c.low;
  }
  const p = daily[daily.length - 1].close;
  if (hi <= lo) return null;
  return { position: (p - lo) / (hi - lo), drawdownFromHigh: (p - hi) / hi, runupFromLow: (p - lo) / lo };
}

function scoreRange(r: ReturnType<typeof computeRangePosition>): RegimeComponent {
  const name = "range_position";
  if (!r) return { name, score: 0, note: "Insufficient data for range position" };
  const score = Math.round((r.position - 0.5) * 2 * 6);
  const note =
    r.position >= 0.9
      ? `Price within ${((1 - r.position) * 100).toFixed(0)}% of window high (${pct(r.drawdownFromHigh)} from high)`
      : r.position <= 0.1
        ? `Price within ${(r.position * 100).toFixed(0)}% of window low (${pct(r.runupFromLow)} off low)`
        : `Price at ${(r.position * 100).toFixed(0)}% of window range (${pct(r.drawdownFromHigh)} from high)`;
  return { name, score, note };
}

// ── Pi Cycle top / bottom ───────────────────────────────────────────────────

/** Index of the most recent bar where `a` crossed `b` in the direction `cross` ("above" = a moved from <= b to > b). */
function lastCrossIndex(a: number[], b: number[], from: number, cross: "above" | "below"): number | null {
  for (let i = a.length - 1; i > from; i--) {
    if (Number.isNaN(a[i]) || Number.isNaN(b[i - 1])) break;
    const nowAbove = a[i] > b[i];
    const prevAbove = a[i - 1] > b[i - 1];
    if (cross === "above" && nowAbove !== prevAbove && nowAbove) return i;
    if (cross === "below" && nowAbove !== prevAbove && !nowAbove) return i;
    // Stop once the state no longer matches the requested side: the cross we want must be the latest one.
    if (cross === "above" && !nowAbove) break;
    if (cross === "below" && nowAbove) break;
  }
  return null;
}

export function computePiCycle(daily: DailyCandle[]): PiCycleState {
  const closes = daily.map((c) => c.close);
  const last = closes.length - 1;
  const out: PiCycleState = {
    sma111: null, sma350x2: null, topRatio: null, topFired: false, daysSinceTopCross: null,
    bottomRatio: null, bottomFired: false, daysSinceBottomCross: null,
  };
  if (closes.length >= 350) {
    const s111 = sma(closes, 111);
    const s350x2 = sma(closes, 350).map((v) => 2 * v);
    out.sma111 = s111[last];
    out.sma350x2 = s350x2[last];
    out.topRatio = s350x2[last] > 0 ? s111[last] / s350x2[last] : null;
    out.topFired = out.topRatio != null && out.topRatio >= 1;
    if (out.topFired) {
      const idx = lastCrossIndex(s111, s350x2, 349, "above");
      out.daysSinceTopCross = idx == null ? null : last - idx;
    }
  }
  if (closes.length >= 471) {
    const s150x = sma(closes, 150).map((v) => 0.745 * v);
    const s471 = sma(closes, 471);
    out.bottomRatio = s471[last] > 0 ? s150x[last] / s471[last] : null;
    out.bottomFired = out.bottomRatio != null && out.bottomRatio <= 1;
    if (out.bottomFired) {
      const idx = lastCrossIndex(s150x, s471, 470, "below");
      out.daysSinceBottomCross = idx == null ? null : last - idx;
    }
  }
  return out;
}

// Pi Cycle is a cross event, not a level. The top cross is rare and marks cycle tops to within days; after the
// first ~45 days it is simply "post-top" (still bearish, lower weight). The bottom cross only counts while fresh:
// the 0.745x150 SMA sits below the 471 SMA for most of a bear market, which is not itself bullish.
function scorePiCycle(p: PiCycleState): RegimeComponent {
  const name = "pi_cycle";
  if (p.topRatio == null) return { name, score: 0, note: "Insufficient data for Pi Cycle" };
  if (p.topFired) {
    const d = p.daysSinceTopCross;
    const fresh = d != null && d <= 45;
    return { name, score: fresh ? -15 : -8, note: `Pi Cycle Top ${fresh ? `fired ${d}d ago` : "regime (post-top)"} (111 SMA / 2x350 SMA = ${p.topRatio.toFixed(3)})` };
  }
  if (p.bottomFired && p.daysSinceBottomCross != null && p.daysSinceBottomCross <= 45) {
    return { name, score: 12, note: `Pi Cycle Bottom fired ${p.daysSinceBottomCross}d ago (0.745x150 SMA / 471 SMA = ${(p.bottomRatio ?? 0).toFixed(3)})` };
  }
  if (p.topRatio >= 0.95) return { name, score: -8, note: `Pi Cycle Top within 5% (ratio ${p.topRatio.toFixed(3)})` };
  if (p.topRatio >= 0.9) return { name, score: -4, note: `Pi Cycle Top within 10% (ratio ${p.topRatio.toFixed(3)})` };
  if (p.bottomRatio != null && p.bottomRatio > 1 && p.bottomRatio <= 1.05) return { name, score: 3, note: `Pi Cycle Bottom within 5% (ratio ${p.bottomRatio.toFixed(3)})` };
  return { name, score: 0, note: `Pi Cycle Top ratio ${p.topRatio.toFixed(3)}, no cycle signal` };
}

// ── Aggregate ───────────────────────────────────────────────────────────────

export function biasFromScore(score: number): RegimeBias {
  if (score >= 40) return "strong_bull";
  if (score >= 20) return "bull";
  if (score >= 8) return "lean_bull";
  if (score <= -40) return "strong_bear";
  if (score <= -20) return "bear";
  if (score <= -8) return "lean_bear";
  return "neutral";
}

export function computeMacroRegime(dailyCandles: DailyCandle[]): MacroRegimeResult {
  const daily = [...dailyCandles].sort((a, b) => a.time - b.time);
  const weekly = buildWeeklyCandles(daily);

  const cross = computeCross(daily);
  const stochastic = computeWeeklyStochastic(weekly);
  const emaState = computeEma21_377(daily);
  const engulfing = computeWeeklyEngulfing(weekly);
  const structure = computeWeeklyStructure(weekly);
  const slope = computeSma200Slope(daily);
  const range = computeRangePosition(daily);
  const pi = computePiCycle(daily);

  const components: RegimeComponent[] = [
    scoreStochastic(stochastic),
    scoreCross(cross),
    scoreEma(emaState),
    { name: "weekly_engulfing", score: engulfing * 5, note: engulfing === 1 ? "Weekly bullish engulfing" : engulfing === -1 ? "Weekly bearish engulfing" : "No weekly engulfing" },
    scoreStructure(structure),
    scoreSlope(slope),
    scoreRange(range),
    scorePiCycle(pi),
  ];

  // Confluence: stochastic + cross agree (double), + EMA agree (triple). Symmetric in both directions.
  const stochDir = Math.sign(components[0].score);
  const crossDir = cross.direction;
  const emaDir = emaState.direction;
  if (stochDir !== 0 && stochDir === crossDir) {
    components.push({ name: "confluence_double", score: 5 * stochDir, note: `${stochDir === 1 ? "Bullish" : "Bearish"} double: weekly stochastic + 50/200 cross agree` });
    if (emaDir === stochDir) {
      components.push({ name: "confluence_triple", score: 5 * stochDir, note: `${stochDir === 1 ? "Bullish" : "Bearish"} triple: stochastic + 50/200 + 21/377 EMA agree` });
    }
  }

  const raw = components.reduce((s, c) => s + c.score, 0);
  const score = Math.round(clamp(raw, -100, 100));
  const signals = components.filter((c) => c.score !== 0).map((c) => `${c.note} (${c.score > 0 ? "+" : ""}${c.score})`);

  return {
    score,
    bias: biasFromScore(score),
    signals,
    components,
    details: {
      cross,
      stochastic,
      ema21_377: emaState,
      weeklyEngulfing: engulfing,
      structure,
      sma200SlopePct: slope == null ? null : r1(slope * 100),
      rangePosition: range ? r1(range.position * 100) / 100 : null,
      drawdownFromHigh: range ? r1(range.drawdownFromHigh * 100) / 100 : null,
      runupFromLow: range ? r1(range.runupFromLow * 100) / 100 : null,
      piCycle: pi,
    },
  };
}

/**
 * Confidence adjustment for a call given the regime score. Symmetric by construction:
 * macroBonus(s, "LONG") === macroBonus(-s, "SHORT").
 *   aligned regime  -> + min(|s| / 2, 20)   (score 40 = +20, same ceiling as the legacy bonus)
 *   opposing regime -> - min(|s| / 4, 10) once |s| >= 15 (legacy applied -10 flat at >= 15)
 */
export function macroBonus(score: number, callBias: "LONG" | "SHORT" | "WAIT"): number {
  if (callBias === "WAIT" || !Number.isFinite(score) || score === 0) return 0;
  const aligned = callBias === "LONG" ? score : -score;
  if (aligned > 0) return Math.min(Math.round(aligned / 2), 20);
  const against = -aligned;
  if (against < 15) return 0;
  return -Math.min(Math.round(against / 4), 10);
}
