// Shared types for the Hyperliquid copy-trade backend. The API shapes mirror the COPY TRADE section of
// wt/CONTRACT.md exactly; everything else is internal.

// ── Raw Hyperliquid payloads (numbers arrive as strings) ─────────────────────

export interface HlWindowPerf {
  pnl: string;
  roi: string;
  vlm: string;
}

export interface HlLeaderboardRow {
  ethAddress: string;
  accountValue: string;
  windowPerformances: [string, HlWindowPerf][];
  prize: number;
  displayName: string | null;
}

export interface HlFill {
  coin: string;
  px: string;
  sz: string;
  side: "B" | "A";
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
  feeToken?: string;
}

export interface HlPosition {
  coin: string;
  szi: string;
  leverage: { type: "cross" | "isolated"; value: number };
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  marginUsed: string;
  maxLeverage?: number;
  cumFunding: { allTime: string; sinceOpen: string; sinceChange: string };
}

export interface HlClearinghouseState {
  marginSummary: { accountValue: string; totalNtlPos: string; totalRawUsd: string; totalMarginUsed: string };
  crossMarginSummary?: { accountValue: string; totalNtlPos: string; totalRawUsd: string; totalMarginUsed: string };
  withdrawable: string;
  assetPositions: { type: string; position: HlPosition }[];
}

export type HlPortfolio = [string, { accountValueHistory: [number, string][]; pnlHistory: [number, string][]; vlm: string }][];

// ── Parsed / internal ────────────────────────────────────────────────────────

export type Window = "day" | "week" | "month" | "allTime";
export const WINDOWS: Window[] = ["day", "week", "month", "allTime"];

export interface WindowPerf {
  pnl: number;
  /** Percent (12.5 = 12.5%). */
  roi: number;
  volume: number;
}

export interface LeaderRow {
  address: string;
  displayName: string | null;
  equity: number;
  windows: Record<Window, WindowPerf>;
}

/** Compact fill kept on disk per trader: [time, coin, side, px, sz, closedPnl, fee, dir, startPosition, hash, tid]. */
export type CompactFill = [number, string, "B" | "A", number, number, number, number, string, number, string, number];

// ── API contract ─────────────────────────────────────────────────────────────

export interface AssetStats {
  /** The asset GROUP name (BTC, ADA, GOLD, WTI) for group stats, or the raw market name for per-coin stats. */
  coin: string;
  /** Underlying Hyperliquid markets traded inside the group (for per-coin stats: [coin]). */
  coins: string[];
  trades: number;
  volumeUsd: number;
  realizedPnl: number;
  fees: number;
  /** Percent (80 = 80%); null under 5 closes. */
  winRate: number | null;
  wins: number;
  losses: number;
  avgTradeUsd: number;
  lastTradeAt: number | null;
  direction: "long" | "short" | "mixed" | null;
  /** Net result over the 30d fill window: realizedPnl minus fees. */
  first30dPnl: number;
}

export interface OpenPosition {
  coin: string;
  side: "long" | "short";
  size: number;
  notionalUsd: number;
  entryPx: number;
  markPx: number;
  liqPx: number | null;
  leverage: number;
  leverageType: "cross" | "isolated";
  marginUsed: number;
  unrealizedPnl: number;
  /** Percent return on equity (-30.7 = -30.7%). */
  roe: number;
  /** Positive = the trader has paid funding since the position opened. */
  fundingPaid: number;
  openedAt: number | null;
}

export interface OpenSummary {
  count: number;
  coins: string[];
  notionalUsd: number;
  unrealizedPnl: number;
}

export interface MixSlice {
  volumeUsd: number;
  trades: number;
  sharePct: number;
}

/** Share of the trader's 30d activity inside the four Ascend-copyable groups. */
export interface Mix {
  copyableSharePct: number;
  copyableTradeSharePct: number;
  byAsset: Record<AssetGroup | "OTHER", MixSlice>;
  topCoins: { coin: string; sharePct: number }[];
}

export interface Stats30d {
  tradesPerDay: number;
  avgHoldMin: number | null;
  medianLeverage: number | null;
  maxDrawdownPct: number | null;
  profitableWeeksPct: number | null;
  pnlCopyable: number;
  pnlOther: number;
}

/** research/copytrade-scoring.md. success / consistency / risk are null on thin data (then `thin` is true). */
export interface Score {
  copyability: number;
  success: number | null;
  activity: number | null;
  focus: number | null;
  consistency: number | null;
  risk: number | null;
  grade: "A" | "B" | "C" | "D";
  thin: boolean;
  reasons: string[];
}

/** Copyable-only (BTC/ADA/GOLD/WTI) fill statistics the rubric needs beyond AssetStats. */
export interface CopyStats {
  fills: number;
  /** Closing fills with closedPnl != 0. */
  trades: number;
  pnlNet: number;
  grossWins: number;
  grossLosses: number;
  wins: number;
  losses: number;
  /** Largest single closedPnl over grossWins, 0..1; null without wins. */
  topTradeShare: number | null;
  /** UTC days with at least one copyable fill. */
  activeDays: number;
  /** Share of days with any fill (all markets) whose summed closedPnl was positive; null without such days. */
  profitableDaysPct: number | null;
  lastFillAt: number | null;
  /** Median of fill notional / equityStart over copyable opening fills; null without opens. */
  medianNotionalLev: number | null;
}

export interface TraderRow {
  address: string;
  displayName: string | null;
  rank: number;
  equity: number;
  window: WindowPerf;
  asset: AssetStats | null;
  open: OpenSummary;
  openForAsset: OpenPosition | null;
  mix: Mix;
  stats30d: Stats30d;
  score: Score;
}

export interface Trade {
  time: number;
  coin: string;
  side: "buy" | "sell";
  dir: string;
  px: number;
  size: number;
  notionalUsd: number;
  closedPnl: number;
  fee: number;
  hash: string;
}

export interface ScanStatus {
  candidates: number;
  scanned: number;
  lastFullScanAt: number | null;
  nextScanAt: number | null;
  stale: boolean;
}

export interface CopyTradeResponse {
  asOf: number;
  scan: ScanStatus;
  assets: string[];
  traders: TraderRow[];
}

export interface CopyTradeSummary {
  asOf: number;
  scan: ScanStatus;
  assets: string[];
  top: Record<AssetGroup | "COPYABLE", TraderRow[]>;
}

export interface TraderDetail {
  asOf: number;
  address: string;
  displayName: string | null;
  equity: number;
  withdrawable: number;
  windows: Record<Window, WindowPerf>;
  pnlHistory: { month: [number, number][]; allTime: [number, number][] };
  openPositions: OpenPosition[];
  recentTrades: Trade[];
  /** Group stats for BTC, ADA, GOLD, WTI plus every raw market traded in the window. */
  perAsset: Record<string, AssetStats>;
  mix: Mix;
  stats30d: Stats30d;
  score: Score;
  links: { hyperliquid: string };
}

/** Scanner record per trader (in memory + scan.json). Raw fills live in their own file. */
export interface TraderRecord {
  address: string;
  displayName: string | null;
  equity: number;
  windows: Record<Window, WindowPerf>;
  perCoin: Record<string, AssetStats>;
  mix: Mix;
  stats30d: Stats30d;
  /** Fills inside the four copyable groups over the window (discovery keeps pool traders with >= 20). */
  copyableFills: number;
  open: OpenSummary;
  positions: OpenPosition[];
  recent: Trade[];
  copy: CopyStats;
  /** From the portfolio call, refreshed every PORTFOLIO_TTL: month pnlHistory resampled to one point per UTC day. */
  portfolio: { at: number; daily: [number, number][] } | null;
  /** When the fill window was last computed. */
  scannedAt: number;
  /** When clearinghouseState was last refreshed. */
  positionsAt: number;
  /** False when a page cap was hit and the 30d window is still being backfilled. */
  fillsComplete: boolean;
}

export const ASSETS = ["BTC", "ADA", "GOLD", "WTI"] as const;
export type AssetGroup = (typeof ASSETS)[number];
/** Hyperliquid markets behind each Ascend-copyable group. HIP-3 builder markets carry their dex prefix. */
export const ASSET_GROUPS: Record<AssetGroup, string[]> = {
  BTC: ["BTC"],
  ADA: ["ADA"],
  GOLD: ["xyz:GOLD", "km:GOLD", "PAXG"],
  WTI: ["xyz:CL", "km:USOIL", "xyz:BRENTOIL"],
};
export const COIN_TO_GROUP: Record<string, AssetGroup> = Object.fromEntries(
  (Object.entries(ASSET_GROUPS) as [AssetGroup, string[]][]).flatMap(([g, coins]) => coins.map((c) => [c, g]))
) as Record<string, AssetGroup>;
/** Builder-deployed perp dexes whose clearinghouse state must be fetched separately. */
export const PERP_DEXES = ["xyz", "km"] as const;
export const isAssetGroup = (s: string): s is AssetGroup => (ASSETS as readonly string[]).includes(s);
export const DAY_MS = 86_400_000;
export const FILL_WINDOW_MS = 30 * DAY_MS;
