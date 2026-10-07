"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { buildRecommendation, type SectionId } from "./recommendation"
import { VerdictCard } from "./VerdictCard"
import { GuideModal } from "./GuideModal"
import { scrollToSection } from "./shared"
import { LevelsTab } from "./tabs/LevelsTab"
import { MomentumTab } from "./tabs/MomentumTab"
import { FlowTab } from "./tabs/FlowTab"
import type { HistoryResponse, MarketMapResponse, SignalsResponse } from "./types"
import { MacroAlerts, MacroEventCard, NextEventsStrip, RecentResults, useMacroState } from "./MacroEventPanel"
import { PredictionOddsPanel } from "./PredictionOddsPanel"
import type { MacroAsset } from "@/lib/macro/types"
import { THEMES, themeStyle, type SignalsVariant } from "./themes"
import { HotBoardState, HotPlayCard, HotStamp, hotStatus, useHotPlays } from "./HotBoard"
import { motion } from "framer-motion"
import {
  Activity,
  Copy,
  Check,
  ArrowUpRight,
  Gauge,
  BarChart3,
  Zap,
  Eye,
  Minus,
  RefreshCw,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  GitBranch,
  Waves,
  ChevronRight,
  Calendar,
  Newspaper,
  HelpCircle,
  Crosshair,
  Clock,
  Globe,
  Flame,
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

const TICKER_GROUPS: { label: string; symbols: Set<string> }[] = [
  { label: "Crypto", symbols: new Set(["BTC", "ETH", "BNB", "ADA", "HYPE", "ZEC", "PUMP", "NIGHT", "XRP", "SOL", "NEAR", "CRCL", "MINIMAX", "SPCX", "DRAM"]) },
  { label: "Commodities", symbols: new Set(["OIL", "GOLD", "SILVER"]) },
  { label: "Stocks", symbols: new Set(["TSLA", "NVDA", "GOOGL", "COIN", "MU", "SKHYNIX", "AAOI", "SNDK", "UNITREE", "ZHIPU", "CXMT"]) },
  { label: "Indices", symbols: new Set(["SP500", "NAS100"]) },
]

// ---------------------------------------------------------------------------
// Types — matches /api/signals v2 response shape
// ---------------------------------------------------------------------------

export type { OilGeoForce, OilGeo, SignalsResponse, MarketMapResponse, HotPlay, HotResponse, SignalLog, CalibrationBucket, HistoryResponse } from "./types"

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


const priceDp = (price: number) => {
  if (price >= 1000) return 0
  if (price >= 1) return 2
  if (price >= 0.01) return 4
  return 6
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


// ---------------------------------------------------------------------------
// Price Level Row
// ---------------------------------------------------------------------------


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

// Isolated so the 1s tick re-renders this span only, not the whole dashboard
function Countdown({ lastFetch, color }: { lastFetch: number; color: string }) {
  const remaining = useCountdown(30_000, lastFetch)
  return <span className="font-mono" style={{ color }}>{remaining}s</span>
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
          <span className="text-[10px] text-[#9CA3AF]/80 font-mono">{weight}%</span>
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

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

const TABS = [
  { key: "levels", label: "Levels", hint: "Entry, stop and target zones with the levels behind them" },
  { key: "momentum", label: "Momentum", hint: "Indicators, divergences and which timeframes agree" },
  { key: "flow", label: "Flow", hint: "Volume, positioning and market data" },
  { key: "macro", label: "Macro", hint: "Scheduled releases, headline catalysts, prediction-market odds" },
  { key: "models", label: "Models", hint: "Factor confluence, market map modules, early setups, scenarios" },
] as const
type TabKey = (typeof TABS)[number]["key"]
// Which tab holds each jump anchor used by the verdict card.
const ANCHOR_TAB: Record<string, TabKey> = {
  "sec-active-setups": "levels", "sec-levels": "levels", "sec-fib": "levels",
  "sec-indicators": "momentum", "sec-divergences": "momentum", "sec-htf": "momentum", "sec-tf-alignment": "momentum",
  "sec-volume": "flow", "sec-market-data": "flow", "sec-positioning": "flow",
  "sec-calendar": "macro", "sec-geo": "macro", "sec-news": "macro", "sec-macro": "macro",
  "sec-confluence": "models", "sec-market-map": "models", "sec-setups": "models", "sec-forecast": "models",
}

export default function SignalsDashboard({ variant = "signals" }: { variant?: SignalsVariant }) {
  const theme = THEMES[variant]
  const tickers = useMemo(() => (theme.tickers ? TICKERS.filter((t) => theme.tickers!.includes(t.symbol)) : TICKERS), [theme.tickers])
  const allowed = useMemo(() => new Set(tickers.map((t) => t.symbol)), [tickers])
  const [symbol, setSymbol] = useState(theme.defaultSymbol)
  // Deep links from the performance log (/signals/strike?symbol=ETH) land on that ticker; unknown symbols are ignored.
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("symbol")?.toUpperCase()
    if (want && allowed.has(want)) setSymbol(want)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Prediction-market asset for the selected ticker (Kalshi/Polymarket list BTC, gold and WTI price markets).
  const predAsset: MacroAsset | null = symbol === "BTC" ? "BTC" : symbol === "GOLD" ? "GOLD" : symbol === "OIL" ? "WTI" : null
  const [fetchTs, setFetchTs] = useState(Date.now())
  const [guideOpen, setGuideOpen] = useState(false)
  const [showAllGeo, setShowAllGeo] = useState(false)
  const [tab, setTab] = useState<TabKey>("levels")
  useEffect(() => {
    const h = window.location.hash.replace("#", "")
    if (h in ANCHOR_TAB) setTab(ANCHOR_TAB[h])
    else if (TABS.some((t) => t.key === h)) setTab(h as TabKey)
  }, [])
  const selectTab = useCallback((k: TabKey) => {
    setTab(k)
    window.history.replaceState(null, "", `#${k}`)
  }, [])

  const accent = tickers.find((t) => t.symbol === symbol)?.color ?? theme.brand

  // "On the board right now": published calls across the tickers this venue page carries. Tapping one switches the ticker in place.
  const hotQ = useHotPlays()
  const hotPlays = useMemo(() => (hotQ.data?.hot ?? []).filter((p) => p.bias !== "WAIT" && allowed.has(p.symbol)).slice(0, 6), [hotQ.data, allowed])
  const hotState = hotStatus(hotQ, hotPlays)
  const pickHot = useCallback((sym: string) => {
    setSymbol(sym)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  const { data, isLoading, dataUpdatedAt } = useQuery<SignalsResponse>({
    queryKey: ["signals", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/signals?symbol=${symbol}`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 25_000,
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (dataUpdatedAt) setFetchTs(dataUpdatedAt)
  }, [dataUpdatedAt])


  const { data: mapData } = useQuery<MarketMapResponse>({
    queryKey: ["market-map", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/signals/market-map?symbol=${symbol}`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    refetchInterval: 120_000,
    staleTime: 110_000,
    placeholderData: keepPreviousData,
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

  // Macro events are filtered to what matters for this ticker (metals -> gold lens, OIL -> WTI, everything else -> BTC/risk lens).
  const macroLens: MacroAsset = symbol === "GOLD" || symbol === "SILVER" ? "GOLD" : symbol === "OIL" ? "WTI" : "BTC"
  const macroQ = useMacroState(macroLens)


  const d = data
  const call = d?.call
  const ind = d?.indicators
  const vol = d?.volume
  const pats = d?.patterns
  const anticipatory = d?.anticipatory ?? null


  const currentPrice = d?.price?.mark ?? 0
  const dp = currentPrice > 0 ? priceDp(currentPrice) : 2

  // Data for a previously selected ticker can linger in the cache for a tick; never recommend on it
  const staleTicker = !!d && d.asset !== symbol
  const reco = useMemo(
    () => (d && !staleTicker ? buildRecommendation(d, mapData, historyData?.stats) : null),
    [d, mapData, historyData, staleTicker]
  )
  // Verdict links point at sections that now live inside tabs: switch tab first, then scroll.
  const jumpTo = useCallback(
    (anchor: SectionId) => {
      if (anchor === "sec-track-record") {
        window.location.href = "/signals/performance"
        return
      }
      const target = ANCHOR_TAB[anchor]
      if (target && target !== tab) setTab(target)
      window.setTimeout(() => scrollToSection(anchor, accent), target && target !== tab ? 150 : 0)
    },
    [accent, tab]
  )

  return (
    <div className="min-h-screen pt-24 pb-16" style={themeStyle(theme)} data-variant={variant}>
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      <div className="mx-auto max-w-7xl px-4 lg:px-8 space-y-5">

        {/* ── Brand band ─────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.55)] px-4 py-3 backdrop-blur-xl sm:flex-row sm:items-center sm:gap-4"
          style={{
            background: "linear-gradient(135deg, color-mix(in srgb, var(--brand) 12%, transparent) 0%, rgb(var(--surface-rgb) / 0.55) 60%)",
            boxShadow: "0 0 30px rgb(var(--glow-rgb) / 0.12), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full blur-3xl" style={{ backgroundColor: "rgb(var(--glow-rgb) / 0.22)" }} />
          <div className="relative flex items-center gap-3">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ backgroundColor: "var(--brand)" }} />
              <span className="relative inline-flex size-2.5 rounded-full" style={{ backgroundColor: "var(--brand)" }} />
            </span>
            <span className="font-display text-lg font-bold tracking-tight" style={{ color: "var(--brand)" }}>{theme.name}</span>
            <span className="hidden text-xs text-[#9CA3AF] sm:inline">{theme.tagline}</span>
          </div>
          <div className="flex items-center gap-3 sm:ml-auto text-[11px] text-[#9CA3AF]">
            {theme.venueUrl && (
              <a href={theme.venueUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-white/10 px-2 py-0.5 hover:border-white/25 hover:text-white transition-colors">
                Trade on {theme.name.replace(" Signals", "")} ↗
              </a>
            )}
            <span className="font-mono rounded px-1.5 py-0.5 bg-black/30 border border-white/10">
              refresh <Countdown lastFetch={fetchTs} color="var(--brand)" />
            </span>
            <a href="#hot" className="rounded-md border border-white/10 px-2 py-0.5 hover:border-white/25 hover:text-white transition-colors">Hot right now</a>
            <a href="/signals/performance" className="rounded-md border border-white/10 px-2 py-0.5 hover:border-white/25 hover:text-white transition-colors">Performance</a>
          </div>
        </div>

        {/* ── On the board right now: the venue's published calls, always above the ticker rails ── */}
        <section id="hot" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ backgroundColor: "var(--brand)" }} />
                <span className="relative inline-flex size-2 rounded-full" style={{ backgroundColor: "var(--brand)" }} />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--brand)" }}>On the board right now</span>
              <span className="hidden text-xs text-[#9CA3AF] sm:inline">· highest-conviction calls on {theme.name.replace(" Signals", "")}. Tap one to load its breakdown.</span>
            </div>
            <HotStamp ts={hotQ.data?.timestamp} />
          </div>
          {hotState !== "ready" ? (
            <HotBoardState status={hotState} compact count={3} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hotPlays.map((p) => (
                <HotPlayCard key={p.symbol} p={p} onSelect={pickHot} compact />
              ))}
            </div>
          )}
        </section>

        {/* ── Ticker rails: grouped by asset class; snap strip on phones, wrapping from sm up ── */}
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible">
          {TICKER_GROUPS.map((g) => {
            const items = tickers.filter((t) => g.symbols.has(t.symbol))
            if (items.length === 0) return null
            return (
              <React.Fragment key={g.label}>
                <span className="shrink-0 pl-1 pr-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]/80 first:pl-0">{g.label}</span>
                {items.map((t) => {
                  const active = t.symbol === symbol
                  return (
                    <button
                      key={t.symbol}
                      onClick={() => setSymbol(t.symbol)}
                      title={t.label}
                      className={cn(
                        "shrink-0 snap-start rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide transition-all duration-200 border",
                        active ? "text-[#06080F] border-transparent" : "border-white/10 hover:border-white/25 bg-[rgb(var(--surface-rgb)/0.4)] text-[#9CA3AF] hover:text-white"
                      )}
                      style={active ? { backgroundColor: "var(--brand)", boxShadow: "0 0 18px color-mix(in srgb, var(--brand) 45%, transparent)" } : undefined}
                    >
                      {t.symbol}
                    </button>
                  )
                })}
              </React.Fragment>
            )
          })}
        </div>

        {isLoading ? (
          <SkeletonContent />
        ) : (
          <>
            {/* ── 1. Header ───────────────────────────────────────────── */}
            <motion.div {...fadeUp} className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="h-2.5 w-2.5 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
                <span className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide" style={{ backgroundColor: `${accent}20`, color: accent }}>
                  {symbol}
                </span>
                <h1 className="text-2xl font-bold text-white">Signals</h1>
                <button
                  onClick={() => setGuideOpen(true)}
                  className="rounded-full p-1 text-[#9CA3AF]/80 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                  title="How to read this page"
                >
                  <HelpCircle className="size-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/40">
                <RefreshCw className="size-3.5" />
                <span>{d?.timestamp ? `Last scan: ${new Date(d.timestamp).toLocaleTimeString()}` : "Connecting..."}</span>
                <Countdown lastFetch={fetchTs} color={accent} />
              </div>
            </motion.div>

            {/* ── 1b. Verdict: direction, grade, one confidence bar, plan, why, wrong-if ── */}
            <VerdictCard d={d} reco={reco} dp={dp} symbol={symbol} loading={!d || staleTicker} onJump={jumpTo} />

            {/* ── 2. One alert slot: only the most severe condition is shown ── */}
            {(() => {
              if (staleTicker) {
                return (
                  <AlertBanner icon={RefreshCw} color={accent}>
                    Loading {symbol} — sections below still show {d?.asset} until fresh data arrives
                  </AlertBanner>
                )
              }
              if (pats?.squeeze) return <AlertBanner icon={AlertTriangle} color="#F59E0B">Squeeze risk: {pats.squeeze}</AlertBanner>
              if (call?.catalystRisk) return <AlertBanner icon={AlertTriangle} color="#F59E0B">Catalyst risk: {call.catalystRisk}</AlertBanner>
              if (call?.geoOverride) return <AlertBanner icon={Globe} color="#F59E0B">{call.geoOverride}</AlertBanner>
              const g = d?.oilGeopolitical
              if (g?.regime === "whipsaw" && g.verdict) {
                return <AlertBanner icon={Globe} color="#F59E0B">Headline whipsaw: {g.verdict.summary.split(". ")[0]}</AlertBanner>
              }
              if (vol?.absorption?.detected) {
                return (
                  <AlertBanner icon={BarChart3} color="#F59E0B">
                    Volume absorption ({vol.absorption.strength.toFixed(1)}x):{" "}
                    {vol.absorption.direction === "bullish"
                      ? "buyers absorbing sell pressure, reversal up more likely"
                      : vol.absorption.direction === "bearish"
                        ? "sellers absorbing buy pressure, reversal down more likely"
                        : "heavy volume with no progress, expect a reversal"}
                  </AlertBanner>
                )
              }
              return null
            })()}

            {/* ── 3. Detail tabs: Levels · Momentum · Flow · Macro · Models ── */}
            {d && !staleTicker && (
              <div className="space-y-4">
                <div role="tablist" className="flex flex-nowrap gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {TABS.map((t) => (
                    <button
                      key={t.key}
                      role="tab"
                      aria-selected={tab === t.key}
                      onClick={() => selectTab(t.key)}
                      title={t.hint}
                      className={cn("shrink-0 rounded-lg px-3.5 py-2 text-xs font-bold uppercase tracking-wide transition-colors", tab === t.key ? "text-[#06080F]" : "text-[#9CA3AF] hover:text-white")}
                      style={tab === t.key ? { backgroundColor: "var(--brand)" } : undefined}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {tab === "levels" && <LevelsTab d={d} dp={dp} accent={accent} />}
                {tab === "momentum" && <MomentumTab d={d} />}
                {tab === "flow" && <FlowTab d={d} />}
                {tab === "macro" && (
                  <div className="space-y-5">
            {/* ── 0b. Macro event strip + fresh alerts ─────────────────── */}
            <NextEventsStrip events={macroQ.data?.upcoming} />
            <RecentResults recent={macroQ.data?.recent} active={macroQ.data?.active} />
            <MacroAlerts alerts={macroQ.data?.alerts} />

            <MacroEventCard state={macroQ.data} isLoading={macroQ.isLoading} asset={predAsset} />
            <PredictionOddsPanel asset={predAsset} symbol={symbol} />
            {/* ── 3. Upcoming Catalysts ────────────────────────────────── */}
            {d?.events && d.events.length > 0 && (
              <motion.div {...fadeUp} id="sec-calendar">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="size-4" style={{ color: accent }} />
                  <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">
                    Upcoming Catalysts
                  </h2>
                  <span className="text-[10px] text-[#9CA3AF]/80">Next 24h</span>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md divide-y divide-white/[0.04]">
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
                          <span className="text-[10px] text-[#9CA3AF]/80">{event.currency}</span>
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

            {/* ── 3b. Oil Geopolitical Catalysts ───────────────────────── */}
            {d?.oilGeopolitical && d.oilGeopolitical.events.length > 0 && (() => {
              const g = d.oilGeopolitical
              const col = (s: number) => (s >= 15 ? "#00FF88" : s <= -15 ? "#FF3B5C" : "#F59E0B")
              const regimeCol =
                g.regime === "whipsaw" || g.regime === "extreme" ? "#FF3B5C" : g.regime === "elevated" ? "#F59E0B" : "#6B7280"
              const pct = (p: number | null) => (p == null ? "—" : `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`)
              const ago = (iso: string) => {
                const m = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
                return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`
              }
              const until = (iso: string) => {
                const m = Math.floor((new Date(iso).getTime() - Date.now()) / 60000)
                if (m <= 0) return "now"
                return m < 60 ? `in ${m}m` : m < 1440 ? `in ${Math.floor(m / 60)}h ${m % 60}m` : `in ${Math.floor(m / 1440)}d`
              }
              const bar = (score: number) => Math.min(100, Math.round(Math.abs(score) * 1.25))
              const shown = showAllGeo ? g.events : g.events.slice(0, 5)
              const v = g.verdict
              const pc = g.priceContext
              const nextCol = g.nextScheduled?.impact === "high" ? "#FF3B5C" : g.nextScheduled?.impact === "medium" ? "#F59E0B" : "#6B7280"
              return (
                <motion.div {...fadeUp} id="sec-geo">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Globe className="size-4" style={{ color: "var(--brand)" }} />
                    <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">{g.panelTitle ?? "Catalyst Headlines"}</h2>
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase"
                      style={{ backgroundColor: `${col(g.score)}15`, color: col(g.score) }}
                    >
                      {g.label}
                    </span>
                    <span className="font-mono text-xs font-bold" style={{ color: col(g.score) }}>
                      {g.score > 0 ? "+" : ""}{g.score}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{ backgroundColor: `${regimeCol}15`, color: regimeCol, border: `1px solid ${regimeCol}30` }}
                    >
                      {g.regime}
                    </span>
                    <span className="text-[10px] text-[#9CA3AF]/80 ml-auto">{g.eventCount} events · 72h</span>
                  </div>

                  {v && (v.bullForce || v.bearForce) && (
                    <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4 mb-3 space-y-2.5">
                      {v.bullForce && (
                        <div className="flex items-start gap-3">
                          <span className="w-9 shrink-0 text-[10px] font-bold text-[#00FF88] mt-0.5">BULL</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 min-w-0">
                              <span className="text-xs text-white/75 leading-snug break-words min-w-0">
                                <span className="font-semibold">{v.bullForce.category.replace(/_/g, " ")}</span>
                                <span className="text-white/45"> · {v.bullForce.topHeadline}</span>
                              </span>
                              <span className="font-mono text-[10px] text-white/40 shrink-0">
                                {v.bullForce.count} ev · +{v.bullForce.avgScore} · {pct(v.bullForce.avgReactionPct)}
                              </span>
                            </div>
                            <div className="mt-1.5 h-1 rounded bg-white/[0.05]">
                              <div className="h-1 rounded" style={{ width: `${bar(v.bullForce.avgScore)}%`, backgroundColor: "#00FF88" }} />
                            </div>
                          </div>
                        </div>
                      )}
                      {v.bearForce && (
                        <div className="flex items-start gap-3">
                          <span className="w-9 shrink-0 text-[10px] font-bold text-[#FF3B5C] mt-0.5">BEAR</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 min-w-0">
                              <span className="text-xs text-white/75 leading-snug break-words min-w-0">
                                <span className="font-semibold">{v.bearForce.category.replace(/_/g, " ")}</span>
                                <span className="text-white/45"> · {v.bearForce.topHeadline}</span>
                              </span>
                              <span className="font-mono text-[10px] text-white/40 shrink-0">
                                {v.bearForce.count} ev · {v.bearForce.avgScore} · {pct(v.bearForce.avgReactionPct)}
                              </span>
                            </div>
                            <div className="mt-1.5 h-1 rounded bg-white/[0.05]">
                              <div className="h-1 rounded" style={{ width: `${bar(v.bearForce.avgScore)}%`, backgroundColor: "#FF3B5C" }} />
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 border-t border-white/[0.04]">
                        <span className="w-9 shrink-0 text-[10px] font-bold text-white/50">NET</span>
                        <span className="text-xs font-semibold" style={{ color: col(g.score) }}>
                          {v.netLean.toUpperCase()} {g.score > 0 ? "+" : ""}{g.score}
                        </span>
                        <span className="text-xs text-white/40">
                          · {v.priceFollowing ? `price is following ${v.priceFollowing.replace("_", " ")}` : "price undecided"}
                        </span>
                      </div>
                      {v.flipCondition && (
                        <div className="flex items-start gap-3">
                          <span className="w-9 shrink-0 text-[10px] font-bold text-[#F59E0B] mt-0.5">FLIP</span>
                          <span className="text-xs text-white/50 leading-snug">{v.flipCondition}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {pc && (
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-[10px] text-[#9CA3AF]/80 uppercase">{g.assetName ?? d.assetLabel}</div>
                          <div className="font-mono text-lg font-bold text-white/90">${fmtPrice(pc.current)}</div>
                        </div>
                        <div className="font-mono text-sm font-bold" style={{ color: pc.change24h >= 0 ? "#00FF88" : "#FF3B5C" }}>
                          {pc.change24h >= 0 ? "+" : ""}{fmtPrice(pc.change24h)}{" "}
                          <span className="text-xs">({pc.changePct24h >= 0 ? "+" : ""}{pc.changePct24h.toFixed(2)}%)</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                        <span><span className="text-[#9CA3AF]/80">7d H </span><span className="font-mono text-white/60">${fmtPrice(pc.weekHigh)}</span></span>
                        <span><span className="text-[#9CA3AF]/80">7d L </span><span className="font-mono text-white/60">${fmtPrice(pc.weekLow)}</span></span>
                        {g.nextScheduled && (
                          <span
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
                            style={{ backgroundColor: `${nextCol}15`, color: nextCol }}
                          >
                            <Clock className="size-3" />
                            {g.nextScheduled.name} {until(g.nextScheduled.time)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {g.categoryBreakdown.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {g.categoryBreakdown.map((cat) => {
                        const c = cat.avgScore >= 10 ? "#00FF88" : cat.avgScore <= -10 ? "#FF3B5C" : "#6B7280"
                        return (
                          <span
                            key={cat.category}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                            style={{ backgroundColor: `${c}12`, color: c, border: `1px solid ${c}25` }}
                          >
                            <Flame className="size-2.5" />
                            {cat.category.replace("_", " ")}
                            <span className="font-mono text-[10px] opacity-70">({cat.count})</span>
                            {cat.avgReactionPct != null && (
                              <span className="font-mono text-[10px] opacity-90">{pct(cat.avgReactionPct)}</span>
                            )}
                          </span>
                        )
                      })}
                    </div>
                  )}

                  <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md divide-y divide-white/[0.04]">
                    {shown.map((ev, i) => {
                      const dot = ev.sentiment === "bullish" ? "#00FF88" : ev.sentiment === "bearish" ? "#FF3B5C" : "#6B7280"
                      const imp = ev.impact === "high" ? "#FF3B5C" : ev.impact === "medium" ? "#F59E0B" : "#6B7280"
                      const rc =
                        ev.priceReaction?.confirms === true ? "#00FF88" : ev.priceReaction?.confirms === false ? "#FF3B5C" : "#6B7280"
                      return (
                        <a
                          key={`${ev.url}-${i}`}
                          href={ev.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors group"
                        >
                          <span className="mt-2 size-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-white/60 leading-relaxed group-hover:text-white/80 transition-colors line-clamp-2">
                              {ev.title}
                            </span>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                              <span className="text-[10px] text-[#9CA3AF]/80">{ev.source}</span>
                              <span className="text-[10px] text-[#9CA3AF]/60">·</span>
                              <span className="text-[10px] text-[#9CA3AF]/80">{ago(ev.publishedAt)}</span>
                              <span className="text-[10px] text-[#9CA3AF]/60">·</span>
                              <span className="text-[10px] font-medium uppercase" style={{ color: imp }}>{ev.impact}</span>
                              <span className="text-[10px] font-medium rounded px-1 py-px" style={{ backgroundColor: `${dot}15`, color: dot }}>
                                {ev.category.replace("_", " ")}
                              </span>
                            </div>
                          </div>
                          {ev.priceReaction && (
                            <span
                              title="WTI move since this headline"
                              className="font-mono text-[11px] font-semibold shrink-0 mt-1"
                              style={{ color: rc }}
                            >
                              {pct(ev.priceReaction.sinceEventPct)}
                            </span>
                          )}
                          <ArrowUpRight className="size-3.5 text-[#9CA3AF]/60 group-hover:text-white/50 transition-colors shrink-0 mt-1" />
                        </a>
                      )
                    })}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    {g.events.length > 5 ? (
                      <button
                        type="button"
                        onClick={() => setShowAllGeo(!showAllGeo)}
                        className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
                      >
                        {showAllGeo ? "Show less" : `Show ${g.events.length - 5} more`}
                      </button>
                    ) : <span />}
                    <span className="text-[10px] text-[#9CA3AF]/60 text-right">
                      Updated {new Date(g.lastUpdated).toLocaleTimeString()}
                      {g.sourcesUsed.length > 0 ? ` · Sources: ${g.sourcesUsed.join(", ")}` : ""}
                    </span>
                  </div>
                </motion.div>
              )
            })()}

            {/* ── 9b. News Sentiment ──────────────────────────────────────── */}
            {d?.newsSentiment && d.newsSentiment.headlines.length > 0 && (
              <motion.div {...fadeUp} id="sec-news">
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
                <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md divide-y divide-white/[0.04]">
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

                  </div>
                )}
                {tab === "models" && (
                  <div className="space-y-5">
            {/* ── 5. Signal Confluence ──────────────────────────────────── */}
            {call && call.signalFactors.length > 0 && (
              <motion.div {...fadeUp} id="sec-confluence">
                <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
                  Signal Confluence
                </h2>
                <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4">
                  {call.signalFactors.map((f, i) => (
                    <FactorRow key={i} category={f.category} assessment={f.assessment} weight={f.weight} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── 6b. Market Map ──────────────────────────────────────── */}
            {mapData && (
              <motion.div {...fadeUp} id="sec-market-map">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="size-4" style={{ color: accent }} />
                  <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">
                    Market Map
                  </h2>
                  <span className="text-[10px] text-[#9CA3AF]/60">Daily Structure Analysis</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                  {/* EMA5 Disconnect */}
                  {mapData.ema5Disconnect && (
                    <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-white/40">EMA5 Disconnect</span>
                        {mapData.ema5Disconnect.isDisconnected && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase animate-pulse"
                            style={{
                              backgroundColor: mapData.ema5Disconnect.side === "below" ? "#00FF8815" : "#FF3B5C15",
                              color: mapData.ema5Disconnect.side === "below" ? "#00FF88" : "#FF3B5C",
                            }}
                          >
                            {mapData.ema5Disconnect.signal?.direction === "long" ? "MEAN REVERT LONG" : "MEAN REVERT SHORT"}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">Deviation</span>
                          <span
                            className="font-mono text-sm font-bold"
                            style={{ color: Math.abs(mapData.ema5Disconnect.deviationATR) >= 1.5 ? (mapData.ema5Disconnect.side === "below" ? "#00FF88" : "#FF3B5C") : accent }}
                          >
                            {mapData.ema5Disconnect.deviation > 0 ? "+" : ""}{mapData.ema5Disconnect.deviation.toFixed(2)}%
                            <span className="text-[#9CA3AF]/80 text-[10px] ml-1">({Math.abs(mapData.ema5Disconnect.deviationATR).toFixed(1)} ATR)</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">EMA5</span>
                          <span className="font-mono text-xs text-white/60">${fmtPrice(mapData.ema5Disconnect.ema5)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">Days since reconnect</span>
                          <span className="font-mono text-xs text-white/60">{mapData.ema5Disconnect.daysSinceReconnect}</span>
                        </div>
                        {mapData.ema5Disconnect.reconnectWindow.total > 0 && (
                          <div className="mt-2 pt-2 border-t border-white/[0.04]">
                            <span className="text-[10px] text-[#9CA3AF]/80 uppercase tracking-wider">Reconnect Probability</span>
                            <div className="flex gap-3 mt-1">
                              {[
                                { label: "3d", pct: mapData.ema5Disconnect.reconnectWindow.pct3day },
                                { label: "5d", pct: mapData.ema5Disconnect.reconnectWindow.pct5day },
                                { label: "7d", pct: mapData.ema5Disconnect.reconnectWindow.pct7day },
                              ].map(({ label, pct }) => (
                                <div key={label} className="text-center">
                                  <span className="font-mono text-sm font-bold" style={{ color: pct >= 70 ? "#00FF88" : pct >= 50 ? "#F59E0B" : "#FF3B5C" }}>
                                    {pct}%
                                  </span>
                                  <span className="block text-[9px] text-[#9CA3AF]/80">{label}</span>
                                </div>
                              ))}
                              <span className="text-[9px] text-[#9CA3AF]/60 self-end">n={mapData.ema5Disconnect.reconnectWindow.total}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* EMA5 × SMA200 Crossover */}
                  {mapData.ema5xSma200 && (
                    <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-white/40">EMA5 × SMA{mapData.ema5xSma200.smaPeriod}</span>
                        {mapData.ema5xSma200.freshCross && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase animate-pulse"
                            style={{
                              backgroundColor: mapData.ema5xSma200.crossType === "bullish" ? "#00FF8815" : "#FF3B5C15",
                              color: mapData.ema5xSma200.crossType === "bullish" ? "#00FF88" : "#FF3B5C",
                            }}
                          >
                            FRESH {mapData.ema5xSma200.crossType} CROSS
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">Position</span>
                          <span
                            className="text-xs font-bold"
                            style={{ color: mapData.ema5xSma200.isAbove ? "#00FF88" : "#FF3B5C" }}
                          >
                            EMA5 {mapData.ema5xSma200.isAbove ? "Above" : "Below"} SMA{mapData.ema5xSma200.smaPeriod}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">Last Cross</span>
                          <span className="font-mono text-xs text-white/60">
                            {mapData.ema5xSma200.crossType ? `${mapData.ema5xSma200.crossType} ${mapData.ema5xSma200.daysSinceCross}d ago` : "None found"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">EMA5 Slope</span>
                          <span className="font-mono text-xs" style={{ color: mapData.ema5xSma200.ema5Slope > 0 ? "#00FF88" : "#FF3B5C" }}>
                            {mapData.ema5xSma200.ema5Slope > 0 ? "+" : ""}{mapData.ema5xSma200.ema5Slope.toFixed(3)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">Total Crosses</span>
                          <span className="font-mono text-xs text-white/60">{mapData.ema5xSma200.totalCrossovers}</span>
                        </div>
                        {mapData.ema5xSma200.recentCrossovers.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-white/[0.04]">
                            <span className="text-[10px] text-[#9CA3AF]/80 uppercase tracking-wider">Recent Cross Returns</span>
                            <div className="space-y-1 mt-1">
                              {mapData.ema5xSma200.recentCrossovers.slice(-3).map((cross, i) => (
                                <div key={i} className="flex items-center gap-2 text-[10px]">
                                  <span
                                    className="rounded-full px-1.5 py-0.5 font-bold uppercase"
                                    style={{
                                      backgroundColor: cross.type === "bullish" ? "#00FF8810" : "#FF3B5C10",
                                      color: cross.type === "bullish" ? "#00FF88" : "#FF3B5C",
                                    }}
                                  >
                                    {cross.type === "bullish" ? "Bull" : "Bear"}
                                  </span>
                                  {cross.fwdReturn5 != null && (
                                    <span className="font-mono" style={{ color: cross.fwdReturn5 > 0 ? "#00FF88" : "#FF3B5C" }}>
                                      5d: {cross.fwdReturn5 > 0 ? "+" : ""}{cross.fwdReturn5.toFixed(1)}%
                                    </span>
                                  )}
                                  {cross.fwdReturn10 != null && (
                                    <span className="font-mono" style={{ color: cross.fwdReturn10 > 0 ? "#00FF88" : "#FF3B5C" }}>
                                      10d: {cross.fwdReturn10 > 0 ? "+" : ""}{cross.fwdReturn10.toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* RSI Structure (Daily) */}
                  {mapData.rsiStructure.daily && (
                    <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-white/40">RSI Structure</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                          style={{
                            backgroundColor: mapData.rsiStructure.daily.rsiTrend === "bullish" ? "#00FF8815" : mapData.rsiStructure.daily.rsiTrend === "bearish" ? "#FF3B5C15" : `${accent}15`,
                            color: mapData.rsiStructure.daily.rsiTrend === "bullish" ? "#00FF88" : mapData.rsiStructure.daily.rsiTrend === "bearish" ? "#FF3B5C" : accent,
                          }}
                        >
                          {mapData.rsiStructure.daily.rsiTrend}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">Daily RSI</span>
                          <span className="font-mono text-lg font-bold" style={{ color: mapData.rsiStructure.daily.currentRSI < 30 ? "#00FF88" : mapData.rsiStructure.daily.currentRSI > 70 ? "#FF3B5C" : accent }}>
                            {mapData.rsiStructure.daily.currentRSI.toFixed(1)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-center rounded-lg bg-white/[0.02] p-2">
                            <span className="text-[10px] text-[#9CA3AF]/80">HH / HL</span>
                            <p className="font-mono text-xs font-bold text-[#00FF88]">
                              {mapData.rsiStructure.daily.consecutiveHH} / {mapData.rsiStructure.daily.consecutiveHL}
                            </p>
                          </div>
                          <div className="text-center rounded-lg bg-white/[0.02] p-2">
                            <span className="text-[10px] text-[#9CA3AF]/80">LH / LL</span>
                            <p className="font-mono text-xs font-bold text-[#FF3B5C]">
                              {mapData.rsiStructure.daily.consecutiveLH} / {mapData.rsiStructure.daily.consecutiveLL}
                            </p>
                          </div>
                        </div>
                        {mapData.rsiStructure.daily.pullbacksHoldAbove50 && (
                          <div className="flex items-center gap-1.5 text-[10px] text-[#00FF88]">
                            <Check className="size-3" />
                            Pullbacks hold above 50
                          </div>
                        )}
                        {mapData.rsiStructure.daily.ralliesFailBelow50 && (
                          <div className="flex items-center gap-1.5 text-[10px] text-[#FF3B5C]">
                            <AlertTriangle className="size-3" />
                            Rallies failing below 50
                          </div>
                        )}
                        {mapData.rsiStructure.daily.trendline?.breakDetected && (
                          <div className="flex items-center gap-1.5 text-[10px] animate-pulse" style={{ color: mapData.rsiStructure.daily.trendline.breakType === "resistance_break" ? "#00FF88" : "#FF3B5C" }}>
                            <Zap className="size-3" />
                            RSI {mapData.rsiStructure.daily.trendline.breakType === "resistance_break" ? "resistance" : "support"} break
                          </div>
                        )}
                        {mapData.rsiStructure.daily.divergence.type && (
                          <div className="mt-1 pt-1 border-t border-white/[0.04]">
                            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: mapData.rsiStructure.daily.divergence.type === "bullish" ? "#00FF88" : "#FF3B5C" }}>
                              <GitBranch className="size-3" />
                              {mapData.rsiStructure.daily.divergence.description}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* EMA21 Bounce */}
                  {mapData.ema21Bounce && (
                    <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-white/40">EMA21 Bounce</span>
                        {mapData.ema21Bounce.invalidation && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase animate-pulse bg-[#FF3B5C15] text-[#FF3B5C]">
                            {mapData.ema21Bounce.invalidationType === "bullish_invalidated" ? "BULL INVALID" : "BEAR INVALID"}
                          </span>
                        )}
                        {mapData.ema21Bounce.recentBounce && !mapData.ema21Bounce.invalidation && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                            style={{
                              backgroundColor: mapData.ema21Bounce.bounceType === "support_bounce" ? "#00FF8815" : "#FF3B5C15",
                              color: mapData.ema21Bounce.bounceType === "support_bounce" ? "#00FF88" : "#FF3B5C",
                            }}
                          >
                            {mapData.ema21Bounce.bounceType === "support_bounce" ? "SUPPORT HOLD" : "RESIST HOLD"}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">Distance</span>
                          <span className="font-mono text-sm font-bold" style={{ color: mapData.ema21Bounce.isAbove ? "#00FF88" : "#FF3B5C" }}>
                            {mapData.ema21Bounce.distancePct > 0 ? "+" : ""}{mapData.ema21Bounce.distancePct.toFixed(2)}%
                            <span className="text-[#9CA3AF]/80 text-[10px] ml-1">({Math.abs(mapData.ema21Bounce.distanceATR).toFixed(1)} ATR)</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">EMA21</span>
                          <span className="font-mono text-xs text-white/60">${fmtPrice(mapData.ema21Bounce.ema21)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/40">Slope</span>
                          <span className="text-xs" style={{ color: mapData.ema21Bounce.slopeRising ? "#00FF88" : "#FF3B5C" }}>
                            {mapData.ema21Bounce.slopeRising ? "Rising" : "Falling"}
                          </span>
                        </div>
                        {mapData.ema21Bounce.bounceSuccessRate != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/40">Bounce success rate</span>
                            <span className="font-mono text-xs" style={{ color: mapData.ema21Bounce.bounceSuccessRate >= 60 ? "#00FF88" : "#FF3B5C" }}>
                              {mapData.ema21Bounce.bounceSuccessRate}%
                              <span className="text-[#9CA3AF]/60 ml-1">n={mapData.ema21Bounce.bounceSampleSize}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* RSI Alignment */}
                  {mapData.rsiAlignment && (
                    <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-white/40">RSI Alignment</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                          style={{
                            backgroundColor: mapData.rsiAlignment.aligned
                              ? mapData.rsiAlignment.direction === "bullish" ? "#00FF8815" : "#FF3B5C15"
                              : `${accent}15`,
                            color: mapData.rsiAlignment.aligned
                              ? mapData.rsiAlignment.direction === "bullish" ? "#00FF88" : "#FF3B5C"
                              : accent,
                          }}
                        >
                          {mapData.rsiAlignment.aligned ? `Aligned ${mapData.rsiAlignment.direction}` : "Divergent"}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {(["rsi1h", "rsi4h", "rsi1d"] as const).map((key) => {
                          const label = key === "rsi1h" ? "1H" : key === "rsi4h" ? "4H" : "Daily"
                          const val = mapData.rsiAlignment!.details[key]
                          if (val == null) return null
                          const c = val > 50 ? "#00FF88" : val < 50 ? "#FF3B5C" : accent
                          return (
                            <div key={key} className="flex items-center justify-between">
                              <span className="text-xs text-white/40">{label} RSI</span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-bold" style={{ color: c }}>{val.toFixed(1)}</span>
                                <div className="w-12 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${val}%`, backgroundColor: c }} />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        {mapData.rsiAlignment.details.conflict && (
                          <div className="flex items-center gap-1.5 text-[10px] text-[#F59E0B]">
                            <AlertTriangle className="size-3" />
                            {mapData.rsiAlignment.details.conflict}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bounce Probabilities */}
                  {mapData.bounceProbabilities && (
                    <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-white/40">Forward Returns</span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ backgroundColor: `${accent}15`, color: accent }}>
                          RSI {mapData.bounceProbabilities.rsiZone}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="text-[#9CA3AF]/80 border-b border-white/[0.04]">
                              <th className="text-left py-1 font-medium">Window</th>
                              <th className="text-right py-1 font-medium">Win %</th>
                              <th className="text-right py-1 font-medium">Avg</th>
                              <th className="text-right py-1 font-medium">Median</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(mapData.bounceProbabilities.windows).map(([window, data]) => {
                              const d = data.conditioned ?? data.all
                              if (!d) return null
                              return (
                                <tr key={window} className="border-b border-white/[0.02]">
                                  <td className="py-1.5 text-white/50 font-mono">{window}</td>
                                  <td className="py-1.5 text-right font-mono font-bold" style={{ color: d.positivePct >= 55 ? "#00FF88" : d.positivePct <= 45 ? "#FF3B5C" : accent }}>
                                    {d.positivePct}%
                                  </td>
                                  <td className="py-1.5 text-right font-mono" style={{ color: d.avgReturn > 0 ? "#00FF88" : "#FF3B5C" }}>
                                    {d.avgReturn > 0 ? "+" : ""}{d.avgReturn.toFixed(2)}%
                                  </td>
                                  <td className="py-1.5 text-right font-mono" style={{ color: d.medianReturn > 0 ? "#00FF88" : "#FF3B5C" }}>
                                    {d.medianReturn > 0 ? "+" : ""}{d.medianReturn.toFixed(2)}%
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 flex gap-3 text-[9px] text-[#9CA3AF]/60">
                        <span>EMA5: {mapData.bounceProbabilities.ema5Side}</span>
                        {mapData.bounceProbabilities.sma200Side && <span>SMA200: {mapData.bounceProbabilities.sma200Side}</span>}
                      </div>
                    </div>
                  )}

                </div>
              </motion.div>
            )}

            {/* ── 4b. Setup Scanner ──────────────────────────────────── */}
            {anticipatory && (
              <details className="group" id="sec-setups">
                <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-semibold text-white/50 uppercase tracking-wider py-2 hover:text-white/70 transition-colors">
                  <Eye className="size-4" />
                  Early setups forming
                  <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
                </summary>
              <motion.div {...fadeUp} className="space-y-4 mt-2">

                {/* Overall Readiness Banner */}
                <div
                  className={cn(
                    "relative rounded-xl border p-4 flex items-center gap-4 overflow-hidden",
                    anticipatory.overallReadiness === "SETUP_READY"
                      ? "border-[#00FF88]/30 bg-[#00FF88]/[0.04]"
                      : anticipatory.overallReadiness === "SETUP_FORMING"
                        ? "border-[#F59E0B]/30 bg-[#F59E0B]/[0.04]"
                        : "border-white/[0.06] bg-white/[0.02]"
                  )}
                >
                  {anticipatory.overallReadiness === "SETUP_READY" && (
                    <div className="absolute inset-0 bg-[#00FF88]/[0.03] animate-pulse pointer-events-none" />
                  )}
                  <div className="relative flex items-center gap-3">
                    <span
                      className={cn(
                        "size-3 rounded-full shrink-0",
                        anticipatory.overallReadiness === "SETUP_READY"
                          ? "bg-[#00FF88] animate-pulse"
                          : anticipatory.overallReadiness === "SETUP_FORMING"
                            ? "bg-[#F59E0B]"
                            : "bg-white/20"
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm font-bold uppercase tracking-wider",
                        anticipatory.overallReadiness === "SETUP_READY"
                          ? "text-[#00FF88]"
                          : anticipatory.overallReadiness === "SETUP_FORMING"
                            ? "text-[#F59E0B]"
                            : "text-white/40"
                      )}
                    >
                      {anticipatory.overallReadiness === "SETUP_READY"
                        ? "SETUP READY"
                        : anticipatory.overallReadiness === "SETUP_FORMING"
                          ? "SETUP FORMING"
                          : "NO ACTIVE SETUP"}
                    </span>
                    {anticipatory.overallReadiness !== "NO_SETUP" && (
                      <span className="font-mono text-xs text-white/40">
                        {anticipatory.actionableIn}
                      </span>
                    )}
                  </div>
                </div>

                {/* Approaching Levels */}
                {anticipatory.approachingLevels.length > 0 && (
                  <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04]">
                      <Crosshair className="size-4 text-white/40" />
                      <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                        Approaching Levels
                      </span>
                    </div>
                    <div className="divide-y divide-white/[0.04]">
                      {[...anticipatory.approachingLevels]
                        .sort((a, b) => {
                          const tierOrder = { IMMINENT: 0, APPROACHING: 1, WATCHLIST: 2 }
                          return (tierOrder[a.tier] ?? 3) - (tierOrder[b.tier] ?? 3) || a.distance - b.distance
                        })
                        .map((lvl, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-2.5 gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className={cn(
                                  "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                                  lvl.tier === "IMMINENT"
                                    ? "bg-[#FF3B5C]/15 text-[#FF3B5C] animate-pulse"
                                    : lvl.tier === "APPROACHING"
                                      ? "bg-[#F59E0B]/15 text-[#F59E0B]"
                                      : "bg-[#3B82F6]/10 text-[#3B82F6]/60"
                                )}
                              >
                                {lvl.tier}
                              </span>
                              <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase bg-white/[0.06] text-white/40">
                                {lvl.type.replace("_", " ")}
                                {lvl.fibLevel ? ` ${lvl.fibLevel}` : ""}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-sm font-semibold text-white/80">
                                  {lvl.level.toFixed(dp)}
                                </span>
                                <CopyBtn value={lvl.level.toFixed(dp)} />
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="font-mono text-xs text-white/40">
                                {lvl.distance.toFixed(2)} ATR
                              </span>
                              <span className={cn(
                                "text-xs",
                                Math.abs(lvl.velocity) > 0.5 ? "text-[#FF3B5C]" : "text-[#9CA3AF]/80"
                              )}>
                                {lvl.velocity > 0 ? <ArrowUp className="size-3 inline" /> : <ArrowDown className="size-3 inline" />}
                              </span>
                              {lvl.estimatedCandles != null && (
                                <span className="font-mono text-[10px] text-[#9CA3AF]/80">
                                  ~{lvl.estimatedCandles}c
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Retest Tracker */}
                {anticipatory.retestSetup.active && anticipatory.retestSetup.state && (
                  <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <GitBranch className="size-4 text-white/40" />
                      <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                        Retest Tracker
                      </span>
                      {anticipatory.retestSetup.direction && (
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                            anticipatory.retestSetup.direction === "long"
                              ? "bg-[#00FF88]/15 text-[#00FF88]"
                              : "bg-[#FF3B5C]/15 text-[#FF3B5C]"
                          )}
                        >
                          {anticipatory.retestSetup.direction}
                        </span>
                      )}
                    </div>

                    {/* State Machine */}
                    <div className="flex items-center gap-2 mb-4">
                      {(["BREAKOUT_DETECTED", "PULLBACK_IN_PROGRESS", "RETEST_ZONE"] as const).map((step, i) => {
                        const isActive = anticipatory.retestSetup.state === step
                        const stepLabels = { BREAKOUT_DETECTED: "Breakout", PULLBACK_IN_PROGRESS: "Pullback", RETEST_ZONE: "Retest Zone" }
                        const stepOrder = { BREAKOUT_DETECTED: 0, PULLBACK_IN_PROGRESS: 1, RETEST_ZONE: 2 }
                        const currentOrder = anticipatory.retestSetup.state ? stepOrder[anticipatory.retestSetup.state] : -1
                        const isPast = stepOrder[step] < currentOrder
                        return (
                          <React.Fragment key={step}>
                            {i > 0 && (
                              <div className={cn("h-px flex-1", isPast || isActive ? "bg-[#00FF88]/40" : "bg-white/10")} />
                            )}
                            <div className="flex flex-col items-center gap-1">
                              <span
                                className={cn(
                                  "size-3 rounded-full border-2",
                                  isActive
                                    ? "border-[#00FF88] bg-[#00FF88] animate-pulse"
                                    : isPast
                                      ? "border-[#00FF88]/40 bg-[#00FF88]/20"
                                      : "border-white/20 bg-transparent"
                                )}
                              />
                              <span className={cn(
                                "text-[9px] uppercase tracking-wider whitespace-nowrap",
                                isActive ? "text-[#00FF88] font-bold" : isPast ? "text-white/40" : "text-[#9CA3AF]/60"
                              )}>
                                {stepLabels[step]}
                              </span>
                            </div>
                          </React.Fragment>
                        )
                      })}
                    </div>

                    <div className="flex items-center gap-4">
                      {anticipatory.retestSetup.level != null && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-[#9CA3AF]/80 uppercase">Level</span>
                          <span className="font-mono text-sm font-semibold text-white/80">
                            {anticipatory.retestSetup.level.toFixed(dp)}
                          </span>
                          <CopyBtn value={anticipatory.retestSetup.level.toFixed(dp)} />
                        </div>
                      )}
                      <div className="flex items-center gap-2 ml-auto">
                        <span className={cn(
                          "flex items-center gap-1 text-[10px] uppercase",
                          anticipatory.retestSetup.volumeConfirms ? "text-[#00FF88]" : "text-[#9CA3AF]/60"
                        )}>
                          {anticipatory.retestSetup.volumeConfirms
                            ? <Check className="size-3" />
                            : <Minus className="size-3" />}
                          Vol
                        </span>
                        <span className={cn(
                          "flex items-center gap-1 text-[10px] uppercase",
                          anticipatory.retestSetup.rsiResetting ? "text-[#00FF88]" : "text-[#9CA3AF]/60"
                        )}>
                          {anticipatory.retestSetup.rsiResetting
                            ? <Check className="size-3" />
                            : <Minus className="size-3" />}
                          RSI
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Structure Signals */}
                {anticipatory.structureSignals.length > 0 && (
                  <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <GitBranch className="size-4 text-white/40" />
                      <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                        Structure Signals
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {anticipatory.structureSignals.map((sig, i) => {
                        const typeColor =
                          sig.type === "BOS_FORMING" ? "#22D3EE"
                            : sig.type === "CHOCH_FORMING" ? "#A855F7"
                              : "#F59E0B"
                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                                style={{ backgroundColor: `${typeColor}15`, color: typeColor }}
                              >
                                {sig.type.replace("_", " ")}
                              </span>
                              {sig.direction === "bullish"
                                ? <ArrowUp className="size-3 text-[#00FF88]" />
                                : <ArrowDown className="size-3 text-[#FF3B5C]" />}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-white/60">
                                {sig.referenceLevel.toFixed(dp)}
                              </span>
                              <span className="font-mono text-[10px] text-[#9CA3AF]/80">
                                {sig.distanceToTrigger.toFixed(2)} ATR
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Confluence Meter */}
                <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Gauge className="size-4 text-white/40" />
                    <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                      Confluence
                    </span>
                    <span
                      className={cn(
                        "ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                        anticipatory.confluence.status === "SETUP_IMMINENT"
                          ? "bg-[#FF3B5C]/15 text-[#FF3B5C] animate-pulse"
                          : anticipatory.confluence.status === "SETUP_FORMING"
                            ? "bg-[#F59E0B]/15 text-[#F59E0B]"
                            : "bg-white/[0.06] text-[#9CA3AF]/80"
                      )}
                    >
                      {anticipatory.confluence.status.replace("_", " ")}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase tracking-wider text-white/40">Score</span>
                      <span className="font-mono text-sm font-bold" style={{
                        color: anticipatory.confluence.score >= 70 ? "#00FF88"
                          : anticipatory.confluence.score >= 40 ? "#F59E0B"
                            : "#6B7280"
                      }}>
                        {anticipatory.confluence.score}/100
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${anticipatory.confluence.score}%`,
                          backgroundColor: anticipatory.confluence.score >= 70 ? "#00FF88"
                            : anticipatory.confluence.score >= 40 ? "#F59E0B"
                              : "#6B7280"
                        }}
                      />
                    </div>
                  </div>

                  {/* Converging Indicators */}
                  {anticipatory.confluence.convergingIndicators.length > 0 && (
                    <div className="space-y-1.5">
                      {anticipatory.confluence.convergingIndicators.map((ind, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs text-white/60 min-w-[100px] truncate">{ind.name}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#00FF88]/60"
                              style={{ width: `${Math.min(ind.weight * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-[#9CA3AF]/80 min-w-[80px] truncate text-right">{ind.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Order Flow Alerts */}
                {(anticipatory.orderFlow.cvdDivergenceForming.detected ||
                  anticipatory.orderFlow.fundingInflection ||
                  anticipatory.orderFlow.absorptionSequence > 0 ||
                  anticipatory.orderFlow.oiPriceDivergence) && (
                  <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Waves className="size-4 text-white/40" />
                      <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                        Order Flow
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {anticipatory.orderFlow.cvdDivergenceForming.detected && (
                        <span className={cn(
                          "rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase",
                          anticipatory.orderFlow.cvdDivergenceForming.direction === "bullish"
                            ? "bg-[#00FF88]/10 text-[#00FF88]"
                            : "bg-[#FF3B5C]/10 text-[#FF3B5C]"
                        )}>
                          CVD Div {anticipatory.orderFlow.cvdDivergenceForming.direction}
                        </span>
                      )}
                      {anticipatory.orderFlow.fundingInflection && (
                        <span className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase bg-[#F59E0B]/10 text-[#F59E0B]">
                          Funding Inflection
                        </span>
                      )}
                      {anticipatory.orderFlow.absorptionSequence > 0 && (
                        <span className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase bg-[#22D3EE]/10 text-[#22D3EE]">
                          Absorption x{anticipatory.orderFlow.absorptionSequence}
                        </span>
                      )}
                      {anticipatory.orderFlow.oiPriceDivergence && (
                        <span className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase bg-[#A855F7]/10 text-[#A855F7]">
                          OI: {anticipatory.orderFlow.oiPriceDivergence}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Projections Timeline */}
                {anticipatory.projections.length > 0 && (
                  <div className="rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] backdrop-blur-md p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="size-4 text-white/40" />
                      <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                        Projections
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[...anticipatory.projections]
                        .sort((a, b) => a.estimatedCandles - b.estimatedCandles)
                        .map((proj, i) => (
                          <div
                            key={i}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border px-3 py-2",
                              proj.direction === "bullish"
                                ? "border-[#00FF88]/20 bg-[#00FF88]/[0.03]"
                                : "border-[#FF3B5C]/20 bg-[#FF3B5C]/[0.03]"
                            )}
                          >
                            <span className={cn(
                              "text-xs font-semibold",
                              proj.direction === "bullish" ? "text-[#00FF88]" : "text-[#FF3B5C]"
                            )}>
                              {proj.trigger}
                            </span>
                            <span className="font-mono text-[10px] text-[#9CA3AF]/80">
                              ~{proj.estimatedCandles}c
                            </span>
                            {proj.direction === "bullish"
                              ? <ArrowUp className="size-3 text-[#00FF88]" />
                              : <ArrowDown className="size-3 text-[#FF3B5C]" />}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </motion.div>
              </details>
            )}

            {/* ── 4a. Oil Scenario Forecast ──────────────────────────────── */}
            {d?.oilForecast && d.oilForecast.scenarios.length > 0 && (
              <motion.div {...fadeUp} id="sec-forecast">
                <div className="flex items-center gap-2 mb-3">
                  <Crosshair className="size-4" style={{ color: accent }} />
                  <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">Scenario Forecast</h2>
                  <span className="text-[10px] text-[#9CA3AF]/80 ml-auto">horizon ~{d.oilForecast.horizonHours}h</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {d.oilForecast.scenarios.map((s, i) => {
                    const c = s.direction === "LONG" ? "#00FF88" : "#FF3B5C"
                    const px = d.price.mark
                    const tp = px ? ((s.target - px) / px) * 100 : 0
                    const p = Math.round(s.probability * 100)
                    return (
                      <div key={i} className="rounded-xl border p-4" style={{ borderColor: `${c}30`, backgroundColor: `${c}08` }}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${c}20`, color: c }}>
                            {s.direction}
                          </span>
                          <span className="font-mono text-xs font-bold" style={{ color: c }}>{p}%</span>
                        </div>
                        <div className="text-sm text-white/85 font-medium leading-snug mb-1">{s.name}</div>
                        <div className="text-[11px] text-white/45 mb-3 leading-snug">If: {s.trigger}</div>
                        <div className="h-1 rounded bg-white/[0.05] mb-3">
                          <div className="h-1 rounded" style={{ width: `${p}%`, backgroundColor: c }} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                          <div>
                            <div className="text-[#9CA3AF]/80">Target</div>
                            <div className="font-mono text-white/85">
                              ${fmtPrice(s.target)} <span style={{ color: c }}>({tp >= 0 ? "+" : ""}{tp.toFixed(1)}%)</span>
                            </div>
                          </div>
                          <div>
                            <div className="text-[#9CA3AF]/80">Stop ref</div>
                            <div className="font-mono text-white/60">${fmtPrice(s.stopRef)}</div>
                          </div>
                          <div>
                            <div className="text-[#9CA3AF]/80">R:R</div>
                            <div className="font-mono text-white/85">{s.rr.toFixed(2)}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2 text-[10px] text-[#9CA3AF]/80 leading-snug">{d.oilForecast.note}</div>
              </motion.div>
            )}

                  </div>
                )}
              </div>
            )}

            {/* ── 4. Track record: one line, the full page has the rest ── */}
            {historyData?.stats && (
              <div id="sec-track-record" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.5)] px-4 py-2.5 text-xs text-[#9CA3AF]">
                <span className="font-semibold uppercase tracking-[0.14em] text-white/60">Verified track record</span>
                <span><span className="font-mono text-white">{historyData.stats.total}</span> logged</span>
                <span><span className="font-mono text-white">{historyData.stats.winRate}%</span> reached TP1</span>
                <a href="/signals/performance" className="ml-auto font-semibold text-white/80 hover:text-white transition-colors">Full performance →</a>
              </div>
            )}

            {/* ── 14. Footer ────────────────────────────────────────────── */}
            <div className="flex items-center justify-between border-t border-white/[0.04] pt-4 text-xs text-[#9CA3AF]/80">
              <span>{ind?.regime ?? "—"} regime</span>
              <span>Auto-refreshes every 30s &middot; Not financial advice</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
