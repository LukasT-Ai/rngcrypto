"use client"

import React from "react"
import { Grid2x2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { AMBER, GREEN, LABEL, RED, SURFACE, Tip } from "../shared"
import { FeatureTile } from "./FeatureTile"
import { fmtSd, fmtSignedPct, staleLabel, type OiFeature, type OiQuadrantKey } from "./features-contract"

// F2.3 OI quadrant glyph: 2x2 grid, axes `price d24h` (columns) / `OI d24h` (rows), the active cell lit and labelled.
// new_longs / new_shorts = continuation, filled with the direction color at 15%; short_cover / long_flush = fade,
// filled amber 15% with the word "fade". |sd| < 1: no cell lit, caption `inside ±1 sd`. Null feature: `feed off`.

interface Cell {
  key: OiQuadrantKey
  label: string
  kind: "continuation" | "fade"
  color: string
  read: string
}

// Grid order: top row = OI up, bottom row = OI down; left column = price down, right column = price up.
const CELLS: Cell[] = [
  { key: "new_shorts", label: "new shorts", kind: "continuation", color: RED, read: "Price down with OI up: fresh shorts are being opened. Continuation lower is the base case." },
  { key: "new_longs", label: "new longs", kind: "continuation", color: GREEN, read: "Price up with OI up: fresh longs are being opened. Continuation higher is the base case." },
  { key: "long_flush", label: "long flush", kind: "fade", color: AMBER, read: "Price down with OI down: longs are being closed, not new shorts. Flush moves tend to fade once the forced selling ends." },
  { key: "short_cover", label: "short cover", kind: "fade", color: AMBER, read: "Price up with OI down: shorts are covering, not new buyers. Squeeze moves tend to fade once covering is done." },
]

export const OiQuadrant = React.memo(function OiQuadrant({ oi, now }: { oi: OiFeature | null | undefined; now: number }) {
  const off = oi == null
  const stale = staleLabel(oi, now)
  const inside = !off && Math.abs(oi.sd) < 1
  const active = !off && !inside ? oi.quadrant : null
  const activeCell = CELLS.find((c) => c.key === active) ?? null
  const caption = off ? "feed off" : inside ? `inside ±1 sd · OI ${fmtSignedPct(oi.change24hPct)} · price ${fmtSignedPct(oi.priceChange24hPct)}` : `OI ${fmtSignedPct(oi.change24hPct)} (${fmtSd(oi.sd)}) · price ${fmtSignedPct(oi.priceChange24hPct)}`

  return (
    <div className={cn(SURFACE, "min-w-0 px-3 py-2.5 sm:px-4 sm:py-3")}>
      <div className="mb-1 flex items-center gap-2">
        <Grid2x2 className="size-3.5 shrink-0 text-white/50" />
        <Tip content="Open interest change against price change over 24h. Rising OI with the move means new positions (continuation); falling OI means positions closing (the move tends to fade). Only lit when the OI change is beyond one standard deviation of its 30-day range.">
          <span className={cn(LABEL, "cursor-help underline decoration-dotted decoration-white/25 underline-offset-2")}>OI quadrant</span>
        </Tip>
        {stale && !off && (
          <span className="ml-auto rounded-md px-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: AMBER, backgroundColor: `${AMBER}1A` }}>
            {stale}
          </span>
        )}
      </div>
      <div className="flex items-start gap-3">
        {/* Glyph: fixed 2x2, axis words along the edges in 10px eyebrow */}
        <div className="shrink-0">
          <div className="grid grid-cols-[auto_1fr] gap-x-1">
            <div className="flex flex-col justify-between py-1 text-[9px] uppercase leading-none tracking-wide text-white/35" aria-hidden>
              <span>OI ▲</span>
              <span>OI ▼</span>
            </div>
            <div role="img" aria-label={off ? "OI quadrant, feed off" : activeCell ? `OI quadrant: ${activeCell.label}, ${activeCell.kind}` : "OI quadrant: inside one standard deviation, no cell lit"} className="grid size-16 grid-cols-2 grid-rows-2 gap-[2px]">
              {CELLS.map((c) => {
                const lit = activeCell?.key === c.key
                return (
                  <div
                    key={c.key}
                    className="flex items-center justify-center rounded-[3px] text-center text-[8px] font-semibold uppercase leading-[1.05] tracking-wide"
                    style={lit ? { backgroundColor: `${c.color}26`, color: c.color, boxShadow: `inset 0 0 0 1px ${c.color}66` } : { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.25)" }}
                  >
                    {c.label}
                  </div>
                )
              })}
            </div>
            <span />
            <div className="flex justify-between text-[9px] uppercase leading-none tracking-wide text-white/35" aria-hidden>
              <span>px ▼</span>
              <span>px ▲</span>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-lg font-bold leading-tight tabular-nums" style={{ color: off ? "rgba(255,255,255,0.4)" : activeCell ? activeCell.color : "rgba(255,255,255,0.6)" }}>
            {off ? "—" : activeCell ? activeCell.label : "no signal"}
            {activeCell?.kind === "fade" && <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: AMBER }}>fade</span>}
          </p>
          <p className={cn("mt-0.5 text-[11px]", off ? "text-white/40" : "text-white/50")}>{caption}</p>
          {activeCell && <p className="mt-1 text-[11px] leading-snug text-white/60">{activeCell.read}</p>}
        </div>
      </div>
    </div>
  )
})

// OI change tiles beside the glyph: 24h change in % with its z, and the matching price change for the reader
// who wants the two numbers without decoding the grid.
export const OiChangeTiles = React.memo(function OiChangeTiles({ oi, now, fallbackChangePct }: { oi: OiFeature | null | undefined; now: number; fallbackChangePct?: number | null }) {
  const stale = staleLabel(oi, now)
  const change = oi ? oi.change24hPct : (fallbackChangePct ?? null)
  const off = change == null
  const big = oi ? Math.abs(oi.sd) >= 1 : Math.abs(change ?? 0) > 15
  return (
    <>
      <FeatureTile
        label="OI change 24h"
        off={off}
        stale={stale}
        color={big ? (change! >= 0 ? GREEN : RED) : undefined}
        hint="Change in open interest over 24h. Rising with price means new longs; falling means positions closing. The sd figure is the change relative to its 30-day distribution."
        value={change != null ? fmtSignedPct(change) : null}
        sub={oi ? `${fmtSd(oi.sd)} · ${big ? "outside" : "inside"} ±1 sd` : "fixed-threshold read · features off"}
      />
      <FeatureTile
        label="Price change 24h"
        off={oi == null}
        stale={stale}
        color={oi ? (oi.priceChange24hPct >= 0 ? GREEN : RED) : undefined}
        value={oi ? fmtSignedPct(oi.priceChange24hPct) : null}
        sub="paired with OI for the quadrant"
      />
    </>
  )
})
