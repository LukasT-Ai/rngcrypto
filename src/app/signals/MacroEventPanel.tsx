"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarClock, ChevronDown, Clock, Droplets, ShieldAlert, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { AMBER, Chip, GRAY, GREEN, ImportanceDot, RED, SURFACE, chipLook, useNow } from "./shared"
import type { AssetImpact, CalendarRow, Confidence, Direction, EventState, Importance, MacroAsset, MacroState, ScheduledEvent, SnapshotKey } from "@/lib/macro/types"
import type { WeeklyOilRelease } from "@/lib/macro/oil-weekly"
import { formatCompactCountdown, formatCountdown, formatDataAge, formatLocalDateTime, formatLocalTime, formatTimeAgo, urgencyFor } from "@/lib/macro/format"
import { formatValue } from "@/lib/macro/taxonomy"
import { EventOddsInline, usePredictionState } from "./PredictionOddsPanel"
import { ExpectationsBlock, GateChip, ScenarioRows } from "./calendar/CalendarRow"

// The calendar (calendar/EconomicCalendar.tsx) owns the strip, the recent results and the empty state since F3;
// this file keeps the data hook, the live event card, the alerts and the weekly oil card.

export type MacroApi = MacroState & { serverTime: string }

export function useMacroState(asset: MacroAsset | null = null) {
  return useQuery<MacroApi>({
    queryKey: ["macro", asset ?? "all"],
    queryFn: async () => {
      const r = await fetch(asset ? `/api/macro?asset=${asset}` : "/api/macro")
      if (!r.ok) throw new Error(`macro ${r.status}`)
      return r.json()
    },
    // Event-paced polling: tight around releases, relaxed otherwise. (SSE push is the follow-up.)
    refetchInterval: (q) => {
      const a = q.state.data?.active
      if (!a) return 15_000
      const s = a.secondsToRelease
      if ((s > 0 && s < 180) || a.phase === "releasing" || a.phase === "released") return 3_000
      if (a.phase === "confirming" && -s < 1800) return 5_000
      return 10_000
    },
    staleTime: 2_000,
    refetchOnWindowFocus: true,
  })
}

// ── primitives ──────────────────────────────────────────────────────────────

// Importance is a weight: luminance, never a hue. The live card frame follows the same rule.
const impLabel: Record<Importance, string> = { low: "LOW", medium: "MEDIUM", high: "HIGH IMPACT", critical: "CRITICAL" }
function impFrame(imp: Importance): { border: string; bg: string } {
  if (imp === "critical") return { border: "color-mix(in srgb, var(--brand, #00FF88) 50%, transparent)", bg: "color-mix(in srgb, var(--brand, #00FF88) 8%, transparent)" }
  if (imp === "high") return { border: "rgba(255,255,255,0.25)", bg: "rgba(255,255,255,0.04)" }
  return { border: "rgba(255,255,255,0.12)", bg: "rgba(255,255,255,0.02)" }
}

// Direction glyph: an arrow in the direction colour (mixed is gray, not amber). Replaces the emoji dots.
function DirGlyph({ d }: { d: Direction }) {
  return (
    <span aria-label={dirText(d).toLowerCase()} className="font-mono font-bold" style={{ color: dirColor(d) }}>
      {d === "bullish" ? "↑" : d === "bearish" ? "↓" : "↔"}
    </span>
  )
}
function dirColor(d: Direction) {
  return d === "bullish" ? GREEN : d === "bearish" ? RED : GRAY
}
function dirText(d: Direction) {
  return d === "bullish" ? "BULLISH" : d === "bearish" ? "BEARISH" : "MIXED"
}
const confText = (c: Confidence) => c.toUpperCase()
const assetLabel: Record<MacroAsset, string> = { BTC: "BTC", GOLD: "GOLD", WTI: "WTI" }

function LiveCountdown({ iso, className, compact }: { iso: string; className?: string; compact?: boolean }) {
  const now = useNow(1000)
  const s = Math.round((new Date(iso).getTime() - now) / 1000)
  if (s <= 0) return <span className={className}>{compact ? "now" : "00:00"}</span>
  return <span className={className}>{compact ? formatCompactCountdown(s) : formatCountdown(s)}</span>
}

function Arrow({ v, flatThr = 0 }: { v: number | null; flatThr?: number }) {
  if (v == null) return <span className="text-white/50">—</span>
  if (v > flatThr) return <span style={{ color: GREEN }}>↑</span>
  if (v < -flatThr) return <span style={{ color: RED }}>↓</span>
  return <span className="text-white/50">→</span>
}


// ── Alerts (compact, recent) ────────────────────────────────────────────────

export function MacroAlerts({ alerts }: { alerts: MacroState["alerts"] | undefined }) {
  const now = useNow(15_000)
  if (!alerts) return null
  const recent = alerts.filter((a) => now - new Date(a.at).getTime() < 30 * 60_000).slice(0, 2)
  if (recent.length === 0) return null
  return (
    <div className="space-y-2">
      {recent.map((a) => {
        const c = a.kind === "release" ? dirColor(a.direction ?? "mixed") : a.kind === "reversal" || a.kind === "conflict" ? RED : AMBER
        return (
          <div key={a.id} role="status" className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: `${c}40`, backgroundColor: `${c}0F` }}>
            {a.kind === "pre_event" ? <CalendarClock className="mt-0.5 size-3.5 shrink-0" style={{ color: c }} /> : a.kind === "release" ? <Zap className="mt-0.5 size-3.5 shrink-0" style={{ color: c }} /> : <ShieldAlert className="mt-0.5 size-3.5 shrink-0" style={{ color: c }} />}
            <span>
              <span className="font-semibold" style={{ color: c }}>{a.title}.</span> <span className="text-white/65">{a.body}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ExpectationNote({ event }: { event: ScheduledEvent }) {
  if (!event.expectationNote) return null
  return <p className="mt-1.5 text-[10px] leading-snug text-white/50">{event.expectationNote}</p>
}

// ── Event card ──────────────────────────────────────────────────────────────

function ImpactRows({ impacts, phaseLabel }: { impacts: AssetImpact[]; phaseLabel: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1.5">{phaseLabel}</div>
      <div className="space-y-1">
        {impacts.map((i) => (
          <div key={i.asset} className="flex items-center gap-3 text-sm">
            <span className="w-12 font-mono font-bold text-white/80">{assetLabel[i.asset]}</span>
            <DirGlyph d={i.direction} />
            {i.conditional ? (
              <span className="text-white/70">
                <span style={{ color: dirColor(i.conditional.ifBelow) }}>{i.conditional.ifBelow === "bullish" ? "↑" : i.conditional.ifBelow === "bearish" ? "↓" : "↔"} {dirText(i.conditional.ifBelow).toLowerCase()}</span>
                <span className="text-white/50"> if below forecast · </span>
                <span style={{ color: dirColor(i.conditional.ifAbove) }}>{i.conditional.ifAbove === "bullish" ? "↑" : i.conditional.ifAbove === "bearish" ? "↓" : "↔"} {dirText(i.conditional.ifAbove).toLowerCase()}</span>
                <span className="text-white/50"> if above</span>
              </span>
            ) : (
              <>
                <span className="font-semibold" style={{ color: dirColor(i.direction) }}>{dirText(i.direction)}</span>
                <span className="ml-auto font-mono text-[11px] text-white/50">{confText(i.confidence)}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}


const CHECK_THR: Record<SnapshotKey, number> = { dxy: 0.1, us2y: 0.02, us10y: 0.02, spx: 0.15, ndx: 0.2, vix: 2, btc: 0.3, gold: 0.2, wti: 0.4 }

// Live event card. Rendered by the calendar in place of the live row; `row` is that row (gate state, market
// expectations). Returns null when no event is live: the calendar's Upcoming group carries the "next" line.
export function MacroEventCard({ state, isLoading, asset, row, lens }: { state: MacroApi | undefined; isLoading: boolean; asset?: MacroAsset | null; row?: CalendarRow | null; lens?: MacroAsset | null }) {
  const predQ = usePredictionState()
  if (isLoading && !state) {
    return <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 animate-pulse h-40" />
  }
  const a = state?.active
  if (!a) return null

  const imp = a.event.importance
  const frame = impFrame(imp)
  const released = a.secondsToRelease <= 0
  const verified = a.release?.status === "verified" && a.release.actual
  const impacts = (verified && a.postImpact) || a.preMap
  const conf = a.confirmation
  const phaseLabel = !released ? "EXPECTED IMPACT" : verified ? (conf && conf.status !== "awaiting" ? `INITIAL LIKELY IMPACT · ${conf.status.toUpperCase()}` : "INITIAL LIKELY IMPACT") : "EXPECTED IMPACT (AWAITING DATA)"
  const dataAge = a.dataAgeMs ?? state?.market.dataAgeMs ?? null
  const fmt = (v: number | null) => formatValue(v, a.def.unit, a.def.decimals)
  const confColor = conf?.status === "confirmed" ? GREEN : conf?.status === "reversing" || conf?.status === "unconfirmed" ? RED : AMBER

  return (
    <div className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: frame.border, background: `linear-gradient(135deg, ${frame.bg} 0%, rgb(var(--surface-rgb, 10 14 23) / 0.75) 60%)` }}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Chip variant={released ? "phase" : "importance"} value={released ? "releasing" : imp} icon={released ? Zap : undefined}>
          {released ? `${a.event.title} released` : impLabel[imp]}
        </Chip>
        {!released && <span className="text-sm font-bold text-white">{a.event.title}</span>}
        <span className="text-[11px] text-white/50">{formatLocalTime(a.event.time)}</span>
        {row && released && <GateChip gate={row.firstMoveGate} />}
        <span className="ml-auto text-[10px] font-mono text-white/50" title="Age of the newest market data point behind this analysis">
          DATA AGE: {formatDataAge(dataAge)}
        </span>
      </div>

      {!released ? (
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-start">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">Release in</div>
            <LiveCountdown iso={a.event.time} className="font-mono text-3xl sm:text-4xl font-black tabular-nums text-white" />
            <div className="mt-2 grid grid-cols-2 gap-x-4 text-xs">
              <span className="text-white/50">Forecast</span>
              <span className="font-mono text-white/85">
                {a.event.forecastRaw ?? "—"}
                {a.event.forecastSource && <span className="ml-1 text-[10px] font-sans text-white/50">{a.event.forecastSource}</span>}
              </span>
              <span className="text-white/50">Previous</span>
              <span className="font-mono text-white/85">
                {a.event.previousRaw ?? "—"}
                {a.event.previousSource && <span className="ml-1 text-[10px] font-sans text-white/50">{a.event.previousSource}</span>}
              </span>
            </div>
            <ExpectationNote event={a.event} />
          </div>
          <div className="space-y-3">
            <ImpactRows impacts={impacts} phaseLabel={phaseLabel} />
            <p className="text-xs text-white/55 leading-snug">{a.def.logic}</p>
            {row && (row.market || row.fed) && <ExpectationsBlock r={row} />}
            <ScenarioRows guide={a.scenarios} released={false} focus={lens ?? asset ?? null} />
            <EventOddsInline defId={a.def.id} state={predQ.data} asset={asset} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "Actual", v: verified ? fmt(a.release!.actual!.value) : null, strong: true, src: verified ? (a.release!.actual!.provider === "NEWS" ? "news-reported, provisional" : a.release!.actual!.provider === "FXSTREET" ? "FXStreet calendar" : a.release!.actual!.provider) : null },
              { k: "Forecast", v: a.event.forecastRaw ?? fmt(a.event.forecast), src: a.event.forecastSource },
              { k: "Previous", v: a.event.previousRaw ?? fmt(a.event.previous), src: a.event.previousSource },
            ].map((x) => (
              <div key={x.k} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-white/50">{x.k}</div>
                <div className={`font-mono font-bold ${x.strong ? "text-lg text-white" : "text-sm text-white/75"}`}>{x.v ?? (x.strong ? "…" : "—")}</div>
                {"src" in x && x.src && <div className="text-[10px] text-white/50">{x.src}</div>}
              </div>
            ))}
          </div>
          <ExpectationNote event={a.event} />
          {row && (row.market || row.fed || row.zScore != null) && <ExpectationsBlock r={row} />}
          <EventOddsInline defId={a.def.id} state={predQ.data} asset={asset} />

          {verified ? (
            <div className="text-sm font-semibold" style={{ color: (a.surprise?.score ?? 0) === 0 ? AMBER : "white" }}>
              {a.surprise?.label}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: a.release?.status === "conflict" ? RED : AMBER }}>
              <ShieldAlert className="size-4" />
              {a.release?.status === "conflict" ? "DATA CONFLICT — SIGNAL PAUSED" : "AWAITING VERIFIED DATA"}
              <span className="font-normal text-white/50 text-xs">· {a.release?.note ?? "checking primary source"}</span>
            </div>
          )}

          <ScenarioRows guide={a.scenarios} released focus={lens ?? asset ?? null} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ImpactRows impacts={impacts} phaseLabel={phaseLabel} />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1.5">Market confirmation</div>
              {conf && conf.checks.some((k) => k.observedPct != null) ? (
                <>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
                    {conf.checks.slice(0, 6).map((k) => (
                      <div key={k.key} className="flex items-center justify-between">
                        <span className="text-white/55">{k.name}</span>
                        <span className="font-mono">
                          <Arrow v={k.observedPct} flatThr={CHECK_THR[k.key]} />
                          {k.agrees === false && <span className="ml-1 text-[10px]" style={{ color: RED }}>✗</span>}
                          {k.agrees === true && <span className="ml-1 text-[10px]" style={{ color: GREEN }}>✓</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-white/50">CONFIRMATION:</span>
                    <span className="font-mono font-bold" style={{ color: confColor }}>{conf.pct == null ? "—" : `${conf.pct}%`}</span>
                    <span className="rounded px-1.5 py-px text-[10px] font-bold" style={{ color: confColor, backgroundColor: `${confColor}18` }}>{conf.status.toUpperCase()}</span>
                    {conf.basedOn && <span className="text-white/60">@ {conf.basedOn}</span>}
                  </div>
                  <p className="mt-1 text-[11px] text-white/55 leading-snug">{conf.summary}</p>
                </>
              ) : (
                <div className="text-xs text-white/50">Awaiting first reaction sample (30s)…</div>
              )}
            </div>
          </div>

          {conf && (
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(conf.perAsset) as MacroAsset[]).map((k) => {
                const pa = conf.perAsset[k]
                const col = pa.status === "confirmed" ? GREEN : pa.status === "reversing" || pa.status === "unconfirmed" ? RED : pa.status === "fading" || pa.status === "conflicted" ? AMBER : GRAY
                return (
                  <span key={k} title={pa.note} className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ color: col, backgroundColor: `${col}15`, border: `1px solid ${col}30` }}>
                    {assetLabel[k]} {pa.status === "reversing" ? "REACTION REVERSING" : pa.status.toUpperCase()}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}

      <details className="group mt-4">
        <summary className="flex cursor-pointer items-center gap-1 text-[11px] text-white/50 hover:text-white/70 list-none">
          <ChevronDown className="size-3 transition-transform group-open:rotate-180" /> Details: transmission, regime, reaction table, history, sources
        </summary>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">Transmission channels</div>
            <div className="text-white/70">{(impacts[0]?.channel ?? []).join(" → ") || "No directional transmission until data or market reaction arrives"}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 pt-1">Regime</div>
            <div className="text-white/70">{state?.regime.summary}</div>
            <div className="text-white/50">
              {impacts.map((i) => (
                <div key={i.asset}>
                  <span className="font-mono text-white/70">{assetLabel[i.asset]}</span>: {i.reason} · horizon {i.horizon.immediate}/{i.horizon.shortTerm}/{i.horizon.swing} (0–15m / 15m–4h / 1–5d)
                </div>
              ))}
            </div>
            {a.historical && (
              <>
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 pt-1">Historical reaction ({a.historical.segment}, n={a.historical.sampleSize})</div>
                <div className="text-white/60">
                  {(Object.keys(a.historical.medians) as MacroAsset[]).map((k) => (
                    <div key={k}>
                      <span className="font-mono text-white/75">{assetLabel[k]}</span>:{" "}
                      {Object.entries(a.historical!.medians[k]).map(([l, v]) => `${l} median ${v >= 0 ? "+" : ""}${v}%`).join(" · ") || "no samples"}
                    </div>
                  ))}
                  <div className="text-white/50 mt-1">Past behaviour in similar conditions; not a prediction.</div>
                </div>
              </>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">Reaction monitor</div>
            {a.reactions.length ? (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-white/50">
                    <th className="text-left font-medium">t+</th>
                    {(["btc", "gold", "wti", "dxy", "us2y", "us10y", "ndx"] as SnapshotKey[]).map((k) => (
                      <th key={k} className="text-right font-medium uppercase">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.reactions.map((r) => (
                    <tr key={r.label} className="font-mono">
                      <td className="text-white/55">{r.label}</td>
                      {(["btc", "gold", "wti", "dxy", "us2y", "us10y", "ndx"] as SnapshotKey[]).map((k) => {
                        const v = r.changesPct[k]
                        return (
                          <td key={k} className="text-right" style={{ color: v == null ? GRAY : v > 0 ? GREEN : v < 0 ? RED : GRAY }}>
                            {v == null ? "—" : `${v >= 0 ? "+" : ""}${v}${k === "us2y" || k === "us10y" ? "" : "%"}`}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-white/50">No samples yet.</div>
            )}
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 pt-1">Verification</div>
            <div className="text-white/55">
              {a.release ? a.release.note : "Not yet released"}
              {a.release?.actual && (
                <> · retrieved {formatLocalTime(a.release.actual.retrievedAt)} · revision: {a.release.actual.revisionStatus}</>
              )}
            </div>
            <div className="text-white/50">
              Calendar: {a.event.source === "fxstreet" ? "FXStreet (consensus/previous)" : a.event.source === "faireconomy" ? "Fair Economy (consensus/previous)" : "scheduled"} · retrieved {formatLocalTime(a.event.retrievedAt)} · event time shown in your local zone
            </div>
            {state?.sources && (
              <div className="text-white/50">
                {state.sources.filter((s) => s.provider !== "NONE").map((s) => `${s.provider}: ${s.enabled ? "on" : "off"}`).join(" · ")}
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  )
}

export type { EventState }

// ── Weekly oil inventories (WTI lens): latest print + countdown to the next ──

function inventoryTone(v: number) {
  // EIA sign convention: negative = draw (less crude in storage, bullish WTI); positive = build (bearish).
  return v < 0 ? { color: GREEN, label: "DRAW" } : v > 0 ? { color: RED, label: "BUILD" } : { color: GRAY, label: "FLAT" }
}

const magnitudeLabel: Record<string, string> = { inline: "in line", small: "small surprise", large: "big surprise", extreme: "extreme surprise" }

function WeeklyOilRow({ r, primary, now }: { r: WeeklyOilRelease; primary: boolean; now: number }) {
  const last = r.last
  const next = r.next
  const secs = next ? Math.round((new Date(next.time).getTime() - now) / 1000) : null
  const u = secs == null ? "normal" : urgencyFor(secs)
  const cdTone = chipLook("urgency", u).color
  const tone = last ? inventoryTone(last.actual) : null
  const surprise = last && last.forecast != null ? last.actual - last.forecast : null
  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${primary ? "py-3" : "py-2.5"}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <ImportanceDot importance={r.importance} />
          <span className={`font-semibold text-white/85 ${primary ? "text-sm" : "text-xs"}`}>{r.title}</span>
          <span className="text-[10px] text-white/50">{r.cadence}</span>
        </div>
        {last && tone ? (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={`font-mono font-black ${primary ? "text-2xl" : "text-lg"}`} style={{ color: tone.color }}>{last.actualRaw}</span>
            <span className="rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide" style={{ color: tone.color, backgroundColor: `${tone.color}18` }}>{tone.label}</span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-white/50" title={formatLocalDateTime(last.eventTime)}>
              <Clock className="size-3" />
              {formatTimeAgo((now - new Date(last.eventTime).getTime()) / 1000)}
            </span>
            {last.source === "calendar" && <span className="text-[10px] text-white/50" title="Taken from the calendar's previous field; release time inferred from the weekly cadence">(prior per calendar)</span>}
          </div>
        ) : (
          <div className="mt-1 text-xs text-white/50">No print recorded yet.</div>
        )}
        {last && (last.forecast != null || last.previous != null) && (
          <div className="mt-0.5 font-mono text-[10px] text-white/50">
            {last.forecast != null && <span>vs forecast {formatValue(last.forecast, "mb", 1)}</span>}
            {surprise != null && <span style={{ color: surprise < 0 ? GREEN : surprise > 0 ? RED : GRAY }}> ({surprise < 0 ? "" : "+"}{surprise.toFixed(1)}M{last.magnitude ? `, ${magnitudeLabel[last.magnitude] ?? last.magnitude}` : ""})</span>}
            {last.previous != null && <span> · prior {formatValue(last.previous, "mb", 1)}</span>}
          </div>
        )}
      </div>
      <div className="sm:text-right">
        {next && secs != null ? (
          <>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">Next release</div>
            <div className={`font-mono font-black tabular-nums ${primary ? "text-2xl" : "text-lg"}`} style={{ color: cdTone }}>
              {secs <= 0 ? "releasing now" : <LiveCountdown iso={next.time} />}
            </div>
            <div className="text-[11px] text-white/55">{formatLocalDateTime(next.time)} · {formatLocalTime(next.time)}</div>
            {(next.forecastRaw || next.previousRaw) && (
              <div className="font-mono text-[10px] text-white/50" title={next.expectationNote ?? undefined}>
                {next.forecastRaw ? `forecast ${next.forecastRaw}${next.forecastSource ? "*" : ""}` : "no consensus yet"}
                {next.previousRaw ? ` · prior ${next.previousRaw}` : ""}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-white/50">Next release not on the calendar yet.</div>
        )}
      </div>
    </div>
  )
}

export function WeeklyOilCard({ releases }: { releases: WeeklyOilRelease[] | undefined }) {
  const now = useNow(15_000)
  if (!releases || releases.length === 0) return null
  const eia = releases.find((r) => r.defId === "eia_crude")
  const api = releases.find((r) => r.defId === "api_crude")
  if (!eia && !api) return null
  return (
    <div id="sec-oil-weekly" className={cn(SURFACE, "px-4 py-2")}>
      <div className="flex items-center gap-2 mb-1">
        <Droplets className="size-3.5" style={{ color: "var(--brand, #9CA3AF)" }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--brand, #9CA3AF)" }}>Weekly US crude inventories</span>
        <span className="text-[10px] text-white/50">draw = bullish WTI · build = bearish</span>
      </div>
      <div className="divide-y divide-white/[0.06]">
        {eia && <WeeklyOilRow r={eia} primary now={now} />}
        {api && <WeeklyOilRow r={api} primary={false} now={now} />}
      </div>
    </div>
  )
}
