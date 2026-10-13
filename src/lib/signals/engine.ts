/**
 * Signal engine core (moved out of src/app/api/signals/route.ts so the hot scanner and backtests can call it
 * in-process instead of over HTTP loopback).
 *
 *   computeSignal(symbol)   fetches market data + external feeds and returns the full API response object
 *   scoreFromCandles(input) pure scoring hook: candles in, call out, every non-candle feed treated as null
 *
 * ENGINE_VERSION bumps whenever scoring behaviour changes so logged history can be bucketed per version.
 */
import { appendSignal, type ShadowClass, type SignalContext, type SignalInputs } from "../../app/api/signals/history/logger";
import { FACTOR } from "./factors";
import { expectedHoldFor, setHoldLedgerLoader, stampActiveSetups, type HoldTF } from "./setup-tracker";
import { getHistory, isExcluded } from "../../app/api/signals/history/logger";
import { pTp1For } from "./calibration";
import { fetchOrderFlowRaw, summarizeOrderFlow, type LiquidationSummary, type OrderBookSummary, type OrderFlowRaw } from "./orderflow";

// Bump whenever scoring behaviour changes; every logged signal carries it so history can be bucketed.
// ENGINE_VERSION (below DEFAULT_TUNING) appends a short hash of the tuning defaults so a tuning change that
// forgets to bump this string still opens a new version bucket (perf audit 5.7).
export const ENGINE_VERSION_BASE = "2026.10.13-wave2";

// FNV-1a 32-bit, 6 hex chars. Pure and dependency-free so the hash is identical in the backtest and the server.
export function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

/**
 * Strategy tuning. Defaults come from a 36-configuration sweep of the walk-forward backtest (scripts/backtest.ts,
 * 2026-10-07, 60 days, 8 crypto symbols, one position per symbol) checked out of sample on 120 days:
 *  - publish threshold 60: 55 added only churn; 65 cut the sample to ~170 trades with no per-trade gain;
 *  - shorts only with the higher timeframes already trending down: unconditional shorts lost money;
 *  - a 1-hour cooldown after each closed signal (logger.ts): the engine re-fired on the next bar otherwise;
 *  - stops unchanged: wider stops raised the TP1 rate but lowered net R in every configuration.
 * Honest caveat: Jun-Aug 2026 was about -0.18R net for EVERY configuration and Aug-Oct about +0.18R, so the
 * edge is regime-dependent. These defaults are the least-bad choice, not a proven edge; the performance page
 * stays provisional until 100 filled closed live signals exist. The backtest can override any value.
 */
export interface Tuning {
  /** Below this confidence a directional lean is published as WAIT. */
  minPublishConfidence: number;
  /** SHORT calls require the 4h trend to be "bear" (1h "bear" also accepted when 4h is "mixed"). */
  shortNeedsHtfBear: boolean;
  /** ATR buffer placed beyond the level the stop hides behind. */
  stopBufferAtr: number;
  /** Minimum stop distance in ATR and the fallback stop when a level is too close. */
  minStopAtr: number;
  /** Multiplier on the per-asset-class percentage stop floor. */
  stopFloorScale: number;
  /** Weight of the Cloud/200MA/ADX regime factor for crypto (non-crypto scales it x1.2). 0 disables it.
   *  60d backtest 2026-10-12: 0.10 halved net expectancy (+0.154R -> +0.073R); 0.05 matched the baseline (+0.154R, PF 1.22). */
  regimeWeight: number;
  /** Counter-regime gate: off = never, soft = allow confirmed reversals / high conviction at reduced size, hard = always WAIT. */
  regimeGate: "off" | "soft" | "hard";
  // ── Wave 2 (PR 15) structural knobs. Each one is a backtest flag first; defaults follow research/backtest-wave2.md. ──
  /** Mean-reversion votes (RSI, Stoch, Bollinger band, divergences) count only toward the regime direction in a
   *  trending regime (Bull/Bear with blended ADX >= 20); counter-regime fades are muted unless a reversal is confirmed. */
  mrWithRegime: boolean;
  /** After TP1 the stop moves to the fill price: a later stop touch exits at breakeven instead of at TP1 (simulate() and the live checker). */
  breakevenAfterTp1: boolean;
  /** Horizon by dominant setup timeframe (12h / 36h / 96h for 15m / 1h / 4h+1d) instead of the flat 24h. */
  horizonByTf: boolean;
  /** Symmetric HTF gate: LONG requires the 4h trend "bull" (1h "bull" also accepted when 4h is "mixed"), mirroring shortNeedsHtfBear. */
  htfGateBoth: boolean;
  /** Keep the HTF factor as a vote in the weighted score. false zeroes weights.htf (the gate carries the information). */
  htfVote: boolean;
  /** SHORT only in a Bear regime or with a confirmed bearish reversal structure (engine audit #4). */
  shortNeedsBearRegime: boolean;
  /** Minimum reward-to-risk at TP2; a directional call below it is published as WAIT. 0 disables. */
  minRr: number;
  /** Session rules: crypto weekends half size, 21-24 UTC WAIT unless trend and flow blocks agree, non-crypto weekends WAIT. */
  sessionRules: boolean;
  /** Scale on the daily macro-regime confidence bonus (crypto only). 0 freezes it until the calibration table can score it. */
  macroBonusScale: number;
}
export const DEFAULT_TUNING: Tuning = {
  minPublishConfidence: 60,
  shortNeedsHtfBear: true,
  stopBufferAtr: 0.5,
  minStopAtr: 0.8,
  stopFloorScale: 1.0,
  regimeWeight: 0.05,
  regimeGate: "soft",
  mrWithRegime: false,
  breakevenAfterTp1: false,
  horizonByTf: false,
  htfGateBoth: false,
  htfVote: true,
  shortNeedsBearRegime: false,
  minRr: 0,
  sessionRules: false,
  macroBonusScale: 0,
};
/** Horizon in minutes by dominant setup timeframe when horizonByTf is on; the flat default otherwise. */
export const HORIZON_MIN_BY_TF: Record<"15m" | "1h" | "4h" | "1d", number> = { "15m": 12 * 60, "1h": 36 * 60, "4h": 96 * 60, "1d": 96 * 60 };
export const DEFAULT_HORIZON_MIN = 24 * 60;
export const ENGINE_VERSION = `${ENGINE_VERSION_BASE}-${shortHash(JSON.stringify(DEFAULT_TUNING))}`;
let TUNING: Tuning = { ...DEFAULT_TUNING };
export function setTuning(partial: Partial<Tuning>): Tuning {
  TUNING = { ...TUNING, ...partial };
  return TUNING;
}
export function getTuning(): Tuning {
  return TUNING;
}

// Live ledger hold samples for call.expectedHold (setup-tracker owns the buckets; this keeps it free of the logger).
setHoldLedgerLoader(() =>
  getHistory()
    .filter((s) => s.status === "closed" && !isExcluded(s) && !s.shadow && s.filledAt != null && s.outcomeTimestamp != null)
    .map((s) => ({ symbol: s.symbol, bias: s.bias, regime: s.context?.inputs?.regime ?? null, holdMin: Math.max(0, Math.round(((s.outcomeTimestamp as number) - (s.filledAt as number)) / 60e3)) }))
);

/**
 * Factor weights of the multi-factor call (the literal that used to sit inside computeMultiFactorCall).
 * `regime` is overridden by TUNING.regimeWeight at call time; macro/event/confirmation are injected from the
 * macro service per run. setWeights() exists for out-of-sample validation of candidate weight vectors from the
 * backtest (--weights-json); the live server never calls it.
 */
export interface FactorWeights {
  marketStructure: number;
  momentum: number;
  volume: number;
  derivatives: number;
  htf: number;
  bollinger: number;
  divergences: number;
  sentiment: number;
  marketData: number;
  patterns: number;
  etf: number;
  catalyst: number;
  liquidation: number;
  elliott: number;
  taSystem: number;
  regime: number;
  macro: number;
  event: number;
  confirmation: number;
}
export const DEFAULT_WEIGHTS: Readonly<FactorWeights> = Object.freeze({
  marketStructure: 0.13,
  momentum: 0.11,
  volume: 0.1,
  derivatives: 0.08,
  htf: 0.08,
  bollinger: 0.07,
  divergences: 0.07,
  sentiment: 0.03,
  marketData: 0.05,
  patterns: 0.05,
  etf: 0.05,
  catalyst: 0.02,
  liquidation: 0.05,
  // Elliott Wave position (impulse 1-5 / corrective ABC across 15m, 1h, 4h). Wave 5 and wave B tops
  // argue for shorts; wave 2, 4 and C bottoms argue for longs. Weight scales with count confidence.
  elliott: 0.08,
  // Trend-system + exhaustion composite (SMC, Ichimoku, squeeze, Chandelier, TD Sequential, patterns, sweeps)
  taSystem: 0.09,
  // Cloud / 200MA / ADX regime across 15m, 4h, 1d (tunable; 0 removes it from the denominator)
  regime: DEFAULT_TUNING.regimeWeight,
  macro: 0,
  event: 0,
  confirmation: 0,
});
let WEIGHT_OVERRIDES: Partial<FactorWeights> = {};
export function setWeights(partial: Partial<FactorWeights>): FactorWeights {
  const clean: Partial<FactorWeights> = {};
  for (const k of Object.keys(DEFAULT_WEIGHTS) as (keyof FactorWeights)[]) {
    const v = partial[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) clean[k] = v;
  }
  WEIGHT_OVERRIDES = { ...WEIGHT_OVERRIDES, ...clean };
  return getWeights();
}
export function resetWeights(): void {
  WEIGHT_OVERRIDES = {};
}
/** Weights as the next call will see them (regime follows TUNING). */
export function getWeights(): FactorWeights {
  return { ...DEFAULT_WEIGHTS, ...WEIGHT_OVERRIDES, regime: TUNING.regimeWeight };
}

export type EngineResult =
  | { status: 200; body: Record<string, unknown>; cached: boolean }
  | { status: 400 | 503; body: { error: string; [k: string]: unknown } };

// Per-symbol response cache (25s). Failures are never cached: a 503 returns before cache.set.
const cache = new Map<string, { data: Record<string, unknown>; timestamp: number }>();
const CACHE_TTL = 25_000;

export const TF_MS: Record<string, number> = { "5m": 300e3, "15m": 900e3, "1h": 3600e3, "4h": 14400e3, "1d": 86400e3 };

/** Drop the still-forming last bar so every indicator runs on closed candles only (no intrabar repaint). */
export function closedCandles(c: Candle[], intervalMs: number, now = Date.now()): Candle[] {
  if (c.length === 0) return c;
  const last = c[c.length - 1];
  const openMs = last.time < 1e12 ? last.time * 1000 : last.time;
  return openMs + intervalMs > now ? c.slice(0, -1) : c;
}

const INDEX_SYMS = new Set(["SP500", "NAS100"]);
const COMMODITY_SYMS = new Set(["OIL", "GOLD", "SILVER"]);
const THIN_SYMS = new Set(["SPCX", "MINIMAX", "DRAM", "CRCL", "PUMP", "NIGHT", "UNITREE", "ZHIPU", "CXMT"]);
export type AssetClass = "crypto" | "stock" | "index" | "commodity" | "thin";
export function assetClassFor(symbol: string, isCrypto: boolean): AssetClass {
  if (INDEX_SYMS.has(symbol)) return "index";
  if (COMMODITY_SYMS.has(symbol)) return "commodity";
  if (THIN_SYMS.has(symbol)) return "thin";
  return isCrypto ? "crypto" : "stock";
}
import { computeCatalystScore, getNextOilEvent, getUpcomingEvents } from "@/lib/economic-calendar";
import { getNewsSentiment, type NewsSentimentResult } from "@/lib/news-sentiment";
import { getCatalystNews, isCatalystAsset, type OilGeoResult } from "@/lib/oil-geopolitical-news";
import { getEventGateInputs, getMacroScores, getMacroState, macroAssetFor, macroLensFor } from "@/lib/macro/service";
import type { MacroCoupling, MacroScores, MacroState as MacroEventIntel } from "@/lib/macro/types";
import { computeEventWindow, firstFiveMinuteMove, NO_WINDOW, type EventWindow } from "@/lib/macro/event-gate";
import { computeMacroRegime, macroBonus as regimeBonus, type MacroRegimeResult } from "@/lib/ta/macro-regime";
import { analyzeElliottMTF, type ElliottMTFResult } from "@/lib/ta/elliott";
import { scoreShortSideComposite, ichimoku, deathGoldenCross, atrSeries, type CompositeResult, type CompositeOpts } from "@/lib/ta/indicators";
import type { RegimeInfo, RegimeTFInfo, RegimeTF, TrendStrength } from "@/app/signals/types";

// ── Symbol Configuration ────────────────────────────────────────────────────

export const SYMBOL_MAP: Record<
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

// ── Types ────────────────────────────────────────────────────────────────────

/** OHLCV bar. `time` is the bar OPEN time in ms since epoch (Strike klines convention). */
export interface Candle {
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

// Seeded with the SMA of the first `period` closes (standard warm-up) instead of the first close, which
// biased every EMA toward the oldest bar for ~2x period bars. Before the seed is complete the running
// mean is reported so the array keeps its length and callers can `tip()` it safely.
export function ema(closes: number[], period: number): number[] {
  const result: number[] = [];
  if (closes.length === 0) return result;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      sum += closes[i];
      result.push(sum / (i + 1));
    } else {
      result.push(closes[i] * k + result[i - 1] * (1 - k));
    }
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

/** Wilder DMI: ADX plus the directional lines. +DI/-DI swap under a price mirror, ADX is unchanged. */
export function computeDMI(candles: Candle[], period = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  if (candles.length < period + 1) return { adx: candles.map(() => 25), plusDI: candles.map(() => 0), minusDI: candles.map(() => 0) };

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
  const plusDI: number[] = [];
  const minusDI: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const tr = smoothTR[i] || 1;
    const pdi = (smoothPlusDM[i] / tr) * 100;
    const mdi = (smoothMinusDM[i] / tr) * 100;
    plusDI.push(pdi);
    minusDI.push(mdi);
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
  return { adx, plusDI, minusDI };
}

function computeADX(candles: Candle[], period = 14): number[] {
  return computeDMI(candles, period).adx;
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
  available: boolean;
  ema20: number;
  spikeRatio: number;
  spikeLabel: string;
  absorption: { detected: boolean; direction: "bullish" | "bearish" | null; strength: number } | null;
} {
  const empty = { current: 0, average: 0, ratio: 1, trend: "neutral", cvd: 0, available: false, ema20: 0, spikeRatio: 0, spikeLabel: "no data", absorption: null };
  if (candles.length < 2) return empty;

  const lastCandle = candles[candles.length - 1];
  const current = lastCandle.volume;

  const lookback = Math.min(50, candles.length);
  const recentCandles = candles.slice(-lookback);
  const volumes = recentCandles.map((c) => c.volume);
  const totalVol = volumes.reduce((s, v) => s + v, 0);

  if (totalVol === 0) {
    return { ...empty, trend: "unavailable" };
  }

  const average = totalVol / volumes.length;
  // Synthetic feeds (stocks/indices on Strike) publish near-constant volume; treat as unavailable
  const variance = volumes.reduce((s, v) => s + (v - average) ** 2, 0) / volumes.length;
  const cv = average > 0 ? Math.sqrt(variance) / average : 0;
  if (cv < 0.05) {
    return { ...empty, trend: "unavailable" };
  }
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

  // 20-period EMA on volume for spike detection
  const volEma20 = ema(volumes, 20);
  const ema20Val = tip(volEma20);

  // Spike ratio: how far current volume is above the 20 EMA
  const spikeRatio = ema20Val > 0 ? current / ema20Val : 0;

  // Standard deviation of volume around the 20 EMA for z-score context
  const recentVols = volumes.slice(-20);
  const volMean = recentVols.reduce((s, v) => s + v, 0) / recentVols.length;
  const volVariance = recentVols.reduce((s, v) => s + (v - volMean) ** 2, 0) / recentVols.length;
  const volStdDev = Math.sqrt(volVariance);
  const zScore = volStdDev > 0 ? (current - ema20Val) / volStdDev : 0;

  // Raised thresholds: only highlight when well above EMA
  let spikeLabel: string;
  if (spikeRatio >= 3.5 || zScore >= 3.0) spikeLabel = "EXTREME SPIKE";
  else if (spikeRatio >= 2.5 || zScore >= 2.0) spikeLabel = "HIGH SPIKE";
  else if (spikeRatio >= 1.8 || zScore >= 1.5) spikeLabel = "ELEVATED";
  else if (spikeRatio >= 0.7) spikeLabel = "NORMAL";
  else spikeLabel = "DRY";

  // Absorption detection: big volume but tiny price movement = other side absorbing
  // If volume spikes hard but candle body is tiny relative to ATR, someone is absorbing
  let absorption: { detected: boolean; direction: "bullish" | "bearish" | null; strength: number } | null = null;
  if (candles.length >= 5 && spikeRatio >= 1.8) {
    const recent5 = candles.slice(-5);
    const avgRange = recent5.reduce((s, c) => s + (c.high - c.low), 0) / 5;
    const bodySize = Math.abs(lastCandle.close - lastCandle.open);
    const candleRange = lastCandle.high - lastCandle.low;

    // Absorption = volume is spiking but the body is small relative to recent ranges
    // High volume + small body = the other side is absorbing all the pressure
    if (avgRange > 0 && bodySize / avgRange < 0.3 && spikeRatio >= 1.8) {
      const wickRatio = candleRange > 0 ? bodySize / candleRange : 0;
      const absorptionStrength = Math.round(spikeRatio * (1 - wickRatio) * 100) / 100;

      // Determine which side is absorbing:
      // Big volume + failed to push higher (upper wick) = sellers absorbing -> bearish reversal likely
      // Big volume + failed to push lower (lower wick) = buyers absorbing -> bullish reversal likely
      const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
      const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;

      let direction: "bullish" | "bearish" | null = null;
      if (candleRange > 0) {
        if (lowerWick / candleRange > 0.5) {
          direction = "bullish";
        } else if (upperWick / candleRange > 0.5) {
          direction = "bearish";
        }
      }

      absorption = { detected: true, direction, strength: absorptionStrength };
    }
  }

  return {
    current: round(current, 2),
    average: round(average, 2),
    ratio: Math.round(ratio * 100) / 100,
    trend,
    cvd: round(cvd, 2),
    available: true,
    ema20: round(ema20Val, 2),
    spikeRatio: Math.round(spikeRatio * 100) / 100,
    spikeLabel,
    absorption,
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

  let bull: string | null = null;
  let bear: string | null = null;
  if (iLow1 != null && iLow2 != null) {
    if (priceLow2 < priceLow1 && iLow2 > iLow1) bull = "bullish";
    else if (priceLow2 > priceLow1 && iLow2 < iLow1) bull = "hidden_bullish";
  }
  if (iHigh1 != null && iHigh2 != null) {
    if (priceHigh2 > priceHigh1 && iHigh2 < iHigh1) bear = "bearish";
    else if (priceHigh2 < priceHigh1 && iHigh2 > iHigh1) bear = "hidden_bearish";
  }
  // Both sides present: the more recent pivot wins; a dead heat is no signal (no bullish-first priority).
  if (bull && bear) {
    if (indLow2Idx === indHigh2Idx) return null;
    return indLow2Idx > indHigh2Idx ? bull : bear;
  }
  return bull ?? bear;
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

  // Same shape as a hammer but after an up move: hanging man (bearish)
  if (lowerWick > body * 2 && upperWick < body * 0.5 && c.close > p.close) {
    return "hanging_man";
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

  // Dark cloud cover: prior green, opens above prior high, closes below prior midpoint
  if (p.close > p.open && c.close < c.open && c.open > p.high && c.close < (p.open + p.close) / 2 && c.close > p.open) {
    return "dark_cloud_cover";
  }
  // Piercing line: prior red, opens below prior low, closes above prior midpoint
  if (p.close < p.open && c.close > c.open && c.open < p.low && c.close > (p.open + p.close) / 2 && c.close < p.open) {
    return "piercing_line";
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

/**
 * Funding-rate thresholds. UNIT: fraction per 8h funding interval, i.e. 0.0001 = 0.01% (the dashboard prints
 * `r * 100` as a percentage, so Strike's `markPrice.r` is a fraction). The old thresholds (0.01 / 0.03 /
 * 0.05) were 1% / 3% / 5% per interval and never fired. Typical perps funding sits around ±0.0001.
 */
// Strike settles funding every hour; thresholds below are quoted per 8h.
export const STRIKE_FUNDING_INTERVALS_PER_8H = 8;

export const FUNDING = {
  ELEVATED: 0.0003, // 0.03% per 8h
  HIGH: 0.0008, // 0.08% per 8h
  EXTREME: 0.0015, // 0.15% per 8h
} as const;

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
    if (fundingRate > FUNDING.HIGH) return "long_squeeze_risk";
    if (fundingRate < -FUNDING.HIGH) return "short_squeeze_risk";
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
  // Signed regime score in [-100, 100] from lib/ta/macro-regime (bearish mirrors of every bullish pattern).
  macroScore: number;
  signals: string[];
  bias: MacroRegimeResult["bias"];
  regime: Pick<MacroRegimeResult, "components" | "details"> | null;
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

// Event blackout is derived from the universal event gate (lib/macro/event-gate.ts) over the live macro calendar;
// the hard-coded 2026 FOMC/CPI/NFP list it replaced is gone. Shape kept for the dashboard's macro card.
function blackoutFrom(w: EventWindow): MacroState["eventBlackout"] {
  return w.gate && w.event ? { blocked: true, event: w.event.title, date: w.event.time.slice(0, 10) } : { blocked: false };
}

async function fetchMacroSignals(): Promise<MacroState | null> {
  if (macroCache && Date.now() - macroCache.timestamp < MACRO_CACHE_TTL) {
    return { ...macroCache.data };
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

    // The legacy block above only knows bullish patterns. The regime module scores both sides (death cross,
    // weekly stoch breakdown, 21<377, bearish engulfing, LH/LL structure, 200d slope, Pi Cycle) and is the
    // source of truth for score and bias; the legacy fields stay for the dashboard's historical-stat cards.
    const regime = computeMacroRegime(candles);
    void macroScore;
    void signals;

    const state: MacroState = {
      stochastic,
      goldenCross,
      ema21_377,
      weeklyEngulfing,
      macroScore: regime.score,
      signals: regime.signals,
      bias: regime.bias,
      regime: { components: regime.components, details: regime.details },
      eventBlackout: { blocked: false },
    };

    macroCache = { data: state, timestamp: Date.now() };
    return { ...state };
  } catch {
    return macroCache ? { ...macroCache.data } : null;
  }
}

// Symmetric: a regime aligned with the call adds up to +20; a regime opposed by 15+ points costs 10.
function getMacroBonus(macroState: MacroState | null, bias: "LONG" | "SHORT" | "WAIT", isCrypto: boolean): number {
  if (!macroState || !isCrypto) return 0;
  // Frozen at 0 by default (TUNING.macroBonusScale) until the calibration table can score it: it inflated grades
  // on the unvalidated path (engine audit section 6).
  if (!(TUNING.macroBonusScale > 0)) return 0;
  return Math.round(regimeBonus(macroState.macroScore, bias) * TUNING.macroBonusScale);
}

const ASSESSMENT_DIR: Record<string, number> = {
  "Strong Bullish": 2,
  Bullish: 1,
  Neutral: 0,
  Bearish: -1,
  "Strong Bearish": -2,
};

// Grade ladder shared by the call and the post-macro re-grade so confidence and grade never disagree.
export function gradeFor(confidence: number, strongCategories: number): string {
  if (confidence >= 85 && strongCategories >= 3) return "A+";
  if (confidence >= 75) return "A";
  if (confidence >= 60) return "B";
  if (confidence >= 55) return "C";
  return "NO TRADE";
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
  trendDir: string | null,
  // Wave 2 (mrWithRegime): +1 / -1 when the Cloud/200MA/ADX regime is trending Bull / Bear, 0 otherwise. Mean-reversion
  // votes against that direction are muted; the macroBias momentum branch is mirrored with the regime standing in.
  regimeDir: 1 | -1 | 0 = 0
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];
  let muted = 0;
  // A mean-reversion vote: dropped when it fades a trending regime (sign opposite to regimeDir).
  const mr = (v: number, note: string) => {
    if (regimeDir !== 0 && Math.sign(v) === -regimeDir) {
      muted++;
      return;
    }
    score += v;
    notes.push(note);
  };

  const isTrendingBull = trendDir === "bull" && (macroBias === "strong_bull" || macroBias === "bull" || regimeDir === 1);
  const isTrendingBear = trendDir === "bear" && (macroBias === "strong_bear" || macroBias === "bear" || regimeDir === -1);

  if (isTrendingBull && rsi > 70) {
    score += 5;
    notes.push(`RSI momentum (${rsi.toFixed(0)}) — trending bull regime`);
    if (prevRsi != null && prevRsi <= 70) {
      score += 15;
      notes.push("RSI momentum cross above 70 — bullish entry signal");
    }
  } else if (isTrendingBear && rsi < 30) {
    // Mirror of the bull momentum entry: in a confirmed bear regime, RSI breaking 30 is continuation, not a dip to buy
    score -= 5;
    notes.push(`RSI momentum (${rsi.toFixed(0)}) — trending bear regime`);
    if (prevRsi != null && prevRsi >= 30) {
      score -= 15;
      notes.push("RSI momentum cross below 30 — bearish entry signal");
    }
  } else if (rsi < 30) {
    mr(35, `RSI oversold (${rsi.toFixed(0)})`);
  } else if (rsi < 40) {
    mr(15, `RSI leaning oversold (${rsi.toFixed(0)})`);
  } else if (rsi > 70) {
    mr(-35, `RSI overbought (${rsi.toFixed(0)})`);
  } else if (rsi > 60) {
    mr(-15, `RSI leaning overbought (${rsi.toFixed(0)})`);
  }

  if (macdHist > 0) {
    score += 20;
    notes.push("MACD histogram positive");
  } else {
    score -= 20;
    notes.push("MACD histogram negative");
  }

  if (stochK < 20) {
    mr(20, `Stoch RSI oversold (K=${stochK.toFixed(0)})`);
  } else if (stochK > 80) {
    mr(-20, `Stoch RSI overbought (K=${stochK.toFixed(0)})`);
  }

  if (stochK > stochD) score += 10;
  else score -= 10;

  if (rsi5m != null) {
    if (rsi5m < 25) {
      mr(8, `5m RSI oversold (${rsi5m.toFixed(0)})`);
    } else if (rsi5m > 75) {
      mr(-8, `5m RSI overbought (${rsi5m.toFixed(0)})`);
    }
  }
  if (muted > 0) notes.push(`${muted} counter-regime fade vote${muted > 1 ? "s" : ""} muted (${regimeDir > 0 ? "bull" : "bear"} regime)`);

  return { score: clamp(score, -100, 100), notes };
}

function scoreVolume(
  volRatio: number,
  volTrend: string,
  cvd: number,
  available: boolean,
  spikeRatio: number,
  spikeLabel: string,
  absorption: { detected: boolean; direction: "bullish" | "bearish" | null; strength: number } | null
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (!available) {
    notes.push("Volume data unavailable for this ticker");
    return { score: 0, notes };
  }

  // Volume has no direction of its own: spikes and rising participation CONFIRM whichever side CVD says is in
  // control. A high-volume breakdown must score as negative as a high-volume breakout scores positive.
  const dir = cvd >= 0 ? 1 : -1;
  const side = dir > 0 ? "buyers" : "sellers";

  if (volRatio > 1.5) notes.push(`Volume ${volRatio.toFixed(1)}x above average`);

  if (spikeLabel === "EXTREME SPIKE") {
    score += 15 * dir;
    notes.push(`Vol spike ${spikeRatio.toFixed(1)}x above 20 EMA — real ${dir > 0 ? "breakout" : "breakdown"}`);
  } else if (spikeLabel === "HIGH SPIKE") {
    score += 10 * dir;
    notes.push(`Vol spike ${spikeRatio.toFixed(1)}x above 20 EMA — conviction move by ${side}`);
  }

  if (volTrend === "increasing") {
    score += 15 * dir;
    notes.push(`Volume trend increasing behind ${side}`);
  } else if (volTrend === "decreasing") {
    score -= 15 * dir;
    notes.push(`Volume trend decreasing — ${side} losing participation`);
  }

  if (cvd > 0) {
    score += 30;
    notes.push("Positive CVD — net buying pressure");
  } else {
    score -= 30;
    notes.push("Negative CVD — net selling pressure");
  }

  // Low participation is a conviction haircut for either side, not a bearish vote
  if (spikeLabel === "DRY" || volRatio < 0.5) {
    score = Math.round(score * 0.6);
    notes.push(spikeLabel === "DRY" ? `Vol dry (${spikeRatio.toFixed(1)}x EMA) — low conviction, fakeout risk` : "Volume below average — low conviction");
  }

  // Absorption: informational only — backtest shows weak predictive power at short TFs
  if (absorption?.detected) {
    if (absorption.direction === "bullish") {
      notes.push(`ABSORPTION: Buyers absorbing sell pressure (${absorption.strength.toFixed(1)}x) — watch for reversal`);
    } else if (absorption.direction === "bearish") {
      notes.push(`ABSORPTION: Sellers absorbing buy pressure (${absorption.strength.toFixed(1)}x) — watch for reversal`);
    } else {
      notes.push(`ABSORPTION: High volume, no price movement (${absorption.strength.toFixed(1)}x) — indecision`);
    }
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
    // fundingRate is a fraction per interval; see FUNDING for the unit
    if (fundingRate < -FUNDING.HIGH) {
      score += 30;
      notes.push("Negative funding — shorts paying longs");
    } else if (fundingRate > FUNDING.HIGH) {
      score -= 30;
      notes.push("High positive funding — longs overleveraged");
    } else if (fundingRate > FUNDING.ELEVATED) {
      score -= 10;
      notes.push("Elevated positive funding");
    } else if (fundingRate < -FUNDING.ELEVATED) {
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
  squeeze: string | null,
  rsi: number,
  regimeDir: 1 | -1 | 0 = 0
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];
  void bbMiddle;

  // Band touches are mean-reversion votes: muted when they fade a trending regime (mrWithRegime).
  const fades = (v: number) => regimeDir !== 0 && Math.sign(v) === -regimeDir;
  if (price <= bbLower) {
    if (fades(35)) notes.push("Price at lower Bollinger Band (fade muted: bear regime)");
    else {
      score += 35;
      notes.push("Price at lower Bollinger Band");
    }
  } else if (price >= bbUpper) {
    if (fades(-35)) notes.push("Price at upper Bollinger Band (fade muted: bull regime)");
    else {
      score -= 35;
      notes.push("Price at upper Bollinger Band");
    }
  } else if (rsi < 40) {
    // Inside the bands is not a signal on its own; only lean when momentum agrees with a mean-reversion read
    if (!fades(10)) score += 10;
  } else if (rsi > 60) {
    if (!fades(-10)) score -= 10;
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
  volDiv: string | null,
  regimeDir: 1 | -1 | 0 = 0
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  const divScore = (
    d: string | null,
    label: string,
    weight: number
  ): void => {
    if (!d) return;
    // Regular divergences are reversal (mean-reversion) votes: muted against a trending regime (mrWithRegime).
    // Hidden divergences are continuation reads and always count.
    if (d === "bullish") {
      if (regimeDir === -1) notes.push(`${label}: bullish divergence (fade muted: bear regime)`);
      else {
        score += weight;
        notes.push(`${label}: bullish divergence`);
      }
    } else if (d === "bearish") {
      if (regimeDir === 1) notes.push(`${label}: bearish divergence (fade muted: bull regime)`);
      else {
        score -= weight;
        notes.push(`${label}: bearish divergence`);
      }
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
  isCrypto: boolean,
  oilGeoScore?: number | null
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (!isCrypto && oilGeoScore == null) return { score: 0, notes: [] };

  const geoLabel =
    oilGeoScore == null ? "" : oilGeoScore >= 15 ? "bullish" : oilGeoScore <= -15 ? "bearish" : "mixed";

  // Commodities: headlines are the only sentiment input
  if (oilGeoScore != null && !isCrypto) {
    notes.push(`Catalyst headlines ${geoLabel} (${oilGeoScore})`);
    return { score: clamp(Math.round(oilGeoScore), -100, 100), notes };
  }

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

  if (oilGeoScore != null) {
    // Crypto with a catalyst engine: headlines lead, F&G and vote-based news are secondary
    notes.push(`Catalyst headlines ${geoLabel} (${oilGeoScore})`);
    score = Math.round((fearGreed != null ? fgScore * 0.3 : 0) + newsScore * 0.2 + oilGeoScore * 0.5);
  } else {
    score = fearGreed != null
      ? Math.round(fgScore * 0.6 + newsScore * 0.4)
      : newsScore;
  }

  return { score: clamp(score, -100, 100), notes };
}

function scoreMarketData(
  btcDominance: number | null,
  isCrypto: boolean,
  symbol: string
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (!isCrypto || btcDominance == null) return { score: 0, notes: [] };

  // Capital rotating into BTC is bullish for BTC and bearish for alts; the inverse for alt season.
  const sign = symbol === "BTC" ? 1 : -1;
  if (btcDominance > 55) {
    score += 15 * sign;
    notes.push(`High BTC dominance (${btcDominance.toFixed(1)}%) — capital flowing to BTC${sign < 0 ? ", headwind for alts" : ""}`);
  } else if (btcDominance < 40) {
    score -= 15 * sign;
    notes.push(`Low BTC dominance (${btcDominance.toFixed(1)}%) — alt season${sign < 0 ? ", tailwind for alts" : ""}`);
  }

  return { score: clamp(score, -100, 100), notes };
}

function scorePatterns(
  pattern: string | null
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (!pattern) return { score: 0, notes: [] };

  const bullish = ["hammer", "inverted_hammer", "bullish_engulfing", "morning_star", "piercing_line"];
  const bearish = ["shooting_star", "hanging_man", "bearish_engulfing", "evening_star", "dark_cloud_cover"];

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
  const score = catalystScore;
  let note = catalystRisk;

  // Extreme funding in either direction is squeeze risk for whoever is crowded: flag it, do not vote bearish
  if (fundingRate != null && Math.abs(fundingRate) > FUNDING.EXTREME) {
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
  takerBuySellRatio: number | null,
  priceChange24h: number | null
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
    // Rising OI confirms the prevailing move (longs building on a rally, shorts building in a selloff);
    // falling OI means that move is unwinding.
    const px = priceChange24h ?? 0;
    const pxDir = px > 0.25 ? 1 : px < -0.25 ? -1 : 0;
    if (oiChange > 15) {
      score += 10 * pxDir;
      notes.push(`OI surging +${oiChange.toFixed(1)}% — ${pxDir > 0 ? "longs building on the rally" : pxDir < 0 ? "shorts building into the selloff" : "new money entering, direction unclear"}`);
    } else if (oiChange < -15) {
      score -= 10 * pxDir;
      notes.push(`OI dropping ${oiChange.toFixed(1)}% — ${pxDir > 0 ? "short covering, rally may stall" : pxDir < 0 ? "long liquidation, selloff may exhaust" : "positions unwinding"}`);
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
        if (fundingRate != null && fundingRate > FUNDING.HIGH) squeezeRisk = "long_squeeze_active";
      } else if (longPct < 0.3) {
        score -= 20;
        notes.push(`Shorts being squeezed (${((1 - longPct) * 100).toFixed(0)}% of liqs) — caution on longs`);
        if (fundingRate != null && fundingRate < -FUNDING.ELEVATED) squeezeRisk = "short_squeeze_active";
      }
    }
  }

  return { score: clamp(score, -100, 100), notes, squeezeRisk };
}

// ── Anticipatory Signal Engine ──────────────────────────────────────────────

function computeAnticipatorySignals(params: {
  candles15m: Candle[];
  currentPrice: number;
  atr: number;
  supports: number[];
  resistances: number[];
  fibLevels: { level: string; price: number }[];
  rsi: number;
  rsiArr: number[];
  stochRsi: { k: number; d: number };
  macdHistArr: number[];
  ema9Arr: number[];
  ema21Arr: number[];
  bbWidths: number[];
  bbWidth: number;
  volData: {
    current: number;
    average: number;
    ratio: number;
    trend: string;
    cvd: number;
    available: boolean;
    ema20: number;
    spikeRatio: number;
    spikeLabel: string;
    absorption: { detected: boolean; direction: "bullish" | "bearish" | null; strength: number } | null;
  };
  fundingRate: number | null;
  oiChange: number | null;
  dec: number;
}) {
  const {
    candles15m, currentPrice, atr, supports, resistances, fibLevels,
    rsi, rsiArr, stochRsi, macdHistArr, ema9Arr, ema21Arr,
    bbWidths, bbWidth, volData, fundingRate, oiChange, dec,
  } = params;

  // ── Module 1: Key Level Proximity Scanner ─────────────────────────────────

  const velocityCandles = candles15m.slice(-5);
  const priceVelocity = velocityCandles.length >= 2
    ? (velocityCandles[velocityCandles.length - 1].close - velocityCandles[0].close) / (velocityCandles.length - 1)
    : 0;
  const velocityPerATR = atr > 0 ? Math.abs(priceVelocity) / atr : 0;

  const orderBlocks: number[] = [];
  const volEmaForOB = ema(candles15m.map(c => c.volume), 20);
  const recentOB = candles15m.slice(-30);
  const obStartIdx = candles15m.length - 30;
  for (let i = 0; i < recentOB.length; i++) {
    const c = recentOB[i];
    const range = c.high - c.low;
    if (range <= 0) continue;
    const bodyRatio = Math.abs(c.close - c.open) / range;
    const volEmaIdx = obStartIdx + i;
    const volEma = volEmaIdx >= 0 && volEmaIdx < volEmaForOB.length ? volEmaForOB[volEmaIdx] : 0;
    if (bodyRatio < 0.3 && volEma > 0 && c.volume > 1.8 * volEma) {
      orderBlocks.push((c.high + c.low) / 2);
    }
  }

  type ApproachingLevel = {
    level: number;
    type: "support" | "resistance" | "fib" | "order_block";
    distance: number;
    tier: "IMMINENT" | "APPROACHING" | "WATCHLIST";
    velocity: number;
    estimatedCandles: number | null;
    fibLevel?: string;
  };

  const approachingLevels: ApproachingLevel[] = [];

  const classifyLevel = (
    level: number,
    type: "support" | "resistance" | "fib" | "order_block",
    fibLabel?: string
  ) => {
    const rawDist = Math.abs(currentPrice - level);
    const distATR = atr > 0 ? rawDist / atr : Infinity;
    if (distATR > 2.0) return;

    const movingToward = type === "support" || type === "fib"
      ? priceVelocity < 0
      : priceVelocity > 0;

    let tier: "IMMINENT" | "APPROACHING" | "WATCHLIST";
    if (distATR < 0.3) tier = "IMMINENT";
    else if (distATR < 1.0) tier = "APPROACHING";
    else tier = "WATCHLIST";

    if (movingToward && velocityPerATR > 0.5 && tier !== "IMMINENT") {
      tier = tier === "WATCHLIST" ? "APPROACHING" : "IMMINENT";
    }

    let estCandles: number | null = null;
    if (movingToward && Math.abs(priceVelocity) > 0) {
      const est = rawDist / Math.abs(priceVelocity);
      if (est > 0 && est < 50) estCandles = Math.round(est);
    }

    const entry: ApproachingLevel = {
      level: round(level, dec),
      type,
      distance: Math.round(distATR * 100) / 100,
      tier,
      velocity: Math.round(velocityPerATR * 100) / 100,
      estimatedCandles: estCandles,
    };
    if (fibLabel) entry.fibLevel = fibLabel;
    approachingLevels.push(entry);
  };

  for (const s of supports) classifyLevel(s, "support");
  for (const r of resistances) classifyLevel(r, "resistance");
  for (const f of fibLevels) classifyLevel(f.price, "fib", f.level);
  for (const ob of orderBlocks) classifyLevel(ob, "order_block");

  approachingLevels.sort((a, b) => a.distance - b.distance);

  // ── Module 2: Retest Anticipation Engine ──────────────────────────────────

  let retestSetup: {
    active: boolean;
    level: number | null;
    state: "BREAKOUT_DETECTED" | "PULLBACK_IN_PROGRESS" | "RETEST_ZONE" | null;
    direction: "long" | "short" | null;
    volumeConfirms: boolean;
    rsiResetting: boolean;
  } = { active: false, level: null, state: null, direction: null, volumeConfirms: false, rsiResetting: false };

  const nearestRes = resistances[0] ?? null;
  const nearestSup = supports[0] ?? null;

  if (nearestRes !== null && atr > 0 && currentPrice > nearestRes + atr) {
    const pullbackDist = atr > 0 ? (currentPrice - nearestRes) / atr : Infinity;
    let state: "BREAKOUT_DETECTED" | "PULLBACK_IN_PROGRESS" | "RETEST_ZONE" = "BREAKOUT_DETECTED";
    if (pullbackDist < 0.5) state = "RETEST_ZONE";
    else if (priceVelocity < 0) state = "PULLBACK_IN_PROGRESS";
    retestSetup = {
      active: true,
      level: round(nearestRes, dec),
      state,
      direction: "long",
      volumeConfirms: volData.trend === "decreasing",
      rsiResetting: rsi >= 40 && rsi <= 60,
    };
  } else if (nearestSup !== null && atr > 0 && currentPrice < nearestSup - atr) {
    const pullbackDist = atr > 0 ? (nearestSup - currentPrice) / atr : Infinity;
    let state: "BREAKOUT_DETECTED" | "PULLBACK_IN_PROGRESS" | "RETEST_ZONE" = "BREAKOUT_DETECTED";
    if (pullbackDist < 0.5) state = "RETEST_ZONE";
    else if (priceVelocity > 0) state = "PULLBACK_IN_PROGRESS";
    retestSetup = {
      active: true,
      level: round(nearestSup, dec),
      state,
      direction: "short",
      volumeConfirms: volData.trend === "decreasing",
      rsiResetting: rsi >= 40 && rsi <= 60,
    };
  }

  // ── Module 3: Structure Formation Scanner (BOS/CHoCH) ─────────────────────

  const structureSignals: {
    type: "BOS_FORMING" | "CHOCH_FORMING" | "LIQUIDITY_SWEEP";
    direction: "bullish" | "bearish";
    referenceLevel: number;
    distanceToTrigger: number;
  }[] = [];

  const swings = findSwingLevelsFromCandles(candles15m, 2, 50);
  const swingHighs = swings.rawResistances;
  const swingLows = swings.rawSupports;

  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const lastSH = swingHighs[swingHighs.length - 1];
    const prevSH = swingHighs[swingHighs.length - 2];
    const lastSL = swingLows[swingLows.length - 1];
    const prevSL = swingLows[swingLows.length - 2];

    const isUptrend = lastSH > prevSH && lastSL > prevSL;
    const isDowntrend = lastSH < prevSH && lastSL < prevSL;

    if (isUptrend && atr > 0) {
      const distToSH = (lastSH - currentPrice) / atr;
      if (distToSH > 0 && distToSH < 0.3) {
        structureSignals.push({
          type: "BOS_FORMING",
          direction: "bullish",
          referenceLevel: round(lastSH, dec),
          distanceToTrigger: Math.round(distToSH * 100) / 100,
        });
      }
      if (currentPrice < lastSL) {
        structureSignals.push({
          type: "CHOCH_FORMING",
          direction: "bearish",
          referenceLevel: round(lastSL, dec),
          distanceToTrigger: 0,
        });
      }
    }

    if (isDowntrend && atr > 0) {
      const distToSL = (currentPrice - lastSL) / atr;
      if (distToSL > 0 && distToSL < 0.3) {
        structureSignals.push({
          type: "BOS_FORMING",
          direction: "bearish",
          referenceLevel: round(lastSL, dec),
          distanceToTrigger: Math.round(distToSL * 100) / 100,
        });
      }
      if (currentPrice > lastSH) {
        structureSignals.push({
          type: "CHOCH_FORMING",
          direction: "bullish",
          referenceLevel: round(lastSH, dec),
          distanceToTrigger: 0,
        });
      }
    }

    const lastCandle = candles15m[candles15m.length - 1];
    if (lastCandle) {
      if (lastCandle.low < lastSL && lastCandle.close > lastSL) {
        structureSignals.push({
          type: "LIQUIDITY_SWEEP",
          direction: "bullish",
          referenceLevel: round(lastSL, dec),
          distanceToTrigger: 0,
        });
      }
      if (lastCandle.high > lastSH && lastCandle.close < lastSH) {
        structureSignals.push({
          type: "LIQUIDITY_SWEEP",
          direction: "bearish",
          referenceLevel: round(lastSH, dec),
          distanceToTrigger: 0,
        });
      }
    }
  }

  // ── Module 4: Confluence Convergence Detector ─────────────────────────────

  const convergingIndicators: { name: string; detail: string; weight: number }[] = [];
  let confluenceScore = 0;

  const ema9Now = ema9Arr.length > 0 ? ema9Arr[ema9Arr.length - 1] : 0;
  const ema21Now = ema21Arr.length > 0 ? ema21Arr[ema21Arr.length - 1] : 0;
  const emaGap = Math.abs(ema9Now - ema21Now);
  const ema9Prev = ema9Arr.length > 5 ? ema9Arr[ema9Arr.length - 6] : ema9Now;
  const ema21Prev = ema21Arr.length > 5 ? ema21Arr[ema21Arr.length - 6] : ema21Now;
  const prevEmaGap = Math.abs(ema9Prev - ema21Prev);

  if (atr > 0 && emaGap < 0.15 * atr && emaGap < prevEmaGap) {
    confluenceScore += 20;
    convergingIndicators.push({
      name: "EMA 9/21 cross",
      detail: `Gap ${round(emaGap, dec)} and narrowing`,
      weight: 20,
    });
  }

  if ((rsi >= 32 && rsi <= 38) || (rsi >= 62 && rsi <= 68)) {
    confluenceScore += 15;
    convergingIndicators.push({
      name: "RSI approaching zone",
      detail: rsi < 50 ? `RSI ${round(rsi, 1)} near oversold` : `RSI ${round(rsi, 1)} near overbought`,
      weight: 15,
    });
  }

  const histNow = macdHistArr.length > 0 ? macdHistArr[macdHistArr.length - 1] : 0;
  const histPrev = macdHistArr.length > 1 ? macdHistArr[macdHistArr.length - 2] : histNow;
  if (atr > 0 && Math.abs(histNow) < 0.1 * atr && Math.sign(histNow) !== Math.sign(histPrev)) {
    confluenceScore += 15;
    convergingIndicators.push({
      name: "MACD histogram",
      detail: "Near zero and changing direction",
      weight: 15,
    });
  }

  if (Math.abs(stochRsi.k - stochRsi.d) < 5) {
    const stochConverging = macdHistArr.length > 1; // proxy: if we have data
    if (stochConverging) {
      confluenceScore += 10;
      convergingIndicators.push({
        name: "Stoch RSI K/D",
        detail: `Gap ${round(Math.abs(stochRsi.k - stochRsi.d), 1)} converging`,
        weight: 10,
      });
    }
  }

  for (const f of fibLevels) {
    if (f.level === "0.618" || f.level === "0.382") {
      const fibDist = atr > 0 ? Math.abs(currentPrice - f.price) / atr : Infinity;
      if (fibDist < 0.3) {
        confluenceScore += 15;
        convergingIndicators.push({
          name: "Fib level",
          detail: `Price at ${f.level} (${round(f.price, dec)})`,
          weight: 15,
        });
        break;
      }
    }
  }

  if (bbWidths.length >= 20) {
    const sortedWidths = [...bbWidths].sort((a, b) => a - b);
    const p20 = sortedWidths[Math.floor(sortedWidths.length * 0.2)];
    const prevBBW = bbWidths.length > 1 ? bbWidths[bbWidths.length - 2] : bbWidth;
    if (bbWidth <= p20 && bbWidth < prevBBW) {
      confluenceScore += 10;
      convergingIndicators.push({
        name: "BB squeeze",
        detail: "Width in bottom 20th percentile and narrowing",
        weight: 10,
      });
    }
  }

  if (volData.ratio < 0.5) {
    confluenceScore += 10;
    convergingIndicators.push({
      name: "Volume drying up",
      detail: `Ratio ${round(volData.ratio, 2)}`,
      weight: 10,
    });
  }

  const confluenceStatus: "SETUP_IMMINENT" | "SETUP_FORMING" | "NO_SETUP" =
    confluenceScore >= 60 ? "SETUP_IMMINENT" : confluenceScore >= 40 ? "SETUP_FORMING" : "NO_SETUP";

  // ── Module 5: Order Flow Early Warning ────────────────────────────────────

  let cvdDivDirection: "bullish" | "bearish" | null = null;
  let cvdDivDetected = false;

  if (candles15m.length >= 10) {
    const last10 = candles15m.slice(-10);
    const highestPriceCandle = last10.reduce((max, c) => c.high > max.high ? c : max, last10[0]);
    const lowestPriceCandle = last10.reduce((min, c) => c.low < min.low ? c : min, last10[0]);

    let runCvd = 0;
    const cvdAtCandles: number[] = [];
    for (const c of last10) {
      runCvd += c.close >= c.open ? c.volume : -c.volume;
      cvdAtCandles.push(runCvd);
    }

    const highIdx = last10.indexOf(highestPriceCandle);
    const lowestIdx = last10.indexOf(lowestPriceCandle);

    if (highIdx >= 0 && highIdx < cvdAtCandles.length) {
      const cvdAtHigh = cvdAtCandles[highIdx];
      const cvdNow = cvdAtCandles[cvdAtCandles.length - 1];
      if (currentPrice >= highestPriceCandle.high * 0.998 && cvdNow < cvdAtHigh) {
        cvdDivDetected = true;
        cvdDivDirection = "bearish";
      }
    }
    if (!cvdDivDetected && lowestIdx >= 0 && lowestIdx < cvdAtCandles.length) {
      const cvdAtLow = cvdAtCandles[lowestIdx];
      const cvdNow = cvdAtCandles[cvdAtCandles.length - 1];
      if (currentPrice <= lowestPriceCandle.low * 1.002 && cvdNow > cvdAtLow) {
        cvdDivDetected = true;
        cvdDivDirection = "bullish";
      }
    }
  }

  let fundingInflection = false;
  if (fundingRate !== null) {
    fundingInflection = (fundingRate > 0 && fundingRate < 0.0001) || (fundingRate < 0 && fundingRate > -0.0001);
  }

  let absorptionSequence = 0;
  if (candles15m.length >= 5) {
    const last5 = candles15m.slice(-5);
    const volEmaArr = ema(candles15m.map(c => c.volume), 20);
    for (let i = 0; i < last5.length; i++) {
      const c = last5[i];
      const range = c.high - c.low;
      const idx = candles15m.length - 5 + i;
      const ve = idx < volEmaArr.length ? volEmaArr[idx] : 0;
      if (range > 0 && Math.abs(c.close - c.open) < 0.3 * range && ve > 0 && c.volume > 1.8 * ve) {
        absorptionSequence++;
      }
    }
  }

  let oiPriceDivergence: string | null = null;
  if (oiChange !== null && candles15m.length >= 2) {
    const priceChange = Math.abs(
      ((currentPrice - candles15m[candles15m.length - 2].close) / candles15m[candles15m.length - 2].close) * 100
    );
    if (Math.abs(oiChange) > 5 && priceChange < 1) {
      oiPriceDivergence = oiChange > 0
        ? "OI rising but price flat — positions building"
        : "OI falling but price flat — positions unwinding";
    }
  }

  // ── Module 6: Projected Trigger Times ─────────────────────────────────────

  const projections: {
    indicator: string;
    trigger: string;
    estimatedCandles: number;
    direction: "bullish" | "bearish";
  }[] = [];

  if (ema9Arr.length >= 6 && ema21Arr.length >= 6) {
    const gapNow = ema9Now - ema21Now;
    const gapBefore = ema9Prev - ema21Prev;
    const rateOfClosure = (Math.abs(gapBefore) - Math.abs(gapNow)) / 5;
    if (rateOfClosure > 0 && Math.abs(gapNow) > 0) {
      const est = Math.abs(gapNow) / rateOfClosure;
      if (est > 0 && est < 50) {
        projections.push({
          indicator: "EMA 9/21",
          trigger: gapNow > 0 ? "Bearish cross" : "Bullish cross",
          estimatedCandles: Math.round(est),
          direction: gapNow > 0 ? "bearish" : "bullish",
        });
      }
    }
  }

  if (rsiArr.length >= 6) {
    const rsiVelocity = (rsiArr[rsiArr.length - 1] - rsiArr[rsiArr.length - 6]) / 5;
    if (rsiVelocity < 0 && rsi > 30) {
      const est = (rsi - 30) / Math.abs(rsiVelocity);
      if (est > 0 && est < 50) {
        projections.push({
          indicator: "RSI",
          trigger: "Reaching oversold (30)",
          estimatedCandles: Math.round(est),
          direction: "bearish",
        });
      }
    }
    if (rsiVelocity > 0 && rsi < 70) {
      const est = (70 - rsi) / rsiVelocity;
      if (est > 0 && est < 50) {
        projections.push({
          indicator: "RSI",
          trigger: "Reaching overbought (70)",
          estimatedCandles: Math.round(est),
          direction: "bullish",
        });
      }
    }
  }

  const allLevels = [
    ...supports.map(s => ({ price: s, label: "support" })),
    ...resistances.map(r => ({ price: r, label: "resistance" })),
  ];
  if (Math.abs(priceVelocity) > 0) {
    for (const lvl of allLevels) {
      const dist = lvl.price - currentPrice;
      if ((dist > 0 && priceVelocity > 0) || (dist < 0 && priceVelocity < 0)) {
        const est = Math.abs(dist) / Math.abs(priceVelocity);
        if (est > 0 && est < 50) {
          projections.push({
            indicator: "Price",
            trigger: `Reaching ${lvl.label} at ${round(lvl.price, dec)}`,
            estimatedCandles: Math.round(est),
            direction: lvl.label === "resistance" ? "bullish" : "bearish",
          });
          break;
        }
      }
    }
  }

  // ── Overall Readiness ─────────────────────────────────────────────────────

  const hasImminent = approachingLevels.some(l => l.tier === "IMMINENT");
  const hasStructure = structureSignals.length > 0;

  let overallReadiness: "SETUP_READY" | "SETUP_FORMING" | "NO_SETUP";
  if ((confluenceStatus === "SETUP_IMMINENT" && (hasImminent || hasStructure)) || (confluenceScore >= 50 && hasImminent && hasStructure)) {
    overallReadiness = "SETUP_READY";
  } else if (confluenceStatus !== "NO_SETUP" || hasImminent || hasStructure || retestSetup.active) {
    overallReadiness = "SETUP_FORMING";
  } else {
    overallReadiness = "NO_SETUP";
  }

  const minCandles = projections.length > 0
    ? Math.min(...projections.map(p => p.estimatedCandles))
    : null;
  const actionableIn = minCandles !== null
    ? minCandles <= 3 ? "NOW" : `~${minCandles} candles`
    : hasImminent ? "NOW" : "Not imminent";

  return {
    approachingLevels: approachingLevels.slice(0, 10),
    retestSetup,
    structureSignals,
    confluence: {
      score: confluenceScore,
      status: confluenceStatus,
      convergingIndicators,
    },
    orderFlow: {
      cvdDivergenceForming: { detected: cvdDivDetected, direction: cvdDivDirection },
      fundingInflection,
      absorptionSequence,
      oiPriceDivergence,
    },
    projections,
    overallReadiness,
    actionableIn,
  };
}

// ── Multi-Timeframe Outlook ─────────────────────────────────────────────────

type TFBias = "LONG" | "SHORT" | "NEUTRAL";

interface TimeframeBias {
  timeframe: string;
  bias: TFBias;
  confidence: number;
  trend: string;
  rsi: number;
  emaAlignment: string;
  momentum: string;
  keyLevel: string | null;
  entry: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  riskReward: number | null;
}

interface HorizonTrade {
  bias: TFBias;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskReward: number;
  basedOn: string;
  confidence: number;
  expectedDuration: string;
}

type HorizonData = { label: string; timeframes: string[]; biases: TimeframeBias[]; consensus: TFBias; strength: number; trade: HorizonTrade | null };

interface TimeframeOutlook {
  short: HorizonData;
  medium: HorizonData;
  long: HorizonData;
  alignment: {
    allAligned: boolean;
    direction: TFBias;
    alignedCount: number;
    totalCount: number;
    tradeType: "ULTIMATE" | "POSITION" | "SWING" | "SCALP" | "CONFLICTED";
    description: string;
  };
}

function analyzeSingleTimeframe(
  closes: number[],
  candles: Candle[],
  timeframe: string,
  dec: number
): TimeframeBias | null {
  if (closes.length < 21) return null;

  const rsiArr = computeRSI(closes);
  const rsiVal = tip(rsiArr);
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const e50 = closes.length >= 50 ? ema(closes, 50) : null;
  const last9 = tip(e9);
  const last21 = tip(e21);
  const last50 = e50 ? tip(e50) : null;
  const macd = computeMACD(closes);
  const hist = tip(macd.histogram);
  const price = closes[closes.length - 1];

  let trend: string;
  if (last50 !== null) {
    trend = last9 > last21 && last21 > last50 ? "bull" : last9 < last21 && last21 < last50 ? "bear" : "mixed";
  } else {
    trend = last9 > last21 ? "bull" : last9 < last21 ? "bear" : "mixed";
  }

  let emaAlignment: string;
  if (last50 !== null) {
    if (price > last9 && last9 > last21 && last21 > last50) emaAlignment = "Perfect Bull Stack";
    else if (price < last9 && last9 < last21 && last21 < last50) emaAlignment = "Perfect Bear Stack";
    else if (price > last21) emaAlignment = "Above Key EMAs";
    else emaAlignment = "Below Key EMAs";
  } else {
    emaAlignment = price > last9 && last9 > last21 ? "Bull" : price < last9 && last9 < last21 ? "Bear" : "Mixed";
  }

  let momentum: string;
  if (hist > 0 && rsiVal > 50) momentum = "Bullish";
  else if (hist < 0 && rsiVal < 50) momentum = "Bearish";
  else momentum = "Mixed";

  const swings = findSwingLevelsFromCandles(candles, 2, Math.min(40, candles.length - 4));
  let keyLevel: string | null = null;
  if (swings.rawSupports.length > 0 || swings.rawResistances.length > 0) {
    const nearestSup = swings.rawSupports.length > 0
      ? swings.rawSupports.reduce((closest, s) => s < price && price - s < price - closest ? s : closest, swings.rawSupports[0])
      : null;
    const nearestRes = swings.rawResistances.length > 0
      ? swings.rawResistances.reduce((closest, r) => r > price && r - price < closest - price ? r : closest, swings.rawResistances[0])
      : null;
    if (nearestSup !== null && nearestRes !== null) {
      const supDist = price - nearestSup;
      const resDist = nearestRes - price;
      keyLevel = supDist < resDist
        ? `Near support ${round(nearestSup, dec)}`
        : `Near resistance ${round(nearestRes, dec)}`;
    }
  }

  let score = 0;
  if (trend === "bull") score += 30;
  else if (trend === "bear") score -= 30;
  if (rsiVal > 55) score += 15;
  else if (rsiVal < 45) score -= 15;
  if (hist > 0) score += 20;
  else if (hist < 0) score -= 20;
  if (price > last21) score += 15;
  else score -= 15;
  if (last50 !== null) {
    if (price > last50) score += 10;
    else score -= 10;
  }

  let bias: TFBias;
  if (score > 15) bias = "LONG";
  else if (score < -15) bias = "SHORT";
  else bias = "NEUTRAL";

  const confidence = Math.min(100, Math.abs(score));

  const atrArr = computeATR(candles);
  const tfATR = tip(atrArr);

  let entry: number | null = null;
  let stopLoss: number | null = null;
  let tp1: number | null = null;
  let tp2: number | null = null;
  let riskReward: number | null = null;

  if (bias !== "NEUTRAL" && tfATR > 0) {
    const sups = swings.rawSupports.filter(s => s < price).sort((a, b) => b - a);
    const ress = swings.rawResistances.filter(r => r > price).sort((a, b) => a - b);

    if (bias === "LONG") {
      entry = sups[0] && Math.abs(price - sups[0]) / tfATR < 2 ? round(sups[0], dec) : round(price, dec);
      stopLoss = round((sups[0] ?? price) - 0.5 * tfATR, dec);
      tp1 = round(ress[0] ?? price + 1.5 * tfATR, dec);
      tp2 = round(ress[1] ?? (tp1 + tfATR), dec);
    } else {
      entry = ress[0] && Math.abs(ress[0] - price) / tfATR < 2 ? round(ress[0], dec) : round(price, dec);
      stopLoss = round((ress[0] ?? price) + 0.5 * tfATR, dec);
      tp1 = round(sups[0] ?? price - 1.5 * tfATR, dec);
      tp2 = round(sups[1] ?? (tp1 - tfATR), dec);
    }

    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(tp2 - entry);
    riskReward = risk > 0 ? Math.round((reward / risk) * 100) / 100 : null;
  }

  return { timeframe, bias, confidence, trend, rsi: Math.round(rsiVal * 100) / 100, emaAlignment, momentum, keyLevel, entry, stopLoss, tp1, tp2, riskReward };
}

function computeTimeframeOutlook(params: {
  candles5m: Candle[];
  candles15m: Candle[];
  candles1h: Candle[];
  candles4h: Candle[];
  candlesDaily: Candle[];
  dec: number;
}): TimeframeOutlook {
  const { candles5m, candles15m, candles1h, candles4h, candlesDaily, dec } = params;

  const tf5m = analyzeSingleTimeframe(candles5m.map(c => c.close), candles5m, "5m", dec);
  const tf15m = analyzeSingleTimeframe(candles15m.map(c => c.close), candles15m, "15m", dec);
  const tf1h = analyzeSingleTimeframe(candles1h.map(c => c.close), candles1h, "1h", dec);
  const tf4h = analyzeSingleTimeframe(candles4h.map(c => c.close), candles4h, "4h", dec);
  const tfDaily = analyzeSingleTimeframe(candlesDaily.map(c => c.close), candlesDaily, "1D", dec);

  const neutral: TimeframeBias = { timeframe: "", bias: "NEUTRAL", confidence: 0, trend: "mixed", rsi: 50, emaAlignment: "Mixed", momentum: "Mixed", keyLevel: null, entry: null, stopLoss: null, tp1: null, tp2: null, riskReward: null };

  const shortBiases = [tf5m ?? { ...neutral, timeframe: "5m" }, tf15m ?? { ...neutral, timeframe: "15m" }];
  const mediumBiases = [tf15m ?? { ...neutral, timeframe: "15m" }, tf1h ?? { ...neutral, timeframe: "1h" }, tf4h ?? { ...neutral, timeframe: "4h" }];
  const longBiases = [tfDaily ?? { ...neutral, timeframe: "1D" }, tf4h ?? { ...neutral, timeframe: "4h" }];

  const getConsensus = (biases: TimeframeBias[]): { consensus: TFBias; strength: number } => {
    const longCount = biases.filter(b => b.bias === "LONG").length;
    const shortCount = biases.filter(b => b.bias === "SHORT").length;
    const total = biases.length;
    if (longCount > total / 2) return { consensus: "LONG", strength: Math.round((longCount / total) * 100) };
    if (shortCount > total / 2) return { consensus: "SHORT", strength: Math.round((shortCount / total) * 100) };
    return { consensus: "NEUTRAL", strength: 0 };
  };

  const shortResult = getConsensus(shortBiases);
  const mediumResult = getConsensus(mediumBiases);
  const longResult = getConsensus(longBiases);

  const allBiases = [tf5m, tf15m, tf1h, tf4h, tfDaily].filter((b): b is TimeframeBias => b !== null);
  const longCount = allBiases.filter(b => b.bias === "LONG").length;
  const shortCount = allBiases.filter(b => b.bias === "SHORT").length;
  const allAligned = longCount === allBiases.length || shortCount === allBiases.length;
  const dominantDir: TFBias = longCount > shortCount ? "LONG" : shortCount > longCount ? "SHORT" : "NEUTRAL";
  const alignedCount = Math.max(longCount, shortCount);

  let tradeType: "ULTIMATE" | "POSITION" | "SWING" | "SCALP" | "CONFLICTED";
  let description: string;

  if (allAligned && allBiases.length >= 4) {
    tradeType = "ULTIMATE";
    description = `All ${allBiases.length} timeframes align ${dominantDir} — maximum conviction position trade`;
  } else if (longResult.consensus !== "NEUTRAL" && mediumResult.consensus === longResult.consensus) {
    tradeType = "POSITION";
    description = `Long + medium timeframes align ${longResult.consensus} — position/swing trade`;
  } else if (mediumResult.consensus !== "NEUTRAL" && shortResult.consensus === mediumResult.consensus) {
    tradeType = "SWING";
    description = `Short + medium timeframes align ${mediumResult.consensus} — swing trade`;
  } else if (shortResult.consensus !== "NEUTRAL" && shortResult.strength >= 80) {
    tradeType = "SCALP";
    description = `Short timeframes ${shortResult.consensus} but higher TFs diverge — scalp only`;
  } else {
    tradeType = "CONFLICTED";
    description = "Timeframes in conflict — no clear edge, wait for alignment";
  }

  const computeHorizonTrade = (biases: TimeframeBias[], consensus: TFBias): HorizonTrade | null => {
    if (consensus === "NEUTRAL") return null;

    const tfOrder = ["1D", "4h", "1h", "15m", "5m"];
    const matching = biases.filter(b => b.bias === consensus);
    if (matching.length === 0) return null;

    matching.sort((a, b) => tfOrder.indexOf(a.timeframe) - tfOrder.indexOf(b.timeframe));
    const primary = matching[0];

    if (primary.entry == null || primary.stopLoss == null) return null;

    let t1 = primary.tp1;
    let t2 = primary.tp2;
    if (t1 == null || t2 == null) {
      const atrProxy = Math.abs(primary.entry - primary.stopLoss) * 2;
      if (consensus === "LONG") {
        t1 = round(primary.entry + 1.5 * atrProxy, dec);
        t2 = round(primary.entry + 2.5 * atrProxy, dec);
      } else {
        t1 = round(primary.entry - 1.5 * atrProxy, dec);
        t2 = round(primary.entry - 2.5 * atrProxy, dec);
      }
    }

    const t3 = consensus === "LONG"
      ? round(t2 + (t2 - t1), dec)
      : round(t2 - (t1 - t2), dec);

    const risk = Math.abs(primary.entry - primary.stopLoss);
    const reward = Math.abs(t2 - primary.entry);
    const rr = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;

    const avgConfidence = Math.round(matching.reduce((s, b) => s + b.confidence, 0) / matching.length);

    const tfMinutes: Record<string, number> = { "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1D": 1440 };
    const primaryMinutes = tfMinutes[primary.timeframe] ?? 60;
    const estMinutes = primaryMinutes * 10;
    let expectedDuration: string;
    if (estMinutes < 60) expectedDuration = `~${estMinutes} min`;
    else if (estMinutes < 1440) expectedDuration = `~${Math.round(estMinutes / 60)} hrs`;
    else expectedDuration = `~${Math.round(estMinutes / 1440)} days`;

    return {
      bias: consensus,
      entry: primary.entry,
      stopLoss: primary.stopLoss,
      tp1: t1,
      tp2: t2,
      tp3: t3,
      riskReward: rr,
      basedOn: matching.map(b => b.timeframe).join(" + "),
      confidence: avgConfidence,
      expectedDuration,
    };
  };

  return {
    short: { label: "Short-Term", timeframes: ["5m", "15m"], biases: shortBiases, ...shortResult, trade: computeHorizonTrade(shortBiases, shortResult.consensus) },
    medium: { label: "Medium-Term", timeframes: ["15m", "1h", "4h"], biases: mediumBiases, ...mediumResult, trade: computeHorizonTrade(mediumBiases, mediumResult.consensus) },
    long: { label: "Long-Term", timeframes: ["4h", "1D"], biases: longBiases, ...longResult, trade: computeHorizonTrade(longBiases, longResult.consensus) },
    alignment: { allAligned, direction: dominantDir, alignedCount, totalCount: allBiases.length, tradeType, description },
  };
}

// ── Main Trade Call Computation ──────────────────────────────────────────────

// ── Trend-system + exhaustion composite (lib/ta/indicators) across 15m / 4h / 1d ─────────────────────
// Trend tools (SMC structure, Ichimoku, squeeze, Chandelier, Donchian, PSAR, AVWAP, HA, MACD zero cross)
// and exhaustion tools (double top/bottom, H&S, wedges, liquidity sweeps, TD Sequential, climax, CCI, %R)
// are averaged separately. A reversal read (trend one way, exhaustion the other) only carries full weight
// once a STRUCTURAL confirmation exists (CHoCH, sweep, confirmed pattern); otherwise it is a "forming" note.
interface TaSystem {
  trendScore: number;
  exhaustionScore: number;
  score: number;
  setup: "continuation" | "reversal_confirmed" | "reversal_forming" | "none";
  direction: "bullish" | "bearish" | null;
  confirmedBy: string[];
  notes: string[];
  perTF: Record<string, { trend: number; exhaustion: number; score: number; top: { name: string; score: number; note: string }[] }>;
}

const STRUCTURAL = new Set(["marketStructure", "liquiditySweep", "doubleTopBottom", "headAndShouldersBoth", "wedge"]);

function computeTaSystem(series: Record<string, Candle[]>, tfWeights: Record<string, number>, opts?: CompositeOpts): TaSystem | null {
  const perTF: TaSystem["perTF"] = {};
  const comps: Record<string, CompositeResult> = {};
  let wsum = 0, trend = 0, exh = 0;
  for (const tf of Object.keys(series)) {
    const c = series[tf];
    if (!c || c.length < 60) continue;
    let r: CompositeResult;
    try {
      r = scoreShortSideComposite(c, opts);
    } catch {
      continue;
    }
    comps[tf] = r;
    const w = tfWeights[tf] ?? 1;
    wsum += w;
    trend += w * r.trendScore;
    exh += w * r.exhaustionScore;
    perTF[tf] = {
      trend: r.trendScore,
      exhaustion: r.exhaustionScore,
      score: r.score,
      top: [...r.components].filter((k) => k.score !== 0).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 4).map((k) => ({ name: k.name, score: k.score, note: k.note })),
    };
  }
  if (wsum === 0) return null;
  const trendScore = Math.round((trend / wsum) * 10) / 10;
  const exhaustionScore = Math.round((exh / wsum) * 10) / 10;

  // Structural confirmations agreeing with the exhaustion direction, on any timeframe.
  const exhDir = exhaustionScore <= -25 ? -1 : exhaustionScore >= 25 ? 1 : 0;
  const confirmedBy: string[] = [];
  if (exhDir !== 0) {
    for (const tf of Object.keys(comps)) {
      for (const k of comps[tf].components) {
        if (STRUCTURAL.has(k.name) && Math.sign(k.score) === exhDir && Math.abs(k.score) >= 55) confirmedBy.push(`${tf} ${k.name}`);
      }
    }
  }

  let setup: TaSystem["setup"] = "none";
  let direction: TaSystem["direction"] = null;
  let score: number;
  const notes: string[] = [];
  const opposed = exhDir !== 0 && Math.sign(trendScore) === -exhDir && Math.abs(trendScore) >= 25;
  if (opposed) {
    direction = exhDir > 0 ? "bullish" : "bearish";
    if (confirmedBy.length > 0) {
      setup = "reversal_confirmed";
      // Confirmed reversal: exhaustion leads, the stale trend is discounted
      score = Math.round(0.7 * exhaustionScore + 0.3 * trendScore);
      notes.push(`${direction === "bearish" ? "Uptrend exhausting with structure broken" : "Downtrend exhausting with structure reclaimed"} — reversal ${direction === "bearish" ? "short" : "long"} confirmed by ${confirmedBy.slice(0, 2).join(", ")}`);
    } else {
      setup = "reversal_forming";
      // Not confirmed: trend still rules, exhaustion only trims it
      score = Math.round(0.75 * trendScore + 0.25 * exhaustionScore);
      notes.push(`${direction === "bearish" ? "Uptrend showing bearish exhaustion" : "Downtrend showing bullish exhaustion"} — ${direction === "bearish" ? "short" : "long"} setup forming, wait for a structure break`);
    }
  } else if (Math.abs(trendScore) >= 25) {
    setup = "continuation";
    direction = trendScore > 0 ? "bullish" : "bearish";
    score = Math.round(0.6 * trendScore + 0.4 * exhaustionScore);
    notes.push(`Trend system ${direction} (${trendScore > 0 ? "+" : ""}${trendScore}) with ${exhDir === 0 ? "no exhaustion against it" : "exhaustion aligned"} — ${direction === "bearish" ? "short" : "long"} continuation`);
  } else {
    score = Math.round(0.6 * trendScore + 0.4 * exhaustionScore);
    notes.push(`Trend system flat (${trendScore > 0 ? "+" : ""}${trendScore}); exhaustion ${exhaustionScore > 0 ? "+" : ""}${exhaustionScore}`);
  }
  return { trendScore, exhaustionScore, score: clamp(score, -100, 100), setup, direction, confirmedBy, notes, perTF };
}

// ── Cloud / 200MA / ADX regime factor ───────────────────────────────────────
// Three pillars per timeframe (Ichimoku 0.40, 200MA 0.35, ADX/DI 0.25), each -100..100 and strictly
// sign-symmetric: mirroring the candles negates every line, so the factor cannot favour one side. Blended
// 15m 0.2 / 4h 0.4 / 1d 0.4. The trend-system composite keeps a small Ichimoku weight for its
// reversal/continuation logic; THIS factor owns the regime vote. Needs >= 80 bars per TF (Ichimoku) and
// >= 200 for the 200MA pillar; a thinner TF degrades to the pillars it can compute, never throws.
const REGIME_TF_WEIGHTS: Record<RegimeTF, number> = { "15m": 0.2, "4h": 0.4, "1d": 0.4 };
const REGIME_TFS: RegimeTF[] = ["15m", "4h", "1d"];

function trendStrengthFor(adx: number): TrendStrength {
  return adx < 15 ? "none" : adx < 20 ? "weak" : adx < 25 ? "emerging" : adx <= 40 ? "strong" : "extreme";
}
/** Sign-symmetric rounding so round(-x) === -round(x) exactly (Math.round is not symmetric at .5). */
function rsym(x: number, decimals = 1): number {
  const m = Math.pow(10, decimals);
  return (Math.sign(x) * Math.round(Math.abs(x) * m)) / m;
}
const sgn = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

interface RegimeTFCalc {
  info: RegimeTFInfo;
  transition: boolean;
  notes: string[];
}

function regimeForTF(c: Candle[], tf: RegimeTF, dec: number): RegimeTFCalc | null {
  if (c.length < 80) return null;
  const n = c.length - 1;
  const closes = c.map((k) => k.close);
  const close = closes[n];
  const atr = atrSeries(c, 14)[n] || 1;
  const notes: string[] = [];

  // ── Ichimoku pillar ──
  const ich = ichimoku(c);
  const cloudTop = Math.max(ich.senkouA, ich.senkouB);
  const cloudBottom = Math.min(ich.senkouA, ich.senkouB);
  const cloudThin = cloudTop - cloudBottom < 0.5 * atr;
  const colourSign = sgn(ich.senkouA - ich.senkouB);
  const futureSign = sgn(ich.futureSenkouA - ich.futureSenkouB);
  const posSign = ich.pricePosition === "above" ? 1 : ich.pricePosition === "below" ? -1 : 0;
  const tkState = sgn(ich.tenkan - ich.kijun);
  const chikouSign = sgn(close - closes[n - 26]);
  let ichi = posSign * 25 * (cloudThin ? 0.5 : 1);
  ichi += colourSign * 10;
  if (ich.kumoTwist !== "none") ichi += (ich.kumoTwist === "bullish" ? 1 : -1) * 10;
  else ichi += futureSign * 5;
  if (ich.tkCross !== "none" && ich.tkCrossBarsAgo >= 0) {
    const cs = ich.tkCross === "bullish" ? 1 : -1;
    const base = posSign === cs ? 20 : posSign === 0 ? 12 : 6;
    const bars = ich.tkCrossBarsAgo;
    const decay = bars <= 5 ? 1 : bars >= 20 ? 0.5 : 1 - (0.5 * (bars - 5)) / 15;
    ichi += cs * base * decay;
  } else {
    ichi += tkState * 8;
  }
  ichi += chikouSign * 15;
  ichi += sgn(close - ich.kijun) * 10;
  ichi += sgn(close - ich.tenkan) * 10;
  ichi = clamp(ichi, -100, 100);

  // ── 200MA pillar ──
  let sma200: number | null = null;
  let ema200: number | null = null;
  let ma200Side: RegimeTFInfo["ma200Side"] = null;
  let ma200DistAtr: number | null = null;
  let ma200Slope: RegimeTFInfo["ma200Slope"] = null;
  let freshCross: RegimeTFInfo["freshCross"] = null;
  let barsSinceCross: number | null = null;
  let goldenCross: RegimeTFInfo["goldenCross"] = null;
  let maPillar: number | null = null;
  let maSign = 0;
  if (closes.length >= 200) {
    const smaArr = smaArray(closes, 200);
    const emaArr = ema(closes, 200);
    sma200 = smaArr[n];
    ema200 = emaArr[n];
    maSign = sgn(close - sma200);
    ma200Side = maSign > 0 ? "above" : maSign < 0 ? "below" : "at";
    const dist = (close - sma200) / atr;
    ma200DistAtr = rsym(dist, 2);
    const slope = closes.length >= 210 ? (smaArr[n] - smaArr[n - 10]) / atr : 0;
    ma200Slope = slope > 0.05 ? "rising" : slope < -0.05 ? "falling" : "flat";
    let m = maSign * 25 + sgn(close - ema200) * 10 + clamp(slope * 20, -15, 15);
    const ad = Math.abs(dist);
    m += maSign * (ad <= 1 ? 20 : ad <= 3 ? 10 : ad <= 4 ? 0 : -10);
    // Fresh price cross of the SMA200: the most recent side flip within 30 bars, confirmed by a second close
    let crossBars: number | null = null;
    for (let i = n; i >= Math.max(200, n - 30); i--) {
      const a = sgn(closes[i] - smaArr[i]);
      const b = sgn(closes[i - 1] - smaArr[i - 1]);
      if (a !== 0 && b !== 0 && a !== b) {
        crossBars = n - i;
        break;
      }
    }
    if (crossBars != null) {
      barsSinceCross = crossBars;
      if (crossBars >= 1 && maSign !== 0) {
        const decay = crossBars <= 5 ? 1 : crossBars >= 30 ? 0 : 1 - (crossBars - 5) / 25;
        m += maSign * 15 * decay;
        freshCross = maSign > 0 ? "bullish" : "bearish";
      }
    }
    if (c.length >= 202) {
      const gx = deathGoldenCross(c);
      if (gx.barsSinceCross >= 0) {
        goldenCross = gx.state;
        m += (gx.state === "golden" ? 1 : -1) * (gx.barsSinceCross <= 30 ? 15 : 8);
      }
    }
    maPillar = clamp(m, -100, 100);
  }

  // ── ADX / DI pillar ──
  const dmi = computeDMI(c, 14);
  const adx = dmi.adx[n];
  const pdi = dmi.plusDI[n];
  const mdi = dmi.minusDI[n];
  const diSign = sgn(pdi - mdi);
  const diSpread = Math.abs(pdi - mdi) / (pdi + mdi || 1);
  const adxDelta5 = adx - dmi.adx[Math.max(0, n - 5)];
  const adxDelta10 = adx - dmi.adx[Math.max(0, n - 10)];
  const adxSlope: RegimeTFInfo["adxSlope"] = adxDelta5 > 1 ? "rising" : adxDelta5 < -1 ? "falling" : "flat";
  let sf = adx < 15 ? 0.15 : adx < 20 ? 0.3 : adx < 25 ? 0.6 : 1.0;
  sf += adxSlope === "rising" ? 0.15 : adxSlope === "falling" ? -0.15 : 0;
  const adxPillar = diSign * clamp(sf * (55 + 45 * diSpread), 0, 100);

  // ── Blend the pillars present ──
  const pillars: [number, number][] = [[ichi, 0.4], [adxPillar, 0.25]];
  if (maPillar != null) pillars.push([maPillar, 0.35]);
  const wsum = pillars.reduce((a, [, w]) => a + w, 0);
  let score = pillars.reduce((a, [v, w]) => a + v * w, 0) / wsum;

  // Agreement between the two structural pillars: cloud side and 200MA side
  let transition = false;
  let structuralSign = posSign;
  if (maPillar != null && posSign !== 0 && maSign !== 0) {
    if (posSign === maSign) score *= 1.15;
    else {
      score *= 0.6;
      transition = true;
      structuralSign = 0;
    }
  } else if (posSign === 0) {
    structuralSign = maSign;
  }
  // DI conflict early warning: directional movement turning against the structure while ADX builds
  if (structuralSign !== 0 && diSign === -structuralSign && adx >= 20 && adxDelta10 > 0) {
    score = sgn(score) * Math.max(0, Math.abs(score) - 15);
    notes.push(`DI turning ${diSign > 0 ? "bullish" : "bearish"} against the ${structuralSign > 0 ? "bull" : "bear"} regime on ${tf}, ADX rising: trend weakening`);
  }
  score = clamp(rsym(score), -100, 100);
  if (adx > 40) notes.push(`ADX ${adx.toFixed(0)} on ${tf}: extreme trend, late-entry risk`);

  const info: RegimeTFInfo = {
    score,
    cloud: ich.pricePosition,
    cloudColor: colourSign > 0 ? "bullish" : colourSign < 0 ? "bearish" : "flat",
    cloudThin,
    tkCross: ich.tkCross,
    tkCrossBarsAgo: ich.tkCrossBarsAgo,
    tkState: tkState > 0 ? "bullish" : tkState < 0 ? "bearish" : "flat",
    kumoTwist: ich.kumoTwist,
    chikou: chikouSign > 0 ? "above" : chikouSign < 0 ? "below" : "at",
    tenkan: round(ich.tenkan, dec),
    kijun: round(ich.kijun, dec),
    cloudTop: round(cloudTop, dec),
    cloudBottom: round(cloudBottom, dec),
    sma200: sma200 != null ? round(sma200, dec) : null,
    ema200: ema200 != null ? round(ema200, dec) : null,
    ma200Side,
    ma200DistAtr,
    ma200Slope,
    freshCross,
    barsSinceCross,
    goldenCross,
    adx: rsym(adx),
    plusDI: rsym(pdi),
    minusDI: rsym(mdi),
    adxSlope,
    diBias: diSign > 0 ? "bullish" : diSign < 0 ? "bearish" : "flat",
    trendStrength: trendStrengthFor(adx),
  };
  return { info, transition, notes };
}

export function computeRegime(
  series: Partial<Record<RegimeTF, Candle[]>>,
  dec = 2,
  ctx: { squeeze?: string | null } = {}
): RegimeInfo | null {
  const perTF: Partial<Record<RegimeTF, RegimeTFInfo>> = {};
  const calcs: Partial<Record<RegimeTF, RegimeTFCalc>> = {};
  let wsum = 0;
  let acc = 0;
  let anyTransition = false;
  for (const tf of REGIME_TFS) {
    const c = series[tf];
    if (!c || !c.length) continue;
    let r: RegimeTFCalc | null;
    try {
      r = regimeForTF(c, tf, dec);
    } catch {
      r = null;
    }
    if (!r || !Number.isFinite(r.info.score)) continue;
    calcs[tf] = r;
    perTF[tf] = r.info;
    const w = REGIME_TF_WEIGHTS[tf];
    wsum += w;
    acc += w * r.info.score;
    if (r.transition) anyTransition = true;
  }
  if (wsum === 0) return null;
  let score = acc / wsum;
  const notes: string[] = [];

  const adx15 = calcs["15m"]?.info.adx ?? null;
  const adx4 = calcs["4h"]?.info.adx ?? null;
  const adx1d = calcs["1d"]?.info.adx ?? null;
  const blendedAdx = adx15 != null && adx4 != null ? 0.4 * adx15 + 0.6 * adx4 : (adx4 ?? adx15 ?? adx1d ?? 0);
  const trendStrength = trendStrengthFor(blendedAdx);

  // Regime without trend strength: the classic breakout trap (above cloud and 200MA, ADX < 20, volume fading).
  // The squeeze gate in computeMultiFactorCall already forces WAIT on volatility_compression + ADX < 20, so the
  // damping is capped at 0.75 there to avoid penalising the same low ADX twice.
  let damped = false;
  if (adx15 != null && adx4 != null && adx15 < 20 && adx4 < 20) {
    score *= ctx.squeeze === "volatility_compression" ? 0.75 : 0.6;
    damped = true;
  }
  score = clamp(rsym(score), -100, 100);

  const hi = [calcs["4h"]?.info.score, calcs["1d"]?.info.score].filter((v): v is number => v != null);
  let label: RegimeInfo["label"];
  if (hi.length && hi.every((v) => v >= 30)) label = "Bull regime";
  else if (hi.length && hi.every((v) => v <= -30)) label = "Bear regime";
  else if (anyTransition) label = "Transition";
  else label = "Mixed";
  // Flat 200MA chop on both higher timeframes never reads as a regime
  if (adx4 != null && adx1d != null && adx4 < 20 && adx1d < 20 && Math.abs(score) < 30) label = "Mixed";

  const describe = (tf: RegimeTF) => {
    const i = perTF[tf];
    if (!i) return null;
    const ma = i.ma200Side ? `${i.ma200Side} 200MA` : "200MA n/a";
    return `${tf} ${i.cloud} cloud, ${ma}, ADX ${i.adx.toFixed(0)}`;
  };
  const parts = (["4h", "1d"] as RegimeTF[]).map(describe).filter(Boolean);
  notes.push(`${label} (${score > 0 ? "+" : ""}${score}): ${parts.join("; ") || describe("15m") || "insufficient data"}`);
  if (damped) {
    notes.push(`Regime present but trend strength absent (ADX ${adx15!.toFixed(0)}/${adx4!.toFixed(0)} on 15m/4h): breakout-trap risk, favour range entries`);
  }
  for (const tf of ["4h", "1d", "15m"] as RegimeTF[]) {
    const i = perTF[tf];
    if (!i) continue;
    if (i.freshCross) notes.push(`Fresh 200MA ${i.freshCross === "bullish" ? "reclaim" : "loss"} on ${tf} (${i.barsSinceCross} bars ago)`);
    if (i.tkCross !== "none" && i.tkCrossBarsAgo >= 0 && i.tkCrossBarsAgo <= 5) notes.push(`${i.tkCross === "bullish" ? "Bullish" : "Bearish"} Tenkan/Kijun cross on ${tf} ${i.cloud} the cloud (${i.tkCrossBarsAgo} bars ago)`);
  }
  for (const tf of REGIME_TFS) for (const nte of calcs[tf]?.notes ?? []) notes.push(nte);

  return { score, label, trendStrength, gate: "none", perTF, notes: notes.slice(0, 5) };
}

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
      available: boolean;
      ema20: number;
      spikeRatio: number;
      spikeLabel: string;
      absorption: { detected: boolean; direction: "bullish" | "bearish" | null; strength: number } | null;
    };
    isCrypto: boolean;
    assetClass: "crypto" | "stock" | "index" | "commodity" | "thin";
    newsSentimentScore: number | null;
    oilGeoScore: number | null;
    oilGeoRegime: "calm" | "elevated" | "extreme" | "whipsaw" | null;
    macroScores: MacroScores | null;
    preEventRisk: MacroEventIntel["preEventRisk"];
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
    macroState: MacroState | null;
    symbol: string;
    change24h: number;
    elliott: ElliottMTFResult | null;
    taSystem: TaSystem | null;
    regime: RegimeInfo | null;
    // Phase 3.2 universal event gate (null/absent = no event near: behaviour identical to before).
    eventWindow?: EventWindow | null;
    /** Decision time in ms (session rules). Defaults to Date.now(); the backtest passes the bar close. */
    now?: number;
  },
  dec: number
) {
  const eventWindow = params.eventWindow ?? null;
  const nowMs = params.now ?? Date.now();
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
    assetClass,
    newsSentimentScore,
    oilGeoScore,
    oilGeoRegime,
    macroScores,
    preEventRisk,
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
    macroState,
    symbol,
    change24h,
    elliott,
    taSystem,
    regime: regimeInfo,
  } = params;

  const trendDir15m =
    ema9 > ema21 && ema21 > ema50 ? "bull" : ema9 < ema21 && ema21 < ema50 ? "bear" : "mixed";

  // Factor weights: DEFAULT_WEIGHTS plus any setWeights() override (backtest --weights-json); the regime
  // weight always follows TUNING so the existing tuning knob keeps working. Same literal as before by default.
  const weights: FactorWeights = { ...DEFAULT_WEIGHTS, ...WEIGHT_OVERRIDES, regime: TUNING.regimeWeight };
  // Wave 2: the regime direction the mean-reversion votes may fade against. Only a trending regime (Bull/Bear
  // label, blended ADX >= 20) counts; a confirmed reversal structure re-enables the fades (R1.2).
  const regimeTrending = !!regimeInfo && (regimeInfo.label === "Bull regime" || regimeInfo.label === "Bear regime") && regimeInfo.trendStrength !== "none" && regimeInfo.trendStrength !== "weak";
  const regimeDir: 1 | -1 | 0 =
    TUNING.mrWithRegime && regimeTrending && taSystem?.setup !== "reversal_confirmed" ? (regimeInfo!.label === "Bull regime" ? 1 : -1) : 0;
  if (!isCrypto) {
    const hasOilGeo = oilGeoScore != null;
    weights.marketData = 0;
    weights.etf = 0;
    weights.liquidation = 0;
    if (hasOilGeo) {
      // OIL: headlines are a first-class driver; derivatives data does not exist for WTI on Strike
      weights.sentiment = 0.22;
      weights.derivatives = 0;
      weights.marketStructure = 0.12;
      weights.momentum = 0.09;
      weights.volume = 0.11;
      weights.htf = 0.08;
      weights.regime = TUNING.regimeWeight * 1.2;
      weights.bollinger = 0.08;
      weights.divergences = 0.08;
      weights.patterns = 0.06;
      weights.catalyst = 0.04;
    } else {
      // Stocks / indices / metals: no derivatives data exists on Strike, so give that weight to price action
      weights.sentiment = 0;
      weights.derivatives = 0;
      weights.marketStructure = 0.18;
      weights.momentum = 0.13;
      weights.volume = 0.13;
      weights.htf = 0.1;
      weights.regime = TUNING.regimeWeight * 1.2;
      weights.bollinger = 0.1;
      weights.divergences = 0.1;
      weights.patterns = 0.08;
      weights.catalyst = 0.02;
    }
  }

  if (isCrypto && oilGeoScore != null) {
    // BTC / ADA with a live catalyst engine: headlines matter more than the 3% default
    weights.sentiment = 0.14;
    weights.marketStructure = 0.11;
    weights.momentum = 0.1;
  }

  // Macro Event Intelligence (BTC / GOLD / OIL): weights are configured in lib/macro/service.ts and the
  // event weight is boosted right after a release, decaying back to base over four hours.
  if (macroScores) {
    weights.macro = macroScores.weights.macro;
    weights.event = macroScores.weights.event;
    weights.confirmation = macroScores.weights.confirmation;
  }
  // R2.2: with the HTF gate carrying the higher-timeframe information, the HTF vote is redundant with it.
  if (!TUNING.htfVote) weights.htf = 0;

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
  const mom = scoreMomentum(rsi, macdHist, stochRsi.k, stochRsi.d, rsi5m, prevRsi, macroBias, trendDir15m, regimeDir);
  const vol = scoreVolume(volData.ratio, volData.trend, volData.cvd, volData.available, volData.spikeRatio, volData.spikeLabel, volData.absorption);
  const deriv = scoreDerivatives(fundingRate, putCallRatio);
  const htf = scoreHTF(trend1h, rsi1h, trend4h, rsi4h, trendDaily, rsiDaily);
  const boll = scoreBollinger(
    price,
    bbUpper,
    bbLower,
    bbMiddle,
    bbWidth,
    squeeze,
    rsi,
    regimeDir
  );
  const divs = scoreDivergences(rsiDiv15m, rsiDiv1h, macdDiv, volDiv, regimeDir);
  const sent = scoreSentiment(fearGreed, newsSentimentScore, isCrypto, oilGeoScore);
  const mktData = scoreMarketData(btcDominance, isCrypto, symbol);
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
    takerBuySellRatio,
    change24h
  );

  // Elliott: scale weight by how confident the count is; a weak or absent count carries little weight.
  const ewScore = elliott ? clamp(Math.round(elliott.consensus.score), -100, 100) : 0;
  weights.elliott = elliott
    ? weights.elliott * (0.25 + 0.75 * clamp(elliott.consensus.confidence, 0, 100) / 100) * (elliott.consensus.agreement >= 0.66 ? 1 : 0.5)
    : 0;

  const taScore = taSystem ? taSystem.score : 0;
  if (!taSystem) weights.taSystem = 0;
  const regimeScore = regimeInfo ? regimeInfo.score : 0;
  if (!regimeInfo) weights.regime = 0;

  // A component whose data source returned nothing is NOT a neutral vote: drop its weight from the
  // denominator so the remaining evidence is not diluted toward 50 by feeds that are simply down.
  const derivativesAvailable = fundingRate != null || putCallRatio != null;
  const sentimentAvailable = fearGreed != null || newsSentimentScore != null || oilGeoScore != null;
  const marketDataAvailable = btcDominance != null;
  const etfAvailable = etfNet != null;
  const liquidationAvailable =
    longShortRatio != null ||
    longShortChange != null ||
    topTraderLongRatio != null ||
    (longLiqs24h != null && shortLiqs24h != null) ||
    oiChange != null ||
    takerBuySellRatio != null;
  if (!derivativesAvailable) weights.derivatives = 0;
  if (!sentimentAvailable) weights.sentiment = 0;
  if (!marketDataAvailable) weights.marketData = 0;
  if (!etfAvailable) weights.etf = 0;
  if (!liquidationAvailable) weights.liquidation = 0;

  // Normalize by the weights actually in play so non-crypto assets are not compressed toward 50.
  // Catalyst risk is direction-neutral (event proximity, closed markets), so it is NOT a vote in the
  // weighted score; it haircuts confidence below instead.
  const weightSum = (Object.values(weights).reduce((a, b) => a + b, 0) - weights.catalyst) || 1;
  const weightedScore =
    (ms.score * weights.marketStructure +
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
      liq.score * weights.liquidation +
      ewScore * weights.elliott +
      taScore * weights.taSystem +
      regimeScore * weights.regime +
      (macroScores?.macro ?? 0) * weights.macro +
      (macroScores?.event ?? 0) * weights.event +
      (macroScores?.confirmation ?? 0) * weights.confirmation) /
    weightSum;

  // ── TREND / TIMING / FLOW blocks (first cut, PR 15) ────────────────────────────────────────────────────────
  // Weighted mean of the existing factors grouped by what they measure, each -100..100. Reporting only: the
  // weighted score above still decides the call; the full collapse to three blocks is PR 26. The HTF vote keeps
  // its default weight inside the trend block even when htfVote is off, so the block reads the same either way.
  const wmean = (parts: [number, number][]): number => {
    let num = 0;
    let den = 0;
    for (const [v, w] of parts) {
      if (!(w > 0)) continue;
      num += v * w;
      den += w;
    }
    return den > 0 ? clamp(Math.round(num / den), -100, 100) : 0;
  };
  const blocksEarly = {
    trend: wmean([
      [ms.score, weights.marketStructure],
      [htf.score, TUNING.htfVote ? weights.htf : DEFAULT_WEIGHTS.htf],
      [regimeScore, weights.regime],
      [taSystem?.trendScore ?? 0, weights.taSystem],
    ]),
    timing: wmean([
      [mom.score, weights.momentum],
      [boll.score, weights.bollinger],
      [divs.score, weights.divergences],
      [pats.score, weights.patterns],
      [ewScore, weights.elliott],
      [taSystem?.exhaustionScore ?? 0, weights.taSystem],
    ]),
    flow: wmean([
      [vol.score, weights.volume],
      [deriv.score, weights.derivatives],
      [liq.score, weights.liquidation],
      [etfScore.score, weights.etf],
    ]),
  };

  const whipsawPenalty = oilGeoRegime === "whipsaw" ? -8 : 0;
  // Conviction is the MAGNITUDE of the evidence. A strongly bearish board is a high-confidence SHORT, not a
  // low-confidence LONG; the sign only picks the side below.
  const strength = Math.abs(weightedScore);
  const catalystHaircut = Math.round(Math.max(-100, Math.min(0, catalyst.score)) / 10); // 0 to -10
  let confidence = clamp(Math.round(50 + strength / 2 + whipsawPenalty + catalystHaircut), 0, 100);

  // Scheduled-release risk: a high/critical print inside 15 minutes caps conviction and is flagged explicitly.
  let preEventNote: string | null = null;
  if (preEventRisk) {
    confidence = Math.min(Math.round(confidence * 0.85), 69);
    preEventNote = `${preEventRisk.event.title} in ${preEventRisk.minutes}m — volatility risk, technical confidence reduced`;
  }

  const regime =
    adx > 25 ? "trending" : adx < 20 ? "ranging" : "transitional";

  const signalFactors: SignalFactor[] = [
    {
      category: FACTOR.MARKET_STRUCTURE,
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
      category: FACTOR.MOMENTUM,
      assessment:
        mom.score > 20 ? "Bullish" : mom.score > -20 ? "Neutral" : "Bearish",
      weight: Math.round(weights.momentum * 100),
    },
    {
      category: FACTOR.VOLUME,
      assessment:
        vol.score > 15 ? "Bullish" : vol.score > -15 ? "Neutral" : "Bearish",
      weight: Math.round(weights.volume * 100),
    },
    {
      category: FACTOR.DERIVATIVES,
      assessment:
        deriv.score > 15
          ? "Bullish"
          : deriv.score > -15
            ? "Neutral"
            : "Bearish",
      weight: Math.round(weights.derivatives * 100),
    },
    {
      category: FACTOR.HTF,
      assessment:
        htf.score > 15 ? "Bullish" : htf.score > -15 ? "Neutral" : "Bearish",
      weight: Math.round(weights.htf * 100),
    },
    {
      category: FACTOR.BOLLINGER,
      assessment:
        boll.score > 15
          ? "Bullish"
          : boll.score > -15
            ? "Neutral"
            : "Bearish",
      weight: Math.round(weights.bollinger * 100),
    },
    {
      category: FACTOR.DIVERGENCES,
      assessment:
        divs.score > 10
          ? "Bullish"
          : divs.score > -10
            ? "Neutral"
            : "Bearish",
      weight: Math.round(weights.divergences * 100),
    },
    {
      category: FACTOR.TREND_SYSTEM,
      assessment:
        taScore > 40 ? "Strong Bullish" : taScore > 12 ? "Bullish" : taScore > -12 ? "Neutral" : taScore > -40 ? "Bearish" : "Strong Bearish",
      weight: Math.round(weights.taSystem * 100),
    },
    {
      category: FACTOR.REGIME,
      assessment:
        regimeScore > 40 ? "Strong Bullish" : regimeScore > 12 ? "Bullish" : regimeScore > -12 ? "Neutral" : regimeScore > -40 ? "Bearish" : "Strong Bearish",
      weight: Math.round(weights.regime * 100),
    },
    {
      category: FACTOR.ELLIOTT,
      assessment:
        ewScore > 40 ? "Strong Bullish" : ewScore > 10 ? "Bullish" : ewScore > -10 ? "Neutral" : ewScore > -40 ? "Bearish" : "Strong Bearish",
      weight: Math.round(weights.elliott * 100),
    },
  ];

  if (isCrypto) {
    signalFactors.push(
      {
        category: FACTOR.SENTIMENT,
        assessment:
          sent.score > 10
            ? "Bullish"
            : sent.score > -10
              ? "Neutral"
              : "Bearish",
        weight: Math.round(weights.sentiment * 100),
      },
      {
        category: FACTOR.MARKET_DATA,
        assessment:
          mktData.score > 10
            ? "Bullish"
            : mktData.score > -10
              ? "Neutral"
              : "Bearish",
        weight: Math.round(weights.marketData * 100),
      },
      {
        category: FACTOR.ETF_FLOWS,
        assessment:
          etfScore.score > 10
            ? "Bullish"
            : etfScore.score > -10
              ? "Neutral"
              : "Bearish",
        weight: Math.round(weights.etf * 100),
      },
      {
        category: FACTOR.LIQUIDATION,
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

  if (oilGeoScore != null) {
    signalFactors.push({
      category: assetClass === "commodity" ? FACTOR.GEOPOLITICAL : FACTOR.CATALYSTS,
      assessment:
        sent.score >= 40
          ? "Strong Bullish"
          : sent.score > 10
            ? "Bullish"
            : sent.score > -10
              ? "Neutral"
              : sent.score > -40
                ? "Bearish"
                : "Strong Bearish",
      weight: Math.round(weights.sentiment * 100),
    });
  }

  if (macroScores) {
    const label = (v: number) => (v >= 40 ? "Strong Bullish" : v > 10 ? "Bullish" : v > -10 ? "Neutral" : v > -40 ? "Bearish" : "Strong Bearish");
    signalFactors.push(
      { category: FACTOR.MACRO, assessment: label(macroScores.macro), weight: Math.round(weights.macro * 100) },
      { category: FACTOR.EVENT, assessment: label(macroScores.event), weight: Math.round(weights.event * 100) },
      { category: FACTOR.MARKET_CONFIRMATION, assessment: label(macroScores.confirmation), weight: Math.round(weights.confirmation * 100) }
    );
  }

  signalFactors.push(
    {
      category: FACTOR.PATTERNS,
      assessment:
        pats.score > 10
          ? "Bullish"
          : pats.score > -10
            ? "Neutral"
            : "Bearish",
      weight: Math.round(weights.patterns * 100),
    },
    {
      category: FACTOR.CATALYST_RISK,
      assessment: catalyst.score < -15 ? "Elevated" : "Low",
      weight: Math.round(weights.catalyst * 100),
    }
  );

  // A directional call needs tradeable conviction AFTER event and catalyst haircuts; below the logging
  // threshold it is a lean, not a trade. Same bar for both sides.
  const isWait =
    confidence < TUNING.minPublishConfidence ||
    (squeeze === "volatility_compression" && adx < 20) ||
    (trend1h !== trend4h && adx < 20);

  let bias: "LONG" | "SHORT" | "WAIT";
  const gateNotes: string[] = [];
  // Non-gating event-window notes (pre/post window sizing), shown with the macro notes.
  const macroNotesEarly: string[] = [];
  if (isWait) {
    bias = "WAIT";
    if (confidence >= 55 && confidence < TUNING.minPublishConfidence) {
      gateNotes.push(`${weightedScore > 0 ? "Long" : "Short"} lean at ${confidence} confidence is below the ${TUNING.minPublishConfidence} publish threshold: watch, do not trade`);
    }
  } else if (weightedScore > 0) {
    if (TUNING.htfGateBoth && !(trend4h === "bull" || (trend4h === "mixed" && trend1h === "bull"))) {
      // R2.1 symmetric HTF gate: a long against higher timeframes that are not trending up is a WAIT, like the short rule.
      bias = "WAIT";
      gateNotes.push(`Long lean at ${confidence} confidence, but the higher timeframes are not trending up (4h ${trend4h}, 1h ${trend1h}): standing aside`);
    } else {
      bias = "LONG";
    }
  } else if (TUNING.shortNeedsHtfBear && !(trend4h === "bear" || (trend4h === "mixed" && trend1h === "bear"))) {
    // Shorts against a higher-timeframe uptrend lost money in testing; publish them as WAIT.
    bias = "WAIT";
    gateNotes.push(`Short lean at ${confidence} confidence, but the higher timeframes are not trending down (4h ${trend4h}, 1h ${trend1h}): standing aside`);
  } else if (
    TUNING.shortNeedsBearRegime &&
    regimeInfo &&
    !(regimeInfo.label === "Bear regime" || (taSystem?.setup === "reversal_confirmed" && taSystem.direction === "bearish"))
  ) {
    // Engine audit #4: shorts outside a Bear regime (Transition -0.41R, Mixed -0.09R over 60d) need a confirmed
    // bearish reversal structure. Tagged as a regime block so the shadow log classes it as regime_blocked.
    bias = "WAIT";
    regimeInfo.gate = "blocked_short";
    gateNotes.push(`Short lean at ${confidence} confidence in a ${regimeInfo.label.toLowerCase()} with no confirmed bearish reversal: shorts need a bear regime, standing aside`);
  } else {
    bias = "SHORT";
  }

  // Counter-regime gate. Only evaluated inside a directional call: when isWait already fired the low-ADX /
  // squeeze logic owns the WAIT and the regime must not add a second penalty for the same condition.
  let counterTrend = false;
  if (regimeInfo && TUNING.regimeGate !== "off" && (bias === "LONG" || bias === "SHORT")) {
    const counter = (bias === "LONG" && regimeInfo.label === "Bear regime") || (bias === "SHORT" && regimeInfo.label === "Bull regime");
    if (counter) {
      const against = bias === "LONG" ? "bear" : "bull";
      const allowed = TUNING.regimeGate === "soft" && (taSystem?.setup === "reversal_confirmed" || confidence >= TUNING.minPublishConfidence + 8);
      if (allowed) {
        regimeInfo.gate = "counter_trend";
        counterTrend = true;
        confidence = Math.round(confidence * 0.85);
        gateNotes.push(`Counter-trend: fighting the ${against} regime (wrong side of the cloud and 200MA on 4h/1d), reduced size, targets capped`);
      } else {
        regimeInfo.gate = bias === "LONG" ? "blocked_long" : "blocked_short";
        gateNotes.push(`${bias === "LONG" ? "Long" : "Short"} lean fighting a ${against} regime (wrong side of the cloud and 200MA on 4h/1d) with no confirmed reversal structure: standing aside`);
        bias = "WAIT";
      }
    }
  }

  // Geopolitical regime: gap risk sizing + headline override for OIL
  let geoOverride: string | null = null;
  let sizeMultiplier = 1;
  let stopMult = 1;
  if (oilGeoScore != null) {
    if (oilGeoRegime === "whipsaw" || oilGeoRegime === "extreme") {
      stopMult = 1.6;
      sizeMultiplier = 0.5;
    } else if (oilGeoRegime === "elevated") {
      stopMult = 1.3;
      sizeMultiplier = 0.75;
    }

    const htfOpposesLong = trend4h === "bear" && trendDaily === "bear";
    const htfOpposesShort = trend4h === "bull" && trendDaily === "bull";

    if (oilGeoRegime === "whipsaw") {
      if (Math.abs(oilGeoScore) < 10 && bias !== "WAIT") {
        bias = "WAIT";
        geoOverride = "Headline whipsaw: two strong opposing catalyst narratives offset each other — standing aside";
      } else {
        geoOverride = "Headline whipsaw: opposing catalysts active — half size, 1.6x ATR stops";
      }
    } else if (Math.abs(oilGeoScore) >= 50) {
      if (oilGeoScore > 0 && bias !== "LONG" && !htfOpposesLong) {
        bias = "LONG";
        confidence = Math.max(confidence, 55);
        geoOverride = `Catalyst override: headlines strongly bullish (+${oilGeoScore}) — bias forced LONG`;
      } else if (oilGeoScore < 0 && bias !== "SHORT" && !htfOpposesShort) {
        bias = "SHORT";
        confidence = Math.max(confidence, 55);
        geoOverride = `Catalyst override: headlines strongly bearish (${oilGeoScore}) — bias forced SHORT`;
      } else if ((oilGeoScore > 0 && bias === "SHORT") || (oilGeoScore < 0 && bias === "LONG")) {
        bias = "WAIT";
        geoOverride = "Higher timeframes oppose strong headline flow — standing aside until they agree";
      }
    }
  }

  if (counterTrend) sizeMultiplier = Math.min(sizeMultiplier, 0.5);

  // ── Universal event gate (Phase 3.2) ──────────────────────────────────────
  // Size parts are reported as the engine applies them: the headline regime and counter-trend haircuts combine by
  // min (as before), the event window multiplies on top. total === call.sizeMultiplier.
  const sizingParts: { label: string; mult: number }[] = [];
  if (oilGeoScore != null && oilGeoRegime && oilGeoRegime !== "calm") sizingParts.push({ label: `headline ${oilGeoRegime}`, mult: oilGeoRegime === "elevated" ? 0.75 : 0.5 });
  if (counterTrend) sizingParts.push({ label: "counter-trend", mult: 0.5 });
  if (eventWindow && eventWindow.state !== "none") {
    if (eventWindow.gate) {
      if (bias !== "WAIT") gateNotes.unshift(`Event gate: ${eventWindow.note ?? "release window"}`);
      else if (eventWindow.note) gateNotes.push(`Event gate: ${eventWindow.note}`);
      bias = "WAIT";
      sizeMultiplier = 0;
      sizingParts.push({ label: eventWindow.state === "blackout" ? "event blackout" : "release in progress", mult: 0 });
    } else {
      if (eventWindow.sizeMult < 1) {
        sizeMultiplier = Math.round(sizeMultiplier * eventWindow.sizeMult * 1000) / 1000;
        sizingParts.push({ label: eventWindow.state === "pre" ? "pre-release window" : "post-release window", mult: eventWindow.sizeMult });
      }
      if (eventWindow.note) macroNotesEarly.push(eventWindow.note);
    }
    if (eventWindow.stopMult > 1) stopMult = Math.max(stopMult, eventWindow.stopMult);
  }
  // ── Session rules (engine audit #9, research #12), behind TUNING.sessionRules ────────────────────────────
  // Weekend (UTC) crypto: half size (60d backtest: +0.02R n=128 vs +0.20R on weekdays). Non-crypto weekend: the
  // underlying market is closed, so WAIT. 21-24 UTC: WAIT unless the trend and flow blocks both agree with the call
  // (-0.10R n=61 in that window).
  const dUtc = new Date(nowMs);
  const weekendUtc = dUtc.getUTCDay() === 0 || dUtc.getUTCDay() === 6;
  const hourUtc = dUtc.getUTCHours();
  if (TUNING.sessionRules) {
    if (weekendUtc && !isCrypto) {
      if (bias !== "WAIT") gateNotes.unshift("Market closed (weekend): no new positions until the cash session reopens");
      bias = "WAIT";
    } else if (weekendUtc && bias !== "WAIT") {
      sizeMultiplier = Math.round(sizeMultiplier * 0.5 * 1000) / 1000;
      sizingParts.push({ label: "weekend", mult: 0.5 });
    }
    if (bias !== "WAIT" && hourUtc >= 21) {
      const side = bias === "LONG" ? 1 : -1;
      const trendAgrees = Math.sign(blocksEarly.trend) === side && Math.abs(blocksEarly.trend) >= 20;
      const flowAgrees = Math.sign(blocksEarly.flow) === side && Math.abs(blocksEarly.flow) >= 20;
      if (!(trendAgrees && flowAgrees)) {
        gateNotes.unshift(`Late session (${hourUtc}:00 UTC): trend and flow do not both back the ${bias.toLowerCase()}, standing aside until the Asia open`);
        bias = "WAIT";
      }
    }
  }
  const sizing = { base: 1, parts: sizingParts, total: sizeMultiplier };

  // Macro regime bonus (crypto only): applied BEFORE levels are built so a lean that drops below tradeable
  // conviction becomes a real WAIT, with the provisional WAIT plan instead of a stale long/short plan.
  const macroNotes: string[] = [...macroNotesEarly];
  const macroBonus = getMacroBonus(macroState, bias, isCrypto);
  if (macroBonus !== 0) {
    const side = bias.toLowerCase();
    confidence = clamp(confidence + macroBonus, 0, 100);
    macroNotes.push(`Macro regime ${macroState!.bias.replace(/_/g, " ")} ${macroBonus > 0 ? "supports" : "opposes"} the ${side} (${macroBonus > 0 ? "+" : ""}${macroBonus})`);
    if (confidence < TUNING.minPublishConfidence && bias !== "WAIT") {
      macroNotes.unshift(`Stand aside: the ${side} lean is fighting the macro regime and drops below tradeable conviction`);
      bias = "WAIT";
    }
  }

  // A+ requires several factors AGREEING with the call; factors voting the other way are not conviction.
  const biasSign = bias === "LONG" ? 1 : bias === "SHORT" ? -1 : weightedScore >= 0 ? 1 : -1;
  const strongCategories = signalFactors.filter((f) => {
    const dir = ASSESSMENT_DIR[f.assessment] ?? 0;
    return dir !== 0 && Math.sign(dir) === biasSign;
  }).length;

  const grade = gradeFor(confidence, strongCategories);

  const ta = tradeATR * stopMult;
  // Stop floor as % of price so low-vol indices are not stopped by noise and thin tokens get room
  const STOP_FLOOR_PCT: Record<string, number> = { index: 0.0035, commodity: 0.005, stock: 0.005, crypto: 0.004, thin: 0.015 };
  const minDist = Math.max(ta * TUNING.minStopAtr, price * (STOP_FLOOR_PCT[assetClass] ?? 0.005) * TUNING.stopFloorScale);
  const buf = TUNING.stopBufferAtr * ta;
  const minStop = TUNING.minStopAtr * ta;

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
  // What the stop hides behind (STOP tile sub-line and call.invalidation.kind).
  let stopAnchor: string | null = null;
  let stopFromLevel = false;
  const floorLabel = () => (ta * TUNING.minStopAtr >= price * (STOP_FLOOR_PCT[assetClass] ?? 0.005) * TUNING.stopFloorScale ? `ATR floor (${TUNING.minStopAtr} ATR)` : `price floor (${(((STOP_FLOOR_PCT[assetClass] ?? 0.005) * TUNING.stopFloorScale) * 100).toFixed(2)}%)`);

  if (bias === "LONG") {
    entry =
      supports[0] && Math.abs(price - supports[0]) / ta < 2
        ? supports[0]
        : price;
    secondaryEntry =
      secondSupport !== entry ? round(secondSupport, dec) : null;
    stopLoss = nearestSupport - buf;
    stopFromLevel = supports[0] != null;
    stopAnchor = stopFromLevel ? `swing low ${round(nearestSupport, dec).toLocaleString()} + ${TUNING.stopBufferAtr} ATR` : `${1.5} ATR below price + ${TUNING.stopBufferAtr} ATR`;
    if (Math.abs(entry - stopLoss) < minDist) {
      stopLoss = entry - Math.max(minStop, minDist);
      stopFromLevel = false;
      stopAnchor = floorLabel();
    }

    if (secondaryEntry != null) {
      const thirdSupport = supports[2] ?? secondaryEntry - 1.5 * ta;
      secondaryStopLoss = thirdSupport - buf;
      if (secondaryStopLoss >= secondaryEntry) secondaryStopLoss = secondaryEntry - minStop;
      if (Math.abs(secondaryEntry - secondaryStopLoss) < minDist) secondaryStopLoss = secondaryEntry - Math.max(minStop, minDist);
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
    stopLoss = nearestResistance + buf;
    stopFromLevel = resistances[0] != null;
    stopAnchor = stopFromLevel ? `swing high ${round(nearestResistance, dec).toLocaleString()} + ${TUNING.stopBufferAtr} ATR` : `${1.5} ATR above price + ${TUNING.stopBufferAtr} ATR`;
    if (Math.abs(stopLoss - entry) < minDist) {
      stopLoss = entry + Math.max(minStop, minDist);
      stopFromLevel = false;
      stopAnchor = floorLabel();
    }

    if (secondaryEntry != null) {
      const thirdResistance = resistances[2] ?? secondaryEntry + 1.5 * ta;
      secondaryStopLoss = thirdResistance + buf;
      if (secondaryStopLoss <= secondaryEntry) secondaryStopLoss = secondaryEntry + minStop;
      if (Math.abs(secondaryStopLoss - secondaryEntry) < minDist) secondaryStopLoss = secondaryEntry + Math.max(minStop, minDist);
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
    // WAIT: shape the provisional plan by the lean so the bear case is not drawn as a long
    const lean = weightedScore >= 0 ? 1 : -1;
    entry = price;
    secondaryEntry = null;
    secondaryStopLoss = null;
    stopLoss = price - 1.5 * ta * lean;
    tp1 = price + 1.5 * ta * lean;
    tp2 = price + 2.5 * ta * lean;
    tp3 = price + 4 * ta * lean;
    extendedTarget = null;
  }

  if (bias === "LONG") {
    if (stopLoss >= entry) {
      stopLoss = entry - ta;
      stopFromLevel = false;
      stopAnchor = "1 ATR below entry";
    }
    if (secondaryStopLoss != null && secondaryEntry != null && secondaryStopLoss >= secondaryEntry)
      secondaryStopLoss = secondaryEntry - ta;
    if (tp1 <= entry) tp1 = entry + 1.5 * ta;
    if (tp2 <= tp1) tp2 = tp1 + ta;
    if (tp3 <= tp2) tp3 = tp2 + ta;
    if (extendedTarget != null && extendedTarget <= tp3)
      extendedTarget = round(tp3 + 1.5 * ta, dec);
  } else if (bias === "SHORT") {
    if (stopLoss <= entry) {
      stopLoss = entry + ta;
      stopFromLevel = false;
      stopAnchor = "1 ATR above entry";
    }
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
  // R4.5 minimum reward-to-risk at TP2: the ladder sometimes builds TP2 under 1R when levels cluster.
  if (bias !== "WAIT" && TUNING.minRr > 0 && riskReward < TUNING.minRr) {
    gateNotes.unshift(`Reward-to-risk ${riskReward.toFixed(2)} at TP2 is below the ${TUNING.minRr} minimum: plan shown, no trade`);
    bias = "WAIT";
  }

  const ewNotes = elliott && elliott.consensus.direction && Math.abs(ewScore) >= 10 ? elliott.consensus.notes.slice(0, 2).map((n) => `Elliott ${n}`) : [];
  const taNotes = taSystem ? taSystem.notes.slice(0, 1) : [];
  const regimeNotes = regimeInfo ? regimeInfo.notes.slice(0, 1) : [];
  const reasoning = [
    ...gateNotes, ...macroNotes,
    ...ms.notes,
    ...mom.notes,
    ...regimeNotes,
    ...taNotes,
    ...ewNotes,
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

  if (taSystem?.setup === "reversal_confirmed" && taSystem.direction === "bearish") bearCase.push(`Reversal short confirmed (${taSystem.confirmedBy[0]})`);
  if (taSystem?.setup === "reversal_confirmed" && taSystem.direction === "bullish") bullCase.push(`Reversal long confirmed (${taSystem.confirmedBy[0]})`);
  if (taSystem?.setup === "continuation" && taSystem.direction === "bearish") bearCase.push("Trend system: bearish continuation (structure, Ichimoku, Chandelier agree)");
  if (taSystem?.setup === "continuation" && taSystem.direction === "bullish") bullCase.push("Trend system: bullish continuation (structure, Ichimoku, Chandelier agree)");
  if (regimeInfo?.label === "Bull regime") bullCase.push("Bull regime: price above the Ichimoku cloud and 200MA on 4h and 1d");
  if (regimeInfo?.label === "Bear regime") bearCase.push("Bear regime: price below the Ichimoku cloud and 200MA on 4h and 1d");
  for (const tf of ["4h", "1d"] as const) {
    const fc = regimeInfo?.perTF[tf]?.freshCross;
    if (fc === "bullish") bullCase.push(`Fresh 200MA reclaim on ${tf}`);
    if (fc === "bearish") bearCase.push(`Fresh 200MA loss on ${tf}`);
  }
  if (ewScore >= 20) bullCase.push("Elliott count: corrective wave completing — impulse up favoured");
  if (ewScore <= -20) bearCase.push("Elliott count: terminal wave (5 or B) — reversal down favoured");
  if (ms.score > 0)
    bullCase.push("Bullish market structure with EMA alignment");
  if (mom.score > 0)
    bullCase.push("Positive momentum with RSI/MACD confirmation");
  if (vol.score > 0) bullCase.push("Strong buying volume and positive CVD");
  if (htf.score > 0) bullCase.push("Higher timeframes confirm bullish bias");
  if (sent.score > 0)
    bullCase.push(
      oilGeoScore != null
        ? assetClass === "commodity"
          ? "Geopolitical supply risk bid — headlines net bullish for crude"
          : "Catalyst headlines net bullish (flows, policy, adoption)"
        : "Contrarian opportunity — fear in market"
    );
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
  if (sent.score < 0)
    bearCase.push(
      oilGeoScore != null
        ? assetClass === "commodity"
          ? "Supply relief headlines (reserve releases / de-escalation) weigh on crude"
          : "Catalyst headlines net bearish (outflows, enforcement, macro)"
        : "Extreme greed — market overheated"
    );
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
      `Break above $${round(nearestResistance, dec).toLocaleString()} with volume above 20 EMA`
    );
    confirms.push(
      oilGeoScore != null
        ? assetClass === "commodity"
          ? "Fresh escalation headline (Hormuz, tankers, Aramco) or reserve-release delay"
          : "Fresh bullish catalyst (ETF inflows, regulatory win, dovish macro) hits the tape"
        : "Funding rate stays neutral or negative"
    );
    if (trend1h !== "bull") confirms.push("1H trend flips bullish");
    invalidates.push(
      `Loss of $${round(nearestSupport, dec).toLocaleString()} support`
    );
    invalidates.push("MACD crossover to bearish on 1H");
    if (volData.spikeLabel === "DRY") invalidates.push("Volume dry — breakout lacks conviction");
    else if (oilGeoScore != null && assetClass === "commodity") invalidates.push("Ceasefire / Hormuz reopening headline strips the risk premium");
    else if (oilGeoScore != null) invalidates.push("Bearish catalyst headline (outflows, enforcement, hawkish macro) lands");
    else invalidates.push(`Sudden spike in funding rate above ${(FUNDING.HIGH * 100).toFixed(2)}%`);
  } else {
    confirms.push(
      `Break below $${round(nearestSupport, dec).toLocaleString()} with volume above 20 EMA`
    );
    confirms.push(
      oilGeoScore != null
        ? assetClass === "commodity"
          ? "Reserve release volumes confirmed landing or de-escalation talks progress"
          : "Fresh bearish catalyst (ETF outflows, enforcement action, hawkish macro) hits the tape"
        : "Funding rate remains elevated"
    );
    if (trend1h !== "bear") confirms.push("1H trend flips bearish");
    invalidates.push(
      `Reclaim of $${round(nearestResistance, dec).toLocaleString()} resistance`
    );
    invalidates.push("MACD crossover to bullish on 1H");
    if (volData.spikeLabel === "DRY") invalidates.push("Volume dry — breakdown lacks conviction");
    else if (oilGeoScore != null && assetClass === "commodity") invalidates.push("New strike on tankers or Gulf infrastructure re-prices supply risk");
    else if (oilGeoScore != null) invalidates.push("Bullish catalyst headline (inflows, approval, rate cut) lands");
    else invalidates.push("Fear & Greed drops below 25 (capitulation)");
  }

  // ── Wave 2 call fields (design F1.1): mode, dominant TF / horizon, expected hold, invalidation, flips ────
  // Strategy family by regime and ADX: trend continuation in a trending Bull/Bear regime, reversion toward the
  // regime otherwise; standby when the call is WAIT.
  const mode: "trend" | "reversion" | "standby" = bias === "WAIT" ? "standby" : regimeTrending ? "trend" : "reversion";
  const modeReason = !regimeInfo
    ? "regime unavailable"
    : regimeTrending
      ? `${regimeInfo.label} with ${regimeInfo.trendStrength} trend strength (ADX >= 20): continuation setups only`
      : `${regimeInfo.label}, trend strength ${regimeInfo.trendStrength}: mean reversion toward the regime at levels`;
  // Dominant setup timeframe: the trend-system component with the largest |score| (R4.2). 1h is not part of the
  // trend system, so it is reached only when 15m and 4h disagree in sign and the 1h EMA trend sides with the 4h.
  let dominantTf: HoldTF = "15m";
  if (taSystem) {
    let best = -1;
    for (const tf of ["15m", "4h", "1d"] as const) {
      const v = Math.abs(taSystem.perTF[tf]?.score ?? 0);
      if (v > best) {
        best = v;
        dominantTf = tf;
      }
    }
    const s15 = taSystem.perTF["15m"]?.score ?? 0;
    const s4 = taSystem.perTF["4h"]?.score ?? 0;
    if (dominantTf === "15m" && s4 !== 0 && Math.sign(s15) !== Math.sign(s4) && trend1h !== "mixed" && (trend1h === "bull") === s4 > 0) dominantTf = "1h";
  }
  const horizonMin = TUNING.horizonByTf ? HORIZON_MIN_BY_TF[dominantTf] : DEFAULT_HORIZON_MIN;
  const expectedHold = bias === "WAIT" ? null : expectedHoldFor(symbol, bias, regimeInfo?.label ?? null, dominantTf, nowMs);

  const invalidation: { level: number; kind: "stop" | "regime" | "structure"; reason: string } | null =
    bias === "WAIT"
      ? null
      : counterTrend && regimeInfo
        ? { level: stopLoss, kind: "regime", reason: `Stop ${stopLoss.toLocaleString()} (${stopAnchor ?? "stop"}); counter-trend against the ${regimeInfo.label.toLowerCase()}, a 4h close back ${bias === "LONG" ? "below" : "above"} the cloud ends the reversal case` }
        : stopFromLevel
          ? { level: stopLoss, kind: "structure", reason: `${bias === "LONG" ? "Loss" : "Reclaim"} of ${stopLoss.toLocaleString()}: ${stopAnchor ?? "swing level"} breaks the structure the entry leans on` }
          : { level: stopLoss, kind: "stop", reason: `Stop ${stopLoss.toLocaleString()} (${stopAnchor ?? "floor"}): no closer swing level, so this is a volatility stop` };

  // Flip distances (engine audit 5.2): per weighted factor, the score change that moves the call across the publish
  // threshold (to WAIT) or, for a WAIT lean, up to it. Distance in factor score points; the two smallest are reported.
  const publishStrength = Math.max(0, 2 * (TUNING.minPublishConfidence - 50 - whipsawPenalty - catalystHaircut));
  const FLIP_HINT: Record<string, string> = {
    marketStructure: "EMA stack or Supertrend flips",
    momentum: "RSI / MACD histogram turn",
    volume: "CVD sign changes",
    htf: "1h/4h trend flips",
    bollinger: "band touch",
    divergences: "divergence prints",
    taSystem: "trend system turns",
    regime: "cloud / 200MA / ADX",
    elliott: "wave count changes",
    patterns: "candle pattern",
    liquidation: "positioning shifts",
    derivatives: "funding flips",
    sentiment: "headline flow turns",
    marketData: "BTC dominance",
    etf: "ETF flows",
    macro: "macro regime",
    event: "release surprise",
    confirmation: "cross-asset confirmation",
  };
  const FLIP_LABEL: Record<string, string> = { marketStructure: "Market structure", momentum: "Momentum", volume: "Volume", htf: "Higher timeframes", bollinger: "Bollinger", divergences: "Divergences", taSystem: "Trend system", regime: "Regime", elliott: "Elliott", patterns: "Patterns", liquidation: "Positioning", derivatives: "Derivatives", sentiment: "Sentiment", marketData: "Market data", etf: "ETF flows", macro: "Macro", event: "Event", confirmation: "Confirmation" };
  const flipRows: { text: string; factor: string; distance: number; direction: "to_long" | "to_short" | "to_wait" }[] = [];
  const factorScores: Record<string, number> = { marketStructure: ms.score, momentum: mom.score, volume: vol.score, derivatives: deriv.score, htf: htf.score, bollinger: boll.score, divergences: divs.score, sentiment: sent.score, marketData: mktData.score, patterns: pats.score, etf: etfScore.score, liquidation: liq.score, elliott: ewScore, taSystem: taScore, regime: regimeScore, macro: macroScores?.macro ?? 0, event: macroScores?.event ?? 0, confirmation: macroScores?.confirmation ?? 0 };
  const leanSign = weightedScore >= 0 ? 1 : -1;
  const gatedWait = bias === "WAIT" && Math.abs(weightedScore) >= publishStrength && gateNotes.length > 0;
  if (gatedWait) {
    flipRows.push({ text: gateNotes[0].replace(/[:,] standing aside.*$/, "").replace(/: plan shown, no trade$/, ""), factor: "gate", distance: 0, direction: leanSign > 0 ? "to_long" : "to_short" });
  } else {
    const needed = bias === "WAIT" ? publishStrength - Math.abs(weightedScore) : Math.abs(weightedScore) - publishStrength;
    // Direction the factor has to move: toward the lean for a WAIT, against the call for a trade.
    const moveSign = bias === "WAIT" ? leanSign : -leanSign;
    for (const [name, w] of Object.entries(weights) as [string, number][]) {
      if (!(w > 0) || name === "catalyst") continue;
      const sc = factorScores[name] ?? 0;
      const movable = moveSign > 0 ? 100 - sc : 100 + sc;
      const pts = Math.ceil((Math.max(0, needed) * weightSum) / w);
      if (pts <= 0 || pts > movable) continue;
      flipRows.push({
        text: `${FLIP_LABEL[name] ?? name} ${moveSign > 0 ? "rises" : "falls"} ${pts} pts (${FLIP_HINT[name] ?? "score moves"})`,
        factor: name,
        distance: pts,
        direction: bias === "WAIT" ? (leanSign > 0 ? "to_long" : "to_short") : "to_wait",
      });
    }
    flipRows.sort((a, b) => a.distance - b.distance);
  }
  const flips = flipRows.slice(0, 2);

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
    // Wave 2 (PR 15) call fields; see CONTRACT.md "call.* from be-strategy".
    mode,
    modeReason,
    dominantTf,
    horizonMin,
    expectedHold: expectedHold ? { medianMin: expectedHold.medianMin, p25Min: expectedHold.p25Min, p75Min: expectedHold.p75Min, n: expectedHold.n, tf: expectedHold.tf, source: expectedHold.source, bucket: expectedHold.bucket } : null,
    invalidation,
    flips,
    stopAnchor: bias === "WAIT" ? null : stopAnchor,
    blocks: blocksEarly,
    setup: taSystem?.setup ?? "none",
    reasoning,
    bullCase: bullCase.slice(0, 3),
    bearCase: bearCase.slice(0, 3),
    confirms: confirms.slice(0, 3),
    invalidates: invalidates.slice(0, 3),
    catalystRisk: [catalyst.note, preEventNote].filter(Boolean).join("; ") || null,
    liqSqueezeRisk: liq.squeezeRisk,
    signalFactors,
    geoOverride,
    sizeMultiplier,
    stopMultiplier: stopMult,
    // Phase 3.2: event-window state for the verdict bar; null when no relevant release is near.
    eventWindow: eventWindow && eventWindow.state !== "none"
      ? { state: eventWindow.state, event: eventWindow.event, minutesLeft: eventWindow.minutesLeft, minutesSince: eventWindow.minutesSince, sizeMult: eventWindow.sizeMult, stopMult: eventWindow.stopMult, firstMoveGate: eventWindow.firstMoveGate, firstMovePct: eventWindow.firstMovePct, note: eventWindow.note }
      : null,
    sizing,
    strongCategories,
    weightedScore: Math.round(weightedScore * 10) / 10,
    // Raw component votes and the weights actually in play (0 = feed down), logged with every call so the
    // per-component reliability table can be built from the record. Pass-through only; nothing reads it here.
    components: {
      marketStructure: { score: ms.score, weight: weights.marketStructure },
      momentum: { score: mom.score, weight: weights.momentum },
      volume: { score: vol.score, weight: weights.volume },
      derivatives: { score: deriv.score, weight: weights.derivatives },
      htf: { score: htf.score, weight: weights.htf },
      bollinger: { score: boll.score, weight: weights.bollinger },
      divergences: { score: divs.score, weight: weights.divergences },
      sentiment: { score: sent.score, weight: weights.sentiment },
      marketData: { score: mktData.score, weight: weights.marketData },
      patterns: { score: pats.score, weight: weights.patterns },
      etf: { score: etfScore.score, weight: weights.etf },
      liquidation: { score: liq.score, weight: weights.liquidation },
      elliott: { score: ewScore, weight: weights.elliott },
      taSystem: { score: taScore, weight: weights.taSystem },
      regime: { score: regimeScore, weight: weights.regime },
      macro: { score: macroScores?.macro ?? 0, weight: weights.macro },
      event: { score: macroScores?.event ?? 0, weight: weights.event },
      confirmation: { score: macroScores?.confirmation ?? 0, weight: weights.confirmation },
    } as Record<string, { score: number; weight: number }>,
    gateNotes,
    macroBonus,
    regimeLabel: regimeInfo?.label ?? null,
    regimeScore: regimeInfo?.score ?? null,
    regimeGate: regimeInfo?.gate ?? "none",
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


// ── Candle analysis (pure) ───────────────────────────────────────────────────
// Everything derivable from candles alone. Shared by the live engine and scoreFromCandles() so a backtest
// runs the exact code path the site runs.
export function analyzeCandles(p: {
  dec: number;
  candles15m: Candle[];
  candles1h: Candle[];
  candles4h: Candle[];
  candlesDaily: Candle[];
  candles5m: Candle[];
  currentPrice: number;
  strikeFunding: number | null;
}) {
  const { dec, candles15m, candles1h, candles4h, candlesDaily, candles5m, currentPrice, strikeFunding } = p;
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

  return { closes15m, rsiArr, stochRsi, ema9Arr, ema21Arr, ema50Arr, ema200Arr, sma50Val, sma200Val, macdData, adxArr, atrArr, bbData, supertrendDir, fibLevels, fibExtension, rsi, ema9Val, ema21Val, ema50Val, ema200Val, macdVal, macdSig, macdHist, adxVal, atrVal, bbUpper, bbMiddle, bbLower, bbWidths, bbWidth, volData, closes5m, rsi5mArr, rsi5m, closes1h, closes4h, closesDaily, rsi1hArr, rsi4hArr, rsiDailyArr, trend1h, trend4h, trendDaily, rsi1h, rsi4h, rsiDaily, levels, atr1hArr, atr1h, tradeATR, rsiDiv15m, rsiDiv1h, macdDiv, volDiv, candlestickPattern, squeeze, tfLevels, last96, high24h, low24h, open24h, change24h };
}

// ── Main handler ─────────────────────────────────────────────────────────────

/**
 * Full engine run for one symbol: market data + external feeds -> scored call -> API response body.
 * `log` (default true) appends a non-WAIT call with confidence >= 55 to the signal history.
 */
export async function computeSignal(symbolIn: string, opts: { log?: boolean } = {}): Promise<EngineResult> {
  const symbol = symbolIn.toUpperCase();
  const shouldLog = opts.log ?? true;

  const config = SYMBOL_MAP[symbol];
  if (!config) {
    return { status: 400, body: { error: "Unknown symbol", supported: Object.keys(SYMBOL_MAP) } };
  }

  const dec = config.decimals;
  const isBTC = symbol === "BTC";
  const isCrypto = config.isCrypto;

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { status: 200, body: cached.data, cached: true };
  }

  const STRIKE = "https://api.strikefinance.org/price";
  const strikeSymbol = config.strike;

  // Build fetch list dynamically based on asset
  const fetches: Promise<unknown>[] = [
    // 0: 15m klines
    fetchJSON(
      `${STRIKE}/v2/klines?symbol=${strikeSymbol}&interval=15m&limit=400&priceType=last`
    ),
    // 1: 1h klines
    fetchJSON(
      `${STRIKE}/v2/klines?symbol=${strikeSymbol}&interval=1h&limit=100&priceType=last`
    ),
    // 2: 4h klines
    fetchJSON(
      `${STRIKE}/v2/klines?symbol=${strikeSymbol}&interval=4h&limit=400&priceType=last`
    ),
    // 3: daily klines
    fetchJSON(
      `${STRIKE}/v2/klines?symbol=${strikeSymbol}&interval=1d&limit=400&priceType=last`
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
    // 12: Order flow: OKX liquidation tape + full order book (crypto with an OKX swap). Replaces Coinglass,
    // which needs a paid key and had returned null for months.
    isCrypto ? fetchOrderFlowRaw(config.okx) : Promise.resolve(null),
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
    // 20: Catalyst headline engine (OIL, BTC, GOLD, ADA)
    isCatalystAsset(symbol)
      ? getCatalystNews(symbol).catch(() => null)
      : Promise.resolve(null),
  ];

  const results = await Promise.allSettled(fetches);

  const getResult = (i: number) =>
    results[i].status === "fulfilled"
      ? (results[i] as PromiseFulfilledResult<unknown>).value
      : null;

  // Parse klines
  // Closed-candle discipline: the forming bar is dropped from every timeframe before any indicator runs so
  // calls do not repaint intrabar. The live bar only feeds the displayed "last" price and the chart.
  const nowMs = Date.now();
  const raw15m = parseKlines(getResult(0));
  const candles15m = closedCandles(raw15m, TF_MS["15m"], nowMs);
  const candles1h = closedCandles(parseKlines(getResult(1)), TF_MS["1h"], nowMs);
  const candles4h = closedCandles(parseKlines(getResult(2)), TF_MS["4h"], nowMs);
  const candlesDaily = closedCandles(parseKlines(getResult(3)), TF_MS["1d"], nowMs);
  const candles5m = closedCandles(parseKlines(getResult(5)), TF_MS["5m"], nowMs);

  // Parse mark price
  const markData = getResult(4) as Record<string, string> | null;
  const markPrice = markData ? parseFloat(markData.p) : null;
  // Strike funds HOURLY (markPrice.T is the next top of the hour; r is ~8x smaller than OKX's 8h rate for the
  // same book). FUNDING thresholds are per 8h, so scale the hourly rate up before any comparison.
  const strikeFundingRaw = markData ? parseFloat(markData.r) : null;
  const strikeFunding = strikeFundingRaw != null && Number.isFinite(strikeFundingRaw) ? strikeFundingRaw * STRIKE_FUNDING_INTERVALS_PER_8H : null;

  const lastCandle = raw15m[raw15m.length - 1];
  const currentPrice = markPrice ?? lastCandle?.close ?? 0;

  // Never serve (or cache) a call built on missing data: zeros dressed up as a signal are worse than an error.
  if (candles15m.length < 50 || !(currentPrice > 0)) {
    return { status: 503, body: { error: "market data unavailable", symbol, candles: candles15m.length } };
  }

  const A = analyzeCandles({ dec, candles15m, candles1h, candles4h, candlesDaily, candles5m, currentPrice, strikeFunding });
  const { closes15m, rsiArr, stochRsi, ema9Arr, ema21Arr, ema50Arr, ema200Arr, sma50Val, sma200Val, macdData, adxArr, atrArr, bbData, supertrendDir, fibLevels, fibExtension, rsi, ema9Val, ema21Val, ema50Val, ema200Val, macdVal, macdSig, macdHist, adxVal, atrVal, bbUpper, bbMiddle, bbLower, bbWidths, bbWidth, volData, closes5m, rsi5mArr, rsi5m, closes1h, closes4h, closesDaily, rsi1hArr, rsi4hArr, rsiDailyArr, trend1h, trend4h, trendDaily, rsi1h, rsi4h, rsiDaily, levels, atr1hArr, atr1h, tradeATR, rsiDiv15m, rsiDiv1h, macdDiv, volDiv, candlestickPattern, squeeze, tfLevels, last96, high24h, low24h, open24h, change24h } = A;

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

  // Liquidations + order book walls, summarized against the mark price
  const orderFlow = summarizeOrderFlow(getResult(12) as OrderFlowRaw | null, markPrice ?? 0);
  const liqSummary: LiquidationSummary | null = orderFlow.liquidations;
  const orderBook: OrderBookSummary | null = orderFlow.orderBook;
  // Scoring keeps the long/short split it was designed around; the window is whatever OKX returned (<= 24h).
  const liquidations = liqSummary
    ? { longLiqs24h: liqSummary.window.longUsd, shortLiqs24h: liqSummary.window.shortUsd, ...liqSummary }
    : null;

  // News sentiment
  const newsSentimentData = getResult(13) as NewsSentimentResult | null;

  // Oil geopolitical news + regime classification
  const oilGeoData = getResult(20) as OilGeoResult | null;
  let oilGeoRegime: "calm" | "elevated" | "extreme" | "whipsaw" | null = null;
  if (oilGeoData) {
    const bd = oilGeoData.categoryBreakdown.filter((b) => b.category !== "GENERAL" && b.scoredCount >= 3);
    const topBull = bd.filter((b) => b.avgScore >= 35).sort((a, b) => b.avgScore * b.scoredCount - a.avgScore * a.scoredCount)[0];
    const topBear = bd.filter((b) => b.avgScore <= -35).sort((a, b) => a.avgScore * a.scoredCount - b.avgScore * b.scoredCount)[0];
    const nowMs = Date.now();
    // Share-based so the regime does not inflate as more feeds are added
    const recent12 = oilGeoData.events.filter((e) => nowMs - new Date(e.publishedAt).getTime() < 12 * 3600e3);
    const hiStrong = recent12.filter((e) => e.impact === "high" && Math.abs(e.score) >= 60).length;
    const hiShare = hiStrong / Math.max(1, recent12.length);
    const absScore = Math.abs(oilGeoData.score);
    // Two strong, opposing catalyst narratives at once (e.g. supply shock vs reserve release)
    const whipsaw = !!topBull && !!topBear;
    oilGeoRegime = whipsaw
      ? "whipsaw"
      : absScore >= 50 || (hiStrong >= 8 && hiShare >= 0.35)
        ? "extreme"
        : absScore >= 25 || hiStrong >= 4
          ? "elevated"
          : "calm";
  }

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
  // OKX rubik stat arrays are NEWEST-FIRST (verified against the live API): index 0 is the latest sample.
  if (longShortRatio == null && okxLSRaw?.code === "0" && Array.isArray(okxLSRaw.data) && okxLSRaw.data.length > 0) {
    const latest = okxLSRaw.data[0];
    if (latest?.[1]) longShortRatio = parseFloat(latest[1]);
    if (okxLSRaw.data.length >= 3) {
      const recent = parseFloat(okxLSRaw.data[0][1]);
      const older = parseFloat(okxLSRaw.data[okxLSRaw.data.length - 1][1]);
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
    const latest = okxOIRaw.data[0]; // newest-first
    if (latest?.[1]) okxOI = parseFloat(latest[1]);
    if (okxOIRaw.data.length >= 5) {
      const recentOI = parseFloat(okxOIRaw.data[0][1]);
      const olderOI = parseFloat(okxOIRaw.data[okxOIRaw.data.length - 1][1]);
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
  const assetClass = assetClassFor(symbol, isCrypto);
  const catalystData = await computeCatalystScore(symbol, assetClass);
  const macroAsset = macroAssetFor(symbol);
  const macroInfo = macroAsset ? await getMacroScores(macroAsset).catch(() => null) : null;

  // ── Universal event gate + macro coupling (Phase 3.2 / 3.3) ───────────────
  // Every symbol reads the macro calendar through its lens (crypto -> BTC, metals -> GOLD, energy -> WTI).
  const lens = macroLensFor(symbol);
  const gateInputs = await getEventGateInputs(lens).catch(() => null);
  const eventWindow: EventWindow = gateInputs
    ? computeEventWindow({ now: nowMs, events: gateInputs.events, lens, firstMoveFor: (t) => firstFiveMinuteMove(candles5m, t, nowMs) })
    : NO_WINDOW;
  const macroCoupling: MacroCoupling | null = isCrypto ? gateInputs?.coupling ?? null : null;
  if (macroState) macroState.eventBlackout = blackoutFrom(eventWindow);
  // An unconfirmed first move (< 0.5% or against the surprise) withdraws the directional event vote.
  const gatedMacroScores: MacroScores | null = macroInfo?.scores
    ? eventWindow.state === "post" && eventWindow.firstMoveGate === "unconfirmed"
      ? { ...macroInfo.scores, event: 0, weights: { ...macroInfo.scores.weights, event: 0 }, note: `${macroInfo.scores.note}; first move unconfirmed, event vote withdrawn` }
      : macroInfo.scores
    : null;
  const nextOilEvent =
    symbol === "OIL"
      ? await getNextOilEvent()
      : isCatalystAsset(symbol)
        ? await (async () => {
            const up = await getUpcomingEvents(120, symbol);
            return up.find((e) => e.impact === "high") ?? up.find((e) => e.impact === "medium") ?? null;
          })()
        : null;

  // ── Elliott Wave count across timeframes (pure, local) ───────────────────
  let elliottMTF: ElliottMTFResult | null = null;
  try {
    elliottMTF = analyzeElliottMTF({ "15m": candles15m, "1h": candles1h, "4h": candles4h });
  } catch {
    elliottMTF = null;
  }

  // ── Trend-system + exhaustion composite across 15m / 4h / 1d ───────────────
  const taSystem = computeTaSystem({ "15m": candles15m, "4h": candles4h, "1d": candlesDaily }, { "15m": 0.25, "4h": 0.4, "1d": 0.35 }, { weights: { ichimoku: 0.3, deathGoldenCross: 0 } });
  const regime = computeRegime({ "15m": candles15m, "4h": candles4h, "1d": candlesDaily }, dec, { squeeze });

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
      assetClass,
      newsSentimentScore: newsSentimentData?.score ?? null,
      oilGeoScore: oilGeoData?.score ?? null,
      oilGeoRegime,
      macroScores: gatedMacroScores,
      preEventRisk: macroInfo?.preEventRisk ?? null,
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
      macroState,
      symbol,
      change24h,
      elliott: elliottMTF,
      taSystem,
      regime,
      eventWindow,
      now: Date.now(),
    },
    dec
  );

  // ── Anticipatory signals ─────────────────────────────────────────────────────
  const anticipatory = computeAnticipatorySignals({
    candles15m,
    currentPrice,
    atr: tradeATR,
    supports: levels.supports,
    resistances: levels.resistances,
    fibLevels,
    rsi,
    rsiArr,
    stochRsi,
    macdHistArr: macdData.histogram,
    ema9Arr,
    ema21Arr,
    bbWidths,
    bbWidth,
    volData,
    fundingRate: strikeFunding,
    oiChange: okxOIChange,
    dec,
  });

  const timeframeOutlook = computeTimeframeOutlook({
    candles5m,
    candles15m,
    candles1h,
    candles4h,
    candlesDaily,
    dec,
  });

  // ── Oil scenario forecast ───────────────────────────────────────────────────
  type OilScenario = {
    name: string;
    direction: "LONG" | "SHORT";
    trigger: string;
    target: number;
    stopRef: number;
    probability: number;
    rr: number;
    horizonHours: number;
  };
  let oilForecast: {
    horizonHours: number;
    scenarios: OilScenario[];
    sizeMultiplier: number;
    stopMultiplier: number;
    note: string;
  } | null = null;

  if (oilGeoData && tradeATR > 0 && currentPrice > 0) {
    const px = currentPrice;
    const ta = tradeATR;
    const regime = oilGeoRegime ?? "calm";
    const k = regime === "extreme" || regime === "whipsaw" ? 2.5 : regime === "elevated" ? 1.8 : 1.2;
    const stopMult = call.stopMultiplier ?? 1;

    const upLvl = levels.resistances.find((r) => r > px + 0.8 * ta);
    const dnLvl = levels.supports.find((s) => s < px - 0.8 * ta);
    const bullTarget = round(Math.min(upLvl ?? Infinity, px + k * ta), dec);
    const bearTarget = round(Math.max(dnLvl ?? -Infinity, px - k * ta), dec);
    const bullStop = round(px - ta * stopMult, dec);
    const bearStop = round(px + ta * stopMult, dec);

    const factor = (cat: string) => call.signalFactors.find((f) => f.category === cat)?.assessment ?? "Neutral";
    const dirScore = (a: string) =>
      a.includes("Strong Bullish") ? 1 : a.includes("Bullish") ? 0.5 : a.includes("Strong Bearish") ? -1 : a.includes("Bearish") ? -0.5 : 0;
    const htfLean = dirScore(factor(FACTOR.HTF));
    const momLean = dirScore(factor(FACTOR.MOMENTUM));
    const geo = oilGeoData.score;
    let pBull = 0.5 + geo / 220 + htfLean * 0.1 + momLean * 0.05;
    if (regime === "whipsaw") pBull = 0.5 + (pBull - 0.5) * 0.5;
    pBull = Math.round(clamp(pBull, 0.15, 0.85) * 100) / 100;
    const pBear = Math.round((1 - pBull) * 100) / 100;

    const v = oilGeoData.verdict;
    const bullCat = v?.bullForce?.category ?? null;
    const bearCat = v?.bearForce?.category ?? null;
    const BULL_TRIGGER: Record<string, string> = oilGeoData.triggers.bull;
    const BEAR_TRIGGER: Record<string, string> = oilGeoData.triggers.bear;
    const short = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
    const hrs = (target: number) => Math.round(clamp(Math.abs(target - px) / ta, 2, 72));

    const bull: OilScenario = {
      name: bullCat ? `${bullCat.replace(/_/g, " ")}: ${short(v?.bullForce?.topHeadline ?? "")}` : "Bullish catalysts build",
      direction: "LONG",
      trigger: BULL_TRIGGER[bullCat ?? ""] ?? "Bullish headline flow persists",
      target: bullTarget,
      stopRef: bullStop,
      probability: pBull,
      rr: Math.round((Math.abs(bullTarget - px) / Math.abs(px - bullStop)) * 100) / 100,
      horizonHours: hrs(bullTarget),
    };
    const bear: OilScenario = {
      name: bearCat ? `${bearCat.replace(/_/g, " ")}: ${short(v?.bearForce?.topHeadline ?? "")}` : "Bearish catalysts build",
      direction: "SHORT",
      trigger: BEAR_TRIGGER[bearCat ?? ""] ?? "Bearish headline flow persists",
      target: bearTarget,
      stopRef: bearStop,
      probability: pBear,
      rr: Math.round((Math.abs(px - bearTarget) / Math.abs(bearStop - px)) * 100) / 100,
      horizonHours: hrs(bearTarget),
    };
    const scenarios = pBull >= pBear ? [bull, bear] : [bear, bull];
    oilForecast = {
      horizonHours: Math.max(bull.horizonHours, bear.horizonHours),
      scenarios,
      sizeMultiplier: call.sizeMultiplier ?? 1,
      stopMultiplier: stopMult,
      note: `Regime ${regime.toUpperCase()} · size ${call.sizeMultiplier ?? 1}x · stops ${stopMult}x ATR · probabilities blend headline flow (${geo >= 0 ? "+" : ""}${geo}), HTF alignment and momentum; calibrates against logged OIL outcomes as history accrues.`,
    };
  }

  // ── Log signal for accuracy tracking (scanner passes log=0 so it does not pollute history) ──
  // Inputs at call time (perf audit 3.1): everything the feedback loop needs is captured with the record, so
  // calibration, the per-component reliability table and the per-call audit never have to be reconstructed.
  const logRisk = Math.abs(call.entry - call.stopLoss);
  const rrOf = (tp: number) => (logRisk > 0 ? Math.round((Math.abs(tp - call.entry) / logRisk) * 100) / 100 : null);
  const logEntryType: "market" | "limit" = currentPrice > 0 && Math.abs(call.entry - currentPrice) / currentPrice > 0.001 ? "limit" : "market";
  // getMacroState is served from the 5s cache the scores call above just filled, so this costs no network.
  const upcomingEvents = macroAsset && macroInfo ? ((await getMacroState(macroAsset).catch(() => null))?.upcoming ?? []) : [];
  const nextEventMin = (() => {
    const nowT = Date.now();
    let best: number | null = null;
    for (const ev of upcomingEvents) {
      if (ev.importance !== "high" && ev.importance !== "critical") continue;
      const m = (Date.parse(ev.time) - nowT) / 60e3;
      if (!Number.isFinite(m) || m < 0) continue;
      if (best == null || m < best) best = m;
    }
    return best == null ? null : Math.round(best);
  })();
  // Calibrated P(TP1) (PR 17): nulls until >= 100 decided calls exist on this engine version and the
  // auto-revert guard is clear. Confidence is untouched; this is a display layer on top of it.
  const calib = pTp1For(call.weightedScore, call.bias, ENGINE_VERSION);
  const logInputs: SignalInputs = {
    weightedScore: call.weightedScore,
    confidenceRaw: clamp(Math.round(50 + Math.abs(call.weightedScore) / 2), 0, 100),
    components: call.components,
    rr1: rrOf(call.tp1),
    rr2: rrOf(call.tp2),
    rr3: rrOf(call.tp3),
    entryType: logEntryType,
    atrPct: currentPrice > 0 && tradeATR > 0 ? Math.round((tradeATR / currentPrice) * 10000) / 100 : null,
    fundingRate: strikeFunding,
    minutesToNextEvent: nextEventMin,
    horizonMin: call.horizonMin ?? null,
    tuning: { ...getTuning() },
    gateNotes: call.gateNotes,
    engineVersion: ENGINE_VERSION,
    calibrationVersion: calib.calibrationVersion,
    pTp1: calib.pTp1,
    regime: call.regimeLabel ?? null,
    regimeGate: call.regimeGate ?? null,
    markAtSignal: markPrice != null && Number.isFinite(markPrice) ? round(markPrice, dec) : null,
    lastAtSignal: lastCandle?.close != null ? round(lastCandle.close, dec) : null,
    candleCloseTime: candles15m[candles15m.length - 1]?.time ?? null,
  };
  const logContext: SignalContext = {
    factors: Object.fromEntries(call.signalFactors.map((f) => [f.category, f.assessment])),
    catalystScore: catalystData.score,
    oilGeoScore: oilGeoData?.score ?? null,
    oilRegime: oilGeoRegime,
    atr: round(tradeATR, dec),
    tradeType: timeframeOutlook.alignment?.tradeType ?? null,
    timeframe: "15m",
    inputs: logInputs,
  };
  if (shouldLog && call.bias !== "WAIT" && call.confidence >= 55) {
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
      engineVersion: ENGINE_VERSION,
      context: logContext,
    }).catch(() => {});
  }

  // Shadow log (perf audit 1.4): calls a gate declined are followed through the same fill model with
  // `shadow: true`, excluded from every public number, so each gate becomes a measurable claim.
  // Classes: a lean below the publish threshold, a short blocked by the HTF rule, a call blocked by the
  // regime gate, a call inside an event blackout (be-macro's gate sets call.eventWindow).
  let shadowClass: ShadowClass | null = null;
  if (call.bias === "WAIT") {
    const eventState = (call as { eventWindow?: { state?: string } | null }).eventWindow?.state;
    if (eventState === "blackout" || eventState === "releasing") shadowClass = "event_gated";
    else if (call.regimeGate === "blocked_long" || call.regimeGate === "blocked_short") shadowClass = "regime_blocked";
    else if (call.gateNotes.some((n) => n.includes("higher timeframes are not trending down"))) shadowClass = "htf_blocked_short";
    else if (call.confidence >= 55 && call.confidence < getTuning().minPublishConfidence) shadowClass = "wait_lean";
  }
  if (shouldLog && shadowClass) {
    const shadowBias: "LONG" | "SHORT" = call.regimeGate === "blocked_long" ? "LONG" : call.regimeGate === "blocked_short" ? "SHORT" : shadowClass === "htf_blocked_short" ? "SHORT" : call.weightedScore >= 0 ? "LONG" : "SHORT";
    const levelsOk = call.entry > 0 && call.stopLoss > 0 && call.tp1 > 0 && call.entry !== call.stopLoss && (shadowBias === "LONG" ? call.tp1 > call.entry && call.stopLoss < call.entry : call.tp1 < call.entry && call.stopLoss > call.entry);
    if (levelsOk) {
      appendSignal({
        symbol,
        timestamp: Date.now(),
        bias: shadowBias,
        confidence: call.confidence,
        grade: call.grade,
        entry: call.entry,
        stopLoss: call.stopLoss,
        tp1: call.tp1,
        tp2: call.tp2,
        tp3: call.tp3,
        priceAtSignal: round(currentPrice, dec),
        engineVersion: ENGINE_VERSION,
        context: logContext,
        shadow: true,
        shadowClass,
      }).catch(() => {});
    } else {
      shadowClass = null;
    }
  }
  // Surfaced on the call: shadowClass for the verdict's "declined ... logged as shadow" line (design F2.10),
  // confidenceRaw for the tooltip, pTp1 / pTp1Ci / calibrationVersion for the probability chip (F1.1).
  Object.assign(call, { shadowClass, confidenceRaw: logInputs.confidenceRaw, pTp1: calib.pTp1, pTp1Ci: calib.pTp1Ci, calibrationVersion: calib.calibrationVersion });

  // ── Build response ─────────────────────────────────────────────────────────
  // A limit entry (resting at support/resistance) must actually trade before the call counts; see the fill model.
  const entryType: "market" | "limit" = Math.abs(call.entry - currentPrice) / currentPrice > 0.001 ? "limit" : "market";
  const response = {
    engineVersion: ENGINE_VERSION,
    entryType,
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
    orderBook,
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
    taSystem,
    regime: regime ? { ...regime, macroCoupling: macroCoupling ? { corr30d: macroCoupling.corr30d, mult: macroCoupling.mult } : null } : regime,
    elliott: elliottMTF
      ? {
          consensus: elliottMTF.consensus,
          perTF: Object.fromEntries(
            Object.entries(elliottMTF.perTF).map(([tf, r]) => [
              tf,
              { pattern: r.pattern, direction: r.direction, currentWave: r.currentWave, confidence: r.confidence, score: Math.round(r.score), targets: r.targets, notes: r.notes.slice(0, 3), waves: r.waves },
            ])
          ),
        }
      : null,
    anticipatory,
    // Each setup carries calledAt: when this direction first appeared for the horizon (see setup-tracker.ts).
    activeSetups: stampActiveSetups(symbol, [
      timeframeOutlook.short.trade ? { horizon: "Short-Term", horizonLabel: "SCALP" as const, timeframes: timeframeOutlook.short.timeframes.join(" + "), ...timeframeOutlook.short.trade } : null,
      timeframeOutlook.medium.trade ? { horizon: "Medium-Term", horizonLabel: "SWING" as const, timeframes: timeframeOutlook.medium.timeframes.join(" + "), ...timeframeOutlook.medium.trade } : null,
      timeframeOutlook.long.trade ? { horizon: "Long-Term", horizonLabel: "POSITION" as const, timeframes: timeframeOutlook.long.timeframes.join(" + "), ...timeframeOutlook.long.trade } : null,
    ].filter((s): s is NonNullable<typeof s> => s !== null)),
    setupAlignment: timeframeOutlook.alignment,
    timeframeOutlook,
    macro: macroState
      ? {
          bias: macroState.bias,
          score: macroState.macroScore,
          signals: macroState.signals,
          regime: macroState.regime,
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
          macroBonus: call.macroBonus,
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
    macroEvent: macroInfo && macroAsset
      ? {
          asset: macroAsset,
          scores: macroInfo.scores,
          preEventRisk: macroInfo.preEventRisk
            ? { title: macroInfo.preEventRisk.event.title, time: macroInfo.preEventRisk.event.time, minutes: macroInfo.preEventRisk.minutes, importance: macroInfo.preEventRisk.importance }
            : null,
          active: macroInfo.active
            ? {
                id: macroInfo.active.event.id,
                title: macroInfo.active.event.title,
                time: macroInfo.active.event.time,
                phase: macroInfo.active.phase,
                secondsToRelease: macroInfo.active.secondsToRelease,
                releaseStatus: macroInfo.active.release?.status ?? null,
                surpriseLabel: macroInfo.active.surprise?.label ?? null,
                impact: (macroInfo.active.postImpact ?? macroInfo.active.preMap).find((i) => i.asset === macroAsset) ?? null,
                confirmation: macroInfo.active.confirmation
                  ? { status: macroInfo.active.confirmation.perAsset[macroAsset].status, pct: macroInfo.active.confirmation.pct, note: macroInfo.active.confirmation.perAsset[macroAsset].note }
                  : null,
              }
            : null,
        }
      : null,
    oilGeopolitical: oilGeoData
      ? {
          score: oilGeoData.score,
          label: oilGeoData.label,
          eventCount: oilGeoData.eventCount,
          lastUpdated: oilGeoData.lastUpdated,
          events: oilGeoData.events.slice(0, 20).map((e) => ({
            title: e.title,
            source: e.source,
            publishedAt: e.publishedAt,
            category: e.category,
            sentiment: e.sentiment,
            impact: e.impact,
            score: e.score,
            url: e.url,
            priceReaction: e.priceReaction,
          })),
          categoryBreakdown: oilGeoData.categoryBreakdown,
          priceContext: oilGeoData.priceContext,
          verdict: oilGeoData.verdict,
          sourcesUsed: oilGeoData.sourcesUsed,
          asset: oilGeoData.asset,
          assetName: oilGeoData.assetName,
          panelTitle: oilGeoData.panelTitle,
          regime: oilGeoRegime ?? "calm",
          nextScheduled: nextOilEvent
            ? { name: nextOilEvent.name, time: nextOilEvent.time.toISOString(), impact: nextOilEvent.impact }
            : null,
        }
      : null,
    oilForecast,
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
  return { status: 200, body: response, cached: false };
}

// ── Pure scoring hook (backtests) ────────────────────────────────────────────

export interface ScoreInput {
  symbol: string;
  c5: Candle[];
  c15: Candle[];
  c1h: Candle[];
  c4h: Candle[];
  c1d: Candle[];
  /** Mark price at decision time; defaults to the last 15m close supplied. */
  price?: number;
  /** Decision time in ms; bars still forming at this time are dropped. Defaults to now. */
  now?: number;
}

/**
 * Candles in, call out. Runs the same analyzeCandles + computeMultiFactorCall path as the live engine with
 * every non-candle feed (funding, OI, F&G, news, catalysts, ETF, liquidations, macro) treated as null, which
 * removes their weights from the denominator. Returns null when there is not enough data for a call.
 */
export function scoreFromCandles(input: ScoreInput) {
  const symbol = input.symbol.toUpperCase();
  const config = SYMBOL_MAP[symbol];
  if (!config) throw new Error(`Unknown symbol ${symbol}`);
  const dec = config.decimals;
  const isCrypto = config.isCrypto;
  const now = input.now ?? Date.now();
  const candles15m = closedCandles(input.c15, TF_MS["15m"], now);
  const candles1h = closedCandles(input.c1h, TF_MS["1h"], now);
  const candles4h = closedCandles(input.c4h, TF_MS["4h"], now);
  const candlesDaily = closedCandles(input.c1d, TF_MS["1d"], now);
  const candles5m = closedCandles(input.c5, TF_MS["5m"], now);
  const currentPrice = input.price ?? input.c15[input.c15.length - 1]?.close ?? 0;
  if (candles15m.length < 50 || !(currentPrice > 0)) return null;

  const A = analyzeCandles({ dec, candles15m, candles1h, candles4h, candlesDaily, candles5m, currentPrice, strikeFunding: null });
  const assetClass = assetClassFor(symbol, isCrypto);
  let elliottMTF: ElliottMTFResult | null = null;
  try {
    elliottMTF = analyzeElliottMTF({ "15m": candles15m, "1h": candles1h, "4h": candles4h });
  } catch {
    elliottMTF = null;
  }
  const taSystem = computeTaSystem({ "15m": candles15m, "4h": candles4h, "1d": candlesDaily }, { "15m": 0.25, "4h": 0.4, "1d": 0.35 }, { weights: { ichimoku: 0.3, deathGoldenCross: 0 } });
  const regime = computeRegime({ "15m": candles15m, "4h": candles4h, "1d": candlesDaily }, dec, { squeeze: A.squeeze });
  const prevRsi15m = A.rsiArr.length >= 2 ? A.rsiArr[A.rsiArr.length - 2] : null;

  const call = computeMultiFactorCall(
    {
      price: currentPrice,
      rsi: A.rsi,
      rsi5m: A.rsi5m,
      stochRsi: A.stochRsi,
      ema9: A.ema9Val,
      ema21: A.ema21Val,
      ema50: A.ema50Val,
      macdHist: A.macdHist,
      adx: A.adxVal,
      atr: A.atrVal,
      bbUpper: A.bbUpper,
      bbLower: A.bbLower,
      bbMiddle: A.bbMiddle,
      bbWidth: A.bbWidth,
      supertrendDir: A.supertrendDir,
      supports: A.levels.supports,
      resistances: A.levels.resistances,
      trend1h: A.trend1h,
      rsi1h: A.rsi1h,
      trend4h: A.trend4h,
      rsi4h: A.rsi4h,
      trendDaily: A.trendDaily,
      rsiDaily: A.rsiDaily,
      fearGreed: null,
      fundingRate: null,
      putCallRatio: null,
      btcDominance: null,
      rsiDiv15m: A.rsiDiv15m,
      rsiDiv1h: A.rsiDiv1h,
      macdDiv: A.macdDiv,
      volDiv: A.volDiv,
      squeeze: A.squeeze,
      pattern: A.candlestickPattern,
      etfNet: null,
      fibLevels: A.fibLevels,
      fibExtension: A.fibExtension,
      volData: A.volData,
      isCrypto,
      assetClass,
      newsSentimentScore: null,
      oilGeoScore: null,
      oilGeoRegime: null,
      macroScores: null,
      preEventRisk: null,
      catalystScore: 0,
      catalystRiskNote: null,
      tradeATR: A.tradeATR,
      longShortRatio: null,
      longShortChange: null,
      topTraderLongRatio: null,
      longLiqs24h: null,
      shortLiqs24h: null,
      oiChange: null,
      takerBuySellRatio: null,
      prevRsi: prevRsi15m,
      macroBias: null,
      macroState: null,
      symbol,
      change24h: A.change24h,
      elliott: elliottMTF,
      taSystem,
      regime,
      now,
    },
    dec
  );

  return {
    bias: call.bias,
    confidence: call.confidence,
    grade: call.grade,
    entry: call.entry,
    stopLoss: call.stopLoss,
    tp1: call.tp1,
    tp2: call.tp2,
    tp3: call.tp3,
    riskReward: call.riskReward,
    regime: call.regime,
    weightedScore: call.weightedScore,
    factors: call.signalFactors,
    regimeLabel: call.regimeLabel,
    regimeScore: call.regimeScore,
    regimeGate: call.regimeGate,
    price: currentPrice,
    atr: A.tradeATR,
    // Wave 2 (PR 15): per-decision fields the backtest buckets and the horizon rule need.
    mode: call.mode,
    dominantTf: call.dominantTf,
    horizonMin: call.horizonMin,
    setup: call.setup,
    blocks: call.blocks,
    components: call.components,
    gateNotes: call.gateNotes,
    sizeMultiplier: call.sizeMultiplier,
    invalidation: call.invalidation,
    flips: call.flips,
    stopAnchor: call.stopAnchor,
    expectedHold: call.expectedHold,
  };
}
