"use client"

import React from "react"
import { DollarSign, Landmark } from "lucide-react"
import { cn } from "@/lib/utils"
import { Chip, GREEN, RED, useNow } from "../shared"
import { FeatureTile } from "../flow/FeatureTile"
import { Sparkline } from "../flow/Sparkline"
import { staleLabel, type Features } from "../flow/features-contract"

// F2.5 "Rates & dollar" strip for the Macro tab (ui-calendar mounts it under the live event card for the BTC and
// GOLD lenses). Two stat tiles + the correlation gate chip:
//   `10y real 2.91% · 5d +8bp`   `DXY 103.4 · 5d -0.6%`   chip `corr30d -0.41 · active` or `corr30d -0.12 · silenced`
// Changes are colored by their *effect on the lens asset* (sign of -corr x change): gate open and the product
// positive for the asset = green, negative = red. Gate closed (`gated: true` or |corr30d| < 0.3): tiles at white/50,
// chip `silenced`, no color. Null feature: `—` / `Treasury feed off`. Optional 20-point series feed the sparklines.

export type RatesAsset = "BTC" | "GOLD" | "WTI"

const GATE_CORR = 0.3

function effectColor(open: boolean, corr: number, change: number): string | undefined {
  if (!open || change === 0) return undefined
  const product = -corr * change
  return product > 0 ? GREEN : RED
}

export const RatesDollarStrip = React.memo(function RatesDollarStrip({ macroRates, asset, className }: { macroRates: Features["macroRates"] | null | undefined; asset: RatesAsset; className?: string }) {
  const now = useNow(60_000)
  const r = macroRates ?? null
  const off = r == null
  const open = !off && !r.gated && Math.abs(r.corr30d) >= GATE_CORR
  const stale = staleLabel(r, now)
  const dim = !off && !open

  const yieldColor = r ? effectColor(open, r.corr30d, r.realYield5dChgBp) : undefined
  const dxyColor = r ? effectColor(open, r.corr30d, r.dxy5dChgPct) : undefined
  const assetWord = asset === "GOLD" ? "gold" : asset === "WTI" ? "oil" : "bitcoin"

  const gateTip = off
    ? "Rolling 30-day correlation between the asset and the real yield / dollar complex. Unavailable while the Treasury feed is off."
    : open
      ? `30d correlation ${r.corr30d.toFixed(2)}: rates and the dollar are moving ${assetWord} right now, so their 5-day changes are colored by the sign of their effect on ${assetWord} (a rise in yields with a negative correlation is a headwind, shown red).`
      : `30d correlation ${r.corr30d.toFixed(2)} is inside ±${GATE_CORR}: ${assetWord} is not trading off rates or the dollar at the moment, so these tiles are shown for context only and carry no color.`

  return (
    <div className={cn("space-y-2", className)} data-gate={off ? "off" : open ? "open" : "closed"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/50">Rates &amp; dollar</span>
        <Chip variant={off ? "neutral" : open ? "neutral" : "vol"} size="label" tip={gateTip} className={cn(off && "opacity-70")}>
          {off ? "corr30d — · feed off" : `corr30d ${r.corr30d >= 0 ? "+" : ""}${r.corr30d.toFixed(2)} · ${open ? "active" : "silenced"}`}
        </Chip>
        {!off && !open && <span className="text-[10px] text-white/40">gate closed · context only</span>}
      </div>
      <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", dim && "[&_p]:!text-white/50")}>
        <FeatureTile
          label="10y real yield"
          icon={Landmark}
          off={off}
          offText="Treasury feed off"
          stale={stale}
          hint={`10-year TIPS real yield from the Treasury daily series. Higher real yields raise the opportunity cost of holding ${assetWord}; the 5-day change in basis points is what the correlation gate scores.`}
          value={r ? `${r.realYield10y.toFixed(2)}%` : null}
          sub={
            r ? (
              <>
                5d <span style={yieldColor ? { color: yieldColor } : undefined}>{r.realYield5dChgBp >= 0 ? "+" : ""}{Math.round(r.realYield5dChgBp)}bp</span>
                {dim ? " · silenced" : ""}
              </>
            ) : null
          }
          aside={!off ? <Sparkline points={r.realYieldSeries} label={r.realYieldSeries ? "10y real yield, last 20 sessions" : undefined} /> : null}
        />
        <FeatureTile
          label="DXY"
          icon={DollarSign}
          off={off}
          offText="Treasury feed off"
          stale={stale}
          hint={`US dollar index. A stronger dollar usually weighs on ${assetWord}; the 5-day change is colored by its effect on ${assetWord} only when the correlation gate is open.`}
          value={r ? r.dxy.toFixed(1) : null}
          sub={
            r ? (
              <>
                5d <span style={dxyColor ? { color: dxyColor } : undefined}>{r.dxy5dChgPct >= 0 ? "+" : ""}{r.dxy5dChgPct.toFixed(1)}%</span>
                {dim ? " · silenced" : ""}
              </>
            ) : null
          }
          aside={!off ? <Sparkline points={r.dxySeries} label={r.dxySeries ? "DXY, last 20 sessions" : undefined} /> : null}
        />
      </div>
    </div>
  )
})
