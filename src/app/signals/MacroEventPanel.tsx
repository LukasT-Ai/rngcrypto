"use client"

import React, { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarClock, ChevronDown, Radio, ShieldAlert, Zap } from "lucide-react"
import type { AssetImpact, Confidence, Direction, EventState, Importance, MacroAsset, MacroScores, MacroState, ScheduledEvent, SnapshotKey } from "@/lib/macro/types"
import { formatCompactCountdown, formatCountdown, formatDataAge, formatLocalDateTime, formatLocalTime, urgencyFor } from "@/lib/macro/format"
import { formatValue } from "@/lib/macro/taxonomy"

type MacroApi = MacroState & { serverTime: string }

export function useMacroState() {
  return useQuery<MacroApi>({
    queryKey: ["macro"],
    queryFn: async () => {
      const r = await fetch("/api/macro")
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

const GREEN = "#00FF88"
const RED = "#FF3B5C"
const AMBER = "#F59E0B"
const GRAY = "#9CA3AF"

const impColor: Record<Importance, string> = { low: GRAY, medium: "#60A5FA", high: AMBER, critical: RED }
const impLabel: Record<Importance, string> = { low: "LOW", medium: "MEDIUM", high: "HIGH IMPACT", critical: "CRITICAL" }

function glyph(d: Direction) {
  return d === "bullish" ? "🟢" : d === "bearish" ? "🔴" : "🟡"
}
function dirColor(d: Direction) {
  return d === "bullish" ? GREEN : d === "bearish" ? RED : AMBER
}
function dirText(d: Direction) {
  return d === "bullish" ? "BULLISH" : d === "bearish" ? "BEARISH" : "MIXED"
}
const confText = (c: Confidence) => c.toUpperCase()
const assetLabel: Record<MacroAsset, string> = { BTC: "BTC", GOLD: "GOLD", WTI: "WTI" }

export function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs)
    return () => clearInterval(id)
  }, [tickMs])
  return now
}

function LiveCountdown({ iso, className, compact }: { iso: string; className?: string; compact?: boolean }) {
  const now = useNow(1000)
  const s = Math.round((new Date(iso).getTime() - now) / 1000)
  if (s <= 0) return <span className={className}>{compact ? "now" : "00:00"}</span>
  return <span className={className}>{compact ? formatCompactCountdown(s) : formatCountdown(s)}</span>
}

function Arrow({ v, flatThr = 0 }: { v: number | null; flatThr?: number }) {
  if (v == null) return <span className="text-white/25">—</span>
  if (v > flatThr) return <span style={{ color: GREEN }}>↑</span>
  if (v < -flatThr) return <span style={{ color: RED }}>↓</span>
  return <span className="text-white/40">→</span>
}

// ── Next events strip ───────────────────────────────────────────────────────

export function NextEventsStrip({ events }: { events: ScheduledEvent[] | undefined }) {
  const now = useNow(1000)
  if (!events || events.length === 0) return null
  const list = events.filter((e) => new Date(e.time).getTime() > now - 60_000).slice(0, 6)
  return (
    <div id="sec-macro-strip" className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-0">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--brand, #9CA3AF)" }}>Next events</span>
      {list.map((e) => {
        const s = Math.round((new Date(e.time).getTime() - now) / 1000)
        const u = urgencyFor(s)
        const c = impColor[e.importance]
        const tone =
          u === "now" ? "text-[#FF3B5C] font-black" : u === "urgent" ? "text-[#FF3B5C] font-bold" : u === "strong" ? "text-[#F59E0B] font-semibold" : u === "highlight" ? "text-white/85" : "text-white/50"
        return (
          <span
            key={e.id}
            title={`${formatLocalDateTime(e.time)} · ${impLabel[e.importance]}${e.forecastRaw ? ` · forecast ${e.forecastRaw}` : ""}`}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${tone}`}
            style={{ borderColor: `${c}${u === "normal" ? "25" : "55"}`, backgroundColor: u === "urgent" || u === "now" ? `${c}14` : "transparent" }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: c }} />
            {e.title}
            <span className="font-mono">{s <= 0 ? "now" : formatCompactCountdown(s)}</span>
          </span>
        )
      })}
    </div>
  )
}

// ── Alerts (compact, recent) ────────────────────────────────────────────────

export function MacroAlerts({ alerts }: { alerts: MacroState["alerts"] | undefined }) {
  if (!alerts) return null
  const recent = alerts.filter((a) => Date.now() - new Date(a.at).getTime() < 30 * 60_000).slice(0, 2)
  if (recent.length === 0) return null
  return (
    <div className="space-y-2">
      {recent.map((a) => {
        const c = a.kind === "release" ? dirColor(a.direction ?? "mixed") : a.kind === "reversal" || a.kind === "conflict" ? RED : AMBER
        return (
          <div key={a.id} className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: `${c}40`, backgroundColor: `${c}0F` }}>
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

// ── Event card ──────────────────────────────────────────────────────────────

function ImpactRows({ impacts, phaseLabel }: { impacts: AssetImpact[]; phaseLabel: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5">{phaseLabel}</div>
      <div className="space-y-1">
        {impacts.map((i) => (
          <div key={i.asset} className="flex items-center gap-3 text-sm">
            <span className="w-12 font-mono font-bold text-white/80">{assetLabel[i.asset]}</span>
            <span>{glyph(i.direction)}</span>
            {i.conditional ? (
              <span className="text-white/70">
                <span style={{ color: dirColor(i.conditional.ifBelow) }}>{i.conditional.ifBelow === "bullish" ? "↑" : i.conditional.ifBelow === "bearish" ? "↓" : "↔"} {dirText(i.conditional.ifBelow).toLowerCase()}</span>
                <span className="text-white/40"> if below forecast · </span>
                <span style={{ color: dirColor(i.conditional.ifAbove) }}>{i.conditional.ifAbove === "bullish" ? "↑" : i.conditional.ifAbove === "bearish" ? "↓" : "↔"} {dirText(i.conditional.ifAbove).toLowerCase()}</span>
                <span className="text-white/40"> if above</span>
              </span>
            ) : (
              <>
                <span className="font-semibold" style={{ color: dirColor(i.direction) }}>{dirText(i.direction)}</span>
                <span className="ml-auto font-mono text-[11px] text-white/45">{confText(i.confidence)}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const CHECK_THR: Record<SnapshotKey, number> = { dxy: 0.1, us2y: 0.02, us10y: 0.02, spx: 0.15, ndx: 0.2, vix: 2, btc: 0.3, gold: 0.2, wti: 0.4 }

export function MacroEventCard({ state, isLoading }: { state: MacroApi | undefined; isLoading: boolean }) {
  const now = useNow(1000)
  if (isLoading && !state) {
    return <div id="sec-macro" className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 animate-pulse h-40" />
  }
  const a = state?.active
  if (!a) {
    const next = state?.upcoming?.[0]
    return (
      <div id="sec-macro" className="rounded-2xl border border-white/[0.08] bg-[rgb(var(--surface-rgb,10_14_23)/0.5)] backdrop-blur-md px-5 py-4 flex flex-wrap items-center gap-3 text-sm">
        <Radio className="size-4 text-[#9CA3AF]/80" />
        <span className="text-white/50">No scheduled release in the next two hours.</span>
        {next && (
          <span className="text-white/70">
            Next: <span className="font-semibold">{next.title}</span> <span className="text-white/40">{formatLocalDateTime(next.time)}</span> · <LiveCountdown iso={next.time} compact className="font-mono" />
          </span>
        )}
        {state?.regime && <span className="ml-auto text-[11px] text-white/35">{state.regime.summary}</span>}
      </div>
    )
  }

  const imp = a.event.importance
  const c = impColor[imp]
  const released = a.secondsToRelease <= 0
  const verified = a.release?.status === "verified" && a.release.actual
  const impacts = (verified && a.postImpact) || a.preMap
  const conf = a.confirmation
  const phaseLabel = !released ? "EXPECTED IMPACT" : verified ? (conf && conf.status !== "awaiting" ? `INITIAL LIKELY IMPACT · ${conf.status.toUpperCase()}` : "INITIAL LIKELY IMPACT") : "EXPECTED IMPACT (AWAITING DATA)"
  const dataAge = a.dataAgeMs ?? state?.market.dataAgeMs ?? null
  const fmt = (v: number | null) => formatValue(v, a.def.unit, a.def.decimals)
  const confColor = conf?.status === "confirmed" ? GREEN : conf?.status === "reversing" || conf?.status === "unconfirmed" ? RED : AMBER

  return (
    <div id="sec-macro" className="rounded-2xl border p-5 sm:p-6 backdrop-blur-xl" style={{ borderColor: `${c}50`, background: `linear-gradient(135deg, ${c}16 0%, rgb(var(--surface-rgb, 10 14 23) / 0.6) 60%)` }}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="rounded-md px-2 py-0.5 text-[10px] font-black tracking-wider" style={{ backgroundColor: `${c}22`, color: c }}>
          {released ? "⚡ " : "🔴 "}
          {released ? `${a.event.title.toUpperCase()} RELEASED` : impLabel[imp]}
        </span>
        {!released && <span className="text-sm font-bold text-white">{a.event.title}</span>}
        <span className="text-[11px] text-white/40">{formatLocalTime(a.event.time)}</span>
        <span className="ml-auto text-[10px] font-mono text-white/35" title="Age of the newest market data point behind this analysis">
          DATA AGE: {formatDataAge(dataAge)}
        </span>
      </div>

      {!released ? (
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-start">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Release in</div>
            <LiveCountdown iso={a.event.time} className="font-mono text-4xl font-black tabular-nums text-white" />
            <div className="mt-2 grid grid-cols-2 gap-x-4 text-xs">
              <span className="text-white/40">Forecast</span>
              <span className="font-mono text-white/85">{a.event.forecastRaw ?? "—"}</span>
              <span className="text-white/40">Previous</span>
              <span className="font-mono text-white/85">{a.event.previousRaw ?? "—"}</span>
            </div>
          </div>
          <div className="space-y-3">
            <ImpactRows impacts={impacts} phaseLabel={phaseLabel} />
            <p className="text-xs text-white/55 leading-snug">{a.def.logic}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "Actual", v: verified ? fmt(a.release!.actual!.value) : null, strong: true },
              { k: "Forecast", v: a.event.forecastRaw ?? fmt(a.event.forecast) },
              { k: "Previous", v: a.event.previousRaw ?? fmt(a.event.previous) },
            ].map((x) => (
              <div key={x.k} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-white/35">{x.k}</div>
                <div className={`font-mono font-bold ${x.strong ? "text-lg text-white" : "text-sm text-white/75"}`}>{x.v ?? (x.strong ? "…" : "—")}</div>
              </div>
            ))}
          </div>

          {verified ? (
            <div className="text-sm font-semibold" style={{ color: (a.surprise?.score ?? 0) === 0 ? AMBER : "white" }}>
              {a.surprise?.label}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: a.release?.status === "conflict" ? RED : AMBER }}>
              <ShieldAlert className="size-4" />
              {a.release?.status === "conflict" ? "⚠️ DATA CONFLICT — SIGNAL PAUSED" : "AWAITING VERIFIED DATA"}
              <span className="font-normal text-white/45 text-xs">· {a.release?.note ?? "checking primary source"}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ImpactRows impacts={impacts} phaseLabel={phaseLabel} />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5">Market confirmation</div>
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
                    <span className="text-white/40">CONFIRMATION:</span>
                    <span className="font-mono font-bold" style={{ color: confColor }}>{conf.pct == null ? "—" : `${conf.pct}%`}</span>
                    <span className="rounded px-1.5 py-px text-[10px] font-bold" style={{ color: confColor, backgroundColor: `${confColor}18` }}>{conf.status.toUpperCase()}</span>
                    {conf.basedOn && <span className="text-[#9CA3AF]/80">@ {conf.basedOn}</span>}
                  </div>
                  <p className="mt-1 text-[11px] text-white/55 leading-snug">{conf.summary}</p>
                </>
              ) : (
                <div className="text-xs text-white/40">Awaiting first reaction sample (30s)…</div>
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
                    {assetLabel[k]} {pa.status === "reversing" ? "⚠️ REACTION REVERSING" : pa.status.toUpperCase()}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}

      <details className="group mt-4">
        <summary className="flex cursor-pointer items-center gap-1 text-[11px] text-white/40 hover:text-white/70 list-none">
          <ChevronDown className="size-3 transition-transform group-open:rotate-180" /> Details: transmission, regime, reaction table, history, sources
        </summary>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Transmission channels</div>
            <div className="text-white/70">{(impacts[0]?.channel ?? []).join(" → ") || "No directional transmission until data or market reaction arrives"}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 pt-1">Regime</div>
            <div className="text-white/70">{state?.regime.summary}</div>
            <div className="text-white/45">
              {impacts.map((i) => (
                <div key={i.asset}>
                  <span className="font-mono text-white/70">{assetLabel[i.asset]}</span>: {i.reason} · horizon {i.horizon.immediate}/{i.horizon.shortTerm}/{i.horizon.swing} (0–15m / 15m–4h / 1–5d)
                </div>
              ))}
            </div>
            {a.historical && (
              <>
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 pt-1">Historical reaction ({a.historical.segment}, n={a.historical.sampleSize})</div>
                <div className="text-white/60">
                  {(Object.keys(a.historical.medians) as MacroAsset[]).map((k) => (
                    <div key={k}>
                      <span className="font-mono text-white/75">{assetLabel[k]}</span>:{" "}
                      {Object.entries(a.historical!.medians[k]).map(([l, v]) => `${l} median ${v >= 0 ? "+" : ""}${v}%`).join(" · ") || "no samples"}
                    </div>
                  ))}
                  <div className="text-white/35 mt-1">Past behaviour in similar conditions; not a prediction.</div>
                </div>
              </>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Reaction monitor</div>
            {a.reactions.length ? (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-white/35">
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
              <div className="text-white/40">No samples yet.</div>
            )}
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 pt-1">Verification</div>
            <div className="text-white/55">
              {a.release ? a.release.note : "Not yet released"}
              {a.release?.actual && (
                <> · retrieved {formatLocalTime(a.release.actual.retrievedAt)} · revision: {a.release.actual.revisionStatus}</>
              )}
            </div>
            <div className="text-white/35">
              Calendar: {a.event.source === "faireconomy" ? "Fair Economy (consensus/previous)" : "scheduled"} · retrieved {formatLocalTime(a.event.retrievedAt)} · event time shown in your local zone
            </div>
            {state?.sources && (
              <div className="text-white/35">
                {state.sources.filter((s) => s.provider !== "NONE").map((s) => `${s.provider}: ${s.enabled ? "on" : "off"}`).join(" · ")}
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  )
}

// ── Score strip: technical vs macro vs event vs confirmation vs overall ──────

export function MacroScoreStrip({ scores, confidence, bias }: { scores: MacroScores | null | undefined; confidence: number; bias: "LONG" | "SHORT" | "WAIT" }) {
  if (!scores) return null
  const overall = bias === "WAIT" ? 0 : (confidence - 50) * 2 * (bias === "LONG" ? 1 : -1)
  const cell = (k: string, v: number, w?: number) => (
    <div key={k} className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-white/35">{k}</span>
      <span className="font-mono text-xs font-bold" style={{ color: v > 10 ? GREEN : v < -10 ? RED : "rgba(255,255,255,0.6)" }}>
        {v > 0 ? "+" : ""}{v}
      </span>
      {w != null && <span className="text-[9px] text-white/25">({Math.round(w * 100)}%)</span>}
    </div>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border bg-[rgb(var(--surface-rgb,10_14_23)/0.45)] backdrop-blur-md px-3 py-2" style={{ borderColor: "color-mix(in srgb, var(--brand, #9CA3AF) 30%, transparent)" }}>
      {cell("Technical", Math.round(overall))}
      {cell("Macro", scores.macro, scores.weights.macro)}
      {cell("Event", scores.event, scores.weights.event)}
      {cell("Confirmation", scores.confirmation, scores.weights.confirmation)}
      <span className="ml-auto text-[10px] text-[#9CA3AF]/80">{scores.note}</span>
    </div>
  )
}

export type { EventState }
