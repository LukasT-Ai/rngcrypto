"use client"

import React, { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { NormalizedSignal } from "@/app/api/signals/history/performance"
import type { AuditRecord, SignalRowV2 } from "../types"
import { AMBER, GRAY, GREEN, INDIGO, RED, SURFACE_HEX, WARM, dur, fmtPrice, fmtR, utc } from "./perf-shared"

export type AuditRow = NormalizedSignal & SignalRowV2

type Step = { at: number | null; label: string; price?: number | null; r?: number | null; kind: "eligible" | "fill" | "tp" | "stop" | "horizon" | "cost" | "info" }

const rAt = (s: AuditRow, price: number | null | undefined, fill?: number | null) => {
  if (price == null) return null
  const entry = fill ?? s.entry
  const risk = Math.abs(entry - s.stopLoss)
  if (!(risk > 0)) return null
  const move = s.bias === "LONG" ? price - entry : entry - price
  return Math.round((move / risk) * 100) / 100
}

function buildTimeline(s: AuditRow, res: AuditRecord["resolution"] | null): Step[] {
  const steps: Step[] = []
  const fillPrice = res?.fillPrice ?? s.fillPrice ?? (s.fillStatus === "filled" ? s.entry : null)
  steps.push({ at: s.timestamp, label: `Call published (${s.bias} ${s.symbol}, entry ${fmtPrice(s.entry)})`, kind: "info" })
  if (res?.firstEligibleCandle != null) steps.push({ at: res.firstEligibleCandle, label: "First eligible candle", kind: "eligible" })
  if (res?.fillWindowEnd != null && (res.fillCandle == null || res.fillCandle > res.fillWindowEnd)) steps.push({ at: res.fillWindowEnd, label: "Fill window closed", kind: "eligible" })
  const fillAt = res?.fillCandle ?? s.filledAt
  if (fillAt != null) steps.push({ at: fillAt, label: `Filled${s.entryType ? ` (${s.entryType})` : ""}`, price: fillPrice, r: 0, kind: "fill" })
  else if (s.fillStatus === "pending") steps.push({ at: null, label: "Awaiting fill", kind: "fill" })
  else if (s.fillStatus === "unfilled") steps.push({ at: null, label: "Never filled inside the fill window", kind: "fill" })
  const touches = res?.tpTouches ?? s.tpLevels.filter((t) => t.at != null).map((t) => ({ level: t.level, at: t.at as number, price: t.price }))
  for (const t of touches) steps.push({ at: t.at, label: `TP${t.level} touched`, price: t.price, r: rAt(s, t.price, fillPrice), kind: "tp" })
  if (res?.stopTouch) steps.push({ at: res.stopTouch.at, label: res.stopTouch.afterTp ? `Stop touched after TP${res.stopTouch.afterTp}` : "Stop touched", price: res.stopTouch.price, r: rAt(s, res.stopTouch.price, fillPrice), kind: "stop" })
  else if (!res && s.closedReason === "stop" && s.closedAt != null) steps.push({ at: s.closedAt, label: "Stop touched", price: s.stopLoss, r: rAt(s, s.stopLoss, fillPrice), kind: "stop" })
  if (res?.horizonEnd != null) steps.push({ at: res.horizonEnd, label: (res.closedReason ?? s.closedReason) === "horizon" ? "Horizon reached, exited at last close" : "Horizon end", kind: "horizon" })
  else if (!res && s.closedReason === "horizon" && s.closedAt != null) steps.push({ at: s.closedAt, label: "Horizon reached, exited at last close", kind: "horizon" })
  const gross = res?.grossR ?? s.realizedR
  const net = res?.netR ?? s.realizedNetR
  const cost = res?.costR ?? s.costR
  if (!s.open && !s.excluded && (gross != null || net != null)) steps.push({ at: res?.closedAt ?? s.closedAt ?? null, label: `Result: ${fmtR(gross)} gross${net != null ? `, ${fmtR(net)} net` : ""}${cost != null ? ` (cost ${fmtR(-Math.abs(cost))})` : ""}`, kind: "cost" })
  return steps.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))
}

const KIND_COLOR: Record<Step["kind"], string> = { eligible: GRAY, fill: INDIGO, tp: GREEN, stop: RED, horizon: AMBER, cost: "rgba(255,255,255,0.7)", info: GRAY }

function Kv({ k, v, mono = true }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-white/[0.05] py-1.5 text-xs">
      <span className="text-white/50">{k}</span>
      <span className={cn("text-right text-white/85 min-w-0 break-words", mono && "font-mono tabular-nums")}>{v}</span>
    </div>
  )
}

function ComponentBars({ components }: { components: Record<string, { score: number; weight: number }> }) {
  const rows = Object.entries(components).sort((a, b) => Math.abs(b[1].score * b[1].weight) - Math.abs(a[1].score * a[1].weight))
  const max = Math.max(1e-9, ...rows.map(([, c]) => Math.abs(c.score)))
  return (
    <div className="space-y-1">
      {rows.map(([name, c]) => {
        const pct = Math.min(100, (Math.abs(c.score) / max) * 100)
        const pos = c.score >= 0
        return (
          <div key={name} className="grid grid-cols-[88px_1fr_56px] items-center gap-2 text-[11px]">
            <span className="truncate text-white/70" title={name}>{name}</span>
            <div className="relative h-2 rounded bg-white/[0.06]" aria-hidden>
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
              <div className="absolute inset-y-0 rounded" style={pos ? { left: "50%", width: `${pct / 2}%`, background: INDIGO } : { right: "50%", width: `${pct / 2}%`, background: WARM }} />
            </div>
            <span className="font-mono text-right text-white/80 tabular-nums">{c.score > 0 ? "+" : ""}{c.score.toFixed(2)} <span className="text-white/40">w{c.weight.toFixed(2)}</span></span>
          </div>
        )
      })}
    </div>
  )
}

export default function AuditDrawer({ row, onClose }: { row: AuditRow | null; onClose: () => void }) {
  const open = row != null
  const [tab, setTab] = useState<"inputs" | "resolution">("resolution")
  const { data, isLoading, isError } = useQuery<AuditRecord>({
    queryKey: ["audit", row?.id],
    enabled: open,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/signals/history/${encodeURIComponent(row!.id)}`)
      if (!r.ok) throw new Error(`audit ${r.status}`)
      return r.json()
    },
  })
  const res = data?.resolution ?? null
  // Fall back to the call-time inputs logged on the row itself when the audit endpoint is absent.
  const rowInputs = useMemo<AuditRecord["inputs"]>(() => {
    if (!row) return null
    const has = row.components || row.weightedScore != null || row.confidenceRaw != null || row.rr1 != null || row.atrPct != null
    if (!has) return null
    return { weightedScore: row.weightedScore, confidenceRaw: row.confidenceRaw, components: row.components ?? undefined, rr1: row.rr1, entryType: row.entryType, atrPct: row.atrPct, minutesToNextEvent: row.minutesToNextEvent, engineVersion: row.engineVersion, calibrationVersion: row.calibrationVersion }
  }, [row])
  const inputs = data?.inputs ?? rowInputs
  const timeline = useMemo(() => (row ? buildTimeline(row, res) : []), [row, res])
  const reason = res?.reasonText ?? row?.reasonText ?? row?.outcomeLabel ?? null
  const fillAt = res?.fillCandle ?? row?.filledAt ?? null
  const gap = res?.coverageGap ?? (row?.coverageGap ? true : null)

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] border-white/10 bg-[#0A0E17] text-white gap-0 overflow-y-auto">
        {row && (
          <>
            <SheetHeader className="pr-10">
              <SheetTitle className="text-white flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold">{row.symbol}</span>
                <span className="font-bold text-sm" style={{ color: row.bias === "LONG" ? GREEN : RED }}>{row.bias}</span>
                <span className="text-xs text-white/50 font-mono">{row.confidence} {row.grade}</span>
                <span className="text-xs text-white/50">{utc(row.timestamp)}</span>
              </SheetTitle>
              <SheetDescription className="text-white/60 text-xs">
                Per-call audit: inputs the engine saw at call time and the resolution trail against 5-minute candles.
              </SheetDescription>
            </SheetHeader>

            <div className="px-4">
              {reason && <p className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] leading-snug text-white/85">{reason}</p>}
              {gap && (
                <p className="mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: `${AMBER}50`, background: `${AMBER}12`, color: "rgba(255,255,255,0.85)" }}>
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5" style={{ color: AMBER }} />
                  <span>Coverage gap: the checker was offline for part of this signal&apos;s life{typeof gap === "object" ? ` (${utc(gap.from)} to ${utc(gap.to)})` : ""}. Touches inside the gap cannot be verified.</span>
                </p>
              )}
              {isError && <p className="mt-2 text-[11px] text-white/45">Full audit record not yet available for this call. Showing the resolution recorded on the ledger row.</p>}

              <div role="tablist" aria-label="Audit sections" className="mt-3 flex overflow-hidden rounded-md border border-white/10 text-[11px] font-semibold">
                {(["resolution", "inputs"] as const).map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} id={`audit-tab-${t}`} aria-controls={`audit-panel-${t}`} onClick={() => setTab(t)} className={cn("flex-1 px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#00FF88]", tab === t ? "text-[#06080F]" : "text-[#9CA3AF] hover:text-white")} style={tab === t ? { backgroundColor: GREEN } : undefined}>
                    {t === "inputs" ? "Inputs at call time" : "Resolution"}
                  </button>
                ))}
              </div>

              {tab === "resolution" && (
                <div role="tabpanel" id="audit-panel-resolution" aria-labelledby="audit-tab-resolution" className="mt-3 pb-6">
                  <ol className="relative ml-2 border-l border-white/10 pl-4 space-y-3">
                    {timeline.map((st, i) => (
                      <li key={i} className="relative text-xs">
                        <span className="absolute -left-[21px] top-1 size-2.5 rounded-full" style={{ background: KIND_COLOR[st.kind], boxShadow: `0 0 0 2px ${SURFACE_HEX}` }} aria-hidden />
                        <div className="text-white/85">{st.label}</div>
                        <div className="font-mono text-[11px] text-white/50 tabular-nums">
                          {st.at != null ? utc(st.at) : "—"}
                          {st.at != null && fillAt != null && st.kind !== "fill" && st.kind !== "info" && st.kind !== "eligible" && st.at >= fillAt && <span> · {dur(Math.round((st.at - fillAt) / 60e3))} after fill</span>}
                          {st.price != null && <span> · {fmtPrice(st.price)}</span>}
                          {st.r != null && st.kind !== "fill" && <span> · {fmtR(st.r)}</span>}
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-4">
                    <Kv k="Closed reason" v={res?.closedReason ?? row.closedReason ?? (row.open ? "open" : "—")} mono={false} />
                    <Kv k="Gross R" v={fmtR(res?.grossR ?? row.realizedR)} />
                    <Kv k="Net R" v={(res?.netR ?? row.realizedNetR) != null ? fmtR(res?.netR ?? row.realizedNetR) : "— not yet available"} />
                    <Kv k={(res?.costEstimated ?? row.costEstimated) ? "Cost (estimated, no funding)" : "Cost"} v={(res?.costR ?? row.costR) != null ? fmtR(-Math.abs((res?.costR ?? row.costR) as number)) : "—"} />
                    <Kv k="MFE / MAE" v={`${(res?.mfeR ?? row.mfeR) == null ? "—" : `+${(res?.mfeR ?? row.mfeR)!.toFixed(2)}`} / ${(res?.maeR ?? row.maeR) == null ? "—" : `-${(res?.maeR ?? row.maeR)!.toFixed(2)}`}`} />
                    {res?.lastCheckedAt != null && <Kv k="Last check" v={utc(res.lastCheckedAt)} />}
                    <Kv k="Stop · TP1 · TP2 · TP3" v={`${fmtPrice(row.stopLoss)} · ${fmtPrice(row.tp1)} · ${fmtPrice(row.tp2)} · ${fmtPrice(row.tp3)}`} />
                    <Kv k="Engine" v={inputs?.engineVersion ?? row.engineVersion} />
                    {inputs?.calibrationVersion && <Kv k="Calibration" v={inputs.calibrationVersion} />}
                  </div>
                </div>
              )}

              {tab === "inputs" && (
                <div role="tabpanel" id="audit-panel-inputs" aria-labelledby="audit-tab-inputs" className="mt-3 pb-6">
                  {isLoading ? (
                    <div className="h-24 animate-pulse rounded-lg bg-white/[0.04]" />
                  ) : !inputs ? (
                    <div>
                      <p className="text-xs text-white/50">Call-time inputs were not logged for this signal. Logged inputs begin with the measurement update; older calls show only the factor assessments below.</p>
                      {Object.keys(row.factors ?? {}).length > 0 && (
                        <div className="mt-3">
                          {Object.entries(row.factors).map(([k, v]) => <Kv key={k} k={k} v={v} mono={false} />)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {inputs.components && Object.keys(inputs.components).length > 0 && (
                        <div className="mb-3">
                          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-white/50">Components (score × weight)</div>
                          <ComponentBars components={inputs.components} />
                        </div>
                      )}
                      <Kv k="Weighted score" v={inputs.weightedScore == null ? "—" : inputs.weightedScore.toFixed(2)} />
                      <Kv k="Confidence raw → published" v={`${inputs.confidenceRaw == null ? "—" : inputs.confidenceRaw.toFixed(0)} → ${row.confidence}`} />
                      {inputs.pTp1 != null && <Kv k="Calibrated P(TP1)" v={`${Math.round(inputs.pTp1)}%`} />}
                      {(inputs.regime || inputs.regimeGate) && <Kv k="Regime · gate" v={`${inputs.regime ?? "—"} · ${inputs.regimeGate ?? "none"}`} mono={false} />}
                      {inputs.markAtSignal != null && <Kv k="Mark · last at signal" v={`${fmtPrice(inputs.markAtSignal)} · ${inputs.lastAtSignal == null ? "—" : fmtPrice(inputs.lastAtSignal)}`} />}
                      <Kv k="Mode" v={inputs.mode ?? "—"} mono={false} />
                      <Kv k="Entry type" v={inputs.entryType ?? row.entryType ?? "—"} mono={false} />
                      <Kv k="rr1 · rr2 · rr3" v={[inputs.rr1, inputs.rr2, inputs.rr3].map((x) => (x == null ? "—" : x.toFixed(2))).join(" · ")} />
                      <Kv k="ATR % of price" v={inputs.atrPct == null ? "—" : `${inputs.atrPct.toFixed(2)}%`} />
                      <Kv k="Funding rate" v={inputs.fundingRate == null ? "—" : `${(inputs.fundingRate * 100).toFixed(4)}%`} />
                      <Kv k="Minutes to next event" v={inputs.minutesToNextEvent == null ? "—" : dur(inputs.minutesToNextEvent)} />
                      {inputs.blocks && <Kv k="Blocks" v={Object.entries(inputs.blocks).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v.toFixed(2)}`).join(" · ")} />}
                      {inputs.gateNotes && inputs.gateNotes.length > 0 && (
                        <div className="mt-3">
                          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-white/50">Gate notes</div>
                          <ul className="list-disc pl-4 text-xs text-white/75 space-y-0.5">{inputs.gateNotes.map((g, i) => <li key={i}>{g}</li>)}</ul>
                        </div>
                      )}
                      {inputs.factors && Object.keys(inputs.factors).length > 0 && !inputs.components && (
                        <div className="mt-3">
                          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-white/50">Factor assessments</div>
                          {Object.entries(inputs.factors).map(([k, v]) => <Kv key={k} k={k} v={v} mono={false} />)}
                        </div>
                      )}
                      {inputs.tuning && (
                        <details className="mt-3 text-xs">
                          <summary className="cursor-pointer text-white/50 hover:text-white/80">Tuning snapshot</summary>
                          <pre className="mt-1 max-h-48 overflow-auto rounded bg-black/30 p-2 font-mono text-[11px] text-white/70">{JSON.stringify(inputs.tuning, null, 2)}</pre>
                        </details>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
