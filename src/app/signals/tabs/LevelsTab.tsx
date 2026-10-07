"use client"

import React from "react"
import { Clock, Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SignalsResponse } from "../types"
import { AMBER, GREEN, RED, SURFACE, SectionTitle, TD, TH, TableScroll, dirColor, dirLabel, fmt, pctFrom } from "../shared"

type LevelRow = { kind: "Support" | "Resistance" | "Fib" | "Daily high" | "Daily low" | "Weekly high" | "Weekly low" | "Buy wall" | "Sell wall"; label: string; price: number }

export function LevelsTab({ d, dp, accent }: { d: SignalsResponse; dp: number; accent: string }) {
  const price = d.price.mark
  const setups = d.activeSetups ?? []
  const align = d.setupAlignment
  const lv = d.levels
  const book = d.orderBook ?? null
  const fmtUsd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1e3).toFixed(0)}K`)

  const rows: LevelRow[] = [
    ...(book?.bidWalls ?? []).map((w) => ({ kind: "Buy wall" as const, label: `Buy wall ${fmtUsd(w.usd)}`, price: w.price })),
    ...(book?.askWalls ?? []).map((w) => ({ kind: "Sell wall" as const, label: `Sell wall ${fmtUsd(w.usd)}`, price: w.price })),
    ...lv.supports.map((p) => ({ kind: "Support" as const, label: "Support", price: p })),
    ...lv.resistances.map((p) => ({ kind: "Resistance" as const, label: "Resistance", price: p })),
    ...(lv.fibonacci ?? []).map((f) => ({ kind: "Fib" as const, label: `Fib ${f.level}`, price: f.price })),
    ...(lv.dailyHigh != null ? [{ kind: "Daily high" as const, label: "Daily high", price: lv.dailyHigh }] : []),
    ...(lv.dailyLow != null ? [{ kind: "Daily low" as const, label: "Daily low", price: lv.dailyLow }] : []),
    ...(lv.weeklyHigh != null ? [{ kind: "Weekly high" as const, label: "Weekly high", price: lv.weeklyHigh }] : []),
    ...(lv.weeklyLow != null ? [{ kind: "Weekly low" as const, label: "Weekly low", price: lv.weeklyLow }] : []),
  ].sort((a, b) => b.price - a.price)
  const firstBelow = rows.findIndex((r) => r.price < price)

  const rowColor = (r: LevelRow) => (r.kind === "Support" || r.kind === "Buy wall" ? GREEN : r.kind === "Resistance" || r.kind === "Sell wall" ? RED : "rgba(255,255,255,0.75)")

  // Ladder: supports, resistances and price on one axis.
  const core = [...lv.supports, ...lv.resistances, price]
  const coreMin = Math.min(...core)
  const coreMax = Math.max(...core)
  const pad = (coreMax - coreMin || price * 0.01) * 0.15
  const min = coreMin - pad
  const max = coreMax + pad
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))

  return (
    <div className="space-y-6">
      {/* Active setups */}
      <div id="sec-active-setups">
        <SectionTitle
          icon={Layers}
          right={
            align && (
              <span className="text-[10px] text-white/40 ml-auto">
                {align.alignedCount}/{align.totalCount} timeframes aligned · <span className="text-white/60">{align.tradeType.toLowerCase()}</span>
              </span>
            )
          }
        >
          Active setups
        </SectionTitle>
        {setups.length === 0 ? (
          <div className={cn(SURFACE, "p-5 text-center text-sm text-[#9CA3AF]/80")}>No active setups. Watching for alignment.</div>
        ) : (
          <TableScroll>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Horizon</th>
                  <th className={TH}>Direction</th>
                  <th className={cn(TH, "text-right")}>Entry</th>
                  <th className={cn(TH, "text-right")}>Stop</th>
                  <th className={cn(TH, "text-right")}>T1</th>
                  <th className={cn(TH, "text-right")}>T2</th>
                  <th className={cn(TH, "text-right")}>T3</th>
                  <th className={cn(TH, "text-right")}>R:R</th>
                  <th className={cn(TH, "text-right")}>Confidence</th>
                  <th className={TH}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {setups.map((s) => {
                  const dc = dirColor(s.bias)
                  return (
                    <tr key={`${s.horizon}-${s.bias}`} className="border-b border-white/[0.03] last:border-0">
                      <td className={cn(TD, "font-sans")}>
                        <span className="text-white/80 font-semibold">{s.horizonLabel}</span>
                        <span className="ml-1.5 text-[10px] text-white/35 uppercase">{s.timeframes}</span>
                      </td>
                      <td className={cn(TD, "font-sans font-bold")} style={{ color: dc }}>{dirLabel(s.bias)}</td>
                      <td className={cn(TD, "text-right text-white/90")}>${fmt(s.entry, dp)}</td>
                      <td className={cn(TD, "text-right")} style={{ color: RED }}>${fmt(s.stopLoss, dp)}</td>
                      <td className={cn(TD, "text-right")} style={{ color: GREEN }}>${fmt(s.tp1, dp)}</td>
                      <td className={cn(TD, "text-right")} style={{ color: GREEN }}>${fmt(s.tp2, dp)}</td>
                      <td className={cn(TD, "text-right")} style={{ color: GREEN }}>${fmt(s.tp3, dp)}</td>
                      <td className={cn(TD, "text-right text-white/70")}>1:{s.riskReward.toFixed(1)}</td>
                      <td className={cn(TD, "text-right text-white/70")}>{s.confidence}%</td>
                      <td className={cn(TD, "font-sans text-white/50")}>
                        <span className="inline-flex items-center gap-1"><Clock className="size-3" />{s.expectedDuration}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>

      {/* Levels ladder + table */}
      {rows.length > 0 && (
        <div id="sec-levels">
          <SectionTitle right={<span className="text-[10px] text-[#9CA3AF]/80">Supports, resistances, Fibonacci, session extremes{book ? " and live order-book walls" : ""}, nearest first</span>}>Key price levels</SectionTitle>
          <div className={cn(SURFACE, "p-4 mb-3")}>
            <div className="relative h-10">
              <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
              {lv.supports.map((p, i) => (
                <div key={`s-${i}`} className="absolute top-0 bottom-0" style={{ left: `${pct(p)}%` }}>
                  <div className="h-full w-px" style={{ backgroundColor: `${GREEN}55` }} />
                </div>
              ))}
              {lv.resistances.map((p, i) => (
                <div key={`r-${i}`} className="absolute top-0 bottom-0" style={{ left: `${pct(p)}%` }}>
                  <div className="h-full w-px" style={{ backgroundColor: `${RED}55` }} />
                </div>
              ))}
              {[...(book?.bidWalls ?? []), ...(book?.askWalls ?? [])].filter((w) => w.price >= min && w.price <= max).map((w, i) => (
                <div key={`w-${i}`} className="absolute top-1/4 bottom-1/4" style={{ left: `${pct(w.price)}%` }} title={`${w.price < price ? "Buy" : "Sell"} wall ${fmtUsd(w.usd)}`}>
                  <div className="h-full w-1 rounded-sm" style={{ backgroundColor: w.price < price ? GREEN : RED, opacity: 0.8 }} />
                </div>
              ))}
              {(lv.fibonacci ?? []).filter((f) => f.price >= min && f.price <= max).map((f, i) => (
                <div key={`f-${i}`} className="absolute top-0 bottom-0" style={{ left: `${pct(f.price)}%` }}>
                  <div className="h-full w-px bg-white/15" />
                </div>
              ))}
              <div className="absolute top-0 bottom-0 flex flex-col items-center" style={{ left: `${pct(price)}%` }}>
                <div className="h-full w-0.5" style={{ backgroundColor: accent }} />
                <span className="absolute -top-4 font-mono text-[10px] font-bold whitespace-nowrap" style={{ color: accent }}>${fmt(price, dp)}</span>
              </div>
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] text-white/35">
              <span>${fmt(min, dp)}</span>
              <span style={{ color: GREEN }}>support</span>
              <span className="text-white/35">fib</span>
              <span style={{ color: RED }}>resistance</span>
              <span>${fmt(max, dp)}</span>
            </div>
          </div>
          <TableScroll>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={TH}>Level</th>
                  <th className={cn(TH, "text-right")}>Price</th>
                  <th className={cn(TH, "text-right")}>From price</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <React.Fragment key={`${r.kind}-${r.price}-${i}`}>
                    {i === firstBelow && (
                      <tr className="bg-white/[0.04]">
                        <td className={cn(TD, "font-sans font-bold")} style={{ color: accent }}>Current price</td>
                        <td className={cn(TD, "text-right font-bold")} style={{ color: accent }}>${fmt(price, dp)}</td>
                        <td className={cn(TD, "text-right text-white/35")}>—</td>
                      </tr>
                    )}
                    <tr className="border-b border-white/[0.03] last:border-0">
                      <td className={cn(TD, "font-sans")} style={{ color: rowColor(r) }}>{r.label}</td>
                      <td className={cn(TD, "text-right")} style={{ color: rowColor(r) }}>${fmt(r.price, dp)}</td>
                      <td className={cn(TD, "text-right text-white/50")}>{pctFrom(r.price, price)}</td>
                    </tr>
                  </React.Fragment>
                ))}
                {firstBelow === -1 && (
                  <tr className="bg-white/[0.04]">
                    <td className={cn(TD, "font-sans font-bold")} style={{ color: accent }}>Current price</td>
                    <td className={cn(TD, "text-right font-bold")} style={{ color: accent }}>${fmt(price, dp)}</td>
                    <td className={cn(TD, "text-right text-white/35")}>—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableScroll>
          {lv.fibonacci?.length ? <div id="sec-fib" className="mt-1 text-[10px] text-white/30">Fibonacci retracements use the recent swing; levels are listed inline above.</div> : null}
          {align?.tradeType === "ULTIMATE" && (
            <div className="mt-3 text-[11px]" style={{ color: AMBER }}>
              All {align.totalCount} timeframes agree on {dirLabel(align.direction).toLowerCase()}. Rare, and historically the strongest setup type.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
