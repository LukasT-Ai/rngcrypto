"use client"

import React from "react"
import { GitBranch } from "lucide-react"
import { GREEN, RED } from "../shared"
import { FeatureTile } from "./FeatureTile"
import { Sparkline } from "./Sparkline"
import { fmtSignedUsd, staleLabel, type CvdFeature } from "./features-contract"

// F2.3 CVD tile: value `cum 4h +$12.4M`, sub `slope 1h +$3.1M`, 12-point sparkline of 15m CVD. Directional, so the
// value is green/red by sign. Null feature = `—` / `OKX taker feed off`.

export const CvdTile = React.memo(function CvdTile({ cvd, now }: { cvd: CvdFeature | null | undefined; now: number }) {
  const off = cvd == null
  const sign = cvd ? (cvd.cum4hUsd >= 0 ? GREEN : RED) : undefined
  const series = cvd?.series15m && cvd.series15m.length >= 2 ? cvd.series15m.slice(-16) : null
  return (
    <FeatureTile
      label="CVD"
      icon={GitBranch}
      off={off}
      offText="OKX taker feed off"
      stale={staleLabel(cvd, now)}
      color={sign}
      hint="Cumulative volume delta from OKX taker trades: buy volume minus sell volume over the last 4h. Positive means aggressive buyers have been in control. The sparkline is the 15m series."
      value={cvd ? `cum 4h ${fmtSignedUsd(cvd.cum4hUsd)}` : null}
      sub={
        cvd ? (
          <>
            slope 1h {fmtSignedUsd(cvd.slope1hUsd)} · taker {cvd.takerRatio1h.toFixed(2)}
          </>
        ) : null
      }
      aside={!off ? <Sparkline points={series} zeroLine label={series ? `15m CVD, last ${Math.round((series.length * 15) / 60)}h` : undefined} /> : null}
    />
  )
})
