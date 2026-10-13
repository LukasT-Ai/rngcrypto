"use client"

import React from "react"
import { Activity } from "lucide-react"
import { AMBER, Chip, Tip } from "../shared"
import { FeatureTile } from "./FeatureTile"
import { fmtSd, staleLabel, type FundingFeature, type FundingVenueKey } from "./features-contract"

// F2.2 funding z tile: value `+2.1 sd`, sub `0.018%/8h · crowded long`, a row of venue dots with a `spread 2.4x`
// tag and a crowding chip. Magnitude only (white/90); the word `crowded` in amber. Funding is not a direction vote,
// so no green/red. Venue dots go grey when that venue is null. Null feature: raw rate fallback when the legacy
// `market.fundingRate` exists, else `feed off`.

const VENUE_LABEL: Record<FundingVenueKey, string> = { okx: "OKX", hl: "Hyperliquid", binance: "Binance", bybit: "Bybit" }
// Fixed display order so the dots never reshuffle between polls.
const VENUE_ORDER: FundingVenueKey[] = ["okx", "hl", "binance", "bybit"]

const pct8h = (r: number) => `${(r * 100).toFixed(4)}%/8h`

function VenueDots({ venues }: { venues: FundingFeature["venues"] }) {
  const keys = VENUE_ORDER.filter((k) => k in venues)
  if (keys.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1" role="list" aria-label="Funding by venue">
      {keys.map((k) => {
        const v = venues[k]
        const on = v != null && Number.isFinite(v)
        return (
          <Tip key={k} content={on ? `${VENUE_LABEL[k]} funding ${pct8h(v)}` : `${VENUE_LABEL[k]}: no funding data`}>
            <span role="listitem" className="inline-flex items-center gap-1 text-[10px] text-white/60">
              <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ backgroundColor: on ? "rgba(255,255,255,0.85)" : "transparent", boxShadow: on ? undefined : "inset 0 0 0 1px rgba(255,255,255,0.3)" }} />
              <span className={on ? "" : "text-white/35"}>{VENUE_LABEL[k]}</span>
              {on && <span className="font-mono tabular-nums text-white/45">{(v * 100).toFixed(3)}%</span>}
            </span>
          </Tip>
        )
      })}
    </div>
  )
}

export const FundingTile = React.memo(function FundingTile({ funding, now, fallbackRate }: { funding: FundingFeature | null | undefined; now: number; fallbackRate?: number | null }) {
  if (funding == null) {
    const hasRaw = fallbackRate != null && Number.isFinite(fallbackRate)
    return (
      <FeatureTile
        label="Funding"
        icon={Activity}
        off={!hasRaw}
        value={hasRaw ? pct8h(fallbackRate) : null}
        sub={hasRaw ? "8h equiv · z-score feed off" : undefined}
        hint="Periodic payment between longs and shorts on perpetuals. Positive means longs pay shorts (crowded long). The z-score version compares today's rate with its 30-day distribution across venues."
      />
    )
  }
  const crowded = funding.crowded
  const z = funding.z
  return (
    <FeatureTile
      label="Funding"
      icon={Activity}
      stale={staleLabel(funding, now)}
      hint="Funding z-score: today's 8h-equivalent rate against its 30-day distribution. Beyond ±2 sd one side is paying heavily to stay in, which raises squeeze risk against the crowd. Not a direction vote by itself."
      value={z == null ? "—" : fmtSd(z)}
      sub={
        <>
          {pct8h(funding.rate8h)}
          {z == null && ` · z pending (n ${funding.n})`}
          {crowded && (
            <>
              {" · "}
              <span style={{ color: AMBER }}>crowded</span> {crowded}
            </>
          )}
        </>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <VenueDots venues={funding.venues} />
          <div className="flex items-center gap-1.5">
            {funding.spreadRatio != null && (
              <Chip variant="neutral" tip="Highest venue rate divided by the lowest. A wide spread means one venue is carrying the crowding.">spread {funding.spreadRatio.toFixed(1)}x</Chip>
            )}
            {crowded && z != null && Math.abs(z) >= 2 && (
              <Chip variant="warning" tip={`Funding is ${Math.abs(z).toFixed(1)} sd ${z > 0 ? "above" : "below"} normal: ${crowded}s are paying to hold. A move against them can cascade.`}>
                crowded {crowded}
              </Chip>
            )}
          </div>
        </div>
      }
    />
  )
})
