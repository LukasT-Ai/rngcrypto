"use client"

import React, { useMemo, useState } from "react"
import { CalendarClock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CalendarRow, EventState, MacroAsset } from "@/lib/macro/types"
import { FOCUS_RING, SURFACE, useNow } from "../shared"
import { MacroEventCard, type MacroApi } from "../MacroEventPanel"
import { usePredictionState } from "../PredictionOddsPanel"
import { CalendarFilters, DEFAULT_FILTERS, useCalendarFilters, type CalendarFilterState, type FilterCounts } from "./CalendarFilters"
import { COLS, CalendarRowDesktop, dayLabel, isLiquid } from "./CalendarRow"
import { CalendarMobileCard } from "./CalendarMobileCard"

// Economic Calendar v2 (design F3). Three groups: Live (the active event, rendered as the full MacroEventCard in
// place of its row), Upcoming (next 14d, by day) and Released (last 7d, newest first, collapsed to two days).
// The old NextEventsStrip and RecentResults are absorbed here; their anchors (sec-macro-strip, sec-macro-results)
// now point at the Upcoming and Released groups, and sec-macro at the live card, so verdict links keep working.

const RELEASED_DAYS_DEFAULT = 2
const LENS_LABEL: Record<MacroAsset, string> = { BTC: "BTC", GOLD: "Gold", WTI: "WTI" }

interface DayGroup {
  day: string
  rows: CalendarRow[]
  high: number
}

function byDay(rows: CalendarRow[]): DayGroup[] {
  const out: DayGroup[] = []
  for (const r of rows) {
    const day = dayLabel(r.time)
    const g = out[out.length - 1]
    const high = r.importance === "high" || r.importance === "critical" ? 1 : 0
    if (g && g.day === day) {
      g.rows.push(r)
      g.high += high
    } else out.push({ day, rows: [r], high })
  }
  return out
}

function passes(r: CalendarRow, f: CalendarFilterState, lens: MacroAsset): boolean {
  if (f.impact === "high" && (r.importance === "low" || r.importance === "medium")) return false
  if (f.impact === "critical" && r.importance !== "critical") return false
  if (f.relevance === "lens" && (r.relevance?.[lens] ?? 1) < 0.3) return false
  if (f.region === "us" && r.country && r.country !== "US") return false
  if (f.marketOnly && !isLiquid(r.market)) return false
  return true
}

function statusPasses(r: CalendarRow, f: CalendarFilterState): boolean {
  if (f.status === "upcoming" && r.released) return false
  if (f.status === "released" && !r.released) return false
  return true
}

function Group({
  id,
  title,
  caption,
  days,
  lens,
  now,
  couplingMult,
  expandedId,
  onToggle,
  stateById,
  predState,
  empty,
  footer,
}: {
  id: string
  title: string
  caption?: string
  days: DayGroup[]
  lens: MacroAsset
  now: number
  couplingMult: number | null
  expandedId: string | null
  onToggle: (id: string) => void
  stateById: Map<string, EventState>
  predState: ReturnType<typeof usePredictionState>["data"]
  empty: string
  footer?: React.ReactNode
}) {
  const th = "px-2 py-1.5 text-left font-semibold"
  return (
    <section id={id} aria-label={title} className="border-t border-white/[0.06]">
      <div className="flex flex-wrap items-center gap-2 bg-white/[0.02] px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--brand, #9CA3AF)" }}>{title}</span>
        {caption && <span className="text-[11px] text-white/50">{caption}</span>}
      </div>
      {days.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-white/45">{empty}</p>
      ) : (
        <>
          {/* Desktop table */}
          <table className="hidden w-full border-collapse md:table">
            <thead className="text-[10px] uppercase tracking-[0.08em] text-white/50">
              <tr>
                <th className={cn(th, "w-[88px]")}>When</th>
                <th className={th}>Release</th>
                <th className={cn(th, "w-[44px]")}>Rel.</th>
                <th className={cn(th, "w-[72px] text-right")}>Actual</th>
                <th className={cn(th, "w-[96px] text-right")}>Forecast</th>
                <th className={cn(th, "w-[64px] text-right")}>Prev.</th>
                <th className={cn(th, "w-[112px]")}>Surprise</th>
                <th className={th}>Read</th>
              </tr>
            </thead>
            <tbody>
              {days.map((g) => (
                <React.Fragment key={g.day}>
                  <tr>
                    <td colSpan={COLS} className="bg-white/[0.03] px-2 py-1 text-[11px] font-semibold text-white/60">
                      {g.day}
                      {g.high > 0 && <span className="ml-2 font-mono text-[10px] font-normal tabular-nums text-white/45">{g.high} high</span>}
                    </td>
                  </tr>
                  {g.rows.map((r) => (
                    <CalendarRowDesktop key={r.id} r={r} lens={lens} now={now} couplingMult={couplingMult} expanded={expandedId === r.id} onToggle={() => onToggle(r.id)} state={stateById.get(r.id)} predState={predState} />
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {/* Mobile cards */}
          <div className="md:hidden">
            {days.map((g) => (
              <React.Fragment key={g.day}>
                <div className="sticky top-0 z-[1] bg-[rgb(var(--surface-rgb,10_14_23))] px-3 py-1 text-[11px] font-semibold text-white/60">
                  {g.day}
                  {g.high > 0 && <span className="ml-2 font-mono text-[10px] font-normal tabular-nums text-white/45">{g.high} high</span>}
                </div>
                {g.rows.map((r) => (
                  <CalendarMobileCard key={r.id} r={r} lens={lens} now={now} couplingMult={couplingMult} expanded={expandedId === r.id} onToggle={() => onToggle(r.id)} state={stateById.get(r.id)} predState={predState} />
                ))}
              </React.Fragment>
            ))}
          </div>
        </>
      )}
      {footer}
    </section>
  )
}

export function EconomicCalendar({ state, isLoading, lens, predAsset }: { state: MacroApi | undefined; isLoading: boolean; lens: MacroAsset; predAsset: MacroAsset | null }) {
  const now = useNow(15_000)
  const [filters, patch, reset] = useCalendarFilters()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [allReleased, setAllReleased] = useState(false)
  const predQ = usePredictionState()

  const rows = useMemo(() => state?.calendar ?? [], [state?.calendar])
  const active = state?.active ?? null
  const liveId = active?.event.id ?? rows.find((r) => r.isLive)?.id ?? null
  const liveRow = liveId ? rows.find((r) => r.id === liveId) ?? null : null
  const couplingMult = lens === "BTC" ? state?.macroCoupling?.mult ?? null : null

  const stateById = useMemo(() => {
    const m = new Map<string, EventState>()
    for (const s of [...(active ? [active] : []), ...(state?.recent ?? [])]) m.set(s.event.id, s)
    return m
  }, [active, state?.recent])

  const { upcoming, released, counts } = useMemo(() => {
    const others = rows.filter((r) => r.id !== liveId)
    const base = others.filter((r) => passes(r, filters, lens))
    const upcoming = byDay(base.filter((r) => !r.released && statusPasses(r, filters)).sort((a, b) => a.time.localeCompare(b.time)))
    const released = byDay(base.filter((r) => r.released && statusPasses(r, filters)).sort((a, b) => b.time.localeCompare(a.time)))
    const n = (f: Partial<CalendarFilterState>) => others.filter((r) => passes(r, { ...filters, ...f }, lens) && statusPasses(r, { ...filters, ...f })).length
    const counts: FilterCounts = {
      impact: { all: n({ impact: "all" }), high: n({ impact: "high" }), critical: n({ impact: "critical" }) },
      relevance: { lens: n({ relevance: "lens" }), all: n({ relevance: "all" }) },
      status: { upcoming: n({ status: "upcoming" }), released: n({ status: "released" }), both: n({ status: "both" }) },
      region: { us: n({ region: "us" }), all: n({ region: "all" }) },
      market: n({ marketOnly: true }),
    }
    return { upcoming, released, counts }
  }, [rows, liveId, filters, lens])

  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id))

  if (!state && isLoading) {
    return (
      <div id="sec-calendar" className={cn(SURFACE, "px-3 py-3 space-y-2")} aria-busy="true" aria-label="Loading economic calendar">
        <span id="sec-macro" className="block" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-5 rounded bg-white/[0.04] animate-pulse" />
        ))}
      </div>
    )
  }

  const releasedShown = allReleased ? released : released.slice(0, RELEASED_DAYS_DEFAULT)
  const hiddenDays = released.length - releasedShown.length
  const showUpcoming = filters.status !== "released"
  const showReleased = filters.status !== "upcoming"
  const shownCount = upcoming.reduce((a, g) => a + g.rows.length, 0) + releasedShown.reduce((a, g) => a + g.rows.length, 0)
  const sources = state?.sources?.filter((s) => s.provider !== "NONE") ?? []

  return (
    <div id="sec-calendar" className={cn(SURFACE, "bg-[rgb(var(--surface-rgb,10_14_23)/0.6)]")}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <CalendarClock className="size-3.5" style={{ color: "var(--brand, #9CA3AF)" }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--brand, #9CA3AF)" }}>Economic calendar</span>
        <span className="text-[11px] text-white/50">{LENS_LABEL[lens]} lens · last 7d with actuals · next 14d with consensus</span>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-white/45">
          {shownCount} of {rows.length}
        </span>
      </div>
      <div className="px-3 pb-2">
        <CalendarFilters state={filters} counts={counts} lensLabel={`This ticker (${LENS_LABEL[lens]})`} onChange={patch} onReset={reset} />
      </div>

      {/* Live: the active event's row is the full card */}
      {active && state ? (
        <section id="sec-macro" aria-label="Live release" className="border-t border-white/[0.06] p-2 sm:p-3">
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--brand, #9CA3AF)" }}>Live</span>
            <span className="text-[11px] text-white/50">{active.secondsToRelease > 0 ? "releasing soon" : "released, reaction window open"}</span>
          </div>
          <MacroEventCard state={state} isLoading={false} asset={predAsset} row={liveRow} lens={lens} />
        </section>
      ) : (
        <span id="sec-macro" className="block" />
      )}

      {showUpcoming && (
        <Group
          id="sec-macro-strip"
          title="Upcoming"
          caption={upcoming.length > 0 ? `${upcoming.reduce((a, g) => a + g.rows.length, 0)} releases · ${upcoming.reduce((a, g) => a + g.high, 0)} high` : undefined}
          days={upcoming}
          lens={lens}
          now={now}
          couplingMult={couplingMult}
          expandedId={expandedId}
          onToggle={toggle}
          stateById={stateById}
          predState={predQ.data}
          empty={rows.length === 0 ? "Calendar feed unavailable right now." : "No upcoming releases match these filters."}
        />
      )}
      {showReleased && (
        <Group
          id="sec-macro-results"
          title="Released"
          caption={released.length > 0 ? `last ${Math.min(released.length, releasedShown.length)} of ${released.length} days` : undefined}
          days={releasedShown}
          lens={lens}
          now={now}
          couplingMult={couplingMult}
          expandedId={expandedId}
          onToggle={toggle}
          stateById={stateById}
          predState={predQ.data}
          empty={rows.length === 0 ? "Calendar feed unavailable right now." : "No released prints match these filters."}
          footer={
            hiddenDays > 0 || allReleased ? (
              <div className="px-3 py-1.5">
                <button type="button" aria-expanded={allReleased} onClick={() => setAllReleased((v) => !v)} className={cn("rounded-sm text-[11px] text-white/50 hover:text-white/80 transition-colors", FOCUS_RING)}>
                  {allReleased ? "Show fewer days" : `Show ${hiddenDays} more day${hiddenDays === 1 ? "" : "s"}`}
                </button>
              </div>
            ) : null
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-white/[0.05] px-3 py-1.5 text-[10px] text-white/40">
        <span>Times in your local zone · C consensus · M market-implied mean · surprise in SD vs the blended anchor</span>
        {sources.length > 0 && <span className="ml-auto">{sources.map((s) => `${s.provider} ${s.enabled ? "on" : "off"}`).join(" · ")}</span>}
      </div>
      {JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS) && shownCount === 0 && rows.length > 0 && (
        <div className="px-3 pb-2">
          <button type="button" onClick={reset} className={cn("rounded-sm text-[11px] text-white/60 underline decoration-dotted underline-offset-2 hover:text-white", FOCUS_RING)}>
            Reset filters
          </button>
        </div>
      )}
    </div>
  )
}
