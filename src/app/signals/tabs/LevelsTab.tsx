"use client"

import React, { useMemo } from "react"
import { CandlestickChart, Clock, Layers } from "lucide-react"
import { LevelsChart, type PlanLine } from "@/components/levels-chart"
import { readFeatures } from "../flow/features-contract"
import { cn } from "@/lib/utils"
import type { SignalsResponse } from "../types"
import { AMBER, Chip, GREEN, LABEL, RED, SURFACE, SectionTitle, TD, TH, TableScroll, Tip, dirColor, dirLabel, fmt, pctFrom, timeAgo } from "../shared"

type LevelRow = { kind: "Support" | "Resistance" | "Fib" | "Daily high" | "Daily low" | "Weekly high" | "Weekly low" | "Buy wall" | "Sell wall"; label: string; price: number }
type Setup = SignalsResponse["activeSetups"][number]

// 260px below the sm breakpoint, 380px above. Reads the media query once per mount; a viewport resize across the
// breakpoint is rare enough that it is not worth a listener on a tab that re-renders every poll.
function useChartHeight() {
  return useMemo(() => (typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches ? 260 : 380), [])
}

export const LevelsTab = React.memo(function LevelsTab({ d, dp, accent }: { d: SignalsResponse; dp: number; accent: string }) {
  const price = d.price.mark
  const setups = d.activeSetups ?? []
  const align = d.setupAlignment
  const lv = d.levels
  const book = d.orderBook ?? null
  const fmtUsd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1e3).toFixed(0)}K`)
  const asOf = d.timestamp ? new Date(d.timestamp) : null
  const calledStamp = (ts: number) => {
    const t = new Date(ts)
    const sameDay = asOf ? t.toDateString() === asOf.toDateString() : true
    const time = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    return sameDay ? time : `${t.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`
  }
  const calledTip = (s: Setup) =>
    s.calledAt ? `First called ${new Date(s.calledAt).toLocaleString()}${s.calledEntry != null ? ` at $${fmt(s.calledEntry, dp)}` : ""}. Levels update with price; the direction has held since then.` : null

  // Chart overlays (P1-12 + F2.4). Memoized on the inputs so the chart's price-line effect only re-runs when a level moves.
  const call = d.call
  const vol = readFeatures(d)?.vol ?? null
  const emPct = vol && Number.isFinite(vol.expectedMove24hPct) ? vol.expectedMove24hPct : null
  const lines = useMemo<PlanLine[]>(() => {
    const out: PlanLine[] = []
    if (call.bias !== "WAIT") {
      out.push({ price: call.entry, title: "Entry", color: accent, width: 2 })
      out.push({ price: call.stopLoss, title: "Stop", color: RED, width: 2 })
      out.push({ price: call.tp1, title: "TP1", color: GREEN })
      out.push({ price: call.tp2, title: "TP2", color: GREEN })
      out.push({ price: call.tp3, title: "TP3", color: GREEN })
    }
    for (const w of book?.bidWalls.slice(0, 3) ?? []) out.push({ price: w.price, title: `Bid wall ${fmtUsd(w.usd)}`, color: GREEN, style: "dotted" })
    for (const w of book?.askWalls.slice(0, 3) ?? []) out.push({ price: w.price, title: `Ask wall ${fmtUsd(w.usd)}`, color: RED, style: "dotted" })
    if (emPct != null && price > 0) {
      const em = price * (emPct / 100)
      out.push({ price: price + em, title: "1 sd 24h", color: "rgba(255,255,255,0.35)", style: "dashed" })
      out.push({ price: price - em, title: "1 sd 24h", color: "rgba(255,255,255,0.35)", style: "dashed" })
    }
    return out
  }, [call.bias, call.entry, call.stopLoss, call.tp1, call.tp2, call.tp3, book, emPct, price, accent])
  const candles = d.candles ?? []
  const chartHeight = useChartHeight()
  const chartAria = `Price chart with ${candles.length} candles${call.bias !== "WAIT" ? `, ${dirLabel(call.bias).toLowerCase()} plan: entry $${fmt(call.entry, dp)}, stop $${fmt(call.stopLoss, dp)}, targets $${fmt(call.tp1, dp)}, $${fmt(call.tp2, dp)}, $${fmt(call.tp3, dp)}` : ", no active plan"}${book ? `, ${book.bidWalls.length} bid and ${book.askWalls.length} ask walls` : ""}${emPct != null ? `, expected move ±${emPct.toFixed(2)}% over 24h` : ""}. Levels are listed in the table below.`

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

  const currentRow = (
    <tr className="bg-white/[0.04]">
      <td className={cn(TD, "font-sans font-bold")} style={{ color: accent }}>Current price</td>
      <td className={cn(TD, "text-right font-bold")} style={{ color: accent }}>${fmt(price, dp)}</td>
      <td className={cn(TD, "text-right text-white/50")}>—</td>
    </tr>
  )

  return (
    <div className="space-y-6">
      {/* Price chart with the plan, walls and the expected-move band (P1-12, F2.4) */}
      {candles.length > 1 && (
        <div id="sec-chart">
          <SectionTitle
            icon={CandlestickChart}
            right={
              <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/50">
                {call.bias !== "WAIT" && (
                  <>
                    <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-block h-0.5 w-3" style={{ backgroundColor: accent }} />entry</span>
                    <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-block h-0.5 w-3" style={{ backgroundColor: RED }} />stop</span>
                    <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-block h-0.5 w-3" style={{ backgroundColor: GREEN }} />targets</span>
                  </>
                )}
                {book && <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-block h-0.5 w-3 border-t border-dotted border-white/60" />walls</span>}
                {emPct != null ? <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-block h-0.5 w-3 border-t border-dashed border-white/40" />1 sd 24h</span> : <span className="text-white/35">expected-move band: Deribit off</span>}
              </span>
            }
          >
            Chart
          </SectionTitle>
          <div className={cn(SURFACE, "overflow-hidden p-1 sm:p-2")}>
            <LevelsChart candles={candles} lines={lines} dp={dp} height={chartHeight} ariaLabel={chartAria} />
          </div>
        </div>
      )}

      {/* Active setups: table from md up, one card per setup below */}
      <div id="sec-active-setups">
        <SectionTitle
          icon={Layers}
          right={
            align && (
              <span className="ml-auto text-[11px] text-white/50">
                {align.alignedCount}/{align.totalCount} timeframes aligned · <span className="text-white/70">{align.tradeType.toLowerCase()}</span>
                {asOf && <span> · as of {asOf.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
              </span>
            )
          }
        >
          Active setups
        </SectionTitle>
        {setups.length === 0 ? (
          <div className={cn(SURFACE, "p-5 text-center text-sm text-white/60")}>No active setups. Watching for alignment.</div>
        ) : (
          <>
            <TableScroll className="hidden md:block">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className={TH}>Horizon</th>
                    <th className={TH}>Direction</th>
                    <th className={cn(TH, "text-right")}>Entry</th>
                    <th className={cn(TH, "text-right")}>T1</th>
                    <th className={cn(TH, "text-right")}>R:R</th>
                    <th className={cn(TH, "text-right")}>Stop</th>
                    <th className={cn(TH, "text-right")}>T2</th>
                    <th className={cn(TH, "text-right")}>T3</th>
                    <th className={cn(TH, "text-right")}>Confidence</th>
                    <th className={TH}>Duration</th>
                    <th className={TH}>Called</th>
                  </tr>
                </thead>
                <tbody>
                  {setups.map((s) => (
                    <tr key={`${s.horizon}-${s.bias}`} className="border-b border-white/[0.03] last:border-0">
                      <td className={cn(TD, "font-sans")}>
                        <span className="text-white/80 font-semibold">{s.horizonLabel}</span>
                        <span className="ml-1.5 text-[10px] uppercase text-white/50">{s.timeframes}</span>
                      </td>
                      <td className={cn(TD, "font-sans font-bold")} style={{ color: dirColor(s.bias) }}>{dirLabel(s.bias)}</td>
                      <td className={cn(TD, "text-right text-white/90")}>${fmt(s.entry, dp)}</td>
                      <td className={cn(TD, "text-right")} style={{ color: GREEN }}>${fmt(s.tp1, dp)}</td>
                      <td className={cn(TD, "text-right text-white/70")}>1:{s.riskReward.toFixed(1)}</td>
                      <td className={cn(TD, "text-right")} style={{ color: RED }}>${fmt(s.stopLoss, dp)}</td>
                      <td className={cn(TD, "text-right")} style={{ color: GREEN }}>${fmt(s.tp2, dp)}</td>
                      <td className={cn(TD, "text-right")} style={{ color: GREEN }}>${fmt(s.tp3, dp)}</td>
                      <td className={cn(TD, "text-right text-white/70")}>{s.confidence}%</td>
                      <td className={cn(TD, "font-sans text-white/60")}>
                        <span className="inline-flex items-center gap-1"><Clock className="size-3" />{s.expectedDuration}</span>
                      </td>
                      <td className={cn(TD, "font-sans whitespace-nowrap")}>
                        {s.calledAt ? (
                          <Tip content={calledTip(s)}>
                            <span>
                              <span className="text-white/70">{timeAgo(s.calledAt)}</span>
                              <span className="ml-1.5 text-[11px] text-white/50">{calledStamp(s.calledAt)}</span>
                              {s.calledEntry != null && Math.abs(s.calledEntry - s.entry) / s.entry > 0.0005 && <span className="ml-1.5 text-[11px] text-white/50">from ${fmt(s.calledEntry, dp)}</span>}
                            </span>
                          </Tip>
                        ) : (
                          <span className="text-white/50">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <div className="grid gap-3 md:hidden">
              {setups.map((s) => (
                <div key={`${s.horizon}-${s.bias}`} className={cn(SURFACE, "p-3")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white/85">{s.horizonLabel}</span>
                    <span className="text-[10px] uppercase text-white/50">{s.timeframes}</span>
                    <Chip variant="direction" value={s.bias}>{dirLabel(s.bias)}</Chip>
                    <span className="ml-auto font-mono text-xs tabular-nums text-white/70">{s.confidence}%</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {([
                      ["Entry", s.entry, "rgba(255,255,255,0.9)"],
                      ["T1", s.tp1, GREEN],
                      ["R:R", null, "rgba(255,255,255,0.85)"],
                      ["Stop", s.stopLoss, RED],
                      ["T2", s.tp2, GREEN],
                      ["T3", s.tp3, GREEN],
                    ] as const).map(([k, v, c]) => (
                      <div key={k} className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5">
                        <div className={LABEL}>{k}</div>
                        <div className="font-mono text-sm font-bold tabular-nums" style={{ color: c }}>{v == null ? `1:${s.riskReward.toFixed(1)}` : `$${fmt(v, dp)}`}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/60">
                    <span className="inline-flex items-center gap-1"><Clock className="size-3" />{s.expectedDuration}</span>
                    {s.calledAt && <span>called {timeAgo(s.calledAt)}{s.calledEntry != null && Math.abs(s.calledEntry - s.entry) / s.entry > 0.0005 ? ` from $${fmt(s.calledEntry, dp)}` : ""}</span>}
                    <span className="truncate">{s.basedOn}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Levels ladder + table */}
      {rows.length > 0 && (
        <div id="sec-levels">
          <SectionTitle right={<span className="text-[11px] text-white/50">Supports, resistances, Fibonacci, session extremes{book ? " and live order-book walls" : ""}, nearest first</span>}>Key price levels</SectionTitle>
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
              {[...(book?.bidWalls ?? []), ...(book?.askWalls ?? [])]
                .filter((w) => w.price >= min && w.price <= max)
                .map((w, i) => (
                  <div key={`w-${i}`} className="absolute top-1/4 bottom-1/4" style={{ left: `${pct(w.price)}%` }} title={`${w.price < price ? "Buy" : "Sell"} wall ${fmtUsd(w.usd)}`}>
                    <div className="h-full w-1 rounded-sm" style={{ backgroundColor: w.price < price ? GREEN : RED, opacity: 0.8 }} />
                  </div>
                ))}
              {(lv.fibonacci ?? [])
                .filter((f) => f.price >= min && f.price <= max)
                .map((f, i) => (
                  <div key={`f-${i}`} className="absolute top-0 bottom-0" style={{ left: `${pct(f.price)}%` }}>
                    <div className="h-full w-px bg-white/15" />
                  </div>
                ))}
              <div className="absolute top-0 bottom-0 flex flex-col items-center" style={{ left: `${pct(price)}%` }}>
                <div className="h-full w-0.5" style={{ backgroundColor: accent }} />
                <span className="absolute -top-4 font-mono text-[11px] font-bold tabular-nums whitespace-nowrap" style={{ color: accent }}>${fmt(price, dp)}</span>
              </div>
            </div>
            <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-white/50">
              <span>${fmt(min, dp)}</span>
              <span style={{ color: GREEN }}>support</span>
              <span>fib</span>
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
                    {i === firstBelow && currentRow}
                    <tr className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.03]">
                      <td className={cn(TD, "font-sans")} style={{ color: rowColor(r) }}>{r.label}</td>
                      <td className={cn(TD, "text-right")} style={{ color: rowColor(r) }}>${fmt(r.price, dp)}</td>
                      <td className={cn(TD, "text-right text-white/60")}>{pctFrom(r.price, price)}</td>
                    </tr>
                  </React.Fragment>
                ))}
                {firstBelow === -1 && currentRow}
              </tbody>
            </table>
          </TableScroll>
          {lv.fibonacci?.length ? <div id="sec-fib" className="mt-1 text-[11px] text-white/50">Fibonacci retracements use the recent swing; levels are listed inline above.</div> : null}
          {align?.tradeType === "ULTIMATE" && (
            <div className="mt-3 text-[11px]" style={{ color: AMBER }}>
              All {align.totalCount} timeframes agree on {dirLabel(align.direction).toLowerCase()}. Rare, and historically the strongest setup type.
            </div>
          )}
        </div>
      )}
    </div>
  )
})
