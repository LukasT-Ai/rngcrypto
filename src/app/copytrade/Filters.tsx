"use client"

import React from "react"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { FOCUS_RING, LABEL } from "../signals/shared"
import { Segmented } from "../signals/performance/perf-shared"
import type { Asset, SortKey, Window } from "./types"

export const WINDOWS: { k: Window; l: string }[] = [
  { k: "day", l: "Day" },
  { k: "week", l: "Week" },
  { k: "month", l: "Month" },
  { k: "allTime", l: "All time" },
]
export const SORTS: { k: SortKey; l: string }[] = [
  { k: "assetPnl", l: "Asset PnL" },
  { k: "roi", l: "ROI" },
  { k: "winRate", l: "Win rate" },
  { k: "volume", l: "Volume" },
  { k: "equity", l: "Equity" },
]
export const VOL_PRESETS: { v: number; l: string }[] = [
  { v: 0, l: "Any" },
  { v: 100_000, l: "$100k" },
  { v: 1_000_000, l: "$1M" },
  { v: 10_000_000, l: "$10M" },
]

const INPUT = cn("h-7 rounded-md border border-white/10 bg-white/[0.03] px-2 text-[12px] text-white/90 placeholder:text-white/30", FOCUS_RING)

export interface FilterState {
  asset: Asset
  window: Window
  sort: SortKey
  minVolume: number
  search: string
}

export default function Filters({ value, onChange }: { value: FilterState; onChange: (patch: Partial<FilterState>) => void }) {
  const [volText, setVolText] = React.useState(value.minVolume ? String(value.minVolume) : "")
  React.useEffect(() => {
    setVolText(value.minVolume ? String(value.minVolume) : "")
  }, [value.minVolume])
  const commitVol = () => {
    const n = Number(volText.replace(/[^0-9.]/g, ""))
    onChange({ minVolume: Number.isFinite(n) && n > 0 ? Math.round(n) : 0 })
  }
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Asset</span>
        <Segmented label="Asset" value={value.asset} onChange={(asset) => onChange({ asset })} options={[{ k: "BTC", l: "BTC" }, { k: "ADA", l: "ADA" }, { k: "ALL", l: "All" }]} />
      </div>
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Window</span>
        <Segmented label="Window" value={value.window} onChange={(window) => onChange({ window })} options={WINDOWS} />
      </div>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Sort by</span>
        <select value={value.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })} className={cn(INPUT, "pr-6")}>
          {SORTS.map((s) => (
            <option key={s.k} value={s.k} className="bg-[#111827]">
              {s.l}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-1">
        <label htmlFor="ct-minvol" className={LABEL}>
          Min volume (USD)
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id="ct-minvol"
            inputMode="numeric"
            value={volText}
            onChange={(e) => setVolText(e.target.value)}
            onBlur={commitVol}
            onKeyDown={(e) => e.key === "Enter" && commitVol()}
            placeholder="0"
            className={cn(INPUT, "w-24 font-mono tabular-nums")}
          />
          <div role="group" aria-label="Volume presets" className="flex gap-1">
            {VOL_PRESETS.map((p) => (
              <button key={p.v} type="button" aria-pressed={value.minVolume === p.v} onClick={() => onChange({ minVolume: p.v })} className={cn("rounded-md border px-2 py-1 font-mono text-[11px] font-semibold transition-colors", FOCUS_RING, value.minVolume === p.v ? "border-transparent text-[#06080F]" : "border-white/10 text-[#9CA3AF] hover:text-white")} style={value.minVolume === p.v ? { backgroundColor: "var(--brand)" } : undefined}>
                {p.l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label className="flex min-w-0 basis-full flex-col gap-1 sm:basis-auto sm:flex-1 sm:max-w-xs">
        <span className={LABEL}>Search</span>
        <span className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2 size-3.5 text-white/40" aria-hidden />
          <input type="search" value={value.search} onChange={(e) => onChange({ search: e.target.value })} placeholder="Address or name" aria-label="Search by address or name" className={cn(INPUT, "w-full pl-7 pr-7 font-mono")} />
          {value.search && (
            <button type="button" onClick={() => onChange({ search: "" })} aria-label="Clear search" className={cn("absolute right-1 inline-flex size-5 items-center justify-center rounded text-white/40 hover:text-white", FOCUS_RING)}>
              <X className="size-3.5" />
            </button>
          )}
        </span>
      </label>
    </div>
  )
}
