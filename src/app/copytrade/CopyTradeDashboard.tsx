"use client"

import React, { useCallback, useMemo, useState } from "react"
import { Info, Radar, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RNG_THEME, themeStyle } from "../signals/themes"
import { Chip, SURFACE, timeAgo, useNow } from "../signals/shared"
import { CARD } from "../signals/performance/perf-shared"
import type { ScanStatus, SortKey, TraderRow } from "./types"
import { ASSET_GROUPS } from "./types"
import Filters, { DEFAULT_FILTERS, type FilterState } from "./Filters"
import TraderTable, { type ColKey, type SortDir, WINDOW_WORD } from "./TraderTable"
import TraderDrawer from "./TraderDrawer"
import TopStrip from "./TopStrip"
import { useLeaderboard, useMock, useSummary } from "./useCopyTrade"
import { CopyToast, MixLegend, fmtInt, utc } from "./ct-shared"

const SERVER_SORTS = new Set<string>(["copyability", "assetPnl", "roi", "winRate", "volume", "equity", "focus", "activity"])

function sortValue(r: TraderRow, k: ColKey): number {
  switch (k) {
    case "rank":
      return -r.rank
    case "copyability":
      return r.score?.copyability ?? -1
    case "equity":
      return r.equity
    case "pnl":
      return r.window.pnl
    case "roi":
      return r.window.roi
    case "assetPnl":
      return r.asset ? r.asset.realizedPnl : (r.stats30d?.pnlCopyable ?? r.window.pnl)
    case "winRate":
      return r.asset?.winRate ?? -1
    case "volume":
      return r.asset ? r.asset.volumeUsd : r.window.volume
    case "focus":
      return r.score?.focus ?? r.mix?.copyableSharePct ?? -1
    case "activity":
      return r.score?.activity ?? r.stats30d?.tradesPerDay ?? -1
    case "trades":
      return r.asset?.trades ?? -1
    case "tradesPerDay":
      return r.stats30d?.tradesPerDay ?? -1
    case "maxDd":
      // Ascending "desc" means deepest first; null sorts last either way.
      return r.stats30d?.maxDrawdownPct ?? -1
    case "lastTrade":
      return r.asset?.lastTradeAt ?? -1
  }
}

const scanDetail = (scan: ScanStatus) => {
  const per = scan.perAsset ? ASSET_GROUPS.filter((g) => scan.perAsset?.[g] != null).map((g) => `${fmtInt(scan.perAsset?.[g])} ${g}`).join(", ") : ""
  const pool = scan.pool ? `Discovery pool ${fmtInt(scan.pool.probed)} of ${fmtInt(scan.pool.size)} probed, ${fmtInt(scan.pool.discovered)} kept.` : ""
  return [per ? `Wallets active per group: ${per}.` : "", pool].filter(Boolean).join(" ")
}

function ScanChip({ scan, asOf }: { scan: ScanStatus | undefined; asOf: number | undefined }) {
  const now = useNow(15_000)
  if (!scan) return <Chip variant="neutral">scan: pending</Chip>
  const last = scan.lastFullScanAt ?? asOf ?? null
  const ago = last != null && now > 0 ? timeAgo(last, now) : "…"
  const tip = `${fmtInt(scan.scanned)} of ${fmtInt(scan.candidates)} candidate wallets scanned for BTC, ADA, GOLD and WTI fills. ${scanDetail(scan)} Last full scan ${last != null ? utc(last) : "unknown"}.${scan.stale ? " The scanner has not completed a pass recently; numbers may lag." : ""}`
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
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [sortKey, setSortKey] = useState<ColKey>(DEFAULT_FILTERS.sort)
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

  const { data, isLoading, isError, isFetching, dataUpdatedAt } = useLeaderboard({ asset: filters.asset, window: filters.window, sort: filters.sort, minVolume: filters.minVolume, copyableOnly: filters.lens === "copyable", minFocus: filters.minFocus, openOnly: filters.openOnly }, mock)
  const summary = useSummary(mock)

  const rows = useMemo(() => {
    const all = data?.traders ?? []
    const q = filters.search.trim().toLowerCase()
    const filtered = all.filter((r) => {
      if (q && !(r.address.toLowerCase().includes(q) || (r.displayName ?? "").toLowerCase().includes(q))) return false
      if (filters.minTradesPerDay > 0 && (r.stats30d?.tradesPerDay ?? 0) < filters.minTradesPerDay) return false
      if (filters.minWinRate > 0 && (r.asset?.winRate ?? 0) < filters.minWinRate) return false
      return true
    })
    const dir = sortDir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => (sortValue(a, sortKey) - sortValue(b, sortKey)) * dir || a.rank - b.rank)
  }, [data, filters.search, filters.minTradesPerDay, filters.minWinRate, sortKey, sortDir])

  const onView = useCallback((r: TraderRow) => setSelected(r), [])
  const now = useNow(15_000)
  const listStale = data != null && !isFetching && now > 0 && now - dataUpdatedAt > 5 * 60_000
  const hidden = (data?.traders.length ?? 0) - rows.length

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
              <p className="mt-1 text-[13px] leading-snug text-[#9CA3AF]">Hyperliquid wallets worth mirroring through Ascend: successful, active, and trading mostly BTC, ADA, GOLD and WTI, with live positions and latest fills.</p>
              <p className="mt-1 flex items-start gap-1.5 text-[11px] text-white/45">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                <span>Public on-chain data from the Hyperliquid API. Not financial advice. Leverage can liquidate a copied position before the original closes.</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ScanChip scan={data?.scan ?? summary.data?.scan} asOf={data?.asOf ?? summary.data?.asOf} />
              {listStale && <Chip variant="warning">list stale</Chip>}
            </div>
          </div>

          <TopStrip data={summary.data} loading={summary.isLoading} error={summary.isError} onView={onView} />

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
                  <span className="font-mono text-white">{rows.length}</span> wallet{rows.length === 1 ? "" : "s"}
                  {hidden > 0 && <span className="text-white/45"> · {hidden} hidden by thresholds</span>}
                  {filters.search && <> matching &ldquo;{filters.search}&rdquo;</>}
                </span>
                <span>
                  {filters.lens === "copyable" ? (
                    <>
                      copyable share ≥ <span className="font-mono text-white">{filters.minFocus}%</span>
                    </>
                  ) : (
                    "all wallets"
                  )}
                </span>
                <span>
                  window <span className="font-mono text-white">{WINDOW_WORD[filters.window]}</span>
                </span>
                <span className="hidden sm:inline">per-asset stats and mix cover the last 30 days of fills</span>
                <MixLegend className="ml-auto" />
                <span className="w-full text-right sm:w-auto">as of {utc(data.asOf)}</span>
              </div>
              {rows.length === 0 ? (
                <div className={cn(CARD, "px-4 py-10 text-center text-sm text-[#9CA3AF]")}>
                  {data.traders.length === 0 && data.scan.stale ? `The scanner is warming up after a restart: ${fmtInt(data.scan.scanned)} of ${fmtInt(data.scan.candidates)} wallets scanned so far. ${scanDetail(data.scan)} Wallets appear progressively over the next 15 to 40 minutes; this page refreshes every minute.` : "No traders match. Lower the minimum focus or volume, switch to all wallets, widen the window or clear the search."}
                </div>
              ) : (
                <TraderTable rows={rows} asset={filters.asset} window={filters.window} sortKey={sortKey} sortDir={sortDir} onSort={onSort} onView={onView} />
              )}
            </>
          )}
        </div>
        <TraderDrawer row={selected} asset={filters.asset} mock={mock} onClose={() => setSelected(null)} />
        <CopyToast />
      </div>
    </TooltipProvider>
  )
}
