"use client"

import React from "react"
import { Timer } from "lucide-react"
import { GREEN, RED, useNow } from "../shared"
import { FeatureTile } from "./FeatureTile"
import { SignedBars } from "./Sparkline"
import { staleLabel, type CvdFeature } from "./features-contract"

// F2.3 quarter-hour taker imbalance tile: value `+0.31`, sub `EMA of last 4 · 4-12h horizon`, four small signed
// bars for the readings. Directional, green/red by sign. Before the first :15 boundary the tile shows
// `waiting for :15 boundary` with a countdown to the next one. The countdown is the only per-second consumer on
// the Flow tab and it is isolated inside this memoized tile.

const QH_MS = 15 * 60 * 1000

function Countdown() {
  const now = useNow(1000)
  if (now === 0) return <span>waiting for :15 boundary</span>
  const left = QH_MS - (now % QH_MS)
  const m = Math.floor(left / 60000)
  const s = Math.floor((left % 60000) / 1000)
  return (
    <span>
      waiting for :15 boundary · <span className="font-mono tabular-nums">{m}:{s.toString().padStart(2, "0")}</span>
    </span>
  )
}

export const QuarterHourTile = React.memo(function QuarterHourTile({ cvd, now }: { cvd: CvdFeature | null | undefined; now: number }) {
  const off = cvd == null
  const v = cvd?.qhImbalance ?? null
  const readings = cvd?.qhReadings ?? []
  const n = readings.length
  const last = n > 0 ? readings[n - 1] : null
  const waiting = !off && v == null
  const color = v == null ? undefined : v >= 0 ? GREEN : RED
  return (
    <FeatureTile
      label="Quarter-hour imbalance"
      icon={Timer}
      off={off}
      offText="OKX taker feed off"
      stale={staleLabel(cvd, now)}
      color={color}
      hint="Taker buy minus sell volume over each closed 15-minute window, as a share of total. The value is an EMA of the last four windows; the bars are the raw readings, oldest left. Predictive on a 4 to 12 hour horizon."
      value={waiting ? "…" : v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}` : null}
      sub={
        waiting ? (
          <Countdown />
        ) : v != null ? (
          <>
            EMA of last {Math.min(4, Math.max(n, 1))} · last window {last != null ? `${last >= 0 ? "+" : ""}${last.toFixed(2)}` : "—"} · n {n}
          </>
        ) : null
      }
      aside={!off && !waiting ? <SignedBars values={readings.slice(-4)} label={`Last ${Math.min(4, n)} quarter-hour readings`} /> : null}
    />
  )
})
