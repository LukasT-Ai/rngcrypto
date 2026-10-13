"use client"

import React, { useSyncExternalStore } from "react"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Importance } from "@/lib/macro/types"
import type { Urgency } from "@/lib/macro/format"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// ---------------------------------------------------------------------------
// Colors. Green/red are reserved for long/short and up/down. Amber is for
// warnings and nothing else. Importance and urgency are encoded as luminance
// and the brand accent. Cyan and purple are the two prediction-venue
// identities and appear nowhere else on the signal pages.
// ---------------------------------------------------------------------------

export const GREEN = "#00FF88"
export const RED = "#FF3B5C"
export const AMBER = "#F59E0B"
export const GRAY = "#9CA3AF"
export const MUTED = "#6B7280"
export const CYAN = "#22D3EE"
export const PURPLE = "#A855F7"
export const BRAND = "var(--brand, #00FF88)"

// Blur budget: cards are solid; only the context bar and the verdict blur the page background.
export const SURFACE = "rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb,10_14_23)/0.75)]"
export const SURFACE_BLUR = "rounded-2xl border border-white/[0.08] bg-[rgb(var(--surface-rgb,10_14_23)/0.55)] backdrop-blur-xl"

// Visible focus for every interactive element on the signal pages.
export const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand,#00FF88)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#06080F]"

// Type scale roles (design-ux-ui.md 4.2). Nothing a reader must read goes below 11px; 10px is eyebrow only.
export const LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-white/50"
export const EYEBROW = "text-[10px] font-semibold uppercase tracking-[0.14em]"

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

export const signed = (n: number, dp = 0) => `${n > 0 ? "+" : ""}${n.toFixed(dp)}`

// Minutes to a compact duration: 95 -> "1h 35m", 2880 -> "2d".
export const fmtMinutes = (min: number | null | undefined) => {
  if (min == null || !Number.isFinite(min)) return "—"
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return `${d}d${h ? ` ${h}h` : ""}`
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

// Strength of a bull/bear read as opacity, never as a different hue: strong 100 / normal 70 / slight 50.
export const assessmentColor = (a: string) => {
  const l = a.toLowerCase()
  if (l.includes("bull")) return GREEN
  if (l.includes("bear")) return RED
  return MUTED
}
export const assessmentOpacity = (a: string) => {
  const l = a.toLowerCase()
  if (l.includes("strong")) return 1
  if (l.includes("slightly")) return 0.5
  return 0.7
}

export const divColor = (d: string | null) => {
  if (!d) return MUTED
  const l = d.toLowerCase()
  if (l.includes("bull")) return GREEN
  if (l.includes("bear")) return RED
  return MUTED
}
export const divOpacity = (d: string | null) => (d && d.toLowerCase().includes("hidden") ? 0.7 : 1)

// Kept for callers that still spread it onto framer elements; new code uses the `rise-in` CSS class.
export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: "easeOut" as const },
}

// ---------------------------------------------------------------------------
// Shared ticker. One interval for the whole page; a consumer re-renders only
// when floor(now / tickMs) changes, so a 15s consumer sees 4 renders a minute
// no matter how many 1s countdowns are on screen.
// ---------------------------------------------------------------------------

const tick = { now: Date.now(), listeners: new Set<() => void>(), id: null as ReturnType<typeof setInterval> | null }

function subscribeTick(cb: () => void) {
  tick.listeners.add(cb)
  if (tick.listeners.size === 1) {
    tick.now = Date.now()
    tick.id = setInterval(() => {
      tick.now = Date.now()
      tick.listeners.forEach((l) => l())
    }, 1000)
    cb()
  }
  return () => {
    tick.listeners.delete(cb)
    if (tick.listeners.size === 0 && tick.id) {
      clearInterval(tick.id)
      tick.id = null
    }
  }
}

// During SSR and hydration the snapshot is 0 so server and client markup agree; consumers that render a
// time-derived string should treat 0 as "not ticked yet". The real value arrives on the first client render.
const serverSnap = () => 0
export function useNow(tickMs = 1000) {
  const snap = () => Math.floor(tick.now / tickMs) * tickMs
  return useSyncExternalStore(subscribeTick, snap, serverSnap)
}

// ---------------------------------------------------------------------------
// Tooltips for the less obvious stat labels
// ---------------------------------------------------------------------------

export const HINTS: Record<string, string> = {
  CVD: "Cumulative Volume Delta: running total of buy volume minus sell volume. Positive means buyers have been in control.",
  ADX: "Average Directional Index: measures trend STRENGTH, not direction. Below 20 is a range, 20 to 25 an emerging trend, above 25 trending, above 40 stretched. +DI and -DI give the push direction.",
  Cloud: "Ichimoku cloud (9/26/52). Price above the cloud is a bull regime, below is bear, inside is undecided. The cloud under the current bar was set 26 bars ago.",
  "200MA": "200-period simple moving average on that timeframe. Above a rising 200MA is a bull regime, below a falling one is bear. Distance is shown in ATR: beyond 3 ATR means stretched.",
  "TK cross": "Tenkan (9) crossing Kijun (26). A bullish cross above the cloud is a strong continuation signal; a cross inside the cloud is weak.",
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

// Radix tooltip for decision data. Works on hover and keyboard focus (the wrapper is focusable); `title=` does neither.
export function Tip({ content, children, side, className }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  if (!content) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn("inline-flex min-w-0 items-center rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand,#00FF88)]", className)}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------------
// Chip vocabulary (design-ux-ui.md 4.3). One primitive, one `variant` per
// family. Direction is the only family that uses green/red for a direction;
// verification may use red for "conflict" (a status). Importance and urgency
// are weights: luminance and the brand accent, never red or blue.
// ---------------------------------------------------------------------------

export type ChipVariant = "neutral" | "direction" | "grade" | "regime" | "vol" | "importance" | "urgency" | "kind" | "phase" | "verification" | "warning" | "venue"

interface ChipLook {
  color: string
  bg: string
  border?: string
  weight?: string
}

const W = (a: number) => `rgba(255,255,255,${a})`

export function chipLook(variant: ChipVariant, value?: string | null, color?: string): ChipLook {
  const v = (value ?? "").toString().toLowerCase()
  switch (variant) {
    case "direction":
      if (v === "long" || v === "bullish" || v === "bull") return { color: GREEN, bg: `${GREEN}26` }
      if (v === "short" || v === "bearish" || v === "bear") return { color: RED, bg: `${RED}26` }
      return { color: W(0.7), bg: W(0.08) }
    case "grade":
      return { color: W(0.85), bg: W(0.08) }
    case "regime":
      if (v.startsWith("bull")) return { color: GREEN, bg: `${GREEN}26` }
      if (v.startsWith("bear")) return { color: RED, bg: `${RED}26` }
      if (v.startsWith("transition")) return { color: AMBER, bg: `${AMBER}26` }
      return { color: GRAY, bg: W(0.08) }
    case "vol":
      return { color: W(0.6), bg: W(0.08) }
    case "importance":
      return { color: v === "critical" ? W(0.9) : v === "high" ? W(0.85) : W(0.6), bg: W(0.05) }
    case "urgency":
      if (v === "now" || v === "urgent") return { color: BRAND, bg: "transparent", border: W(0.12), weight: "font-bold" }
      if (v === "strong") return { color: AMBER, bg: "transparent", border: W(0.12), weight: "font-semibold" }
      if (v === "highlight") return { color: W(0.9), bg: "transparent", border: W(0.12) }
      return { color: W(0.5), bg: "transparent", border: W(0.1) }
    case "kind":
      return { color: W(0.5), bg: W(0.05) }
    case "phase":
      if (v === "releasing" || v === "confirming") return { color: W(0.9), bg: W(0.06), border: BRAND }
      return { color: W(0.7), bg: W(0.06) }
    case "verification":
      if (v === "verified") return { color: GREEN, bg: `${GREEN}26` }
      if (v === "awaiting") return { color: AMBER, bg: `${AMBER}26` }
      if (v === "conflict") return { color: RED, bg: `${RED}26` }
      return { color: GRAY, bg: W(0.08) }
    case "warning":
      return { color: AMBER, bg: `${AMBER}1A` }
    case "venue":
      return { color: v === "polymarket" ? PURPLE : CYAN, bg: "transparent" }
    default:
      return color ? { color, bg: `${color}26` } : { color: W(0.6), bg: W(0.06) }
  }
}

// Importance is a weight, so it is a luminance dot: critical = brand, high = white/90, medium = white/40, low = outline.
export function ImportanceDot({ importance, className }: { importance: Importance; className?: string }) {
  const style =
    importance === "critical"
      ? { backgroundColor: BRAND }
      : importance === "high"
        ? { backgroundColor: W(0.9) }
        : importance === "medium"
          ? { backgroundColor: W(0.4) }
          : { backgroundColor: "transparent", boxShadow: `inset 0 0 0 1px ${W(0.25)}` }
  return <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full", className)} style={style} />
}

export const urgencyTone = (u: Urgency | "normal") => chipLook("urgency", u)

export function Chip({
  children,
  variant = "neutral",
  value,
  color,
  title,
  tip,
  icon: Icon,
  className,
  size = "eyebrow",
}: {
  children: React.ReactNode
  variant?: ChipVariant
  value?: string | null
  /** Legacy override; prefer `variant` + `value`. */
  color?: string
  /** Plain-text fallback; prefer `tip` for anything a reader needs. */
  title?: string
  tip?: React.ReactNode
  icon?: React.ElementType
  className?: string
  /** eyebrow = 10px uppercase (default); label = 11px sentence case. */
  size?: "eyebrow" | "label"
}) {
  const look = chipLook(variant, value, color)
  const WarnIcon = variant === "warning" && !Icon ? AlertTriangle : Icon
  const body = (
    <span
      title={tip ? undefined : title}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md px-1.5 whitespace-nowrap",
        size === "eyebrow" ? "text-[10px] font-bold uppercase tracking-wide" : "text-[11px] font-medium",
        look.weight,
        className
      )}
      style={{ backgroundColor: look.bg, color: look.color, boxShadow: look.border ? `inset 0 0 0 1px ${look.border}` : undefined }}
    >
      {WarnIcon && <WarnIcon className="size-3 shrink-0" />}
      {variant === "importance" && value && <ImportanceDot importance={value as Importance} />}
      {children}
    </span>
  )
  return tip ? <Tip content={tip}>{body}</Tip> : body
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function SectionTitle({ icon: Icon, children, right, id }: { icon?: React.ElementType; children: React.ReactNode; right?: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="flex flex-wrap items-center gap-2 mb-3">
      {Icon && <Icon className="size-4 text-white/50" />}
      <h2 className="text-[13px] font-semibold text-white/60 uppercase tracking-[0.06em]">{children}</h2>
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
  delta,
}: {
  label: string
  value: string
  sub?: string
  color?: string
  icon?: React.ElementType
  hint?: string
  /** Signed delta shown right of the value, green/red by sign. */
  delta?: number | null
}) {
  const tip = hint ?? HINTS[label]
  const labelEl = <span className={cn(LABEL, tip && "cursor-help underline decoration-dotted decoration-white/25 underline-offset-2")}>{label}</span>
  return (
    <div className={cn(SURFACE, "px-3 py-2.5 sm:px-4 sm:py-3")}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="size-3.5 text-white/50" />}
        {tip ? <Tip content={tip}>{labelEl}</Tip> : labelEl}
      </div>
      <p className="flex items-baseline gap-2 font-mono text-lg font-bold tabular-nums" style={{ color: color ?? "rgba(255,255,255,0.9)" }}>
        {value}
        {delta != null && <span className={cn("text-xs font-semibold", pctColor(delta))}>{signed(delta, 1)}%</span>}
      </p>
      {sub && <p className="text-[11px] text-white/50 mt-0.5">{sub}</p>}
    </div>
  )
}

export function AlertBanner({ icon: Icon, color, children }: { icon: React.ElementType; color: string; children: React.ReactNode }) {
  return (
    <div role="status" className="rise-in flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: `${color}10`, border: `1px solid ${color}30` }}>
      <Icon className="size-5 shrink-0" style={{ color }} />
      <span className="text-sm font-medium" style={{ color }}>{children}</span>
    </div>
  )
}

export function DivergenceCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className={cn(SURFACE, "px-3 py-2.5 sm:px-4 sm:py-3")}>
      <span className={LABEL}>{label}</span>
      <p className="font-mono text-sm font-bold mt-1" style={{ color: divColor(value), opacity: divOpacity(value) }}>{value ?? "None"}</p>
    </div>
  )
}

// Factor row as a signed two-arm bar (design-ux-ui.md 4.5 rule 3): direction is the arm side, strength the arm length;
// weight is a right-aligned number, not a bar length.
export function FactorRow({ category, assessment, weight }: { category: string; assessment: string; weight: number }) {
  const color = assessmentColor(assessment)
  const l = assessment.toLowerCase()
  const dir = l.includes("bull") ? 1 : l.includes("bear") ? -1 : 0
  const mag = dir === 0 ? 0 : l.includes("strong") ? 100 : l.includes("slightly") ? 35 : 65
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[13px] text-white/60 w-32 sm:w-36 shrink-0 truncate">{category}</span>
      <div className="relative h-1 flex-1 rounded-full bg-white/[0.06]">
        <span aria-hidden className="absolute left-1/2 top-[-2px] h-2 w-px bg-white/20" />
        {dir !== 0 && (
          <span
            className="absolute top-0 h-1 rounded-full"
            style={{ backgroundColor: color, opacity: assessmentOpacity(assessment), width: `${mag / 2}%`, ...(dir > 0 ? { left: "50%" } : { right: "50%" }) }}
          />
        )}
      </div>
      <span className="w-24 shrink-0 text-right text-xs font-semibold" style={{ color, opacity: dir === 0 ? 0.8 : assessmentOpacity(assessment) }}>{assessment}</span>
      <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-white/50">{weight}%</span>
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

export const TH = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-white/50 whitespace-nowrap"
export const TD = "px-3 py-1.5 font-mono text-xs tabular-nums whitespace-nowrap"

// Toggle button with aria-pressed; the visible focus ring comes from FOCUS_RING.
export function Toggle({ pressed, onClick, children, className, title }: { pressed: boolean; onClick: () => void; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
        pressed ? "bg-white/[0.1] text-white/90" : "text-white/50 hover:text-white/80",
        FOCUS_RING,
        className
      )}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Countdown (reads the shared ticker; re-renders only this span)
// ---------------------------------------------------------------------------

export function Countdown({ lastFetch, interval = 30_000, color }: { lastFetch: number; interval?: number; color: string }) {
  const now = useNow(1000)
  if (now === 0) return <span className="font-mono tabular-nums" style={{ color }}>…</span>
  const remaining = Math.max(0, Math.ceil((interval - (now - lastFetch)) / 1000))
  return <span className="font-mono tabular-nums" style={{ color }}>{remaining}s</span>
}

export function SkeletonContent() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
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
// Scroll to a section id (opens any <details> ancestors, moves focus, briefly highlights it)
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
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  el.style.scrollMarginTop = "88px"
  const distance = Math.abs(el.getBoundingClientRect().top - 88)
  el.scrollIntoView({ behavior: reduced || distance > 1800 ? "auto" : "smooth", block: "start" })
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1")
  el.focus({ preventScroll: true })
  if (!el.style.borderRadius) el.style.borderRadius = "12px"
  el.style.transition = reduced ? "" : "box-shadow 300ms ease"
  el.style.boxShadow = `0 0 0 2px ${accent}`
  window.setTimeout(() => {
    el.style.boxShadow = ""
  }, 1800)
  return true
}

export const timeAgo = (ts: number, now = Date.now()) => {
  const m = Math.max(1, Math.floor((now - ts) / 60000))
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`
}

export const timeUntil = (ts: number, now = Date.now()) => {
  const m = Math.floor((ts - now) / 60000)
  if (m <= 0) return "now"
  return m < 60 ? `in ${m}m` : m < 1440 ? `in ${Math.floor(m / 60)}h ${m % 60}m` : `in ${Math.floor(m / 1440)}d`
}

// ---------------------------------------------------------------------------
// Session chip (F2.7). Clock-derived on the client until the engine emits
// features.session; never null.
// ---------------------------------------------------------------------------

export type SessionName = "asia" | "london" | "us" | "off"
export interface SessionState {
  name: SessionName
  weekend: boolean
  gate: "none" | "late_utc" | "nonc_weekend"
  label: string
}

export function sessionFor(now: number, crypto: boolean): SessionState {
  const d = new Date(now)
  const h = d.getUTCHours()
  const day = d.getUTCDay()
  const weekend = day === 0 || day === 6
  const name: SessionName = h >= 21 ? "off" : h >= 13 ? "us" : h >= 7 ? "london" : "asia"
  if (!crypto && weekend) return { name, weekend, gate: "nonc_weekend", label: "Market closed · WAIT" }
  if (crypto && weekend) return { name, weekend, gate: "none", label: "Weekend · thin liquidity" }
  if (crypto && name === "off") return { name, weekend, gate: "late_utc", label: "Late UTC · entries gated" }
  const word = name === "us" ? "US session" : name === "london" ? "London session" : name === "asia" ? "Asia session" : "Off hours"
  return { name, weekend, gate: "none", label: word }
}
