// features.stablecoins: DefiLlama peggedUSD total supply (daily history since 2017) and USDT / USDC 24h mint from
// the per-coin endpoint. 7-day supply change z-scored against one year of 7-day changes; > +1 SD tailwind,
// < -1 SD headwind; a single-day USDT mint >= $500M is the 24h flag (research 1.9). Slow feature, cached 6h.

import { FeedCache, getJSON, round, roundOrNull, zScore } from "@/lib/signals/features/fetch";
import type { StablecoinFeature } from "@/lib/signals/features/types";

export const STABLE_TTL = 6 * 3600e3;
export const MINT_FLAG_USD = 500e6;

export interface SupplyPoint {
  ts: number; // ms
  usd: number;
}

type ChartRow = { date: string | number; totalCirculatingUSD?: { peggedUSD?: number } };

export function parseSupplyChart(rows: ChartRow[] | null): SupplyPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ ts: Number(r.date) * 1000, usd: Number(r.totalCirculatingUSD?.peggedUSD) }))
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.usd) && p.usd > 0)
    .sort((a, b) => a.ts - b.ts);
}

type CoinsResponse = { peggedAssets?: { symbol: string; circulating?: { peggedUSD?: number }; circulatingPrevDay?: { peggedUSD?: number } }[] };

export interface MintInfo {
  usdt: number | null;
  usdc: number | null;
}

export function parseMints(res: CoinsResponse | null): MintInfo {
  const out: MintInfo = { usdt: null, usdc: null };
  const assets = res?.peggedAssets;
  if (!Array.isArray(assets)) return out;
  for (const sym of ["USDT", "USDC"] as const) {
    const a = assets.find((x) => x.symbol === sym);
    const c = a?.circulating?.peggedUSD;
    const p = a?.circulatingPrevDay?.peggedUSD;
    if (c != null && p != null && Number.isFinite(c) && Number.isFinite(p)) out[sym === "USDT" ? "usdt" : "usdc"] = c - p;
  }
  return out;
}

/** 7-day percentage changes at every point that has a sample 7 days earlier (daily series). */
export function sevenDayChanges(series: SupplyPoint[]): number[] {
  const out: number[] = [];
  for (let i = 7; i < series.length; i++) {
    const a = series[i - 7].usd;
    if (a > 0) out.push((series[i].usd / a - 1) * 100);
  }
  return out;
}

export function buildStablecoinFeature(series: SupplyPoint[], mints: MintInfo, now = Date.now()): StablecoinFeature | null {
  if (series.length === 0) return null;
  const latest = series[series.length - 1];
  const changes = sevenDayChanges(series.slice(-373)); // one year of 7d changes
  const supply7dChgPct = changes.length ? changes[changes.length - 1] : null;
  const z = supply7dChgPct != null ? zScore(supply7dChgPct, changes, 30) : null;
  const flag = z == null ? null : z > 1 ? "tailwind" : z < -1 ? "headwind" : null;
  return {
    asOf: Math.min(now, latest.ts + 86400e3),
    ttlMs: STABLE_TTL,
    supplyUsd: round(latest.usd, 0),
    supply7dChgPct: roundOrNull(supply7dChgPct, 3),
    z: roundOrNull(z, 2),
    usdtMint24hUsd: roundOrNull(mints.usdt, 0),
    usdcMint24hUsd: roundOrNull(mints.usdc, 0),
    flag,
    mintFlag: mints.usdt != null && mints.usdt >= MINT_FLAG_USD,
  };
}

const cache = new FeedCache<StablecoinFeature>(STABLE_TTL);

export async function fetchStablecoinFeature(now = Date.now()): Promise<StablecoinFeature | null> {
  return cache.get("all", async () => {
    const [chart, coins] = await Promise.all([
      getJSON<ChartRow[]>("https://stablecoins.llama.fi/stablecoincharts/all", 15000),
      getJSON<CoinsResponse>("https://stablecoins.llama.fi/stablecoins?includePrices=false", 15000),
    ]);
    return buildStablecoinFeature(parseSupplyChart(chart), parseMints(coins), now);
  });
}

export function _resetStablecoinCache() {
  cache.clear();
}
