"use client"

import React, { useCallback, useEffect, useState } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { FOCUS_RING, GREEN, RED, timeAgo, useNow } from "../signals/shared"
import type { Asset, Direction, OpenPosition } from "./types"

export const EXPLORER = "https://app.hyperliquid.xyz/explorer"
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`
export const tradeUrl = (coin: string) => `https://app.hyperliquid.xyz/trade/${encodeURIComponent(coin)}`

export const ASSETS: Asset[] = ["BTC", "ADA", "ALL"]

// ---------------------------------------------------------------------------
// Formatting. Callers wrap in font-mono.
// ---------------------------------------------------------------------------

export const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

/** $1.23M style with a leading sign when `sign` is set. Null renders a dash. */
export function fmtUsd(n: number | null | undefined, opts: { sign?: boolean; dp?: number } = {}): string {
  if (n == null || !Number.isFinite(n)) return "—"
  const abs = Math.abs(n)
  const body = abs >= 1e9 ? `${(abs / 1e9).toFixed(2)}B` : abs >= 1e6 ? `${(abs / 1e6).toFixed(2)}M` : abs >= 1e4 ? `${(abs / 1e3).toFixed(1)}K` : abs.toLocaleString("en-US", { minimumFractionDigits: opts.dp ?? (abs >= 100 ? 0 : 2), maximumFractionDigits: opts.dp ?? (abs >= 100 ? 0 : 2) })
  const sign = n < 0 ? "-" : opts.sign && n > 0 ? "+" : ""
  return `${sign}$${body}`
}

export const fmtPct = (p: number | null | undefined, dp = 1) => (p == null || !Number.isFinite(p) ? "—" : `${p > 0 ? "+" : ""}${p.toFixed(dp)}%`)
export const fmtRate = (p: number | null | undefined) => (p == null || !Number.isFinite(p) ? "—" : `${p.toFixed(p >= 10 ? 0 : 1)}%`)

export const fmtPx = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return "—"
  const a = Math.abs(n)
  const dp = a >= 1000 ? 0 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

export const fmtSize = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return "—"
  const a = Math.abs(n)
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}K`
  return n.toLocaleString("en-US", { maximumFractionDigits: a >= 100 ? 0 : a >= 1 ? 3 : 4 })
}

export const fmtInt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US"))

export const utc = (ts: number | null | undefined) => (ts == null ? "—" : new Date(ts).toISOString().replace("T", " ").slice(0, 16) + " UTC")

/** Green/red by sign; zero and null stay neutral. */
export const signColor = (v: number | null | undefined) => (v == null || !Number.isFinite(v) || v === 0 ? undefined : v > 0 ? GREEN : RED)

/** Win rate tone: neutral under n=5, then green above 55, red below 45. */
export function winRateColor(rate: number | null | undefined, n: number): string | undefined {
  if (rate == null || n < 5) return undefined
  if (rate >= 55) return GREEN
  if (rate <= 45) return RED
  return undefined
}

export const dirWord = (d: Direction | null | undefined) => (d === "long" ? "Long" : d === "short" ? "Short" : d === "mixed" ? "Mixed" : "No bias")

export const sideColor = (s: "long" | "short" | "buy" | "sell") => (s === "long" || s === "buy" ? GREEN : RED)

export const posHealth = (p: OpenPosition): { pct: number | null; warn: boolean } => {
  if (p.liqPx == null || !(p.markPx > 0)) return { pct: null, warn: false }
  const pct = (Math.abs(p.markPx - p.liqPx) / p.markPx) * 100
  return { pct, warn: pct < 5 }
}

// ---------------------------------------------------------------------------
// "x ago" that renders a stable placeholder during SSR (useNow is 0 until the first client tick).
// ---------------------------------------------------------------------------

export function Ago({ ts, className }: { ts: number | null | undefined; className?: string }) {
  const now = useNow(15_000)
  if (ts == null) return <span className={cn("text-white/40", className)}>—</span>
  if (now === 0) return <span className={className}>…</span>
  return (
    <span className={className} title={utc(ts)}>
      {timeAgo(ts, now)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Copy-to-clipboard and external link, both keyboard reachable.
// ---------------------------------------------------------------------------

export function CopyButton({ text, label = "Copy address", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const id = window.setTimeout(() => setDone(false), 1500)
    return () => window.clearTimeout(id)
  }, [done])
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      navigator.clipboard?.writeText(text).then(() => setDone(true)).catch(() => undefined)
    },
    [text]
  )
  return (
    <button type="button" onClick={onClick} aria-label={done ? "Copied" : label} title={done ? "Copied" : label} className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md text-white/40 hover:text-white/85 hover:bg-white/[0.06]", FOCUS_RING, className)}>
      {done ? <Check className="size-3.5" style={{ color: GREEN }} /> : <Copy className="size-3.5" />}
      <span aria-live="polite" className="sr-only">{done ? "Copied to clipboard" : ""}</span>
    </button>
  )
}

export function ExtLink({ href, label, children, className, stop = true }: { href: string; label: string; children?: React.ReactNode; className?: string; stop?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} onClick={stop ? (e) => e.stopPropagation() : undefined} className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md text-white/40 hover:text-white/85 hover:bg-white/[0.06]", FOCUS_RING, className)}>
      {children ?? <ExternalLink className="size-3.5" />}
    </a>
  )
}

/** Name or shortened address, with copy + explorer actions. */
export function TraderName({ address, displayName, size = "sm" }: { address: string; displayName: string | null; size?: "sm" | "lg" }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="min-w-0 flex flex-col leading-tight">
        <span className={cn("truncate font-semibold text-white/90", size === "lg" ? "text-base" : "text-[13px]")}>{displayName ?? <span className="font-mono">{shortAddr(address)}</span>}</span>
        {displayName && <span className="font-mono text-[11px] text-white/45">{shortAddr(address)}</span>}
      </span>
      <CopyButton text={address} />
      <ExtLink href={addressUrl(address)} label="Open on Hyperliquid explorer" />
    </span>
  )
}
