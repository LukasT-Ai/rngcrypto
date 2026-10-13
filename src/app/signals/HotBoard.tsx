"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { ArrowUpRight, Radar } from "lucide-react"
import { cn } from "@/lib/utils"
import { FOCUS_RING } from "./shared"

// Shared "On the board right now" cards. Used on the home page and at the top of every signals page.
// Data comes from /api/signals/hot which scans every engine ticker and keeps the published non-WAIT calls.

export interface HotPlay {
  symbol: string
  label: string
  color: string
  price: number
  change24h: number
  bias: "LONG" | "SHORT" | "WAIT"
  confidence: number
  grade: string
  riskReward: number
  regime: string
  regimeLabel?: string | null
  regimeScore?: number | null
  trendStrength?: "none" | "weak" | "emerging" | "strong" | "extreme" | null
  cloud1d?: "above" | "inside" | "below" | null
  ma200Side1d?: "above" | "below" | "at" | null
  adx15m?: number | null
}
export type HotResp = { timestamp: number; hot: HotPlay[]; all: HotPlay[] }

const GREEN = "#00FF88"
const RED = "#FF3B5C"
const GRAY = "#9CA3AF"

// Cloud / 200MA / ADX micro-chips for the card footer. Direction = colour, strength = opacity.
function RegimeGlyphs({ p }: { p: HotPlay }) {
  if (p.cloud1d == null && p.ma200Side1d == null && p.adx15m == null) return null
  const weak = p.trendStrength == null || p.trendStrength === "none" || p.trendStrength === "weak"
  const title = [p.regimeLabel, p.trendStrength ? `ADX ${p.trendStrength}` : null].filter(Boolean).join(" · ") || undefined
  const chip = "inline-flex items-center rounded px-1 py-px font-mono text-[10px] font-bold"
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      {p.cloud1d != null && (
        <span className={cn(chip, weak && "opacity-50")} style={{ color: p.cloud1d === "above" ? GREEN : p.cloud1d === "below" ? RED : GRAY, backgroundColor: "rgba(255,255,255,0.05)" }}>
          ☁ {p.cloud1d === "above" ? "↑" : p.cloud1d === "below" ? "↓" : "–"}
        </span>
      )}
      {p.ma200Side1d != null && (
        <span className={cn(chip, weak && "opacity-50")} style={{ color: p.ma200Side1d === "above" ? GREEN : p.ma200Side1d === "below" ? RED : GRAY, backgroundColor: "rgba(255,255,255,0.05)" }}>
          200 {p.ma200Side1d === "above" ? "↑" : p.ma200Side1d === "below" ? "↓" : "="}
        </span>
      )}
      {p.adx15m != null && (
        <span className={chip} style={{ color: p.adx15m < 20 ? GRAY : "rgba(255,255,255,0.75)", backgroundColor: "rgba(255,255,255,0.05)" }}>
          ADX {Math.round(p.adx15m)}
        </span>
      )}
    </span>
  )
}

export function useHotPlays() {
  return useQuery<HotResp>({
    queryKey: ["signals-hot"],
    queryFn: async () => {
      const r = await fetch("/api/signals/hot")
      if (!r.ok) throw new Error(`hot ${r.status}`)
      return r.json()
    },
    refetchInterval: 60_000,
    staleTime: 55_000,
    retry: 1,
  })
}

export const fmtHotPrice = (n: number) =>
  n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toFixed(6)

export function HotStamp({ ts }: { ts?: number }) {
  if (!ts) return null
  return <span className="font-mono text-xs text-white/50">refreshed {new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
}

// One card. Pass `href` to navigate (home page) or `onSelect` to switch the ticker in place (signals pages).
export function HotPlayCard({ p, href, onSelect, compact = false }: { p: HotPlay; href?: string; onSelect?: (symbol: string) => void; compact?: boolean }) {
  const long = p.bias === "LONG"
  const c = long ? GREEN : RED
  const cls = cn(
    "group relative block w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-white/[0.045]",
    FOCUS_RING,
    compact ? "p-4" : "p-5"
  )
  const body = (
    <>
      <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" style={{ backgroundColor: `${c}33` }} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("flex items-center justify-center rounded-xl font-mono font-black text-[#06080F]", compact ? "size-8 text-xs" : "size-10 text-sm")} style={{ backgroundColor: p.color || "#fff" }}>{p.symbol.slice(0, 3)}</span>
          <div>
            <p className={cn("font-mono font-bold text-white", compact ? "text-sm" : "text-base")}>{p.symbol}</p>
            <p className="text-xs text-white/50">{p.label}</p>
          </div>
        </div>
        <span className="rounded-md px-2 py-1 text-[11px] font-black tracking-wider" style={{ color: c, backgroundColor: `${c}1a` }}>{p.bias}</span>
      </div>
      <div className={cn("grid grid-cols-3 gap-3 text-xs", compact ? "mt-3" : "mt-5")}>
        <div>
          <p className="text-white/50">Price</p>
          <p className="mt-0.5 font-mono font-semibold text-white/90">${fmtHotPrice(p.price)}</p>
        </div>
        <div>
          <p className="text-white/50">24h</p>
          <p className="mt-0.5 font-mono font-semibold" style={{ color: p.change24h >= 0 ? GREEN : RED }}>{p.change24h >= 0 ? "+" : ""}{p.change24h.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-white/50">Conviction</p>
          <p className="mt-0.5 font-mono font-semibold text-white/90">{p.confidence} <span className="text-white/50">{p.grade}</span></p>
        </div>
      </div>
      <div className={cn("flex items-center justify-between text-[11px] text-white/50", compact ? "mt-3" : "mt-4")}>
        <span className="flex min-w-0 items-center gap-1.5">
          <RegimeGlyphs p={p} />
          <span className="truncate"><span className="font-mono tabular-nums">R:R {p.riskReward.toFixed(1)}</span> · {p.regime}</span>
        </span>
        <span className="flex items-center gap-1 transition-colors group-hover:text-white/70">breakdown <ArrowUpRight className="size-3" /></span>
      </div>
    </>
  )
  if (href) return <Link href={href} className={cls}>{body}</Link>
  return <button type="button" onClick={() => onSelect?.(p.symbol)} className={cls}>{body}</button>
}

// Loading / error / empty states. Loading shows skeletons; the other two say so in words instead of spinning forever.
export function HotBoardState({ status, compact = false, count = 6 }: { status: "loading" | "slow" | "error" | "empty"; compact?: boolean; count?: number }) {
  if (status === "loading") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={cn("skeleton rounded-2xl", compact ? "h-28" : "h-36")} />
        ))}
      </div>
    )
  }
  const error = status === "error"
  const slow = status === "slow"
  return (
    <div role="status" className={cn("flex items-center gap-3 rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] text-sm text-white/60", compact ? "px-4 py-4" : "px-5 py-6")}>
      <Radar className={cn("size-4 shrink-0", error ? "text-[#F59E0B]" : "text-white/50")} />
      <div>
        <p className="font-semibold text-white/80">{error ? "Board unavailable" : slow ? "Still scanning" : "No active setups right now"}</p>
        <p className="text-xs text-white/50">
          {error ? "The scanner did not answer. It retries every minute." : slow ? "The board scan is taking longer than usual. Cards appear as soon as it answers." : "Nothing on the board clears the publish bar at the moment. The scanner re-checks every minute."}
        </p>
      </div>
    </div>
  )
}

export function hotStatus(q: { isLoading: boolean; isError: boolean }, plays: HotPlay[]): "loading" | "error" | "empty" | "ready" {
  if (q.isLoading) return "loading"
  if (q.isError) return "error"
  return plays.length === 0 ? "empty" : "ready"
}
