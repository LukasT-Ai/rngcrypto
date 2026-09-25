// Market Map Analysis Engine
// Ports: EMA5 disconnect, EMA5×SMA200 crossover, RSI structure, EMA21 bounce, bounce probabilities, RSI alignment

// ── Indicator helpers (self-contained to avoid coupling with route.ts) ──────

function emaCalc(closes: number[], period: number): number[] {
  if (!closes.length) return [];
  const k = 2 / (period + 1);
  const result = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    result.push(closes[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function smaCalc(closes: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(closes.slice(0, i + 1).reduce((s, v) => s + v, 0) / (i + 1));
    } else {
      result.push(closes.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period);
    }
  }
  return result;
}

function rsiCalc(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) return closes.map(() => 50);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  const result: number[] = [];
  for (let i = 0; i <= period; i++) result.push(50);
  result[period] = 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    result.push(100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss)));
  }
  return result;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function atrCalc(candles: Candle[], period = 14): number[] {
  if (candles.length < 2) return [0];
  const trs = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  const result: number[] = [];
  for (let i = 0; i < trs.length; i++) {
    if (i < period) {
      result.push(trs.slice(0, i + 1).reduce((s, v) => s + v, 0) / (i + 1));
    } else if (i === period) {
      result.push(trs.slice(0, period).reduce((s, v) => s + v, 0) / period);
    } else {
      result.push((result[i - 1] * (period - 1) + trs[i]) / period);
    }
  }
  return result;
}

function last<T>(arr: T[]): T | null {
  return arr.length ? arr[arr.length - 1] : null;
}

function closesFrom(candles: Candle[]): number[] {
  return candles.map(c => c.close);
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface EMA5DisconnectResult {
  price: number;
  ema5: number;
  deviation: number;
  deviationATR: number;
  side: "above" | "below" | "at";
  isDisconnected: boolean;
  daysSinceReconnect: number;
  reconnectWindow: {
    total: number;
    pct3day: number;
    pct5day: number;
    pct7day: number;
  };
  signal: {
    direction: "long" | "short";
    reason: string;
    targetPrice: number;
  } | null;
}

export interface EMA5xSMA200Result {
  ema5: number;
  sma200: number;
  smaPeriod: number;
  price: number;
  isAbove: boolean;
  freshCross: boolean;
  crossType: "bullish" | "bearish" | null;
  daysSinceCross: number;
  ema5Slope: number;
  sma200Slope: number;
  totalCrossovers: number;
  recentCrossovers: {
    type: "bullish" | "bearish";
    dayIdx: number;
    fwdReturn5: number | null;
    fwdReturn10: number | null;
  }[];
}

export interface RSIStructureResult {
  currentRSI: number;
  rsiTrend: "bullish" | "bearish" | "neutral";
  swingHighs: { value: number; barsAgo: number }[];
  swingLows: { value: number; barsAgo: number }[];
  consecutiveHH: number;
  consecutiveHL: number;
  consecutiveLH: number;
  consecutiveLL: number;
  pullbacksHoldAbove50: boolean;
  ralliesFailBelow50: boolean;
  trendline: {
    support: { slope: number; projected: number } | null;
    resistance: { slope: number; projected: number } | null;
    breakDetected: boolean;
    breakType: "support_break" | "resistance_break" | null;
  } | null;
  divergence: {
    type: "bullish" | "bearish" | null;
    description: string | null;
  };
}

export interface EMA21BounceResult {
  price: number;
  ema21: number;
  distancePct: number;
  distanceATR: number;
  isAbove: boolean;
  slopeRising: boolean;
  recentBounce: boolean;
  bounceType: "support_bounce" | "resistance_bounce" | null;
  bounceBar: number | null;
  invalidation: boolean;
  invalidationType: "bullish_invalidated" | "bearish_invalidated" | null;
  bounceSuccessRate: number | null;
  bounceSampleSize: number;
}

interface WindowStat {
  sampleSize: number;
  positivePct: number;
  avgReturn: number;
  medianReturn: number;
  maxDrawdown: number;
  maxGain: number;
}

export interface BounceProbResult {
  currentPrice: number;
  rsiZone: string;
  ema5Side: string;
  sma200Side: string | null;
  windows: Record<string, { all: WindowStat | null; conditioned: WindowStat | null }>;
}

export interface RSIAlignmentResult {
  aligned: boolean;
  direction: "bullish" | "bearish" | null;
  details: {
    rsi1h: number | null;
    rsi4h: number | null;
    rsi1d: number | null;
    conflict?: string;
  };
}

export interface MarketMapResult {
  ema5Disconnect: EMA5DisconnectResult | null;
  ema5xSma200: EMA5xSMA200Result | null;
  rsiStructure: {
    daily: RSIStructureResult | null;
    h4: RSIStructureResult | null;
    h1: RSIStructureResult | null;
  };
  ema21Bounce: EMA21BounceResult | null;
  bounceProbabilities: BounceProbResult | null;
  rsiAlignment: RSIAlignmentResult | null;
  generatedAt: string;
}

// ── 1. Five-Day EMA Disconnect / Reconnect ──────────────────────────────────

function backtestReconnection(
  closes: number[],
  ema5: number[],
  atrValues: number[],
  emaOffset: number,
): { total: number; pct3day: number; pct5day: number; pct7day: number } {
  const reconnections = { within3: 0, within5: 0, within7: 0, total: 0 };
  const alignLen = Math.min(ema5.length, closes.length - emaOffset, atrValues.length);
  if (alignLen < 20) return { total: 0, pct3day: 0, pct5day: 0, pct7day: 0 };

  for (let i = 5; i < alignLen - 7; i++) {
    const closeIdx = i + emaOffset;
    const atrIdx = Math.min(i, atrValues.length - 1);
    const atr = atrValues[atrIdx] || 1;
    const dist = Math.abs(closes[closeIdx] - ema5[i]) / atr;
    if (dist < 1.5) continue;

    reconnections.total++;
    for (let d = 1; d <= 7; d++) {
      const fIdx = i + d;
      if (fIdx >= ema5.length) break;
      const fCloseIdx = fIdx + emaOffset;
      if (fCloseIdx >= closes.length) break;
      const fDist = Math.abs(closes[fCloseIdx] - ema5[fIdx]) / atr;
      if (fDist < 0.5) {
        if (d <= 3) reconnections.within3++;
        if (d <= 5) reconnections.within5++;
        if (d <= 7) reconnections.within7++;
        break;
      }
    }
  }

  return {
    total: reconnections.total,
    pct3day: reconnections.total > 0 ? Math.round((reconnections.within3 / reconnections.total) * 100) : 0,
    pct5day: reconnections.total > 0 ? Math.round((reconnections.within5 / reconnections.total) * 100) : 0,
    pct7day: reconnections.total > 0 ? Math.round((reconnections.within7 / reconnections.total) * 100) : 0,
  };
}

export function analyzeEMA5Disconnect(dailyCandles: Candle[]): EMA5DisconnectResult | null {
  if (dailyCandles.length < 30) return null;

  const closes = closesFrom(dailyCandles);
  const ema5 = emaCalc(closes, 5);
  const atrValues = atrCalc(dailyCandles, 14);

  if (!ema5.length || !atrValues.length) return null;

  const price = closes[closes.length - 1];
  const currentEMA5 = ema5[ema5.length - 1];
  const currentATR = last(atrValues) || 0;
  if (currentATR <= 0) return null;

  const deviation = price - currentEMA5;
  const deviationPct = (deviation / currentEMA5) * 100;
  const deviationATR = deviation / currentATR;

  const isDisconnected = Math.abs(deviationATR) >= 1.5;
  const side: "above" | "below" | "at" = deviation > 0 ? "above" : deviation < 0 ? "below" : "at";

  let daysSinceReconnect = 0;
  const lookback = Math.min(ema5.length, 20);
  for (let i = 1; i <= lookback; i++) {
    const idx = ema5.length - 1 - i;
    const closeIdx = closes.length - 1 - i;
    if (idx < 0 || closeIdx < 0) break;
    const dist = Math.abs(closes[closeIdx] - ema5[idx]);
    const atrIdx = atrValues.length - 1 - i;
    const atr = atrIdx >= 0 ? atrValues[atrIdx] : currentATR;
    if (atr > 0 && dist / atr < 0.3) break;
    daysSinceReconnect++;
  }

  const stats = backtestReconnection(closes, ema5, atrValues, 4);

  let signal: EMA5DisconnectResult["signal"] = null;
  if (isDisconnected) {
    if (side === "below") {
      signal = {
        direction: "long",
        reason: `Price ${Math.abs(deviationPct).toFixed(1)}% below 5-day EMA (${Math.abs(deviationATR).toFixed(1)} ATR)`,
        targetPrice: currentEMA5,
      };
    } else if (side === "above") {
      signal = {
        direction: "short",
        reason: `Price ${deviationPct.toFixed(1)}% above 5-day EMA (${deviationATR.toFixed(1)} ATR)`,
        targetPrice: currentEMA5,
      };
    }
  }

  return {
    price, ema5: currentEMA5, deviation: deviationPct, deviationATR,
    side, isDisconnected, daysSinceReconnect, reconnectWindow: stats, signal,
  };
}

// ── 2. Five-Day EMA × 200-Day SMA Crossover ────────────────────────────────

export function analyzeEMA5xSMA200(dailyCandles: Candle[]): EMA5xSMA200Result | null {
  if (dailyCandles.length < 60) return null;

  const closes = closesFrom(dailyCandles);
  const ema5 = emaCalc(closes, 5);
  const smaPeriod = Math.min(200, closes.length - 5);
  const sma200 = smaCalc(closes, smaPeriod);

  if (!ema5.length || !sma200.length) return null;

  const sma200Start = smaPeriod - 1;
  const ema5Start = 4;
  const alignStart = sma200Start;
  const ema5Off = alignStart - ema5Start;
  const alignLen = Math.min(ema5.length - ema5Off, sma200.length);

  if (alignLen < 2) return null;

  const currentEMA5 = ema5[ema5Off + alignLen - 1];
  const currentSMA200 = sma200[alignLen - 1];
  const prevEMA5 = ema5[ema5Off + alignLen - 2];
  const prevSMA200 = sma200[alignLen - 2];
  const price = closes[closes.length - 1];

  const isAbove = currentEMA5 > currentSMA200;
  const wasAbove = prevEMA5 > prevSMA200;
  const freshCross = isAbove !== wasAbove;

  let crossType: "bullish" | "bearish" | null = freshCross ? (isAbove ? "bullish" : "bearish") : null;
  let daysSinceCross = 0;

  for (let i = alignLen - 2; i >= 1; i--) {
    const above = ema5[ema5Off + i] > sma200[i];
    const prevAbove = ema5[ema5Off + i - 1] > sma200[i - 1];
    if (above !== prevAbove) {
      daysSinceCross = alignLen - 1 - i;
      if (!crossType) crossType = above ? "bullish" : "bearish";
      break;
    }
  }

  const crossHistory: EMA5xSMA200Result["recentCrossovers"] = [];
  for (let i = 1; i < alignLen; i++) {
    const above = ema5[ema5Off + i] > sma200[i];
    const prevAbove = ema5[ema5Off + i - 1] > sma200[i - 1];
    if (above !== prevAbove) {
      const closeIdx = alignStart + i;
      let fwdReturn5: number | null = null, fwdReturn10: number | null = null;
      if (closeIdx + 5 < closes.length)
        fwdReturn5 = ((closes[closeIdx + 5] - closes[closeIdx]) / closes[closeIdx]) * 100;
      if (closeIdx + 10 < closes.length)
        fwdReturn10 = ((closes[closeIdx + 10] - closes[closeIdx]) / closes[closeIdx]) * 100;
      crossHistory.push({ type: above ? "bullish" : "bearish", dayIdx: i, fwdReturn5, fwdReturn10 });
    }
  }

  const ema5Slope = ema5.length >= 3
    ? ((ema5[ema5.length - 1] - ema5[ema5.length - 3]) / ema5[ema5.length - 3]) * 100 : 0;
  const sma200Slope = sma200.length >= 5
    ? ((sma200[sma200.length - 1] - sma200[sma200.length - 5]) / sma200[sma200.length - 5]) * 100 : 0;

  return {
    ema5: currentEMA5, sma200: currentSMA200, smaPeriod, price,
    isAbove, freshCross, crossType, daysSinceCross,
    ema5Slope, sma200Slope,
    totalCrossovers: crossHistory.length,
    recentCrossovers: crossHistory.slice(-5),
  };
}

// ── 3. RSI Market Structure Engine ──────────────────────────────────────────

function detectRSITrendline(
  rsi: number[],
  swingHighs: { value: number; index: number }[],
  swingLows: { value: number; index: number }[]
): RSIStructureResult["trendline"] {
  if (swingLows.length < 2 && swingHighs.length < 2) return null;

  const result: RSIStructureResult["trendline"] = {
    support: null, resistance: null, breakDetected: false, breakType: null,
  };

  if (swingLows.length >= 2) {
    const l1 = swingLows[swingLows.length - 2];
    const l2 = swingLows[swingLows.length - 1];
    const slope = (l2.value - l1.value) / (l2.index - l1.index);
    const projectedNow = l2.value + slope * (rsi.length - 1 - l2.index);
    result.support = { slope: Math.round(slope * 1000) / 1000, projected: Math.round(projectedNow * 10) / 10 };

    if (rsi[rsi.length - 1] < projectedNow && rsi.length >= 2 && rsi[rsi.length - 2] >= projectedNow + slope) {
      result.breakDetected = true;
      result.breakType = "support_break";
    }
  }

  if (swingHighs.length >= 2) {
    const h1 = swingHighs[swingHighs.length - 2];
    const h2 = swingHighs[swingHighs.length - 1];
    const slope = (h2.value - h1.value) / (h2.index - h1.index);
    const projectedNow = h2.value + slope * (rsi.length - 1 - h2.index);
    result.resistance = { slope: Math.round(slope * 1000) / 1000, projected: Math.round(projectedNow * 10) / 10 };

    if (rsi[rsi.length - 1] > projectedNow && rsi.length >= 2 && rsi[rsi.length - 2] <= projectedNow + slope) {
      result.breakDetected = true;
      result.breakType = "resistance_break";
    }
  }

  return result;
}

function detectRSIPriceDivergence(
  closes: number[],
  rsi: number[],
  rsiHighs: { value: number; index: number }[],
  rsiLows: { value: number; index: number }[],
  period: number
): RSIStructureResult["divergence"] {
  const rsiOffset = period;
  const result: RSIStructureResult["divergence"] = { type: null, description: null };

  if (rsiLows.length >= 2) {
    const l1 = rsiLows[rsiLows.length - 2];
    const l2 = rsiLows[rsiLows.length - 1];
    const p1Idx = l1.index + rsiOffset;
    const p2Idx = l2.index + rsiOffset;
    if (p1Idx < closes.length && p2Idx < closes.length) {
      if (closes[p2Idx] < closes[p1Idx] && l2.value > l1.value) {
        result.type = "bullish";
        result.description = `Price made lower low but RSI made higher low (${l1.value.toFixed(0)} → ${l2.value.toFixed(0)})`;
      }
    }
  }

  if (rsiHighs.length >= 2 && !result.type) {
    const h1 = rsiHighs[rsiHighs.length - 2];
    const h2 = rsiHighs[rsiHighs.length - 1];
    const p1Idx = h1.index + rsiOffset;
    const p2Idx = h2.index + rsiOffset;
    if (p1Idx < closes.length && p2Idx < closes.length) {
      if (closes[p2Idx] > closes[p1Idx] && h2.value < h1.value) {
        result.type = "bearish";
        result.description = `Price made higher high but RSI made lower high (${h1.value.toFixed(0)} → ${h2.value.toFixed(0)})`;
      }
    }
  }

  return result;
}

export function analyzeRSIStructure(candles: Candle[], period = 14): RSIStructureResult | null {
  if (candles.length < 50) return null;

  const closes = closesFrom(candles);
  const rsi = rsiCalc(closes, period);
  if (rsi.length < 20) return null;

  const strength = 3;
  const swingHighs: { value: number; index: number }[] = [];
  const swingLows: { value: number; index: number }[] = [];

  for (let i = strength; i < rsi.length - strength; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= strength; j++) {
      if (rsi[i] <= rsi[i - j] || rsi[i] <= rsi[i + j]) isHigh = false;
      if (rsi[i] >= rsi[i - j] || rsi[i] >= rsi[i + j]) isLow = false;
    }
    if (isHigh) swingHighs.push({ value: rsi[i], index: i });
    if (isLow) swingLows.push({ value: rsi[i], index: i });
  }

  let rsiTrend: "bullish" | "bearish" | "neutral" = "neutral";
  let consecutiveHH = 0, consecutiveHL = 0;
  let consecutiveLH = 0, consecutiveLL = 0;

  const recentHighs = swingHighs.slice(-4);
  const recentLows = swingLows.slice(-4);

  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i].value > recentHighs[i - 1].value) consecutiveHH++;
    else consecutiveLH++;
  }
  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i].value > recentLows[i - 1].value) consecutiveHL++;
    else consecutiveLL++;
  }

  if ((consecutiveHH >= 2 && consecutiveHL >= 1) || (consecutiveHH >= 1 && consecutiveHL >= 2)) rsiTrend = "bullish";
  else if ((consecutiveLH >= 2 && consecutiveLL >= 1) || (consecutiveLH >= 1 && consecutiveLL >= 2)) rsiTrend = "bearish";

  const currentRSI = rsi[rsi.length - 1];
  const pullbacksHoldAbove50 = recentLows.length >= 2 && recentLows.every(l => l.value > 45);
  const ralliesFailBelow50 = recentHighs.length >= 2 && recentHighs.every(h => h.value < 55);
  const trendline = detectRSITrendline(rsi, swingHighs, swingLows);
  const divergence = detectRSIPriceDivergence(closes, rsi, swingHighs, swingLows, period);

  return {
    currentRSI,
    rsiTrend,
    swingHighs: recentHighs.map(h => ({ value: Math.round(h.value * 10) / 10, barsAgo: rsi.length - 1 - h.index })),
    swingLows: recentLows.map(l => ({ value: Math.round(l.value * 10) / 10, barsAgo: rsi.length - 1 - l.index })),
    consecutiveHH, consecutiveHL, consecutiveLH, consecutiveLL,
    pullbacksHoldAbove50, ralliesFailBelow50,
    trendline, divergence,
  };
}

// ── 4. 21-Day EMA Bounce Invalidation ───────────────────────────────────────

export function analyzeEMA21Bounce(dailyCandles: Candle[]): EMA21BounceResult | null {
  if (dailyCandles.length < 30) return null;

  const closes = closesFrom(dailyCandles);
  const ema21 = emaCalc(closes, 21);
  const atrValues = atrCalc(dailyCandles, 14);
  if (!ema21.length || !atrValues.length) return null;

  const price = closes[closes.length - 1];
  const currentEMA21 = ema21[ema21.length - 1];
  const currentATR = last(atrValues) || 0;
  if (currentATR <= 0) return null;

  const distanceATR = (price - currentEMA21) / currentATR;
  const distancePct = ((price - currentEMA21) / currentEMA21) * 100;
  const isAbove = price > currentEMA21;
  const slopeRising = ema21.length >= 5 && ema21[ema21.length - 1] > ema21[ema21.length - 5];

  let recentBounce = false;
  let bounceType: EMA21BounceResult["bounceType"] = null;
  let bounceBar: number | null = null;

  for (let i = 1; i <= 5 && i < ema21.length; i++) {
    const idx = ema21.length - 1 - i;
    const closeIdx = closes.length - 1 - i;
    if (idx < 0 || closeIdx < 0) break;
    const dist = Math.abs(closes[closeIdx] - ema21[idx]);
    const atrIdx = atrValues.length - 1 - i;
    const atr = atrIdx >= 0 ? atrValues[atrIdx] : currentATR;
    if (atr > 0 && dist / atr < 0.3) {
      recentBounce = true;
      bounceBar = i;
      bounceType = closes[closeIdx] > ema21[idx] ? "support_bounce" : "resistance_bounce";
      break;
    }
  }

  let invalidation = false;
  let invalidationType: EMA21BounceResult["invalidationType"] = null;
  if (ema21.length >= 3) {
    const prev2Above = closes[closes.length - 3] > ema21[ema21.length - 3];
    const prev1Above = closes[closes.length - 2] > ema21[ema21.length - 2];
    const nowAbove = price > currentEMA21;
    if (prev2Above && prev1Above && !nowAbove) {
      invalidation = true;
      invalidationType = "bullish_invalidated";
    } else if (!prev2Above && !prev1Above && nowAbove) {
      invalidation = true;
      invalidationType = "bearish_invalidated";
    }
  }

  let bounceSuccess = 0, bounceTotal = 0;
  const emaOff = 20;
  for (let i = 5; i < ema21.length - 10; i++) {
    const cIdx = i + emaOff;
    if (cIdx >= closes.length) break;
    const atrIdx = Math.min(i, atrValues.length - 1);
    const atr = atrValues[atrIdx] || 1;
    const dist = Math.abs(closes[cIdx] - ema21[i]) / atr;
    if (dist > 0.3) continue;

    const wasAbove = closes[cIdx] > ema21[i];
    bounceTotal++;
    for (let d = 1; d <= 5; d++) {
      const fCIdx = cIdx + d;
      const fEmaIdx = i + d;
      if (fCIdx >= closes.length || fEmaIdx >= ema21.length) break;
      if (wasAbove && closes[fCIdx] > ema21[fEmaIdx]) { bounceSuccess++; break; }
      if (!wasAbove && closes[fCIdx] < ema21[fEmaIdx]) { bounceSuccess++; break; }
    }
  }

  return {
    price, ema21: currentEMA21, distancePct, distanceATR,
    isAbove, slopeRising, recentBounce, bounceType, bounceBar,
    invalidation, invalidationType,
    bounceSuccessRate: bounceTotal > 0 ? Math.round((bounceSuccess / bounceTotal) * 100) : null,
    bounceSampleSize: bounceTotal,
  };
}

// ── 5. Historical Bounce Probabilities ──────────────────────────────────────

export function analyzeBounceProbabilities(dailyCandles: Candle[]): BounceProbResult | null {
  if (dailyCandles.length < 100) return null;

  const closes = closesFrom(dailyCandles);
  const ema5 = emaCalc(closes, 5);
  const smaPeriod = Math.min(200, closes.length - 5);
  const sma200 = smaPeriod >= 20 ? smaCalc(closes, smaPeriod) : [];
  const rsi = rsiCalc(closes, 14);

  const windows = [1, 3, 5, 7, 10];
  const currentRSI = last(rsi) ?? 50;
  const currentEMA5 = last(ema5) ?? 0;
  const currentSMA200 = last(sma200);

  const rsiZone = currentRSI < 30 ? "oversold" : currentRSI < 40 ? "low" : currentRSI < 60 ? "neutral" : currentRSI < 70 ? "high" : "overbought";
  const ema5Side = closes[closes.length - 1] > currentEMA5 ? "above" : "below";
  const sma200Side = currentSMA200 != null ? (closes[closes.length - 1] > currentSMA200 ? "above" : "below") : null;

  const rsiOff = 14;
  const allReturns: Record<number, number[]> = {};
  const filteredReturns: Record<number, number[]> = {};
  for (const w of windows) { allReturns[w] = []; filteredReturns[w] = []; }

  for (let i = 0; i < closes.length - 10; i++) {
    const rsiIdx = i - rsiOff;
    let matchesCondition = false;
    if (rsiIdx >= 0 && rsiIdx < rsi.length) {
      const histRSI = rsi[rsiIdx];
      const histZone = histRSI < 30 ? "oversold" : histRSI < 40 ? "low" : histRSI < 60 ? "neutral" : histRSI < 70 ? "high" : "overbought";
      if (histZone === rsiZone) matchesCondition = true;
    }
    for (const w of windows) {
      if (i + w >= closes.length) continue;
      const ret = ((closes[i + w] - closes[i]) / closes[i]) * 100;
      allReturns[w].push(ret);
      if (matchesCondition) filteredReturns[w].push(ret);
    }
  }

  const computeStats = (arr: number[]): WindowStat | null => {
    if (!arr.length) return null;
    const positive = arr.filter(r => r > 0).length;
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      sampleSize: arr.length,
      positivePct: Math.round((positive / arr.length) * 100),
      avgReturn: Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 100) / 100,
      medianReturn: Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100,
      maxDrawdown: Math.round(sorted[0] * 100) / 100,
      maxGain: Math.round(sorted[sorted.length - 1] * 100) / 100,
    };
  };

  const stats: BounceProbResult["windows"] = {};
  for (const w of windows) {
    stats[`${w}d`] = { all: computeStats(allReturns[w]), conditioned: computeStats(filteredReturns[w]) };
  }

  return { currentPrice: closes[closes.length - 1], rsiZone, ema5Side, sma200Side, windows: stats };
}

// ── 6. RSI Multi-Timeframe Alignment ────────────────────────────────────────

export function analyzeRSIAlignment(rsi1h: number[], rsi4h: number[], rsi1d: number[]): RSIAlignmentResult {
  const r1h = last(rsi1h);
  const r4h = last(rsi4h);
  const r1d = last(rsi1d);

  const result: RSIAlignmentResult = {
    aligned: false,
    direction: null,
    details: { rsi1h: r1h, rsi4h: r4h, rsi1d: r1d },
  };

  if (r1h == null || r4h == null) return result;

  const allBullish = r1h > 50 && r4h > 50 && (r1d == null || r1d > 50);
  const allBearish = r1h < 50 && r4h < 50 && (r1d == null || r1d < 50);

  if (allBullish) { result.aligned = true; result.direction = "bullish"; }
  else if (allBearish) { result.aligned = true; result.direction = "bearish"; }

  if (r1h > 55 && r4h < 45) result.details.conflict = "1h bullish / 4h bearish";
  else if (r1h < 45 && r4h > 55) result.details.conflict = "1h bearish / 4h bullish";

  return result;
}

// ── Full Market Map Builder ─────────────────────────────────────────────────

export function buildMarketMap(dailyCandles: Candle[], candles1h: Candle[], candles4h: Candle[]): MarketMapResult {
  const map: MarketMapResult = {
    ema5Disconnect: null,
    ema5xSma200: null,
    rsiStructure: { daily: null, h4: null, h1: null },
    ema21Bounce: null,
    bounceProbabilities: null,
    rsiAlignment: null,
    generatedAt: new Date().toISOString(),
  };

  if (dailyCandles.length >= 30) {
    map.ema5Disconnect = analyzeEMA5Disconnect(dailyCandles);
    map.ema21Bounce = analyzeEMA21Bounce(dailyCandles);

    const dailyCloses = closesFrom(dailyCandles);
    const dailyRSI = rsiCalc(dailyCloses, 14);
    map.rsiStructure.daily = analyzeRSIStructure(dailyCandles);

    if (dailyCandles.length >= 60) map.ema5xSma200 = analyzeEMA5xSMA200(dailyCandles);
    if (dailyCandles.length >= 100) map.bounceProbabilities = analyzeBounceProbabilities(dailyCandles);

    const rsi1h = candles1h.length >= 30 ? rsiCalc(closesFrom(candles1h), 14) : [];
    const rsi4h = candles4h.length >= 30 ? rsiCalc(closesFrom(candles4h), 14) : [];
    map.rsiAlignment = analyzeRSIAlignment(rsi1h, rsi4h, dailyRSI);
  }

  if (candles4h.length >= 50) map.rsiStructure.h4 = analyzeRSIStructure(candles4h);
  if (candles1h.length >= 50) map.rsiStructure.h1 = analyzeRSIStructure(candles1h);

  return map;
}
