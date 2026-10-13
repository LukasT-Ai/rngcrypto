"use client"

import React, { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { FOCUS_RING, Toggle } from "../shared"

// Calendar filters (design P1 3.3 + F3.2): four segmented controls and one toggle, persisted in localStorage.
// Every control is a button with aria-pressed inside a labelled group, so the row is keyboard operable as is.

export type ImpactFilter = "all" | "high" | "critical"
export type RelevanceFilter = "lens" | "all"
export type StatusFilter = "upcoming" | "released" | "both"
export type RegionFilter = "us" | "all"

export interface CalendarFilterState {
  impact: ImpactFilter
  relevance: RelevanceFilter
  status: StatusFilter
  region: RegionFilter
  marketOnly: boolean
}

export const DEFAULT_FILTERS: CalendarFilterState = { impact: "high", relevance: "lens", status: "both", region: "all", marketOnly: false }

const STORAGE_KEY = "rng.calendar.filters"

function sanitize(v: unknown): CalendarFilterState | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  const impact = o.impact === "all" || o.impact === "high" || o.impact === "critical" ? o.impact : DEFAULT_FILTERS.impact
  const relevance = o.relevance === "lens" || o.relevance === "all" ? o.relevance : DEFAULT_FILTERS.relevance
  const status = o.status === "upcoming" || o.status === "released" || o.status === "both" ? o.status : DEFAULT_FILTERS.status
  const region = o.region === "us" || o.region === "all" ? o.region : DEFAULT_FILTERS.region
  const marketOnly = typeof o.marketOnly === "boolean" ? o.marketOnly : DEFAULT_FILTERS.marketOnly
  return { impact, relevance, status, region, marketOnly }
}

function readStored(): CalendarFilterState {
  if (typeof window === "undefined") return DEFAULT_FILTERS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return (raw ? sanitize(JSON.parse(raw)) : null) ?? DEFAULT_FILTERS
  } catch {
    return DEFAULT_FILTERS
  }
}

// Read once on mount. The filter row is never server-rendered (the calendar shows a skeleton until the macro query
// answers), so reading storage in the initializer cannot cause a hydration mismatch.
export function useCalendarFilters(): [CalendarFilterState, (patch: Partial<CalendarFilterState>) => void, () => void] {
  const [state, setState] = useState<CalendarFilterState>(readStored)
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* ignore quota or private mode */
    }
  }, [state])
  const patch = (p: Partial<CalendarFilterState>) => setState((s) => ({ ...s, ...p }))
  const reset = () => setState(DEFAULT_FILTERS)
  return [state, patch, reset]
}

export interface FilterCounts {
  impact: Record<ImpactFilter, number>
  relevance: Record<RelevanceFilter, number>
  status: Record<StatusFilter, number>
  region: Record<RegionFilter, number>
  market: number
}

function Segment<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { key: T; text: string; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-0.5 rounded-md border border-white/[0.06] p-0.5">
      <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">{label}</span>
      {options.map((o) => (
        <Toggle key={o.key} pressed={value === o.key} onClick={() => onChange(o.key)} className="h-5 py-0">
          {o.text}
          {o.count != null && <span className="ml-0.5 font-mono text-[10px] tabular-nums opacity-70">({o.count})</span>}
        </Toggle>
      ))}
    </div>
  )
}

export function CalendarFilters({ state, counts, lensLabel, onChange, onReset }: { state: CalendarFilterState; counts: FilterCounts; lensLabel: string; onChange: (patch: Partial<CalendarFilterState>) => void; onReset: () => void }) {
  const dirty = JSON.stringify(state) !== JSON.stringify(DEFAULT_FILTERS)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Segment<ImpactFilter>
        label="Impact"
        value={state.impact}
        onChange={(impact) => onChange({ impact })}
        options={[
          { key: "all", text: "All", count: counts.impact.all },
          { key: "high", text: "High+", count: counts.impact.high },
          { key: "critical", text: "Critical", count: counts.impact.critical },
        ]}
      />
      <Segment<RelevanceFilter>
        label="Relevance"
        value={state.relevance}
        onChange={(relevance) => onChange({ relevance })}
        options={[
          { key: "lens", text: lensLabel, count: counts.relevance.lens },
          { key: "all", text: "All assets", count: counts.relevance.all },
        ]}
      />
      <Segment<StatusFilter>
        label="Status"
        value={state.status}
        onChange={(status) => onChange({ status })}
        options={[
          { key: "upcoming", text: "Upcoming", count: counts.status.upcoming },
          { key: "released", text: "Released", count: counts.status.released },
          { key: "both", text: "Both", count: counts.status.both },
        ]}
      />
      <Segment<RegionFilter>
        label="Region"
        value={state.region}
        onChange={(region) => onChange({ region })}
        options={[
          { key: "us", text: "US", count: counts.region.us },
          { key: "all", text: "All", count: counts.region.all },
        ]}
      />
      <div role="group" aria-label="Market coverage" className="inline-flex items-center rounded-md border border-white/[0.06] p-0.5">
        <Toggle pressed={state.marketOnly} onClick={() => onChange({ marketOnly: !state.marketOnly })} className="h-5 py-0" title="Only releases with a liquid Kalshi or Polymarket ladder">
          <span className="mr-0.5" style={{ color: state.marketOnly ? "#22D3EE" : undefined }}>{"<>"}</span>
          Market-covered only
          <span className="ml-0.5 font-mono text-[10px] tabular-nums opacity-70">({counts.market})</span>
        </Toggle>
      </div>
      {dirty && (
        <button type="button" onClick={onReset} className={cn("rounded-sm px-1 text-[11px] text-white/50 hover:text-white/80 transition-colors", FOCUS_RING)}>
          reset
        </button>
      )}
    </div>
  )
}
