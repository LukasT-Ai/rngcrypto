// features.funding: OKX realized funding with a z-score against its own 30-day history, plus the cross-venue view
// from Hyperliquid's predictedFundings (which carries Binance and Bybit predicted rates, restoring the Binance
// view despite the geo-block). Funding is a crowding / sizing feature, never a direction vote (research 1.1).

import { FeedCache, okxData, postJSON, roundOrNull, round, zScore } from "./fetch";
import type { FundingFeature } from "./types";

export const FUNDING_TTL = 15 * 60e3; // OKX settles every 8h; HL predicted moves hourly
const HL_TTL = 10 * 60e3;
export const CROWDED_Z = 2;

export interface FundingHistoryRow {
  ts: number;
  rate: number; // realized 8h rate, fraction
}

export interface VenueRates {
  hl: number | null;
  binance: number | null;
  bybit: number | null;
}

type OkxFundingRow = { fundingTime: string; realizedRate?: string; fundingRate?: string };

export function parseOkxFundingHistory(rows: OkxFundingRow[] | null): FundingHistoryRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ ts: Number(r.fundingTime), rate: parseFloat(r.realizedRate ?? r.fundingRate ?? "") }))
    .filter((r) => Number.isFinite(r.ts) && Number.isFinite(r.rate))
    .sort((a, b) => a.ts - b.ts);
}

// Hyperliquid predictedFundings: [[coin, [[venue, {fundingRate, nextFundingTime, fundingIntervalHours}], ...]], ...]
type HlPredicted = [string, [string, { fundingRate: string; nextFundingTime: number; fundingIntervalHours?: number }][]][];

/** Normalize every venue to an 8h-equivalent rate so the spread compares like with like. */
export function parseHlPredicted(data: HlPredicted | null, coin: string): VenueRates {
  const out: VenueRates = { hl: null, binance: null, bybit: null };
  if (!Array.isArray(data)) return out;
  const row = data.find((r) => Array.isArray(r) && r[0] === coin);
  if (!row || !Array.isArray(row[1])) return out;
  for (const [venue, v] of row[1]) {
    const rate = parseFloat(v?.fundingRate ?? "");
    if (!Number.isFinite(rate)) continue;
    const hours = v.fundingIntervalHours && v.fundingIntervalHours > 0 ? v.fundingIntervalHours : venue === "HlPerp" ? 1 : 8;
    const r8 = rate * (8 / hours);
    if (venue === "HlPerp") out.hl = r8;
    else if (venue === "BinPerp") out.binance = r8;
    else if (venue === "BybitPerp") out.bybit = r8;
  }
  return out;
}

/** max/min absolute rate across venues with the same sign as OKX; null when fewer than 2 venues or a zero rate. */
export function venueSpreadRatio(okx: number, venues: VenueRates): number | null {
  const rates = [okx, venues.hl, venues.binance, venues.bybit].filter((r): r is number => r != null && Number.isFinite(r));
  if (rates.length < 2) return null;
  const abs = rates.map((r) => Math.abs(r));
  const lo = Math.min(...abs);
  const hi = Math.max(...abs);
  if (!(lo > 0)) return null;
  return hi / lo;
}

export function buildFundingFeature(history: FundingHistoryRow[], venues: VenueRates, now = Date.now()): FundingFeature | null {
  if (history.length === 0) return null;
  const latest = history[history.length - 1];
  const z = zScore(latest.rate, history.map((h) => h.rate));
  const crowded = z == null ? null : z > CROWDED_Z ? "long" : z < -CROWDED_Z ? "short" : null;
  const spreadRatio = venueSpreadRatio(latest.rate, venues);
  return {
    asOf: Math.min(now, latest.ts),
    ttlMs: FUNDING_TTL,
    rate8h: round(latest.rate, 8),
    z: roundOrNull(z, 2),
    venues: { okx: round(latest.rate, 8), hl: roundOrNull(venues.hl, 8), binance: roundOrNull(venues.binance, 8), bybit: roundOrNull(venues.bybit, 8) },
    spreadRatio: roundOrNull(spreadRatio, 2),
    crowded,
    regime: crowded === "long" ? "crowded_long" : crowded === "short" ? "crowded_short" : "neutral",
    n: history.length,
  };
}

// ── Fetchers ────────────────────────────────────────────────────────────────

const historyCache = new FeedCache<FundingHistoryRow[]>(FUNDING_TTL);
const hlCache = new FeedCache<HlPredicted>(HL_TTL);

export async function fetchFundingHistory(ccy: string): Promise<FundingHistoryRow[] | null> {
  return historyCache.get(ccy, async () => {
    const rows = await okxData<OkxFundingRow[]>(`/api/v5/public/funding-rate-history?instId=${ccy}-USDT-SWAP&limit=100`);
    const parsed = parseOkxFundingHistory(rows);
    return parsed.length > 0 ? parsed : null;
  });
}

export async function fetchHlPredictedFundings(): Promise<HlPredicted | null> {
  return hlCache.get("all", () => postJSON<HlPredicted>("https://api.hyperliquid.xyz/info", { type: "predictedFundings" }));
}

/** Engine-facing: funding feature for one OKX underlying. Never throws; null when OKX history is unavailable. */
export async function fetchFundingFeature(ccy: string | undefined, now = Date.now()): Promise<FundingFeature | null> {
  if (!ccy) return null;
  try {
    const [history, hl] = await Promise.all([fetchFundingHistory(ccy), fetchHlPredictedFundings()]);
    if (!history) return null;
    return buildFundingFeature(history, parseHlPredicted(hl, ccy), now);
  } catch {
    return null;
  }
}

export function _resetFundingCaches() {
  historyCache.clear();
  hlCache.clear();
}
