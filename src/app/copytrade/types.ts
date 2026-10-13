// Copy Trade API contract (CONTRACT.md "COPY TRADE"). All numbers are numbers, all times epoch ms.

export type Asset = "BTC" | "ADA" | "ALL"
export type Window = "day" | "week" | "month" | "allTime"
export type SortKey = "assetPnl" | "roi" | "winRate" | "volume" | "equity"
export type Direction = "long" | "short" | "mixed"

export interface WindowStats {
  pnl: number
  roi: number
  volume: number
}

export interface AssetStats {
  coin: string
  trades: number
  volumeUsd: number
  realizedPnl: number
  fees: number
  winRate: number | null
  wins: number
  losses: number
  avgTradeUsd: number
  lastTradeAt: number | null
  direction: Direction | null
  first30dPnl: number
}

export interface OpenPosition {
  coin: string
  side: "long" | "short"
  size: number
  notionalUsd: number
  entryPx: number
  markPx: number
  liqPx: number | null
  leverage: number
  leverageType: "cross" | "isolated"
  marginUsed: number
  unrealizedPnl: number
  roe: number
  fundingPaid: number
  openedAt: number | null
}

export interface TraderRow {
  address: string
  displayName: string | null
  rank: number
  equity: number
  window: WindowStats
  asset: AssetStats | null
  open: { count: number; coins: string[]; notionalUsd: number; unrealizedPnl: number }
  openForAsset: OpenPosition | null
}

export interface ScanStatus {
  candidates: number
  scanned: number
  lastFullScanAt: number | null
  nextScanAt: number | null
  stale: boolean
}

export interface LeaderboardResponse {
  asOf: number
  scan: ScanStatus
  assets: string[]
  traders: TraderRow[]
}

export interface Trade {
  time: number
  coin: string
  side: "buy" | "sell"
  dir: string
  px: number
  size: number
  notionalUsd: number
  closedPnl: number
  fee: number
  hash: string
}

export interface TraderDetail {
  asOf: number
  address: string
  displayName: string | null
  equity: number
  withdrawable: number
  windows: Record<Window, WindowStats>
  pnlHistory: { month: [number, number][]; allTime: [number, number][] }
  openPositions: OpenPosition[]
  recentTrades: Trade[]
  perAsset: Record<string, AssetStats | null>
  links: { hyperliquid: string }
}
