// Pure transforms over Hyperliquid fills and clearinghouse state (no IO, fully unit tested).

import { ASSET_GROUPS, COIN_TO_GROUP, DAY_MS, type AssetGroup, type AssetStats, type CompactFill, type CopyStats, type HlClearinghouseState, type HlFill, type HlPosition, type OpenPosition, type OpenSummary, type Trade } from "./types";

const num = (s: unknown): number => {
  const n = typeof s === "number" ? s : Number(s);
  return Number.isFinite(n) ? n : 0;
};

export const MIN_CLOSES_FOR_WIN_RATE = 5;

/** Perp coins only: spot pairs look like "PURR/USDC" or "@107". Builder-deployed perps ("xyz:MSFT") are perps. */
export const isPerpCoin = (coin: string) => !coin.includes("/") && !coin.startsWith("@");

export function compactFill(f: HlFill): CompactFill {
  return [f.time, f.coin, f.side, num(f.px), num(f.sz), num(f.closedPnl), num(f.fee), f.dir, num(f.startPosition), f.hash, f.tid];
}

export const fillTime = (f: CompactFill) => f[0];
export const fillCoin = (f: CompactFill) => f[1];
export const fillTid = (f: CompactFill) => f[10];

/** Merge two compact fill lists by tid, drop fills older than `since`, sort newest first. */
export function mergeFills(a: CompactFill[], b: CompactFill[], since: number): CompactFill[] {
  const seen = new Map<number, CompactFill>();
  for (const f of a) if (f[0] >= since) seen.set(f[10], f);
  for (const f of b) if (f[0] >= since) seen.set(f[10], f);
  return [...seen.values()].sort((x, y) => y[0] - x[0]);
}

/** A fill that opens (or flips into) a position: "Open Long", "Open Short", "Long > Short", "Short > Long". */
export function openSide(dir: string): "long" | "short" | null {
  if (dir === "Open Long" || dir === "Short > Long") return "long";
  if (dir === "Open Short" || dir === "Long > Short") return "short";
  return null;
}

/** A fill that closes (part of) a position: "Close Long/Short", flips, liquidations. */
export function isClose(dir: string): boolean {
  return dir.startsWith("Close") || dir.includes(">") || dir.startsWith("Liquidated");
}

export function emptyStats(coin: string): AssetStats {
  return {
    coin,
    coins: [],
    trades: 0,
    volumeUsd: 0,
    realizedPnl: 0,
    fees: 0,
    winRate: null,
    wins: 0,
    losses: 0,
    avgTradeUsd: 0,
    lastTradeAt: null,
    direction: null,
    first30dPnl: 0,
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Per-coin stats over a fill list (any order). Every perp coin present gets an entry. */
export function perCoinStats(fills: CompactFill[]): Record<string, AssetStats> {
  const acc = new Map<string, { s: AssetStats; longNtl: number; shortNtl: number }>();
  for (const f of fills) {
    const [time, coin, , px, sz, closedPnl, fee, dir] = f;
    if (!isPerpCoin(coin)) continue;
    let e = acc.get(coin);
    if (!e) {
      e = { s: emptyStats(coin), longNtl: 0, shortNtl: 0 };
      acc.set(coin, e);
    }
    const ntl = px * sz;
    e.s.trades++;
    e.s.volumeUsd += ntl;
    e.s.realizedPnl += closedPnl;
    e.s.fees += fee;
    if (e.s.lastTradeAt == null || time > e.s.lastTradeAt) e.s.lastTradeAt = time;
    if (isClose(dir)) {
      if (closedPnl > 0) e.s.wins++;
      else if (closedPnl < 0) e.s.losses++;
    }
    const side = openSide(dir);
    if (side === "long") e.longNtl += ntl;
    else if (side === "short") e.shortNtl += ntl;
  }
  const out: Record<string, AssetStats> = {};
  for (const [coin, e] of acc) {
    const s = e.s;
    const closes = s.wins + s.losses;
    s.winRate = closes >= MIN_CLOSES_FOR_WIN_RATE ? r1((s.wins / closes) * 100) : null;
    s.avgTradeUsd = s.trades ? r2(s.volumeUsd / s.trades) : 0;
    const opened = e.longNtl + e.shortNtl;
    if (opened > 0) {
      const longShare = e.longNtl / opened;
      s.direction = longShare >= 0.7 ? "long" : longShare <= 0.3 ? "short" : "mixed";
    }
    s.volumeUsd = r2(s.volumeUsd);
    s.realizedPnl = r2(s.realizedPnl);
    s.fees = r2(s.fees);
    s.first30dPnl = r2(s.realizedPnl - s.fees);
    s.coins = [coin];
    out[coin] = s;
  }
  return out;
}

/**
 * Aggregate per-coin stats into one AssetStats for a group (coin = group name, coins = markets actually traded).
 * Null when the trader touched none of the group's markets. Direction and win rate are recomputed from the
 * merged counts; direction falls back to the dominant member's direction weighted by opened volume.
 */
export function groupStats(perCoin: Record<string, AssetStats>, group: AssetGroup, fills?: CompactFill[]): AssetStats | null {
  const members = ASSET_GROUPS[group].map((c) => perCoin[c]).filter((x): x is AssetStats => !!x);
  if (members.length === 0) return null;
  if (members.length === 1) return { ...members[0], coin: group, coins: [members[0].coin] };
  const g = emptyStats(group);
  g.coins = members.map((m) => m.coin);
  for (const m of members) {
    g.trades += m.trades;
    g.volumeUsd += m.volumeUsd;
    g.realizedPnl += m.realizedPnl;
    g.fees += m.fees;
    g.wins += m.wins;
    g.losses += m.losses;
    if (m.lastTradeAt != null && (g.lastTradeAt == null || m.lastTradeAt > g.lastTradeAt)) g.lastTradeAt = m.lastTradeAt;
  }
  const closes = g.wins + g.losses;
  g.winRate = closes >= MIN_CLOSES_FOR_WIN_RATE ? r1((g.wins / closes) * 100) : null;
  g.avgTradeUsd = g.trades ? r2(g.volumeUsd / g.trades) : 0;
  g.volumeUsd = r2(g.volumeUsd);
  g.realizedPnl = r2(g.realizedPnl);
  g.fees = r2(g.fees);
  g.first30dPnl = r2(g.realizedPnl - g.fees);
  // Direction over the group's open fills when we have them, else the direction of the biggest member.
  const set = new Set(g.coins);
  let longNtl = 0;
  let shortNtl = 0;
  if (fills) {
    for (const f of fills) {
      if (!set.has(f[1])) continue;
      const side = openSide(f[7]);
      if (side === "long") longNtl += f[3] * f[4];
      else if (side === "short") shortNtl += f[3] * f[4];
    }
  }
  if (longNtl + shortNtl > 0) {
    const share = longNtl / (longNtl + shortNtl);
    g.direction = share >= 0.7 ? "long" : share <= 0.3 ? "short" : "mixed";
  } else {
    g.direction = [...members].sort((a, b) => b.volumeUsd - a.volumeUsd)[0].direction;
  }
  return g;
}

/** All group stats present for a trader. */
export function allGroupStats(perCoin: Record<string, AssetStats>, fills?: CompactFill[]): Partial<Record<AssetGroup, AssetStats>> {
  const out: Partial<Record<AssetGroup, AssetStats>> = {};
  for (const g of Object.keys(ASSET_GROUPS) as AssetGroup[]) {
    const s = groupStats(perCoin, g, fills);
    if (s) out[g] = s;
  }
  return out;
}

/** The trader's current position in a group: the largest open position among the group's markets. */
export function positionForGroup(positions: OpenPosition[], group: AssetGroup): OpenPosition | null {
  const set = new Set(ASSET_GROUPS[group]);
  const inGroup = positions.filter((p) => set.has(p.coin));
  if (!inGroup.length) return null;
  return inGroup.sort((a, b) => b.notionalUsd - a.notionalUsd)[0];
}

/** Count of fills inside the four copyable groups. */
export function countCopyableFills(fills: CompactFill[]): number {
  let n = 0;
  for (const f of fills) if (COIN_TO_GROUP[f[1]]) n++;
  return n;
}

const utcDay = (t: number) => Math.floor(t / DAY_MS);

/** Copyable-only fill statistics for the scoring rubric. `equityStart` sizes the notional-based leverage fallback. */
export function copyStats(fills: CompactFill[], equityStart: number): CopyStats {
  const out: CopyStats = { fills: 0, trades: 0, pnlNet: 0, grossWins: 0, grossLosses: 0, wins: 0, losses: 0, topTradeShare: null, activeDays: 0, profitableDaysPct: null, lastFillAt: null, medianNotionalLev: null };
  const days = new Set<number>();
  const dayPnl = new Map<number, number>();
  const openLev: number[] = [];
  let top = 0;
  for (const f of fills) {
    const [time, coin, , px, sz, closedPnl, fee, dir] = f;
    if (!isPerpCoin(coin)) continue;
    const d = utcDay(time);
    dayPnl.set(d, (dayPnl.get(d) ?? 0) + closedPnl);
    if (!COIN_TO_GROUP[coin]) continue;
    out.fills++;
    out.pnlNet += closedPnl - fee;
    days.add(d);
    if (out.lastFillAt == null || time > out.lastFillAt) out.lastFillAt = time;
    if (isClose(dir) && closedPnl !== 0) {
      out.trades++;
      if (closedPnl > 0) {
        out.wins++;
        out.grossWins += closedPnl;
        if (closedPnl > top) top = closedPnl;
      } else {
        out.losses++;
        out.grossLosses += -closedPnl;
      }
    }
    if (openSide(dir) && equityStart > 0) openLev.push((px * sz) / equityStart);
  }
  out.pnlNet = r2(out.pnlNet);
  out.grossWins = r2(out.grossWins);
  out.grossLosses = r2(out.grossLosses);
  out.topTradeShare = out.grossWins > 0 ? Math.round((top / out.grossWins) * 1000) / 1000 : null;
  out.activeDays = days.size;
  if (dayPnl.size) {
    let prof = 0;
    for (const v of dayPnl.values()) if (v > 0) prof++;
    out.profitableDaysPct = r1((prof / dayPnl.size) * 100);
  }
  if (openLev.length) {
    openLev.sort((a, b) => a - b);
    const mid = Math.floor(openLev.length / 2);
    out.medianNotionalLev = r2(openLev.length % 2 ? openLev[mid] : (openLev[mid - 1] + openLev[mid]) / 2);
  }
  return out;
}

/**
 * When the current position in `coin` was opened: the newest fill that started from flat (startPosition 0) or
 * flipped sides. Null when the open lies outside the cached fills.
 */
export function openedAtFromFills(fills: CompactFill[], coin: string, side: "long" | "short"): number | null {
  let best: number | null = null;
  for (const f of fills) {
    if (f[1] !== coin) continue;
    const dir = f[7];
    const fromFlat = f[8] === 0 && openSide(dir) === side;
    const flipped = (side === "short" && dir === "Long > Short") || (side === "long" && dir === "Short > Long");
    if ((fromFlat || flipped) && (best == null || f[0] > best)) best = f[0];
  }
  return best;
}

export function mapPosition(p: HlPosition, fills: CompactFill[] = []): OpenPosition | null {
  const szi = num(p.szi);
  if (szi === 0) return null;
  const side: "long" | "short" = szi > 0 ? "long" : "short";
  const size = Math.abs(szi);
  const notionalUsd = num(p.positionValue);
  const liq = p.liquidationPx == null ? null : num(p.liquidationPx);
  return {
    coin: p.coin,
    side,
    size,
    notionalUsd: r2(notionalUsd),
    entryPx: num(p.entryPx),
    markPx: size > 0 ? notionalUsd / size : 0,
    liqPx: liq && liq > 0 ? liq : null,
    leverage: num(p.leverage?.value),
    leverageType: p.leverage?.type === "isolated" ? "isolated" : "cross",
    marginUsed: r2(num(p.marginUsed)),
    unrealizedPnl: r2(num(p.unrealizedPnl)),
    roe: r2(num(p.returnOnEquity) * 100),
    fundingPaid: r2(num(p.cumFunding?.sinceOpen)),
    openedAt: openedAtFromFills(fills, p.coin, side),
  };
}

/** Positions from one or several clearinghouse states (main + each builder dex), largest notional first. */
export function mapPositions(state: HlClearinghouseState | null | (HlClearinghouseState | null)[], fills: CompactFill[] = []): OpenPosition[] {
  const states = Array.isArray(state) ? state : [state];
  const out: OpenPosition[] = [];
  const seen = new Set<string>();
  for (const st of states) {
    if (!st || !Array.isArray(st.assetPositions)) continue;
    for (const ap of st.assetPositions) {
      const p = ap?.position;
      if (!p || seen.has(p.coin)) continue;
      const m = mapPosition(p, fills);
      if (m) {
        out.push(m);
        seen.add(p.coin);
      }
    }
  }
  return out.sort((a, b) => b.notionalUsd - a.notionalUsd);
}

/** Account value across the main clearinghouse and the builder dexes (each dex has its own margin account). */
export function totalEquity(states: (HlClearinghouseState | null)[]): number | null {
  let sum = 0;
  let any = false;
  for (const st of states) {
    if (!st) continue;
    any = true;
    sum += num(st.marginSummary?.accountValue);
  }
  return any ? sum : null;
}

export function summarizeOpen(positions: OpenPosition[]): OpenSummary {
  return {
    count: positions.length,
    coins: positions.map((p) => p.coin),
    notionalUsd: r2(positions.reduce((s, p) => s + p.notionalUsd, 0)),
    unrealizedPnl: r2(positions.reduce((s, p) => s + p.unrealizedPnl, 0)),
  };
}

export function toTrade(f: CompactFill): Trade {
  const [time, coin, side, px, sz, closedPnl, fee, dir, , hash] = f;
  return { time, coin, side: side === "B" ? "buy" : "sell", dir, px, size: sz, notionalUsd: r2(px * sz), closedPnl, fee, hash };
}

/** Newest-first list of the last `limit` perp fills as contract Trades, optionally filtered to one coin. */
export function recentTrades(fills: CompactFill[], limit = 100, coin?: string): Trade[] {
  const out: Trade[] = [];
  const sorted = [...fills].sort((a, b) => b[0] - a[0]);
  for (const f of sorted) {
    if (!isPerpCoin(f[1])) continue;
    if (coin && f[1] !== coin) continue;
    out.push(toTrade(f));
    if (out.length >= limit) break;
  }
  return out;
}
