import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { appendSignal } from "./history/logger";
import { computeCatalystScore } from "@/lib/economic-calendar";
import { getNewsSentiment, type NewsSentimentResult } from "@/lib/news-sentiment";

export const dynamic = "force-dynamic";

// ── Symbol Configuration ────────────────────────────────────────────────────

const SYMBOL_MAP: Record<
  string,
  { strike: string; decimals: number; isCrypto: boolean; label: string; binance?: string; okx?: string }
> = {
  BTC: { strike: "BTC-USD", decimals: 1, isCrypto: true, label: "Bitcoin", binance: "BTCUSDT", okx: "BTC" },
  ETH: { strike: "ETH-USD", decimals: 2, isCrypto: true, label: "Ethereum", binance: "ETHUSDT", okx: "ETH" },
  BNB: { strike: "BNB-USD", decimals: 2, isCrypto: true, label: "BNB", binance: "BNBUSDT", okx: "BNB" },
  ADA: { strike: "ADA-USD", decimals: 5, isCrypto: true, label: "Cardano", binance: "ADAUSDT", okx: "ADA" },
  HYPE: { strike: "HYPE-USD", decimals: 3, isCrypto: true, label: "Hyperliquid", okx: "HYPE" },
  ZEC: { strike: "ZEC-USD", decimals: 2, isCrypto: true, label: "Zcash", binance: "ZECUSDT", okx: "ZEC" },
  PUMP: { strike: "PUMP-USD", decimals: 6, isCrypto: true, label: "PumpFun", okx: "PUMP" },
  NIGHT: { strike: "NIGHT-USD", decimals: 5, isCrypto: true, label: "Night", okx: "NIGHT" },
  SKHYNIX: { strike: "SKHYNIX-USD", decimals: 2, isCrypto: false, label: "SK Hynix" },
  GOLD: { strike: "XAU-USD", decimals: 2, isCrypto: false, label: "Gold" },
  XRP: { strike: "XRP-USD", decimals: 4, isCrypto: true, label: "XRP", binance: "XRPUSDT", okx: "XRP" },
  SOL: { strike: "SOL-USD", decimals: 2, isCrypto: true, label: "Solana", binance: "SOLUSDT", okx: "SOL" },
  NEAR: { strike: "NEAR-USD", decimals: 4, isCrypto: true, label: "NEAR", binance: "NEARUSDT", okx: "NEAR" },
  OIL: { strike: "WTI-USD", decimals: 2, isCrypto: false, label: "WTI Oil" },
  SILVER: { strike: "XAG-USD", decimals: 3, isCrypto: false, label: "Silver" },
  TSLA: { strike: "TSLA-USD", decimals: 2, isCrypto: false, label: "Tesla" },
  NVDA: { strike: "NVDA-USD", decimals: 2, isCrypto: false, label: "Nvidia" },
  GOOGL: { strike: "GOOGL-USD", decimals: 2, isCrypto: false, label: "Google" },
  COIN: { strike: "COIN-USD", decimals: 2, isCrypto: false, label: "Coinbase" },
  MU: { strike: "MU-USD", decimals: 2, isCrypto: false, label: "Micron" },
  CRCL: { strike: "CRCL-USD", decimals: 4, isCrypto: true, label: "Circle" },
  MINIMAX: { strike: "MINIMAX-USD", decimals: 4, isCrypto: true, label: "MiniMax" },
  SPCX: { strike: "SPCX-USD", decimals: 2, isCrypto: true, label: "SpaceX" },
  DRAM: { strike: "DRAM-USD", decimals: 4, isCrypto: true, label: "DRAM" },
  SP500: { strike: "SP500-USD", decimals: 1, isCrypto: false, label: "S&P 500" },
  NAS100: { strike: "NAS100-USD", decimals: 1, isCrypto: false, label: "Nasdaq 100" },
  AAOI: { strike: "AAOI-USD", decimals: 2, isCrypto: false, label: "AAOI" },
  SNDK: { strike: "SNDK-USD", decimals: 2, isCrypto: false, label: "SanDisk" },
  UNITREE: { strike: "UNITREE-USD", decimals: 2, isCrypto: false, label: "Unitree" },
  ZHIPU: { strike: "ZHIPU-USD", decimals: 2, isCrypto: false, label: "Zhipu AI" },
  CXMT: { strike: "CXMT-USD", decimals: 2, isCrypto: false, label: "CXMT" },
};

// ── Cache (per-symbol) ──────────────────────────────────────────────────────

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 25_000;

// ── Types ────────────────────────────────────────────────────────────────────

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SignalFactor {
  category: string;
  assessment: string;
  weight: number;
}

// ── Parse helpers ────────────────────────────────────────────────────────────

function parseKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((k: number[]) => ({
    time: k[0],
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5] ?? 0)),
  }));
}

function round(n: number, decimals = 1): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function tip(arr: number[]): number {
  return arr.length > 0 ? arr[arr.length - 1] : 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Technical Indicators ─────────────────────────────────────────────────────

function ema(closes: number[], period: number): number[] {
  const result: number[] = [];
  if (closes.length === 0) return result;
  const k = 2 / (period + 1);
  result.push(closes[0]);
  for (let i = 1; i < closes.length; i++) {
    result.push(closes[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function smaArray(arr: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) {
      result.push(arr.slice(0, i + 1).reduce((s, v) => s + v, 0) / (i + 1));
    } else {
      const slice = arr.slice(i - period + 1, i + 1);
      result.push(slice.reduce((s, v) => s + v, 0) / period);
    }
  }
  return result;
}

function smaValue(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  const slice = arr.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function computeRSI(closes: number[], period = 14): number[] {
  const result: number[] = [];
  if (closes.length < period + 1) return closes.map(() => 50);

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = 0; i <= period; i++) result.push(50);
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result[period] = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const r = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + r));
  }
  return result;
}

function computeStochRSI(
  rsiArr: number[],
  period = 14,
  kPeriod = 3,
  dPeriod = 3
): { k: number; d: number } {
  if (rsiArr.length < period) return { k: 50, d: 50 };

  const stochVals: number[] = [];
  for (let i = period - 1; i < rsiArr.length; i++) {
    const window = rsiArr.slice(i - period + 1, i + 1);
    const min = Math.min(...window);
    const max = Math.max(...window);
    const range = max - min;
    stochVals.push(range === 0 ? 50 : ((rsiArr[i] - min) / range) * 100);
  }

  const kLine = smaArray(stochVals, kPeriod);
  const dLine = smaArray(kLine, dPeriod);

  return {
    k: Math.round(tip(kLine) * 100) / 100,
    d: Math.round(tip(dLine) * 100) / 100,
  };
}

function computeMACD(closes: number[]): {
  macd: number[];
  signal: number[];
  histogram: number[];
} {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(ema12[i] - ema26[i]);
  }
  const signalLine = ema(macdLine, 9);
  const histogram: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    histogram.push(macdLine[i] - signalLine[i]);
  }
  return { macd: macdLine, signal: signalLine, histogram };
}

function computeATR(candles: Candle[], period = 14): number[] {
  const result: number[] = [0];
  if (candles.length < 2) return result;

  const trs: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }

  const atrVals: number[] = [];
  for (let i = 0; i < trs.length; i++) {
    if (i < period) {
      atrVals.push(trs.slice(0, i + 1).reduce((s, v) => s + v, 0) / (i + 1));
    } else if (i === period) {
      atrVals.push(trs.slice(0, period).reduce((s, v) => s + v, 0) / period);
    } else {
      atrVals.push((atrVals[i - 1] * (period - 1) + trs[i]) / period);
    }
  }
  return atrVals;
}

function computeADX(candles: Candle[], period = 14): number[] {
  if (candles.length < period + 1) return candles.map(() => 25);

  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const trs: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      )
    );
  }

  const smoothTR: number[] = [];
  const smoothPlusDM: number[] = [];
  const smoothMinusDM: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      smoothTR.push(trs.slice(0, i + 1).reduce((s, v) => s + v, 0));
      smoothPlusDM.push(plusDM.slice(0, i + 1).reduce((s, v) => s + v, 0));
      smoothMinusDM.push(minusDM.slice(0, i + 1).reduce((s, v) => s + v, 0));
    } else if (i === period) {
      smoothTR.push(trs.slice(0, period).reduce((s, v) => s + v, 0));
      smoothPlusDM.push(plusDM.slice(0, period).reduce((s, v) => s + v, 0));
      smoothMinusDM.push(
        minusDM.slice(0, period).reduce((s, v) => s + v, 0)
      );
    } else {
      smoothTR.push(smoothTR[i - 1] - smoothTR[i - 1] / period + trs[i]);
      smoothPlusDM.push(
        smoothPlusDM[i - 1] - smoothPlusDM[i - 1] / period + plusDM[i]
      );
      smoothMinusDM.push(
        smoothMinusDM[i - 1] - smoothMinusDM[i - 1] / period + minusDM[i]
      );
    }
  }

  const dx: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const tr = smoothTR[i] || 1;
    const pdi = (smoothPlusDM[i] / tr) * 100;
    const mdi = (smoothMinusDM[i] / tr) * 100;
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
  }

  const adx: number[] = [];
  for (let i = 0; i < dx.length; i++) {
    if (i < 2 * period - 1) {
      adx.push(dx.slice(0, i + 1).reduce((s, v) => s + v, 0) / (i + 1));
    } else if (i === 2 * period - 1) {
      adx.push(
        dx.slice(period, 2 * period).reduce((s, v) => s + v, 0) / period
      );
    } else {
      adx.push((adx[i - 1] * (period - 1) + dx[i]) / period);
    }
  }
  return adx;
}

function computeBB(
  closes: number[],
  period = 20,
  mult = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(closes[i]);
      middle.push(closes[i]);
      lower.push(closes[i]);
    } else {
      const slice = closes.slice(i - period + 1, i + 1);
      const avg = slice.reduce((s, v) => s + v, 0) / period;
      const variance =
        slice.reduce((s, v) => s + (v - avg) ** 2, 0) / period;
      const sd = Math.sqrt(variance);
      middle.push(avg);
      upper.push(avg + mult * sd);
      lower.push(avg - mult * sd);
    }
  }
  return { upper, middle, lower };
}

function computeSupertrend(
  candles: Candle[],
  period = 10,
  multiplier = 3
): number {
  const atr = computeATR(candles, period);
  if (candles.length < period + 1) return 1;

  let direction = 1;
  let upperBand =
    (candles[period].high + candles[period].low) / 2 +
    multiplier * atr[period];
  let lowerBand =
    (candles[period].high + candles[period].low) / 2 -
    multiplier * atr[period];

  for (let i = period + 1; i < candles.length; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const newUpper = hl2 + multiplier * atr[i];
    const newLower = hl2 - multiplier * atr[i];

    upperBand =
      newUpper < upperBand || candles[i - 1].close > upperBand
        ? newUpper
        : upperBand;
    lowerBand =
      newLower > lowerBand || candles[i - 1].close < lowerBand
        ? newLower
        : lowerBand;

    if (direction === 1 && candles[i].close < lowerBand) direction = -1;
    else if (direction === -1 && candles[i].close > upperBand) direction = 1;
  }
  return direction;
}

// ── Support / Resistance ─────────────────────────────────────────────────────

function findSwingLevelsFromCandles(
  candles: Candle[],
  lookback = 2,
  depth = 50
): { rawSupports: number[]; rawResistances: number[] } {
  const supports: number[] = [];
  const resistances: number[] = [];
  const slice = candles.slice(-depth);

  for (let i = lookback; i < slice.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (
        slice[i].high <= slice[i - j].high ||
        slice[i].high <= slice[i + j].high
      )
        isHigh = false;
      if (
        slice[i].low >= slice[i - j].low ||
        slice[i].low >= slice[i + j].low
      )
        isLow = false;
    }
    if (isHigh) resistances.push(slice[i].high);
    if (isLow) supports.push(slice[i].low);
  }

  return { rawSupports: supports, rawResistances: resistances };
}

function findMultiTFLevels(
  candles15m: Candle[],
  candles1h: Candle[],
  candles4h: Candle[],
  referencePrice?: number
): { supports: number[]; resistances: number[] } {
  const tf15m = findSwingLevelsFromCandles(candles15m, 2, 50);
  const tf1h = findSwingLevelsFromCandles(candles1h, 2, 60);
  const tf4h = findSwingLevelsFromCandles(candles4h, 2, 40);

  const allSupports = [...tf15m.rawSupports, ...tf1h.rawSupports, ...tf4h.rawSupports];
  const allResistances = [...tf15m.rawResistances, ...tf1h.rawResistances, ...tf4h.rawResistances];

  const price = referencePrice ?? candles15m[candles15m.length - 1]?.close ?? 0;
  const tol = price * 0.005;

  const dedup = (arr: number[], tolerance: number) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const result: number[] = [];
    for (const v of sorted) {
      if (
        result.length === 0 ||
        Math.abs(v - result[result.length - 1]) > tolerance
      )
        result.push(v);
      else result[result.length - 1] = (result[result.length - 1] + v) / 2;
    }
    return result;
  };

  return {
    supports: dedup(allSupports, tol)
      .filter((s) => s < price)
      .sort((a, b) => b - a)
      .slice(0, 5),
    resistances: dedup(allResistances, tol)
      .filter((r) => r > price)
      .sort((a, b) => a - b)
      .slice(0, 5),
  };
}

// ── HTF trend classification ─────────────────────────────────────────────────

function classifyTrend(closes: number[]): string {
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const e50 = ema(closes, 50);
  const last9 = e9[e9.length - 1];
  const last21 = e21[e21.length - 1];
  const last50 = e50[e50.length - 1];
  if (last9 > last21 && last21 > last50) return "bull";
  if (last9 < last21 && last21 < last50) return "bear";
  return "mixed";
}

// ── Fibonacci Levels ─────────────────────────────────────────────────────────

function computeFibonacci(
  candles: Candle[],
  dec: number
): { level: string; price: number }[] {
  const slice = candles.slice(-50);
  if (slice.length < 5) return [];

  const swingHigh = Math.max(...slice.map((c) => c.high));
  const swingLow = Math.min(...slice.map((c) => c.low));
  const diff = swingHigh - swingLow;
  if (diff < 0.01) return [];

  const currentPrice = slice[slice.length - 1].close;
  const isUptrend = currentPrice > (swingHigh + swingLow) / 2;

  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];

  if (isUptrend) {
    return ratios.map((r) => ({
      level: r.toString(),
      price: round(swingHigh - diff * r, dec),
    }));
  } else {
    return ratios.map((r) => ({
      level: r.toString(),
      price: round(swingLow + diff * r, dec),
    }));
  }
}

function computeFibExtension(candles: Candle[], dec: number): number | null {
  const slice = candles.slice(-50);
  if (slice.length < 5) return null;

  const swingHigh = Math.max(...slice.map((c) => c.high));
  const swingLow = Math.min(...slice.map((c) => c.low));
  const diff = swingHigh - swingLow;
  if (diff < 0.01) return null;

  const currentPrice = slice[slice.length - 1].close;
  if (currentPrice > (swingHigh + swingLow) / 2) {
    return round(swingLow + diff * 1.618, dec);
  } else {
    return round(swingHigh - diff * 1.618, dec);
  }
}

// ── Volume Analysis ──────────────────────────────────────────────────────────

function analyzeVolume(candles: Candle[]): {
  current: number;
  average: number;
  ratio: number;
  trend: string;
  cvd: number;
} {
  if (candles.length < 2)
    return { current: 0, average: 0, ratio: 1, trend: "neutral", cvd: 0 };

  const lastCandle = candles[candles.length - 1];
  const current = lastCandle.volume;

  const lookback = Math.min(50, candles.length);
  const recentCandles = candles.slice(-lookback);
  const volumes = recentCandles.map((c) => c.volume);
  const average = volumes.reduce((s, v) => s + v, 0) / volumes.length;
  const ratio = average > 0 ? current / average : 1;

  const halfLen = Math.floor(lookback / 2);
  const firstHalf = volumes.slice(0, halfLen);
  const secondHalf = volumes.slice(halfLen);
  const avgFirst =
    firstHalf.length > 0
      ? firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length
      : 0;
  const avgSecond =
    secondHalf.length > 0
      ? secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length
      : 0;

  let trend: string;
  if (avgSecond > avgFirst * 1.2) trend = "increasing";
  else if (avgSecond < avgFirst * 0.8) trend = "decreasing";
  else trend = "stable";

  let cvd = 0;
  const cvdCandles = candles.slice(-50);
  for (const c of cvdCandles) {
    cvd += c.close >= c.open ? c.volume : -c.volume;
  }

  return {
    current: round(current, 2),
    average: round(average, 2),
    ratio: Math.round(ratio * 100) / 100,
    trend,
    cvd: round(cvd, 2),
  };
}

// ── Divergence Detection ─────────────────────────────────────────────────────

function detectDivergence(
  prices: number[],
  indicator: number[],
  lookback = 30
): string | null {
  if (prices.length < lookback || indicator.length < lookback) return null;

  const pSlice = prices.slice(-lookback);
  const iSlice = indicator.slice(-lookback);

  const half = Math.floor(lookback / 2);
  const priceLow1 = Math.min(...pSlice.slice(0, half));
  const priceLow2 = Math.min(...pSlice.slice(half));
  const priceHigh1 = Math.max(...pSlice.slice(0, half));
  const priceHigh2 = Math.max(...pSlice.slice(half));

  const indLow1Idx = pSlice.indexOf(priceLow1);
  const indLow2Idx = half + pSlice.slice(half).indexOf(priceLow2);
  const indHigh1Idx = pSlice.indexOf(priceHigh1);
  const indHigh2Idx = half + pSlice.slice(half).indexOf(priceHigh2);

  const iLow1 =
    indLow1Idx >= 0 && indLow1Idx < iSlice.length ? iSlice[indLow1Idx] : null;
  const iLow2 =
    indLow2Idx >= 0 && indLow2Idx < iSlice.length ? iSlice[indLow2Idx] : null;
  const iHigh1 =
    indHigh1Idx >= 0 && indHigh1Idx < iSlice.length
      ? iSlice[indHigh1Idx]
      : null;
  const iHigh2 =
    indHigh2Idx >= 0 && indHigh2Idx < iSlice.length
      ? iSlice[indHigh2Idx]
      : null;

  if (iLow1 != null && iLow2 != null) {
    if (priceLow2 < priceLow1 && iLow2 > iLow1) return "bullish";
    if (priceLow2 > priceLow1 && iLow2 < iLow1) return "hidden_bullish";
  }

  if (iHigh1 != null && iHigh2 != null) {
    if (priceHigh2 > priceHigh1 && iHigh2 < iHigh1) return "bearish";
    if (priceHigh2 < priceHigh1 && iHigh2 > iHigh1) return "hidden_bearish";
  }

  return null;
}

function detectVolumeDivergence(
  candles: Candle[],
  lookback = 30
): string | null {
  if (candles.length < lookback) return null;
  const slice = candles.slice(-lookback);
  const half = Math.floor(lookback / 2);

  const first = slice.slice(0, half);
  const second = slice.slice(half);

  const firstHighIdx = first.reduce(
    (mi, c, i) => (c.high > first[mi].high ? i : mi),
    0
  );
  const secondHighIdx = second.reduce(
    (mi, c, i) => (c.high > second[mi].high ? i : mi),
    0
  );
  const firstLowIdx = first.reduce(
    (mi, c, i) => (c.low < first[mi].low ? i : mi),
    0
  );
  const secondLowIdx = second.reduce(
    (mi, c, i) => (c.low < second[mi].low ? i : mi),
    0
  );

  if (
    second[secondHighIdx].high > first[firstHighIdx].high &&
    second[secondHighIdx].volume < first[firstHighIdx].volume * 0.7
  ) {
    return "bearish";
  }

  if (
    second[secondLowIdx].low < first[firstLowIdx].low &&
    second[secondLowIdx].volume < first[firstLowIdx].volume * 0.7
  ) {
    return "bullish";
  }

  return null;
}

// ── Candlestick Pattern Detection ────────────────────────────────────────────

function detectCandlestickPattern(candles: Candle[]): string | null {
  if (candles.length < 3) return null;

  const c = candles[candles.length - 1];
  const p = candles[candles.length - 2];
  const pp = candles[candles.length - 3];

  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  const pBody = Math.abs(p.close - p.open);

  if (range === 0) return null;

  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;

  if (body / range < 0.1 && range > 0) return "doji";

  if (lowerWick > body * 2 && upperWick < body * 0.5 && c.close < p.close) {
    return "hammer";
  }

  if (upperWick > body * 2 && lowerWick < body * 0.5 && c.close < p.close) {
    return "inverted_hammer";
  }

  if (upperWick > body * 2 && lowerWick < body * 0.5 && c.close > p.close) {
    return "shooting_star";
  }

  if (
    c.close > c.open &&
    p.close < p.open &&
    c.close > p.open &&
    c.open < p.close &&
    body > pBody
  ) {
    return "bullish_engulfing";
  }

  if (
    c.close < c.open &&
    p.close > p.open &&
    c.close < p.open &&
    c.open > p.close &&
    body > pBody
  ) {
    return "bearish_engulfing";
  }

  const ppBody = Math.abs(pp.close - pp.open);
  if (
    pp.close < pp.open &&
    ppBody > 0 &&
    pBody / ppBody < 0.3 &&
    c.close > c.open &&
    c.close > (pp.open + pp.close) / 2
  ) {
    return "morning_star";
  }

  if (
    pp.close > pp.open &&
    ppBody > 0 &&
    pBody / ppBody < 0.3 &&
    c.close < c.open &&
    c.close < (pp.open + pp.close) / 2
  ) {
    return "evening_star";
  }

  return null;
}

// ── Squeeze Detection ────────────────────────────────────────────────────────

function detectSqueeze(
  bbWidths: number[],
  fundingRate: number | null
): string | null {
  if (bbWidths.length < 20) return null;

  const sorted = [...bbWidths].sort((a, b) => a - b);
  const p20 = sorted[Math.floor(sorted.length * 0.2)];
  const currentWidth = bbWidths[bbWidths.length - 1];

  if (currentWidth > p20) return null;

  if (fundingRate != null) {
    if (fundingRate > 0.03) return "long_squeeze_risk";
    if (fundingRate < -0.01) return "short_squeeze_risk";
  }

  return "volatility_compression";
}

// ── Macro Signals — Weekly Stochastic 80-Line + Golden Cross ────────────

let macroCache: { data: MacroState; timestamp: number } | null = null;
const MACRO_CACHE_TTL = 3_600_000; // 1 hour

interface MacroState {
  stochastic: {
    k: number;
    d: number;
    weeksBelow80: number;
    justCrossed80: boolean;
    approaching80: boolean;
    signal: string;
    cohort: "3month" | "2month" | "short" | null;
    historicalStats: {
      horizon: string;
      medianReturn: string;
      winRate: string;
    }[] | null;
  } | null;
  goldenCross: {
    active: boolean;
    crossPrice: number | null;
    daysSinceCross: number | null;
    currentPrice: number | null;
    returnFromCross: number | null;
    isShallowStart: boolean | null;
    sma50: number;
    sma200: number;
    projections: {
      horizon: string;
      medianReturn: string;
      projectedPrice: number | null;
    }[] | null;
  } | null;
  ema21_377: {
    active: boolean;
    ema21: number;
    ema377: number;
    gap: number;
    priceAboveBoth: boolean;
  } | null;
  weeklyEngulfing: boolean;
  macroScore: number;
  signals: string[];
  bias: string;
  eventBlackout: { blocked: boolean; event?: string; date?: string };
}

interface DailyCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function buildWeeklyCandles(dailyCandles: DailyCandle[]): DailyCandle[] {
  const weeks: DailyCandle[] = [];
  let current: DailyCandle | null = null;
  for (const day of dailyCandles) {
    const date = new Date(day.time);
    if (date.getUTCDay() === 1 && current) {
      weeks.push(current);
      current = null;
    }
    if (!current) {
      current = { ...day };
    } else {
      current.high = Math.max(current.high, day.high);
      current.low = Math.min(current.low, day.low);
      current.close = day.close;
    }
  }
  if (current) weeks.push(current);
  return weeks;
}

function computeWeeklyStochastic(
  weeklyCandles: DailyCandle[],
  kPeriod = 14,
  dPeriod = 6,
  smooth = 3
): MacroState["stochastic"] {
  if (weeklyCandles.length < kPeriod + dPeriod + smooth) return null;
  const closes = weeklyCandles.map((c) => c.close);
  const highs = weeklyCandles.map((c) => c.high);
  const lows = weeklyCandles.map((c) => c.low);

  const rawKs: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const sliceH = highs.slice(i - kPeriod + 1, i + 1);
    const sliceL = lows.slice(i - kPeriod + 1, i + 1);
    const hh = Math.max(...sliceH);
    const ll = Math.min(...sliceL);
    const range = hh - ll;
    rawKs.push(range > 0 ? ((closes[i] - ll) / range) * 100 : 50);
  }

  const smoothedKs: number[] = [];
  for (let i = smooth - 1; i < rawKs.length; i++) {
    const slice = rawKs.slice(i - smooth + 1, i + 1);
    smoothedKs.push(slice.reduce((s, v) => s + v, 0) / smooth);
  }

  const dValues: number[] = [];
  for (let i = dPeriod - 1; i < smoothedKs.length; i++) {
    const slice = smoothedKs.slice(i - dPeriod + 1, i + 1);
    dValues.push(slice.reduce((s, v) => s + v, 0) / dPeriod);
  }

  const currentK = smoothedKs[smoothedKs.length - 1];
  const currentD = dValues[dValues.length - 1];

  let weeksBelow80 = 0;
  for (let i = smoothedKs.length - 2; i >= 0; i--) {
    if (smoothedKs[i] < 80) weeksBelow80++;
    else break;
  }

  const is3MonthCohort = weeksBelow80 >= 12;
  const is2MonthCohort = weeksBelow80 >= 8;
  const isSignificant = weeksBelow80 >= 8;

  const justCrossed80 = currentK >= 80 && isSignificant;
  const approaching80 = currentK >= 70 && currentK < 80 && isSignificant;

  const cohort: "3month" | "2month" | "short" | null =
    justCrossed80 || approaching80
      ? is3MonthCohort ? "3month" : is2MonthCohort ? "2month" : "short"
      : null;

  const STATS_2MONTH = [
    { horizon: "1 week", medianReturn: "+0.1%", winRate: "53%" },
    { horizon: "3 weeks", medianReturn: "+17.0%", winRate: "73%" },
    { horizon: "6 weeks", medianReturn: "+29.9%", winRate: "93%" },
    { horizon: "9 weeks", medianReturn: "+24.2%", winRate: "100%" },
    { horizon: "12 weeks", medianReturn: "+44.4%", winRate: "100%" },
  ];
  const STATS_3MONTH = [
    { horizon: "3 weeks", medianReturn: "+16.4%", winRate: "n/a" },
    { horizon: "6 weeks", medianReturn: "+28.5%", winRate: "n/a" },
    { horizon: "9 weeks", medianReturn: "+22.0%", winRate: "n/a" },
  ];

  const historicalStats = cohort === "3month" ? STATS_3MONTH : cohort === "2month" ? STATS_2MONTH : null;

  return {
    k: currentK,
    d: currentD,
    weeksBelow80,
    justCrossed80,
    approaching80,
    signal: justCrossed80 ? "TRIGGERED" : approaching80 ? "APPROACHING" : currentK >= 80 ? "MOMENTUM" : "NONE",
    cohort,
    historicalStats,
  };
}

function computeGoldenCross(dailyCandles: DailyCandle[]): MacroState["goldenCross"] {
  if (dailyCandles.length < 210) return null;
  const closes = dailyCandles.map((c) => c.close);

  const startIdx = 199;
  const aligned50: number[] = [];
  const aligned200: number[] = [];
  for (let i = startIdx; i < closes.length; i++) {
    aligned200.push(closes.slice(i - 199, i + 1).reduce((s, v) => s + v, 0) / 200);
    aligned50.push(closes.slice(i - 49, i + 1).reduce((s, v) => s + v, 0) / 50);
  }

  const current50 = aligned50[aligned50.length - 1];
  const current200 = aligned200[aligned200.length - 1];
  const isGolden = current50 > current200;

  if (!isGolden) {
    return { active: false, crossPrice: null, daysSinceCross: null, currentPrice: null, returnFromCross: null, isShallowStart: null, sma50: current50, sma200: current200, projections: null };
  }

  let crossAlignedIdx: number | null = null;
  for (let i = aligned50.length - 1; i >= 1; i--) {
    if (aligned50[i] > aligned200[i] && aligned50[i - 1] <= aligned200[i - 1]) {
      crossAlignedIdx = i;
      break;
    }
    if (aligned50[i] <= aligned200[i]) break;
  }

  const crossDayIndex = crossAlignedIdx != null ? crossAlignedIdx + startIdx : null;
  const crossPrice = crossDayIndex != null ? closes[crossDayIndex] : null;

  if (crossDayIndex == null || crossPrice == null) {
    return { active: true, crossPrice: null, daysSinceCross: null, currentPrice: closes[closes.length - 1], returnFromCross: null, isShallowStart: null, sma50: current50, sma200: current200, projections: null };
  }

  const daysSinceCross = closes.length - 1 - crossDayIndex;
  const currentPrice = closes[closes.length - 1];
  const returnFromCross = crossPrice > 0 ? (currentPrice - crossPrice) / crossPrice : 0;

  const first10 = dailyCandles.slice(crossDayIndex, crossDayIndex + 10);
  const first10Low = first10.length ? Math.min(...first10.map((c) => c.low)) : crossPrice;
  const first10Drawdown = crossPrice > 0 ? (first10Low - crossPrice) / crossPrice : 0;
  const isShallowStart = first10Drawdown > -0.055;

  return { active: true, crossPrice, daysSinceCross, currentPrice, returnFromCross, isShallowStart, sma50: current50, sma200: current200, projections: null };
}

const MACRO_EVENTS_2026 = [
  { date: "2026-01-28", time: "19:00", name: "FOMC" },
  { date: "2026-03-18", time: "18:00", name: "FOMC" },
  { date: "2026-05-06", time: "18:00", name: "FOMC" },
  { date: "2026-06-17", time: "18:00", name: "FOMC" },
  { date: "2026-07-29", time: "18:00", name: "FOMC" },
  { date: "2026-09-16", time: "18:00", name: "FOMC" },
  { date: "2026-11-04", time: "18:00", name: "FOMC" },
  { date: "2026-12-16", time: "19:00", name: "FOMC" },
  { date: "2026-01-14", time: "13:30", name: "CPI" },
  { date: "2026-02-12", time: "13:30", name: "CPI" },
  { date: "2026-03-11", time: "12:30", name: "CPI" },
  { date: "2026-04-14", time: "12:30", name: "CPI" },
  { date: "2026-05-12", time: "12:30", name: "CPI" },
  { date: "2026-06-10", time: "12:30", name: "CPI" },
  { date: "2026-07-14", time: "12:30", name: "CPI" },
  { date: "2026-08-12", time: "12:30", name: "CPI" },
  { date: "2026-09-11", time: "12:30", name: "CPI" },
  { date: "2026-10-13", time: "12:30", name: "CPI" },
  { date: "2026-11-12", time: "13:30", name: "CPI" },
  { date: "2026-12-10", time: "13:30", name: "CPI" },
  { date: "2026-01-09", time: "13:30", name: "NFP" },
  { date: "2026-02-06", time: "13:30", name: "NFP" },
  { date: "2026-03-06", time: "13:30", name: "NFP" },
  { date: "2026-04-03", time: "12:30", name: "NFP" },
  { date: "2026-05-08", time: "12:30", name: "NFP" },
  { date: "2026-06-05", time: "12:30", name: "NFP" },
  { date: "2026-07-02", time: "12:30", name: "NFP" },
  { date: "2026-08-07", time: "12:30", name: "NFP" },
  { date: "2026-09-04", time: "12:30", name: "NFP" },
  { date: "2026-10-02", time: "12:30", name: "NFP" },
  { date: "2026-11-06", time: "12:30", name: "NFP" },
  { date: "2026-12-04", time: "13:30", name: "NFP" },
];

const EVENT_BLACKOUT_MS = 30 * 60 * 1000;

let parsedMacroEvents: { name: string; date: string; ts: number }[] | null = null;

function getEventBlackout(): { blocked: boolean; event?: string; date?: string } {
  if (!parsedMacroEvents) {
    parsedMacroEvents = MACRO_EVENTS_2026.map((e) => ({
      name: e.name,
      date: e.date,
      ts: new Date(`${e.date}T${e.time}:00Z`).getTime(),
    }));
  }
  const now = Date.now();
  for (const event of parsedMacroEvents) {
    if (Math.abs(now - event.ts) <= EVENT_BLACKOUT_MS) {
      return { blocked: true, event: event.name, date: event.date };
    }
  }
  return { blocked: false };
}

async function fetchMacroSignals(): Promise<MacroState | null> {
  if (macroCache && Date.now() - macroCache.timestamp < MACRO_CACHE_TTL) {
    return { ...macroCache.data, eventBlackout: getEventBlackout() };
  }

  try {
    const url = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.prices?.length) return null;

    const candles: DailyCandle[] = [];
    for (let i = 0; i < data.prices.length; i++) {
      const [time, close] = data.prices[i] as [number, number];
      candles.push({ time, open: close, high: close, low: close, close });
    }
    for (let i = 1; i < candles.length; i++) {
      const volatility = Math.abs(candles[i].close - candles[i - 1].close) * 0.5;
      candles[i].high = candles[i].close + volatility;
      candles[i].low = candles[i].close - volatility;
    }

    const weeklyCandles = buildWeeklyCandles(candles);
    const stochastic = computeWeeklyStochastic(weeklyCandles);
    const goldenCross = computeGoldenCross(candles);

    // Daily 21/377 EMA crossover
    let ema21_377: MacroState["ema21_377"] = null;
    if (candles.length >= 377) {
      const dailyCloses = candles.map((c) => c.close);
      const e21 = ema(dailyCloses, 21);
      const e377 = ema(dailyCloses, 377);
      const cur21 = e21[e21.length - 1];
      const cur377 = e377[e377.length - 1];
      const active = cur21 > cur377;
      const currentPrice = dailyCloses[dailyCloses.length - 1];
      ema21_377 = {
        active,
        ema21: cur21,
        ema377: cur377,
        gap: cur21 - cur377,
        priceAboveBoth: currentPrice > cur21 && currentPrice > cur377,
      };
    }

    // Golden cross projections (historical medians)
    if (goldenCross?.active && goldenCross.crossPrice) {
      const cp = goldenCross.crossPrice;
      const isShallow = goldenCross.isShallowStart;
      goldenCross.projections = isShallow
        ? [
            { horizon: "30 days", medianReturn: "+6.5%", projectedPrice: Math.round(cp * 1.065) },
            { horizon: "90 days", medianReturn: "+25.0%", projectedPrice: Math.round(cp * 1.25) },
            { horizon: "180 days", medianReturn: "+54.0%", projectedPrice: Math.round(cp * 1.54) },
            { horizon: "365 days", medianReturn: "+117%", projectedPrice: Math.round(cp * 2.17) },
          ]
        : [
            { horizon: "30 days", medianReturn: "+3.2%", projectedPrice: Math.round(cp * 1.032) },
            { horizon: "60 days", medianReturn: "+20.3%", projectedPrice: Math.round(cp * 1.203) },
            { horizon: "90 days", medianReturn: "+19.1%", projectedPrice: Math.round(cp * 1.191) },
            { horizon: "180 days", medianReturn: "+35.4%", projectedPrice: Math.round(cp * 1.354) },
          ];
    }

    let weeklyEngulfing = false;
    if (weeklyCandles.length >= 2) {
      const prev = weeklyCandles[weeklyCandles.length - 2];
      const curr = weeklyCandles[weeklyCandles.length - 1];
      weeklyEngulfing = prev.close < prev.open && curr.close > curr.open && curr.close > prev.open && curr.open <= prev.close;
    }

    let macroScore = 0;
    const signals: string[] = [];

    if (stochastic) {
      if (stochastic.signal === "TRIGGERED") {
        const cohortLabel = stochastic.cohort === "3month" ? "3mo+" : "2mo+";
        macroScore += 15;
        signals.push(`Stoch K crossed 80 (${stochastic.k.toFixed(1)}) after ${stochastic.weeksBelow80}w below — ${cohortLabel} cohort, 100% win rate at 12w`);
      } else if (stochastic.signal === "APPROACHING") {
        macroScore += 8;
        signals.push(`Stoch K approaching 80 (${stochastic.k.toFixed(1)}) after ${stochastic.weeksBelow80}w below`);
      } else if (stochastic.k >= 80) {
        macroScore += 10;
        signals.push(`Stoch K in momentum regime (${stochastic.k.toFixed(1)})`);
      }
    }

    if (goldenCross?.active) {
      macroScore += 10;
      const dayInfo = goldenCross.daysSinceCross != null ? ` Day ${goldenCross.daysSinceCross}` : "";
      const retInfo = goldenCross.returnFromCross != null ? ` (+${(goldenCross.returnFromCross * 100).toFixed(1)}%)` : "";
      signals.push(`Golden cross active${dayInfo}${retInfo}`);
      if (goldenCross.isShallowStart) {
        macroScore += 5;
        signals.push("Shallow start — historically strongest returns");
      }
    }

    if (weeklyEngulfing) {
      macroScore += 5;
      signals.push("Weekly bullish engulfing confirmed");
    }

    if (ema21_377?.active) {
      macroScore += 8;
      signals.push(`Daily 21/377 EMA bullish (gap $${Math.round(ema21_377.gap).toLocaleString()})`);
      if (ema21_377.priceAboveBoth) {
        macroScore += 3;
        signals.push("Price above both 21 & 377 EMAs");
      }
    }

    if (stochastic && stochastic.signal !== "NONE" && goldenCross?.active) {
      macroScore += 5;
      signals.push("DOUBLE SIGNAL: Stochastic + Golden Cross confluence");
    }

    if (stochastic && stochastic.signal !== "NONE" && goldenCross?.active && ema21_377?.active) {
      macroScore += 5;
      signals.push("TRIPLE SIGNAL: Stochastic + Golden Cross + 21/377 EMA confluence");
    }

    const bias = macroScore >= 20 ? "strong_bull" : macroScore >= 10 ? "bull" : macroScore >= 5 ? "lean_bull" : "neutral";

    const state: MacroState = {
      stochastic,
      goldenCross,
      ema21_377,
      weeklyEngulfing,
      macroScore,
      signals,
      bias,
      eventBlackout: getEventBlackout(),
    };

    macroCache = { data: state, timestamp: Date.now() };
    return state;
  } catch {
    return macroCache ? { ...macroCache.data, eventBlackout: getEventBlackout() } : null;
  }
}

function getMacroBonus(macroState: MacroState | null, bias: "LONG" | "SHORT" | "WAIT", isCrypto: boolean): number {
  if (!macroState || !isCrypto) return 0;
  if (bias === "LONG") return Math.min(macroState.macroScore, 20);
  if (bias === "SHORT" && macroState.macroScore >= 15) return -10;
  return 0;
}

// ── Daily / Weekly High-Low ──────────────────────────────────────────────────

function computeTimeframeLevels(
  candles1h: Candle[],
  candles4h: Candle[],
  dec: number
): {
  dailyHigh: number | null;
  dailyLow: number | null;
  weeklyHigh: number | null;
  weeklyLow: number | null;
} {
  const last24h = candles1h.slice(-24);
  const dailyHigh =
    last24h.length > 0 ? Math.max(...last24h.map((c) => c.high)) : null;
  const dailyLow =
    last24h.length > 0 ? Math.min(...last24h.map((c) => c.low)) : null;

  const last42 = candles4h.slice(-42);
  const weeklyHigh =
    last42.length > 0 ? Math.max(...last42.map((c) => c.high)) : null;
  const weeklyLow =
    last42.length > 0 ? Math.min(...last42.map((c) => c.low)) : null;

  return {
    dailyHigh: dailyHigh != null ? round(dailyHigh, dec) : null,
    dailyLow: dailyLow != null ? round(dailyLow, dec) : null,
    weeklyHigh: weeklyHigh != null ? round(weeklyHigh, dec) : null,
    weeklyLow: weeklyLow != null ? round(weeklyLow, dec) : null,
  };
}

// ── Multi-Factor Signal Engine ───────────────────────────────────────────────

function scoreMarketStructure(
  ema9: number,
  ema21: number,
  ema50: number,
  supertrend: number,
  price: number,
  supports: number[],
  resistances: number[],
  atr: number
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (ema9 > ema21 && ema21 > ema50) {
    score += 40;
    notes.push("EMA stack bullish (9 > 21 > 50)");
  } else if (ema9 < ema21 && ema21 < ema50) {
    score -= 40;
    notes.push("EMA stack bearish (9 < 21 < 50)");
  } else {
    notes.push("EMA stack mixed");
  }

  if (supertrend === 1) {
    score += 25;
    notes.push("Supertrend bullish");
  } else {
    score -= 25;
    notes.push("Supertrend bearish");
  }

  if (price > ema9) score += 10;
  else score -= 10;

  if (supports.length > 0 && atr > 0) {
    const distToSupport = Math.abs(price - supports[0]) / atr;
    if (distToSupport < 1) {
      score += 15;
      notes.push("Price near support");
    }
  }
  if (resistances.length > 0 && atr > 0) {
    const distToResist = Math.abs(resistances[0] - price) / atr;
    if (distToResist < 1) {
      score -= 15;
      notes.push("Price near resistance");
    }
  }

  return { score: clamp(score, -100, 100), notes };
}

function scoreMomentum(
  rsi: number,
  macdHist: number,
  stochK: number,
  stochD: number,
  rsi5m: number | null,
  prevRsi: number | null,
  macroBias: string | null,
  trendDir: string | null
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  const isTrendingBull = trendDir === "bull" && (macroBias === "strong_bull" || macroBias === "bull");
  const isTrendingBear = trendDir === "bear" && (macroBias === "neutral");

  if (isTrendingBull && rsi > 70) {
    score += 5;
    notes.push(`RSI momentum (${rsi.toFixed(0)}) — trending bull regime`);
    if (prevRsi != null && prevRsi <= 70 && rsi > 70) {
      score += 15;
      notes.push("RSI momentum cross above 70 — bullish entry signal");
    }
  } else if (isTrendingBear && rsi < 30) {
    score += 5;
    notes.push(`RSI momentum (${rsi.toFixed(0)}) — trending bear regime`);
  } else if (rsi < 30) {
    score += 35;
    notes.push(`RSI oversold (${rsi.toFixed(0)})`);
  } else if (rsi < 40) {
    score += 15;
    notes.push(`RSI leaning oversold (${rsi.toFixed(0)})`);
  } else if (rsi > 70) {
    score -= 35;
    notes.push(`RSI overbought (${rsi.toFixed(0)})`);
  } else if (rsi > 60) {
    score -= 15;
    notes.push(`RSI leaning overbought (${rsi.toFixed(0)})`);
  }

  if (macdHist > 0) {
    score += 20;
    notes.push("MACD histogram positive");
  } else {
    score -= 20;
    notes.push("MACD histogram negative");
  }

  if (stochK < 20) {
    score += 20;
    notes.push(`Stoch RSI oversold (K=${stochK.toFixed(0)})`);
  } else if (stochK > 80) {
    score -= 20;
    notes.push(`Stoch RSI overbought (K=${stochK.toFixed(0)})`);
  }

  if (stochK > stochD) score += 10;
  else score -= 10;

  if (rsi5m != null) {
    if (rsi5m < 25) {
      score += 8;
      notes.push(`5m RSI oversold (${rsi5m.toFixed(0)})`);
    } else if (rsi5m > 75) {
      score -= 8;
      notes.push(`5m RSI overbought (${rsi5m.toFixed(0)})`);
    }
  }

  return { score: clamp(score, -100, 100), notes };
}

function scoreVolume(
  volRatio: number,
  volTrend: string,
  cvd: number
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (volRatio > 1.5) {
    notes.push(`Volume ${volRatio.toFixed(1)}x above average`);
  } else if (volRatio < 0.5) {
    score -= 10;
    notes.push("Volume below average");
  }

  if (volTrend === "increasing") {
    score += 15;
    notes.push("Volume trend increasing");
  } else if (volTrend === "decreasing") {
    score -= 15;
    notes.push("Volume trend decreasing");
  }

  if (cvd > 0) {
    score += 30;
    notes.push("Positive CVD — net buying pressure");
  } else {
    score -= 30;
    notes.push("Negative CVD — net selling pressure");
  }

  return { score: clamp(score, -100, 100), notes };
}

function scoreDerivatives(
  fundingRate: number | null,
  putCallRatio: number | null
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (fundingRate != null) {
    if (fundingRate < -0.01) {
      score += 30;
      notes.push("Negative funding — shorts paying longs");
    } else if (fundingRate > 0.05) {
      score -= 30;
      notes.push("High positive funding — longs overleveraged");
    } else if (fundingRate > 0.02) {
      score -= 10;
      notes.push("Elevated positive funding");
    } else if (fundingRate < 0) {
      score += 10;
      notes.push("Slightly negative funding");
    }
  }

  if (putCallRatio != null) {
    if (putCallRatio > 1.2) {
      score += 25;
      notes.push(
        `High put/call ratio (${putCallRatio.toFixed(2)}) — contrarian bullish`
      );
    } else if (putCallRatio < 0.5) {
      score -= 25;
      notes.push(
        `Low put/call ratio (${putCallRatio.toFixed(2)}) — complacency`
      );
    }
  }

  return { score: clamp(score, -100, 100), notes };
}

function scoreHTF(
  trend1h: string,
  rsi1h: number,
  trend4h: string,
  rsi4h: number,
  trendDaily: string | null,
  rsiDaily: number | null
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  const trendScore = (t: string) =>
    t === "bull" ? 20 : t === "bear" ? -20 : 0;

  score += trendScore(trend1h);
  score += trendScore(trend4h);
  if (trendDaily) score += trendScore(trendDaily);

  if (trend1h === trend4h && trend1h !== "mixed") {
    score += trend1h === "bull" ? 15 : -15;
    notes.push(`HTF aligned — ${trend1h}`);
  } else {
    notes.push("HTF disagreement — mixed signals");
  }

  if (rsi1h < 30) {
    score += 10;
    notes.push(`1H RSI oversold (${rsi1h.toFixed(0)})`);
  } else if (rsi1h > 70) {
    score -= 10;
    notes.push(`1H RSI overbought (${rsi1h.toFixed(0)})`);
  }

  if (rsi4h < 30) {
    score += 10;
    notes.push(`4H RSI oversold (${rsi4h.toFixed(0)})`);
  } else if (rsi4h > 70) {
    score -= 10;
    notes.push(`4H RSI overbought (${rsi4h.toFixed(0)})`);
  }

  return { score: clamp(score, -100, 100), notes };
}

function scoreBollinger(
  price: number,
  bbUpper: number,
  bbLower: number,
  bbMiddle: number,
  bbWidth: number,
  squeeze: string | null
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (price <= bbLower) {
    score += 35;
    notes.push("Price at lower Bollinger Band");
  } else if (price >= bbUpper) {
    score -= 35;
    notes.push("Price at upper Bollinger Band");
  } else if (price < bbMiddle) {
    score += 10;
  } else {
    score -= 10;
  }

  if (squeeze === "long_squeeze_risk") {
    score -= 20;
    notes.push("Long squeeze risk — low volatility + high funding");
  } else if (squeeze === "short_squeeze_risk") {
    score += 20;
    notes.push("Short squeeze risk — low volatility + negative funding");
  } else if (squeeze === "volatility_compression") {
    notes.push("Volatility compression — breakout imminent");
  }

  return { score: clamp(score, -100, 100), notes };
}

function scoreDivergences(
  rsiDiv15m: string | null,
  rsiDiv1h: string | null,
  macdDiv: string | null,
  volDiv: string | null
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  const divScore = (
    d: string | null,
    label: string,
    weight: number
  ): void => {
    if (!d) return;
    if (d === "bullish") {
      score += weight;
      notes.push(`${label}: bullish divergence`);
    } else if (d === "bearish") {
      score -= weight;
      notes.push(`${label}: bearish divergence`);
    } else if (d === "hidden_bullish") {
      score += weight * 0.7;
      notes.push(`${label}: hidden bullish divergence`);
    } else if (d === "hidden_bearish") {
      score -= weight * 0.7;
      notes.push(`${label}: hidden bearish divergence`);
    }
  };

  divScore(rsiDiv15m, "15m RSI", 20);
  divScore(rsiDiv1h, "1H RSI", 30);
  divScore(macdDiv, "MACD", 25);
  divScore(volDiv, "Volume", 20);

  return { score: clamp(score, -100, 100), notes };
}

function scoreSentiment(
  fearGreed: number | null,
  newsSentimentScore: number | null,
  isCrypto: boolean
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (!isCrypto) return { score: 0, notes: [] };

  let fgScore = 0;
  if (fearGreed != null) {
    if (fearGreed < 20) {
      fgScore = 40;
      notes.push(`Extreme Fear (${fearGreed}) — contrarian long`);
    } else if (fearGreed < 35) {
      fgScore = 20;
      notes.push(`Fear zone (${fearGreed})`);
    } else if (fearGreed > 80) {
      fgScore = -40;
      notes.push(`Extreme Greed (${fearGreed}) — contrarian caution`);
    } else if (fearGreed > 65) {
      fgScore = -20;
      notes.push(`Greed zone (${fearGreed})`);
    }
  }

  let newsScore = 0;
  if (newsSentimentScore != null && newsSentimentScore !== 0) {
    newsScore = clamp(Math.round(newsSentimentScore * 0.4), -40, 40);
    const label =
      newsSentimentScore >= 20
        ? "bullish"
        : newsSentimentScore <= -20
          ? "bearish"
          : "mixed";
    notes.push(`News sentiment ${label} (${newsSentimentScore})`);
  }

  score = fearGreed != null
    ? Math.round(fgScore * 0.6 + newsScore * 0.4)
    : newsScore;

  return { score: clamp(score, -100, 100), notes };
}

function scoreMarketData(
  btcDominance: number | null,
  isCrypto: boolean
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (!isCrypto) return { score: 0, notes: [] };

  if (btcDominance != null) {
    if (btcDominance > 55) {
      score += 15;
      notes.push(
        `High BTC dominance (${btcDominance.toFixed(1)}%) — capital flowing to BTC`
      );
    } else if (btcDominance < 40) {
      score -= 10;
      notes.push(
        `Low BTC dominance (${btcDominance.toFixed(1)}%) — alt season`
      );
    }
  }

  return { score: clamp(score, -100, 100), notes };
}

function scorePatterns(
  pattern: string | null
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (!pattern) return { score: 0, notes: [] };

  const bullish = [
    "hammer",
    "inverted_hammer",
    "bullish_engulfing",
    "morning_star",
  ];
  const bearish = ["shooting_star", "bearish_engulfing", "evening_star"];

  if (bullish.includes(pattern)) {
    score += 40;
    notes.push(`Bullish pattern: ${pattern.replace(/_/g, " ")}`);
  } else if (bearish.includes(pattern)) {
    score -= 40;
    notes.push(`Bearish pattern: ${pattern.replace(/_/g, " ")}`);
  } else if (pattern === "doji") {
    notes.push("Doji — indecision");
  }

  return { score: clamp(score, -100, 100), notes };
}

function scoreETFFlows(
  etfNet: number | null
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (etfNet == null) return { score: 0, notes: [] };

  if (etfNet > 100_000_000) {
    score += 40;
    notes.push(`Strong ETF inflows ($${(etfNet / 1e6).toFixed(0)}M)`);
  } else if (etfNet > 0) {
    score += 15;
    notes.push(`Positive ETF flows ($${(etfNet / 1e6).toFixed(0)}M)`);
  } else if (etfNet < -100_000_000) {
    score -= 40;
    notes.push(`Heavy ETF outflows ($${(etfNet / 1e6).toFixed(0)}M)`);
  } else if (etfNet < 0) {
    score -= 15;
    notes.push(`Negative ETF flows ($${(etfNet / 1e6).toFixed(0)}M)`);
  }

  return { score: clamp(score, -100, 100), notes };
}

function applyCatalystScore(
  catalystScore: number,
  catalystRisk: string | null,
  fundingRate: number | null
): { score: number; note: string | null } {
  let score = catalystScore;
  let note = catalystRisk;

  if (fundingRate != null && Math.abs(fundingRate) > 0.05) {
    score -= 20;
    note =
      (note ? note + "; " : "") + "Extreme funding rate, squeeze risk";
  }

  return { score: clamp(score, -100, 100), note };
}

function scoreLiquidation(
  longShortRatio: number | null,
  longShortChange: number | null,
  topTraderLongRatio: number | null,
  longLiqs24h: number | null,
  shortLiqs24h: number | null,
  fundingRate: number | null,
  oiChange: number | null,
  takerBuySellRatio: number | null
): { score: number; notes: string[]; squeezeRisk: string | null } {
  let score = 0;
  const notes: string[] = [];
  let squeezeRisk: string | null = null;

  if (longShortRatio != null) {
    if (longShortRatio > 2.0) {
      score -= 30;
      notes.push(`Crowded longs (L/S ${longShortRatio.toFixed(2)}) — contrarian bearish`);
    } else if (longShortRatio > 1.5) {
      score -= 15;
      notes.push(`Elevated long positioning (L/S ${longShortRatio.toFixed(2)})`);
    } else if (longShortRatio < 0.5) {
      score += 30;
      notes.push(`Crowded shorts (L/S ${longShortRatio.toFixed(2)}) — contrarian bullish`);
    } else if (longShortRatio < 0.7) {
      score += 15;
      notes.push(`Elevated short positioning (L/S ${longShortRatio.toFixed(2)})`);
    }
  }

  if (longShortChange != null) {
    if (longShortChange > 20) {
      score -= 15;
      notes.push("Long positioning surging — long squeeze risk");
      squeezeRisk = "long_squeeze_buildup";
    } else if (longShortChange < -20) {
      score += 15;
      notes.push("Short positioning surging — short squeeze risk");
      squeezeRisk = "short_squeeze_buildup";
    }
  }

  if (topTraderLongRatio != null) {
    if (topTraderLongRatio > 0.65) {
      score += 10;
      notes.push(`Top traders ${(topTraderLongRatio * 100).toFixed(0)}% long`);
    } else if (topTraderLongRatio < 0.35) {
      score -= 10;
      notes.push(`Top traders ${((1 - topTraderLongRatio) * 100).toFixed(0)}% short`);
    }
  }

  if (oiChange != null) {
    if (oiChange > 15) {
      score += 10;
      notes.push(`OI surging +${oiChange.toFixed(1)}% — new money entering`);
    } else if (oiChange < -15) {
      score -= 10;
      notes.push(`OI dropping ${oiChange.toFixed(1)}% — positions unwinding`);
    }
  }

  if (takerBuySellRatio != null) {
    if (takerBuySellRatio > 1.3) {
      score += 15;
      notes.push(`Aggressive buying (taker B/S ${takerBuySellRatio.toFixed(2)})`);
    } else if (takerBuySellRatio < 0.7) {
      score -= 15;
      notes.push(`Aggressive selling (taker B/S ${takerBuySellRatio.toFixed(2)})`);
    }
  }

  if (longLiqs24h != null && shortLiqs24h != null) {
    const total = longLiqs24h + shortLiqs24h;
    if (total > 0) {
      const longPct = longLiqs24h / total;
      if (longPct > 0.7) {
        score += 20;
        notes.push(`Longs being flushed (${(longPct * 100).toFixed(0)}% of liqs) — reversal potential`);
        if (fundingRate != null && fundingRate > 0.02) squeezeRisk = "long_squeeze_active";
      } else if (longPct < 0.3) {
        score -= 20;
        notes.push(`Shorts being squeezed (${((1 - longPct) * 100).toFixed(0)}% of liqs) — caution on longs`);
        if (fundingRate != null && fundingRate < -0.005) squeezeRisk = "short_squeeze_active";
      }
    }
  }

  return { score: clamp(score, -100, 100), notes, squeezeRisk };
}

// ── Main Trade Call Computation ──────────────────────────────────────────────

function computeMultiFactorCall(
  params: {
    price: number;
    rsi: number;
    rsi5m: number | null;
    stochRsi: { k: number; d: number };
    ema9: number;
    ema21: number;
    ema50: number;
    macdHist: number;
    adx: number;
    atr: number;
    bbUpper: number;
    bbLower: number;
    bbMiddle: number;
    bbWidth: number;
    supertrendDir: number;
    supports: number[];
    resistances: number[];
    trend1h: string;
    rsi1h: number;
    trend4h: string;
    rsi4h: number;
    trendDaily: string | null;
    rsiDaily: number | null;
    fearGreed: number | null;
    fundingRate: number | null;
    putCallRatio: number | null;
    btcDominance: number | null;
    rsiDiv15m: string | null;
    rsiDiv1h: string | null;
    macdDiv: string | null;
    volDiv: string | null;
    squeeze: string | null;
    pattern: string | null;
    etfNet: number | null;
    fibLevels: { level: string; price: number }[];
    fibExtension: number | null;
    volData: {
      current: number;
      average: number;
      ratio: number;
      trend: string;
      cvd: number;
    };
    isCrypto: boolean;
    newsSentimentScore: number | null;
    catalystScore: number;
    catalystRiskNote: string | null;
    tradeATR: number;
    longShortRatio: number | null;
    longShortChange: number | null;
    topTraderLongRatio: number | null;
    longLiqs24h: number | null;
    shortLiqs24h: number | null;
    oiChange: number | null;
    takerBuySellRatio: number | null;
    prevRsi: number | null;
    macroBias: string | null;
  },
  dec: number
) {
  const {
    price,
    rsi,
    rsi5m,
    stochRsi,
    ema9,
    ema21,
    ema50,
    macdHist,
    adx,
    atr,
    bbUpper,
    bbLower,
    bbMiddle,
    bbWidth,
    supertrendDir,
    supports,
    resistances,
    trend1h,
    rsi1h,
    trend4h,
    rsi4h,
    trendDaily,
    rsiDaily,
    fearGreed,
    fundingRate,
    putCallRatio,
    btcDominance,
    rsiDiv15m,
    rsiDiv1h,
    macdDiv,
    volDiv,
    squeeze,
    pattern,
    etfNet,
    fibExtension,
    volData,
    isCrypto,
    newsSentimentScore,
    catalystScore: extCatalystScore,
    catalystRiskNote,
    tradeATR,
    longShortRatio,
    longShortChange,
    topTraderLongRatio,
    longLiqs24h,
    shortLiqs24h,
    oiChange,
    takerBuySellRatio,
    prevRsi,
    macroBias,
  } = params;

  const trendDir15m =
    ema9 > ema21 && ema21 > ema50 ? "bull" : ema9 < ema21 && ema21 < ema50 ? "bear" : "mixed";

  const weights = {
    marketStructure: 0.15,
    momentum: 0.12,
    volume: 0.1,
    derivatives: 0.08,
    htf: 0.1,
    bollinger: 0.08,
    divergences: 0.08,
    sentiment: 0.03,
    marketData: 0.05,
    patterns: 0.05,
    etf: 0.05,
    catalyst: 0.02,
    liquidation: 0.05,
  };

  if (!isCrypto) {
    weights.sentiment = 0;
    weights.marketData = 0;
    weights.etf = 0;
    weights.liquidation = 0;
    weights.marketStructure = 0.2;
    weights.momentum = 0.15;
    weights.volume = 0.13;
    weights.htf = 0.12;
    weights.bollinger = 0.1;
    weights.divergences = 0.1;
    weights.derivatives = 0.08;
    weights.patterns = 0.07;
    weights.catalyst = 0.02;
  }

  const ms = scoreMarketStructure(
    ema9,
    ema21,
    ema50,
    supertrendDir,
    price,
    supports,
    resistances,
    atr
  );
  const mom = scoreMomentum(rsi, macdHist, stochRsi.k, stochRsi.d, rsi5m, prevRsi, macroBias, trendDir15m);
  const vol = scoreVolume(volData.ratio, volData.trend, volData.cvd);
  const deriv = scoreDerivatives(fundingRate, putCallRatio);
  const htf = scoreHTF(trend1h, rsi1h, trend4h, rsi4h, trendDaily, rsiDaily);
  const boll = scoreBollinger(
    price,
    bbUpper,
    bbLower,
    bbMiddle,
    bbWidth,
    squeeze
  );
  const divs = scoreDivergences(rsiDiv15m, rsiDiv1h, macdDiv, volDiv);
  const sent = scoreSentiment(fearGreed, newsSentimentScore, isCrypto);
  const mktData = scoreMarketData(btcDominance, isCrypto);
  const pats = scorePatterns(pattern);
  const etfScore = scoreETFFlows(etfNet);
  const catalyst = applyCatalystScore(extCatalystScore, catalystRiskNote, fundingRate);
  const liq = scoreLiquidation(
    longShortRatio,
    longShortChange,
    topTraderLongRatio,
    longLiqs24h,
    shortLiqs24h,
    fundingRate,
    oiChange,
    takerBuySellRatio
  );

  const weightedScore =
    ms.score * weights.marketStructure +
    mom.score * weights.momentum +
    vol.score * weights.volume +
    deriv.score * weights.derivatives +
    htf.score * weights.htf +
    boll.score * weights.bollinger +
    divs.score * weights.divergences +
    sent.score * weights.sentiment +
    mktData.score * weights.marketData +
    pats.score * weights.patterns +
    etfScore.score * weights.etf +
    catalyst.score * weights.catalyst +
    liq.score * weights.liquidation;

  const confidence = clamp(Math.round(50 + weightedScore / 2), 0, 100);

  const regime =
    adx > 25 ? "trending" : adx < 20 ? "ranging" : "transitional";

  const signalFactors: SignalFactor[] = [
    {
      category: "Market Structure",
      assessment:
        ms.score > 20
          ? "Strong Bullish"
          : ms.score > 0
            ? "Slightly Bullish"
            : ms.score > -20
              ? "Slightly Bearish"
              : "Strong Bearish",
      weight: Math.round(weights.marketStructure * 100),
    },
    {
      category: "Momentum",
      assessment:
        mom.score > 20 ? "Bullish" : mom.score > -20 ? "Neutral" : "Bearish",
      weight: Math.round(weights.momentum * 100),
    },
    {
      category: "Volume",
      assessment:
        vol.score > 15 ? "Bullish" : vol.score > -15 ? "Neutral" : "Bearish",
      weight: Math.round(weights.volume * 100),
    },
    {
      category: "Derivatives",
      assessment:
        deriv.score > 15
          ? "Bullish"
          : deriv.score > -15
            ? "Neutral"
            : "Bearish",
      weight: Math.round(weights.derivatives * 100),
    },
    {
      category: "HTF Confirmation",
      assessment:
        htf.score > 15 ? "Bullish" : htf.score > -15 ? "Neutral" : "Bearish",
      weight: Math.round(weights.htf * 100),
    },
    {
      category: "Bollinger/Volatility",
      assessment:
        boll.score > 15
          ? "Bullish"
          : boll.score > -15
            ? "Neutral"
            : "Bearish",
      weight: Math.round(weights.bollinger * 100),
    },
    {
      category: "Divergences",
      assessment:
        divs.score > 10
          ? "Bullish"
          : divs.score > -10
            ? "Neutral"
            : "Bearish",
      weight: Math.round(weights.divergences * 100),
    },
  ];

  if (isCrypto) {
    signalFactors.push(
      {
        category: "Sentiment",
        assessment:
          sent.score > 10
            ? "Bullish"
            : sent.score > -10
              ? "Neutral"
              : "Bearish",
        weight: Math.round(weights.sentiment * 100),
      },
      {
        category: "Market Data",
        assessment:
          mktData.score > 10
            ? "Bullish"
            : mktData.score > -10
              ? "Neutral"
              : "Bearish",
        weight: Math.round(weights.marketData * 100),
      },
      {
        category: "ETF Flows",
        assessment:
          etfScore.score > 10
            ? "Bullish"
            : etfScore.score > -10
              ? "Neutral"
              : "Bearish",
        weight: Math.round(weights.etf * 100),
      },
      {
        category: "Liquidation/Positioning",
        assessment:
          liq.score > 15
            ? "Bullish"
            : liq.score > -15
              ? "Neutral"
              : "Bearish",
        weight: Math.round(weights.liquidation * 100),
      }
    );
  }

  signalFactors.push(
    {
      category: "Patterns",
      assessment:
        pats.score > 10
          ? "Bullish"
          : pats.score > -10
            ? "Neutral"
            : "Bearish",
      weight: Math.round(weights.patterns * 100),
    },
    {
      category: "Catalyst Risk",
      assessment: catalyst.score < -15 ? "Elevated" : "Low",
      weight: Math.round(weights.catalyst * 100),
    }
  );

  const strongCategories = signalFactors.filter(
    (f) =>
      f.assessment === "Strong Bullish" ||
      f.assessment === "Bullish" ||
      f.assessment === "Strong Bearish" ||
      f.assessment === "Bearish"
  ).length;

  const isWait =
    confidence < 45 ||
    (squeeze === "volatility_compression" && adx < 20) ||
    (trend1h !== trend4h && adx < 20);

  let bias: "LONG" | "SHORT" | "WAIT";
  if (isWait) {
    bias = "WAIT";
  } else if (weightedScore > 0) {
    bias = "LONG";
  } else {
    bias = "SHORT";
  }

  let grade: string;
  if (confidence >= 85 && strongCategories >= 3) grade = "A+";
  else if (confidence >= 75) grade = "A";
  else if (confidence >= 60) grade = "B";
  else if (confidence >= 45) grade = "C";
  else grade = "NO TRADE";

  const ta = tradeATR;
  const minDist = ta * 0.8;

  const nearestSupport = supports[0] ?? price - 1.5 * ta;
  const nearestResistance = resistances[0] ?? price + 1.5 * ta;
  const secondSupport = supports[1] ?? price - 2.5 * ta;
  const secondResistance = resistances[1] ?? price + 2.5 * ta;

  let entry: number;
  let secondaryEntry: number | null;
  let stopLoss: number;
  let secondaryStopLoss: number | null;
  let tp1: number;
  let tp2: number;
  let tp3: number;
  let extendedTarget: number | null;

  if (bias === "LONG") {
    entry =
      supports[0] && Math.abs(price - supports[0]) / ta < 2
        ? supports[0]
        : price;
    secondaryEntry =
      secondSupport !== entry ? round(secondSupport, dec) : null;
    stopLoss = nearestSupport - 0.5 * ta;
    if (Math.abs(entry - stopLoss) < minDist) stopLoss = entry - ta;

    if (secondaryEntry != null) {
      const thirdSupport = supports[2] ?? secondaryEntry - 1.5 * ta;
      secondaryStopLoss = thirdSupport - 0.5 * ta;
      if (secondaryStopLoss >= secondaryEntry) secondaryStopLoss = secondaryEntry - ta;
      if (Math.abs(secondaryEntry - secondaryStopLoss) < minDist) secondaryStopLoss = secondaryEntry - ta;
    } else {
      secondaryStopLoss = null;
    }

    tp1 = resistances[0] ?? price + 1.5 * ta;
    if (Math.abs(tp1 - entry) < minDist) tp1 = entry + 1.5 * ta;
    tp2 = resistances[1] && resistances[1] > tp1 ? resistances[1] : tp1 + ta;
    tp3 = resistances[2] && resistances[2] > tp2 ? resistances[2] : tp2 + ta;
    extendedTarget =
      fibExtension && fibExtension > tp3
        ? fibExtension
        : round(tp3 + 1.5 * ta, dec);
  } else if (bias === "SHORT") {
    entry =
      resistances[0] && Math.abs(resistances[0] - price) / ta < 2
        ? resistances[0]
        : price;
    secondaryEntry =
      secondResistance !== entry ? round(secondResistance, dec) : null;
    stopLoss = nearestResistance + 0.5 * ta;
    if (Math.abs(stopLoss - entry) < minDist) stopLoss = entry + ta;

    if (secondaryEntry != null) {
      const thirdResistance = resistances[2] ?? secondaryEntry + 1.5 * ta;
      secondaryStopLoss = thirdResistance + 0.5 * ta;
      if (secondaryStopLoss <= secondaryEntry) secondaryStopLoss = secondaryEntry + ta;
      if (Math.abs(secondaryStopLoss - secondaryEntry) < minDist) secondaryStopLoss = secondaryEntry + ta;
    } else {
      secondaryStopLoss = null;
    }

    tp1 = supports[0] ?? price - 1.5 * ta;
    if (Math.abs(entry - tp1) < minDist) tp1 = entry - 1.5 * ta;
    tp2 = supports[1] && supports[1] < tp1 ? supports[1] : tp1 - ta;
    tp3 = supports[2] && supports[2] < tp2 ? supports[2] : tp2 - ta;
    extendedTarget =
      fibExtension && fibExtension < tp3
        ? fibExtension
        : round(tp3 - 1.5 * ta, dec);
  } else {
    entry = price;
    secondaryEntry = null;
    secondaryStopLoss = null;
    stopLoss = price - 1.5 * ta;
    tp1 = price + 1.5 * ta;
    tp2 = price + 2.5 * ta;
    tp3 = price + 4 * ta;
    extendedTarget = null;
  }

  if (bias === "LONG") {
    if (stopLoss >= entry) stopLoss = entry - ta;
    if (secondaryStopLoss != null && secondaryEntry != null && secondaryStopLoss >= secondaryEntry)
      secondaryStopLoss = secondaryEntry - ta;
    if (tp1 <= entry) tp1 = entry + 1.5 * ta;
    if (tp2 <= tp1) tp2 = tp1 + ta;
    if (tp3 <= tp2) tp3 = tp2 + ta;
    if (extendedTarget != null && extendedTarget <= tp3)
      extendedTarget = round(tp3 + 1.5 * ta, dec);
  } else if (bias === "SHORT") {
    if (stopLoss <= entry) stopLoss = entry + ta;
    if (secondaryStopLoss != null && secondaryEntry != null && secondaryStopLoss <= secondaryEntry)
      secondaryStopLoss = secondaryEntry + ta;
    if (tp1 >= entry) tp1 = entry - 1.5 * ta;
    if (tp2 >= tp1) tp2 = tp1 - ta;
    if (tp3 >= tp2) tp3 = tp2 - ta;
    if (extendedTarget != null && extendedTarget >= tp3)
      extendedTarget = round(tp3 - 1.5 * ta, dec);
  }

  entry = round(entry, dec);
  stopLoss = round(stopLoss, dec);
  if (secondaryStopLoss != null) secondaryStopLoss = round(secondaryStopLoss, dec);
  tp1 = round(tp1, dec);
  tp2 = round(tp2, dec);
  tp3 = round(tp3, dec);
  if (extendedTarget != null) extendedTarget = round(extendedTarget, dec);

  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(tp2 - entry);
  const riskReward = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;

  const reasoning = [
    ...ms.notes,
    ...mom.notes,
    ...vol.notes.slice(0, 2),
    ...deriv.notes,
    ...htf.notes,
    ...boll.notes,
    ...divs.notes,
    ...sent.notes,
    ...pats.notes,
    ...etfScore.notes,
    ...liq.notes,
  ].slice(0, 14);

  const bullCase: string[] = [];
  const bearCase: string[] = [];

  if (ms.score > 0)
    bullCase.push("Bullish market structure with EMA alignment");
  if (mom.score > 0)
    bullCase.push("Positive momentum with RSI/MACD confirmation");
  if (vol.score > 0) bullCase.push("Strong buying volume and positive CVD");
  if (htf.score > 0) bullCase.push("Higher timeframes confirm bullish bias");
  if (sent.score > 0)
    bullCase.push("Contrarian opportunity — fear in market");
  if (etfScore.score > 0)
    bullCase.push("Institutional buying via ETF inflows");
  if (divs.score > 0)
    bullCase.push("Bullish divergence signals reversal potential");

  if (ms.score < 0) bearCase.push("Bearish market structure with EMA alignment");
  if (mom.score < 0)
    bearCase.push("Negative momentum — RSI/MACD under pressure");
  if (vol.score < 0)
    bearCase.push("Selling pressure dominant — negative CVD");
  if (htf.score < 0) bearCase.push("Higher timeframes confirm bearish bias");
  if (sent.score < 0) bearCase.push("Extreme greed — market overheated");
  if (etfScore.score < 0)
    bearCase.push("Institutional selling — ETF outflows");
  if (deriv.score < 0)
    bearCase.push("Overleveraged — funding rate extreme");
  if (divs.score < 0) bearCase.push("Bearish divergence signals weakness");
  if (liq.score > 0) bullCase.push("Positioning data favors long side");
  if (liq.score < 0) bearCase.push("Crowded positioning warns of downside");

  while (bullCase.length < 2)
    bullCase.push("Await more bullish confirmations");
  while (bearCase.length < 2)
    bearCase.push("Await more bearish confirmations");

  const confirms: string[] = [];
  const invalidates: string[] = [];

  if (bias === "LONG" || (bias === "WAIT" && weightedScore >= 0)) {
    confirms.push(
      `Break above $${round(nearestResistance, dec).toLocaleString()} with volume`
    );
    confirms.push("Funding rate stays neutral or negative");
    if (trend1h !== "bull") confirms.push("1H trend flips bullish");
    invalidates.push(
      `Loss of $${round(nearestSupport, dec).toLocaleString()} support`
    );
    invalidates.push("MACD crossover to bearish on 1H");
    invalidates.push("Sudden spike in funding rate above 0.05%");
  } else {
    confirms.push(
      `Break below $${round(nearestSupport, dec).toLocaleString()} with volume`
    );
    confirms.push("Funding rate remains elevated");
    if (trend1h !== "bear") confirms.push("1H trend flips bearish");
    invalidates.push(
      `Reclaim of $${round(nearestResistance, dec).toLocaleString()} resistance`
    );
    invalidates.push("MACD crossover to bullish on 1H");
    invalidates.push("Fear & Greed drops below 25 (capitulation)");
  }

  return {
    bias,
    confidence,
    grade,
    regime,
    entry,
    secondaryEntry,
    stopLoss,
    secondaryStopLoss,
    tp1,
    tp2,
    tp3,
    extendedTarget,
    riskReward,
    reasoning,
    bullCase: bullCase.slice(0, 3),
    bearCase: bearCase.slice(0, 3),
    confirms: confirms.slice(0, 3),
    invalidates: invalidates.slice(0, 3),
    catalystRisk: catalyst.note,
    liqSqueezeRisk: liq.squeezeRisk,
    signalFactors,
  };
}

// ── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchJSON(url: string, timeoutMs = 10000): Promise<unknown> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 30);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase();

  const config = SYMBOL_MAP[symbol];
  if (!config) {
    return NextResponse.json(
      { error: "Unknown symbol", supported: Object.keys(SYMBOL_MAP) },
      { status: 400 }
    );
  }

  const dec = config.decimals;
  const isBTC = symbol === "BTC";
  const isCrypto = config.isCrypto;

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=25" },
    });
  }

  const STRIKE = "https://api.strikefinance.org/price";
  const strikeSymbol = config.strike;

  // Build fetch list dynamically based on asset
  const fetches: Promise<unknown>[] = [
    // 0: 15m klines
    fetchJSON(
      `${STRIKE}/v2/klines?symbol=${strikeSymbol}&interval=15m&limit=200&priceType=last`
    ),
    // 1: 1h klines
    fetchJSON(
      `${STRIKE}/v2/klines?symbol=${strikeSymbol}&interval=1h&limit=100&priceType=last`
    ),
    // 2: 4h klines
    fetchJSON(
      `${STRIKE}/v2/klines?symbol=${strikeSymbol}&interval=4h&limit=100&priceType=last`
    ),
    // 3: daily klines
    fetchJSON(
      `${STRIKE}/v2/klines?symbol=${strikeSymbol}&interval=1d&limit=50&priceType=last`
    ),
    // 4: mark price
    fetchJSON(`${STRIKE}/v2/markPrice?symbol=${strikeSymbol}`),
    // 5: 5m klines (for faster RSI updates)
    fetchJSON(
      `${STRIKE}/v2/klines?symbol=${strikeSymbol}&interval=5m&limit=100&priceType=last`
    ),
    // 6: Fear & Greed (crypto only)
    isCrypto
      ? fetchJSON("https://api.alternative.me/fng/")
      : Promise.resolve(null),
    // 7: Deribit ticker (BTC only)
    isBTC
      ? fetchJSON(
          "https://www.deribit.com/api/v2/public/ticker?instrument_name=BTC-PERPETUAL"
        )
      : Promise.resolve(null),
    // 8: Deribit options (BTC only)
    isBTC
      ? fetchJSON(
          "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option"
        )
      : Promise.resolve(null),
    // 9: Blockchain stats (BTC only)
    isBTC
      ? fetchJSON("https://api.blockchain.info/stats")
      : Promise.resolve(null),
    // 10: CoinGecko global
    fetchJSON("https://api.coingecko.com/api/v3/global"),
    // 11: ETF flow (BTC only)
    isBTC
      ? fetchJSON(
          "https://api.coinglass.com/api/v3/etf/bitcoin/flow-total"
        ).catch(() => null)
      : Promise.resolve(null),
    // 12: Liquidations (all crypto)
    isCrypto
      ? fetchJSON(
          `https://api.coinglass.com/api/v3/futures/liquidation/info?symbol=${symbol}`
        ).catch(() => null)
      : Promise.resolve(null),
    // 13: News sentiment (crypto only)
    isCrypto
      ? getNewsSentiment(symbol).catch(() => null)
      : Promise.resolve(null),
    // 14: Binance OI (crypto with binance mapping only)
    config.binance
      ? fetchJSON(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${config.binance}`)
      : Promise.resolve(null),
    // 15: Binance long/short ratio (crypto with binance mapping only)
    config.binance
      ? fetchJSON(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${config.binance}&period=1h&limit=5`)
      : Promise.resolve(null),
    // 16: Binance top trader position ratio
    config.binance
      ? fetchJSON(`https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${config.binance}&period=1h&limit=5`)
      : Promise.resolve(null),
    // 17: OKX long/short ratio (fallback for geo-blocked Binance)
    config.okx
      ? fetchJSON(`https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=${config.okx}&period=1H`).catch(() => null)
      : Promise.resolve(null),
    // 18: OKX open interest + volume
    config.okx
      ? fetchJSON(`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${config.okx}&period=1H`).catch(() => null)
      : Promise.resolve(null),
    // 19: OKX taker buy/sell volume
    config.okx
      ? fetchJSON(`https://www.okx.com/api/v5/rubik/stat/taker-volume-contract?instId=${config.okx}-USDT-SWAP&period=1H&limit=5`).catch(() => null)
      : Promise.resolve(null),
  ];

  const results = await Promise.allSettled(fetches);

  const getResult = (i: number) =>
    results[i].status === "fulfilled"
      ? (results[i] as PromiseFulfilledResult<unknown>).value
      : null;

  // Parse klines
  const candles15m = parseKlines(getResult(0));
  const candles1h = parseKlines(getResult(1));
  const candles4h = parseKlines(getResult(2));
  const candlesDaily = parseKlines(getResult(3));
  const candles5m = parseKlines(getResult(5));

  // Parse mark price
  const markData = getResult(4) as Record<string, string> | null;
  const markPrice = markData ? parseFloat(markData.p) : null;
  const strikeFunding = markData ? parseFloat(markData.r) : null;

  const lastCandle = candles15m[candles15m.length - 1];
  const currentPrice = markPrice ?? lastCandle?.close ?? 0;

  // ── Compute 15m indicators ─────────────────────────────────────────────────
  const closes15m = candles15m.map((c) => c.close);
  const rsiArr = computeRSI(closes15m);
  const stochRsi = computeStochRSI(rsiArr);
  const ema9Arr = ema(closes15m, 9);
  const ema21Arr = ema(closes15m, 21);
  const ema50Arr = ema(closes15m, 50);
  const ema200Arr = closes15m.length >= 200 ? ema(closes15m, 200) : null;
  const sma50Val = smaValue(closes15m, 50);
  const sma200Val = smaValue(closes15m, 200);
  const macdData = computeMACD(closes15m);
  const adxArr = computeADX(candles15m);
  const atrArr = computeATR(candles15m);
  const bbData = computeBB(closes15m);
  const supertrendDir = computeSupertrend(candles15m);
  const fibLevels = computeFibonacci(candles15m, dec);
  const fibExtension = computeFibExtension(candles15m, dec);

  const rsi = tip(rsiArr);
  const ema9Val = tip(ema9Arr);
  const ema21Val = tip(ema21Arr);
  const ema50Val = tip(ema50Arr);
  const ema200Val = ema200Arr ? tip(ema200Arr) : null;
  const macdVal = tip(macdData.macd);
  const macdSig = tip(macdData.signal);
  const macdHist = tip(macdData.histogram);
  const adxVal = tip(adxArr);
  const atrVal = tip(atrArr);
  const bbUpper = tip(bbData.upper);
  const bbMiddle = tip(bbData.middle);
  const bbLower = tip(bbData.lower);

  // BB width
  const bbWidths = bbData.upper.map((u, i) => {
    const m = bbData.middle[i];
    return m > 0 ? (u - bbData.lower[i]) / m : 0;
  });
  const bbWidth = tip(bbWidths);

  // Volume analysis
  const volData = analyzeVolume(candles15m);

  // 5m RSI
  const closes5m = candles5m.map((c) => c.close);
  const rsi5mArr = closes5m.length > 14 ? computeRSI(closes5m) : null;
  const rsi5m = rsi5mArr ? tip(rsi5mArr) : null;

  // ── HTF indicators ─────────────────────────────────────────────────────────
  const closes1h = candles1h.map((c) => c.close);
  const closes4h = candles4h.map((c) => c.close);
  const closesDaily = candlesDaily.map((c) => c.close);
  const rsi1hArr = computeRSI(closes1h);
  const rsi4hArr = computeRSI(closes4h);
  const rsiDailyArr =
    closesDaily.length > 14 ? computeRSI(closesDaily) : null;
  const trend1h = classifyTrend(closes1h);
  const trend4h = classifyTrend(closes4h);
  const trendDaily =
    closesDaily.length >= 50 ? classifyTrend(closesDaily) : null;
  const rsi1h = tip(rsi1hArr);
  const rsi4h = tip(rsi4hArr);
  const rsiDaily = rsiDailyArr ? tip(rsiDailyArr) : null;

  // ── Multi-TF Support/Resistance ─────────────────────────────────────────────
  const levels = findMultiTFLevels(candles15m, candles1h, candles4h, currentPrice);

  // 1h ATR for trade sizing (more meaningful than 15m ATR)
  const atr1hArr = computeATR(candles1h);
  const atr1h = tip(atr1hArr);
  const tradeATR = atr1h > 0 ? atr1h : atrVal * 4;

  // ── Divergences ────────────────────────────────────────────────────────────
  const rsiDiv15m = detectDivergence(closes15m, rsiArr, 30);
  const rsiDiv1h = detectDivergence(closes1h, rsi1hArr, 20);
  const macdDiv = detectDivergence(closes15m, macdData.histogram, 30);
  const volDiv = detectVolumeDivergence(candles15m, 30);

  // ── Pattern / Squeeze ──────────────────────────────────────────────────────
  const candlestickPattern = detectCandlestickPattern(candles15m);
  const squeeze = detectSqueeze(bbWidths, strikeFunding);

  // ── Time-based levels ──────────────────────────────────────────────────────
  const tfLevels = computeTimeframeLevels(candles1h, candles4h, dec);

  // ── 24h stats ──────────────────────────────────────────────────────────────
  const last96 = candles15m.slice(-96);
  const high24h =
    last96.length > 0 ? Math.max(...last96.map((c) => c.high)) : 0;
  const low24h =
    last96.length > 0 ? Math.min(...last96.map((c) => c.low)) : 0;
  const open24h = last96.length > 0 ? last96[0].open : currentPrice;
  const change24h =
    open24h > 0 ? ((currentPrice - open24h) / open24h) * 100 : 0;

  // ── External data parsing ──────────────────────────────────────────────────

  // Fear & Greed
  let fearGreedValue: number | null = null;
  let fearGreedClass: string | null = null;
  const fngRaw = getResult(6);
  if (fngRaw != null) {
    const fng = fngRaw as {
      data?: { value: string; value_classification: string }[];
    };
    if (fng?.data?.[0]) {
      fearGreedValue = parseInt(fng.data[0].value, 10);
      fearGreedClass = fng.data[0].value_classification;
    }
  }

  // Deribit ticker
  let openInterest: number | null = null;
  let deribitFunding8h: number | null = null;
  const deribitTickerRaw = getResult(7);
  if (deribitTickerRaw != null) {
    const d = deribitTickerRaw as {
      result?: { open_interest?: number; funding_8h?: number };
    };
    openInterest = d?.result?.open_interest ?? null;
    deribitFunding8h = d?.result?.funding_8h ?? null;
  }

  // Put/call ratio
  let putCallRatio: number | null = null;
  const deribitOptionsRaw = getResult(8);
  if (deribitOptionsRaw != null) {
    const options = (
      deribitOptionsRaw as {
        result?: { instrument_name: string; open_interest: number }[];
      }
    )?.result;
    if (Array.isArray(options) && options.length > 0) {
      let putOI = 0;
      let callOI = 0;
      for (const opt of options) {
        const name = opt.instrument_name ?? "";
        const oi = opt.open_interest ?? 0;
        if (name.endsWith("-P")) putOI += oi;
        else if (name.endsWith("-C")) callOI += oi;
      }
      putCallRatio =
        callOI > 0 ? Math.round((putOI / callOI) * 100) / 100 : null;
    }
  }

  // Blockchain stats
  let hashRate: number | null = null;
  const blockchainRaw = getResult(9);
  if (blockchainRaw != null) {
    const bc = blockchainRaw as { hash_rate?: number };
    hashRate = bc?.hash_rate ?? null;
  }

  // BTC dominance
  let btcDominance: number | null = null;
  const geckoRaw = getResult(10);
  if (geckoRaw != null) {
    const g = geckoRaw as {
      data?: { market_cap_percentage?: { btc?: number } };
    };
    btcDominance =
      g?.data?.market_cap_percentage?.btc != null
        ? Math.round(g.data.market_cap_percentage.btc * 100) / 100
        : null;
  }

  // ETF flows
  let etfFlowData: { net: number; description: string } | null = null;
  const etfRaw = getResult(11);
  if (etfRaw != null) {
    try {
      const etf = etfRaw as {
        data?: { netFlow?: number; date?: string }[];
      };
      if (etf?.data && etf.data.length > 0) {
        const latest = etf.data[0];
        const net = latest.netFlow ?? 0;
        etfFlowData = {
          net,
          description:
            net > 0
              ? `Net inflow $${(net / 1e6).toFixed(0)}M`
              : `Net outflow $${(Math.abs(net) / 1e6).toFixed(0)}M`,
        };
      }
    } catch {
      /* graceful degradation */
    }
  }

  // Liquidations
  let liquidations: {
    longLiqs24h: number | null;
    shortLiqs24h: number | null;
  } | null = null;
  const liqRaw = getResult(12);
  if (liqRaw != null) {
    try {
      const liq = liqRaw as {
        data?: {
          longLiquidationUsd?: number;
          shortLiquidationUsd?: number;
        };
      };
      if (liq?.data) {
        liquidations = {
          longLiqs24h: liq.data.longLiquidationUsd ?? null,
          shortLiqs24h: liq.data.shortLiquidationUsd ?? null,
        };
      }
    } catch {
      /* graceful degradation */
    }
  }

  // News sentiment
  const newsSentimentData = getResult(13) as NewsSentimentResult | null;

  // Binance Open Interest
  let binanceOI: number | null = null;
  const binanceOIRaw = getResult(14);
  if (binanceOIRaw != null) {
    const oi = binanceOIRaw as { openInterest?: string };
    binanceOI = oi?.openInterest ? parseFloat(oi.openInterest) : null;
  }

  // Binance Long/Short Ratio
  let longShortRatio: number | null = null;
  const lsRaw = getResult(15);
  if (lsRaw != null && Array.isArray(lsRaw) && lsRaw.length > 0) {
    const latest = lsRaw[lsRaw.length - 1] as { longShortRatio?: string };
    longShortRatio = latest?.longShortRatio ? parseFloat(latest.longShortRatio) : null;
  }

  // Long/short ratio change (squeeze signal)
  let longShortChange: number | null = null;
  if (lsRaw != null && Array.isArray(lsRaw) && lsRaw.length >= 3) {
    const recent = parseFloat((lsRaw[lsRaw.length - 1] as { longShortRatio: string }).longShortRatio);
    const older = parseFloat((lsRaw[0] as { longShortRatio: string }).longShortRatio);
    if (!isNaN(recent) && !isNaN(older) && older > 0) {
      longShortChange = ((recent - older) / older) * 100;
    }
  }

  // Top trader position ratio
  let topTraderLongRatio: number | null = null;
  const topTraderRaw = getResult(16);
  if (topTraderRaw != null && Array.isArray(topTraderRaw) && topTraderRaw.length > 0) {
    const latest = topTraderRaw[topTraderRaw.length - 1] as { longAccount?: string };
    topTraderLongRatio = latest?.longAccount ? parseFloat(latest.longAccount) : null;
  }

  // OKX fallback for long/short ratio (Binance is geo-restricted from US)
  const okxLSRaw = getResult(17) as { code?: string; data?: string[][] } | null;
  if (longShortRatio == null && okxLSRaw?.code === "0" && Array.isArray(okxLSRaw.data) && okxLSRaw.data.length > 0) {
    const latest = okxLSRaw.data[okxLSRaw.data.length - 1];
    if (latest?.[1]) longShortRatio = parseFloat(latest[1]);
    if (okxLSRaw.data.length >= 3) {
      const recent = parseFloat(okxLSRaw.data[okxLSRaw.data.length - 1][1]);
      const older = parseFloat(okxLSRaw.data[0][1]);
      if (!isNaN(recent) && !isNaN(older) && older > 0) {
        longShortChange = ((recent - older) / older) * 100;
      }
    }
  }

  // OKX OI + volume
  let okxOI: number | null = null;
  let okxOIChange: number | null = null;
  const okxOIRaw = getResult(18) as { code?: string; data?: string[][] } | null;
  if (okxOIRaw?.code === "0" && Array.isArray(okxOIRaw.data) && okxOIRaw.data.length > 0) {
    const latest = okxOIRaw.data[okxOIRaw.data.length - 1];
    if (latest?.[1]) okxOI = parseFloat(latest[1]);
    if (okxOIRaw.data.length >= 5) {
      const recentOI = parseFloat(okxOIRaw.data[okxOIRaw.data.length - 1][1]);
      const olderOI = parseFloat(okxOIRaw.data[0][1]);
      if (!isNaN(recentOI) && !isNaN(olderOI) && olderOI > 0) {
        okxOIChange = ((recentOI - olderOI) / olderOI) * 100;
      }
    }
  }

  // OKX taker buy/sell volume (buy vs sell pressure)
  let takerBuySellRatio: number | null = null;
  const okxTakerRaw = getResult(19) as { code?: string; data?: string[][] } | null;
  if (okxTakerRaw?.code === "0" && Array.isArray(okxTakerRaw.data) && okxTakerRaw.data.length > 0) {
    let totalBuy = 0, totalSell = 0;
    for (const row of okxTakerRaw.data) {
      totalBuy += parseFloat(row[1] ?? "0");
      totalSell += parseFloat(row[2] ?? "0");
    }
    if (totalSell > 0) takerBuySellRatio = totalBuy / totalSell;
  }

  // ── Macro signals (weekly stochastic, golden cross, event blackout) ────────
  const macroState = isCrypto ? await fetchMacroSignals() : null;

  // Previous RSI for momentum cross detection
  const prevRsi15m = rsiArr.length >= 2 ? rsiArr[rsiArr.length - 2] : null;

  // ── Economic calendar / catalyst scoring ────────────────────────────────────
  const catalystData = await computeCatalystScore();

  // ── Compute trade call ─────────────────────────────────────────────────────
  const call = computeMultiFactorCall(
    {
      price: currentPrice,
      rsi,
      rsi5m,
      stochRsi,
      ema9: ema9Val,
      ema21: ema21Val,
      ema50: ema50Val,
      macdHist,
      adx: adxVal,
      atr: atrVal,
      bbUpper,
      bbLower,
      bbMiddle,
      bbWidth,
      supertrendDir,
      supports: levels.supports,
      resistances: levels.resistances,
      trend1h,
      rsi1h,
      trend4h,
      rsi4h,
      trendDaily,
      rsiDaily,
      fearGreed: fearGreedValue,
      fundingRate: strikeFunding,
      putCallRatio,
      btcDominance,
      rsiDiv15m,
      rsiDiv1h,
      macdDiv,
      volDiv,
      squeeze,
      pattern: candlestickPattern,
      etfNet: etfFlowData?.net ?? null,
      fibLevels,
      fibExtension,
      volData,
      isCrypto,
      newsSentimentScore: newsSentimentData?.score ?? null,
      catalystScore: catalystData.score,
      catalystRiskNote: catalystData.catalystRisk,
      tradeATR,
      longShortRatio,
      longShortChange,
      topTraderLongRatio,
      longLiqs24h: liquidations?.longLiqs24h ?? null,
      shortLiqs24h: liquidations?.shortLiqs24h ?? null,
      oiChange: okxOIChange,
      takerBuySellRatio,
      prevRsi: prevRsi15m,
      macroBias: macroState?.bias ?? null,
    },
    dec
  );

  // Apply macro bonus to confidence for crypto assets
  const macroBonus = getMacroBonus(macroState, call.bias, isCrypto);
  if (macroBonus !== 0) {
    call.confidence = clamp(call.confidence + macroBonus, 0, 100);
    if (macroBonus > 0 && call.confidence >= 75 && call.grade !== "A+" && call.grade !== "A") {
      call.grade = "A";
    }
    if (macroBonus > 0) {
      call.reasoning.unshift(`Macro ${macroState!.bias.replace("_", " ")} (+${macroBonus})`);
    }
  }

  // Event blackout warning
  if (macroState?.eventBlackout?.blocked) {
    call.reasoning.unshift(`EVENT BLACKOUT: ${macroState.eventBlackout.event} — signals suppressed`);
  }

  // ── Log signal for accuracy tracking ────────────────────────────────────────
  if (call.bias !== "WAIT" && call.confidence >= 55) {
    appendSignal({
      symbol,
      timestamp: Date.now(),
      bias: call.bias,
      confidence: call.confidence,
      grade: call.grade,
      entry: call.entry,
      stopLoss: call.stopLoss,
      tp1: call.tp1,
      tp2: call.tp2,
      tp3: call.tp3,
      priceAtSignal: round(currentPrice, dec),
    }).catch(() => {});
  }

  // ── Build response ─────────────────────────────────────────────────────────
  const response = {
    timestamp: Date.now(),
    asset: symbol,
    assetLabel: config.label,
    price: {
      mark: round(currentPrice, dec),
      last: round(lastCandle?.close ?? 0, dec),
      high24h: round(high24h, dec),
      low24h: round(low24h, dec),
      change24h: Math.round(change24h * 100) / 100,
    },
    indicators: {
      rsi: Math.round(rsi * 100) / 100,
      rsi5m: rsi5m != null ? Math.round(rsi5m * 100) / 100 : null,
      stochRsi,
      ema9: round(ema9Val, dec),
      ema21: round(ema21Val, dec),
      ema50: round(ema50Val, dec),
      ema200: ema200Val != null ? round(ema200Val, dec) : null,
      sma50: sma50Val != null ? round(sma50Val, dec) : null,
      sma200: sma200Val != null ? round(sma200Val, dec) : null,
      macd: {
        value: Math.round(macdVal * 100) / 100,
        signal: Math.round(macdSig * 100) / 100,
        histogram: Math.round(macdHist * 100) / 100,
      },
      adx: Math.round(adxVal * 100) / 100,
      atr: round(atrVal, dec),
      bb: {
        upper: round(bbUpper, dec),
        middle: round(bbMiddle, dec),
        lower: round(bbLower, dec),
        width: Math.round(bbWidth * 10000) / 10000,
      },
      regime: call.regime,
      trendDirection:
        ema9Val > ema21Val && ema21Val > ema50Val
          ? "bull"
          : ema9Val < ema21Val && ema21Val < ema50Val
            ? "bear"
            : "mixed",
      supertrend: supertrendDir,
    },
    htf: {
      rsi1h: Math.round(rsi1h * 100) / 100,
      trend1h,
      rsi4h: Math.round(rsi4h * 100) / 100,
      trend4h,
      rsiDaily: rsiDaily != null ? Math.round(rsiDaily * 100) / 100 : null,
      trendDaily,
    },
    levels: {
      supports: levels.supports.map((s) => round(s, dec)),
      resistances: levels.resistances.map((r) => round(r, dec)),
      fibonacci: fibLevels,
      dailyHigh: tfLevels.dailyHigh,
      dailyLow: tfLevels.dailyLow,
      weeklyHigh: tfLevels.weeklyHigh,
      weeklyLow: tfLevels.weeklyLow,
    },
    volume: volData,
    market: {
      fearGreed:
        fearGreedValue != null
          ? { value: fearGreedValue, classification: fearGreedClass ?? "" }
          : null,
      btcDominance,
      openInterest,
      fundingRate:
        strikeFunding != null
          ? Math.round(strikeFunding * 10000000) / 10000000
          : null,
      deribitFunding8h,
      putCallRatio,
      hashRate,
      etfFlow: etfFlowData,
      liquidations,
      longShortRatio,
      topTraderLongRatio,
    },
    positioning: isCrypto ? {
      longShortRatio,
      longShortChange: longShortChange != null ? Math.round(longShortChange * 100) / 100 : null,
      topTraderLongRatio,
      openInterestChange: okxOIChange != null ? Math.round(okxOIChange * 100) / 100 : null,
      takerBuySellRatio: takerBuySellRatio != null ? Math.round(takerBuySellRatio * 100) / 100 : null,
      binanceOI,
      okxOI,
      squeezeRisk: call.liqSqueezeRisk ?? null,
    } : null,
    divergences: {
      rsiDivergence15m: rsiDiv15m,
      rsiDivergence1h: rsiDiv1h,
      macdDivergence: macdDiv,
      volumeDivergence: volDiv,
    },
    patterns: {
      candlestick: candlestickPattern,
      squeeze,
    },
    call,
    macro: macroState
      ? {
          bias: macroState.bias,
          score: macroState.macroScore,
          signals: macroState.signals,
          stochastic: macroState.stochastic
            ? {
                k: Math.round(macroState.stochastic.k * 100) / 100,
                d: Math.round(macroState.stochastic.d * 100) / 100,
                signal: macroState.stochastic.signal,
                weeksBelow80: macroState.stochastic.weeksBelow80,
                cohort: macroState.stochastic.cohort,
                historicalStats: macroState.stochastic.historicalStats,
              }
            : null,
          goldenCross: macroState.goldenCross
            ? {
                active: macroState.goldenCross.active,
                daysSinceCross: macroState.goldenCross.daysSinceCross,
                returnFromCross: macroState.goldenCross.returnFromCross != null
                  ? Math.round(macroState.goldenCross.returnFromCross * 10000) / 100
                  : null,
                isShallowStart: macroState.goldenCross.isShallowStart,
                sma50: round(macroState.goldenCross.sma50, 1),
                sma200: round(macroState.goldenCross.sma200, 1),
                projections: macroState.goldenCross.projections ?? null,
              }
            : null,
          ema21_377: macroState.ema21_377
            ? {
                active: macroState.ema21_377.active,
                ema21: round(macroState.ema21_377.ema21, 1),
                ema377: round(macroState.ema21_377.ema377, 1),
                gap: round(macroState.ema21_377.gap, 1),
                priceAboveBoth: macroState.ema21_377.priceAboveBoth,
              }
            : null,
          weeklyEngulfing: macroState.weeklyEngulfing,
          eventBlackout: macroState.eventBlackout,
          macroBonus,
        }
      : null,
    newsSentiment: newsSentimentData
      ? {
          score: newsSentimentData.score,
          label: newsSentimentData.label,
          headlines: newsSentimentData.headlines
            .slice(0, 5)
            .map((h) => ({ title: h.title, sentiment: h.sentiment })),
        }
      : null,
    events: catalystData.events.map((e) => ({
      name: e.name,
      time: e.time.toISOString(),
      impact: e.impact,
      currency: e.currency,
    })),
    candles: candles15m.slice(-100).map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })),
  };

  cache.set(symbol, { data: response, timestamp: Date.now() });

  return NextResponse.json(response, {
    headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=25" },
  });
}
