"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Copy,
  Check,
  ArrowUpRight,
  Gauge,
  BarChart3,
  Target,
  Shield,
  Zap,
  Hash,
  Layers,
  Eye,
  Minus,
  RefreshCw,
  Pause,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  GitBranch,
  BarChart,
  Waves,
  ChevronRight,
  Trophy,
  Calendar,
  Newspaper,
  HelpCircle,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Tickers
// ---------------------------------------------------------------------------

const TICKERS = [
  { symbol: "BTC", label: "Bitcoin", color: "#F7931A" },
  { symbol: "ETH", label: "Ethereum", color: "#627EEA" },
  { symbol: "BNB", label: "BNB", color: "#F3BA2F" },
  { symbol: "ADA", label: "Cardano", color: "#0033AD" },
  { symbol: "HYPE", label: "Hyperliquid", color: "#7BEBC2" },
  { symbol: "ZEC", label: "Zcash", color: "#ECB244" },
  { symbol: "PUMP", label: "PumpFun", color: "#FF6B6B" },
  { symbol: "NIGHT", label: "Night", color: "#8B5CF6" },
  { symbol: "SKHYNIX", label: "SK Hynix", color: "#E8622C" },
  { symbol: "GOLD", label: "Gold", color: "#FFD700" },
  { symbol: "XRP", label: "XRP", color: "#23292F" },
  { symbol: "SOL", label: "Solana", color: "#9945FF" },
  { symbol: "NEAR", label: "NEAR", color: "#00C08B" },
  { symbol: "OIL", label: "WTI Oil", color: "#8B6914" },
  { symbol: "SILVER", label: "Silver", color: "#C0C0C0" },
  { symbol: "TSLA", label: "Tesla", color: "#CC0000" },
  { symbol: "NVDA", label: "Nvidia", color: "#76B900" },
  { symbol: "GOOGL", label: "Google", color: "#4285F4" },
  { symbol: "COIN", label: "Coinbase", color: "#0052FF" },
  { symbol: "MU", label: "Micron", color: "#1A1AFF" },
  { symbol: "SP500", label: "S&P 500", color: "#E63946" },
  { symbol: "NAS100", label: "Nasdaq 100", color: "#457B9D" },
  { symbol: "CRCL", label: "Circle", color: "#00D395" },
  { symbol: "MINIMAX", label: "MiniMax", color: "#FF8C42" },
  { symbol: "SPCX", label: "SpaceX", color: "#005288" },
  { symbol: "DRAM", label: "DRAM", color: "#0EA5E9" },
  { symbol: "AAOI", label: "AAOI", color: "#DC2626" },
  { symbol: "SNDK", label: "SanDisk", color: "#E11D48" },
  { symbol: "UNITREE", label: "Unitree", color: "#059669" },
  { symbol: "ZHIPU", label: "Zhipu AI", color: "#7C3AED" },
  { symbol: "CXMT", label: "CXMT", color: "#0284C7" },
]

// ---------------------------------------------------------------------------
// Types — matches /api/signals v2 response shape
// ---------------------------------------------------------------------------

interface SignalsResponse {
  timestamp: number
  asset: string
  assetLabel: string
  price: {
    mark: number
    last: number
    high24h: number
    low24h: number
    change24h: number
  }
  indicators: {
    rsi: number
    rsi5m: number | null
    stochRsi: { k: number; d: number }
    ema9: number
    ema21: number
    ema50: number
    ema200: number | null
    sma50: number | null
    sma200: number | null
    macd: { value: number; signal: number; histogram: number }
    adx: number
    atr: number
    bb: { upper: number; middle: number; lower: number; width: number }
    regime: string
    trendDirection: string
    supertrend: number
  }
  htf: {
    rsi1h: number
    trend1h: string
    rsi4h: number
    trend4h: string
    rsiDaily: number | null
    trendDaily: string | null
  }
  levels: {
    supports: number[]
    resistances: number[]
    fibonacci: { level: string; price: number }[]
    dailyHigh: number | null
    dailyLow: number | null
    weeklyHigh: number | null
    weeklyLow: number | null
  }
  volume: {
    current: number
    average: number
    ratio: number
    trend: string
    cvd: number
  }
  market: {
    fearGreed: { value: number; classification: string } | null
    btcDominance: number | null
    openInterest: number | null
    fundingRate: number | null
    deribitFunding8h: number | null
    putCallRatio: number | null
    hashRate: number | null
    etfFlow: { net: number; description: string } | null
    liquidations: { longLiqs24h: number | null; shortLiqs24h: number | null } | null
  }
  divergences: {
    rsiDivergence15m: string | null
    rsiDivergence1h: string | null
    macdDivergence: string | null
    volumeDivergence: string | null
  }
  patterns: {
    candlestick: string | null
    squeeze: string | null
  }
  call: {
    bias: "LONG" | "SHORT" | "WAIT"
    confidence: number
    grade: string
    regime: string
    entry: number
    secondaryEntry: number | null
    stopLoss: number
    secondaryStopLoss: number | null
    tp1: number
    tp2: number
    tp3: number
    extendedTarget: number | null
    riskReward: number
    reasoning: string[]
    bullCase: string[]
    bearCase: string[]
    confirms: string[]
    invalidates: string[]
    catalystRisk: string | null
    signalFactors: { category: string; assessment: string; weight: number }[]
  }
  newsSentiment?: {
    score: number
    label: string
    headlines: { title: string; sentiment: string }[]
  } | null
  positioning?: {
    longShortRatio: number | null
    longShortChange: number | null
    topTraderLongRatio: number | null
    openInterestChange: number | null
    takerBuySellRatio: number | null
    binanceOI: number | null
    okxOI: number | null
    squeezeRisk: string | null
  } | null
  events?: { name: string; time: string; impact: string; currency: string }[]
  candles: { time: number; open: number; high: number; low: number; close: number }[]
}

interface HotPlay {
  symbol: string
  label: string
  color: string
  price: number
  change24h: number
  bias: "LONG" | "SHORT" | "WAIT"
  confidence: number
  grade: string
  entry: number
  stopLoss: number
  tp1: number
  riskReward: number
  regime: string
  reasoning: string[]
}

interface HotResponse {
  timestamp: number
  hot: HotPlay[]
  all: HotPlay[]
}

interface SignalLog {
  id: string
  symbol: string
  timestamp: number
  bias: "LONG" | "SHORT"
  confidence: number
  grade: string
  entry: number
  stopLoss: number
  tp1: number
  tp2: number
  tp3: number
  priceAtSignal: number
  outcome: "pending" | "tp1" | "tp2" | "tp3" | "stopped" | "expired"
  outcomePrice: number | null
  outcomeTimestamp: number | null
  maxFavorable: number | null
  maxAdverse: number | null
}

interface HistoryResponse {
  signals: SignalLog[]
  stats: {
    total: number
    wins: number
    losses: number
    pending: number
    expired: number
    winRate: number
    avgConfidence: number
    avgRR: number
    profitFactor: number
    bySymbol: Record<string, { total: number; wins: number; losses: number; winRate: number }>
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (n: number | null | undefined, decimals = 2) => {
  if (n == null) return "—"
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

const fmtPrice = (n: number | null | undefined) => {
  if (n == null) return "—"
  if (Math.abs(n) >= 1000) return fmt(n, 0)
  if (Math.abs(n) >= 1) return fmt(n, 2)
  if (Math.abs(n) >= 0.01) return fmt(n, 4)
  return fmt(n, 6)
}

const fmtCompact = (n: number | null | undefined) => {
  if (n == null) return "—"
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(2)
}

const priceDp = (price: number) => {
  if (price >= 1000) return 0
  if (price >= 1) return 2
  if (price >= 0.01) return 4
  return 6
}

const pctColor = (v: number | null) => {
  if (v == null) return "text-white/50"
  return v >= 0 ? "text-[#00FF88]" : "text-[#FF3B5C]"
}

const dirColor = (d: string) => {
  if (d === "LONG" || d === "bull") return "#00FF88"
  if (d === "SHORT" || d === "bear") return "#FF3B5C"
  if (d === "WAIT") return "#F59E0B"
  return "#6B7280"
}

const gradeColor = (g: string) => {
  if (g === "A+") return "#F59E0B"
  if (g === "A") return "#00FF88"
  if (g === "B") return "#F59E0B"
  return "#6B7280"
}

const assessmentColor = (a: string) => {
  const l = a.toLowerCase()
  if (l.includes("strong bullish")) return "#00FF88"
  if (l.includes("bullish")) return "#00CC6A"
  if (l.includes("slightly bullish")) return "#7BEBC2"
  if (l.includes("strong bearish")) return "#FF3B5C"
  if (l.includes("bearish")) return "#FF6B7F"
  if (l.includes("slightly bearish")) return "#FFB3BD"
  return "#6B7280"
}

const divColor = (d: string | null) => {
  if (!d) return "#6B7280"
  const l = d.toLowerCase()
  if (l.includes("hidden bull")) return "#7BEBC2"
  if (l.includes("bull")) return "#00FF88"
  if (l.includes("hidden bear")) return "#FFB3BD"
  if (l.includes("bear")) return "#FF3B5C"
  return "#6B7280"
}

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" as const },
}

// ---------------------------------------------------------------------------
// Copy Button
// ---------------------------------------------------------------------------

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [value])
  return (
    <button
      onClick={copy}
      className="ml-2 inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  sub?: string
  color?: string
  icon?: React.ElementType
  accent?: string
}) {
  return (
    <motion.div
      {...fadeUp}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
    >
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="size-3.5 text-white/30" />}
        <span className="text-[10px] uppercase tracking-wider text-white/40">
          {label}
        </span>
      </div>
      <p
        className="font-mono text-lg font-bold tabular-nums"
        style={{ color: color ?? accent ?? "#F59E0B" }}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-white/40 mt-0.5">{sub}</p>}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Price Level Row
// ---------------------------------------------------------------------------

function PriceLevel({
  label,
  price,
  color,
  icon: Icon,
  dp,
}: {
  label: string
  price: number | null
  color: string
  icon: React.ElementType
  dp?: number
}) {
  if (price == null) return null
  const decimals = dp ?? priceDp(price)
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center gap-2">
        <Icon className="size-4" style={{ color }} />
        <span className="text-sm text-white/60">{label}</span>
      </div>
      <div className="flex items-center">
        <span className="font-mono text-sm font-semibold tabular-nums" style={{ color }}>
          ${fmt(price, decimals)}
        </span>
        <CopyBtn value={price.toFixed(decimals)} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Countdown Hook
// ---------------------------------------------------------------------------

function useCountdown(interval: number, lastFetch: number) {
  const [remaining, setRemaining] = useState(interval)
  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - lastFetch
      setRemaining(Math.max(0, Math.ceil((interval - elapsed) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [interval, lastFetch])
  return remaining
}

// ---------------------------------------------------------------------------
// Loading Skeleton (receives ticker bar so it persists during loading)
// ---------------------------------------------------------------------------

function SkeletonContent() {
  return (
    <div className="space-y-6">
      <div className="h-12 w-64 rounded-lg bg-white/[0.04] animate-pulse" />
      <div className="h-48 rounded-xl bg-white/[0.04] animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Alert Banner
// ---------------------------------------------------------------------------

function AlertBanner({ icon: Icon, color, children }: { icon: React.ElementType; color: string; children: React.ReactNode }) {
  return (
    <motion.div
      {...fadeUp}
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ backgroundColor: `${color}10`, border: `1px solid ${color}30` }}
    >
      <Icon className="size-5 shrink-0" style={{ color }} />
      <span className="text-sm font-medium" style={{ color }}>{children}</span>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Divergence Card
// ---------------------------------------------------------------------------

function DivergenceCard({ label, value }: { label: string; value: string | null }) {
  const display = value ?? "None"
  const color = divColor(value)
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
      <p className="font-mono text-sm font-bold mt-1" style={{ color }}>{display}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Signal Factor Row
// ---------------------------------------------------------------------------

function FactorRow({ category, assessment, weight }: { category: string; assessment: string; weight: number }) {
  const color = assessmentColor(assessment)
  return (
    <div className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-sm text-white/60 w-36 shrink-0">{category}</span>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold" style={{ color }}>{assessment}</span>
          <span className="text-[10px] text-white/30 font-mono">{weight}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${weight}%`, backgroundColor: color }} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quick Guide Modal
// ---------------------------------------------------------------------------

function GuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  const sections = [
    {
      title: "Signal Grades",
      color: "#F59E0B",
      items: [
        { label: "A+", desc: "Highest conviction. 3+ categories aligned, confidence 85+. Rare." },
        { label: "A", desc: "Strong setup. Confidence 75+. Worth a trade with proper sizing." },
        { label: "B", desc: "Decent setup. Confidence 60+. Consider smaller position." },
        { label: "C", desc: "Marginal. Confidence 45+. High risk, needs extra confirmation." },
        { label: "NO TRADE", desc: "Below threshold. Stay out." },
      ],
    },
    {
      title: "Bias",
      color: "#00FF88",
      items: [
        { label: "LONG", desc: "Multi-factor engine favors upside. TPs are above entry." },
        { label: "SHORT", desc: "Multi-factor engine favors downside. TPs are below entry." },
        { label: "WAIT", desc: "Conditions are unclear. No active setup. Don't force a trade." },
      ],
    },
    {
      title: "Regime",
      color: "#627EEA",
      items: [
        { label: "Trending", desc: "ADX > 25. Price is moving directionally. Favor trend-following entries." },
        { label: "Transitional", desc: "ADX 20-25. Market shifting between trend and range. Be cautious." },
        { label: "Ranging", desc: "ADX < 20. Choppy price action. Fade extremes, tighten stops." },
      ],
    },
    {
      title: "What to Look At First",
      color: "#FF3B5C",
      items: [
        { label: "1. Grade + Bias", desc: "If it's C or NO TRADE, skip. Only trade A+/A/B setups." },
        { label: "2. HTF Alignment", desc: "Check if 1H, 4H, Daily trends agree. Aligned = stronger signal." },
        { label: "3. Confluence", desc: "More green categories = higher conviction. Mixed = weaker." },
        { label: "4. R:R Ratio", desc: "Only take trades where reward is at least 1.5x the risk." },
        { label: "5. Alerts", desc: "Squeeze and catalyst warnings override everything. Respect them." },
      ],
    },
    {
      title: "Key Indicators",
      color: "#7BEBC2",
      items: [
        { label: "RSI", desc: "Below 30 = oversold (look for longs). Above 70 = overbought (look for shorts)." },
        { label: "MACD", desc: "Positive histogram = bullish momentum. Negative = bearish." },
        { label: "Supertrend", desc: "Bullish/Bearish overlay. Confirms or contradicts the EMA stack." },
        { label: "Bollinger Bands", desc: "Price at lower band = potential bounce. Upper = potential rejection." },
        { label: "CVD", desc: "Cumulative Volume Delta. Positive = net buyers. Negative = net sellers." },
        { label: "Divergences", desc: "Price makes new low but RSI doesn't = bullish reversal signal." },
      ],
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0A0E17] shadow-2xl scrollbar-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#0A0E17]/95 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <HelpCircle className="size-5 text-[#F59E0B]" />
            <h2 className="text-lg font-bold text-white">Quick Guide</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {sections.map((section) => (
            <div key={section.title}>
              <h3
                className="text-xs font-bold uppercase tracking-wider mb-3"
                style={{ color: section.color }}
              >
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2.5"
                  >
                    <span
                      className="shrink-0 font-mono text-xs font-bold mt-0.5 min-w-[80px]"
                      style={{ color: section.color }}
                    >
                      {item.label}
                    </span>
                    <span className="text-sm text-white/60 leading-relaxed">
                      {item.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/[0.04] p-4">
            <p className="text-xs text-[#F59E0B]/80 leading-relaxed">
              Signals auto-refresh every 30 seconds. This is a decision-support tool, not financial advice.
              Always manage risk, use stop losses, and never risk more than you can afford to lose.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export default function SignalsDashboard() {
  const [symbol, setSymbol] = useState("BTC")
  const [fetchTs, setFetchTs] = useState(Date.now())
  const [guideOpen, setGuideOpen] = useState(false)

  const accent = TICKERS.find((t) => t.symbol === symbol)?.color ?? "#F59E0B"

  const { data, isLoading } = useQuery<SignalsResponse>({
    queryKey: ["signals", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/signals?symbol=${symbol}`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      setFetchTs(Date.now())
      return res.json()
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  })

  const { data: hotData } = useQuery<HotResponse>({
    queryKey: ["signals-hot"],
    queryFn: async () => {
      const res = await fetch("/api/signals/hot")
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  })

  const { data: historyData } = useQuery<HistoryResponse>({
    queryKey: ["signals-history"],
    queryFn: async () => {
      const res = await fetch("/api/signals/history")
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    refetchInterval: 60_000,
  })

  useEffect(() => {
    const check = () => fetch("/api/signals/history/check", { method: "POST" }).catch(() => {})
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [])

  const countdown = useCountdown(30_000, fetchTs)

  const d = data
  const call = d?.call
  const ind = d?.indicators
  const market = d?.market
  const vol = d?.volume
  const divs = d?.divergences
  const pats = d?.patterns

  const callDir = call?.bias ?? "WAIT"
  const callColor = dirColor(callDir)
  const trendColor = dirColor(ind?.trendDirection ?? "mixed")

  const currentPrice = d?.price?.mark ?? 0
  const change24h = d?.price?.change24h ?? null
  const dp = currentPrice > 0 ? priceDp(currentPrice) : 2

  return (
    <div className="min-h-screen bg-[#06080F] pt-24 pb-16">
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      <div className="mx-auto max-w-7xl px-4 lg:px-8 space-y-6">

        {/* ── Hot Plays Banner ────────────────────────────────────────── */}
        {hotData && hotData.hot.length > 0 && (
          <motion.div {...fadeUp}>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="size-4 text-[#F59E0B]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[#F59E0B]">
                Hot Plays
              </span>
              <span className="text-[10px] text-white/30">Score 75+</span>
              {hotData.hot.length > 6 && (
                <span className="text-[10px] text-white/20 ml-auto">{hotData.hot.length} signals</span>
              )}
            </div>
            {(() => {
              const shouldScroll = hotData.hot.length > 6
              const plays = shouldScroll ? [...hotData.hot, ...hotData.hot] : hotData.hot
              return (
                <div className={cn("relative", shouldScroll && "overflow-hidden")}>
                  {shouldScroll && (
                    <>
                      <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#06080F] to-transparent z-10 pointer-events-none" />
                      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#06080F] to-transparent z-10 pointer-events-none" />
                    </>
                  )}
                  <div
                    className={cn(
                      "flex gap-3 pb-2",
                      shouldScroll ? "animate-hot-scroll hover:[animation-play-state:paused]" : "overflow-x-auto scrollbar-none"
                    )}
                  >
                    {plays.map((play, i) => (
                      <button
                        key={`${play.symbol}-${i}`}
                        onClick={() => setSymbol(play.symbol)}
                        className="shrink-0 rounded-xl border bg-white/[0.02] p-4 transition-all duration-200 hover:bg-white/[0.05] min-w-[220px]"
                        style={{ borderColor: `${play.color}40` }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
                              style={{ backgroundColor: `${play.color}20`, color: play.color }}
                            >
                              {play.symbol}
                            </span>
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase flex items-center gap-1"
                              style={{
                                backgroundColor: `${dirColor(play.bias)}15`,
                                color: dirColor(play.bias),
                              }}
                            >
                              {play.bias === "LONG" ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                              {play.bias}
                            </span>
                          </div>
                          <span
                            className="text-xs font-black"
                            style={{ color: gradeColor(play.grade) }}
                          >
                            {play.grade}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between mb-2">
                          <span className="font-mono text-lg font-bold text-white tabular-nums">
                            ${fmtPrice(play.price)}
                          </span>
                          <span className={cn("font-mono text-xs font-semibold tabular-nums", play.change24h >= 0 ? "text-[#00FF88]" : "text-[#FF3B5C]")}>
                            {play.change24h >= 0 ? "+" : ""}{play.change24h.toFixed(2)}%
                          </span>
                        </div>
                        <div className="mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-white/40">Confidence</span>
                            <span className="font-mono text-xs font-bold" style={{ color: play.color }}>
                              {play.confidence}/100
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${play.confidence}%`, backgroundColor: play.color }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-white/40">
                          <span>R:R 1:{play.riskReward.toFixed(1)}</span>
                          <span className="flex items-center gap-1" style={{ color: play.color }}>
                            View <ChevronRight className="size-3" />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })()}
          </motion.div>
        )}

        {/* ── Ticker Selector Bar ─────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {TICKERS.map((t) => {
            const active = t.symbol === symbol
            const score = hotData?.all?.find((h) => h.symbol === t.symbol)?.confidence ?? null
            const scoreColor = score != null ? (score >= 75 ? "#00FF88" : score >= 55 ? "#F59E0B" : "#FF3B5C") : undefined
            return (
              <button
                key={t.symbol}
                onClick={() => setSymbol(t.symbol)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition-all duration-200 border",
                  active
                    ? "text-white border-transparent"
                    : "border-white/10 hover:border-white/20 bg-transparent"
                )}
                style={active
                  ? { backgroundColor: t.color, borderColor: t.color }
                  : { color: scoreColor ?? "rgba(255,255,255,0.4)" }
                }
              >
                {t.symbol}
              </button>
            )
          })}
        </div>

        {isLoading ? (
          <SkeletonContent />
        ) : (
          <>
            {/* ── 1. Header ───────────────────────────────────────────── */}
            <motion.div {...fadeUp} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="h-2.5 w-2.5 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide"
                    style={{ backgroundColor: `${accent}20`, color: accent }}
                  >
                    {d?.asset ?? symbol}
                  </span>
                  <h1 className="text-2xl font-bold text-white">Signals</h1>
                  <button
                    onClick={() => setGuideOpen(true)}
                    className="rounded-full p-1 text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                    title="Quick Guide"
                  >
                    <HelpCircle className="size-4" />
                  </button>
                  {ind && (
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide"
                      style={{ backgroundColor: `${trendColor}15`, color: trendColor }}
                    >
                      {ind.trendDirection}
                    </span>
                  )}
                  {call && (
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-black uppercase tracking-wide"
                      style={{ backgroundColor: `${gradeColor(call.grade)}15`, color: gradeColor(call.grade) }}
                    >
                      {call.grade}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-4xl font-black tabular-nums text-white">
                    ${fmtPrice(currentPrice)}
                  </span>
                  {change24h != null && (
                    <span className={cn("font-mono text-sm font-semibold tabular-nums", pctColor(change24h))}>
                      {change24h >= 0 ? "+" : ""}
                      {change24h.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-white/40">
                <RefreshCw className="size-3.5" />
                <span>
                  {d?.timestamp
                    ? `Last scan: ${new Date(d.timestamp).toLocaleTimeString()}`
                    : "Connecting..."}
                </span>
                <span className="font-mono" style={{ color: accent }}>{countdown}s</span>
              </div>
            </motion.div>

            {/* ── 2. Alert Banners ──────────────────────────────────────── */}
            {call?.bias === "WAIT" && (
              <AlertBanner icon={Pause} color={accent}>
                NO ACTIVE SETUP &mdash; Conditions do not favor a trade. Wait for confirmation.
              </AlertBanner>
            )}
            {pats?.squeeze && (
              <AlertBanner icon={AlertTriangle} color={accent}>
                SQUEEZE RISK: {pats.squeeze}
              </AlertBanner>
            )}
            {call?.catalystRisk && (
              <AlertBanner icon={AlertTriangle} color="#FF3B5C">
                CATALYST RISK: {call.catalystRisk}
              </AlertBanner>
            )}

            {/* ── 3. Upcoming Catalysts ────────────────────────────────── */}
            {d?.events && d.events.length > 0 && (
              <motion.div {...fadeUp}>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="size-4" style={{ color: accent }} />
                  <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">
                    Upcoming Catalysts
                  </h2>
                  <span className="text-[10px] text-white/30">Next 24h</span>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
                  {d.events.slice(0, 6).map((event, i) => {
                    const eventTime = new Date(event.time)
                    const msUntil = eventTime.getTime() - Date.now()
                    const hoursUntil = msUntil / (60 * 60 * 1000)
                    const countdown = hoursUntil < 1
                      ? `${Math.max(1, Math.round(hoursUntil * 60))}m`
                      : hoursUntil < 24
                        ? `${Math.floor(hoursUntil)}h ${Math.round((hoursUntil % 1) * 60)}m`
                        : `${Math.round(hoursUntil)}h`
                    const impactColor = event.impact === "high"
                      ? "#FF3B5C"
                      : event.impact === "medium"
                        ? "#F59E0B"
                        : "#6B7280"
                    const isImminent = hoursUntil <= 2

                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center justify-between px-4 py-2.5",
                          isImminent && "bg-[#FF3B5C]/[0.03]"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: impactColor }}
                          />
                          <span className="text-sm text-white/70">{event.name}</span>
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                            style={{ backgroundColor: `${impactColor}15`, color: impactColor }}
                          >
                            {event.impact}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-white/30">{event.currency}</span>
                          <span
                            className="font-mono text-xs font-semibold"
                            style={{ color: isImminent ? "#FF3B5C" : accent }}
                          >
                            in {countdown}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* ── 4. Trade Call Card ────────────────────────────────────── */}
            {call && (
              <motion.div
                {...fadeUp}
                className="relative rounded-xl overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${callColor}08 0%, transparent 60%)`,
                  border: `1px solid ${callColor}30`,
                }}
              >
                <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: callColor }} />
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                      <div
                        className="flex items-center gap-2 rounded-lg px-4 py-2 text-lg font-black uppercase"
                        style={{ backgroundColor: `${callColor}15`, color: callColor }}
                      >
                        {callDir === "LONG" ? (
                          <TrendingUp className="size-5" />
                        ) : callDir === "SHORT" ? (
                          <TrendingDown className="size-5" />
                        ) : (
                          <Pause className="size-5" />
                        )}
                        {callDir}
                      </div>
                      <div
                        className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-black uppercase"
                        style={{ backgroundColor: `${gradeColor(call.grade)}15`, color: gradeColor(call.grade) }}
                      >
                        {call.grade}
                      </div>
                      <div>
                        <span className="text-xs text-white/40 uppercase tracking-wider">Regime</span>
                        <p className="font-mono text-sm font-bold" style={{ color: callColor }}>
                          {call.regime}
                        </p>
                      </div>
                    </div>

                    <div className="w-full sm:w-48">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase tracking-wider text-white/40">Confidence</span>
                        <span className="font-mono text-sm font-bold" style={{ color: callColor }}>
                          {call.confidence}/100
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${call.confidence}%`, backgroundColor: callColor }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04] mb-5">
                    <PriceLevel label="Entry" price={call.entry} color={accent} icon={Target} dp={dp} />
                    {call.secondaryEntry != null && (
                      <PriceLevel label="Secondary Entry" price={call.secondaryEntry} color="#D97706" icon={Target} dp={dp} />
                    )}
                    <PriceLevel label="Stop Loss" price={call.stopLoss} color="#FF3B5C" icon={Shield} dp={dp} />
                    {call.secondaryStopLoss != null && (
                      <PriceLevel label="Secondary SL" price={call.secondaryStopLoss} color="#CC2244" icon={Shield} dp={dp} />
                    )}
                    <PriceLevel label="TP1" price={call.tp1} color="#00FF88" icon={ArrowUpRight} dp={dp} />
                    <PriceLevel label="TP2" price={call.tp2} color="#00CC6A" icon={ArrowUpRight} dp={dp} />
                    <PriceLevel label="TP3" price={call.tp3} color="#00AA55" icon={ArrowUpRight} dp={dp} />
                    {call.extendedTarget != null && (
                      <PriceLevel label="Extended Target" price={call.extendedTarget} color="#00FF88" icon={Zap} dp={dp} />
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="size-4" style={{ color: accent }} />
                    <span className="text-sm text-white/60">Risk : Reward</span>
                    <span className="font-mono text-sm font-bold" style={{ color: accent }}>
                      1 : {call.riskReward.toFixed(1)}
                    </span>
                  </div>

                  {call.reasoning.length > 0 && (
                    <div className="space-y-1.5 mb-5">
                      <span className="text-[10px] uppercase tracking-wider text-white/40">Reasoning</span>
                      <ul className="space-y-1">
                        {call.reasoning.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                            <span className="mt-1.5 h-1 w-1 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(call.bullCase.length > 0 || call.bearCase.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                      {call.bullCase.length > 0 && (
                        <div className="rounded-lg border border-[#00FF88]/20 bg-[#00FF88]/[0.03] p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="size-4 text-[#00FF88]" />
                            <span className="text-xs font-semibold text-[#00FF88] uppercase tracking-wider">Bull Case</span>
                          </div>
                          <ul className="space-y-1">
                            {call.bullCase.map((b, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                                <ChevronRight className="size-3 mt-1 text-[#00FF88] shrink-0" />
                                {b}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {call.bearCase.length > 0 && (
                        <div className="rounded-lg border border-[#FF3B5C]/20 bg-[#FF3B5C]/[0.03] p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingDown className="size-4 text-[#FF3B5C]" />
                            <span className="text-xs font-semibold text-[#FF3B5C] uppercase tracking-wider">Bear Case</span>
                          </div>
                          <ul className="space-y-1">
                            {call.bearCase.map((b, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                                <ChevronRight className="size-3 mt-1 text-[#FF3B5C] shrink-0" />
                                {b}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {(call.confirms.length > 0 || call.invalidates.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {call.confirms.length > 0 && (
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-[#00FF88]/60 mb-2 block">Confirms Trade</span>
                          <ul className="space-y-1">
                            {call.confirms.map((c, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-white/50">
                                <Check className="size-3 mt-1 text-[#00FF88] shrink-0" />
                                {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {call.invalidates.length > 0 && (
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-[#FF3B5C]/60 mb-2 block">Invalidates Trade</span>
                          <ul className="space-y-1">
                            {call.invalidates.map((inv, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-white/50">
                                <AlertTriangle className="size-3 mt-1 text-[#FF3B5C] shrink-0" />
                                {inv}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── 5. Signal Confluence ──────────────────────────────────── */}
            {call && call.signalFactors.length > 0 && (
              <motion.div {...fadeUp}>
                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
                  Signal Confluence
                </h2>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  {call.signalFactors.map((f, i) => (
                    <FactorRow key={i} category={f.category} assessment={f.assessment} weight={f.weight} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── 6. Divergences & Patterns ────────────────────────────── */}
            {divs && (
              <motion.div {...fadeUp}>
                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
                  Divergences &amp; Patterns
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <DivergenceCard label="RSI 15m" value={divs.rsiDivergence15m} />
                  <DivergenceCard label="RSI 1H" value={divs.rsiDivergence1h} />
                  <DivergenceCard label="MACD" value={divs.macdDivergence} />
                  <DivergenceCard label="Volume" value={divs.volumeDivergence} />
                </div>
                {pats?.candlestick && (
                  <div className="mt-3 flex items-center gap-2">
                    <Waves className="size-4" style={{ color: accent }} />
                    <span className="text-xs text-white/40">Candlestick Pattern:</span>
                    <span className="text-sm font-semibold" style={{ color: accent }}>{pats.candlestick}</span>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── 7. Technical Indicators ──────────────────────────────── */}
            <div>
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
                Technical Indicators
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="RSI (14)"
                  value={fmt(ind?.rsi, 1)}
                  sub={
                    ind?.rsi != null
                      ? ind.rsi < 30 ? "Oversold" : ind.rsi > 70 ? "Overbought" : "Neutral"
                      : undefined
                  }
                  color={
                    ind?.rsi != null
                      ? ind.rsi < 30 ? "#00FF88" : ind.rsi > 70 ? "#FF3B5C" : undefined
                      : undefined
                  }
                  accent={accent}
                  icon={Gauge}
                />

                {ind?.rsi5m != null && (
                  <StatCard
                    label="RSI 5m"
                    value={fmt(ind.rsi5m, 1)}
                    sub={
                      ind.rsi5m < 30 ? "Oversold" : ind.rsi5m > 70 ? "Overbought" : "Neutral"
                    }
                    color={
                      ind.rsi5m < 30 ? "#00FF88" : ind.rsi5m > 70 ? "#FF3B5C" : undefined
                    }
                    accent={accent}
                    icon={Gauge}
                  />
                )}

                <StatCard
                  label="Stoch RSI"
                  value={ind?.stochRsi ? `K: ${fmt(ind.stochRsi.k, 1)} / D: ${fmt(ind.stochRsi.d, 1)}` : "—"}
                  sub={
                    ind?.stochRsi
                      ? ind.stochRsi.k > 80 ? "Overbought" : ind.stochRsi.k < 20 ? "Oversold" : "Neutral"
                      : undefined
                  }
                  color={
                    ind?.stochRsi
                      ? ind.stochRsi.k > 80 ? "#FF3B5C" : ind.stochRsi.k < 20 ? "#00FF88" : undefined
                      : undefined
                  }
                  accent={accent}
                  icon={Activity}
                />

                <StatCard
                  label="MACD Hist"
                  value={fmt(ind?.macd?.histogram, 2)}
                  sub={
                    ind?.macd?.histogram != null
                      ? ind.macd.histogram > 0 ? "Bullish momentum" : "Bearish momentum"
                      : undefined
                  }
                  color={
                    ind?.macd?.histogram != null
                      ? ind.macd.histogram > 0 ? "#00FF88" : "#FF3B5C"
                      : undefined
                  }
                  icon={BarChart3}
                />

                <StatCard
                  label="ADX"
                  value={fmt(ind?.adx, 1)}
                  sub={ind?.regime ?? undefined}
                  color={ind?.adx != null ? (ind.adx > 25 ? undefined : "#6B7280") : undefined}
                  accent={accent}
                  icon={Activity}
                />

                <StatCard
                  label="Trend"
                  value={ind?.trendDirection ?? "—"}
                  sub={
                    ind?.ema9 != null && ind?.ema21 != null && ind?.ema50 != null
                      ? `EMA ${ind.ema9 > ind.ema21 ? "9>21" : "21>9"} ${ind.ema21 > ind.ema50 ? ">50" : ""}`
                      : undefined
                  }
                  color={dirColor(ind?.trendDirection ?? "mixed")}
                  icon={TrendingUp}
                />

                <StatCard
                  label="Bollinger"
                  value={
                    ind?.bb && currentPrice > 0
                      ? currentPrice >= ind.bb.upper
                        ? "Upper Band"
                        : currentPrice <= ind.bb.lower
                          ? "Lower Band"
                          : "Middle"
                      : "—"
                  }
                  sub={
                    ind?.bb
                      ? `${fmtPrice(ind.bb.lower)} — ${fmtPrice(ind.bb.upper)}`
                      : undefined
                  }
                  color={
                    ind?.bb && currentPrice > 0
                      ? currentPrice >= ind.bb.upper
                        ? "#FF3B5C"
                        : currentPrice <= ind.bb.lower
                          ? "#00FF88"
                          : undefined
                      : undefined
                  }
                  accent={accent}
                  icon={Layers}
                />

                <StatCard
                  label="BB Width"
                  value={ind?.bb?.width != null ? fmt(ind.bb.width, 4) : "—"}
                  sub={
                    ind?.bb?.width != null
                      ? ind.bb.width < 0.03 ? "Compression" : ind.bb.width > 0.08 ? "Expansion" : "Normal"
                      : undefined
                  }
                  color={
                    ind?.bb?.width != null
                      ? ind.bb.width < 0.03 ? undefined : ind.bb.width > 0.08 ? "#00FF88" : "#6B7280"
                      : undefined
                  }
                  accent={accent}
                  icon={BarChart}
                />

                <StatCard
                  label="ATR (14)"
                  value={currentPrice > 0 && ind?.atr != null ? `$${fmtPrice(ind.atr)}` : "—"}
                  sub={
                    currentPrice > 0 && ind?.atr != null
                      ? `${((ind.atr / currentPrice) * 100).toFixed(2)}% of price`
                      : undefined
                  }
                  accent={accent}
                  icon={Target}
                />

                <StatCard
                  label="Supertrend"
                  value={ind?.supertrend != null ? (ind.supertrend === 1 ? "Bullish" : "Bearish") : "—"}
                  color={ind?.supertrend != null ? (ind.supertrend === 1 ? "#00FF88" : "#FF3B5C") : undefined}
                  icon={Zap}
                />

                <StatCard
                  label="MACD Line"
                  value={fmt(ind?.macd?.value, 2)}
                  sub={
                    ind?.macd != null
                      ? ind.macd.value > ind.macd.signal ? "Above signal" : "Below signal"
                      : undefined
                  }
                  color={
                    ind?.macd != null
                      ? ind.macd.value > ind.macd.signal ? "#00FF88" : "#FF3B5C"
                      : undefined
                  }
                  icon={Zap}
                />

                <StatCard
                  label="EMA 9 / 21 / 50"
                  value={ind?.ema9 != null ? `$${fmtPrice(ind.ema9)}` : "—"}
                  sub={
                    ind?.ema21 != null && ind?.ema50 != null
                      ? `$${fmtPrice(ind.ema21)} / $${fmtPrice(ind.ema50)}`
                      : undefined
                  }
                  accent={accent}
                  icon={Gauge}
                />

                {ind?.ema200 != null && (
                  <StatCard
                    label="EMA 200"
                    value={`$${fmtPrice(ind.ema200)}`}
                    sub={currentPrice > ind.ema200 ? "Price above" : "Price below"}
                    color={currentPrice > ind.ema200 ? "#00FF88" : "#FF3B5C"}
                    icon={TrendingUp}
                  />
                )}
              </div>
            </div>

            {/* ── 8. Volume Analysis ────────────────────────────────────── */}
            {vol && (
              <div>
                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
                  Volume Analysis
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard
                    label="Current Volume"
                    value={fmtCompact(vol.current)}
                    sub={vol.trend}
                    accent={accent}
                    icon={BarChart3}
                  />
                  <StatCard
                    label="Avg Volume"
                    value={fmtCompact(vol.average)}
                    accent={accent}
                    icon={BarChart}
                  />
                  <StatCard
                    label="Volume Ratio"
                    value={fmt(vol.ratio, 2)}
                    sub={vol.ratio > 1.5 ? "High volume" : vol.ratio < 0.5 ? "Low volume" : "Normal"}
                    color={vol.ratio > 1.5 ? "#00FF88" : vol.ratio < 0.5 ? "#FF3B5C" : undefined}
                    accent={accent}
                    icon={Layers}
                  />
                  <StatCard
                    label="CVD"
                    value={fmtCompact(vol.cvd)}
                    sub={vol.cvd > 0 ? "Buyers dominate" : "Sellers dominate"}
                    color={vol.cvd > 0 ? "#00FF88" : "#FF3B5C"}
                    icon={GitBranch}
                  />
                </div>
              </div>
            )}

            {/* ── 9. Market Data ────────────────────────────────────────── */}
            <div>
              <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
                Market Data
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {market?.fearGreed && (
                  <StatCard
                    label="Fear & Greed"
                    value={market.fearGreed.value.toString()}
                    sub={market.fearGreed.classification}
                    color={
                      market.fearGreed.value >= 60 ? "#00FF88" : market.fearGreed.value <= 40 ? "#FF3B5C" : undefined
                    }
                    accent={accent}
                    icon={Eye}
                  />
                )}

                <StatCard
                  label="Funding Rate"
                  value={
                    market?.fundingRate != null
                      ? `${(market.fundingRate * 100).toFixed(4)}%`
                      : "—"
                  }
                  sub={
                    market?.fundingRate != null
                      ? market.fundingRate < 0
                        ? "Shorts paying longs"
                        : market.fundingRate > 0.01 ? "Overleveraged longs" : "Neutral"
                      : undefined
                  }
                  color={
                    market?.fundingRate != null
                      ? market.fundingRate < 0 ? "#00FF88" : market.fundingRate > 0.01 ? "#FF3B5C" : undefined
                      : undefined
                  }
                  accent={accent}
                  icon={Activity}
                />

                {market?.openInterest != null && (
                  <StatCard
                    label="Open Interest"
                    value={`$${fmtCompact(market.openInterest)}`}
                    accent={accent}
                    icon={BarChart3}
                  />
                )}

                {market?.putCallRatio != null && (
                  <StatCard
                    label="Put/Call Ratio"
                    value={fmt(market.putCallRatio, 2)}
                    sub={
                      market.putCallRatio > 1 ? "Bearish sentiment" : market.putCallRatio < 0.7 ? "Bullish sentiment" : "Neutral"
                    }
                    color={
                      market.putCallRatio > 1 ? "#FF3B5C" : market.putCallRatio < 0.7 ? "#00FF88" : undefined
                    }
                    accent={accent}
                    icon={Layers}
                  />
                )}

                {market?.btcDominance != null && (
                  <StatCard
                    label="BTC Dominance"
                    value={`${market.btcDominance.toFixed(1)}%`}
                    accent={accent}
                    icon={Hash}
                  />
                )}

                {market?.hashRate != null && (
                  <StatCard
                    label="Hashrate"
                    value={`${(market.hashRate / 1e9).toFixed(0)} EH/s`}
                    accent={accent}
                    icon={Zap}
                  />
                )}

                {market?.etfFlow && (
                  <StatCard
                    label="ETF Net Flow"
                    value={`$${fmtCompact(market.etfFlow.net)}`}
                    sub={market.etfFlow.description}
                    color={market.etfFlow.net > 0 ? "#00FF88" : "#FF3B5C"}
                    icon={ArrowUpRight}
                  />
                )}

                {market?.liquidations && (
                  <StatCard
                    label="Liquidations 24h"
                    value={
                      market.liquidations.longLiqs24h != null && market.liquidations.shortLiqs24h != null
                        ? `L: $${fmtCompact(market.liquidations.longLiqs24h)} / S: $${fmtCompact(market.liquidations.shortLiqs24h)}`
                        : "—"
                    }
                    sub={
                      market.liquidations.longLiqs24h != null && market.liquidations.shortLiqs24h != null
                        ? (market.liquidations.longLiqs24h > market.liquidations.shortLiqs24h
                            ? "Longs getting squeezed"
                            : "Shorts getting squeezed")
                        : undefined
                    }
                    color={
                      market.liquidations.longLiqs24h != null && market.liquidations.shortLiqs24h != null
                        ? market.liquidations.longLiqs24h > market.liquidations.shortLiqs24h ? "#FF3B5C" : "#00FF88"
                        : undefined
                    }
                    icon={AlertTriangle}
                  />
                )}
              </div>
            </div>

            {/* ── 9a. Positioning & Liquidation ────────────────────────────── */}
            {d?.positioning && (
              <motion.div {...fadeUp}>
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="size-4" style={{ color: accent }} />
                  <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">
                    Positioning &amp; Liquidation
                  </h2>
                  {d.positioning.squeezeRisk && (
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase animate-pulse"
                      style={{
                        backgroundColor: d.positioning.squeezeRisk.includes("long") ? "#FF3B5C15" : "#00FF8815",
                        color: d.positioning.squeezeRisk.includes("long") ? "#FF3B5C" : "#00FF88",
                      }}
                    >
                      {d.positioning.squeezeRisk.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {d.positioning.longShortRatio != null && (
                    <StatCard
                      label="Long/Short Ratio"
                      value={fmt(d.positioning.longShortRatio, 2)}
                      sub={
                        d.positioning.longShortRatio > 1.5
                          ? "Longs crowded"
                          : d.positioning.longShortRatio < 0.7
                            ? "Shorts crowded"
                            : "Balanced"
                      }
                      color={
                        d.positioning.longShortRatio > 1.5
                          ? "#FF3B5C"
                          : d.positioning.longShortRatio < 0.7
                            ? "#00FF88"
                            : undefined
                      }
                      accent={accent}
                      icon={BarChart3}
                    />
                  )}
                  {d.positioning.longShortChange != null && (
                    <StatCard
                      label="L/S Change"
                      value={`${d.positioning.longShortChange >= 0 ? "+" : ""}${d.positioning.longShortChange.toFixed(1)}%`}
                      sub={
                        d.positioning.longShortChange > 20
                          ? "Longs surging"
                          : d.positioning.longShortChange < -20
                            ? "Shorts surging"
                            : "Stable"
                      }
                      color={
                        Math.abs(d.positioning.longShortChange) > 20
                          ? "#F59E0B"
                          : undefined
                      }
                      accent={accent}
                      icon={GitBranch}
                    />
                  )}
                  {d.positioning.topTraderLongRatio != null && (
                    <StatCard
                      label="Top Traders"
                      value={`${(d.positioning.topTraderLongRatio * 100).toFixed(0)}% Long`}
                      sub={
                        d.positioning.topTraderLongRatio > 0.65
                          ? "Smart money bullish"
                          : d.positioning.topTraderLongRatio < 0.35
                            ? "Smart money bearish"
                            : "Neutral"
                      }
                      color={
                        d.positioning.topTraderLongRatio > 0.65
                          ? "#00FF88"
                          : d.positioning.topTraderLongRatio < 0.35
                            ? "#FF3B5C"
                            : undefined
                      }
                      accent={accent}
                      icon={Eye}
                    />
                  )}
                  {d.positioning.openInterestChange != null && (
                    <StatCard
                      label="OI Change"
                      value={`${d.positioning.openInterestChange >= 0 ? "+" : ""}${d.positioning.openInterestChange.toFixed(1)}%`}
                      sub={
                        d.positioning.openInterestChange > 15
                          ? "New money entering"
                          : d.positioning.openInterestChange < -15
                            ? "Positions unwinding"
                            : "Stable"
                      }
                      color={
                        Math.abs(d.positioning.openInterestChange) > 15
                          ? d.positioning.openInterestChange > 0 ? "#00FF88" : "#FF3B5C"
                          : undefined
                      }
                      accent={accent}
                      icon={BarChart3}
                    />
                  )}
                  {d.positioning.takerBuySellRatio != null && (
                    <StatCard
                      label="Taker B/S"
                      value={d.positioning.takerBuySellRatio.toFixed(2)}
                      sub={
                        d.positioning.takerBuySellRatio > 1.3
                          ? "Aggressive buying"
                          : d.positioning.takerBuySellRatio < 0.7
                            ? "Aggressive selling"
                            : "Balanced"
                      }
                      color={
                        d.positioning.takerBuySellRatio > 1.3
                          ? "#00FF88"
                          : d.positioning.takerBuySellRatio < 0.7
                            ? "#FF3B5C"
                            : undefined
                      }
                      accent={accent}
                      icon={Activity}
                    />
                  )}
                  {market?.liquidations && (
                    <StatCard
                      label="Liq Imbalance"
                      value={
                        market.liquidations.longLiqs24h != null && market.liquidations.shortLiqs24h != null
                          ? (() => {
                              const total = market.liquidations.longLiqs24h! + market.liquidations.shortLiqs24h!
                              if (total === 0) return "—"
                              const longPct = (market.liquidations.longLiqs24h! / total) * 100
                              return `${longPct.toFixed(0)}% Long`
                            })()
                          : "—"
                      }
                      sub={
                        market.liquidations.longLiqs24h != null && market.liquidations.shortLiqs24h != null
                          ? (market.liquidations.longLiqs24h! > market.liquidations.shortLiqs24h!
                              ? "Longs getting flushed"
                              : "Shorts getting squeezed")
                          : undefined
                      }
                      color={
                        market.liquidations.longLiqs24h != null && market.liquidations.shortLiqs24h != null
                          ? market.liquidations.longLiqs24h! > market.liquidations.shortLiqs24h! ? "#00FF88" : "#FF3B5C"
                          : undefined
                      }
                      icon={AlertTriangle}
                    />
                  )}
                </div>
              </motion.div>
            )}

            {/* ── 9b. News Sentiment ──────────────────────────────────────── */}
            {d?.newsSentiment && d.newsSentiment.headlines.length > 0 && (
              <motion.div {...fadeUp}>
                <div className="flex items-center gap-2 mb-3">
                  <Newspaper className="size-4" style={{ color: accent }} />
                  <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">
                    News Sentiment
                  </h2>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase"
                    style={{
                      backgroundColor: `${d.newsSentiment.score >= 20 ? "#00FF88" : d.newsSentiment.score <= -20 ? "#FF3B5C" : "#F59E0B"}15`,
                      color: d.newsSentiment.score >= 20 ? "#00FF88" : d.newsSentiment.score <= -20 ? "#FF3B5C" : "#F59E0B",
                    }}
                  >
                    {d.newsSentiment.label}
                  </span>
                  <span
                    className="font-mono text-xs font-bold"
                    style={{
                      color: d.newsSentiment.score >= 20 ? "#00FF88" : d.newsSentiment.score <= -20 ? "#FF3B5C" : "#F59E0B",
                    }}
                  >
                    {d.newsSentiment.score > 0 ? "+" : ""}{d.newsSentiment.score}
                  </span>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
                  {d.newsSentiment.headlines.slice(0, 5).map((h, i) => {
                    const dotColor =
                      h.sentiment === "bullish"
                        ? "#00FF88"
                        : h.sentiment === "bearish"
                          ? "#FF3B5C"
                          : "#6B7280"
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
                      >
                        <span
                          className="mt-2 size-2 rounded-full shrink-0"
                          style={{ backgroundColor: dotColor }}
                        />
                        <span className="text-sm text-white/60 flex-1 leading-relaxed">
                          {h.title}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* ── 10. Fibonacci Levels ───────────────────────────────────── */}
            {d?.levels?.fibonacci && d.levels.fibonacci.length > 0 && (
              <motion.div {...fadeUp}>
                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
                  Fibonacci Levels
                </h2>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {d.levels.fibonacci.map((fib, i) => {
                      const isBelow = fib.price < currentPrice
                      const c = isBelow ? "#00FF88" : "#FF3B5C"
                      return (
                        <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-white/30 w-12">{fib.level}</span>
                            <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: c }}>
                              ${fmt(fib.price, dp)}
                            </span>
                          </div>
                          <CopyBtn value={fib.price.toFixed(dp)} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── 11. Key Price Levels (S/R Map) ────────────────────────── */}
            {d?.levels && (d.levels.supports.length > 0 || d.levels.resistances.length > 0) && (
              <motion.div {...fadeUp}>
                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
                  Key Price Levels
                </h2>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="relative h-12 mb-4">
                    {(() => {
                      const corePrices = [...d.levels.supports, ...d.levels.resistances, currentPrice]
                      const coreMin = Math.min(...corePrices)
                      const coreMax = Math.max(...corePrices)
                      const coreRange = (coreMax - coreMin) || currentPrice * 0.01
                      const pad = coreRange * 0.15
                      const rangeMin = coreMin - pad
                      const rangeMax = coreMax + pad
                      const inRange = (p: number) => p >= rangeMin && p <= rangeMax
                      const fibPrices = (d.levels.fibonacci ?? []).filter((f) => inRange(f.price))
                      const min = rangeMin * 0.9998
                      const max = rangeMax * 1.0002
                      const range = max - min
                      const pct = (v: number) => Math.min(100, Math.max(0, ((v - min) / range) * 100))

                      return (
                        <>
                          <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
                          {d.levels.supports.map((price, i) => (
                            <div
                              key={`s-${i}`}
                              className="absolute top-0 bottom-0 flex flex-col items-center"
                              style={{ left: `${pct(price)}%` }}
                            >
                              <div className="h-full w-px" style={{ backgroundColor: "#00FF8840" }} />
                              <span className="absolute -bottom-5 font-mono text-[10px] whitespace-nowrap text-[#00FF88]">
                                ${fmt(price, dp)}
                              </span>
                            </div>
                          ))}
                          {d.levels.resistances.map((price, i) => (
                            <div
                              key={`r-${i}`}
                              className="absolute top-0 bottom-0 flex flex-col items-center"
                              style={{ left: `${pct(price)}%` }}
                            >
                              <div className="h-full w-px" style={{ backgroundColor: "#FF3B5C40" }} />
                              <span className="absolute -bottom-5 font-mono text-[10px] whitespace-nowrap text-[#FF3B5C]">
                                ${fmt(price, dp)}
                              </span>
                            </div>
                          ))}
                          {fibPrices.map((fib, i) => (
                            <div
                              key={`fib-${i}`}
                              className="absolute top-0 bottom-0 flex flex-col items-center"
                              style={{ left: `${pct(fib.price)}%` }}
                            >
                              <div className="h-full w-px" style={{ backgroundColor: "#22D3EE30" }} />
                            </div>
                          ))}
                          {d.levels.dailyHigh != null && inRange(d.levels.dailyHigh) && (
                            <div className="absolute top-0 bottom-0" style={{ left: `${pct(d.levels.dailyHigh)}%` }}>
                              <div className="h-full w-px border-l border-dashed" style={{ borderColor: `${accent}60` }} />
                            </div>
                          )}
                          {d.levels.dailyLow != null && inRange(d.levels.dailyLow) && (
                            <div className="absolute top-0 bottom-0" style={{ left: `${pct(d.levels.dailyLow)}%` }}>
                              <div className="h-full w-px border-l border-dashed" style={{ borderColor: `${accent}60` }} />
                            </div>
                          )}
                          <div
                            className="absolute top-0 bottom-0 flex flex-col items-center"
                            style={{ left: `${pct(currentPrice)}%` }}
                          >
                            <div className="h-full w-0.5" style={{ backgroundColor: accent }} />
                            <span className="absolute -top-5 font-mono text-[10px] font-bold whitespace-nowrap" style={{ color: accent }}>
                              ${fmt(currentPrice, dp)}
                            </span>
                          </div>
                        </>
                      )
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-8">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-[#00FF88]/60 mb-1 block">Support</span>
                      {d.levels.supports.map((price, i) => (
                        <div key={i} className="flex items-center justify-between py-1">
                          <span className="font-mono text-sm text-[#00FF88] tabular-nums">${fmt(price, dp)}</span>
                          <CopyBtn value={price.toFixed(dp)} />
                        </div>
                      ))}
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-[#FF3B5C]/60 mb-1 block">Resistance</span>
                      {d.levels.resistances.map((price, i) => (
                        <div key={i} className="flex items-center justify-between py-1">
                          <span className="font-mono text-sm text-[#FF3B5C] tabular-nums">${fmt(price, dp)}</span>
                          <CopyBtn value={price.toFixed(dp)} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {(d.levels.dailyHigh != null || d.levels.weeklyHigh != null) && (
                    <div className="mt-4 pt-3 border-t border-white/[0.04] grid grid-cols-2 md:grid-cols-4 gap-2">
                      {d.levels.dailyHigh != null && (
                        <div className="flex items-center gap-2">
                          <ArrowUp className="size-3" style={{ color: accent }} />
                          <span className="text-[10px] text-white/30">D High</span>
                          <span className="font-mono text-xs" style={{ color: accent }}>${fmt(d.levels.dailyHigh, dp)}</span>
                        </div>
                      )}
                      {d.levels.dailyLow != null && (
                        <div className="flex items-center gap-2">
                          <ArrowDown className="size-3" style={{ color: accent }} />
                          <span className="text-[10px] text-white/30">D Low</span>
                          <span className="font-mono text-xs" style={{ color: accent }}>${fmt(d.levels.dailyLow, dp)}</span>
                        </div>
                      )}
                      {d.levels.weeklyHigh != null && (
                        <div className="flex items-center gap-2">
                          <ArrowUp className="size-3 text-[#22D3EE]" />
                          <span className="text-[10px] text-white/30">W High</span>
                          <span className="font-mono text-xs text-[#22D3EE]">${fmt(d.levels.weeklyHigh, dp)}</span>
                        </div>
                      )}
                      {d.levels.weeklyLow != null && (
                        <div className="flex items-center gap-2">
                          <ArrowDown className="size-3 text-[#22D3EE]" />
                          <span className="text-[10px] text-white/30">W Low</span>
                          <span className="font-mono text-xs text-[#22D3EE]">${fmt(d.levels.weeklyLow, dp)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── 12. HTF Confirmation ───────────────────────────────────── */}
            {d?.htf && (
              <motion.div {...fadeUp}>
                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
                  Higher Timeframe Confirmation
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {(() => {
                    const tc = dirColor(d.htf.trend1h)
                    return (
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-white/50 uppercase">1H</span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                            style={{ backgroundColor: `${tc}15`, color: tc }}
                          >
                            {d.htf.trend1h}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-white/40">RSI</span>
                          <p
                            className="font-mono text-lg font-bold tabular-nums"
                            style={{ color: d.htf.rsi1h < 30 ? "#00FF88" : d.htf.rsi1h > 70 ? "#FF3B5C" : accent }}
                          >
                            {fmt(d.htf.rsi1h, 1)}
                          </p>
                        </div>
                      </div>
                    )
                  })()}
                  {(() => {
                    const tc = dirColor(d.htf.trend4h)
                    return (
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-white/50 uppercase">4H</span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                            style={{ backgroundColor: `${tc}15`, color: tc }}
                          >
                            {d.htf.trend4h}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-white/40">RSI</span>
                          <p
                            className="font-mono text-lg font-bold tabular-nums"
                            style={{ color: d.htf.rsi4h < 30 ? "#00FF88" : d.htf.rsi4h > 70 ? "#FF3B5C" : accent }}
                          >
                            {fmt(d.htf.rsi4h, 1)}
                          </p>
                        </div>
                      </div>
                    )
                  })()}
                  {d.htf.trendDaily != null && d.htf.rsiDaily != null && (() => {
                    const tc = dirColor(d.htf.trendDaily!)
                    return (
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-white/50 uppercase">Daily</span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                            style={{ backgroundColor: `${tc}15`, color: tc }}
                          >
                            {d.htf.trendDaily}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-white/40">RSI</span>
                          <p
                            className="font-mono text-lg font-bold tabular-nums"
                            style={{ color: d.htf.rsiDaily! < 30 ? "#00FF88" : d.htf.rsiDaily! > 70 ? "#FF3B5C" : accent }}
                          >
                            {fmt(d.htf.rsiDaily, 1)}
                          </p>
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {(() => {
                  const trends = [d.htf.trend1h, d.htf.trend4h]
                  if (d.htf.trendDaily != null) trends.push(d.htf.trendDaily)
                  const allSame = trends.every((t) => t === trends[0])
                  return (
                    <div className="mt-3 flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: allSame ? "#00FF88" : accent }}
                      />
                      <span className="text-xs text-white/40">
                        {allSame
                          ? `HTF aligned — all ${trends[0]}`
                          : "HTF disagreement — mixed signals"}
                      </span>
                    </div>
                  )
                })()}
              </motion.div>
            )}

            {/* ── 13. Signal Track Record ─────────────────────────────────── */}
            {historyData && (
              <motion.div {...fadeUp}>
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="size-4" style={{ color: accent }} />
                  <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">
                    Signal Track Record
                  </h2>
                </div>

                {historyData.stats.total === 0 ? (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
                    <Trophy className="size-8 text-white/20 mx-auto mb-3" />
                    <p className="text-sm text-white/40">
                      No signals tracked yet. Signals with confidence &ge; 55 are automatically logged and tracked.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Stats bar */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                      {/* Win Rate with ring */}
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col items-center justify-center">
                        <span className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Win Rate</span>
                        <div className="relative size-16">
                          <svg className="size-16 -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                            <circle
                              cx="18" cy="18" r="15.5" fill="none"
                              strokeWidth="3" strokeLinecap="round"
                              stroke={historyData.stats.winRate >= 60 ? "#00FF88" : historyData.stats.winRate < 45 ? "#FF3B5C" : "#F59E0B"}
                              strokeDasharray={`${historyData.stats.winRate * 0.9742} 97.42`}
                            />
                          </svg>
                          <span
                            className="absolute inset-0 flex items-center justify-center font-mono text-sm font-black"
                            style={{ color: historyData.stats.winRate >= 60 ? "#00FF88" : historyData.stats.winRate < 45 ? "#FF3B5C" : "#F59E0B" }}
                          >
                            {historyData.stats.winRate.toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      <StatCard label="Total Signals" value={String(historyData.stats.total)} color={accent} icon={BarChart3} />
                      <StatCard label="Wins" value={String(historyData.stats.wins)} color="#00FF88" icon={TrendingUp} />
                      <StatCard label="Losses" value={String(historyData.stats.losses)} color="#FF3B5C" icon={TrendingDown} />
                      <StatCard
                        label="Profit Factor"
                        value={historyData.stats.profitFactor.toFixed(2)}
                        color={historyData.stats.profitFactor > 1.5 ? "#00FF88" : historyData.stats.profitFactor < 1 ? "#FF3B5C" : "#F59E0B"}
                        icon={Zap}
                      />
                      <StatCard
                        label="Avg Confidence"
                        value={historyData.stats.avgConfidence.toFixed(0)}
                        color={accent}
                        icon={Gauge}
                      />
                    </div>

                    {/* Recent signals table */}
                    {historyData.signals.length > 0 && (
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden mb-4">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                                <th className="px-4 py-3 text-left font-medium">Time</th>
                                <th className="px-4 py-3 text-left font-medium">Symbol</th>
                                <th className="px-4 py-3 text-left font-medium">Bias</th>
                                <th className="px-4 py-3 text-right font-medium">Entry</th>
                                <th className="px-4 py-3 text-right font-medium">Conf</th>
                                <th className="px-4 py-3 text-right font-medium">Outcome</th>
                              </tr>
                            </thead>
                            <tbody>
                              {historyData.signals.slice(0, 15).map((sig) => {
                                const ago = Date.now() - sig.timestamp
                                const mins = Math.floor(ago / 60000)
                                const hours = Math.floor(ago / 3600000)
                                const days = Math.floor(ago / 86400000)
                                const timeStr = days > 0 ? `${days}d ago` : hours > 0 ? `${hours}h ago` : `${mins}m ago`

                                const outcomeLabel: Record<string, { text: string; color: string }> = {
                                  pending: { text: "Pending", color: "#F59E0B" },
                                  tp1: { text: "TP1 Hit", color: "#00FF88" },
                                  tp2: { text: "TP2 Hit", color: "#00FF88" },
                                  tp3: { text: "TP3 Hit", color: "#00FF88" },
                                  stopped: { text: "Stopped Out", color: "#FF3B5C" },
                                  expired: { text: "Expired", color: "#6B7280" },
                                }
                                const oc = outcomeLabel[sig.outcome] ?? { text: sig.outcome, color: "#6B7280" }

                                return (
                                  <tr
                                    key={sig.id}
                                    className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors"
                                    onClick={() => setSymbol(sig.symbol)}
                                  >
                                    <td className="px-4 py-2.5 text-white/40 font-mono text-xs">{timeStr}</td>
                                    <td className="px-4 py-2.5">
                                      <span className="font-bold text-white/80 text-xs">{sig.symbol}</span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span
                                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                                        style={{
                                          backgroundColor: `${dirColor(sig.bias)}15`,
                                          color: dirColor(sig.bias),
                                        }}
                                      >
                                        {sig.bias}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono text-xs text-white/60 tabular-nums">
                                      ${fmtPrice(sig.entry)}
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono text-xs text-white/60 tabular-nums">
                                      {sig.confidence}
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: oc.color }}>
                                        {sig.outcome === "pending" && (
                                          <span className="size-1.5 rounded-full animate-pulse" style={{ backgroundColor: oc.color }} />
                                        )}
                                        {oc.text}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Per-symbol breakdown */}
                    {(() => {
                      const bySymbol = historyData.stats.bySymbol
                      const entries = Object.entries(bySymbol).filter(([, v]) => v.total > 0)
                      if (entries.length === 0) return null
                      return (
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-white/30 mb-2 block">Win Rate by Symbol</span>
                          <div className="flex flex-wrap gap-2">
                            {entries.map(([sym, st]) => {
                              const wrColor = st.winRate >= 60 ? "#00FF88" : st.winRate < 45 ? "#FF3B5C" : "#F59E0B"
                              return (
                                <div
                                  key={sym}
                                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 flex items-center gap-2"
                                >
                                  <span className="text-xs font-bold text-white/60">{sym}</span>
                                  <span className="font-mono text-xs font-bold" style={{ color: wrColor }}>
                                    {st.winRate.toFixed(0)}%
                                  </span>
                                  <span className="text-[10px] text-white/30">
                                    {st.wins}W / {st.losses}L
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}
              </motion.div>
            )}

            {/* ── 14. Footer ────────────────────────────────────────────── */}
            <div className="flex items-center justify-between border-t border-white/[0.04] pt-4 text-xs text-white/30">
              <span>{ind?.regime ?? "—"} regime</span>
              <span>Powered by multi-factor signal engine &middot; Auto-refreshes every 30s &middot; Not financial advice</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
