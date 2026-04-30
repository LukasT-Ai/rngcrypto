"use client"

import { useState, useMemo } from "react"
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
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

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
}

interface OverviewResponse {
  stats: OverallStats
  assets: AssetStats[]
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

function formatPnl(val: number): string {
  const sign = val >= 0 ? "+" : ""
  return `${sign}${val.toFixed(2)}`
}

function formatPct(val: number): string {
  const sign = val >= 0 ? "+" : ""
  return `${sign}${val.toFixed(1)}%`
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

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatDateTime(d: string): string {
  return new Date(d).toLocaleString("en-US", {
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
  const [timeframe, setTimeframe] = useState<number>(90)

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
    () => (assetFilter === "all" ? trades : trades.filter((t) => t.asset === assetFilter)),
    [trades, assetFilter]
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
              <h1 className="font-display text-3xl font-bold tracking-tight text-[#E8622C]">Ascend Bot</h1>
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
        <div className="flex items-center gap-3">
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
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {openPositions.length} active
            </span>
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
                  <div className="grid grid-cols-2 gap-y-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Margin</span>
                      <p className="font-mono font-medium tabular-nums">${pos.margin.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Entry</span>
                      <p className="font-mono font-medium tabular-nums">{pos.entryPrice.toFixed(4)}</p>
                    </div>
                    {pos.tpPrice && (
                      <div>
                        <span className="text-muted-foreground">TP</span>
                        <p className="font-mono font-medium tabular-nums text-gain">
                          {pos.tpPrice.toFixed(4)}
                        </p>
                      </div>
                    )}
                    {pos.slPrice && (
                      <div>
                        <span className="text-muted-foreground">SL</span>
                        <p className="font-mono font-medium tabular-nums text-loss">
                          {pos.slPrice.toFixed(4)}
                        </p>
                      </div>
                    )}
                    <div className="col-span-2">
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
              ))}
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
                onChange={(e) => setAssetFilter(e.target.value)}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground backdrop-blur-sm focus:border-[#E8622C] focus:outline-none focus:ring-1 focus:ring-[#E8622C]"
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
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              No trades found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead>
                  <tr className="border-b border-[#E8622C]/10 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 pr-3">Asset</th>
                    <th className="pb-3 pr-3">Side</th>
                    <th className="pb-3 pr-3">Source</th>
                    <th className="pb-3 pr-3 text-right">Margin</th>
                    <th className="pb-3 pr-3 text-right">Lev.</th>
                    <th className="pb-3 pr-3 text-right">Entry</th>
                    <th className="pb-3 pr-3 text-right">Exit</th>
                    <th className="pb-3 pr-3 text-right">P&L</th>
                    <th className="pb-3 pr-3 text-right">Duration</th>
                    <th className="pb-3 pr-3 text-right">Closed</th>
                    <th className="pb-3 text-right">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map((trade) => {
                    const pnl = trade.pnl ?? 0
                    const isWin = pnl > 0
                    const pnlPct =
                      trade.margin > 0
                        ? (pnl / trade.margin) * 100
                        : 0
                    return (
                      <tr
                        key={trade.id}
                        className={`border-b border-white/5 transition-colors ${
                          isWin
                            ? "bg-gain/[0.02] hover:bg-gain/[0.04]"
                            : pnl < 0
                              ? "bg-loss/[0.02] hover:bg-loss/[0.04]"
                              : "hover:bg-white/[0.04]"
                        }`}
                      >
                        <td className="py-3 pr-3 font-mono font-medium tabular-nums">{trade.asset}</td>
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
                        <td className="py-3 pr-3">
                          {trade.priceSource && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-medium ${
                                trade.priceSource === "momentum"
                                  ? "border-purple-500/30 text-purple-400"
                                  : trade.priceSource === "auto_trader"
                                    ? "border-blue-500/30 text-blue-400"
                                    : trade.priceSource.includes("reentry")
                                      ? "border-orange-500/30 text-orange-400"
                                      : "border-white/10 text-muted-foreground"
                              }`}
                            >
                              {trade.priceSource.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums">
                          ${trade.margin.toFixed(2)}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums">{trade.leverage}x</td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums">
                          {trade.entryPrice.toFixed(4)}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums">
                          {trade.exitPrice?.toFixed(4) ?? "—"}
                        </td>
                        <td
                          className={`py-3 pr-3 text-right font-mono font-semibold tabular-nums ${
                            isWin ? "text-gain" : "text-loss"
                          }`}
                        >
                          <div>{trade.pnl != null ? formatPnl(pnl) : "—"}</div>
                          <div className="text-xs opacity-70">{trade.pnl != null ? formatPct(pnlPct) : ""}</div>
                        </td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums text-xs text-muted-foreground">
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
                    )
                  })}
                </tbody>
              </table>
            </div>
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
    </div>
  )
}
