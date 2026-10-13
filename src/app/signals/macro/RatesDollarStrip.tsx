"use client"

import React from "react"
import { cn } from "@/lib/utils"
import type { MacroAsset } from "@/lib/macro/types"
import { LABEL, SURFACE } from "../shared"

// PLACEHOLDER so build/ui-calendar compiles alone. ui-flow owns the real component at this path with the same
// export name and props (F2.5: two stat tiles, 5d changes coloured by effect on the lens asset, gate chip,
// 20-point sparklines). On merge take ui-flow's file; this stub only renders the "feed off" fallback.
export const RatesDollarStrip = React.memo(function RatesDollarStrip({ macroRates, asset }: { macroRates: unknown; asset: MacroAsset }) {
  if (asset === "WTI" || macroRates != null) return null
  return (
    <div id="sec-rates" className="grid grid-cols-2 gap-2">
      {[
        ["10y real yield", "Treasury feed off"],
        ["DXY", "Treasury feed off"],
      ].map(([k, sub]) => (
        <div key={k} className={cn(SURFACE, "px-3 py-2.5")}>
          <span className={LABEL}>{k}</span>
          <p className="font-mono text-lg font-bold tabular-nums text-white/50">—</p>
          <p className="text-[11px] text-white/45">{sub}</p>
        </div>
      ))}
    </div>
  )
})
