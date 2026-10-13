// features.oi: open-interest series from OKX open-interest-history. Two cached calls: 1H x 100 (about 4 days, for
// the 1h and 24h changes) and 1D x 31 (a true 30-day SD of daily OI changes so the 24h change can be read in SD
// units). The four-quadrant label (research 1.2) only fires beyond +/-1 SD; the raw label is also exposed.

import { FeedCache, okxData, round, roundOrNull, stdev } from "./fetch";
import type { OiFeature, OiQuadrant } from "./types";

export const OI_TTL = 10 * 60e3;

export interface OiPoint {
  ts: number;
  oi: number; // contracts
  oiCcy: number; // base currency
  oiUsd: number;
}

// OKX rows: [ts, oi, oiCcy, oiUsd], NEWEST FIRST on the wire. Always sort ascending before reading.
export function parseOiHistory(rows: string[][] | null): OiPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ ts: Number(r[0]), oi: parseFloat(r[1]), oiCcy: parseFloat(r[2]), oiUsd: parseFloat(r[3]) }))
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.oiCcy) && p.oiCcy > 0)
    .sort((a, b) => a.ts - b.ts);
}

function pctChange(now: number, then: number | undefined): number | null {
  if (then == null || !(then > 0)) return null;
  return ((now - then) / then) * 100;
}

/** Closest point at or before `ts - backMs`; null when the series does not reach that far. */
function valueAgo(series: OiPoint[], backMs: number): number | null {
  const latest = series[series.length - 1];
  const target = latest.ts - backMs;
  let best: OiPoint | null = null;
  for (const p of series) {
    if (p.ts <= target + 60e3) best = p;
    else break;
  }
  // Tolerate a one-bucket gap (the OKX 1H series occasionally skips an hour).
  if (!best) return null;
  if (target - best.ts > 2 * 3600e3) return null;
  return best.oiCcy;
}

export function quadrantFor(priceChangePct: number | null, oiChangePct: number | null): OiQuadrant | null {
  if (priceChangePct == null || oiChangePct == null) return null;
  if (priceChangePct === 0 || oiChangePct === 0) return null;
  if (priceChangePct > 0) return oiChangePct > 0 ? "new_longs" : "short_cover";
  return oiChangePct > 0 ? "new_shorts" : "long_flush";
}

export function buildOiFeature(hourly: OiPoint[], daily: OiPoint[], priceChange24hPct: number | null, now = Date.now()): OiFeature | null {
  if (hourly.length < 2) return null;
  const latest = hourly[hourly.length - 1];
  const change1hPct = pctChange(latest.oiCcy, valueAgo(hourly, 3600e3) ?? undefined);
  const change24hPct = pctChange(latest.oiCcy, valueAgo(hourly, 24 * 3600e3) ?? undefined);
  // SD of daily OI % changes over the last 30 days.
  const dailyChanges: number[] = [];
  for (let i = 1; i < daily.length; i++) {
    const c = pctChange(daily[i].oiCcy, daily[i - 1].oiCcy);
    if (c != null) dailyChanges.push(c);
  }
  const sdDaily = dailyChanges.length >= 10 ? stdev(dailyChanges) : null;
  const sd = change24hPct != null && sdDaily != null && sdDaily > 0 ? change24hPct / sdDaily : null;
  const quadrantRaw = quadrantFor(priceChange24hPct, change24hPct);
  const quadrant = sd != null && Math.abs(sd) >= 1 ? quadrantRaw : null;
  return {
    asOf: Math.min(now, latest.ts),
    ttlMs: OI_TTL,
    oi: round(latest.oiCcy, 2),
    oiUsd: roundOrNull(latest.oiUsd, 0),
    change1hPct: roundOrNull(change1hPct, 2),
    change24hPct: roundOrNull(change24hPct, 2),
    sd: roundOrNull(sd, 2),
    priceChange24hPct: roundOrNull(priceChange24hPct, 2),
    quadrant,
    quadrantRaw,
  };
}

// ── Fetchers ────────────────────────────────────────────────────────────────

export interface OiRaw {
  hourly: OiPoint[];
  daily: OiPoint[];
}

const cache = new FeedCache<OiRaw>(OI_TTL);

/** Raw OI series for one OKX underlying (fits the engine's parallel batch; price change is applied after). */
export async function fetchOiRaw(ccy: string | undefined): Promise<OiRaw | null> {
  if (!ccy) return null;
  return cache.get(ccy, async () => {
    const [h, d] = await Promise.all([
      okxData<string[][]>(`/api/v5/rubik/stat/contracts/open-interest-history?instId=${ccy}-USDT-SWAP&period=1H&limit=100`),
      okxData<string[][]>(`/api/v5/rubik/stat/contracts/open-interest-history?instId=${ccy}-USDT-SWAP&period=1D&limit=31`),
    ]);
    const hourly = parseOiHistory(h);
    if (hourly.length < 2) return null;
    return { hourly, daily: parseOiHistory(d) };
  });
}

export function _resetOiCache() {
  cache.clear();
}
