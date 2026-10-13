// Copy Trade API contract (CONTRACT.md "COPY TRADE" + amendments 1 and 2). All numbers are numbers, all times epoch ms.

export type AssetGroup = "BTC" | "ADA" | "GOLD" | "WTI"
export type Asset = AssetGroup | "ALL"
export type Window = "day" | "week" | "month" | "allTime"
export type SortKey = "copyability" | "assetPnl" | "roi" | "winRate" | "volume" | "equity" | "focus" | "activity"
export type Direction = "long" | "short" | "mixed"
export type Grade = "A" | "B" | "C" | "D"

export const ASSET_GROUPS: AssetGroup[] = ["BTC", "ADA", "GOLD", "WTI"]

export interface WindowStats {
  pnl: number
  roi: number
  volume: number
}

export interface AssetStats {
  /** Group name (BTC, ADA, GOLD, WTI). */
  coin: string
  /** Underlying Hyperliquid markets traded inside the group, e.g. ["xyz:GOLD", "PAXG"]. */
  coins?: string[]
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

export interface MixSlice {
  volumeUsd: number
  trades: number
  sharePct: number
}

export interface Mix {
  copyableSharePct: number
  copyableTradeSharePct: number
  byAsset: Record<AssetGroup | "OTHER", MixSlice>
  topCoins: { coin: string; sharePct: number }[]
}

export interface Score {
  copyability: number
  success: number | null
  activity: number | null
  focus: number | null
  consistency: number | null
  risk: number | null
  grade: Grade
  /** Rubric 2.4: true when null sub-scores were substituted; render the chip hollow and the bars hatched. */
  thin?: boolean
  reasons: string[]
}

export interface Stats30d {
  tradesPerDay: number
  avgHoldMin: number | null
  medianLeverage: number | null
  maxDrawdownPct: number | null
  profitableWeeksPct: number | null
  pnlCopyable: number
  pnlOther: number
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
  // Amendment 2. Typed as optional so a backend that has not shipped them yet still renders (with dashes).
  mix?: Mix | null
  score?: Score | null
  stats30d?: Stats30d | null
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

export type SummaryKey = AssetGroup | "COPYABLE"

export interface SummaryResponse {
  asOf: number
  scan: ScanStatus
  top: Partial<Record<SummaryKey, TraderRow[]>>
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
  mix?: Mix | null
  score?: Score | null
  stats30d?: Stats30d | null
}
