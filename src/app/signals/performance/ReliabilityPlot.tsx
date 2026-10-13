"use client"

import React, { useMemo, useState } from "react"
import { CartesianGrid, ErrorBar, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts"
import type { PerfCalBucket } from "../types"
import type { Bucket } from "@/app/api/signals/history/performance"
import { CARD, CardTitle, GRAY, GRID, INDIGO, NotYet, SURFACE_HEX, Segmented, TOOLTIP_STYLE, fmtCi, rateCi } from "./perf-shared"

type Row = PerfCalBucket | Bucket
type Point = { key: string; x: number; y: number; n: number; lo: number; hi: number; err: [number, number]; thin: boolean }

const midpoint = (key: string): number | null => {
  const m = key.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/)
  if (m) return (parseFloat(m[1]) + parseFloat(m[2])) / 2
  const one = key.match(/(\d+(?:\.\d+)?)/)
  return one ? parseFloat(one[1]) : null
}

function toPoints(rows: Row[], xFrom: "conf" | "p"): Point[] {
  const out: Point[] = []
  for (const r of rows) {
    const v2 = r as PerfCalBucket
    const x = xFrom === "p" ? midpoint(r.key) : v2.meanConf ?? midpoint(r.key)
    if (x == null || r.tp1Rate == null || !(r.n > 0)) continue
    const ci = rateCi(r.tp1Rate, r.n, v2.wilsonLo, v2.wilsonHi)
    if (!ci) continue
    out.push({ key: r.key, x, y: r.tp1Rate, n: r.n, lo: ci[0], hi: ci[1], err: [r.tp1Rate - ci[0], ci[1] - r.tp1Rate], thin: r.n < 8 })
  }
  return out
}

// Dot area encodes n: 8px to 20px diameter, grey under n=8, 2px surface ring.
function Dot(props: { cx?: number; cy?: number; payload?: Point; maxN: number }) {
  const { cx = 0, cy = 0, payload, maxN } = props
  if (!payload) return null
  const r = 4 + 6 * Math.sqrt(Math.min(1, payload.n / Math.max(1, maxN)))
  return <circle cx={cx} cy={cy} r={r} fill={payload.thin ? GRAY : INDIGO} fillOpacity={payload.thin ? 0.6 : 0.95} stroke={SURFACE_HEX} strokeWidth={2} />
}

export default function ReliabilityPlot({ byConfidence, byPTp1 }: { byConfidence?: Row[]; byPTp1?: PerfCalBucket[] | null }) {
  const hasP = !!byPTp1 && byPTp1.length > 0
  const [axis, setAxis] = useState<"conf" | "p">("conf")
  const points = useMemo(() => {
    const useP = axis === "p" && hasP
    return toPoints(useP ? byPTp1! : byConfidence ?? [], useP ? "p" : "conf")
  }, [byPTp1, byConfidence, axis, hasP])
  const maxN = Math.max(1, ...points.map((p) => p.n))
  const lo = Math.max(0, Math.floor((Math.min(50, ...points.map((p) => Math.min(p.x, p.lo))) - 5) / 10) * 10)

  return (
    <div className={`${CARD} p-4`}>
      <CardTitle
        right={
          <Segmented
            label="Reliability x axis"
            value={axis}
            onChange={setAxis}
            options={[
              { k: "conf", l: "Stated conf" },
              { k: "p", l: "Calibrated pTP1", disabled: !hasP, title: hasP ? undefined : "Calibrated probability not yet available" },
            ]}
          />
        }
      >
        Reliability plot
      </CardTitle>
      {points.length === 0 ? (
        <div className="mt-4 text-xs text-white/50 flex items-center gap-2"><NotYet what="The reliability plot" /> Needs at least one calibration band with a decided signal.</div>
      ) : (
        <>
          <div className="h-56" role="img" aria-label="Scatter of stated confidence band against realized TP1 rate with 95% Wilson error bars and a perfect-calibration diagonal">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis type="number" dataKey="x" domain={[lo, 100]} tick={{ fill: GRAY, fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} name={axis === "p" ? "Calibrated pTP1" : "Stated confidence"} />
                <YAxis type="number" dataKey="y" domain={[0, 100]} tick={{ fill: GRAY, fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} name="Realized TP1 rate" />
                <ReferenceLine segment={[{ x: lo, y: lo }, { x: 100, y: 100 }]} stroke="rgba(255,255,255,0.2)" strokeWidth={1} ifOverflow="hidden" />
                <Tooltip
                  cursor={false}
                  contentStyle={TOOLTIP_STYLE}
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload as Point | undefined
                    if (!p) return null
                    return (
                      <div style={TOOLTIP_STYLE} className="px-2.5 py-1.5">
                        <div className="text-white/90">Band {p.key}</div>
                        <div className="text-white/70">n={p.n} · TP1 {p.y.toFixed(0)}% {fmtCi([p.lo, p.hi])}</div>
                        <div className="text-white/50">{axis === "p" ? "pTP1" : "stated"} {p.x.toFixed(0)}%</div>
                      </div>
                    )
                  }}
                />
                <Scatter data={points} shape={(props: { cx?: number; cy?: number; payload?: Point }) => <Dot {...props} maxN={maxN} />} isAnimationActive={false}>
                  <ErrorBar dataKey="err" direction="y" width={4} stroke={INDIGO} strokeOpacity={0.6} strokeWidth={1} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-white/50">Dot area = n, grey when n &lt; 8. Diagonal = perfect calibration. Bars are 95% Wilson intervals.</p>
        </>
      )}
    </div>
  )
}
