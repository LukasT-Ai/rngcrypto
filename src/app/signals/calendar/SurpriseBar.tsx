"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { AMBER, Tip } from "../shared"

// Surprise bar (design F3.1): one centered track that shows the priced tail skew before the release and the realized
// surprise after it. Economic surprise is a magnitude, not an asset direction, so the bar is white; amber marks a
// large surprise or a strongly skewed market (a warning, not a direction). Never green or red.
//
// Before release: a 2px white/40 arm from the zero tick to the skew position with a hollow marker at its end.
// After release: a 4px fill from the zero tick, length = |z| / 3 SD (or |score| / 100 without a z), left = below
// the anchor, right = above it. The label under the track reads `+1.8 sd` or `skew +0.12`.

const Z_FULL = 3
const SKEW_WARN = 0.25
const Z_WARN = 2
const SCORE_WARN = 50

export interface SurpriseBarProps {
  /** Economic surprise -100..100 (positive = above the anchor). */
  score: number | null
  /** Surprise in SD against the blended anchor. */
  zScore: number | null
  /** Priced tail skew -1..1 (positive = upside miss priced). Shown before release only. */
  tailSkew: number | null
  released: boolean
  /** Track width in px. */
  width?: number
  /** Hide the label row (mobile line 2 prints the z next to the bar). */
  compact?: boolean
  className?: string
}

export function surpriseFill(score: number | null, zScore: number | null): { frac: number; sign: 1 | -1 | 0; warn: boolean } | null {
  if (zScore != null && Number.isFinite(zScore)) {
    return { frac: Math.min(Math.abs(zScore), Z_FULL) / Z_FULL, sign: zScore > 0 ? 1 : zScore < 0 ? -1 : 0, warn: Math.abs(zScore) >= Z_WARN }
  }
  if (score != null && Number.isFinite(score)) {
    return { frac: Math.min(Math.abs(score), 100) / 100, sign: score > 0 ? 1 : score < 0 ? -1 : 0, warn: Math.abs(score) >= SCORE_WARN }
  }
  return null
}

export const fmtZ = (z: number) => `${z > 0 ? "+" : ""}${z.toFixed(1)} sd`
export const fmtSkew = (s: number) => `${s > 0 ? "+" : ""}${s.toFixed(2)}`

export function SurpriseBar({ score, zScore, tailSkew, released, width = 96, compact, className }: SurpriseBarProps) {
  const fill = released ? surpriseFill(score, zScore) : null
  const skew = !released && tailSkew != null && Number.isFinite(tailSkew) ? Math.max(-1, Math.min(1, tailSkew)) : null
  const half = width / 2
  const empty = fill == null && skew == null

  let label: string | null = null
  let labelColor = "rgba(255,255,255,0.6)"
  let tip: string
  if (fill) {
    label = zScore != null ? fmtZ(zScore) : score != null ? `${score > 0 ? "+" : ""}${Math.round(score)}` : null
    if (fill.warn) labelColor = AMBER
    tip =
      zScore != null
        ? `Realized surprise ${fmtZ(zScore)} against the expectation anchor${score != null ? ` (economic surprise ${score > 0 ? "+" : ""}${Math.round(score)} of 100)` : ""}. Left of the tick = below expectations, right = above.${fill.warn ? " Large surprise." : ""}`
        : `Economic surprise ${score != null ? `${score > 0 ? "+" : ""}${Math.round(score)}` : "—"} of 100 against consensus. Left = below, right = above.`
  } else if (skew != null) {
    label = `skew ${fmtSkew(skew)}`
    labelColor = Math.abs(skew) >= SKEW_WARN ? AMBER : "rgba(255,255,255,0.5)"
    tip = `Priced tail skew ${fmtSkew(skew)} from the prediction-market ladder: ${skew > 0 ? "an upside miss" : skew < 0 ? "a downside miss" : "no side"} is priced as more likely. A surprise prior, not an asset direction.${Math.abs(skew) >= SKEW_WARN ? " Strongly skewed." : ""}`
  } else {
    tip = released ? "No surprise measured: no verified actual or no expectation anchor." : "No market-implied skew: no liquid prediction market for this release."
  }

  const bar = (
    <span
      role="img"
      aria-label={label ? `surprise ${label}` : "no surprise data"}
      className={cn("inline-flex flex-col items-center", className)}
      style={{ width }}
    >
      <span className="relative block h-1 w-full rounded-[2px] bg-white/[0.06]">
        <span aria-hidden className="absolute left-1/2 top-[-2px] h-2 w-px bg-white/20" />
        {fill && fill.sign !== 0 && (
          <span
            aria-hidden
            className="absolute top-0 h-1 rounded-[2px]"
            style={{
              width: Math.max(2, fill.frac * half),
              backgroundColor: fill.warn ? AMBER : "rgba(255,255,255,0.6)",
              ...(fill.sign > 0 ? { left: "50%" } : { right: "50%" }),
            }}
          />
        )}
        {skew != null && (
          <>
            <span
              aria-hidden
              className="absolute top-[1px] h-[2px]"
              style={{
                width: Math.abs(skew) * half,
                backgroundColor: Math.abs(skew) >= SKEW_WARN ? `${AMBER}99` : "rgba(255,255,255,0.4)",
                ...(skew > 0 ? { left: "50%" } : { right: "50%" }),
              }}
            />
            <span
              aria-hidden
              className="absolute top-[-1px] size-1.5 rounded-full border bg-[rgb(var(--surface-rgb,10_14_23))]"
              style={{
                borderColor: Math.abs(skew) >= SKEW_WARN ? AMBER : "rgba(255,255,255,0.6)",
                left: `calc(50% + ${skew * half}px - 3px)`,
              }}
            />
          </>
        )}
      </span>
      {!compact && (
        <span className="mt-0.5 h-3 font-mono text-[10px] leading-3 tabular-nums" style={{ color: empty ? "rgba(255,255,255,0.3)" : labelColor }}>
          {label ?? "—"}
        </span>
      )}
    </span>
  )
  return <Tip content={tip}>{bar}</Tip>
}
