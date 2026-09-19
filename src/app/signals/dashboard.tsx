"use client"

import React, { useState, useEffect, useRef, useCallback, memo } from "react"
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
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types — matches /api/signals response shape exactly
// ---------------------------------------------------------------------------

interface SignalsResponse {
  timestamp: number
  price: {
    mark: number
    last: number
    high24h: number
    low24h: number
    change24h: number
  }
  indicators: {
    rsi: number
    ema9: number
    ema21: number
    ema50: number
    macd: { value: number; signal: number; histogram: number }
    adx: number
    atr: number
    bb: { upper: number; middle: number; lower: number }
    regime: string
    trendDirection: string
  }
  htf: {
    rsi1h: number
    trend1h: string
    rsi4h: number
    trend4h: string
  }
  levels: {
    supports: number[]
    resistances: number[]
  }
  market: {
    fearGreed: { value: number; classification: string } | null
    btcDominance: number | null
    openInterest: number | null
    fundingRate: number | null
    deribitFunding8h: number | null
    putCallRatio: number | null
    hashRate: number | null
  }
  call: {
    bias: "LONG" | "SHORT" | "NEUTRAL"
    confidence: number
    entry: number
    stopLoss: number
    tp1: number
    tp2: number
    tp3: number
    riskReward: number
    regime: string
    reasoning: string[]
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
// TradingView Chart (inline, same pattern as site)
// ---------------------------------------------------------------------------

function TVChartInner() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    container.innerHTML = ""

    const script = document.createElement("script")
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
    script.type = "text/javascript"
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: "BINANCE:BTCUSDT",
      interval: "15",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(6, 8, 15, 1)",
      gridColor: "rgba(31, 41, 55, 0.15)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      studies: [
        "RSI@tv-basicstudies",
        "MAExp@tv-basicstudies",
        "BB@tv-basicstudies",
      ],
      support_host: "https://www.tradingview.com",
    })

    container.appendChild(script)
    return () => {
      container.innerHTML = ""
    }
  }, [])

  return (
    <div className="tradingview-widget-container" style={{ height: 500 }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </div>
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

  const callDir = call?.bias ?? "NEUTRAL"
  const callColor = dirColor(callDir)
  const trendColor = dirColor(ind?.trendDirection ?? "mixed")

  const currentPrice = d?.price?.mark ?? 0
  const change24h = d?.price?.change24h ?? null

  return (
    <div className="min-h-screen bg-[#06080F] pt-24 pb-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 space-y-6">
        {/* Header */}
        <motion.div {...fadeUp} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-2.5 w-2.5 rounded-full bg-[#F59E0B] animate-pulse" />
              <h1 className="text-2xl font-bold text-white">BTC Signals</h1>
              {ind && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide"
                  style={{ backgroundColor: `${trendColor}15`, color: trendColor }}
                >
                  {ind.trendDirection}
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

        {/* TradingView Chart */}
        <motion.div
          {...fadeUp}
          className="rounded-xl border border-white/[0.06] overflow-hidden"
        >
          <TVChart />
        </motion.div>

        {/* Trade Call Card */}
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
                      <Minus className="size-5" />
                    )}
                    {callDir}
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
                <PriceLevel label="Entry" price={call.entry} color="#F59E0B" icon={Target} />
                <PriceLevel label="Stop Loss" price={call.stopLoss} color="#FF3B5C" icon={Shield} />
                <PriceLevel label="TP1" price={call.tp1} color="#00FF88" icon={ArrowUpRight} />
                <PriceLevel label="TP2" price={call.tp2} color="#00CC6A" icon={ArrowUpRight} />
                <PriceLevel label="TP3" price={call.tp3} color="#00AA55" icon={ArrowUpRight} />
              </div>

              <div className="flex items-center gap-2 mb-4">
                <Zap className="size-4 text-[#F59E0B]" />
                <span className="text-sm text-white/60">Risk : Reward</span>
                <span className="font-mono text-sm font-bold text-[#F59E0B]">
                  1 : {call.riskReward.toFixed(1)}
                </span>
              </div>

              {call.reasoning.length > 0 && (
                <div className="space-y-1.5">
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
            </div>
          </motion.div>
        )}

        {/* Indicator Grid */}
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
                  ? `EMA 9>${ind.ema9 > ind.ema21 ? "21" : ""}${ind.ema21 > ind.ema50 ? ">50" : ""}`
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
          </div>
        </div>

        {/* Market Data Grid */}
        <div>
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            Market Data
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
          </div>
        </div>

        {/* Support / Resistance Levels */}
        {d?.levels && (d.levels.supports.length > 0 || d.levels.resistances.length > 0) && (
          <motion.div {...fadeUp}>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
              Support &amp; Resistance
            </h2>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="relative h-12 mb-4">
                {(() => {
                  const allPrices = [...d.levels.supports, ...d.levels.resistances, currentPrice]
                  const min = Math.min(...allPrices) * 0.998
                  const max = Math.max(...allPrices) * 1.002
                  const range = max - min
                  const pct = (v: number) => ((v - min) / range) * 100

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
            </div>
          </motion.div>
        )}

        {/* HTF Confirmation */}
        {d?.htf && (
          <motion.div {...fadeUp}>
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
              Higher Timeframe Confirmation
            </h2>
            <div className="grid grid-cols-2 gap-3">
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
            </div>

            {(() => {
              const agree = d.htf.trend1h === d.htf.trend4h
              return (
                <div className="mt-3 flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: agree ? "#00FF88" : "#F59E0B" }}
                  />
                  <span className="text-xs text-white/40">
                    {agree
                      ? `HTF aligned — both ${d.htf.trend1h}`
                      : "HTF disagreement — mixed signals"}
                  </span>
                </div>
              )
            })()}
          </motion.div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.04] pt-4 text-xs text-white/30">
          <span>{ind?.regime ?? "—"} regime</span>
          <span>Auto-refreshes every 30s &middot; Not financial advice</span>
        </div>
      </div>
    </div>
  )
}
