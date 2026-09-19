import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// ── Cache ────────────────────────────────────────────────────────────────────
let cache: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 25_000;

// ── Candle type ──────────────────────────────────────────────────────────────
interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function parseKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((k: number[]) => ({
    time: k[0],
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
  }));
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

function sma(arr: number[], period: number): number | null {
  if (arr.length < period) return null;
  const slice = arr.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function computeRSI(closes: number[], period = 14): number[] {
  const result: number[] = [];
  if (closes.length < period + 1) return result;

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

function findSwingLevels(
  candles: Candle[],
  lookback = 2
): { supports: number[]; resistances: number[] } {
  const supports: number[] = [];
  const resistances: number[] = [];
  const slice = candles.slice(-50);

  for (let i = lookback; i < slice.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (slice[i].high <= slice[i - j].high || slice[i].high <= slice[i + j].high)
        isHigh = false;
      if (slice[i].low >= slice[i - j].low || slice[i].low >= slice[i + j].low)
        isLow = false;
    }
    if (isHigh) resistances.push(slice[i].high);
    if (isLow) supports.push(slice[i].low);
  }

  const dedup = (arr: number[], tolerance: number) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const result: number[] = [];
    for (const v of sorted) {
      if (result.length === 0 || Math.abs(v - result[result.length - 1]) > tolerance)
        result.push(v);
      else result[result.length - 1] = (result[result.length - 1] + v) / 2;
    }
    return result;
  };

  const price = candles[candles.length - 1]?.close ?? 0;
  const tol = price * 0.002;

  return {
    supports: dedup(supports, tol)
      .filter((s) => s < price)
      .sort((a, b) => b - a)
      .slice(0, 5),
    resistances: dedup(resistances, tol)
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

// ── Trade recommendation engine ──────────────────────────────────────────────

function computeCall(
  price: number,
  rsi: number,
  ema9: number,
  ema21: number,
  ema50: number,
  macdHist: number,
  adx: number,
  atr: number,
  bbUpper: number,
  bbLower: number,
  bbMiddle: number,
  supertrendDir: number,
  supports: number[],
  resistances: number[],
  htfTrend1h: string,
  htfRsi1h: number,
  fearGreed: number | null,
  fundingRate: number | null,
  putCallRatio: number | null
) {
  let score = 0;
  const reasoning: string[] = [];

  const regime =
    adx > 25 ? "trending" : adx < 20 ? "ranging" : "transitional";

  // RSI
  if (rsi < 30) {
    score += 20;
    reasoning.push(`RSI oversold at ${rsi.toFixed(0)}`);
  } else if (rsi < 40) {
    score += 10;
    reasoning.push(`RSI leaning oversold at ${rsi.toFixed(0)}`);
  } else if (rsi > 70) {
    score -= 20;
    reasoning.push(`RSI overbought at ${rsi.toFixed(0)}`);
  } else if (rsi > 60) {
    score -= 10;
    reasoning.push(`RSI leaning overbought at ${rsi.toFixed(0)}`);
  } else {
    reasoning.push(`RSI neutral at ${rsi.toFixed(0)}`);
  }

  // EMA stack
  if (ema9 > ema21 && ema21 > ema50) {
    score += 15;
    reasoning.push("EMA stack bullish (9 > 21 > 50)");
  } else if (ema9 < ema21 && ema21 < ema50) {
    score -= 15;
    reasoning.push("EMA stack bearish (9 < 21 < 50)");
  } else {
    reasoning.push("EMA stack mixed");
  }

  // Price vs EMAs
  if (price > ema9) score += 5;
  else score -= 5;

  // MACD
  if (macdHist > 0) {
    score += 10;
    reasoning.push("MACD histogram positive");
  } else {
    score -= 10;
    reasoning.push("MACD histogram negative");
  }

  // Supertrend
  if (supertrendDir === 1) {
    score += 10;
    reasoning.push("Supertrend bullish");
  } else {
    score -= 10;
    reasoning.push("Supertrend bearish");
  }

  // Bollinger Band position
  if (price <= bbLower) {
    score += 10;
    reasoning.push("Price at lower Bollinger Band");
  } else if (price >= bbUpper) {
    score -= 10;
    reasoning.push("Price at upper Bollinger Band");
  }

  // HTF confirmation
  if (htfTrend1h === "bull") {
    score += 10;
    reasoning.push("1H trend bullish");
  } else if (htfTrend1h === "bear") {
    score -= 10;
    reasoning.push("1H trend bearish");
  }

  if (htfRsi1h < 30) {
    score += 5;
    reasoning.push(`1H RSI oversold at ${htfRsi1h.toFixed(0)}`);
  } else if (htfRsi1h > 70) {
    score -= 5;
    reasoning.push(`1H RSI overbought at ${htfRsi1h.toFixed(0)}`);
  }

  // Fear & Greed
  if (fearGreed != null) {
    if (fearGreed < 25) {
      score += 5;
      reasoning.push(`Extreme Fear (${fearGreed}) — contrarian long`);
    } else if (fearGreed > 75) {
      score -= 5;
      reasoning.push(`Extreme Greed (${fearGreed}) — contrarian caution`);
    }
  }

  // Funding rate
  if (fundingRate != null) {
    if (fundingRate < -0.01) {
      score += 5;
      reasoning.push("Negative funding — shorts paying longs");
    } else if (fundingRate > 0.05) {
      score -= 5;
      reasoning.push("High positive funding — longs overleveraged");
    }
  }

  // Put/call ratio
  if (putCallRatio != null) {
    if (putCallRatio > 1.2) {
      score += 5;
      reasoning.push(
        `High put/call ratio (${putCallRatio.toFixed(2)}) — hedging = contrarian bullish`
      );
    } else if (putCallRatio < 0.5) {
      score -= 5;
      reasoning.push(
        `Low put/call ratio (${putCallRatio.toFixed(2)}) — complacency = contrarian bearish`
      );
    }
  }

  // Determine bias
  let bias: "LONG" | "SHORT" | "NEUTRAL";
  if (score >= 15) bias = "LONG";
  else if (score <= -15) bias = "SHORT";
  else bias = "NEUTRAL";

  const confidence = Math.min(100, Math.max(0, 50 + score));

  // Compute levels
  const nearestSupport = supports[0] ?? price - 2 * atr;
  const nearestResistance = resistances[0] ?? price + 2 * atr;

  let entry: number;
  let stopLoss: number;
  let tp1: number;
  let tp2: number;
  let tp3: number;

  if (bias === "LONG") {
    entry =
      supports[0] && Math.abs(price - supports[0]) / atr < 1.5
        ? supports[0]
        : price;
    stopLoss = nearestSupport - 0.5 * atr;
    tp1 = resistances[0] ?? price + 2 * atr;
    tp2 = resistances[1] ?? price + 3 * atr;
    tp3 = resistances[2] ?? price + 4.5 * atr;
  } else if (bias === "SHORT") {
    entry =
      resistances[0] && Math.abs(resistances[0] - price) / atr < 1.5
        ? resistances[0]
        : price;
    stopLoss = nearestResistance + 0.5 * atr;
    tp1 = supports[0] ?? price - 2 * atr;
    tp2 = supports[1] ?? price - 3 * atr;
    tp3 = supports[2] ?? price - 4.5 * atr;
  } else {
    entry = price;
    stopLoss = price - 1.5 * atr;
    tp1 = price + 1.5 * atr;
    tp2 = price + 2.5 * atr;
    tp3 = price + 4 * atr;
  }

  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(tp2 - entry);
  const riskReward = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;

  return {
    bias,
    confidence,
    entry: round(entry),
    stopLoss: round(stopLoss),
    tp1: round(tp1),
    tp2: round(tp2),
    tp3: round(tp3),
    riskReward,
    regime,
    reasoning,
  };
}

function round(n: number, decimals = 1): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function tip(arr: number[]): number {
  return arr.length > 0 ? arr[arr.length - 1] : 0;
}

// ── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchJSON(url: string, timeoutMs = 10000): Promise<unknown> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
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

  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=25" },
    });
  }

  const STRIKE = "https://api.strikefinance.org/price";

  const [
    klines15mResult,
    klines1hResult,
    klines4hResult,
    markResult,
    fngResult,
    deribitTickerResult,
    deribitOptionsResult,
    blockchainResult,
    geckoGlobalResult,
  ] = await Promise.allSettled([
    fetchJSON(
      `${STRIKE}/v2/klines?symbol=BTC-USD&interval=15m&limit=200&priceType=last`
    ),
    fetchJSON(
      `${STRIKE}/v2/klines?symbol=BTC-USD&interval=1h&limit=100&priceType=last`
    ),
    fetchJSON(
      `${STRIKE}/v2/klines?symbol=BTC-USD&interval=4h&limit=100&priceType=last`
    ),
    fetchJSON(`${STRIKE}/v2/markPrice?symbol=BTC-USD`),
    fetchJSON("https://api.alternative.me/fng/"),
    fetchJSON(
      "https://www.deribit.com/api/v2/public/ticker?instrument_name=BTC-PERPETUAL"
    ),
    fetchJSON(
      "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option"
    ),
    fetchJSON("https://api.blockchain.info/stats"),
    fetchJSON("https://api.coingecko.com/api/v3/global"),
  ]);

  // Parse klines
  const candles15m = parseKlines(
    klines15mResult.status === "fulfilled" ? klines15mResult.value : null
  );
  const candles1h = parseKlines(
    klines1hResult.status === "fulfilled" ? klines1hResult.value : null
  );
  const candles4h = parseKlines(
    klines4hResult.status === "fulfilled" ? klines4hResult.value : null
  );

  // Parse mark price
  const markData =
    markResult.status === "fulfilled"
      ? (markResult.value as Record<string, string>)
      : null;
  const markPrice = markData ? parseFloat(markData.p) : null;
  const strikeFunding = markData ? parseFloat(markData.r) : null;

  // Current price from candles or mark
  const lastCandle = candles15m[candles15m.length - 1];
  const currentPrice = markPrice ?? lastCandle?.close ?? 0;

  // Compute 15m indicators
  const closes15m = candles15m.map((c) => c.close);
  const rsiArr = computeRSI(closes15m);
  const ema9Arr = ema(closes15m, 9);
  const ema21Arr = ema(closes15m, 21);
  const ema50Arr = ema(closes15m, 50);
  const macdData = computeMACD(closes15m);
  const adxArr = computeADX(candles15m);
  const atrArr = computeATR(candles15m);
  const bbData = computeBB(closes15m);
  const supertrendDir = computeSupertrend(candles15m);
  const levels = findSwingLevels(candles15m);

  const rsi = tip(rsiArr);
  const ema9Val = tip(ema9Arr);
  const ema21Val = tip(ema21Arr);
  const ema50Val = tip(ema50Arr);
  const macdVal = tip(macdData.macd);
  const macdSig = tip(macdData.signal);
  const macdHist = tip(macdData.histogram);
  const adxVal = tip(adxArr);
  const atrVal = tip(atrArr);
  const bbUpper = tip(bbData.upper);
  const bbMiddle = tip(bbData.middle);
  const bbLower = tip(bbData.lower);

  // HTF indicators
  const closes1h = candles1h.map((c) => c.close);
  const closes4h = candles4h.map((c) => c.close);
  const rsi1hArr = computeRSI(closes1h);
  const rsi4hArr = computeRSI(closes4h);
  const trend1h = classifyTrend(closes1h);
  const trend4h = classifyTrend(closes4h);
  const rsi1h = tip(rsi1hArr);
  const rsi4h = tip(rsi4hArr);

  // 24h high/low from candles
  const last96 = candles15m.slice(-96); // 96 * 15m = 24h
  const high24h =
    last96.length > 0 ? Math.max(...last96.map((c) => c.high)) : 0;
  const low24h =
    last96.length > 0 ? Math.min(...last96.map((c) => c.low)) : 0;
  const open24h = last96.length > 0 ? last96[0].open : currentPrice;
  const change24h =
    open24h > 0 ? ((currentPrice - open24h) / open24h) * 100 : 0;

  // Fear & Greed
  let fearGreedValue: number | null = null;
  let fearGreedClass: string | null = null;
  if (fngResult.status === "fulfilled") {
    const fng = fngResult.value as { data?: { value: string; value_classification: string }[] };
    if (fng?.data?.[0]) {
      fearGreedValue = parseInt(fng.data[0].value, 10);
      fearGreedClass = fng.data[0].value_classification;
    }
  }

  // Deribit ticker
  let openInterest: number | null = null;
  let deribitFunding8h: number | null = null;
  if (deribitTickerResult.status === "fulfilled") {
    const d = deribitTickerResult.value as {
      result?: { open_interest?: number; funding_8h?: number };
    };
    openInterest = d?.result?.open_interest ?? null;
    deribitFunding8h = d?.result?.funding_8h ?? null;
  }

  // Put/call ratio
  let putCallRatio: number | null = null;
  if (deribitOptionsResult.status === "fulfilled") {
    const options = (deribitOptionsResult.value as { result?: { instrument_name: string; open_interest: number }[] })?.result;
    if (Array.isArray(options) && options.length > 0) {
      let putOI = 0;
      let callOI = 0;
      for (const opt of options) {
        const name = opt.instrument_name ?? "";
        const oi = opt.open_interest ?? 0;
        if (name.endsWith("-P")) putOI += oi;
        else if (name.endsWith("-C")) callOI += oi;
      }
      putCallRatio = callOI > 0 ? Math.round((putOI / callOI) * 100) / 100 : null;
    }
  }

  // Blockchain stats
  let hashRate: number | null = null;
  if (blockchainResult.status === "fulfilled") {
    const bc = blockchainResult.value as { hash_rate?: number };
    hashRate = bc?.hash_rate ?? null;
  }

  // BTC dominance
  let btcDominance: number | null = null;
  if (geckoGlobalResult.status === "fulfilled") {
    const g = geckoGlobalResult.value as {
      data?: { market_cap_percentage?: { btc?: number } };
    };
    btcDominance =
      g?.data?.market_cap_percentage?.btc != null
        ? Math.round(g.data.market_cap_percentage.btc * 100) / 100
        : null;
  }

  // Compute trade call
  const call = computeCall(
    currentPrice,
    rsi,
    ema9Val,
    ema21Val,
    ema50Val,
    macdHist,
    adxVal,
    atrVal,
    bbUpper,
    bbLower,
    bbMiddle,
    supertrendDir,
    levels.supports,
    levels.resistances,
    trend1h,
    rsi1h,
    fearGreedValue,
    strikeFunding,
    putCallRatio
  );

  const response = {
    timestamp: Date.now(),
    price: {
      mark: round(currentPrice),
      last: round(lastCandle?.close ?? 0),
      high24h: round(high24h),
      low24h: round(low24h),
      change24h: Math.round(change24h * 100) / 100,
    },
    indicators: {
      rsi: Math.round(rsi * 100) / 100,
      ema9: round(ema9Val),
      ema21: round(ema21Val),
      ema50: round(ema50Val),
      macd: {
        value: Math.round(macdVal * 100) / 100,
        signal: Math.round(macdSig * 100) / 100,
        histogram: Math.round(macdHist * 100) / 100,
      },
      adx: Math.round(adxVal * 100) / 100,
      atr: round(atrVal),
      bb: {
        upper: round(bbUpper),
        middle: round(bbMiddle),
        lower: round(bbLower),
      },
      regime: call.regime,
      trendDirection:
        ema9Val > ema21Val && ema21Val > ema50Val
          ? "bull"
          : ema9Val < ema21Val && ema21Val < ema50Val
            ? "bear"
            : "mixed",
    },
    htf: {
      rsi1h: Math.round(rsi1h * 100) / 100,
      trend1h,
      rsi4h: Math.round(rsi4h * 100) / 100,
      trend4h,
    },
    levels,
    market: {
      fearGreed:
        fearGreedValue != null
          ? { value: fearGreedValue, classification: fearGreedClass ?? "" }
          : null,
      btcDominance,
      openInterest,
      fundingRate: strikeFunding != null ? Math.round(strikeFunding * 10000000) / 10000000 : null,
      deribitFunding8h,
      putCallRatio,
      hashRate,
    },
    call,
    candles: candles15m.slice(-100).map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })),
  };

  cache = { data: response, timestamp: Date.now() };

  return NextResponse.json(response, {
    headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=25" },
  });
}
