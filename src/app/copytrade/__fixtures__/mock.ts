// Deterministic fixture matching CONTRACT.md "COPY TRADE" plus amendments 1 and 2. Development only, behind ?mock=1.
import type { Asset, AssetGroup, AssetStats, Grade, LeaderboardResponse, Mix, OpenPosition, Score, SortKey, Stats30d, SummaryResponse, Trade, TraderDetail, TraderRow, Window } from "../types"
import { ASSET_GROUPS } from "../types"

const NOW = 1791907200000 // 2026-10-13 16:00 UTC
const H = 3600_000
const D = 24 * H

// Small LCG so every render gets the same numbers.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const ADDRS = [
  "0x5b5d51203a0f9079f8aeb098a6523a13f298c060",
  "0x2d9b2f1e9a7a44a7b9e3c1cbe2d7d0f4b45a3c8e",
  "0x9f3c2b7a1e5d4c6b8a0f2e1d3c4b5a69788f6e5d",
  "0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d",
  "0xe7d6c5b4a3928170f6e5d4c3b2a1908f7e6d5c4b",
  "0x4c3b2a1908f7e6d5c4b3a29181706f5e4d3c2b1a",
  "0xaa11bb22cc33dd44ee55ff6677889900aabbccdd",
  "0x0f1e2d3c4b5a69788f6e5d4c3b2a1908f7e6d5c4",
  "0x7777888899990000aaaabbbbccccddddeeeeffff",
  "0x1234567890abcdef1234567890abcdef12345678",
  "0xdeadbeef00000000000000000000000000000001",
  "0xcafebabe00000000000000000000000000000002",
  "0x9999aaaabbbbccccddddeeeeffff000011112222",
  "0x3333444455556666777788889999aaaabbbbcccc",
]
const NAMES: (string | null)[] = ["hyperwhale", null, "adamaxi", null, null, "quietshort", null, "btc_only", null, null, "vol_harvester", null, "goldbug", null]

const GROUP_COINS: Record<AssetGroup, string[]> = { BTC: ["BTC"], ADA: ["ADA"], GOLD: ["xyz:GOLD", "km:GOLD", "PAXG"], WTI: ["xyz:CL", "km:USOIL", "xyz:BRENTOIL"] }
const PX: Record<string, number> = { BTC: 118_420, ADA: 0.842, "xyz:GOLD": 4_062, "km:GOLD": 4_060, PAXG: 4_058, "xyz:CL": 61.4, "km:USOIL": 61.3, "xyz:BRENTOIL": 65.1, ETH: 4_210, SOL: 196.4 }
const GROUP_SCALE: Record<AssetGroup, number> = { BTC: 1, ADA: 0.25, GOLD: 0.4, WTI: 0.3 }

function assetStats(group: AssetGroup, r: () => number, i: number): AssetStats | null {
  // Some wallets never touch a group: null so the UI exercises its fallbacks.
  if (r() < 0.2 && !(group === "BTC" && i < 4)) return null
  const trades = Math.round(6 + r() * 180)
  const wins = Math.round(trades * (0.35 + r() * 0.4))
  const losses = trades - wins
  const volumeUsd = Math.round((50_000 + r() * 40_000_000) * GROUP_SCALE[group])
  const realizedPnl = Math.round((r() - 0.3) * volumeUsd * 0.02)
  const dirRoll = r()
  const small = i === 9 && group === "BTC"
  const tr = small ? 3 : trades
  const w = small ? 2 : wins
  const coins = GROUP_COINS[group].filter((_, k) => k === 0 || r() < 0.35)
  return {
    coin: group,
    coins,
    trades: tr,
    volumeUsd,
    realizedPnl,
    fees: Math.round(volumeUsd * 0.00035),
    winRate: Math.round((w / tr) * 1000) / 10,
    wins: w,
    losses: small ? 1 : losses,
    avgTradeUsd: Math.round(volumeUsd / tr),
    lastTradeAt: i === 3 && group === "BTC" ? null : NOW - Math.round(r() * 3 * D),
    direction: i === 5 ? null : dirRoll < 0.45 ? "long" : dirRoll < 0.75 ? "short" : "mixed",
    first30dPnl: Math.round(realizedPnl * (0.4 + r() * 0.8)),
  }
}

function position(coin: string, side: "long" | "short", r: () => number, isolated = false): OpenPosition {
  const px = PX[coin]
  const size = coin === "BTC" ? Math.round((0.2 + r() * 12) * 1000) / 1000 : coin === "ADA" ? Math.round(50_000 + r() * 2_000_000) : Math.round((5 + r() * 400) * 10) / 10
  const entryPx = px * (1 + (r() - 0.5) * 0.04)
  const notionalUsd = size * px
  const lev = [3, 5, 10, 20][Math.floor(r() * 4)]
  const unrealizedPnl = (side === "long" ? px - entryPx : entryPx - px) * size
  const marginUsed = notionalUsd / lev
  return {
    coin,
    side,
    size,
    notionalUsd: Math.round(notionalUsd),
    entryPx,
    markPx: px,
    liqPx: lev >= 20 && r() < 0.5 ? null : side === "long" ? entryPx * (1 - 0.9 / lev) : entryPx * (1 + 0.9 / lev),
    leverage: lev,
    leverageType: isolated ? "isolated" : "cross",
    marginUsed: Math.round(marginUsed),
    unrealizedPnl: Math.round(unrealizedPnl),
    roe: Math.round((unrealizedPnl / marginUsed) * 1000) / 10,
    fundingPaid: Math.round((r() - 0.5) * notionalUsd * 0.002),
    openedAt: r() < 0.2 ? null : NOW - Math.round(r() * 5 * D),
  }
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

function buildMix(groups: Record<AssetGroup, AssetStats | null>, otherVol: number, otherTrades: number): Mix {
  const vols = ASSET_GROUPS.map((g) => groups[g]?.volumeUsd ?? 0)
  const trs = ASSET_GROUPS.map((g) => groups[g]?.trades ?? 0)
  const totalVol = vols.reduce((s, v) => s + v, 0) + otherVol
  const totalTr = trs.reduce((s, v) => s + v, 0) + otherTrades
  const byAsset = {} as Mix["byAsset"]
  ASSET_GROUPS.forEach((g, i) => {
    byAsset[g] = { volumeUsd: vols[i], trades: trs[i], sharePct: totalVol ? Math.round((vols[i] / totalVol) * 1000) / 10 : 0 }
  })
  byAsset.OTHER = { volumeUsd: otherVol, trades: otherTrades, sharePct: totalVol ? Math.round((otherVol / totalVol) * 1000) / 10 : 0 }
  const topCoins = [
    ...ASSET_GROUPS.flatMap((g) => (groups[g]?.coins ?? []).map((c, k) => ({ coin: c, sharePct: Math.round(byAsset[g].sharePct / (k + 1) * 10) / 10 }))),
    { coin: "ETH", sharePct: Math.round(byAsset.OTHER.sharePct * 0.7 * 10) / 10 },
    { coin: "SOL", sharePct: Math.round(byAsset.OTHER.sharePct * 0.3 * 10) / 10 },
  ]
    .filter((c) => c.sharePct > 0)
    .sort((a, b) => b.sharePct - a.sharePct)
    .slice(0, 5)
  return {
    copyableSharePct: totalVol ? Math.round(((totalVol - otherVol) / totalVol) * 1000) / 10 : 0,
    copyableTradeSharePct: totalTr ? Math.round(((totalTr - otherTrades) / totalTr) * 1000) / 10 : 0,
    byAsset,
    topCoins,
  }
}

function buildScore(mix: Mix, stats: Stats30d, groups: Record<AssetGroup, AssetStats | null>, r: () => number): Score {
  const focus = clamp(mix.copyableSharePct)
  const wr = ASSET_GROUPS.reduce((s, g) => s + (groups[g]?.winRate ?? 0) * (groups[g]?.trades ?? 0), 0) / Math.max(1, ASSET_GROUPS.reduce((s, g) => s + (groups[g]?.trades ?? 0), 0))
  const success = clamp((stats.pnlCopyable > 0 ? 55 : 25) + (wr - 50) * 0.8 + r() * 15)
  const activity = clamp(Math.min(100, stats.tradesPerDay * 18) + r() * 10)
  const consistency = clamp(stats.profitableWeeksPct ?? 40)
  const risk = clamp(100 - (stats.maxDrawdownPct ?? 20) * 2.5 - ((stats.medianLeverage ?? 5) - 5) * 3)
  const blend = success * 0.35 + activity * 0.2 + focus * 0.2 + consistency * 0.15 + risk * 0.1
  const copyability = clamp(focus < 50 ? blend * (focus / 50) : blend)
  const grade: Grade = copyability >= 75 ? "A" : copyability >= 55 ? "B" : copyability >= 35 ? "C" : "D"
  const reasons: string[] = []
  reasons.push(focus >= 70 ? `${focus}% of 30d volume in BTC, ADA, GOLD or WTI` : `Only ${focus}% of volume in copyable markets`)
  reasons.push(stats.pnlCopyable > 0 ? `Realized +$${Math.round(stats.pnlCopyable / 1000)}k in copyable markets over 30d` : `Lost $${Math.round(-stats.pnlCopyable / 1000)}k in copyable markets over 30d`)
  reasons.push(`${stats.tradesPerDay.toFixed(1)} trades per day`)
  if (stats.maxDrawdownPct != null) reasons.push(`Max drawdown ${stats.maxDrawdownPct.toFixed(1)}%${stats.maxDrawdownPct > 25 ? " (deep)" : ""}`)
  if (stats.medianLeverage != null && stats.medianLeverage >= 10) reasons.push(`Median leverage ${stats.medianLeverage}x`)
  if (stats.profitableWeeksPct != null) reasons.push(`${Math.round(stats.profitableWeeksPct)}% of weeks profitable`)
  return { copyability, success, activity, focus, consistency, risk, grade, reasons }
}

type Seed = TraderRow & { _groups: Record<AssetGroup, AssetStats | null>; _positions: OpenPosition[] }

function buildTrader(i: number): Seed {
  const r = rng(1000 + i * 97)
  const equity = Math.round(80_000 + r() * 12_000_000)
  const groups = { BTC: assetStats("BTC", r, i), ADA: assetStats("ADA", r, i), GOLD: assetStats("GOLD", r, i), WTI: assetStats("WTI", r, i) }
  const positions: OpenPosition[] = []
  if (groups.BTC && r() < 0.7) positions.push(position("BTC", r() < 0.6 ? "long" : "short", r, i % 4 === 1))
  if (groups.ADA && r() < 0.5) positions.push(position("ADA", r() < 0.5 ? "long" : "short", r))
  if (groups.GOLD && r() < 0.5) positions.push(position(groups.GOLD.coins?.[0] ?? "xyz:GOLD", "long", r))
  if (groups.WTI && r() < 0.4) positions.push(position(groups.WTI.coins?.[0] ?? "xyz:CL", r() < 0.5 ? "long" : "short", r))
  if (r() < 0.35) positions.push(position("ETH", "long", r))
  // Wallets 1, 4 and 11 are mostly "other" so the copyable lens has something to hide.
  const otherVol = Math.round(r() * (i === 1 || i === 4 || i === 11 ? 60_000_000 : 6_000_000))
  const otherTrades = Math.round(otherVol / 150_000)
  const mix = buildMix(groups, otherVol, otherTrades)
  const copyTrades = ASSET_GROUPS.reduce((s, g) => s + (groups[g]?.trades ?? 0), 0)
  const pnlCopyable = ASSET_GROUPS.reduce((s, g) => s + (groups[g]?.realizedPnl ?? 0), 0)
  const stats: Stats30d = {
    tradesPerDay: Math.round(((copyTrades + otherTrades) / 30) * 10) / 10,
    avgHoldMin: i === 6 ? null : Math.round(30 + r() * 2000),
    medianLeverage: i === 2 ? null : [3, 5, 5, 10, 20][Math.floor(r() * 5)],
    maxDrawdownPct: i === 7 ? null : Math.round(r() * 40 * 10) / 10,
    profitableWeeksPct: i === 7 ? null : Math.round(r() * 100),
    pnlCopyable,
    pnlOther: Math.round((r() - 0.4) * otherVol * 0.015),
  }
  if (i === 7) mix.topCoins = [{ coin: "#106090", sharePct: 12.4, label: "Outcome: BTC price binary (90s) · Yes" }, ...mix.topCoins.slice(0, 4)]
  const score = buildScore(mix, stats, groups, r)
  if (i === 9) Object.assign(score, { thin: true, consistency: null, risk: null, reasons: ["Thin sample: under 20 copyable fills", ...score.reasons.slice(0, 3)] })
  const monthPnl = pnlCopyable + stats.pnlOther
  const volume = ASSET_GROUPS.reduce((s, g) => s + (groups[g]?.volumeUsd ?? 0), 0) + otherVol
  return {
    address: ADDRS[i],
    displayName: NAMES[i],
    rank: 0,
    equity,
    window: { pnl: monthPnl, roi: Math.round((monthPnl / equity) * 1000) / 10, volume },
    asset: null,
    open: { count: positions.length, coins: positions.map((p) => p.coin), notionalUsd: positions.reduce((s, p) => s + p.notionalUsd, 0), unrealizedPnl: positions.reduce((s, p) => s + p.unrealizedPnl, 0) },
    openForAsset: null,
    mix: i === 12 ? null : mix,
    score: i === 12 ? null : score,
    stats30d: i === 12 ? null : stats,
    _groups: groups,
    _positions: positions,
  }
}

const TRADERS = ADDRS.map((_, i) => buildTrader(i))

const windowScale: Record<Window, number> = { day: 0.06, week: 0.3, month: 1, allTime: 4.2 }

function rowFor(t: Seed, asset: Asset, window: Window): TraderRow {
  const scale = windowScale[window]
  const a = asset === "ALL" ? null : t._groups[asset]
  const coins = asset === "ALL" ? [] : GROUP_COINS[asset]
  const openForAsset = asset === "ALL" ? null : (t._positions.find((p) => coins.includes(p.coin)) ?? null)
  return {
    address: t.address,
    displayName: t.displayName,
    rank: 0,
    equity: t.equity,
    window: { pnl: Math.round(t.window.pnl * scale), roi: Math.round(t.window.roi * scale * 10) / 10, volume: Math.round(t.window.volume * scale) },
    asset: a,
    open: t.open,
    openForAsset,
    mix: t.mix,
    score: t.score,
    stats30d: t.stats30d,
  }
}

export function sortValueFor(x: TraderRow, sort: SortKey): number {
  switch (sort) {
    case "copyability":
      return x.score?.copyability ?? -1
    case "assetPnl":
      return x.asset ? x.asset.realizedPnl : x.window.pnl
    case "roi":
      return x.window.roi
    case "winRate":
      return x.asset?.winRate ?? -1
    case "volume":
      return x.asset ? x.asset.volumeUsd : x.window.volume
    case "equity":
      return x.equity
    case "focus":
      return x.score?.focus ?? x.mix?.copyableSharePct ?? -1
    case "activity":
      return x.score?.activity ?? x.stats30d?.tradesPerDay ?? -1
  }
}

const SCAN = { candidates: 1512, scanned: 1388, lastFullScanAt: NOW - 14 * 60_000, nextScanAt: NOW + 46 * 60_000, stale: false, perAsset: { BTC: 611, ADA: 203, GOLD: 97, WTI: 64 }, pool: { size: 1112, probed: 988, remaining: 124, discovered: 231 } }

export function mockLeaderboard(asset: Asset, window: Window, sort: SortKey, minVolume: number, copyableOnly: boolean, minFocus: number, openOnly = false): LeaderboardResponse {
  let rows = TRADERS.map((t) => rowFor(t, asset, window))
  rows = rows.filter((x) => (asset === "ALL" ? x.window.volume : (x.asset?.volumeUsd ?? 0)) >= minVolume)
  if (asset !== "ALL") rows = rows.filter((x) => x.asset != null)
  if (copyableOnly) rows = rows.filter((x) => (x.mix?.copyableSharePct ?? 0) >= minFocus)
  if (openOnly) rows = rows.filter((x) => (asset === "ALL" ? x.open.count > 0 : x.openForAsset != null))
  rows.sort((a, b) => sortValueFor(b, sort) - sortValueFor(a, sort) || (b.asset?.winRate ?? 0) - (a.asset?.winRate ?? 0))
  rows.forEach((x, i) => (x.rank = i + 1))
  return { asOf: NOW, scan: SCAN, assets: [...ASSET_GROUPS], traders: rows }
}

export function mockSummary(window: Window): SummaryResponse {
  const top: SummaryResponse["top"] = {}
  for (const g of ASSET_GROUPS) {
    const rows = TRADERS.map((t) => rowFor(t, g, window))
      .filter((x) => x.asset != null)
      .sort((a, b) => (b.score?.copyability ?? -1) - (a.score?.copyability ?? -1) || (b.asset?.realizedPnl ?? 0) - (a.asset?.realizedPnl ?? 0))
      .slice(0, 5)
    rows.forEach((x, i) => (x.rank = i + 1))
    top[g] = rows
  }
  const copyable = TRADERS.map((t) => rowFor(t, "ALL", window))
    .filter((x) => (x.mix?.copyableSharePct ?? 0) >= 70)
    .sort((a, b) => (b.score?.copyability ?? -1) - (a.score?.copyability ?? -1))
    .slice(0, 10)
  copyable.forEach((x, i) => (x.rank = i + 1))
  top.COPYABLE = copyable
  return { asOf: NOW, scan: SCAN, top }
}

function history(r: () => number, points: number, step: number, endPnl: number): [number, number][] {
  const out: [number, number][] = []
  let v = 0
  for (let i = 0; i < points; i++) {
    v += (r() - 0.45) * Math.abs(endPnl) * 0.12
    out.push([NOW - (points - 1 - i) * step, Math.round(v)])
  }
  const shift = endPnl - (out[out.length - 1]?.[1] ?? 0)
  return out.map(([t, p], i) => [t, Math.round(p + shift * (i / (points - 1)))])
}

function trades(t: Seed, r: () => number): Trade[] {
  const out: Trade[] = []
  const coins = ["BTC", "ADA", "BTC", "BTC", "ETH", "ADA", "SOL", "xyz:GOLD", "xyz:CL", "PAXG"]
  for (let i = 0; i < 100; i++) {
    const coin = coins[Math.floor(r() * coins.length)]
    const px = PX[coin] * (1 + (r() - 0.5) * 0.03)
    const size = coin === "BTC" ? Math.round(r() * 3000) / 1000 : coin === "ETH" ? Math.round(r() * 400) / 10 : coin === "ADA" ? Math.round(r() * 400_000) : Math.round(r() * 2000) / 10
    const open = r() < 0.5
    const long = r() < 0.55
    const dir = open ? (long ? "Open Long" : "Open Short") : long ? "Close Long" : "Close Short"
    const notionalUsd = size * px
    out.push({
      time: NOW - Math.round(i * 2.1 * H + r() * H),
      coin,
      side: (open ? long : !long) ? "buy" : "sell",
      dir,
      px,
      size,
      notionalUsd: Math.round(notionalUsd),
      closedPnl: open ? 0 : Math.round((r() - 0.4) * notionalUsd * 0.03),
      fee: Math.round(notionalUsd * 0.00035 * 100) / 100,
      hash: `0x${(t.address.slice(2, 10) + i.toString(16).padStart(4, "0")).padEnd(64, "a")}`,
    })
  }
  return out
}

export function mockTrader(address: string, asset: Asset): TraderDetail | null {
  const t = TRADERS.find((x) => x.address.toLowerCase() === address.toLowerCase())
  if (!t) return null
  const r = rng(77 + ADDRS.indexOf(t.address))
  const all = trades(t, r)
  const monthPnl = t.window.pnl
  const coins = asset === "ALL" ? null : GROUP_COINS[asset]
  return {
    asOf: NOW,
    address: t.address,
    displayName: t.displayName,
    equity: t.equity,
    withdrawable: Math.round(t.equity * 0.62),
    windows: {
      day: { pnl: Math.round(monthPnl * 0.06), roi: Math.round(t.window.roi * 0.06 * 10) / 10, volume: Math.round(t.window.volume * 0.06) },
      week: { pnl: Math.round(monthPnl * 0.3), roi: Math.round(t.window.roi * 0.3 * 10) / 10, volume: Math.round(t.window.volume * 0.3) },
      month: { pnl: monthPnl, roi: t.window.roi, volume: t.window.volume },
      allTime: { pnl: Math.round(monthPnl * 4.2), roi: Math.round(t.window.roi * 4.2 * 10) / 10, volume: Math.round(t.window.volume * 4.2) },
    },
    pnlHistory: { month: history(r, 30, D, monthPnl), allTime: history(r, 52, 7 * D, Math.round(monthPnl * 4.2)) },
    openPositions: t._positions,
    recentTrades: coins ? all.filter((x) => coins.includes(x.coin)) : all,
    perAsset: { ...t._groups, ETH: null },
    links: { hyperliquid: `https://app.hyperliquid.xyz/explorer/address/${t.address}` },
    mix: t.mix,
    score: t.score,
    stats30d: t.stats30d,
  }
}
