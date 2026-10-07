"use client"

import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Colors. Green/red are reserved for long/short and up/down. Amber is for
// warnings. Everything else (horizons, chip states, intensity) is white/gray.
// ---------------------------------------------------------------------------

export const GREEN = "#00FF88"
export const RED = "#FF3B5C"
export const AMBER = "#F59E0B"
export const GRAY = "#9CA3AF"
export const MUTED = "#6B7280"

export const SURFACE = "rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb,10_14_23)/0.5)] backdrop-blur-md"

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const fmt = (n: number | null | undefined, decimals = 2) => {
  if (n == null) return "—"
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export const fmtPrice = (n: number | null | undefined) => {
  if (n == null) return "—"
  if (Math.abs(n) >= 1000) return fmt(n, 0)
  if (Math.abs(n) >= 1) return fmt(n, 2)
  if (Math.abs(n) >= 0.01) return fmt(n, 4)
  return fmt(n, 6)
}

export const fmtCompact = (n: number | null | undefined) => {
  if (n == null) return "—"
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(2)
}

export const priceDp = (price: number) => {
  if (price >= 1000) return 0
  if (price >= 1) return 2
  if (price >= 0.01) return 4
  return 6
}

export const pctFrom = (target: number, price: number) => {
  if (!(price > 0)) return ""
  const p = ((target - price) / price) * 100
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`
}

export const pctColor = (v: number | null) => (v == null ? "text-white/50" : v >= 0 ? "text-[#00FF88]" : "text-[#FF3B5C]")

export const dirColor = (d: string | null | undefined) => {
  if (d === "LONG" || d === "bull" || d === "bullish" || d === "long") return GREEN
  if (d === "SHORT" || d === "bear" || d === "bearish" || d === "short") return RED
  return GRAY
}

// Copy-level mapping only; API values are untouched.
export const dirLabel = (d: string | null | undefined) => (d === "LONG" ? "Long" : d === "SHORT" ? "Short" : "Stand aside")

export const GRADE_LABEL: Record<string, string> = {
  "A+": "strong setup",
  A: "strong setup",
  B: "decent",
  C: "marginal",
  "NO TRADE": "no setup",
}

export const assessmentColor = (a: string) => {
  const l = a.toLowerCase()
  if (l.includes("bull")) return GREEN
  if (l.includes("bear")) return RED
  return MUTED
}

export const divColor = (d: string | null) => {
  if (!d) return MUTED
  const l = d.toLowerCase()
  if (l.includes("hidden bull")) return "#7BEBC2"
  if (l.includes("bull")) return GREEN
  if (l.includes("hidden bear")) return "#FFB3BD"
  if (l.includes("bear")) return RED
  return MUTED
}

export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: "easeOut" as const },
}

// ---------------------------------------------------------------------------
// Tooltips for the less obvious stat labels
// ---------------------------------------------------------------------------

export const HINTS: Record<string, string> = {
  CVD: "Cumulative Volume Delta: running total of buy volume minus sell volume. Positive means buyers have been in control.",
  ADX: "Average Directional Index: trend strength regardless of direction. Above 25 is trending, below 20 is ranging.",
  "BB Width": "Bollinger Band width relative to price. Low values mean volatility compression that often precedes a breakout.",
  Supertrend: "ATR-based trend overlay. Bullish when price holds above the band, bearish when below.",
  "Stoch RSI": "Stochastic RSI: where RSI sits inside its recent range. Above 80 is stretched high, below 20 washed out.",
  Absorption: "Large volume with little price movement: one side is absorbing the other's orders, which often precedes a reversal.",
  "Open interest": "Total value of open perpetual contracts. Rising OI with rising price means new money is entering.",
  "Funding rate": "Periodic payment between longs and shorts on perpetuals. Positive means longs pay shorts (crowded long).",
  Liquidations: "Forced closes of leveraged positions. Mostly longs means buyers are being flushed (fuel for a bounce once it slows); mostly shorts means a squeeze is running.",
  "Buy wall": "A cluster of resting bids far larger than its neighbours. Price tends to bounce there; a stop just below it has cover. Walls can be pulled.",
  "Sell wall": "A cluster of resting asks far larger than its neighbours. Price tends to stall there; take partial profit in front of it rather than through it.",
  Whipsaw: "Headline regime where bullish and bearish catalysts are landing in quick succession, so price keeps reversing.",
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function SectionTitle({ icon: Icon, children, right, id }: { icon?: React.ElementType; children: React.ReactNode; right?: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="flex flex-wrap items-center gap-2 mb-3">
      {Icon && <Icon className="size-4 text-white/40" />}
      <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider">{children}</h2>
      {right}
    </div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
  hint,
}: {
  label: string
  value: string
  sub?: string
  color?: string
  icon?: React.ElementType
  hint?: string
}) {
  const tip = hint ?? HINTS[label]
  return (
    <div className={cn(SURFACE, "px-4 py-3")}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="size-3.5 text-[#9CA3AF]/80" />}
        <span className={cn("text-[10px] uppercase tracking-wider text-white/40", tip && "cursor-help underline decoration-dotted decoration-white/20 underline-offset-2")} title={tip}>
          {label}
        </span>
      </div>
      <p className="font-mono text-lg font-bold tabular-nums" style={{ color: color ?? "rgba(255,255,255,0.9)" }}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-white/40 mt-0.5">{sub}</p>}
    </div>
  )
}

export function Chip({ children, color, title, className }: { children: React.ReactNode; color?: string; title?: string; className?: string }) {
  const c = color ?? "rgba(255,255,255,0.6)"
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", className)}
      style={{ backgroundColor: color ? `${color}15` : "rgba(255,255,255,0.06)", color: c }}
    >
      {children}
    </span>
  )
}

export function AlertBanner({ icon: Icon, color, children }: { icon: React.ElementType; color: string; children: React.ReactNode }) {
  return (
    <motion.div {...fadeUp} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: `${color}10`, border: `1px solid ${color}30` }}>
      <Icon className="size-5 shrink-0" style={{ color }} />
      <span className="text-sm font-medium" style={{ color }}>{children}</span>
    </motion.div>
  )
}

export function DivergenceCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={cn(SURFACE, "px-4 py-3")}>
      <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
      <p className="font-mono text-sm font-bold mt-1" style={{ color: divColor(value) }}>{value ?? "None"}</p>
    </div>
  )
}

export function FactorRow({ category, assessment, weight }: { category: string; assessment: string; weight: number }) {
  const color = assessmentColor(assessment)
  return (
    <div className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-sm text-white/60 w-32 sm:w-36 shrink-0 truncate">{category}</span>
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

// Horizontal scroll wrapper so no wide table overflows the viewport on phones.
export function TableScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(SURFACE, "overflow-hidden", className)}>
      <div className="overflow-x-auto [scrollbar-width:thin]">{children}</div>
    </div>
  )
}

export const TH = "px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-[#9CA3AF]/80 whitespace-nowrap"
export const TD = "px-3 py-2 font-mono text-xs tabular-nums whitespace-nowrap"

// ---------------------------------------------------------------------------
// Countdown (isolated so the 1s tick re-renders only this span)
// ---------------------------------------------------------------------------

export function Countdown({ lastFetch, interval = 30_000, color }: { lastFetch: number; interval?: number; color: string }) {
  const [remaining, setRemaining] = useState(Math.ceil(interval / 1000))
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((interval - (Date.now() - lastFetch)) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [interval, lastFetch])
  return <span className="font-mono" style={{ color }}>{remaining}s</span>
}

export function SkeletonContent() {
  return (
    <div className="space-y-5">
      <div className="h-56 rounded-2xl bg-white/[0.04] animate-pulse" />
      <div className="h-9 w-80 max-w-full rounded-lg bg-white/[0.04] animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scroll to a section id (opens any <details> ancestors, briefly highlights it)
// ---------------------------------------------------------------------------

export function scrollToSection(id: string, accent = AMBER): boolean {
  if (typeof document === "undefined") return false
  const el = document.getElementById(id)
  if (!el) return false
  let p: HTMLElement | null = el
  while (p) {
    if (p instanceof HTMLDetailsElement) p.open = true
    p = p.parentElement
  }
  el.style.scrollMarginTop = "88px"
  const distance = Math.abs(el.getBoundingClientRect().top - 88)
  el.scrollIntoView({ behavior: distance > 1800 ? "auto" : "smooth", block: "start" })
  if (!el.style.borderRadius) el.style.borderRadius = "12px"
  el.style.transition = "box-shadow 300ms ease"
  el.style.boxShadow = `0 0 0 2px ${accent}`
  window.setTimeout(() => {
    el.style.boxShadow = ""
  }, 1800)
  return true
}

export const timeAgo = (ts: number) => {
  const m = Math.max(1, Math.floor((Date.now() - ts) / 60000))
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`
}

export const timeUntil = (ts: number) => {
  const m = Math.floor((ts - Date.now()) / 60000)
  if (m <= 0) return "now"
  return m < 60 ? `in ${m}m` : m < 1440 ? `in ${Math.floor(m / 60)}h ${m % 60}m` : `in ${Math.floor(m / 1440)}d`
}
