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
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

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
  exitPrice: number
  size: number
  pnl: number
  leverage: number | null
  openedAt: string
  closedAt: string
  closeReason: string
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
  size: number
  leverage: number
  unrealizedPnl: number
  marginUsed: number
  liquidationPrice: number | null
  strategy: string | null
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

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })
}

function formatDateTime(d: string): string {
  return new Date(d).toLocaleString("en-US", {
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
      return [...list].sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime())
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

  const totalUnrealizedPnl = useMemo(() => {
    return openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0)
  }, [openPositions])

  const assetHeatmap = useMemo(() => {
    return assets
      .map((a) => ({ asset: a.asset, trades: a.trades, pnl: a.totalPnl }))
      .sort((a, b) => b.trades - a.trades)
  }, [assets])

  const alertTrades = useMemo(() => {
    return (liveData?.recentTrades ?? []).slice(0, 5)
  }, [liveData?.recentTrades])

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
                href="https://hyperliquid.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#7BEBC2] underline-offset-4 hover:underline"
              >
                Hyperliquid
              </a>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <div className="mx-1 h-5 w-px bg-white/[0.08]" />
          <a
            href="https://hyperliquid.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[#7BEBC2]/30 bg-[#7BEBC2]/10 px-4 py-2 text-xs font-medium text-[#7BEBC2] transition-all hover:border-[#7BEBC2]/50 hover:bg-[#7BEBC2]/15"
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
        className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6"
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
          label="Open Positions"
          value={`${openPositions.length}`}
          icon={Crosshair}
          color="text-[#7BEBC2]"
          sub={loadingLive ? "Loading..." : "Active now"}
        />
        <StatCard
          label="Best Asset"
          value={bestAsset}
          icon={Trophy}
          color="text-[#7BEBC2]"
          sub="By total P&L"
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
              <AreaChart data={timeline} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="hypePnlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7BEBC2" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#7BEBC2" stopOpacity={0} />
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
                  tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}`}
                />
                <Tooltip content={<PnlTooltip />} />
                <Area
                  type="monotone"
                  dataKey="cumulativePnl"
                  stroke="#7BEBC2"
                  strokeWidth={2}
                  fill="url(#hypePnlGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#7BEBC2", stroke: "#0A0E17", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      {/* Risk Exposure */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.14 }}
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
                        <Badge variant="outline" className="text-[10px] font-medium border-[#7BEBC2]/30 text-[#7BEBC2]">
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
                  {/* Unrealized P&L banner */}
                  <div className={`mb-3 flex items-center justify-between rounded-md px-3 py-1.5 text-xs font-mono tabular-nums ${
                    pos.unrealizedPnl >= 0
                      ? "bg-gain-bg text-gain"
                      : "bg-loss-bg text-loss"
                  }`}>
                    <span className="font-medium">
                      {pos.unrealizedPnl >= 0 ? "+" : ""}{fmtNum(pos.unrealizedPnl)} USDC
                    </span>
                    {pos.marginUsed > 0 && (
                      <span className="text-[10px] opacity-80">
                        {formatPct((pos.unrealizedPnl / pos.marginUsed) * 100)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Size</span>
                      <p className="font-mono font-medium tabular-nums">{pos.size}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Entry</span>
                      <p className="font-mono font-medium tabular-nums">${fmtNum(pos.entryPrice)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Margin</span>
                      <p className="font-mono font-medium tabular-nums">${fmtNum(pos.marginUsed)}</p>
                    </div>
                    {pos.liquidationPrice && (
                      <div>
                        <span className="text-muted-foreground">Liq. Price</span>
                        <p className="font-mono font-medium tabular-nums text-loss">
                          ${fmtNum(pos.liquidationPrice)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
                    <th className="pb-3 pr-3">Asset</th>
                    <th className="pb-3 pr-3">Side</th>
                    <th className="pb-3 pr-3 text-right">Size</th>
                    <th className="pb-3 pr-3 text-right">Price</th>
                    <th className="pb-3 pr-3 text-right">P&L</th>
                    <th className="pb-3 pr-3 text-right">Fee</th>
                    <th className="pb-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTrades.map((trade) => {
                    const pnl = trade.pnl ?? 0
                    const isWin = pnl > 0
                    const isExpanded = expandedTradeId === trade.id
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
                          <td className="py-3 pr-3 text-right font-mono tabular-nums">
                            {trade.size}
                          </td>
                          <td className="py-3 pr-3 text-right font-mono tabular-nums">
                            ${fmtNum(trade.exitPrice)}
                          </td>
                          <td
                            className={`py-3 pr-3 text-right font-mono font-semibold tabular-nums ${
                              isWin ? "text-gain" : "text-loss"
                            }`}
                          >
                            {formatPnl(pnl)} USDC
                          </td>
                          <td className="py-3 pr-3 text-right font-mono tabular-nums text-xs text-muted-foreground">
                            ${fmtNum(trade.fee)}
                          </td>
                          <td className="py-3 text-right text-xs text-muted-foreground">
                            <div className="flex items-center justify-end gap-1" title={timeAgo(trade.closedAt)}>
                              <Calendar className="h-3 w-3" />
                              {formatDateTime(trade.closedAt)}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="p-0">
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                transition={{ duration: 0.2 }}
                                className={`border-b border-white/5 px-6 py-4 ${
                                  isWin ? "bg-gain/[0.04]" : pnl < 0 ? "bg-loss/[0.04]" : "bg-white/[0.03]"
                                }`}
                              >
                                <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                                  <div>
                                    <span className="text-muted-foreground">Exit Price</span>
                                    <p className="font-mono font-medium tabular-nums">${fmtNum(trade.exitPrice)}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Size</span>
                                    <p className="font-mono font-medium tabular-nums">{trade.size}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Fee</span>
                                    <p className="font-mono font-medium tabular-nums text-muted-foreground">${fmtNum(trade.fee)}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Net P&L</span>
                                    <p className={`font-mono font-medium tabular-nums ${isWin ? "text-gain" : "text-loss"}`}>
                                      {formatPnl(pnl)} USDC
                                    </p>
                                  </div>
                                </div>
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
            href="https://hyperliquid.xyz"
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
    </div>
  )
}
