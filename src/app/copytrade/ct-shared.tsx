"use client"

import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { Chip, FOCUS_RING, GREEN, RED, Tip, timeAgo, useNow } from "../signals/shared"
import type { Asset, AssetGroup, Direction, Grade, Mix, OpenPosition, Score } from "./types"
import { ASSET_GROUPS } from "./types"

export const EXPLORER = "https://app.hyperliquid.xyz/explorer"
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`
export const tradeUrl = (coin: string) => `https://app.hyperliquid.xyz/trade/${encodeURIComponent(coin)}`

export const ASSETS: Asset[] = ["BTC", "ADA", "GOLD", "WTI", "ALL"]

/** Hyperliquid markets inside each Ascend-copyable group (CONTRACT.md amendment 1). */
export const GROUP_COINS: Record<AssetGroup, string[]> = {
  BTC: ["BTC"],
  ADA: ["ADA"],
  GOLD: ["xyz:GOLD", "km:GOLD", "PAXG"],
  WTI: ["xyz:CL", "km:USOIL", "xyz:BRENTOIL"],
}
export const groupOf = (coin: string): AssetGroup | "OTHER" => {
  for (const g of ASSET_GROUPS) if (GROUP_COINS[g].includes(coin)) return g
  return "OTHER"
}

// Mix-bar identities. Validated with the dataviz palette script on #0A0E17 in this fixed segment order
// (adjacent pairs pass CVD and normal-vision separation); OTHER is the de-emphasis grey. Never used for direction.
export const MIX_COLORS: Record<AssetGroup | "OTHER", string> = {
  BTC: "#6366F1",
  ADA: "#0D9488",
  GOLD: "#D97706",
  WTI: "#A855F7",
  OTHER: "rgba(255,255,255,0.22)",
}

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
export const fmtNum = (n: number | null | undefined, dp = 1) => (n == null || !Number.isFinite(n) ? "—" : n.toFixed(dp))

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
// Toast. One module-level store so any copy button on the page can announce; the dashboard renders <CopyToast/>.
// ---------------------------------------------------------------------------

const toast = { msg: "" as string, at: 0, listeners: new Set<() => void>(), timer: null as ReturnType<typeof setTimeout> | null }
export function notify(msg: string) {
  toast.msg = msg
  toast.at = Date.now()
  toast.listeners.forEach((l) => l())
  if (toast.timer) clearTimeout(toast.timer)
  toast.timer = setTimeout(() => {
    toast.msg = ""
    toast.listeners.forEach((l) => l())
  }, 2000)
}
const subToast = (cb: () => void) => {
  toast.listeners.add(cb)
  return () => {
    toast.listeners.delete(cb)
  }
}
export function CopyToast() {
  const msg = useSyncExternalStore(subToast, () => toast.msg, () => "")
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      {msg && (
        <span className="rise-in inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#111827] px-3 py-1.5 text-[12px] font-medium text-white/90 shadow-lg">
          <Check className="size-3.5" style={{ color: GREEN }} aria-hidden />
          {msg}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Copy-to-clipboard and external link, both keyboard reachable. Without the clipboard API (http, old webviews)
// the button swaps to a selectable input so the user can copy by hand.
// ---------------------------------------------------------------------------

export function CopyButton({ text, label = "Copy address", toastText = "Address copied", className, size = "sm" }: { text: string; label?: string; toastText?: string; className?: string; size?: "sm" | "md" }) {
  const [done, setDone] = useState(false)
  const [fallback, setFallback] = useState(false)
  useEffect(() => {
    if (!done) return
    const id = window.setTimeout(() => setDone(false), 2000)
    return () => window.clearTimeout(id)
  }, [done])
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined
      if (!clip?.writeText) {
        setFallback(true)
        return
      }
      clip
        .writeText(text)
        .then(() => {
          setDone(true)
          notify(toastText)
        })
        .catch(() => setFallback(true))
    },
    [text, toastText]
  )
  if (fallback) {
    return (
      <input
        readOnly
        autoFocus
        value={text}
        aria-label={`${label}: select and copy`}
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => {
          e.stopPropagation()
          e.currentTarget.select()
        }}
        onBlur={() => setFallback(false)}
        onKeyDown={(e) => e.key === "Escape" && setFallback(false)}
        className={cn("h-6 w-36 rounded-md border border-white/15 bg-black/40 px-1.5 font-mono text-[11px] text-white/90", FOCUS_RING, className)}
      />
    )
  }
  return (
    <button type="button" onClick={onClick} aria-label={done ? "Copied" : label} title={done ? "Copied" : label} className={cn("inline-flex shrink-0 items-center justify-center rounded-md text-white/40 hover:bg-white/[0.06] hover:text-white/85", size === "md" ? "size-7" : "size-6", FOCUS_RING, className)}>
      {done ? <Check className={size === "md" ? "size-4" : "size-3.5"} style={{ color: GREEN }} /> : <Copy className={size === "md" ? "size-4" : "size-3.5"} />}
    </button>
  )
}

/** Labelled "COPY ADDRESS" button for the quick strip; same behaviour as CopyButton. */
export function CopyAddressButton({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = useState(false)
  const [fallback, setFallback] = useState(false)
  useEffect(() => {
    if (!done) return
    const id = window.setTimeout(() => setDone(false), 2000)
    return () => window.clearTimeout(id)
  }, [done])
  if (fallback) {
    return (
      <input
        readOnly
        autoFocus
        value={text}
        aria-label="Address: select and copy"
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => {
          e.stopPropagation()
          e.currentTarget.select()
        }}
        onBlur={() => setFallback(false)}
        onKeyDown={(e) => e.key === "Escape" && setFallback(false)}
        className={cn("h-6 w-32 rounded-md border border-white/15 bg-black/40 px-1.5 font-mono text-[11px] text-white/90", FOCUS_RING, className)}
      />
    )
  }
  return (
    <button
      type="button"
      aria-label={done ? "Address copied" : `Copy address ${text}`}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined
        if (!clip?.writeText) return setFallback(true)
        clip
          .writeText(text)
          .then(() => {
            setDone(true)
            notify("Address copied")
          })
          .catch(() => setFallback(true))
      }}
      className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors", FOCUS_RING, done ? "border-transparent text-[#06080F]" : "border-white/15 text-white/75 hover:border-white/30 hover:text-white", className)}
      style={done ? { backgroundColor: "var(--brand, #00FF88)" } : undefined}
    >
      {done ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
      {done ? "Copied" : "Copy address"}
    </button>
  )
}

export function ExtLink({ href, label, children, className, stop = true }: { href: string; label: string; children?: React.ReactNode; className?: string; stop?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} onClick={stop ? (e) => e.stopPropagation() : undefined} className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md text-white/40 hover:bg-white/[0.06] hover:text-white/85", FOCUS_RING, className)}>
      {children ?? <ExternalLink className="size-3.5" />}
    </a>
  )
}

/** Name or shortened address, with a copy action. All detail stays inside the dashboard (no outbound links). */
export function TraderName({ address, displayName, size = "sm" }: { address: string; displayName: string | null; size?: "sm" | "lg" }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={cn("truncate font-semibold text-white/90", size === "lg" ? "text-base" : "text-[13px]")}>{displayName ?? <span className="font-mono">{shortAddr(address)}</span>}</span>
        {displayName && <span className="font-mono text-[11px] text-white/45">{shortAddr(address)}</span>}
      </span>
      <CopyButton text={address} />
    </span>
  )
}

// ---------------------------------------------------------------------------
// Asset-mix bar: four identity segments in fixed order plus grey OTHER, 2px surface gaps, copyable share as a number.
// The tooltip lists every share with its label so identity is never color-alone.
// ---------------------------------------------------------------------------

export function MixBar({ mix, width = 88, showNumber = true, className }: { mix: Mix | null | undefined; width?: number; showNumber?: boolean; className?: string }) {
  if (!mix) return <span className={cn("font-mono text-xs text-white/40", className)}>—</span>
  const keys: (AssetGroup | "OTHER")[] = [...ASSET_GROUPS, "OTHER"]
  const parts = keys.map((k) => ({ k, pct: Math.max(0, mix.byAsset?.[k]?.sharePct ?? 0) })).filter((p) => p.pct > 0)
  const tip = (
    <div className="space-y-0.5 font-mono text-[11px] tabular-nums">
      {keys.map((k) => (
        <div key={k} className="flex items-center gap-2">
          <span aria-hidden className="inline-block size-2 rounded-sm" style={{ backgroundColor: MIX_COLORS[k] }} />
          <span className="w-12 font-sans text-white/70">{k}</span>
          <span className="w-12 text-right text-white/90">{fmtRate(mix.byAsset?.[k]?.sharePct ?? 0)}</span>
          <span className="text-white/50">{fmtUsd(mix.byAsset?.[k]?.volumeUsd ?? 0)}</span>
        </div>
      ))}
      <div className="pt-1 font-sans text-white/60">Share of 30d volume · copyable {fmtRate(mix.copyableSharePct)} (trades {fmtRate(mix.copyableTradeSharePct)})</div>
    </div>
  )
  const label = `Asset mix: ${keys.map((k) => `${k} ${fmtRate(mix.byAsset?.[k]?.sharePct ?? 0)}`).join(", ")}`
  return (
    <Tip content={tip} className={className}>
      <span className="inline-flex items-center gap-2" role="img" aria-label={label}>
        <span className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]" style={{ width, gap: 2 }}>
          {parts.map((p) => (
            <span key={p.k} className="h-full shrink-0 rounded-sm" style={{ width: `calc(${p.pct}% - ${parts.length > 1 ? 2 : 0}px)`, minWidth: 2, backgroundColor: MIX_COLORS[p.k] }} />
          ))}
        </span>
        {showNumber && <span className="font-mono text-xs tabular-nums text-white/85">{fmtRate(mix.copyableSharePct)}</span>}
      </span>
    </Tip>
  )
}

export function MixLegend({ className }: { className?: string }) {
  const keys: (AssetGroup | "OTHER")[] = [...ASSET_GROUPS, "OTHER"]
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-white/50", className)}>
      {keys.map((k) => (
        <span key={k} className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block size-2 rounded-sm" style={{ backgroundColor: MIX_COLORS[k] }} />
          {k}
        </span>
      ))}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Score chip: neutral grade chip with the copyability number inside; the tooltip lists the reasons.
// Grade is not colored (design 4.3); A gets the brand border as a highlight.
// ---------------------------------------------------------------------------

export const GRADE_WORD: Record<Grade, string> = { A: "strong copy candidate", B: "decent", C: "marginal", D: "avoid" }

export function ScoreChip({ score, className }: { score: Score | null | undefined; className?: string }) {
  if (!score) {
    return (
      <Chip variant="grade" className={cn("rounded-md", className)} tip="Score not yet computed for this wallet.">
        —
      </Chip>
    )
  }
  const tip = (
    <div className="max-w-[260px] space-y-1">
      <div className="text-[11px] font-semibold text-white/90">
        Grade {score.grade} · copyability {score.copyability}/100 · {GRADE_WORD[score.grade]}
        {score.thin && <span className="text-white/60"> · thin sample</span>}
      </div>
      <div className="font-mono text-[11px] tabular-nums text-white/70">
        success {fmtNum(score.success, 0)} · activity {fmtNum(score.activity, 0)} · focus {fmtNum(score.focus, 0)} · consistency {fmtNum(score.consistency, 0)} · risk {fmtNum(score.risk, 0)}
      </div>
      {score.thin && <div className="text-[11px] text-white/60">Thin data: missing sub-scores were substituted; read the grade as provisional.</div>}
      {score.reasons?.length > 0 && (
        <ul className="list-disc pl-4 text-[11px] text-white/80">
          {score.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  )
  return (
    <Chip variant="grade" className={cn("rounded-md", score.thin && "bg-transparent! shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]", className)} tip={tip} value={score.grade}>
      <span style={score.grade === "A" && !score.thin ? { boxShadow: "inset 0 0 0 1px var(--brand, #00FF88)", borderRadius: 4, padding: "0 3px", margin: "0 -3px" } : undefined}>{score.grade}</span>
      <span className="font-mono tabular-nums opacity-80">{score.copyability}</span>
    </Chip>
  )
}

export const SUBSCORES: { k: keyof Omit<Score, "grade" | "reasons" | "copyability" | "thin">; l: string; hint: string }[] = [
  { k: "success", l: "Success", hint: "Rank-scaled 30d realized PnL in copyable markets, blended with win rate and ROI." },
  { k: "activity", l: "Activity", hint: "Trades per day and recency of the last fill." },
  { k: "focus", l: "Focus", hint: "Share of 30d volume in BTC, ADA, GOLD and WTI. Below 50% it hard-caps the copyability score." },
  { k: "consistency", l: "Consistency", hint: "Share of profitable weeks in the PnL history." },
  { k: "risk", l: "Risk", hint: "Higher is safer: max drawdown and median leverage, inverted." },
]
