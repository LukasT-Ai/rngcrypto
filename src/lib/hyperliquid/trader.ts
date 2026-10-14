// On-demand detail for one address: fills over the last 30 days (the scanner's cached file plus whatever is newer),
// clearinghouseState for the main book and each builder dex, and the portfolio pnl history. Cached 60s per
// address; the asset filter is applied after the cache so switching tabs on the page does not refetch.

import { FeedCache } from "@/lib/signals/features/fetch";
import { info, WEIGHT } from "./http";
import { findLeaderRow } from "./leaderboard";
import { fetchAllStates, fetchFillsSince, getRecord, getScanSet, readTraderFills, scoreAll } from "./scanner";
import { computeMix, computeStats30d, dailySeries, equityStartOf, monthStartEquity, scoreTrader } from "./score";
import { allGroupStats, copyStats, emptyStats, mapPositions, mergeFills, perCoinStats, recentTrades, totalEquity } from "./stats";
import { ASSETS, ASSET_GROUPS, FILL_WINDOW_MS, WINDOWS, type AssetGroup, type HlPortfolio, type TraderDetail, type Window, type WindowPerf } from "./types";

export const TRADER_TTL_MS = 60_000;
const ON_DEMAND_MAX_PAGES = 3;

const cache = new FeedCache<TraderDetail>(TRADER_TTL_MS);

const num = (s: unknown): number => {
  const n = typeof s === "number" ? s : Number(s);
  return Number.isFinite(n) ? n : 0;
};

export function parsePortfolio(p: HlPortfolio | null): { windows: Partial<Record<Window, WindowPerf>>; pnlHistory: { month: [number, number][]; allTime: [number, number][] } } {
  const windows: Partial<Record<Window, WindowPerf>> = {};
  const pnlHistory: { month: [number, number][]; allTime: [number, number][] } = { month: [], allTime: [] };
  if (!Array.isArray(p)) return { windows, pnlHistory };
  for (const entry of p) {
    if (!Array.isArray(entry)) continue;
    const [name, data] = entry;
    if (!(WINDOWS as string[]).includes(name) || !data) continue;
    const w = name as Window;
    const hist: [number, number][] = Array.isArray(data.pnlHistory) ? data.pnlHistory.map(([t, v]) => [num(t), num(v)] as [number, number]) : [];
    const pnl = hist.length ? hist[hist.length - 1][1] : 0;
    const startEquity = Array.isArray(data.accountValueHistory) && data.accountValueHistory.length ? num(data.accountValueHistory[0][1]) : 0;
    // ROI like the leaderboard: pnl over the equity at the start of the window (0 when the start equity is unknown).
    windows[w] = { pnl, roi: startEquity > 0 ? (pnl / startEquity) * 100 : 0, volume: num(data.vlm) };
    if (w === "month") pnlHistory.month = hist;
    if (w === "allTime") pnlHistory.allTime = hist;
  }
  return { windows, pnlHistory };
}

async function load(address: string): Promise<TraderDetail | null> {
  const now = Date.now();
  const since = now - FILL_WINDOW_MS;
  const cached = readTraderFills(address);
  const startTime = cached ? Math.max(cached.lastFillTime, since) : since;

  const [fetched, states, portfolio, leader] = await Promise.all([
    fetchFillsSince(address, startTime, cached ? 1 : ON_DEMAND_MAX_PAGES, now),
    fetchAllStates(address),
    info<HlPortfolio>({ type: "portfolio", user: address }, WEIGHT.portfolio),
    findLeaderRow(address),
  ]);
  // The main clearinghouseState returns an empty state for a never-seen address, so null means upstream down.
  if (!states[0]) return null;

  const fills = mergeFills(cached?.fills ?? [], fetched.fills, since);
  const record = getRecord(address);
  const pf = parsePortfolio(portfolio);
  const windows = {} as Record<Window, WindowPerf>;
  for (const w of WINDOWS) windows[w] = record?.windows[w] ?? leader?.windows[w] ?? pf.windows[w] ?? { pnl: 0, roi: 0, volume: 0 };

  const perCoin = perCoinStats(fills);
  const perAsset: Record<string, ReturnType<typeof emptyStats>> = { ...perCoin };
  const groups = allGroupStats(perCoin, fills);
  for (const g of ASSETS) perAsset[g] = groups[g] ?? emptyStats(g);
  // Single-market groups share their name with the market; keep the group version (coins populated).
  for (const g of ASSETS as readonly AssetGroup[]) for (const c of ASSET_GROUPS[g]) if (c === g) perAsset[c] = perAsset[g];

  const positions = mapPositions(states, fills);
  const mix = computeMix(perCoin);
  const equity = totalEquity(states) ?? 0;
  const recordedStart = portfolio ? monthStartEquity(portfolio) : (record?.portfolio?.equityStart ?? null);
  const equityStart = equityStartOf(equity, windows.month.pnl, recordedStart);
  const daily = portfolio ? dailySeries(portfolio) : (record?.portfolio?.daily ?? []);
  const stats30d = computeStats30d(perCoin, fills, positions, daily, equityStart);
  const copy = copyStats(fills, equityStart);
  // Score against the scanned set when the trader is in it (cross-sectional pnl percentile); otherwise no percentile.
  const fallback = () => scoreTrader({ mix, stats30d, copy, positions, equity, monthPnl: windows.month.pnl, equityStart: recordedStart, daily, pnlPctl: null, now });
  const score = record ? (scoreAll(scanSetWith(record), now).get(address) ?? fallback()) : fallback();

  return {
    asOf: now,
    address,
    displayName: record?.displayName ?? leader?.displayName ?? null,
    equity,
    withdrawable: num(states[0].withdrawable),
    windows,
    pnlHistory: pf.pnlHistory,
    openPositions: positions,
    recentTrades: recentTrades(fills, 2000),
    perAsset,
    mix,
    stats30d,
    score,
    links: { hyperliquid: `https://app.hyperliquid.xyz/explorer/address/${address}` },
  };
}

/** The scanned record set, with `record` appended when it is not part of it (so its pnl rank is well-defined). */
function scanSetWith(record: NonNullable<ReturnType<typeof getRecord>>) {
  const recs = getScanSet().map((c) => getRecord(c.address)).filter((r): r is NonNullable<typeof r> => !!r);
  return recs.some((r) => r.address === record.address) ? recs : [...recs, record];
}

/** Detail for one address (lowercased by the caller), trades filtered to one asset group when given. */
export async function getTraderDetail(address: string, asset: AssetGroup | "ALL" = "ALL"): Promise<TraderDetail | null> {
  const d = await cache.get(address, () => load(address));
  if (!d) return null;
  const coins = asset === "ALL" ? null : new Set(ASSET_GROUPS[asset]);
  const trades = (coins ? d.recentTrades.filter((t) => coins.has(t.coin)) : d.recentTrades).slice(0, 100);
  return { ...d, recentTrades: trades };
}
