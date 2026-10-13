// features.vol: Deribit DVOL (BTC and ETH only). One keyless call returns about 400 daily OHLC rows, enough for a
// 1-year percentile; the latest close is today's forming daily bar, so it is the live index. Expected move is the
// one-sigma move implied by DVOL over the horizon: DVOL / sqrt(365) for 24h, DVOL / sqrt(365 * 6) for 4h.
// Sizing and gating only, never direction (research 1.7).

import { FeedCache, getJSON, percentileRank, round, roundOrNull } from "./fetch";
import type { VolFeature } from "./types";

export const DVOL_TTL = 60 * 60e3;
export const DERIBIT_CURRENCIES: Record<string, "BTC" | "ETH"> = { BTC: "BTC", ETH: "ETH" };

export interface DvolBar {
  ts: number;
  close: number;
}

type DvolResponse = { result?: { data?: [number, number, number, number, number][] } };

export function parseDvol(res: DvolResponse | null): DvolBar[] {
  const rows = res?.result?.data;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ ts: Number(r[0]), close: Number(r[4]) }))
    .filter((b) => Number.isFinite(b.ts) && Number.isFinite(b.close) && b.close > 0)
    .sort((a, b) => a.ts - b.ts);
}

/** One-sigma expected move in percent for a horizon of `hours`, from an annualized vol in percent. */
export function expectedMovePct(dvol: number, hours: number): number {
  return dvol / Math.sqrt((365 * 24) / hours);
}

export function buildVolFeature(bars: DvolBar[], price: number | null, now = Date.now()): VolFeature | null {
  if (bars.length === 0) return null;
  const latest = bars[bars.length - 1];
  const dvol = latest.close;
  const hist1y = bars.slice(-366).map((b) => b.close);
  const hist90 = bars.slice(-91).map((b) => b.close);
  const prev = bars.length >= 2 ? bars[bars.length - 2].close : null;
  const em24 = expectedMovePct(dvol, 24);
  const em4 = expectedMovePct(dvol, 4);
  const usd = (pct: number) => (price != null && price > 0 ? round((price * pct) / 100, 2) : null);
  return {
    asOf: Math.min(now, latest.ts + 86400e3 > now ? now : latest.ts),
    ttlMs: DVOL_TTL,
    dvol: round(dvol, 2),
    dvolPct: hist1y.length >= 30 ? roundOrNull(percentileRank(dvol, hist1y), 1) : null,
    dvolPct90d: hist90.length >= 30 ? roundOrNull(percentileRank(dvol, hist90), 1) : null,
    change24hPct: prev != null && prev > 0 ? round(((dvol - prev) / prev) * 100, 2) : null,
    expectedMove24hPct: round(em24, 3),
    expectedMove24hUsd: usd(em24),
    expectedMove4hPct: round(em4, 3),
    expectedMove4hUsd: usd(em4),
  };
}

/**
 * Pure helper for be-strategy (not wired here): stop-width multiplier from the DVOL percentile, audit 3.2:
 * stopMult = 1 + 0.3 * (pctile - 0.5), i.e. 0.85x at the 0th percentile and 1.15x at the 100th. Null pct -> 1.
 */
export function dvolStopMult(dvolPct: number | null | undefined): number {
  if (dvolPct == null || !Number.isFinite(dvolPct)) return 1;
  return round(1 + 0.3 * (dvolPct / 100 - 0.5), 3);
}

const cache = new FeedCache<DvolBar[]>(DVOL_TTL);

export async function fetchDvolBars(currency: "BTC" | "ETH" | undefined, now = Date.now()): Promise<DvolBar[] | null> {
  if (!currency) return null;
  return cache.get(currency, async () => {
    const url = `https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=${currency}&start_timestamp=${now - 400 * 86400e3}&end_timestamp=${now}&resolution=86400`;
    const bars = parseDvol(await getJSON<DvolResponse>(url));
    return bars.length > 0 ? bars : null;
  });
}

export function _resetDvolCache() {
  cache.clear();
}
