"use client"

import React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CalendarRow, EventState, MacroAsset } from "@/lib/macro/types"
import { formatCompactCountdown, formatTimeAgo, urgencyFor } from "@/lib/macro/format"
import { Chip, FOCUS_RING, ImportanceDot, chipLook } from "../shared"
import type { PredictionApi } from "../PredictionOddsPanel"
import { SurpriseBar, fmtSkew, fmtZ } from "./SurpriseBar"
import { GateChip, LensDirection, RelevanceBars, RowExpansion, VenueGlyph, countryTag, fmtLike, isLiquid, isTextEvent, kindTag } from "./CalendarRow"

// Mobile card (design F3.3), two lines plus the read line; tap expands into the same blocks as the desktop row.
//   ● CPI (YoY)  INFLATION  |||          in 8h 27m
//   A —   C 3.0%   M 3.05% <> sd .09     skew |> +.12
//   BTC down if above · up if below
// After release line 2 becomes `A 3.1%  C 3.0%  M 3.05%  ==|-  +0.6 sd` and line 3 `BTC down -0.4% @15m · confirmed`.

export function CalendarMobileCard({
  r,
  lens,
  now,
  couplingMult,
  expanded,
  onToggle,
  state,
  predState,
  live,
}: {
  r: CalendarRow
  lens: MacroAsset
  now: number
  couplingMult: number | null
  expanded: boolean
  onToggle: () => void
  state: EventState | null | undefined
  predState: PredictionApi | undefined
  live?: boolean
}) {
  const s = now === 0 ? null : Math.round((new Date(r.time).getTime() - now) / 1000)
  const u = s == null || r.released ? "normal" : urgencyFor(s)
  const look = chipLook("urgency", u)
  const tag = kindTag[r.kind]
  const cc = countryTag(r.country)
  const mk = isLiquid(r.market) ? r.market : null
  const like = r.forecastRaw ?? r.previousRaw
  const kv = (k: string, v: React.ReactNode, strong?: boolean) => (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[9px] font-semibold text-white/40">{k}</span>
      <span className={cn("font-mono text-[11px] tabular-nums", strong ? "font-bold text-white" : "text-white/75")}>{v}</span>
    </span>
  )
  return (
    <div className={cn("border-t border-white/[0.05] px-3 py-2", expanded && "bg-white/[0.02]")}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={cn("block w-full rounded-sm text-left", FOCUS_RING)}
      >
        <div className="flex items-center gap-1.5">
          <ImportanceDot importance={r.importance} />
          <span className={cn("min-w-0 truncate text-[12px] font-medium", r.released ? "text-white/65" : "text-white/85")}>{r.title}</span>
          {tag && <Chip variant="kind">{tag}</Chip>}
          {cc && <span className="rounded bg-white/[0.06] px-1 py-px text-[10px] font-bold text-white/60">{cc}</span>}
          <RelevanceBars relevance={r.relevance} lensRelevance={r.lensRelevance} lens={lens} couplingMult={couplingMult} />
          <span className={cn("ml-auto shrink-0 font-mono text-[11px] tabular-nums", look.weight)} style={{ color: live ? "var(--brand, #00FF88)" : r.released ? "rgba(255,255,255,0.5)" : look.color }}>
            {live ? "live" : s == null ? "" : r.released ? formatTimeAgo(-s) : s <= 0 ? "now" : `in ${formatCompactCountdown(s)}`}
          </span>
          <ChevronDown className={cn("size-3 shrink-0 text-white/40 transition-transform", expanded && "rotate-180")} aria-hidden />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {kv("A", r.actualRaw ?? (r.released && !isTextEvent(r) ? <span className="text-[#F59E0B]">awaiting</span> : "—"), !!r.actualRaw)}
          {kv("C", r.forecastRaw ? `${r.forecastSource ? "~" : ""}${r.forecastRaw}` : "—")}
          {r.fed
            ? kv("E[Δ]", `${r.fed.expectedChangeBp > 0 ? "+" : ""}${r.fed.expectedChangeBp}bp · sd ${r.fed.surpriseSdBp}bp`)
            : mk
              ? kv(
                  "M",
                  <>
                    {fmtLike(mk.mean, like)} <VenueGlyph venue={mk.venue} />
                    {mk.sd != null && <span className="text-[10px] text-white/50"> sd {fmtLike(mk.sd, like).replace(/^[+$]/, "")}</span>}
                  </>
                )
              : null}
          {!r.released && r.previousRaw && kv("P", r.previousRaw)}
          <span className="ml-auto inline-flex items-center gap-1.5">
            <SurpriseBar score={r.score} zScore={r.zScore} tailSkew={r.market?.tailSkew ?? null} released={r.released} width={48} compact />
            {r.released && r.zScore != null ? (
              <span className="font-mono text-[11px] tabular-nums" style={{ color: Math.abs(r.zScore) >= 2 ? "#F59E0B" : "rgba(255,255,255,0.7)" }}>
                {fmtZ(r.zScore)}
              </span>
            ) : !r.released && mk && mk.tailSkew != null ? (
              <span className="font-mono text-[10px] tabular-nums text-white/50">skew {fmtSkew(mk.tailSkew)}</span>
            ) : null}
          </span>
        </div>
        {(r.assetDirection || live) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
            <LensDirection r={r} lens={lens} withMove />
            {live && <GateChip gate={r.firstMoveGate} />}
          </div>
        )}
      </button>
      {expanded && (
        <div className="mt-2 border-t border-white/[0.05] pt-2">
          {r.read && <p className="mb-2 text-[12px] text-white/70">{r.read}</p>}
          <RowExpansion r={r} lens={lens} state={state} predState={predState} />
        </div>
      )}
    </div>
  )
}
