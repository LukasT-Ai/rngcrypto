"use client"

import React from "react"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { GREEN, RED, AMBER, GRAY } from "../shared"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export { GREEN, RED, AMBER, GRAY }
// Chart identity colors (design spec 4.5 rule 5; validated with the dataviz palette script on #0A0E17).
export const INDIGO = "#6366F1"
export const WARM = "#D97706"
export const LINE = "#00C466"
export const SURFACE_HEX = "#0A0E17"
export const GRID = "rgba(255,255,255,0.06)"

export const CARD = "rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.55)] backdrop-blur-xl"
export const EYEBROW = "text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]"
export const LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-white/50"
export const TOOLTIP_STYLE = { background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, fontFamily: "var(--font-mono)" } as const

// ---------------------------------------------------------------------------
// Formatting (JetBrains Mono is applied by the callers with font-mono)
// ---------------------------------------------------------------------------
export const fmtR = (r: number | null | undefined, dp = 2) => (r == null ? "—" : `${r > 0 ? "+" : ""}${r.toFixed(dp)}R`)
export const fmtPct = (p: number | null | undefined) => (p == null ? "—" : `${p.toFixed(p >= 10 ? 0 : 1)}%`)
export const fmtPrice = (n: number) => (n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toFixed(6))
export const ago = (ts: number) => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60e3))
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`
}
export const dur = (min: number | null | undefined) => (min == null ? "—" : min < 60 ? `${Math.round(min)}m` : min < 1440 ? `${Math.floor(min / 60)}h ${Math.round(min % 60)}m` : `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`)
export const utc = (ts: number | null | undefined) => (ts == null ? "—" : new Date(ts).toISOString().replace("T", " ").slice(0, 16) + " UTC")
export const shortDate = (ts: number | string | null | undefined) => (ts == null ? "—" : new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }))
export const fmtBytes = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`)

// ---------------------------------------------------------------------------
// Wilson 95% interval and the n-based color rule (perf audit 6.4 / design F4.3)
// ---------------------------------------------------------------------------
export function wilson(wins: number, n: number): [number, number] | null {
  if (!(n > 0)) return null
  const z = 1.96
  const p = wins / n
  const d = 1 + (z * z) / n
  const c = (p + (z * z) / (2 * n)) / d
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  return [Math.max(0, (c - h) * 100), Math.min(100, (c + h) * 100)]
}

/** Interval for a rate given in percent, using server values when present. */
export function rateCi(rate: number | null | undefined, n: number, lo?: number | null, hi?: number | null): [number, number] | null {
  if (lo != null && hi != null) return [lo, hi]
  if (rate == null || !(n > 0)) return null
  return wilson(Math.round((rate / 100) * n), n)
}

/**
 * Color for a rate. No green/red below n = 30. Between 30 and 100 the interval must exclude the
 * base rate. Above 100 the point estimate vs the base rate decides.
 */
export function rateColor(rate: number | null | undefined, n: number, ci: [number, number] | null, base = 50): string | undefined {
  if (rate == null || n < 30) return undefined
  if (n <= 100) {
    if (!ci) return undefined
    if (ci[0] > base) return GREEN
    if (ci[1] < base) return RED
    return undefined
  }
  return rate > base ? GREEN : rate < base ? RED : undefined
}

/** Signed R-denominated values: colored only once n reaches 30. */
export function rColor(v: number | null | undefined, n: number): string | undefined {
  if (v == null || n < 30) return undefined
  return v > 0 ? GREEN : v < 0 ? RED : undefined
}

export const fmtCi = (ci: [number, number] | null) => (ci ? `[${Math.round(ci[0])}-${Math.round(ci[1])}]` : "")

/** `44% [30-59]` with the bracket at 11px white/60. */
export function Rate({ rate, n, lo, hi, base = 50, className, colorize = true }: { rate: number | null | undefined; n: number; lo?: number | null; hi?: number | null; base?: number; className?: string; colorize?: boolean }) {
  const ci = rateCi(rate, n, lo, hi)
  const color = colorize ? rateColor(rate, n, ci, base) : undefined
  return (
    <span className={cn("font-mono tabular-nums", className)} title={ci ? `Wilson 95% interval ${Math.round(ci[0])}% to ${Math.round(ci[1])}%, n=${n}` : undefined}>
      <span style={{ color: color ?? (rate == null ? GRAY : undefined) }}>{fmtPct(rate)}</span>
      {ci && <span className="ml-1 text-[11px] text-white/60">{fmtCi(ci)}</span>}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Hint tooltip and the "not yet available" dash
// ---------------------------------------------------------------------------
export function Hint({ text, children, className }: { text: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children ?? (
          <button type="button" aria-label="More information" className={cn("inline-flex items-center text-white/40 hover:text-white/70 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)] rounded", className)}>
            <Info className="size-3.5" />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}

export function NotYet({ what = "This number" }: { what?: string }) {
  return (
    <Hint text={`${what} is not yet available. It appears once the measurement update ships.`}>
      <span className="font-mono text-white/40 cursor-help" tabIndex={0} aria-label={`${what} not yet available`}>—</span>
    </Hint>
  )
}

// ---------------------------------------------------------------------------
// KPI tile (design 4.4): label 11px white/50, value 20px mono 700, sub 11px white/45
// ---------------------------------------------------------------------------
export function Kpi({ label, value, sub, color, icon: Icon, dim, hint, ghost }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string; icon?: React.ElementType; dim?: boolean; hint?: React.ReactNode; ghost?: React.ReactNode }) {
  return (
    <div className={cn(CARD, "px-3 py-2.5 md:px-4 md:py-3 min-w-0", dim && "opacity-60")}>
      <div className={cn("flex items-center gap-1.5 min-w-0", LABEL)}>
        {Icon && <Icon className="size-3.5 shrink-0 text-white/40" />}
        <span className="truncate">{label}</span>
        {hint && <Hint text={hint} />}
      </div>
      <div className="mt-1 flex items-baseline gap-2 min-w-0">
        <div className="font-mono text-xl font-bold tabular-nums leading-tight truncate" style={{ color: color ?? "rgba(255,255,255,0.9)" }}>{value}</div>
        {ghost && <div className="font-mono text-[11px] text-white/50 tabular-nums truncate">{ghost}</div>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-white/45 truncate">{sub}</div>}
    </div>
  )
}

export function CardTitle({ children, right, id }: { children: React.ReactNode; right?: React.ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
      <h2 id={id} className="text-[13px] font-semibold uppercase tracking-[0.06em] text-white/60">{children}</h2>
      {right}
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options, label, activeColor }: { value: T; onChange: (v: T) => void; options: { k: T; l: string; title?: string; disabled?: boolean }[]; label: string; activeColor?: (k: T) => string | undefined }) {
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden rounded-md border border-white/10">
      {options.map((o) => {
        const active = value === o.k
        return (
          <button
            key={o.k}
            type="button"
            aria-pressed={active}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.k)}
            className={cn("px-2.5 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--brand)] disabled:opacity-40 disabled:cursor-not-allowed", active ? "text-[#06080F]" : "text-[#9CA3AF] hover:text-white")}
            style={active ? { backgroundColor: activeColor?.(o.k) ?? "var(--brand)" } : undefined}
          >
            {o.l}
          </button>
        )
      })}
    </div>
  )
}
