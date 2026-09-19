"use client"

import React, { useState, useEffect, useCallback, memo } from "react"
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
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types — matches /api/signals v2 response shape
// ---------------------------------------------------------------------------

interface SignalsResponse {
  timestamp: number
  asset: "BTC"
  price: {
    mark: number
    last: number
    high24h: number
    low24h: number
    change24h: number
  }
  indicators: {
    rsi: number
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
  candles: { time: number; open: number; high: number; low: number; close: number }[]
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

const fmtCompact = (n: number | null | undefined) => {
  if (n == null) return "—"
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(2)
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
// TradingView Chart
// ---------------------------------------------------------------------------

function TVChartInner() {
  const src = "https://s.tradingview.com/widgetembed/?hideideas=1&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=en" +
    "&symbol=BINANCE%3ABTCUSDT&interval=15&theme=dark&style=1&timezone=Etc%2FUTC" +
    "&studies=%5B%22RSI%40tv-basicstudies%22%2C%22MAExp%40tv-basicstudies%22%2C%22BB%40tv-basicstudies%22%5D" +
    "&hide_top_toolbar=0&hide_legend=0&save_image=0&calendar=0&hide_volume=0" +
    "&backgroundColor=rgba(6%2C8%2C15%2C1)&gridColor=rgba(31%2C41%2C55%2C0.15)"

  return (
    <iframe
      src={src}
      style={{ width: "100%", height: 500, border: "none" }}
      allowFullScreen
    />
  )
}

const TVChart = memo(TVChartInner)

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  color?: string
  icon?: React.ElementType
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
        style={{ color: color ?? "#F59E0B" }}
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
}: {
  label: string
  price: number | null
  color: string
  icon: React.ElementType
}) {
  if (price == null) return null
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center gap-2">
        <Icon className="size-4" style={{ color }} />
        <span className="text-sm text-white/60">{label}</span>
      </div>
      <div className="flex items-center">
        <span className="font-mono text-sm font-semibold tabular-nums" style={{ color }}>
          ${fmt(price, 1)}
        </span>
        <CopyBtn value={price.toFixed(1)} />
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
// Loading Skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="min-h-screen bg-[#06080F] pt-24 pb-16 px-4 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="h-12 w-64 rounded-lg bg-white/[0.04] animate-pulse" />
        <div className="h-[500px] rounded-xl bg-white/[0.04] animate-pulse" />
        <div className="h-48 rounded-xl bg-white/[0.04] animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
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
// Main Dashboard
// ---------------------------------------------------------------------------

export default function SignalsDashboard() {
  const [fetchTs, setFetchTs] = useState(Date.now())

  const { data, isLoading } = useQuery<SignalsResponse>({
    queryKey: ["signals"],
    queryFn: async () => {
      const res = await fetch("/api/signals")
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      setFetchTs(Date.now())
      return res.json()
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  })

  const countdown = useCountdown(30_000, fetchTs)

  if (isLoading) return <Skeleton />

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

  return (
    <div className="min-h-screen bg-[#06080F] pt-24 pb-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 space-y-6">

        {/* ── 1. Header ───────────────────────────────────────────────── */}
        <motion.div {...fadeUp} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-2.5 w-2.5 rounded-full bg-[#F59E0B] animate-pulse" />
              <span className="rounded-full bg-[#F59E0B]/10 px-2.5 py-0.5 text-xs font-bold text-[#F59E0B] uppercase tracking-wide">
                {d?.asset ?? "BTC"}
              </span>
              <h1 className="text-2xl font-bold text-white">Signals</h1>
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
                ${fmt(currentPrice, 0)}
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
            <span className="text-[#F59E0B] font-mono">{countdown}s</span>
          </div>
        </motion.div>

        {/* ── 2. Alert Banners ────────────────────────────────────────── */}
        {call?.bias === "WAIT" && (
          <AlertBanner icon={Pause} color="#F59E0B">
            NO ACTIVE SETUP &mdash; Conditions do not favor a trade. Wait for confirmation.
          </AlertBanner>
        )}
        {pats?.squeeze && (
          <AlertBanner icon={AlertTriangle} color="#F59E0B">
            SQUEEZE RISK: {pats.squeeze}
          </AlertBanner>
        )}
        {call?.catalystRisk && (
          <AlertBanner icon={AlertTriangle} color="#FF3B5C">
            CATALYST RISK: {call.catalystRisk}
          </AlertBanner>
        )}

        {/* ── 3. TradingView Chart ───────────────────────────────────── */}
        <motion.div
          {...fadeUp}
          className="rounded-xl border border-white/[0.06] overflow-hidden"
        >
          <TVChart />
        </motion.div>

        {/* ── 4. Trade Call Card ──────────────────────────────────────── */}
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
              {/* Top row: bias, grade, regime, confidence */}
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

              {/* Price levels */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04] mb-5">
                <PriceLevel label="Entry" price={call.entry} color="#F59E0B" icon={Target} />
                {call.secondaryEntry != null && (
                  <PriceLevel label="Secondary Entry" price={call.secondaryEntry} color="#D97706" icon={Target} />
                )}
                <PriceLevel label="Stop Loss" price={call.stopLoss} color="#FF3B5C" icon={Shield} />
                <PriceLevel label="TP1" price={call.tp1} color="#00FF88" icon={ArrowUpRight} />
                <PriceLevel label="TP2" price={call.tp2} color="#00CC6A" icon={ArrowUpRight} />
                <PriceLevel label="TP3" price={call.tp3} color="#00AA55" icon={ArrowUpRight} />
                {call.extendedTarget != null && (
                  <PriceLevel label="Extended Target" price={call.extendedTarget} color="#00FF88" icon={Zap} />
                )}
              </div>

              {/* R:R */}
              <div className="flex items-center gap-2 mb-4">
                <Zap className="size-4 text-[#F59E0B]" />
                <span className="text-sm text-white/60">Risk : Reward</span>
                <span className="font-mono text-sm font-bold text-[#F59E0B]">
                  1 : {call.riskReward.toFixed(1)}
                </span>
              </div>

              {/* Reasoning */}
              {call.reasoning.length > 0 && (
                <div className="space-y-1.5 mb-5">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">Reasoning</span>
                  <ul className="space-y-1">
                    {call.reasoning.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                        <span className="mt-1.5 h-1 w-1 rounded-full bg-[#F59E0B] shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Bull / Bear Case side by side */}
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

              {/* Confirms / Invalidates */}
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

        {/* ── 5. Signal Confluence ────────────────────────────────────── */}
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

        {/* ── 6. Divergences & Patterns ──────────────────────────────── */}
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
                <Waves className="size-4 text-[#F59E0B]" />
                <span className="text-xs text-white/40">Candlestick Pattern:</span>
                <span className="text-sm font-semibold text-[#F59E0B]">{pats.candlestick}</span>
              </div>
            )}
          </motion.div>
        )}

        {/* ── 7. Technical Indicators ────────────────────────────────── */}
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
                  ? ind.rsi < 30 ? "#00FF88" : ind.rsi > 70 ? "#FF3B5C" : "#F59E0B"
                  : undefined
              }
              icon={Gauge}
            />

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
                  ? ind.stochRsi.k > 80 ? "#FF3B5C" : ind.stochRsi.k < 20 ? "#00FF88" : "#F59E0B"
                  : undefined
              }
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
              color={ind?.adx != null ? (ind.adx > 25 ? "#F59E0B" : "#6B7280") : undefined}
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
                  ? `${fmt(ind.bb.lower, 0)} — ${fmt(ind.bb.upper, 0)}`
                  : undefined
              }
              color={
                ind?.bb && currentPrice > 0
                  ? currentPrice >= ind.bb.upper
                    ? "#FF3B5C"
                    : currentPrice <= ind.bb.lower
                      ? "#00FF88"
                      : "#F59E0B"
                  : undefined
              }
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
                  ? ind.bb.width < 0.03 ? "#F59E0B" : ind.bb.width > 0.08 ? "#00FF88" : "#6B7280"
                  : undefined
              }
              icon={BarChart}
            />

            <StatCard
              label="ATR (14)"
              value={currentPrice > 0 && ind?.atr != null ? `$${fmt(ind.atr, 0)}` : "—"}
              sub={
                currentPrice > 0 && ind?.atr != null
                  ? `${((ind.atr / currentPrice) * 100).toFixed(2)}% of price`
                  : undefined
              }
              color="#F59E0B"
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
              value={ind?.ema9 != null ? `$${fmt(ind.ema9, 0)}` : "—"}
              sub={
                ind?.ema21 != null && ind?.ema50 != null
                  ? `$${fmt(ind.ema21, 0)} / $${fmt(ind.ema50, 0)}`
                  : undefined
              }
              color="#F59E0B"
              icon={Gauge}
            />

            {ind?.ema200 != null && (
              <StatCard
                label="EMA 200"
                value={`$${fmt(ind.ema200, 0)}`}
                sub={currentPrice > ind.ema200 ? "Price above" : "Price below"}
                color={currentPrice > ind.ema200 ? "#00FF88" : "#FF3B5C"}
                icon={TrendingUp}
              />
            )}
          </div>
        </div>

        {/* ── 8. Volume Analysis ──────────────────────────────────────── */}
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
                icon={BarChart3}
              />
              <StatCard
                label="Avg Volume"
                value={fmtCompact(vol.average)}
                icon={BarChart}
              />
              <StatCard
                label="Volume Ratio"
                value={fmt(vol.ratio, 2)}
                sub={vol.ratio > 1.5 ? "High volume" : vol.ratio < 0.5 ? "Low volume" : "Normal"}
                color={vol.ratio > 1.5 ? "#00FF88" : vol.ratio < 0.5 ? "#FF3B5C" : "#F59E0B"}
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

        {/* ── 9. Market Data ──────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            Market Data
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Fear & Greed"
              value={market?.fearGreed?.value?.toString() ?? "—"}
              sub={market?.fearGreed?.classification ?? undefined}
              color={
                market?.fearGreed
                  ? market.fearGreed.value >= 60 ? "#00FF88" : market.fearGreed.value <= 40 ? "#FF3B5C" : "#F59E0B"
                  : undefined
              }
              icon={Eye}
            />

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
                  ? market.fundingRate < 0 ? "#00FF88" : market.fundingRate > 0.01 ? "#FF3B5C" : "#F59E0B"
                  : undefined
              }
              icon={Activity}
            />

            <StatCard
              label="Open Interest"
              value={market?.openInterest != null ? `$${fmtCompact(market.openInterest)}` : "—"}
              icon={BarChart3}
            />

            <StatCard
              label="Put/Call Ratio"
              value={fmt(market?.putCallRatio, 2)}
              sub={
                market?.putCallRatio != null
                  ? market.putCallRatio > 1 ? "Bearish sentiment" : market.putCallRatio < 0.7 ? "Bullish sentiment" : "Neutral"
                  : undefined
              }
              color={
                market?.putCallRatio != null
                  ? market.putCallRatio > 1 ? "#FF3B5C" : market.putCallRatio < 0.7 ? "#00FF88" : "#F59E0B"
                  : undefined
              }
              icon={Layers}
            />

            <StatCard
              label="BTC Dominance"
              value={market?.btcDominance != null ? `${market.btcDominance.toFixed(1)}%` : "—"}
              icon={Hash}
            />

            <StatCard
              label="Hashrate"
              value={
                market?.hashRate != null
                  ? `${(market.hashRate / 1e9).toFixed(0)} EH/s`
                  : "—"
              }
              icon={Zap}
            />

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

        {/* ── 10. Fibonacci Levels ─────────────────────────────────────── */}
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
                          ${fmt(fib.price, 1)}
                        </span>
                      </div>
                      <CopyBtn value={fib.price.toFixed(1)} />
                    </div>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── 11. Key Price Levels (S/R Map) ──────────────────────────── */}
        {d?.levels && (d.levels.supports.length > 0 || d.levels.resistances.length > 0) && (
          <motion.div {...fadeUp}>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
              Key Price Levels
            </h2>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              {/* Visual price map */}
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
                  const extras: number[] = []
                  if (d.levels.dailyHigh != null && inRange(d.levels.dailyHigh)) extras.push(d.levels.dailyHigh)
                  if (d.levels.dailyLow != null && inRange(d.levels.dailyLow)) extras.push(d.levels.dailyLow)
                  if (d.levels.weeklyHigh != null && inRange(d.levels.weeklyHigh)) extras.push(d.levels.weeklyHigh)
                  if (d.levels.weeklyLow != null && inRange(d.levels.weeklyLow)) extras.push(d.levels.weeklyLow)
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
                            ${fmt(price, 0)}
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
                            ${fmt(price, 0)}
                          </span>
                        </div>
                      ))}
                      {/* Fib levels in cyan (only those within visible range) */}
                      {fibPrices.map((fib, i) => (
                        <div
                          key={`fib-${i}`}
                          className="absolute top-0 bottom-0 flex flex-col items-center"
                          style={{ left: `${pct(fib.price)}%` }}
                        >
                          <div className="h-full w-px" style={{ backgroundColor: "#22D3EE30" }} />
                        </div>
                      ))}
                      {/* Daily H/L (only if within visible range) */}
                      {d.levels.dailyHigh != null && inRange(d.levels.dailyHigh) && (
                        <div className="absolute top-0 bottom-0" style={{ left: `${pct(d.levels.dailyHigh)}%` }}>
                          <div className="h-full w-px border-l border-dashed border-[#F59E0B]/40" />
                        </div>
                      )}
                      {d.levels.dailyLow != null && inRange(d.levels.dailyLow) && (
                        <div className="absolute top-0 bottom-0" style={{ left: `${pct(d.levels.dailyLow)}%` }}>
                          <div className="h-full w-px border-l border-dashed border-[#F59E0B]/40" />
                        </div>
                      )}
                      {/* Current price marker */}
                      <div
                        className="absolute top-0 bottom-0 flex flex-col items-center"
                        style={{ left: `${pct(currentPrice)}%` }}
                      >
                        <div className="h-full w-0.5 bg-[#F59E0B]" />
                        <span className="absolute -top-5 font-mono text-[10px] font-bold text-[#F59E0B] whitespace-nowrap">
                          ${fmt(currentPrice, 0)}
                        </span>
                      </div>
                    </>
                  )
                })()}
              </div>

              {/* Level lists */}
              <div className="grid grid-cols-2 gap-2 mt-8">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#00FF88]/60 mb-1 block">Support</span>
                  {d.levels.supports.map((price, i) => (
                    <div key={i} className="flex items-center justify-between py-1">
                      <span className="font-mono text-sm text-[#00FF88] tabular-nums">${fmt(price, 0)}</span>
                      <CopyBtn value={price.toFixed(1)} />
                    </div>
                  ))}
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#FF3B5C]/60 mb-1 block">Resistance</span>
                  {d.levels.resistances.map((price, i) => (
                    <div key={i} className="flex items-center justify-between py-1">
                      <span className="font-mono text-sm text-[#FF3B5C] tabular-nums">${fmt(price, 0)}</span>
                      <CopyBtn value={price.toFixed(1)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Daily / Weekly levels */}
              {(d.levels.dailyHigh != null || d.levels.weeklyHigh != null) && (
                <div className="mt-4 pt-3 border-t border-white/[0.04] grid grid-cols-2 md:grid-cols-4 gap-2">
                  {d.levels.dailyHigh != null && (
                    <div className="flex items-center gap-2">
                      <ArrowUp className="size-3 text-[#F59E0B]" />
                      <span className="text-[10px] text-white/30">D High</span>
                      <span className="font-mono text-xs text-[#F59E0B]">${fmt(d.levels.dailyHigh, 0)}</span>
                    </div>
                  )}
                  {d.levels.dailyLow != null && (
                    <div className="flex items-center gap-2">
                      <ArrowDown className="size-3 text-[#F59E0B]" />
                      <span className="text-[10px] text-white/30">D Low</span>
                      <span className="font-mono text-xs text-[#F59E0B]">${fmt(d.levels.dailyLow, 0)}</span>
                    </div>
                  )}
                  {d.levels.weeklyHigh != null && (
                    <div className="flex items-center gap-2">
                      <ArrowUp className="size-3 text-[#22D3EE]" />
                      <span className="text-[10px] text-white/30">W High</span>
                      <span className="font-mono text-xs text-[#22D3EE]">${fmt(d.levels.weeklyHigh, 0)}</span>
                    </div>
                  )}
                  {d.levels.weeklyLow != null && (
                    <div className="flex items-center gap-2">
                      <ArrowDown className="size-3 text-[#22D3EE]" />
                      <span className="text-[10px] text-white/30">W Low</span>
                      <span className="font-mono text-xs text-[#22D3EE]">${fmt(d.levels.weeklyLow, 0)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── 12. HTF Confirmation ─────────────────────────────────────── */}
        {d?.htf && (
          <motion.div {...fadeUp}>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
              Higher Timeframe Confirmation
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* 1H */}
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
                        style={{ color: d.htf.rsi1h < 30 ? "#00FF88" : d.htf.rsi1h > 70 ? "#FF3B5C" : "#F59E0B" }}
                      >
                        {fmt(d.htf.rsi1h, 1)}
                      </p>
                    </div>
                  </div>
                )
              })()}
              {/* 4H */}
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
                        style={{ color: d.htf.rsi4h < 30 ? "#00FF88" : d.htf.rsi4h > 70 ? "#FF3B5C" : "#F59E0B" }}
                      >
                        {fmt(d.htf.rsi4h, 1)}
                      </p>
                    </div>
                  </div>
                )
              })()}
              {/* Daily */}
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
                        style={{ color: d.htf.rsiDaily! < 30 ? "#00FF88" : d.htf.rsiDaily! > 70 ? "#FF3B5C" : "#F59E0B" }}
                      >
                        {fmt(d.htf.rsiDaily, 1)}
                      </p>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Alignment indicator */}
            {(() => {
              const trends = [d.htf.trend1h, d.htf.trend4h]
              if (d.htf.trendDaily != null) trends.push(d.htf.trendDaily)
              const allSame = trends.every((t) => t === trends[0])
              return (
                <div className="mt-3 flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: allSame ? "#00FF88" : "#F59E0B" }}
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

        {/* ── 13. Footer ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-white/[0.04] pt-4 text-xs text-white/30">
          <span>{ind?.regime ?? "—"} regime</span>
          <span>Powered by multi-factor signal engine &middot; Auto-refreshes every 30s &middot; Not financial advice</span>
        </div>
      </div>
    </div>
  )
}
