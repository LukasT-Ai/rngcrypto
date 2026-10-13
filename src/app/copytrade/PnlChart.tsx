"use client"

import React, { useMemo } from "react"
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { GRAY, GREEN } from "../signals/shared"
import { LINE, TOOLTIP_STYLE } from "../signals/performance/perf-shared"
import { fmtUsd } from "./ct-shared"

// Single-series PnL line (design-ux-ui.md 4.5 rule 1): #00C466 2px, GREEN 12% to 0 fill, no legend, zero line as a
// recessive reference. Markers only when the series is short enough to read them.
export default function PnlChart({ series, label }: { series: [number, number][]; label: string }) {
  const data = useMemo(() => series.map(([t, pnl]) => ({ t, pnl })), [series])
  const span = data.length ? data[data.length - 1].t - data[0].t : 0
  const fmtTick = (t: number) => new Date(t).toLocaleDateString("en-US", span > 120 * 86400e3 ? { month: "short", year: "2-digit", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" })
  if (data.length < 2) return <div className="flex h-40 items-center justify-center text-xs text-white/45">PnL history appears after two data points.</div>
  return (
    <div className="h-40" role="img" aria-label={`${label} PnL history, ${data.length} points, ending at ${fmtUsd(data[data.length - 1].pnl, { sign: true })}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="ct-pnl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity={0.12} />
              <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtTick} tick={{ fill: GRAY, fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} minTickGap={40} />
          <YAxis width={56} tick={{ fill: GRAY, fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtUsd(v)} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "rgba(255,255,255,0.25)", strokeWidth: 1 }} labelFormatter={(t) => new Date(Number(t)).toISOString().slice(0, 10)} formatter={(v) => [fmtUsd(Number(v), { sign: true }), "PnL"]} />
          <Area type="monotone" dataKey="pnl" stroke={LINE} strokeWidth={2} fill="url(#ct-pnl)" dot={data.length <= 40 ? { r: 3, fill: LINE, stroke: "#0A0E17", strokeWidth: 2 } : false} activeDot={{ r: 5, fill: LINE, stroke: "#0A0E17", strokeWidth: 2 }} isAnimationActive={false} name="pnl" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
