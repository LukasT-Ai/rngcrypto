"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { ArrowUpRight, Radar } from "lucide-react"
import { cn } from "@/lib/utils"

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
}
export type HotResp = { timestamp: number; hot: HotPlay[]; all: HotPlay[] }

const GREEN = "#00FF88"
const RED = "#FF3B5C"

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
  return <span className="font-mono text-xs text-white/35">refreshed {new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
}

// One card. Pass `href` to navigate (home page) or `onSelect` to switch the ticker in place (signals pages).
export function HotPlayCard({ p, href, onSelect, compact = false }: { p: HotPlay; href?: string; onSelect?: (symbol: string) => void; compact?: boolean }) {
  const long = p.bias === "LONG"
  const c = long ? GREEN : RED
  const cls = cn(
    "group relative block w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-white/[0.045]",
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
            <p className="text-xs text-white/40">{p.label}</p>
          </div>
        </div>
        <span className="rounded-md px-2 py-1 text-[11px] font-black tracking-wider" style={{ color: c, backgroundColor: `${c}1a` }}>{p.bias}</span>
      </div>
      <div className={cn("grid grid-cols-3 gap-3 text-xs", compact ? "mt-3" : "mt-5")}>
        <div>
          <p className="text-white/35">Price</p>
          <p className="mt-0.5 font-mono font-semibold text-white/90">${fmtHotPrice(p.price)}</p>
        </div>
        <div>
          <p className="text-white/35">24h</p>
          <p className="mt-0.5 font-mono font-semibold" style={{ color: p.change24h >= 0 ? GREEN : RED }}>{p.change24h >= 0 ? "+" : ""}{p.change24h.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-white/35">Conviction</p>
          <p className="mt-0.5 font-mono font-semibold text-white/90">{p.confidence} <span className="text-white/45">{p.grade}</span></p>
        </div>
      </div>
      <div className={cn("flex items-center justify-between text-[11px] text-white/35", compact ? "mt-3" : "mt-4")}>
        <span>R:R {p.riskReward.toFixed(1)} · {p.regime}</span>
        <span className="flex items-center gap-1 transition-colors group-hover:text-white/70">breakdown <ArrowUpRight className="size-3" /></span>
      </div>
    </>
  )
  if (href) return <Link href={href} className={cls}>{body}</Link>
  return <button type="button" onClick={() => onSelect?.(p.symbol)} className={cls}>{body}</button>
}

// Loading / error / empty states. Loading shows skeletons; the other two say so in words instead of spinning forever.
export function HotBoardState({ status, compact = false, count = 6 }: { status: "loading" | "error" | "empty"; compact?: boolean; count?: number }) {
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
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] text-sm text-white/55", compact ? "px-4 py-4" : "px-5 py-6")}>
      <Radar className={cn("size-4 shrink-0", error ? "text-[#F59E0B]" : "text-white/35")} />
      <div>
        <p className="font-semibold text-white/80">{error ? "Board unavailable" : "No active setups right now"}</p>
        <p className="text-xs text-white/40">
          {error ? "The scanner did not answer. It retries every minute." : "Nothing on the board clears the publish bar at the moment. The scanner re-checks every minute."}
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
