"use client"

import React, { useCallback, useMemo, useState } from "react"
import { Info, Radar, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RNG_THEME, themeStyle } from "../signals/themes"
import { Chip, SURFACE, timeAgo, useNow } from "../signals/shared"
import { CARD } from "../signals/performance/perf-shared"
import type { SortKey, TraderRow } from "./types"
import Filters, { type FilterState } from "./Filters"
import TraderTable, { type ColKey, type SortDir, WINDOW_WORD } from "./TraderTable"
import TraderDrawer from "./TraderDrawer"
import { useLeaderboard, useMock } from "./useCopyTrade"
import { fmtInt, utc } from "./ct-shared"

const SERVER_SORTS = new Set<string>(["assetPnl", "roi", "winRate", "volume", "equity"])

function sortValue(r: TraderRow, k: ColKey): number {
  switch (k) {
    case "rank":
      return -r.rank
    case "equity":
      return r.equity
    case "pnl":
      return r.window.pnl
    case "roi":
      return r.window.roi
    case "assetPnl":
      return r.asset ? r.asset.realizedPnl : r.window.pnl
    case "winRate":
      return r.asset?.winRate ?? -1
    case "volume":
      return r.asset ? r.asset.volumeUsd : r.window.volume
    case "trades":
      return r.asset?.trades ?? -1
    case "lastTrade":
      return r.asset?.lastTradeAt ?? -1
  }
}

function ScanChip({ scan, asOf }: { scan: { candidates: number; scanned: number; lastFullScanAt: number | null; stale: boolean } | undefined; asOf: number | undefined }) {
  const now = useNow(15_000)
  if (!scan) return <Chip variant="neutral">scan: pending</Chip>
  const last = scan.lastFullScanAt ?? asOf ?? null
  const ago = last != null && now > 0 ? timeAgo(last, now) : "…"
  const tip = `${fmtInt(scan.scanned)} of ${fmtInt(scan.candidates)} leaderboard candidates scanned for BTC and ADA fills. Last full scan ${last != null ? utc(last) : "unknown"}.${scan.stale ? " The scanner has not completed a pass recently; numbers may lag." : ""}`
  return (
    <Chip variant={scan.stale ? "warning" : "neutral"} size="label" icon={scan.stale ? undefined : Radar} tip={tip} className="rounded-md">
      <span className="font-mono tabular-nums">
        {fmtInt(scan.scanned)}/{fmtInt(scan.candidates)}
      </span>
      <span className="opacity-80">scanned · {ago}</span>
      {scan.stale && <span>· stale</span>}
    </Chip>
  )
}

function Skeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading traders">
      <div className={cn(SURFACE, "hidden h-9 animate-pulse md:block")} />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={cn(SURFACE, "h-24 animate-pulse md:h-11")} />
      ))}
    </div>
  )
}

export default function CopyTradeDashboard() {
  const mock = useMock()
  const [filters, setFilters] = useState<FilterState>({ asset: "BTC", window: "month", sort: "assetPnl", minVolume: 0, search: "" })
  const [sortKey, setSortKey] = useState<ColKey>("assetPnl")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [selected, setSelected] = useState<TraderRow | null>(null)

  const patch = useCallback((p: Partial<FilterState>) => {
    setFilters((cur) => ({ ...cur, ...p }))
    if (p.sort) {
      setSortKey(p.sort)
      setSortDir("desc")
    }
  }, [])

  const onSort = useCallback((k: ColKey) => {
    setSortKey((cur) => {
      if (cur === k) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"))
        return cur
      }
      setSortDir(k === "rank" ? "asc" : "desc")
      return k
    })
    if (SERVER_SORTS.has(k)) setFilters((cur) => ({ ...cur, sort: k as SortKey }))
  }, [])

  const { data, isLoading, isError, isFetching, dataUpdatedAt } = useLeaderboard({ asset: filters.asset, window: filters.window, sort: filters.sort, minVolume: filters.minVolume }, mock)

  const rows = useMemo(() => {
    const all = data?.traders ?? []
    const q = filters.search.trim().toLowerCase()
    const filtered = q ? all.filter((r) => r.address.toLowerCase().includes(q) || (r.displayName ?? "").toLowerCase().includes(q)) : all
    const dir = sortDir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => (sortValue(a, sortKey) - sortValue(b, sortKey)) * dir || a.rank - b.rank)
  }, [data, filters.search, sortKey, sortDir])

  const onView = useCallback((r: TraderRow) => setSelected(r), [])
  const now = useNow(15_000)
  const listStale = data != null && !isFetching && now > 0 && now - dataUpdatedAt > 5 * 60_000

  return (
    <TooltipProvider>
      <div className="min-h-screen overflow-x-hidden pb-16 pt-24" style={themeStyle(RNG_THEME)}>
        <div className="mx-auto max-w-7xl space-y-4 px-3 sm:px-4 lg:px-8">
          <div className={cn(CARD, "flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between")} style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--brand) 10%, transparent) 0%, rgb(var(--surface-rgb) / 0.55) 60%)" }}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Users className="size-5" style={{ color: "var(--brand)" }} />
                <h1 className="font-display text-xl font-bold text-white sm:text-2xl">Copy Trade</h1>
                {mock && <Chip variant="warning">mock data</Chip>}
              </div>
              <p className="mt-1 text-[13px] leading-snug text-[#9CA3AF]">Top Hyperliquid traders ranked by what they actually made on BTC and ADA, with their live positions and latest fills.</p>
              <p className="mt-1 flex items-start gap-1.5 text-[11px] text-white/45">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                <span>Public on-chain data from the Hyperliquid API. Not financial advice. Leverage can liquidate a copied position before the original closes.</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ScanChip scan={data?.scan} asOf={data?.asOf} />
              {listStale && <Chip variant="warning">list stale</Chip>}
            </div>
          </div>

          <div className={cn(CARD, "px-4 py-3")}>
            <Filters value={filters} onChange={patch} />
          </div>

          {isError && !data && (
            <div className={cn(CARD, "px-4 py-3 text-sm text-[#FF3B5C]")} role="alert">
              Could not load the leaderboard. The scanner may still be warming up; this page retries every minute.
            </div>
          )}
          {isError && data && (
            <div className="rounded-xl border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-4 py-2 text-xs text-white/85" role="status">
              Latest refresh failed; showing the last good list from {now > 0 ? timeAgo(dataUpdatedAt, now) : "earlier"}.
            </div>
          )}
          {isLoading && !data && <Skeleton />}

          {data && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#9CA3AF]">
                <span>
                  <span className="font-mono text-white">{rows.length}</span> trader{rows.length === 1 ? "" : "s"}
                  {filters.search && <> matching &ldquo;{filters.search}&rdquo;</>}
                </span>
                <span>
                  window <span className="font-mono text-white">{WINDOW_WORD[filters.window]}</span>
                </span>
                {filters.asset !== "ALL" && <span>per-asset stats cover the last 30 days of fills</span>}
                <span className="ml-auto">as of {utc(data.asOf)}</span>
              </div>
              {rows.length === 0 ? (
                <div className={cn(CARD, "px-4 py-10 text-center text-sm text-[#9CA3AF]")}>No traders match. Lower the minimum volume, widen the window or clear the search.</div>
              ) : (
                <TraderTable rows={rows} asset={filters.asset} window={filters.window} sortKey={sortKey} sortDir={sortDir} onSort={onSort} onView={onView} />
              )}
            </>
          )}
        </div>
        <TraderDrawer row={selected} asset={filters.asset} mock={mock} onClose={() => setSelected(null)} />
      </div>
    </TooltipProvider>
  )
}
