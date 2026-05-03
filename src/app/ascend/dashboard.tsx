"use client"

import React, { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import Image from "next/image"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
  BarChart3,
  Trophy,
  Crosshair,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUp,
  ArrowDown,
  Clock,
  Filter,
  RefreshCw,
  ExternalLink,
  Calendar,
  Download,
  Link2,
  Check,
  Shield,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { FlexCard } from "@/components/flex-card"

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Types matching API responses
// ---------------------------------------------------------------------------

interface OverallStats {
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  totalPnl: number
  avgPnl: number
  bestTrade: number
  worstTrade: number
}

interface AssetStats {
  asset: string
  trades: number
  wins: number
  losses: number
  winRate: number
  totalPnl: number
  avgPnl: number
}

interface RecentTrade {
  id: number
  positionId: string
  asset: string
  marketTitle: string
  side: string
  entryPrice: number
  exitPrice: number | null
  margin: number
  leverage: number
  pnl: number
  closeReason: string | null
  openedAt: string
  closedAt: string | null
  priceSource: string | null
}

interface PnlPoint {
  timestamp: string
  cumulativePnl: number
  tradePnl: number
}

interface OpenPosition {
  id: number
  positionId: string
  asset: string
  marketTitle: string
  side: string
  entryPrice: number
  margin: number
  leverage: number
  tpPrice: number | null
  slPrice: number | null
  openedAt: string
  priceSource: string | null
  markPrice: number | null
  unrealizedPnl: number | null
  unrealizedPnlPct: number | null
}

interface StrategyBreakdownEntry {
  priceSource: string | null
  trades: number
  wins: number
  losses: number
  winRate: number
  totalPnl: number
  avgPnl: number
}

interface OverviewResponse {
  stats: OverallStats
  assets: AssetStats[]
  strategyBreakdown?: StrategyBreakdownEntry[]
  recentTrades: RecentTrade[]
  dailyStats: { date: string; trades: number; wins: number; winRate: number; pnl: number }[]
}

interface TradesResponse {
  trades: RecentTrade[]
}

interface TimelineResponse {
  timeline: PnlPoint[]
  dailyStats: { date: string; trades: number; wins: number; winRate: number; pnl: number }[]
}

interface LiveResponse {
  openPositions: OpenPosition[]
  recentTrades: RecentTrade[]
  hourlyRate: { hour: string; trades: number }[]
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(val: number): string {
  return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPnl(val: number | null | undefined): string {
  const v = val ?? 0
  const sign = v >= 0 ? "+" : ""
  return `${sign}${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPct(val: number | null | undefined): string {
  const v = val ?? 0
  const sign = v >= 0 ? "+" : ""
  return `${sign}${v.toFixed(1)}%`
}

function formatDuration(openedAt: string, closedAt: string | null): string {
  if (!closedAt) return "Open"
  const ms = Math.abs(asUTC(closedAt).getTime() - asUTC(openedAt).getTime())
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return "<1m"
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ${mins % 60}m`
  const days = Math.floor(hrs / 24)
  return `${days}d ${hrs % 24}h`
}

function formatDate(d: string): string {
  return asUTC(d).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })
}

function asUTC(d: string): Date {
  return d.endsWith("Z") || d.includes("+") ? new Date(d) : new Date(d + "Z")
}

function formatDateTime(d: string): string {
  return asUTC(d).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function timeAgo(d: string): string {
  const ms = Date.now() - asUTC(d).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ---------------------------------------------------------------------------
// Close reason colors for alert ticker
// ---------------------------------------------------------------------------

function closeReasonColor(reason: string | null): string {
  switch (reason) {
    case "settlement": return "text-gain"
    case "market_expired": return "text-[#F59E0B]"
    case "edge_flip": return "text-[#F97316]"
    case "stop_loss": return "text-loss"
    case "trailing_stop": return "text-[#3B82F6]"
    default: return "text-muted-foreground"
  }
}

function closeReasonDot(reason: string | null): string {
  switch (reason) {
    case "settlement": return "\u{1F7E2}"
    case "market_expired": return "\u{1F7E1}"
    case "edge_flip": return "\u{1F7E0}"
    case "stop_loss": return "\u{1F534}"
    case "trailing_stop": return "\u{1F535}"
    default: return "⚪"
  }
}

// ---------------------------------------------------------------------------
// Asset category mapping for risk exposure
// ---------------------------------------------------------------------------

function getAssetCategory(asset: string): string {
  const upper = asset.toUpperCase()
  if (["ADA", "BTC", "SNEK", "NIGHT", "ETH"].includes(upper)) return "Crypto"
  if (["GOLD", "SILVER"].includes(upper)) return "Metals"
  if (["OIL", "CRUDE OIL"].includes(upper)) return "Energy"
  if (["TSLA", "NVDA"].includes(upper)) return "Stocks"
  return "Other"
}

const CATEGORY_COLORS: Record<string, string> = {
  Crypto: "#E8622C",
  Metals: "#F59E0B",
  Energy: "#10B981",
  Stocks: "#8B5CF6",
  Other: "#6B7280",
}

// ---------------------------------------------------------------------------
// Source mapping & badge colors
// ---------------------------------------------------------------------------

function mapSource(priceSource: string | null): string {
  if (!priceSource || priceSource.includes("ascend_")) return "Sniper"
  if (priceSource === "auto_trader") return "Auto-Trader"
  if (priceSource === "momentum") return "Momentum"
  if (priceSource === "crowd_reentry") return "Re-entry"
  return priceSource.replace(/_/g, " ")
}

function sourceBadgeClasses(label: string): string {
  switch (label) {
    case "Sniper":
      return "border-cyan-500/30 text-cyan-400 bg-cyan-500/10"
    case "Auto-Trader":
      return "border-[#E8622C]/30 text-[#E8622C] bg-[#E8622C]/10"
    case "Momentum":
      return "border-purple-500/30 text-purple-400 bg-purple-500/10"
    case "Re-entry":
      return "border-amber-500/30 text-amber-400 bg-amber-500/10"
    default:
      return "border-white/10 text-muted-foreground"
  }
}

function formatHoldTime(openedAt: string): string {
  const ms = Date.now() - asUTC(openedAt).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return "<1m"
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ${mins % 60}m`
  const days = Math.floor(hrs / 24)
  return `${days}d ${hrs % 24}h`
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
}

// ---------------------------------------------------------------------------
// Stat Card — uniform height
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  color = "text-ascend",
  sub,
  children,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  color?: string
  sub?: string
  children?: React.ReactNode
}) {
  return (
    <motion.div variants={item} className="h-full">
      <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 transition-all hover:border-[#E8622C]/20 hover:shadow-lg hover:shadow-[#E8622C]/10">
        <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-[#E8622C] opacity-10 blur-2xl transition-opacity group-hover:opacity-25" />
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className={`font-display text-2xl font-bold tracking-tight tabular-nums ${color}`}>{value}</p>
            {sub && <p className="font-mono text-xs tabular-nums text-muted-foreground">{sub}</p>}
          </div>
          <div className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E8622C]/10 text-[#E8622C]">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {children && <div className="mt-auto pt-2">{children}</div>}
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Custom Tooltip for PnL chart
// ---------------------------------------------------------------------------

function PnlTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const cumulative = payload.find((p) => p.dataKey === "cumulativePnl")?.value ?? 0
  return (
    <div className="rounded-lg border border-[#E8622C]/20 bg-[#0A0E17]/95 px-4 py-3 shadow-xl backdrop-blur-md">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono text-sm font-semibold tabular-nums ${cumulative >= 0 ? "text-gain" : "text-loss"}`}>
        {formatPnl(cumulative)} USDT
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export default function AscendDashboard() {
  const [assetFilter, setAssetFilter] = useState<string>("all")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [timeframe, setTimeframe] = useState<number>(90)
  const [linkCopied, setLinkCopied] = useState(false)
  const [flexCardOpen, setFlexCardOpen] = useState(false)
  const [expandedTradeId, setExpandedTradeId] = useState<number | null>(null)
  const [tradesPage, setTradesPage] = useState(1)

  const SHARE_URL = "https://www.rngcrypto.com/ascend"
  const SHARE_TEXT = "Autonomous agent trading event perpetuals on @AscendPerps \u{1F916}\n\n100% of platform fees go back to $ASCEND holders. Real yield, no gimmicks.\n\n#Cardano $ADA $ASCEND"

  function shareOnX() {
    const text = encodeURIComponent(SHARE_TEXT)
    const url = encodeURIComponent(SHARE_URL)
    window.open(
      `https://x.com/intent/tweet?text=${text}&url=${url}`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(SHARE_URL)
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = SHARE_URL
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
    }
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  // Queries
  const { data: overview, isLoading: loadingOverview } = useQuery<OverviewResponse>({
    queryKey: ["ascend-overview"],
    queryFn: () => fetchJson("/api/ascend?view=overview"),
    refetchInterval: 30_000,
  })

  const { data: tradesData, isLoading: loadingTrades } = useQuery<TradesResponse>({
    queryKey: ["ascend-trades"],
    queryFn: () => fetchJson("/api/ascend?view=trades&limit=50"),
    refetchInterval: 30_000,
  })

  const { data: timelineData, isLoading: loadingTimeline } = useQuery<TimelineResponse>({
    queryKey: ["ascend-timeline", timeframe],
    queryFn: () => fetchJson(`/api/ascend?view=timeline&days=${timeframe}`),
    refetchInterval: 60_000,
  })

  const { data: liveData, isLoading: loadingLive } = useQuery<LiveResponse>({
    queryKey: ["ascend-live"],
    queryFn: () => fetchJson("/api/ascend?view=live"),
    refetchInterval: 10_000,
  })

  const stats = overview?.stats
  const assets = overview?.assets ?? []
  const trades = tradesData?.trades ?? []
  const timeline = timelineData?.timeline ?? []
  const openPositions = liveData?.openPositions ?? []

  const uniqueAssets = useMemo(() => {
    const set = new Set(trades.map((t) => t.asset))
    return Array.from(set).sort()
  }, [trades])

  const filteredTrades = useMemo(
    () => {
      let list = assetFilter === "all" ? trades : trades.filter((t) => t.asset === assetFilter)
      if (sourceFilter !== "all") {
        list = list.filter((t) => mapSource(t.priceSource) === sourceFilter)
      }
      return [...list].sort((a, b) => asUTC(b.closedAt ?? "1970-01-01").getTime() - asUTC(a.closedAt ?? "1970-01-01").getTime())
    },
    [trades, assetFilter, sourceFilter]
  )

  const bestAsset = useMemo(() => {
    if (!assets.length) return "N/A"
    const best = assets.reduce((a, b) => (a.totalPnl > b.totalPnl ? a : b))
    return best.asset
  }, [assets])

  const avgLeverage = useMemo(() => {
    if (!trades.length) return 0
    return trades.reduce((s, t) => s + t.leverage, 0) / trades.length
  }, [trades])

  const leverageColor = useMemo(() => {
    if (avgLeverage >= 6) return "text-loss"
    if (avgLeverage >= 3) return "text-[#F59E0B]"
    return "text-[#E8622C]"
  }, [avgLeverage])

  const dailySummary = useMemo(() => {
    const dailyStats = overview?.dailyStats ?? []
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    const monthAgo = new Date(now.getTime() - 30 * 86400000)

    let todayPnl = 0, todayWins = 0, todayLosses = 0
    let weekPnl = 0
    let monthPnl = 0

    for (const d of dailyStats) {
      const date = new Date(d.date)
      if (d.date === todayStr) {
        todayPnl = d.pnl
        todayWins = d.wins
        todayLosses = d.trades - d.wins
      }
      if (date >= weekAgo) weekPnl += d.pnl
      if (date >= monthAgo) monthPnl += d.pnl
    }

    return { todayPnl, todayWins, todayLosses, weekPnl, monthPnl }
  }, [overview?.dailyStats])

  const openExposure = useMemo(() => {
    return openPositions.reduce((sum, p) => sum + p.margin, 0)
  }, [openPositions])

  const totalUnrealizedPnl = useMemo(() => {
    return openPositions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0)
  }, [openPositions])

  // Strategy breakdown: use API data or compute from trades
  const strategyBreakdown = useMemo(() => {
    if (overview?.strategyBreakdown?.length) {
      // Normalize: push data may use snake_case price_source or miss winRate
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return overview.strategyBreakdown.map((s: any) => ({
        priceSource: (s.priceSource ?? s.price_source ?? null) as string | null,
        trades: (s.trades ?? 0) as number,
        wins: (s.wins ?? 0) as number,
        losses: (s.losses ?? 0) as number,
        winRate: (s.winRate ?? (s.trades ? Math.round((s.wins / s.trades) * 10000) / 100 : 0)) as number,
        totalPnl: (s.totalPnl ?? 0) as number,
        avgPnl: (s.avgPnl ?? 0) as number,
      }))
    }
    // Fallback: compute from trades array
    if (!trades.length) return []
    const map = new Map<string, { trades: number; wins: number; losses: number; totalPnl: number }>()
    for (const t of trades) {
      const key = t.priceSource ?? "null"
      const entry = map.get(key) ?? { trades: 0, wins: 0, losses: 0, totalPnl: 0 }
      entry.trades++
      if ((t.pnl ?? 0) > 0) entry.wins++
      else entry.losses++
      entry.totalPnl += t.pnl ?? 0
      map.set(key, entry)
    }
    return Array.from(map.entries()).map(([key, s]) => ({
      priceSource: key === "null" ? null : key,
      trades: s.trades,
      wins: s.wins,
      losses: s.losses,
      winRate: Math.round((s.wins / s.trades) * 10000) / 100,
      totalPnl: Math.round(s.totalPnl * 100) / 100,
      avgPnl: Math.round((s.totalPnl / s.trades) * 100) / 100,
    })).sort((a, b) => b.trades - a.trades)
  }, [overview?.strategyBreakdown, trades])

  // Risk exposure: group open positions by category
  const exposureByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const pos of openPositions) {
      const cat = getAssetCategory(pos.asset)
      map.set(cat, (map.get(cat) ?? 0) + pos.margin)
    }
    return Array.from(map.entries())
      .map(([category, margin]) => ({ category, margin }))
      .sort((a, b) => b.margin - a.margin)
  }, [openPositions])

  // Max loss scenario
  const maxLossScenario = useMemo(() => {
    const DEFAULT_SL_PCT = 0.05
    return openPositions.reduce((sum, pos) => {
      const slPct = pos.slPrice
        ? Math.abs(pos.entryPrice - pos.slPrice) / pos.entryPrice
        : DEFAULT_SL_PCT
      return sum + pos.margin * pos.leverage * slPct
    }, 0)
  }, [openPositions])

  // Asset heatmap data: use overview assets (all trades, not capped by limit)
  const assetHeatmap = useMemo(() => {
    return assets
      .map((a) => ({ asset: a.asset, trades: a.trades, pnl: a.totalPnl }))
      .sort((a, b) => b.trades - a.trades)
  }, [assets])

  // Alert ticker: recent trades from live data
  const alertTrades = useMemo(() => {
    return (liveData?.recentTrades ?? []).slice(0, 5)
  }, [liveData?.recentTrades])

  const avgHoldTimeToday = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayTrades = trades.filter(
      (t) => t.closedAt && t.closedAt.startsWith(todayStr)
    )
    if (todayTrades.length === 0) return "N/A"
    const totalMs = todayTrades.reduce((sum, t) => {
      return sum + (asUTC(t.closedAt!).getTime() - asUTC(t.openedAt).getTime())
    }, 0)
    const avgMs = totalMs / todayTrades.length
    const mins = Math.floor(avgMs / 60000)
    if (mins < 1) return "<1m"
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m`
  }, [trades])

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 px-4 pb-6 pt-24 lg:px-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-4">
          <div className="relative size-12 overflow-hidden rounded-xl ring-2 ring-[#E8622C]/30">
            <Image
              src="/avatar/ascend_logo_coin.jpg"
              alt="Ascend Market"
              fill
              className="object-cover"
              priority
            />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl font-bold tracking-tight text-[#E8622C]">Ascend Agent</h1>
              <Badge variant="secondary" className="gap-1.5 bg-[#E8622C]/15 text-[#E8622C] border border-[#E8622C]/30 text-xs">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#E8622C] opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-[#E8622C]" />
                </span>
                Live
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Autonomous event perpetuals trading on{" "}
              <a
                href="https://www.ascend.market"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#E8622C] underline-offset-4 hover:underline"
              >
                Ascend Market
              </a>{" "}
              testnet
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Flex card button */}
          <button
            onClick={() => setFlexCardOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#00FF88]/10 border border-[#00FF88]/30 px-3.5 py-1.5 text-xs font-medium text-[#00FF88] hover:bg-[#00FF88]/20 hover:border-[#00FF88]/50 hover:shadow-[0_0_16px_rgba(0,255,136,0.25)] transition-all"
            title="Share stats card"
          >
            <Download className="size-3" />
            Flex
          </button>
          {/* Share on X */}
          <button
            onClick={shareOnX}
            className="inline-flex items-center justify-center size-9 rounded-full bg-[#00FF88]/10 border border-[#00FF88]/30 text-[#00FF88] hover:bg-[#00FF88]/20 hover:border-[#00FF88]/60 hover:shadow-[0_0_12px_rgba(0,255,136,0.3)] transition-all"
            aria-label="Share on X"
            title="Share on X"
          >
            <XIcon className="size-3.5" />
          </button>
          {/* Copy link */}
          <button
            onClick={copyShareLink}
            className="inline-flex items-center justify-center size-9 rounded-full bg-[#00FF88]/10 border border-[#00FF88]/30 text-[#00FF88] hover:bg-[#00FF88]/20 hover:border-[#00FF88]/60 hover:shadow-[0_0_12px_rgba(0,255,136,0.3)] transition-all"
            aria-label="Copy link"
            title="Copy link"
          >
            {linkCopied ? (
              <Check className="size-3.5" />
            ) : (
              <Link2 className="size-3.5" />
            )}
          </button>
          {linkCopied && (
            <span className="text-xs text-[#00FF88] animate-in fade-in duration-200">Copied!</span>
          )}
          <div className="mx-1 h-5 w-px bg-white/[0.08]" />
          <a
            href="https://www.ascend.market"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[#E8622C]/30 bg-[#E8622C]/10 px-4 py-2 text-xs font-medium text-[#E8622C] transition-all hover:border-[#E8622C]/50 hover:bg-[#E8622C]/15"
          >
            <ExternalLink className="size-3.5" />
            ascend.market
          </a>
          <a
            href="https://x.com/ascendperps"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-white/50 transition-all hover:border-white/[0.15] hover:text-white/70"
          >
            @ascendperps
          </a>
        </div>
      </motion.div>

      {/* ----------------------------------------------------------------- */}
      {/* Alert Ticker — recent trade events                                */}
      {/* ----------------------------------------------------------------- */}
      {alertTrades.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]"
        >
          <div className="flex items-center overflow-x-auto whitespace-nowrap px-4 py-2.5 scrollbar-hide" style={{ scrollBehavior: "smooth" }}>
            <span className="mr-3 shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Latest</span>
            <div className="flex items-center gap-4">
              {alertTrades.map((t) => {
                const pnl = t.pnl ?? 0
                const dot = closeReasonDot(t.closeReason)
                const colorCls = closeReasonColor(t.closeReason)
                return (
                  <span key={t.id} className={`shrink-0 font-mono text-xs tabular-nums ${colorCls}`}>
                    {dot} {t.asset} {t.side} {formatPnl(pnl)} ({t.closeReason ?? "unknown"})
                  </span>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 1. Hero Stats Bar — uniform grid                                  */}
      {/* ----------------------------------------------------------------- */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6"
      >
        <StatCard
          label="Total P&L"
          value={stats ? `${formatPnl(stats.totalPnl)}` : "..."}
          icon={stats && stats.totalPnl >= 0 ? TrendingUp : TrendingDown}
          color={stats && stats.totalPnl >= 0 ? "text-gain" : "text-loss"}
          sub="USDT (testnet)"
        />
        <StatCard
          label="Win Rate"
          value={stats ? `${stats.winRate}%` : "..."}
          icon={Target}
          color="text-[#E8622C]"
          sub={stats ? `${stats.wins}W / ${stats.losses}L` : undefined}
        >
          {stats && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-loss/30">
              <div className="h-full rounded-full bg-[#E8622C]" style={{ width: `${stats.winRate}%` }} />
            </div>
          )}
        </StatCard>
        <StatCard
          label="Total Trades"
          value={stats ? `${stats.totalTrades}` : "..."}
          icon={Activity}
          color="text-white/90"
          sub={stats ? `Avg: ${formatPnl(stats.avgPnl)} USDT` : undefined}
        />
        <StatCard
          label="Open Positions"
          value={`${openPositions.length}`}
          icon={Crosshair}
          color="text-[#F07B3F]"
          sub={loadingLive ? "Loading..." : "Active now"}
        />
        <StatCard
          label="Avg Leverage"
          value={`${avgLeverage.toFixed(1)}x`}
          icon={BarChart3}
          color={leverageColor}
          sub="Across recent trades"
        />
        <StatCard
          label="Best Asset"
          value={bestAsset}
          icon={Trophy}
          color="text-[#E8622C]"
          sub="By total P&L"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="flex flex-wrap items-center gap-6 rounded-xl border border-[#E8622C]/10 bg-[#E8622C]/[0.03] px-5 py-3 text-sm"
      >
        <div className="flex items-center gap-2">
          <span className="text-white/40">Today</span>
          <span className={`font-mono font-semibold tabular-nums ${dailySummary.todayPnl >= 0 ? "text-gain" : "text-loss"}`}>
            {formatPnl(dailySummary.todayPnl)} USDT
          </span>
          <span className="font-mono text-xs tabular-nums text-white/40">
            ({dailySummary.todayWins}W / {dailySummary.todayLosses}L)
          </span>
        </div>
        <div className="h-4 w-px bg-[#E8622C]/20" />
        <div className="flex items-center gap-2">
          <span className="text-white/40">This Week</span>
          <span className={`font-mono font-semibold tabular-nums ${dailySummary.weekPnl >= 0 ? "text-gain" : "text-loss"}`}>
            {formatPnl(dailySummary.weekPnl)} USDT
          </span>
        </div>
        <div className="h-4 w-px bg-[#E8622C]/20" />
        <div className="flex items-center gap-2">
          <span className="text-white/40">This Month</span>
          <span className={`font-mono font-semibold tabular-nums ${dailySummary.monthPnl >= 0 ? "text-gain" : "text-loss"}`}>
            {formatPnl(dailySummary.monthPnl)} USDT
          </span>
        </div>
        <div className="h-4 w-px bg-[#E8622C]/20" />
        <div className="flex items-center gap-2">
          <span className="text-white/40">Open Exposure</span>
          <span className="font-mono font-semibold tabular-nums text-[#F07B3F]">
            ${fmtNum(openExposure)}
          </span>
        </div>
        <div className="h-4 w-px bg-[#E8622C]/20" />
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-white/40" />
          <span className="text-white/40">Avg Hold</span>
          <span className="font-mono font-semibold tabular-nums text-white/70">
            {avgHoldTimeToday}
          </span>
        </div>
      </motion.div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. PnL Timeline Chart — clean line only                           */}
      {/* ----------------------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.15 }}
      >
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Cumulative P&L</h2>
            <div className="flex items-center gap-1">
              {[
                { label: "7D", days: 7 },
                { label: "30D", days: 30 },
                { label: "90D", days: 90 },
                { label: "ALL", days: 365 },
              ].map((tf) => (
                <button
                  key={tf.days}
                  onClick={() => setTimeframe(tf.days)}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    timeframe === tf.days
                      ? "bg-[#E8622C]/15 text-[#E8622C]"
                      : "text-white/40 hover:text-white/60"
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
          {loadingTimeline ? (
            <div className="skeleton h-72 w-full rounded-lg" />
          ) : timeline.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
              No trade data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={timeline} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E8622C" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#E8622C" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatDate}
                  tick={{ fill: "#9CA3AF", fontSize: 11 }}
                  axisLine={{ stroke: "#1F2937" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#9CA3AF", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<PnlTooltip />} />
                <Area
                  type="monotone"
                  dataKey="cumulativePnl"
                  stroke="#E8622C"
                  strokeWidth={2}
                  fill="url(#pnlGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#E8622C", stroke: "#0A0E17", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* ----------------------------------------------------------------- */}
      {/* Asset Activity Heatmap                                            */}
      {/* ----------------------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.17 }}
      >
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">Asset Activity Heatmap</h2>
          {assetHeatmap.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              No trade data
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
              {assetHeatmap.map((a) => {
                const maxPnl = Math.max(...assetHeatmap.map((x) => Math.abs(x.pnl)), 1)
                const intensity = a.trades === 0 ? 0 : Math.min(Math.abs(a.pnl) / maxPnl, 1)
                const isPositive = a.pnl >= 0
                const bgColor = a.trades === 0
                  ? "bg-white/[0.03]"
                  : isPositive
                    ? `bg-gain`
                    : `bg-loss`
                const bgOpacity = a.trades === 0 ? 1 : 0.1 + intensity * 0.4
                return (
                  <div
                    key={a.asset}
                    className="relative overflow-hidden rounded-lg border border-white/5 p-3 text-center transition-colors hover:border-[#E8622C]/20"
                    style={{
                      backgroundColor: a.trades === 0
                        ? "rgba(255,255,255,0.02)"
                        : isPositive
                          ? `rgba(0,255,136,${bgOpacity * 0.3})`
                          : `rgba(255,59,92,${bgOpacity * 0.3})`,
                    }}
                  >
                    <p className="font-display text-xs font-semibold">{a.asset}</p>
                    <p className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">{a.trades} trades</p>
                    {a.trades > 0 && (
                      <p className={`mt-0.5 font-mono text-xs font-semibold tabular-nums ${isPositive ? "text-gain" : "text-loss"}`}>
                        {formatPnl(a.pnl)}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* ----------------------------------------------------------------- */}
      {/* 3. Open Positions                                                 */}
      {/* ----------------------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.2 }}
      >
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-semibold">Open Positions</h2>
              <Badge variant="secondary" className="gap-1 bg-[#E8622C]/10 text-[#E8622C] border border-[#E8622C]/20 text-xs">
                <RefreshCw className="h-3 w-3" />
                10s
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              {openPositions.length > 0 && totalUnrealizedPnl !== 0 && (
                <span className={`font-mono text-sm font-semibold tabular-nums ${
                  totalUnrealizedPnl >= 0 ? "text-gain" : "text-loss"
                }`}>
                  {totalUnrealizedPnl >= 0 ? "+" : ""}{fmtNum(totalUnrealizedPnl)}
                </span>
              )}
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {openPositions.length} active
              </span>
            </div>
          </div>

          {loadingLive ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="skeleton h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : openPositions.length === 0 ? (
            <div className="flex h-24 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
              <Crosshair className="h-5 w-5 text-white/20" />
              No open positions right now
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {openPositions.map((pos) => {
                const tpDist = pos.tpPrice && pos.entryPrice
                  ? pos.side === "YES"
                    ? ((pos.tpPrice - pos.entryPrice) / pos.entryPrice) * 100
                    : ((pos.entryPrice - pos.tpPrice) / pos.entryPrice) * 100
                  : null
                const slDist = pos.slPrice && pos.entryPrice
                  ? pos.side === "YES"
                    ? ((pos.entryPrice - pos.slPrice) / pos.entryPrice) * 100
                    : ((pos.slPrice - pos.entryPrice) / pos.entryPrice) * 100
                  : null
                const sourceLabel = mapSource(pos.priceSource)
                return (
                  <div
                    key={pos.id}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4 transition-colors hover:border-[#E8622C]/20"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-semibold">{pos.asset}</span>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${
                            pos.side === "YES"
                              ? "bg-gain-bg text-gain"
                              : "bg-loss-bg text-loss"
                          }`}
                        >
                          {pos.side}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-medium ${sourceBadgeClasses(sourceLabel)}`}
                        >
                          {sourceLabel}
                        </Badge>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-mono font-medium tabular-nums ${
                        pos.leverage >= 6
                          ? "bg-loss/15 text-loss"
                          : pos.leverage >= 3
                            ? "bg-[#F59E0B]/15 text-[#F59E0B]"
                            : "bg-[#E8622C]/10 text-[#E8622C]"
                      }`}>
                        {pos.leverage}x
                      </span>
                    </div>
                    {/* Unrealized P&L banner */}
                    {pos.unrealizedPnl != null && (
                      <div className={`mb-3 flex items-center justify-between rounded-md px-3 py-1.5 text-xs font-mono tabular-nums ${
                        pos.unrealizedPnl >= 0
                          ? "bg-gain-bg text-gain"
                          : "bg-loss-bg text-loss"
                      }`}>
                        <span className="font-medium">
                          {pos.unrealizedPnl >= 0 ? "+" : ""}{fmtNum(pos.unrealizedPnl)} USDT
                        </span>
                        {pos.unrealizedPnlPct != null && (
                          <span className="text-[10px] opacity-80">
                            {pos.unrealizedPnlPct >= 0 ? "+" : ""}{pos.unrealizedPnlPct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-y-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Margin</span>
                        <p className="font-mono font-medium tabular-nums">${fmtNum(pos.margin)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Entry</span>
                        <p className="font-mono font-medium tabular-nums">{pos.entryPrice.toFixed(4)}</p>
                      </div>
                      {pos.markPrice != null && (
                        <div>
                          <span className="text-muted-foreground">Mark</span>
                          <p className={`font-mono font-medium tabular-nums ${
                            pos.unrealizedPnl != null
                              ? pos.unrealizedPnl >= 0 ? "text-gain" : "text-loss"
                              : ""
                          }`}>
                            {pos.markPrice.toFixed(4)}
                          </p>
                        </div>
                      )}
                      {pos.tpPrice && (
                        <div>
                          <span className="text-muted-foreground">TP Target</span>
                          <p className="font-mono font-medium tabular-nums text-gain">
                            {pos.tpPrice.toFixed(4)}
                            {tpDist != null && (
                              <span className="ml-1 text-[10px] opacity-70">
                                ({tpDist >= 0 ? "+" : ""}{tpDist.toFixed(1)}%)
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                      {pos.slPrice && (
                        <div>
                          <span className="text-muted-foreground">SL Risk</span>
                          <p className="font-mono font-medium tabular-nums text-loss">
                            {pos.slPrice.toFixed(4)}
                            {slDist != null && (
                              <span className="ml-1 text-[10px] opacity-70">
                                (-{Math.abs(slDist).toFixed(1)}%)
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Hold Time</span>
                        <p className="flex items-center gap-1 font-mono font-medium tabular-nums text-[#E8622C]">
                          <Clock className="h-3 w-3" />
                          {formatHoldTime(pos.openedAt)}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Opened</span>
                        <p className="font-mono font-medium tabular-nums">
                          {formatDateTime(pos.openedAt)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 truncate text-xs text-muted-foreground" title={pos.marketTitle}>
                      {pos.marketTitle}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* ----------------------------------------------------------------- */}
      {/* Risk Exposure                                                     */}
      {/* ----------------------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.22 }}
      >
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#E8622C]" />
            <h2 className="font-display text-lg font-semibold">Risk Exposure</h2>
          </div>

          {openPositions.length === 0 ? (
            <div className="flex h-24 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-5 w-5 text-white/20" />
              No open positions, no active risk
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Exposure by Asset</h3>
                <div className="space-y-3">
                  {openPositions.map((pos) => {
                    const maxMargin = Math.max(...openPositions.map((p) => p.margin), 1)
                    const barWidth = (pos.margin / maxMargin) * 100
                    return (
                      <div key={`${pos.asset}-${pos.side}-${pos.id}`}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-[#E8622C]">
                            {pos.asset} <span className={pos.side === "YES" ? "text-gain" : "text-loss"}>{pos.side}</span>
                          </span>
                          <span className="font-mono tabular-nums text-muted-foreground">${fmtNum(pos.margin)}</span>
                        </div>
                        <div className="h-3 w-full overflow-hidden rounded-full bg-white/5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${barWidth}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="h-full rounded-full bg-[#E8622C]"
                            style={{ opacity: 0.7 }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-xs font-medium text-muted-foreground">Total Margin Used</div>
                  <p className="mt-1 font-mono text-xl font-bold tabular-nums text-[#E8622C]">
                    ${fmtNum(openExposure)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {openPositions.length} position{openPositions.length !== 1 ? "s" : ""} open
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-xs font-medium text-muted-foreground">Available Balance</div>
                  <p className="mt-1 font-mono text-xl font-bold tabular-nums text-white/90">
                    ${fmtNum(Math.max((stats?.totalPnl ?? 0) + openExposure - openExposure, 0))}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Estimated from P&L
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ----------------------------------------------------------------- */}
      {/* 4. Recent Trades Feed — with timestamps                           */}
      {/* ----------------------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.25 }}
      >
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display text-lg font-semibold">Recent Trades</h2>
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={assetFilter}
                onChange={(e) => { setAssetFilter(e.target.value); setTradesPage(1) }}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground backdrop-blur-sm focus:border-[#E8622C] focus:outline-none focus:ring-1 focus:ring-[#E8622C]"
              >
                <option value="all">All Assets</option>
                {uniqueAssets.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <select
                value={sourceFilter}
                onChange={(e) => { setSourceFilter(e.target.value); setTradesPage(1) }}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground backdrop-blur-sm focus:border-[#E8622C] focus:outline-none focus:ring-1 focus:ring-[#E8622C]"
              >
                <option value="all">All Sources</option>
                <option value="Sniper">Sniper</option>
                <option value="Auto-Trader">Auto-Trader</option>
                <option value="Momentum">Momentum</option>
                <option value="Re-entry">Re-entry</option>
              </select>
            </div>
          </div>

          {loadingTrades ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredTrades.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              No trades found
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] md:min-w-[1000px] text-sm">
                <thead>
                  <tr className="border-b border-[#E8622C]/10 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 pr-3">Asset</th>
                    <th className="pb-3 pr-3">Side</th>
                    <th className="hidden pb-3 pr-3 md:table-cell">Source</th>
                    <th className="pb-3 pr-3 text-right">Margin</th>
                    <th className="hidden pb-3 pr-3 text-right md:table-cell">Lev.</th>
                    <th className="pb-3 pr-3 text-right">Entry</th>
                    <th className="pb-3 pr-3 text-right">Exit</th>
                    <th className="pb-3 pr-3 text-right">P&L</th>
                    <th className="hidden pb-3 pr-3 text-right md:table-cell">Duration</th>
                    <th className="pb-3 pr-3 text-right">Closed</th>
                    <th className="pb-3 text-right">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.slice((tradesPage - 1) * 20, tradesPage * 20).map((trade) => {
                    const pnl = trade.pnl ?? 0
                    const isWin = pnl > 0
                    const pnlPct =
                      trade.margin > 0
                        ? (pnl / trade.margin) * 100
                        : 0
                    const isExpanded = expandedTradeId === trade.id
                    const tradeSourceLabel = mapSource(trade.priceSource)
                    return (
                      <React.Fragment key={trade.id}>
                        <tr
                          onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
                          className={`cursor-pointer border-b border-white/5 transition-colors ${
                            isExpanded
                              ? isWin ? "bg-gain/[0.06]" : pnl < 0 ? "bg-loss/[0.06]" : "bg-white/[0.06]"
                              : isWin
                                ? "bg-gain/[0.02] hover:bg-gain/[0.04]"
                                : pnl < 0
                                  ? "bg-loss/[0.02] hover:bg-loss/[0.04]"
                                  : "hover:bg-white/[0.04]"
                          }`}
                        >
                          <td className="py-3 pr-3 font-mono font-medium tabular-nums">
                            <span className="flex items-center gap-1">
                              {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                              {trade.asset}
                            </span>
                          </td>
                          <td className="py-3 pr-3">
                            <span
                              className={`inline-flex items-center gap-1 ${
                                trade.side === "YES" ? "text-gain" : "text-loss"
                              }`}
                            >
                              {trade.side === "YES" ? (
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              ) : (
                                <ArrowDownRight className="h-3.5 w-3.5" />
                              )}
                              {trade.side}
                            </span>
                          </td>
                          <td className="hidden py-3 pr-3 md:table-cell">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-medium ${sourceBadgeClasses(tradeSourceLabel)}`}
                            >
                              {tradeSourceLabel}
                            </Badge>
                          </td>
                          <td className="py-3 pr-3 text-right font-mono tabular-nums">
                            ${fmtNum(trade.margin)}
                          </td>
                          <td className="hidden py-3 pr-3 text-right font-mono tabular-nums md:table-cell">{trade.leverage}x</td>
                          <td className="py-3 pr-3 text-right font-mono tabular-nums">
                            {trade.entryPrice.toFixed(4)}
                          </td>
                          <td className="py-3 pr-3 text-right font-mono tabular-nums">
                            {trade.exitPrice?.toFixed(4) ?? "---"}
                          </td>
                          <td
                            className={`py-3 pr-3 text-right font-mono font-semibold tabular-nums ${
                              isWin ? "text-gain" : "text-loss"
                            }`}
                          >
                            <div>{trade.pnl != null ? formatPnl(pnl) : "---"}</div>
                            <div className="hidden text-xs opacity-70 md:block">{trade.pnl != null ? formatPct(pnlPct) : ""}</div>
                          </td>
                          <td className="hidden py-3 pr-3 text-right font-mono tabular-nums text-xs text-muted-foreground md:table-cell">
                            <div className="flex items-center justify-end gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(trade.openedAt, trade.closedAt)}
                            </div>
                          </td>
                          <td className="py-3 pr-3 text-right text-xs text-muted-foreground">
                            {trade.closedAt && (
                              <div className="flex items-center justify-end gap-1" title={timeAgo(trade.closedAt)}>
                                <Calendar className="h-3 w-3" />
                                {formatDateTime(trade.closedAt)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            {trade.closeReason && (
                              <Badge variant="secondary" className="text-xs">
                                {trade.closeReason}
                              </Badge>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={11} className="p-0">
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                transition={{ duration: 0.2 }}
                                className={`border-b border-white/5 px-6 py-4 ${
                                  isWin ? "bg-gain/[0.04]" : pnl < 0 ? "bg-loss/[0.04]" : "bg-white/[0.03]"
                                }`}
                              >
                                <div className="mb-3 text-sm font-medium text-white/70">{trade.marketTitle}</div>
                                <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                                  <div>
                                    <span className="text-muted-foreground">Entry Time (EST)</span>
                                    <p className="font-mono font-medium tabular-nums">{formatDateTime(trade.openedAt)}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Exit Time (EST)</span>
                                    <p className="font-mono font-medium tabular-nums">{trade.closedAt ? formatDateTime(trade.closedAt) : "---"}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Hold Duration</span>
                                    <p className="flex items-center gap-1 font-mono font-medium tabular-nums text-[#E8622C]">
                                      <Clock className="h-3 w-3" />
                                      {formatDuration(trade.openedAt, trade.closedAt)}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Price Source</span>
                                    <div className="mt-0.5">
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] font-medium ${sourceBadgeClasses(tradeSourceLabel)}`}
                                      >
                                        {tradeSourceLabel}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                                {trade.exitPrice != null && (
                                  <div className="mt-4">
                                    <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                                      <span>Entry: {trade.entryPrice.toFixed(4)}</span>
                                      <span>Exit: {trade.exitPrice.toFixed(4)}</span>
                                    </div>
                                    <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/5">
                                      {(() => {
                                        const minP = Math.min(trade.entryPrice, trade.exitPrice)
                                        const maxP = Math.max(trade.entryPrice, trade.exitPrice)
                                        const range = maxP - minP
                                        const pad = range * 0.3 || 0.01
                                        const lo = minP - pad
                                        const hi = maxP + pad
                                        const span = hi - lo
                                        const entryPct = ((trade.entryPrice - lo) / span) * 100
                                        const exitPct = ((trade.exitPrice - lo) / span) * 100
                                        const leftPct = Math.min(entryPct, exitPct)
                                        const widthPct = Math.abs(exitPct - entryPct)
                                        return (
                                          <div
                                            className={`absolute top-0 h-full rounded-full ${isWin ? "bg-gain" : "bg-loss"}`}
                                            style={{ left: `${leftPct}%`, width: `${widthPct}%`, opacity: 0.6 }}
                                          />
                                        )
                                      })()}
                                    </div>
                                    <div className="mt-1 flex items-center justify-center gap-2 text-xs">
                                      <span className="font-mono tabular-nums">{trade.entryPrice.toFixed(4)}</span>
                                      <span className={isWin ? "text-gain" : "text-loss"}>{"-->"}</span>
                                      <span className="font-mono tabular-nums">{trade.exitPrice.toFixed(4)}</span>
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {Math.ceil(filteredTrades.length / 20) > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
                <p className="text-xs text-muted-foreground">
                  Showing {(tradesPage - 1) * 20 + 1}&ndash;{Math.min(tradesPage * 20, filteredTrades.length)} of {filteredTrades.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTradesPage((p) => Math.max(1, p - 1))}
                    disabled={tradesPage === 1}
                    className="rounded-md border border-white/10 bg-white/5 p-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-medium tabular-nums">{tradesPage} / {Math.ceil(filteredTrades.length / 20)}</span>
                  <button
                    onClick={() => setTradesPage((p) => Math.min(Math.ceil(filteredTrades.length / 20), p + 1))}
                    disabled={tradesPage === Math.ceil(filteredTrades.length / 20)}
                    className="rounded-md border border-white/10 bg-white/5 p-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </motion.div>

      {/* ----------------------------------------------------------------- */}
      {/* 5. Asset Performance Breakdown                                    */}
      {/* ----------------------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.3 }}
      >
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">Asset Performance</h2>
          {loadingOverview ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              No asset data yet
            </div>
          ) : (
            <div className="space-y-3">
              {assets.map((a) => {
                const maxPnl = Math.max(...assets.map((x) => Math.abs(x.totalPnl)), 1)
                const barWidth = Math.min(Math.abs(a.totalPnl) / maxPnl * 100, 100)
                const isPositive = a.totalPnl >= 0

                return (
                  <div
                    key={a.asset}
                    className="rounded-lg border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-[#E8622C]/15"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-display text-sm font-semibold">{a.asset}</span>
                        <span className="text-xs text-muted-foreground">
                          {a.trades} trades
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-muted-foreground">
                          WR: <span className="font-mono font-medium tabular-nums text-foreground">{a.winRate}%</span>
                        </span>
                        <span className="text-muted-foreground">
                          Avg: <span className={`font-mono font-medium tabular-nums ${a.avgPnl >= 0 ? "text-gain" : "text-loss"}`}>
                            {formatPnl(a.avgPnl)}
                          </span>
                        </span>
                        <span className={`font-mono font-semibold tabular-nums ${isPositive ? "text-gain" : "text-loss"}`}>
                          {formatPnl(a.totalPnl)} USDT
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${barWidth}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className={`h-full rounded-full ${isPositive ? "bg-[#E8622C]" : "bg-loss"}`}
                        style={{ opacity: 0.7 }}
                      />
                    </div>
                    <div className="mt-2 flex gap-0.5">
                      {a.wins > 0 && (
                        <div
                          className="h-1 rounded-full bg-gain"
                          style={{ width: `${(a.wins / a.trades) * 100}%`, opacity: 0.6 }}
                        />
                      )}
                      {a.losses > 0 && (
                        <div
                          className="h-1 rounded-full bg-loss"
                          style={{ width: `${(a.losses / a.trades) * 100}%`, opacity: 0.6 }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* ----------------------------------------------------------------- */}
      {/* 6. Strategy Performance                                           */}
      {/* ----------------------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.32 }}
      >
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">Strategy Performance</h2>
          {strategyBreakdown.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              No strategy data yet
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {strategyBreakdown.map((s) => {
                const label = mapSource(s.priceSource)
                const badgeCls = sourceBadgeClasses(label)
                const isPositive = s.totalPnl >= 0
                // Extract accent color from badge classes for the card border
                const accentMatch = badgeCls.match(/border-([^\s/]+)/)
                return (
                  <div
                    key={s.priceSource ?? "sniper"}
                    className={`rounded-lg border p-4 transition-colors hover:shadow-lg ${badgeCls.replace(/text-[^\s]+/g, "").replace(/bg-[^\s]+/g, "")} bg-white/[0.03]`}
                    style={{
                      borderColor: label === "Auto-Trader" ? "rgba(232,98,44,0.2)" :
                                   label === "Sniper" ? "rgba(6,182,212,0.2)" :
                                   label === "Momentum" ? "rgba(168,85,247,0.2)" :
                                   label === "Re-entry" ? "rgba(245,158,11,0.2)" :
                                   "rgba(255,255,255,0.06)",
                    }}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <Badge
                        variant="outline"
                        className={`text-xs font-medium ${badgeCls}`}
                      >
                        {label}
                      </Badge>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{s.trades} trades</span>
                    </div>
                    <div className="mb-3">
                      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Win Rate</span>
                        <span className="font-mono tabular-nums">{s.winRate ?? 0}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${s.winRate ?? 0}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{
                            backgroundColor: label === "Auto-Trader" ? "#E8622C" :
                                             label === "Sniper" ? "#06B6D4" :
                                             label === "Momentum" ? "#A855F7" :
                                             label === "Re-entry" ? "#F59E0B" :
                                             "#6B7280",
                            opacity: 0.7,
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Total P&L</span>
                        <p className={`font-mono font-semibold tabular-nums ${isPositive ? "text-gain" : "text-loss"}`}>
                          {formatPnl(s.totalPnl)}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Avg P&L</span>
                        <p className={`font-mono font-semibold tabular-nums ${s.avgPnl >= 0 ? "text-gain" : "text-loss"}`}>
                          {formatPnl(s.avgPnl)}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Wins</span>
                        <p className="font-mono font-medium tabular-nums text-gain">{s.wins}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Losses</span>
                        <p className="font-mono font-medium tabular-nums text-loss">{s.losses}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* Ascend info banner */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.35 }}
        className="overflow-hidden rounded-xl border border-[#E8622C]/15 bg-gradient-to-r from-[#E8622C]/[0.06] via-transparent to-transparent p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg">
              <Image
                src="/avatar/event_perpetual_markets.jpg"
                alt="Event Perpetual Markets"
                fill
                className="object-cover"
              />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-[#E8622C]">What is Ascend?</h3>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-white/50">
                Leveraged trading on probability outcomes: world events, metals, commodities, stocks, and crypto. Built on Midnight with ZK-verified multi-chain settlement.
              </p>
            </div>
          </div>
          <a
            href="https://docs.ascend.market/start-here/what-is-ascend"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#E8622C] px-5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Read the Docs
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </motion.div>

      {/* Footer note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="pb-4 text-center text-xs text-muted-foreground"
      >
        Data sourced from Ascend testnet. All values in USDT (stablecoin). Auto-refreshes every 10-60s.
      </motion.p>

      <FlexCard
        open={flexCardOpen}
        onClose={() => setFlexCardOpen(false)}
        stats={stats ?? null}
        openPositionCount={openPositions.length}
        bestAsset={bestAsset}
      />
    </div>
  )
}
