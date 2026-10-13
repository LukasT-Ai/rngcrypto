"use client"

import React from "react"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { FOCUS_RING, LABEL, Tip } from "../signals/shared"
import { Segmented } from "../signals/performance/perf-shared"
import type { Asset, SortKey, Window } from "./types"

export type Lens = "copyable" | "all"

export const WINDOWS: { k: Window; l: string }[] = [
  { k: "day", l: "Day" },
  { k: "week", l: "Week" },
  { k: "month", l: "Month" },
  { k: "allTime", l: "All time" },
]
export const SORTS: { k: SortKey; l: string }[] = [
  { k: "copyability", l: "Copyability" },
  { k: "assetPnl", l: "Asset PnL" },
  { k: "roi", l: "ROI" },
  { k: "winRate", l: "Win rate" },
  { k: "volume", l: "Volume" },
  { k: "equity", l: "Equity" },
  { k: "focus", l: "Focus" },
  { k: "activity", l: "Activity" },
]
export const VOL_PRESETS: { v: number; l: string }[] = [
  { v: 0, l: "Any" },
  { v: 100_000, l: "$100k" },
  { v: 1_000_000, l: "$1M" },
  { v: 10_000_000, l: "$10M" },
]

const INPUT = cn("h-7 rounded-md border border-white/10 bg-white/[0.03] px-2 text-[12px] text-white/90 placeholder:text-white/30 disabled:opacity-40 disabled:cursor-not-allowed", FOCUS_RING)

export interface FilterState {
  lens: Lens
  asset: Asset
  window: Window
  sort: SortKey
  minVolume: number
  /** Minimum copyable share of 30d volume, percent. Only sent with the copyable lens. */
  minFocus: number
  /** Client-side thresholds (not in the API contract). 0 = off. */
  minTradesPerDay: number
  minWinRate: number
  search: string
}

export const DEFAULT_FILTERS: FilterState = { lens: "copyable", asset: "BTC", window: "month", sort: "copyability", minVolume: 0, minFocus: 70, minTradesPerDay: 0, minWinRate: 0, search: "" }

/** Numeric input that commits on blur or Enter so typing does not refetch on every key. */
function NumInput({ id, value, onCommit, placeholder, suffix, disabled, width = "w-16", hint }: { id: string; value: number; onCommit: (n: number) => void; placeholder?: string; suffix?: string; disabled?: boolean; width?: string; hint?: string }) {
  const [text, setText] = React.useState(value ? String(value) : "")
  React.useEffect(() => {
    setText(value ? String(value) : "")
  }, [value])
  const commit = () => {
    const n = Number(text.replace(/[^0-9.]/g, ""))
    onCommit(Number.isFinite(n) && n > 0 ? n : 0)
  }
  return (
    <span className="relative inline-flex items-center">
      <input id={id} inputMode="decimal" disabled={disabled} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} placeholder={placeholder ?? "0"} title={hint} className={cn(INPUT, width, "font-mono tabular-nums", suffix && "pr-6")} />
      {suffix && (
        <span aria-hidden className="pointer-events-none absolute right-2 font-mono text-[11px] text-white/40">
          {suffix}
        </span>
      )}
    </span>
  )
}

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: string }) {
  const l = htmlFor ? (
    <label htmlFor={htmlFor} className={cn(LABEL, hint && "cursor-help underline decoration-dotted decoration-white/25 underline-offset-2")}>
      {label}
    </label>
  ) : (
    <span className={cn(LABEL, hint && "cursor-help underline decoration-dotted decoration-white/25 underline-offset-2")}>{label}</span>
  )
  return (
    <div className="flex flex-col gap-1">
      {hint ? <Tip content={hint}>{l}</Tip> : l}
      {children}
    </div>
  )
}

export default function Filters({ value, onChange }: { value: FilterState; onChange: (patch: Partial<FilterState>) => void }) {
  const copyable = value.lens === "copyable"
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label="Lens" hint="Ascend can only mirror BTC, ADA, GOLD and WTI. The copyable lens keeps wallets whose 30d volume is mostly in those four.">
          <Segmented label="Lens" value={value.lens} onChange={(lens) => onChange({ lens })} options={[{ k: "copyable", l: "Ascend-copyable" }, { k: "all", l: "All wallets" }]} />
        </Field>
        <Field label="Asset">
          <Segmented label="Asset" value={value.asset} onChange={(asset) => onChange({ asset })} options={[{ k: "BTC", l: "BTC" }, { k: "ADA", l: "ADA" }, { k: "GOLD", l: "GOLD" }, { k: "WTI", l: "WTI" }, { k: "ALL", l: "All" }]} />
        </Field>
        <Field label="Window">
          <Segmented label="Window" value={value.window} onChange={(window) => onChange({ window })} options={WINDOWS} />
        </Field>
        <Field label="Sort by" htmlFor="ct-sort">
          <select id="ct-sort" value={value.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })} className={cn(INPUT, "pr-6")}>
            {SORTS.map((s) => (
              <option key={s.k} value={s.k} className="bg-[#111827]">
                {s.l}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label="Min focus" htmlFor="ct-minfocus" hint="Minimum share of 30d volume in the four copyable markets. Applies in the copyable lens.">
          <NumInput id="ct-minfocus" value={value.minFocus} onCommit={(minFocus) => onChange({ minFocus })} suffix="%" disabled={!copyable} placeholder="70" />
        </Field>
        <Field label="Min trades/day" htmlFor="ct-mintpd" hint="Drop wallets below this 30d trade rate. Off at 0.">
          <NumInput id="ct-mintpd" value={value.minTradesPerDay} onCommit={(minTradesPerDay) => onChange({ minTradesPerDay })} />
        </Field>
        <Field label="Min win rate" htmlFor="ct-minwr" hint="Drop wallets below this win rate in the selected asset. Off at 0.">
          <NumInput id="ct-minwr" value={value.minWinRate} onCommit={(minWinRate) => onChange({ minWinRate })} suffix="%" />
        </Field>
        <Field label="Min volume (USD)" htmlFor="ct-minvol">
          <div className="flex items-center gap-1.5">
            <NumInput id="ct-minvol" value={value.minVolume} onCommit={(minVolume) => onChange({ minVolume })} width="w-24" />
            <div role="group" aria-label="Volume presets" className="flex gap-1">
              {VOL_PRESETS.map((p) => (
                <button key={p.v} type="button" aria-pressed={value.minVolume === p.v} onClick={() => onChange({ minVolume: p.v })} className={cn("rounded-md border px-2 py-1 font-mono text-[11px] font-semibold transition-colors", FOCUS_RING, value.minVolume === p.v ? "border-transparent text-[#06080F]" : "border-white/10 text-[#9CA3AF] hover:text-white")} style={value.minVolume === p.v ? { backgroundColor: "var(--brand)" } : undefined}>
                  {p.l}
                </button>
              ))}
            </div>
          </div>
        </Field>
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
    </div>
  )
}
