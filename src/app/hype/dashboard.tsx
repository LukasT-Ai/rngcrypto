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
  Clock,
  Filter,
  RefreshCw,
  ExternalLink,
  Calendar,
  Link2,
  Check,
  Shield,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Wallet,
  DollarSign,
  Download,
  Info,
  Zap,
  Repeat,
  Layers,
  Bolt,
  Flame,
  Scissors,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { FlexCard } from "@/components/flex-card"

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

const ACCENT = "#7BEBC2"

interface OverallStats {
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  totalPnl: number
  avgPnl: number
  bestTrade: number
  worstTrade: number
  accountValue: number
  withdrawable: number
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

interface Trade {
  id: string
  asset: string
  side: string
  entryPrice: number
  exitPrice: number | null
  size: number
  pnl: number | null
  pnlPct: number | null
  leverage: number | null
  strategy: string | null
  reason: string | null
  closeReason: string | null
  openedAt: string | null
  closedAt: string | null
  fee: number
}

interface PnlPoint {
  timestamp: string
  cumulativePnl: number
  tradePnl: number
}

interface OpenPosition {
  asset: string
  side: string
  entryPrice: number
  markPrice: number
  size: number
  leverage: number
  unrealizedPnl: number
  marginUsed: number
  liquidationPrice: number | null
  strategy: string | null
  roe: number
  fundingAccrued: number
  openedAt: number | null
  stopLoss: number | null
  takeProfit: number | null
  takeProfitLevels: Array<{ price: number; sizePct: number; hit: boolean }>
}

interface OverviewResponse {
  stats: OverallStats
  assets: AssetStats[]
  recentTrades: Trade[]
  dailyStats: { date: string; trades: number; wins: number; winRate: number; pnl: number }[]
}

interface TradesResponse {
  trades: Trade[]
}

interface TimelineResponse {
  timeline: PnlPoint[]
  dailyStats: { date: string; trades: number; wins: number; winRate: number; pnl: number }[]
}

interface LiveResponse {
  openPositions: OpenPosition[]
  accountValue: number
  withdrawable: number
  recentTrades: Trade[]
}

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

function fmtNum(val: number | null | undefined): string {
  return (val ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtPrice(val: number | null | undefined): string {
  return (val ?? 0).toLocaleString("en-US", { minimumFractionDigits: 5, maximumFractionDigits: 5 })
}

function formatHoldTime(openedAt: string | number | null): string {
  if (!openedAt) return "—"
  const ts = typeof openedAt === "number" ? openedAt : new Date(openedAt).getTime()
  if (isNaN(ts)) return "—"
  const diff = Date.now() - ts
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const mins = Math.floor((diff % 3_600_000) / 60_000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function formatOpenedDate(openedAt: string | number | null): string {
  if (!openedAt) return "—"
  return new Date(openedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
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

function asUTC(d: string): Date {
  return d.endsWith("Z") || d.includes("+") ? new Date(d) : new Date(d + "Z")
}

function formatDate(d: string): string {
  return asUTC(d).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })
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
  const ms = Date.now() - new Date(d).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDuration(openedAt: string, closedAt: string | null): string {
  if (!closedAt) return "Open"
  const ms = Math.abs(new Date(closedAt).getTime() - new Date(openedAt).getTime())
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return "<1m"
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ${mins % 60}m`
  const days = Math.floor(hrs / 24)
  return `${days}d ${hrs % 24}h`
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
}

function StatCard({
  label,
  value,
  icon: Icon,
  color = `text-[${ACCENT}]`,
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
      <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 transition-all hover:border-[#7BEBC2]/20 hover:shadow-lg hover:shadow-[#7BEBC2]/10">
        <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-[#7BEBC2] opacity-10 blur-2xl transition-opacity group-hover:opacity-25" />
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className={`font-display text-2xl font-bold tracking-tight tabular-nums ${color}`}>{value}</p>
            {sub && <p className="font-mono text-xs tabular-nums text-muted-foreground">{sub}</p>}
          </div>
          <div className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#7BEBC2]/10 text-[#7BEBC2]">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {children && <div className="mt-auto pt-2">{children}</div>}
      </div>
    </motion.div>
  )
}

function PnlTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const cumulative = payload.find((p) => p.dataKey === "cumulativePnl")?.value ?? 0
  return (
    <div className="rounded-lg border border-[#7BEBC2]/20 bg-[#0A0E17]/95 px-4 py-3 shadow-xl backdrop-blur-md">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono text-sm font-semibold tabular-nums ${cumulative >= 0 ? "text-gain" : "text-loss"}`}>
        {formatPnl(cumulative)} USDC
      </p>
    </div>
  )
}

export default function HypeDashboard() {
  const [assetFilter, setAssetFilter] = useState<string>("all")
  const [timeframe, setTimeframe] = useState<number>(90)
  const [linkCopied, setLinkCopied] = useState(false)
  const [flexCardOpen, setFlexCardOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null)
  const [tradesPage, setTradesPage] = useState(1)

  const SHARE_URL = "https://www.rngcrypto.com/hype"
  const SHARE_TEXT = "Autonomous perps trading agent on @HyperliquidX \u{1F916}\n\nEMA+RSI+ATR strategy, fully transparent, every trade tracked live.\n\n#Hyperliquid #DeFi #Trading"

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

  const { data: overview, isLoading: loadingOverview } = useQuery<OverviewResponse>({
    queryKey: ["hype-overview"],
    queryFn: () => fetchJson("/api/hype?view=overview"),
    refetchInterval: 30_000,
  })

  const { data: tradesData, isLoading: loadingTrades } = useQuery<TradesResponse>({
    queryKey: ["hype-trades"],
    queryFn: () => fetchJson("/api/hype?view=trades&limit=50"),
    refetchInterval: 30_000,
  })

  const { data: timelineData, isLoading: loadingTimeline } = useQuery<TimelineResponse>({
    queryKey: ["hype-timeline", timeframe],
    queryFn: () => fetchJson(`/api/hype?view=timeline&days=${timeframe}`),
    refetchInterval: 60_000,
  })

  const { data: liveData, isLoading: loadingLive } = useQuery<LiveResponse>({
    queryKey: ["hype-live"],
    queryFn: () => fetchJson("/api/hype?view=live"),
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
      const list = assetFilter === "all" ? trades : trades.filter((t) => t.asset === assetFilter)
      return [...list].sort((a, b) => new Date(b.closedAt ?? 0).getTime() - new Date(a.closedAt ?? 0).getTime())
    },
    [trades, assetFilter]
  )

  const bestAsset = useMemo(() => {
    if (!assets.length) return "N/A"
    const best = assets.reduce((a, b) => (a.totalPnl > b.totalPnl ? a : b))
    return best.asset
  }, [assets])

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
    return openPositions.reduce((sum, p) => sum + p.marginUsed, 0)
  }, [openPositions])

  const TAKER_FEE = 0.00035

  const totalUnrealizedPnl = useMemo(() => {
    return openPositions.reduce((sum, p) => {
      const fees = (p.marginUsed ?? 0) * (p.leverage ?? 1) * TAKER_FEE
      return sum + (p.unrealizedPnl ?? 0) - fees
    }, 0)
  }, [openPositions])

  const assetHeatmap = useMemo(() => {
    return assets
      .map((a) => ({ asset: a.asset, trades: a.trades, pnl: a.totalPnl }))
      .sort((a, b) => b.trades - a.trades)
  }, [assets])

  const alertTrades = useMemo(() => {
    return (liveData?.recentTrades ?? []).slice(0, 5)
  }, [liveData?.recentTrades])

  // ── Enhanced metrics ──────────────────────────────────────────────────
  const profitFactor = useMemo(() => {
    const closed = trades.filter(t => t.closedAt && t.pnl != null && t.pnl !== 0)
    const grossProfit = closed.filter(t => (t.pnl ?? 0) > 0).reduce((s, t) => s + (t.pnl ?? 0), 0)
    const grossLoss = Math.abs(closed.filter(t => (t.pnl ?? 0) < 0).reduce((s, t) => s + (t.pnl ?? 0), 0))
    if (grossLoss === 0) return grossProfit > 0 ? 99.9 : 0
    return Math.round((grossProfit / grossLoss) * 100) / 100
  }, [trades])

  const currentStreak = useMemo(() => {
    const sorted = [...trades]
      .filter(t => t.closedAt && t.pnl != null && t.pnl !== 0)
      .sort((a, b) => asUTC(b.closedAt ?? "1970").getTime() - asUTC(a.closedAt ?? "1970").getTime())
    if (!sorted.length) return { count: 0, type: "W" as const }
    const firstType = (sorted[0].pnl ?? 0) > 0 ? "W" : "L"
    let count = 0
    for (const t of sorted) {
      if (((t.pnl ?? 0) > 0 ? "W" : "L") === firstType) count++
      else break
    }
    return { count, type: firstType as "W" | "L" }
  }, [trades])

  const sharpeRatio = useMemo(() => {
    const closed = trades.filter(t => t.closedAt && t.pnl != null && t.pnl !== 0)
    if (closed.length < 3) return null
    const returns = closed.map(t => {
      const margin = t.entryPrice && t.size && t.leverage ? (t.size * t.entryPrice) / (t.leverage || 1) : t.size
      return (t.pnl ?? 0) / (margin || 1)
    })
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1)
    const stdDev = Math.sqrt(variance)
    if (stdDev === 0) return null
    return Math.round((mean / stdDev) * Math.sqrt(252) * 100) / 100
  }, [trades])

  const drawdownTimeline = useMemo(() => {
    if (!timeline.length) return []
    let peak = -Infinity
    return timeline.map(p => {
      peak = Math.max(peak, p.cumulativePnl)
      const dd = peak > 0 ? ((p.cumulativePnl - peak) / Math.abs(peak)) * 100 : 0
      return { ...p, drawdownPct: Math.min(dd, 0) }
    })
  }, [timeline])

  const maxDrawdown = useMemo(() => {
    if (!drawdownTimeline.length) return 0
    return Math.min(...drawdownTimeline.map(d => d.drawdownPct))
  }, [drawdownTimeline])

  const durationBuckets = useMemo(() => {
    const buckets = { "<5m": 0, "5-30m": 0, "30m-2h": 0, "2-8h": 0, "8h+": 0 }
    for (const t of trades) {
      if (!t.closedAt || !t.openedAt) continue
      const mins = (asUTC(t.closedAt).getTime() - asUTC(t.openedAt).getTime()) / 60000
      if (mins < 5) buckets["<5m"]++
      else if (mins < 30) buckets["5-30m"]++
      else if (mins < 120) buckets["30m-2h"]++
      else if (mins < 480) buckets["2-8h"]++
      else buckets["8h+"]++
    }
    return buckets
  }, [trades])

  const lastTrade = useMemo(() => {
    const sorted = [...trades]
      .filter(t => t.closedAt)
      .sort((a, b) => asUTC(b.closedAt!).getTime() - asUTC(a.closedAt!).getTime())
    return sorted[0] ?? null
  }, [trades])

  const hasData = stats && stats.totalTrades > 0

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
          <div className="relative size-12 overflow-hidden rounded-xl ring-2 ring-[#7BEBC2]/30">
            <Image
              src="/hype/HYPE_LOGO_400x400.jpg"
              alt="Hyperliquid"
              fill
              className="object-cover"
              priority
            />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl font-bold tracking-tight text-[#7BEBC2]">Hype Agent</h1>
              <Badge variant="secondary" className="gap-1.5 bg-[#7BEBC2]/15 text-[#7BEBC2] border border-[#7BEBC2]/30 text-xs">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#7BEBC2] opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-[#7BEBC2]" />
                </span>
                Live
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Autonomous perpetual futures trading on{" "}
              <a
                href="https://app.hyperliquid.xyz/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#7BEBC2] underline-offset-4 hover:underline"
              >
                Hyperliquid
              </a>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setLegendOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#7BEBC2]/10 border border-[#7BEBC2]/30 px-3.5 py-1.5 text-xs font-medium text-[#7BEBC2] hover:bg-[#7BEBC2]/20 hover:border-[#7BEBC2]/50 hover:shadow-[0_0_16px_rgba(123,235,194,0.25)] transition-all"
            title="Strategy guide"
          >
            <Info className="size-3" />
            Strategies
          </button>
          <button
            onClick={() => setFlexCardOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#00FF88]/10 border border-[#00FF88]/30 px-3.5 py-1.5 text-xs font-medium text-[#00FF88] hover:bg-[#00FF88]/20 hover:border-[#00FF88]/50 hover:shadow-[0_0_16px_rgba(0,255,136,0.25)] transition-all"
            title="Share stats card"
          >
            <Download className="size-3" />
            Flex
          </button>
          <button
            onClick={shareOnX}
            className="inline-flex items-center justify-center size-9 rounded-full bg-[#00FF88]/10 border border-[#00FF88]/30 text-[#00FF88] hover:bg-[#00FF88]/20 hover:border-[#00FF88]/60 hover:shadow-[0_0_12px_rgba(0,255,136,0.3)] transition-all"
            aria-label="Share on X"
            title="Share on X"
          >
            <XIcon className="size-3.5" />
          </button>
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
          <div className="mx-1 hidden h-5 w-px bg-white/[0.08] sm:block" />
          <a
            href="https://app.hyperliquid.xyz/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-full border border-[#7BEBC2]/30 bg-[#7BEBC2]/10 px-4 py-2 text-xs font-medium text-[#7BEBC2] transition-all hover:border-[#7BEBC2]/50 hover:bg-[#7BEBC2]/15 sm:inline-flex"
          >
            <ExternalLink className="size-3.5" />
            hyperliquid.xyz
          </a>
        </div>
      </motion.div>

      {/* Alert Ticker */}
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
                const dot = pnl > 0 ? "\u{1F7E2}" : "\u{1F534}"
                return (
                  <span key={t.id} className={`shrink-0 font-mono text-xs tabular-nums ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                    {dot} {t.asset} {t.side} {formatPnl(pnl)} USDC
                  </span>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Hero Stats Bar */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8"
      >
        <StatCard
          label="Account Value"
          value={stats ? `$${fmtNum(stats.accountValue)}` : "..."}
          icon={Wallet}
          color="text-[#7BEBC2]"
          sub="USDC"
        />
        <StatCard
          label="Total P&L"
          value={stats ? `${formatPnl(stats.totalPnl)}` : "..."}
          icon={stats && stats.totalPnl >= 0 ? TrendingUp : TrendingDown}
          color={stats && stats.totalPnl >= 0 ? "text-gain" : "text-loss"}
          sub="USDC"
        />
        <StatCard
          label="Win Rate"
          value={stats ? `${stats.winRate}%` : "..."}
          icon={Target}
          color="text-[#7BEBC2]"
          sub={stats ? `${stats.wins}W / ${stats.losses}L` : undefined}
        >
          {stats && stats.totalTrades > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-loss/30">
              <div className="h-full rounded-full bg-[#7BEBC2]" style={{ width: `${stats.winRate}%` }} />
            </div>
          )}
        </StatCard>
        <StatCard
          label="Total Trades"
          value={stats ? `${stats.totalTrades}` : "..."}
          icon={Activity}
          color="text-white/90"
          sub={stats ? `Avg: ${formatPnl(stats.avgPnl)} USDC` : undefined}
        />
        <StatCard
          label="Profit Factor"
          value={trades.length > 0 ? `${profitFactor.toFixed(2)}` : "—"}
          icon={Trophy}
          color={profitFactor >= 2 ? "text-gain" : profitFactor >= 1 ? "text-[#F59E0B]" : "text-loss"}
          sub={profitFactor >= 2 ? "Strong edge" : profitFactor >= 1 ? "Profitable" : "Needs work"}
        />
        <StatCard
          label="Streak"
          value={currentStreak.count > 0 ? `${currentStreak.type}${currentStreak.count}` : "—"}
          icon={Zap}
          color={currentStreak.type === "W" ? "text-gain" : currentStreak.count > 0 ? "text-loss" : "text-white/30"}
          sub={currentStreak.count > 0 ? `Current ${currentStreak.type === "W" ? "win" : "loss"} streak` : "No streak"}
        />
        <StatCard
          label="Sharpe Ratio"
          value={sharpeRatio !== null ? `${sharpeRatio.toFixed(2)}` : "—"}
          icon={Shield}
          color={sharpeRatio !== null ? (sharpeRatio >= 1.5 ? "text-gain" : sharpeRatio >= 0.5 ? "text-[#7BEBC2]" : "text-[#F59E0B]") : "text-white/30"}
          sub="Risk-adjusted"
        />
        <StatCard
          label="Max Drawdown"
          value={drawdownTimeline.length > 0 ? `${maxDrawdown.toFixed(1)}%` : "—"}
          icon={AlertTriangle}
          color={maxDrawdown > -10 ? "text-[#7BEBC2]" : maxDrawdown > -25 ? "text-[#F59E0B]" : "text-loss"}
          sub="From peak"
        />
      </motion.div>

      {/* Daily Summary Bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="flex flex-wrap items-center gap-6 rounded-xl border border-[#7BEBC2]/10 bg-[#7BEBC2]/[0.03] px-5 py-3 text-sm"
      >
        <div className="flex items-center gap-2">
          <span className="text-white/40">Today</span>
          <span className={`font-mono font-semibold tabular-nums ${dailySummary.todayPnl >= 0 ? "text-gain" : "text-loss"}`}>
            {formatPnl(dailySummary.todayPnl)} USDC
          </span>
          <span className="font-mono text-xs tabular-nums text-white/40">
            ({dailySummary.todayWins}W / {dailySummary.todayLosses}L)
          </span>
        </div>
        <div className="h-4 w-px bg-[#7BEBC2]/20" />
        <div className="flex items-center gap-2">
          <span className="text-white/40">This Week</span>
          <span className={`font-mono font-semibold tabular-nums ${dailySummary.weekPnl >= 0 ? "text-gain" : "text-loss"}`}>
            {formatPnl(dailySummary.weekPnl)} USDC
          </span>
        </div>
        <div className="h-4 w-px bg-[#7BEBC2]/20" />
        <div className="flex items-center gap-2">
          <span className="text-white/40">This Month</span>
          <span className={`font-mono font-semibold tabular-nums ${dailySummary.monthPnl >= 0 ? "text-gain" : "text-loss"}`}>
            {formatPnl(dailySummary.monthPnl)} USDC
          </span>
        </div>
        <div className="h-4 w-px bg-[#7BEBC2]/20" />
        <div className="flex items-center gap-2">
          <span className="text-white/40">Open Exposure</span>
          <span className="font-mono font-semibold tabular-nums text-[#7BEBC2]">
            ${fmtNum(openExposure)}
          </span>
        </div>
        {totalUnrealizedPnl !== 0 && (
          <>
            <div className="h-4 w-px bg-[#7BEBC2]/20" />
            <div className="flex items-center gap-2">
              <span className="text-white/40">Unrealized</span>
              <span className={`font-mono font-semibold tabular-nums ${totalUnrealizedPnl >= 0 ? "text-gain" : "text-loss"}`}>
                {formatPnl(totalUnrealizedPnl)} USDC
              </span>
            </div>
          </>
        )}
      </motion.div>

      {/* PnL Timeline Chart */}
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
                      ? "bg-[#7BEBC2]/15 text-[#7BEBC2]"
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
            <div className="flex h-72 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <BarChart3 className="size-10 text-[#7BEBC2]/20" />
              <p>No trade data yet — chart will populate after the first trade.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={drawdownTimeline.length ? drawdownTimeline : timeline} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="hypePnlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7BEBC2" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#7BEBC2" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="hypeDrawdownGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F43F5E" stopOpacity={0} />
                    <stop offset="100%" stopColor="#F43F5E" stopOpacity={0.15} />
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
                  yAxisId="pnl"
                  tick={{ fill: "#9CA3AF", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(0)}`}
                />
                <YAxis
                  yAxisId="dd"
                  orientation="right"
                  tick={{ fill: "#F43F5E", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  domain={["dataMin", 0]}
                  hide={!drawdownTimeline.some(d => d.drawdownPct < -0.5)}
                />
                <Tooltip content={<PnlTooltip />} />
                <Area
                  yAxisId="pnl"
                  type="monotone"
                  dataKey="cumulativePnl"
                  stroke="#7BEBC2"
                  strokeWidth={2}
                  fill="url(#hypePnlGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#7BEBC2", stroke: "#0A0E17", strokeWidth: 2 }}
                />
                {drawdownTimeline.some(d => d.drawdownPct < -0.5) && (
                  <Area
                    yAxisId="dd"
                    type="monotone"
                    dataKey="drawdownPct"
                    stroke="#F43F5E"
                    strokeWidth={1}
                    strokeDasharray="4 2"
                    fill="url(#hypeDrawdownGradient)"
                    dot={false}
                    activeDot={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* Asset Activity Heatmap */}
      {assetHeatmap.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.17 }}
        >
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
            <h2 className="mb-4 font-display text-lg font-semibold">Asset Activity Heatmap</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
              {assetHeatmap.map((a) => {
                const maxPnl = Math.max(...assetHeatmap.map((x) => Math.abs(x.pnl)), 1)
                const intensity = a.trades === 0 ? 0 : Math.min(Math.abs(a.pnl) / maxPnl, 1)
                const isPositive = a.pnl >= 0
                const bgOpacity = a.trades === 0 ? 1 : 0.1 + intensity * 0.4
                return (
                  <div
                    key={a.asset}
                    className="relative overflow-hidden rounded-lg border border-white/5 p-3 text-center transition-colors hover:border-[#7BEBC2]/20"
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
          </div>
        </motion.div>
      )}

      {/* Trade Duration + Last Trade row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Duration Distribution */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.18 }}
        >
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="size-4 text-[#7BEBC2]" />
              <h3 className="text-sm font-semibold">Trade Duration</h3>
            </div>
            {(() => {
              const entries = Object.entries(durationBuckets)
              const max = Math.max(...entries.map(([, v]) => v), 1)
              const total = entries.reduce((s, [, v]) => s + v, 0)
              return total === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No closed trades yet</p>
              ) : (
                <div className="space-y-2">
                  {entries.map(([label, count]) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-right font-mono text-[11px] text-muted-foreground">{label}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded bg-white/5">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(count / max) * 100}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className="flex h-full items-center rounded bg-[#7BEBC2]/20"
                        >
                          {count > 0 && (
                            <span className="pl-2 font-mono text-[10px] tabular-nums text-[#7BEBC2]">{count}</span>
                          )}
                        </motion.div>
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-white/30">
                        {total > 0 ? `${Math.round((count / total) * 100)}%` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </motion.div>

        {/* Last Trade Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
        >
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Zap className="size-4 text-[#7BEBC2]" />
              <h3 className="text-sm font-semibold">Last Trade</h3>
            </div>
            {lastTrade ? (() => {
              const isWin = (lastTrade.pnl ?? 0) > 0
              const agoMs = Date.now() - asUTC(lastTrade.closedAt!).getTime()
              const agoMin = Math.floor(agoMs / 60000)
              const agoStr = agoMin < 1 ? "just now" : agoMin < 60 ? `${agoMin}m ago` : agoMin < 1440 ? `${Math.floor(agoMin / 60)}h ${agoMin % 60}m ago` : `${Math.floor(agoMin / 1440)}d ago`
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${lastTrade.side === "long" ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"}`}>
                        {lastTrade.side === "long" ? "LONG" : "SHORT"}
                      </span>
                      <span className="font-display text-sm font-semibold">{lastTrade.asset}</span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{agoStr}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className={`font-display text-2xl font-bold tabular-nums ${isWin ? "text-gain" : "text-loss"}`}>
                      {formatPnl(lastTrade.pnl)} USDC
                    </span>
                    {lastTrade.pnlPct !== null && (
                      <span className={`font-mono text-sm tabular-nums ${isWin ? "text-gain" : "text-loss"}`}>
                        {(lastTrade.pnlPct ?? 0) >= 0 ? "+" : ""}{(lastTrade.pnlPct ?? 0).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {lastTrade.strategy && (
                      <Badge variant="outline" className="text-[10px] font-medium border-[#7BEBC2]/30 text-[#7BEBC2]">
                        {lastTrade.strategy.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Badge>
                    )}
                    {lastTrade.leverage && <span className="font-mono tabular-nums">{lastTrade.leverage}x</span>}
                    <span className="font-mono tabular-nums">{lastTrade.size} {lastTrade.asset}</span>
                  </div>
                </div>
              )
            })() : (
              <p className="py-6 text-center text-xs text-muted-foreground">No closed trades yet</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Open Positions */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.2 }}
      >
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-semibold">Open Positions</h2>
              <Badge variant="secondary" className="gap-1 bg-[#7BEBC2]/10 text-[#7BEBC2] border border-[#7BEBC2]/20 text-xs">
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
              {openPositions.map((pos) => (
                <div
                  key={`${pos.asset}-${pos.side}`}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4 transition-colors hover:border-[#7BEBC2]/20"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-semibold">{pos.asset}</span>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${
                          pos.side === "long"
                            ? "bg-gain-bg text-gain"
                            : "bg-loss-bg text-loss"
                        }`}
                      >
                        {pos.side.toUpperCase()}
                      </Badge>
                      {pos.strategy && (
                        <Badge variant="outline" className={`text-[10px] font-medium ${
                          pos.strategy.includes("mean-reversion") || pos.strategy === "Mean-Reversion" ? "border-orange-500/30 text-orange-400 bg-orange-500/10"
                          : pos.strategy.includes("sniper") ? "border-purple-500/30 text-purple-400 bg-purple-500/10"
                          : pos.strategy.includes("scalper") ? "border-pink-500/30 text-pink-400 bg-pink-500/10"
                          : pos.strategy.includes("profit-taker") ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                          : pos.strategy.includes("trend") ? "border-cyan-500/30 text-cyan-400 bg-cyan-500/10"
                          : pos.strategy.includes("funding") ? "border-blue-500/30 text-blue-400 bg-blue-500/10"
                          : pos.strategy.includes("long-flush") || pos.strategy.includes("flush") ? "border-red-500/30 text-red-400 bg-red-500/10"
                          : pos.strategy === "adopted" ? "border-yellow-500/30 text-yellow-400 bg-yellow-500/10"
                          : "border-[#7BEBC2]/30 text-[#7BEBC2]"
                        }`}>
                          {pos.strategy.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </Badge>
                      )}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-mono font-medium tabular-nums ${
                      pos.leverage >= 6
                        ? "bg-loss/15 text-loss"
                        : pos.leverage >= 3
                          ? "bg-[#F59E0B]/15 text-[#F59E0B]"
                          : "bg-[#7BEBC2]/10 text-[#7BEBC2]"
                    }`}>
                      {pos.leverage}x
                    </span>
                  </div>
                  {(() => {
                    const estFees = (pos.marginUsed ?? 0) * (pos.leverage ?? 1) * TAKER_FEE
                    const netPnl = (pos.unrealizedPnl ?? 0) - estFees
                    const netRoe = (pos.marginUsed ?? 0) > 0 ? (netPnl / pos.marginUsed) * 100 : 0
                    return (
                      <div className={`mb-3 flex items-center justify-between rounded-md px-3 py-1.5 text-xs font-mono tabular-nums ${
                        netPnl >= 0
                          ? "bg-gain-bg text-gain"
                          : "bg-loss-bg text-loss"
                      }`}>
                        <span className="font-medium">
                          {netPnl >= 0 ? "+" : ""}{fmtNum(netPnl)} USD
                        </span>
                        <span className="font-medium">
                          {netRoe >= 0 ? "+" : ""}{netRoe.toFixed(1)}% ROE
                        </span>
                      </div>
                    )
                  })()}
                  <div className="grid grid-cols-2 gap-y-2.5 text-xs">
                    <div>
                      <span className="text-muted-foreground">Margin</span>
                      <p className="font-mono font-medium tabular-nums">${fmtNum(pos.marginUsed)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Entry</span>
                      <p className="font-mono font-medium tabular-nums">${fmtPrice(pos.entryPrice)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Mark</span>
                      <p className={`font-mono font-medium tabular-nums ${
                        pos.unrealizedPnl >= 0 ? "text-gain" : "text-loss"
                      }`}>${fmtPrice(pos.markPrice)}</p>
                    </div>
                    {pos.liquidationPrice != null && (
                      <div>
                        <span className="text-muted-foreground">Liq. Price</span>
                        <p className="font-mono font-medium tabular-nums text-loss">${fmtPrice(pos.liquidationPrice)}</p>
                      </div>
                    )}
                    {pos.takeProfit != null && (
                      <div>
                        <span className="text-muted-foreground">TP Target</span>
                        <p className="font-mono font-medium tabular-nums text-gain">
                          ${fmtPrice(pos.takeProfit)}
                          <span className="ml-1 text-[10px] opacity-70">
                            ({pos.side === "long"
                              ? `+${(((pos.takeProfit - pos.entryPrice) / pos.entryPrice) * 100).toFixed(1)}%`
                              : `+${(((pos.entryPrice - pos.takeProfit) / pos.entryPrice) * 100).toFixed(1)}%`
                            })
                          </span>
                        </p>
                      </div>
                    )}
                    {pos.stopLoss != null && (
                      <div>
                        <span className="text-muted-foreground">SL Risk</span>
                        <p className="font-mono font-medium tabular-nums text-loss">
                          ${fmtPrice(pos.stopLoss)}
                          <span className="ml-1 text-[10px] opacity-70">
                            (-{(Math.abs((pos.entryPrice - pos.stopLoss) / pos.entryPrice) * 100).toFixed(1)}%)
                          </span>
                        </p>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Est. Fees</span>
                      <p className="font-mono font-medium tabular-nums text-loss">
                        -${((pos.marginUsed * pos.leverage * 0.00035) || 0).toFixed(2)}
                      </p>
                    </div>
                    {pos.fundingAccrued !== 0 && (
                      <div>
                        <span className="text-muted-foreground">Funding</span>
                        <p className={`font-mono font-medium tabular-nums ${pos.fundingAccrued >= 0 ? "text-gain" : "text-loss"}`}>{fmtNum(pos.fundingAccrued)}</p>
                      </div>
                    )}
                    {pos.openedAt && (
                      <div>
                        <span className="text-muted-foreground">Hold Time</span>
                        <p className="flex items-center gap-1 font-mono font-medium tabular-nums text-[#7BEBC2]">
                          <Clock className="h-3 w-3" />
                          {formatHoldTime(pos.openedAt)}
                        </p>
                      </div>
                    )}
                    {pos.openedAt && (
                      <div>
                        <span className="text-muted-foreground">Opened</span>
                        <p className="font-mono font-medium tabular-nums">{formatOpenedDate(pos.openedAt)}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Risk Exposure */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.22 }}
      >
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#7BEBC2]" />
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
                    const maxMargin = Math.max(...openPositions.map((p) => p.marginUsed), 1)
                    const barWidth = (pos.marginUsed / maxMargin) * 100
                    return (
                      <div key={`${pos.asset}-${pos.side}`}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-[#7BEBC2]">
                            {pos.asset} <span className={pos.side === "long" ? "text-gain" : "text-loss"}>{pos.side.toUpperCase()}</span>
                          </span>
                          <span className="font-mono tabular-nums text-muted-foreground">${fmtNum(pos.marginUsed)}</span>
                        </div>
                        <div className="h-3 w-full overflow-hidden rounded-full bg-white/5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${barWidth}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="h-full rounded-full bg-[#7BEBC2]"
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
                  <p className="mt-1 font-mono text-xl font-bold tabular-nums text-[#7BEBC2]">
                    ${fmtNum(openExposure)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {openPositions.length} position{openPositions.length !== 1 ? "s" : ""} open
                  </p>
                </div>
                {liveData && (
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="text-xs font-medium text-muted-foreground">Available Balance</div>
                    <p className="mt-1 font-mono text-xl font-bold tabular-nums text-white/90">
                      ${fmtNum(liveData.withdrawable)}
                    </p>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((openExposure / Math.max(liveData.accountValue, 1)) * 100, 100)}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="h-full rounded-full bg-[#7BEBC2]"
                        style={{ opacity: 0.7 }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {((openExposure / Math.max(liveData.accountValue, 1)) * 100).toFixed(1)}% utilized
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Recent Trades Feed */}
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
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground backdrop-blur-sm focus:border-[#7BEBC2] focus:outline-none focus:ring-1 focus:ring-[#7BEBC2]"
              >
                <option value="all">All Assets</option>
                {uniqueAssets.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
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
            <div className="flex h-24 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-5 w-5 text-white/20" />
              {hasData ? "No trades found for this filter" : "No trades yet — waiting for first trade"}
            </div>
          ) : (() => {
            const TRADES_PER_PAGE = 20
            const totalTradesPages = Math.ceil(filteredTrades.length / TRADES_PER_PAGE)
            const paginatedTrades = filteredTrades.slice((tradesPage - 1) * TRADES_PER_PAGE, tradesPage * TRADES_PER_PAGE)
            return (<>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-[#7BEBC2]/10 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 pr-3">Symbol</th>
                    <th className="pb-3 pr-3">Side</th>
                    <th className="pb-3 pr-3">Strategy</th>
                    <th className="pb-3 pr-3 text-right">Lev.</th>
                    <th className="pb-3 pr-3 text-right">Entry</th>
                    <th className="pb-3 pr-3 text-right">Exit</th>
                    <th className="pb-3 pr-3 text-right">P&L</th>
                    <th className="pb-3 pr-3 text-right">Fees</th>
                    <th className="pb-3 pr-3 text-right">Duration</th>
                    <th className="pb-3 text-right">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTrades.map((trade) => {
                    const pnl = trade.pnl ?? 0
                    const pnlPct = trade.pnlPct ?? 0
                    const isWin = pnl > 0
                    const isExpanded = expandedTradeId === trade.id
                    const duration = trade.openedAt && trade.closedAt
                      ? (() => {
                          const ms = new Date(trade.closedAt).getTime() - new Date(trade.openedAt).getTime()
                          const mins = Math.round(ms / 60000)
                          if (mins < 60) return `${mins}m`
                          const hrs = Math.floor(mins / 60)
                          if (hrs < 24) return `${hrs}h ${mins % 60}m`
                          return `${Math.floor(hrs / 24)}d ${hrs % 24}h`
                        })()
                      : "—"
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
                                trade.side === "long" ? "text-gain" : "text-loss"
                              }`}
                            >
                              {trade.side === "long" ? (
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              ) : (
                                <ArrowDownRight className="h-3.5 w-3.5" />
                              )}
                              {trade.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 pr-3 text-xs">
                            {trade.strategy
                              ? <span className="text-[#7BEBC2]">{trade.strategy.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                              : <span className="text-muted-foreground">—</span>
                            }
                          </td>
                          <td className="py-3 pr-3 text-right font-mono tabular-nums">
                            {trade.leverage ? `${trade.leverage}x` : "—"}
                          </td>
                          <td className="py-3 pr-3 text-right font-mono tabular-nums">
                            {trade.entryPrice ? `$${fmtPrice(trade.entryPrice)}` : "—"}
                          </td>
                          <td className="py-3 pr-3 text-right font-mono tabular-nums">
                            {trade.exitPrice ? `$${fmtPrice(trade.exitPrice)}` : "—"}
                          </td>
                          <td className="py-3 pr-3 text-right">
                            <div className={`font-mono font-semibold tabular-nums ${isWin ? "text-gain" : "text-loss"}`}>
                              {formatPnl(pnl)}
                            </div>
                            <div className={`text-[10px] font-mono tabular-nums ${isWin ? "text-gain/70" : "text-loss/70"}`}>
                              {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                            </div>
                          </td>
                          <td className="py-3 pr-3 text-right font-mono text-xs tabular-nums text-muted-foreground">
                            {trade.fee > 0 ? `-$${trade.fee.toFixed(2)}` : "—"}
                          </td>
                          <td className="py-3 pr-3 text-right text-xs text-muted-foreground font-mono tabular-nums">
                            {duration}
                          </td>
                          <td className="py-3 text-right text-xs text-muted-foreground">
                            <div className="flex items-center justify-end gap-1" title={trade.closedAt ? timeAgo(trade.closedAt) : ""}>
                              <Calendar className="h-3 w-3" />
                              {trade.closedAt ? formatDateTime(trade.closedAt) : "—"}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={10} className="p-0">
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                transition={{ duration: 0.2 }}
                                className={`border-b border-white/5 px-6 py-4 ${
                                  isWin ? "bg-gain/[0.04]" : pnl < 0 ? "bg-loss/[0.04]" : "bg-white/[0.03]"
                                }`}
                              >
                                <div className="mb-3 text-sm font-medium text-white/70">
                                  {trade.asset} {trade.side?.toUpperCase()} @ {trade.leverage || 1}x leverage
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                                  <div>
                                    <span className="text-muted-foreground">Entry Time (EST)</span>
                                    <p className="font-mono font-medium tabular-nums">{trade.openedAt ? formatDateTime(trade.openedAt) : "—"}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Exit Time (EST)</span>
                                    <p className="font-mono font-medium tabular-nums">{trade.closedAt ? formatDateTime(trade.closedAt) : "—"}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Hold Duration</span>
                                    <p className="flex items-center gap-1 font-mono font-medium tabular-nums text-[#7BEBC2]">
                                      <Clock className="h-3 w-3" />
                                      {duration}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Strategy</span>
                                    <div className="mt-0.5">
                                      {trade.strategy
                                        ? <Badge variant="outline" className="text-[10px] font-medium border-[#7BEBC2]/30 text-[#7BEBC2]">
                                            {trade.strategy.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                          </Badge>
                                        : <span className="font-mono font-medium tabular-nums">—</span>
                                      }
                                    </div>
                                  </div>
                                  {trade.fee > 0 && (
                                    <div>
                                      <span className="text-muted-foreground">Trading Fees</span>
                                      <p className="font-mono font-medium tabular-nums text-loss">-${trade.fee.toFixed(2)}</p>
                                    </div>
                                  )}
                                </div>
                                {trade.exitPrice != null && trade.entryPrice != null && trade.entryPrice > 0 && (
                                  <div className="mt-4">
                                    <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                                      <span>Entry: ${fmtPrice(trade.entryPrice)}</span>
                                      <span>Exit: ${fmtPrice(trade.exitPrice)}</span>
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
                                      <span className="font-mono tabular-nums">${fmtPrice(trade.entryPrice)}</span>
                                      <span className={isWin ? "text-gain" : "text-loss"}>{"-->"}</span>
                                      <span className="font-mono tabular-nums">${fmtPrice(trade.exitPrice)}</span>
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
            {totalTradesPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
                <p className="text-xs text-muted-foreground">
                  Showing {(tradesPage - 1) * TRADES_PER_PAGE + 1}–{Math.min(tradesPage * TRADES_PER_PAGE, filteredTrades.length)} of {filteredTrades.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTradesPage((p) => Math.max(1, p - 1))}
                    disabled={tradesPage === 1}
                    className="rounded-md border border-white/10 bg-white/5 p-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-medium tabular-nums">{tradesPage} / {totalTradesPages}</span>
                  <button
                    onClick={() => setTradesPage((p) => Math.min(totalTradesPages, p + 1))}
                    disabled={tradesPage === totalTradesPages}
                    className="rounded-md border border-white/10 bg-white/5 p-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            </>)
          })()}
        </div>
      </motion.div>

      {/* Asset Performance Breakdown */}
      {assets.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.3 }}
        >
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
            <h2 className="mb-4 font-display text-lg font-semibold">Asset Performance</h2>
            <div className="space-y-3">
              {assets.map((a) => {
                const maxPnl = Math.max(...assets.map((x) => Math.abs(x.totalPnl)), 1)
                const barWidth = Math.min(Math.abs(a.totalPnl) / maxPnl * 100, 100)
                const isPositive = a.totalPnl >= 0

                return (
                  <div
                    key={a.asset}
                    className="rounded-lg border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-[#7BEBC2]/15"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-display text-sm font-semibold">{a.asset}</span>
                        <span className="text-xs text-muted-foreground">{a.trades} trades</span>
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
                          {formatPnl(a.totalPnl)} USDC
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${barWidth}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className={`h-full rounded-full ${isPositive ? "bg-[#7BEBC2]" : "bg-loss"}`}
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
          </div>
        </motion.div>
      )}

      {/* Hyperliquid info banner */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.35 }}
        className="overflow-hidden rounded-xl border border-[#7BEBC2]/15 bg-gradient-to-r from-[#7BEBC2]/[0.06] via-transparent to-transparent p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-lg">
              <Image
                src="/hype/HYPE_LOGO_400x400.jpg"
                alt="Hyperliquid"
                fill
                className="object-cover"
              />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-[#7BEBC2]">What is Hyperliquid?</h3>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-white/50">
                A high-performance L1 blockchain purpose-built for on-chain finance. Trade perpetual futures with deep liquidity, low fees, and fully on-chain order books.
              </p>
            </div>
          </div>
          <a
            href="https://app.hyperliquid.xyz/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#7BEBC2] px-5 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90"
          >
            Visit Hyperliquid
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
        Data sourced from Hyperliquid mainnet API. All values in USDC. Auto-refreshes every 10-60s.
      </motion.p>

      <FlexCard
        open={flexCardOpen}
        onClose={() => setFlexCardOpen(false)}
        stats={stats ?? null}
        openPositionCount={openPositions.length}
        bestAsset={bestAsset}
        variant="hype"
      />

      {/* Strategy Legend Dialog */}
      <Dialog open={legendOpen} onOpenChange={setLegendOpen}>
        <DialogContent className="border-[#7BEBC2]/20 bg-[#0a0a0f]/95 backdrop-blur-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Shield className="size-5 text-[#7BEBC2]" />
              Strategy Guide
            </DialogTitle>
            <DialogDescription className="text-white/40">
              How each strategy approaches the market
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            {[
              { label: "Sniper", icon: Crosshair, color: "#A855F7", border: "border-purple-500/20", desc: "Waits for high-probability setups across multiple timeframes. Enters with precision on confirmed signals and manages risk with adaptive trailing stops." },
              { label: "Scalper", icon: Bolt, color: "#EC4899", border: "border-pink-500/20", desc: "Ultra-short-term trades capturing rapid price movements. Targets small, high-probability gains with tight stops and fast exits." },
              { label: "Profit Taker", icon: Scissors, color: "#10B981", border: "border-emerald-500/20", desc: "Identifies overextended moves for quick reversal entries. Captures profit from momentum exhaustion with precise timing." },
              { label: "Trend Follower", icon: TrendingUp, color: "#06B6D4", border: "border-cyan-500/20", desc: "Follows the dominant market direction with momentum-based entries. Rides trends with wider stops to avoid premature exits on pullbacks." },
              { label: "Mean Reversion", icon: Repeat, color: "#F97316", border: "border-orange-500/20", desc: "Identifies overextended price moves and trades the snap-back. Enters when price deviates significantly from its average and targets a return to equilibrium." },
              { label: "Funding Capture", icon: DollarSign, color: "#3B82F6", border: "border-blue-500/20", desc: "Collects funding rate payments when rates are elevated. A yield-oriented approach with hedged exposure to minimize directional risk." },
              { label: "Long Flush BB", icon: Flame, color: "#EF4444", border: "border-red-500/20", desc: "Detects liquidation cascades and Bollinger Band flush events. Enters long after forced selling exhausts and price snaps back." },
              { label: "Adopted", icon: Layers, color: "#EAB308", border: "border-yellow-500/20", desc: "Positions inherited from manual entries. The bot monitors and manages exits using the same risk framework as automated trades." },
            ].map((s) => (
              <div key={s.label} className={`flex items-start gap-3 rounded-lg border ${s.border} bg-white/[0.02] p-3`}>
                <div className="mt-0.5 rounded-md p-1.5" style={{ backgroundColor: `${s.color}15` }}>
                  <s.icon className="size-4" style={{ color: s.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 text-sm font-medium" style={{ color: s.color }}>{s.label}</div>
                  <p className="text-xs leading-relaxed text-white/50">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
