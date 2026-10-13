"use client"

import React, { useMemo } from "react"
import { BRAND } from "../shared"

// Stat-tile sparkline (design-ux-ui.md 4.4): single series, 2px line in white/35, the last point in the brand accent
// with a 2px surface ring. No axes, no legend (one series). Optional zero line for signed series so the reader can
// see which side of zero the tail sits on. Renders a flat placeholder when there are fewer than 2 points so the tile
// keeps its height.

export const Sparkline = React.memo(function Sparkline({
  points,
  width = 96,
  height = 24,
  zeroLine = false,
  stroke = "rgba(255,255,255,0.35)",
  label,
}: {
  points: number[] | null | undefined
  width?: number
  height?: number
  zeroLine?: boolean
  stroke?: string
  /** Accessible description of the series, e.g. "15m CVD, last 3h". */
  label?: string
}) {
  const geo = useMemo(() => {
    const pts = (points ?? []).filter((v) => Number.isFinite(v))
    if (pts.length < 2) return null
    const pad = 3
    let lo = Math.min(...pts)
    let hi = Math.max(...pts)
    if (zeroLine) {
      lo = Math.min(lo, 0)
      hi = Math.max(hi, 0)
    }
    if (hi - lo === 0) {
      hi += 1
      lo -= 1
    }
    const x = (i: number) => pad + (i / (pts.length - 1)) * (width - pad * 2)
    const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2)
    const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    const last = pts[pts.length - 1]
    return { d, lx: x(pts.length - 1), ly: y(last), zy: y(0), last, n: pts.length }
  }, [points, width, height, zeroLine])

  if (!geo) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="block shrink-0">
        <line x1={3} x2={width - 3} y1={height / 2} y2={height / 2} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="2 3" />
      </svg>
    )
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={!label} className="block shrink-0">
      {zeroLine && <line x1={3} x2={width - 3} y1={geo.zy} y2={geo.zy} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />}
      <path d={geo.d} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={geo.lx} cy={geo.ly} r={4} fill={BRAND} stroke="#0A0E17" strokeWidth={2} />
    </svg>
  )
})

// Four (or n) small signed bars for the quarter-hour readings: direction is the side of the baseline, height is
// magnitude. 2px surface gap between bars, 4px rounded data end, square at the baseline.
export const SignedBars = React.memo(function SignedBars({
  values,
  width = 56,
  height = 24,
  pos = "#00FF88",
  neg = "#FF3B5C",
  label,
}: {
  values: number[]
  width?: number
  height?: number
  pos?: string
  neg?: string
  label?: string
}) {
  const vals = values.filter((v) => Number.isFinite(v))
  const n = Math.max(vals.length, 4)
  const max = Math.max(1e-9, ...vals.map((v) => Math.abs(v)))
  const gap = 2
  const bw = Math.min(10, (width - gap * (n - 1)) / n)
  const mid = height / 2
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={!label} className="block shrink-0">
      <line x1={0} x2={width} y1={mid} y2={mid} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      {Array.from({ length: n }).map((_, i) => {
        const v = vals[i]
        const x = i * (bw + gap)
        if (v == null) return <rect key={i} x={x} y={mid - 1} width={bw} height={2} fill="rgba(255,255,255,0.1)" />
        const h = Math.max(2, (Math.abs(v) / max) * (mid - 2))
        const y = v >= 0 ? mid - h : mid
        return <rect key={i} x={x} y={y} width={bw} height={h} rx={2} ry={2} fill={v >= 0 ? pos : neg} opacity={0.85} />
      })}
    </svg>
  )
})
