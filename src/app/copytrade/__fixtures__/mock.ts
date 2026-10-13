// Deterministic fixture matching CONTRACT.md "COPY TRADE". Used only in development behind ?mock=1.
import type { Asset, AssetStats, LeaderboardResponse, OpenPosition, SortKey, Trade, TraderDetail, TraderRow, Window } from "../types"

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
]
const NAMES: (string | null)[] = ["hyperwhale", null, "adamaxi", null, null, "quietshort", null, "btc_only", null, null, "vol_harvester", null]

const PX: Record<string, number> = { BTC: 118_420, ADA: 0.842, ETH: 4_210, SOL: 196.4 }

function assetStats(coin: string, r: () => number, i: number): AssetStats {
  const trades = Math.round(6 + r() * 180)
  const wins = Math.round(trades * (0.35 + r() * 0.4))
  const losses = trades - wins
  const volumeUsd = Math.round((50_000 + r() * 40_000_000) * (coin === "ADA" ? 0.25 : 1))
  const realizedPnl = Math.round((r() - 0.3) * volumeUsd * 0.02)
  const dirRoll = r()
  // Row 3: no last trade; row 5: unknown direction; row 9: fewer than 5 trades (neutral win rate tone).
  const small = i === 9
  const tr = small ? 3 : trades
  const w = small ? 2 : wins
  return {
    coin,
    trades: tr,
    volumeUsd,
    realizedPnl,
    fees: Math.round(volumeUsd * 0.00035),
    winRate: Math.round((w / tr) * 1000) / 10,
    wins: w,
    losses: small ? 1 : losses,
    avgTradeUsd: Math.round(volumeUsd / tr),
    lastTradeAt: i === 3 ? null : NOW - Math.round(r() * 3 * D),
    direction: i === 5 ? null : dirRoll < 0.45 ? "long" : dirRoll < 0.75 ? "short" : "mixed",
    first30dPnl: Math.round(realizedPnl * (0.4 + r() * 0.8)),
  }
}

function position(coin: string, side: "long" | "short", r: () => number, isolated = false): OpenPosition {
  const px = PX[coin]
  const size = coin === "BTC" ? Math.round((0.2 + r() * 12) * 1000) / 1000 : Math.round(50_000 + r() * 2_000_000)
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

type Seed = TraderRow & { _btc: AssetStats; _ada: AssetStats; _positions: OpenPosition[] }

function buildTrader(i: number): Seed {
  const r = rng(1000 + i * 97)
  const equity = Math.round(80_000 + r() * 12_000_000)
  const btc = assetStats("BTC", r, i)
  const ada = assetStats("ADA", r, i)
  const positions: OpenPosition[] = []
  if (r() < 0.7) positions.push(position("BTC", r() < 0.6 ? "long" : "short", r, i % 4 === 1))
  if (r() < 0.5) positions.push(position("ADA", r() < 0.5 ? "long" : "short", r))
  if (r() < 0.3) positions.push(position("ETH", "long", r))
  const monthPnl = Math.round((r() - 0.25) * equity * 0.3)
  return {
    address: ADDRS[i],
    displayName: NAMES[i],
    rank: 0,
    equity,
    window: { pnl: monthPnl, roi: Math.round((monthPnl / equity) * 1000) / 10, volume: btc.volumeUsd + ada.volumeUsd + Math.round(r() * 5_000_000) },
    asset: null,
    open: { count: positions.length, coins: positions.map((p) => p.coin), notionalUsd: positions.reduce((s, p) => s + p.notionalUsd, 0), unrealizedPnl: positions.reduce((s, p) => s + p.unrealizedPnl, 0) },
    openForAsset: null,
    _btc: btc,
    _ada: ada,
    _positions: positions,
  }
}

const TRADERS = ADDRS.map((_, i) => buildTrader(i))

const windowScale: Record<Window, number> = { day: 0.06, week: 0.3, month: 1, allTime: 4.2 }

export function mockLeaderboard(asset: Asset, window: Window, sort: SortKey, minVolume: number): LeaderboardResponse {
  const scale = windowScale[window]
  let rows: TraderRow[] = TRADERS.map((t) => {
    const a = asset === "BTC" ? t._btc : asset === "ADA" ? t._ada : null
    const openForAsset = asset === "ALL" ? null : (t._positions.find((p) => p.coin === asset) ?? null)
    return {
      address: t.address,
      displayName: t.displayName,
      rank: 0,
      equity: t.equity,
      window: { pnl: Math.round(t.window.pnl * scale), roi: Math.round(t.window.roi * scale * 10) / 10, volume: Math.round(t.window.volume * scale) },
      asset: a,
      open: t.open,
      openForAsset,
    }
  })
  rows = rows.filter((x) => (asset === "ALL" ? x.window.volume : (x.asset?.volumeUsd ?? 0)) >= minVolume)
  const key = (x: TraderRow) => {
    switch (sort) {
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
    }
  }
  rows.sort((a, b) => key(b) - key(a))
  rows.forEach((x, i) => (x.rank = i + 1))
  return {
    asOf: NOW,
    scan: { candidates: 412, scanned: 388, lastFullScanAt: NOW - 14 * 60_000, nextScanAt: NOW + 46 * 60_000, stale: false },
    assets: ["BTC", "ADA"],
    traders: rows,
  }
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
  const coins = ["BTC", "ADA", "BTC", "BTC", "ETH", "ADA", "SOL"]
  for (let i = 0; i < 100; i++) {
    const coin = coins[Math.floor(r() * coins.length)]
    const px = PX[coin] * (1 + (r() - 0.5) * 0.03)
    const size = coin === "BTC" ? Math.round(r() * 3000) / 1000 : coin === "ETH" ? Math.round(r() * 400) / 10 : Math.round(r() * 400_000)
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
    recentTrades: asset === "ALL" ? all : all.filter((x) => x.coin === asset),
    perAsset: { BTC: t._btc, ADA: t._ada, ETH: null },
    links: { hyperliquid: `https://app.hyperliquid.xyz/explorer/address/${t.address}` },
  }
}
