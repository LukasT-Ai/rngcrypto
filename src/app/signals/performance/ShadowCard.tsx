"use client"

import React from "react"
import { EyeOff } from "lucide-react"
import type { PerfShadowClass, PerfShadowRow } from "../types"
import { CardTitle, GRAY, Rate, fmtR, rColor } from "./perf-shared"

const CLASS_LABEL: Record<PerfShadowClass, string> = {
  wait_lean: "WAIT lean 55-59",
  htf_blocked_short: "HTF-blocked short",
  regime_blocked: "Regime-blocked",
  event_gated: "Event-gated",
}

const DASHED = "rounded-xl border border-dashed border-white/20 bg-[rgb(var(--surface-rgb)/0.35)]"

export default function ShadowCard({ shadow, mode = "gross" }: { shadow?: { byClass: PerfShadowRow[]; note: string } | null; mode?: "net" | "gross" }) {
  const exp = (r: PerfShadowRow) => (mode === "net" && r.expectancyNetR != null ? r.expectancyNetR : r.expectancyR)
  const rows = shadow?.byClass ?? []
  const allEmpty = rows.every((r) => r.n === 0)
  const header = (
    <CardTitle right={<span className="inline-flex items-center gap-1 text-[11px] text-white/50"><EyeOff className="size-3.5" /> declined calls, not in any public number</span>}>Shadow calls</CardTitle>
  )
  if (!shadow || rows.length === 0 || allEmpty) {
    return (
      <div className={`${DASHED} p-4`}>
        {header}
        <p className="text-xs text-white/50">{!shadow ? "Shadow logging is not yet available. Calls declined by a gate will be tracked here so the gates can be audited." : "No declined calls logged yet."}</p>
      </div>
    )
  }
  return (
    <div className={`${DASHED} p-4`}>
      {header}
      <div className="hidden sm:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.08em] text-white/50">
              <th scope="col" className="text-left font-medium py-1">Class</th>
              <th scope="col" className="text-right font-medium">n</th>
              <th scope="col" className="text-right font-medium">TP1 rate</th>
              <th scope="col" className="text-right font-medium">Expectancy{mode === "net" ? " net" : ""}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-white/[0.05]">
                <td className="py-1.5 text-white/85">{CLASS_LABEL[r.key] ?? r.key}</td>
                <td className="text-right font-mono tabular-nums text-white/70">{r.n}{r.openN ? <span className="text-white/40"> +{r.openN} open</span> : null}</td>
                <td className="text-right">{r.n < 8 ? <span className="text-white/40 text-[11px]">too few</span> : <Rate rate={r.tp1Rate} n={r.n} lo={r.wilsonLo} hi={r.wilsonHi} />}</td>
                <td className="text-right font-mono tabular-nums" style={{ color: rColor(exp(r), r.n) ?? (exp(r) == null ? GRAY : undefined) }}>{r.n < 8 ? "" : fmtR(exp(r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sm:hidden space-y-1.5">
        {rows.map((r) => (
          <div key={r.key} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
            <div className="flex items-center justify-between"><span className="text-white/85">{CLASS_LABEL[r.key] ?? r.key}</span><span className="font-mono text-white/60">n {r.n}</span></div>
            <div className="mt-1 flex items-center justify-between">
              {r.n < 8 ? <span className="text-white/40">too few</span> : <><Rate rate={r.tp1Rate} n={r.n} lo={r.wilsonLo} hi={r.wilsonHi} /><span className="font-mono" style={{ color: rColor(exp(r), r.n) }}>{fmtR(exp(r))}</span></>}
            </div>
          </div>
        ))}
      </div>
      {shadow.note && <p className="mt-2 text-[11px] text-white/45">{shadow.note}</p>}
    </div>
  )
}
