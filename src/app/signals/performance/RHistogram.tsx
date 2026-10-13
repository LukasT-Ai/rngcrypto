"use client"

import React, { useMemo } from "react"
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { PerfRHistogramBin } from "../types"
import { CARD, CardTitle, GRAY, INDIGO, NotYet, TOOLTIP_STYLE, WARM, fmtR } from "./perf-shared"

// Diverging palette per the dataviz skill: warm arm for losses (#D97706), cool arm for gains
// (#6366F1), neutral hairline at zero. Status green/red are not series colors here.
const binValue = (bin: string) => {
  const n = parseFloat(bin.replace(/[^\d.+-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

export default function RHistogram({ bins, mode, seExpectancyR, n }: { bins?: PerfRHistogramBin[] | null; mode: "net" | "gross"; seExpectancyR?: number | null; n: number }) {
  const data = useMemo(
    () =>
      (bins ?? []).map((b) => {
        const v = binValue(b.bin)
        return { bin: b.bin, v, count: mode === "net" ? b.netN : b.n, gross: b.n, net: b.netN }
      }),
    [bins, mode]
  )
  const total = data.reduce((s, d) => s + d.count, 0)
  const beyond2 = total ? (data.filter((d) => d.v >= 2).reduce((s, d) => s + d.count, 0) / total) * 100 : null
  const zeroBin = data.find((d) => d.v >= 0)?.bin

  return (
    <div className={`${CARD} p-4`}>
      <CardTitle right={<span className="text-[11px] text-white/50">{mode} R, 0.5R bins</span>}>R distribution</CardTitle>
      {data.length === 0 ? (
        <div className="mt-4 text-xs text-white/50 flex items-center gap-2">
          <NotYet what="The R histogram" /> Histogram appears once the measurement update ships.
        </div>
      ) : (
        <>
          <div className="h-40" role="img" aria-label={`Histogram of realized ${mode} R across ${total} closed signals`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barCategoryGap={2}>
                <XAxis dataKey="bin" tick={{ fill: GRAY, fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: GRAY, fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                {zeroBin && <ReferenceLine x={zeroBin} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />}
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(l) => `${l}R bin`}
                  formatter={(v, _k, p) => [`${v} signal${Number(v) === 1 ? "" : "s"} (${p.payload.net} net, ${p.payload.gross} gross)`, "Count"]}
                />
                <Bar dataKey="count" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {data.map((d) => (
                    <Cell key={d.bin} fill={d.v < 0 ? WARM : INDIGO} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50">
            <span>Beyond +2R: <span className="font-mono text-white/80">{beyond2 == null ? "—" : `${beyond2.toFixed(0)}%`}</span></span>
            <span>SE of expectancy: <span className="font-mono text-white/80">{seExpectancyR == null ? "—" : fmtR(seExpectancyR, 3).replace("+", "±")}</span>{n > 0 && <span className="opacity-70"> (n={n})</span>}</span>
            <span className="inline-flex items-center gap-1"><i className="inline-block size-2 rounded-sm" style={{ background: WARM }} /> loss arm <i className="inline-block size-2 rounded-sm ml-2" style={{ background: INDIGO }} /> gain arm</span>
          </div>
          <table className="sr-only">
            <caption>R distribution table view</caption>
            <thead><tr><th>Bin</th><th>Count</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.bin}><td>{d.bin}</td><td>{d.count}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </div>
  )
}
