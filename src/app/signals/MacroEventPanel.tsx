"use client"

import React, { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarClock, CheckCircle2, ChevronDown, Clock, Droplets, Radio, ShieldAlert, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { AMBER, BRAND, Chip, GRAY, GREEN, ImportanceDot, RED, SURFACE, Tip, Toggle, chipLook, useNow } from "./shared"
import type { AssetImpact, CalendarRow, Confidence, Direction, EventState, Importance, MacroAsset, MacroState, ScheduledEvent, SnapshotKey } from "@/lib/macro/types"
import type { ScenarioGuide as ScenarioGuideData } from "@/lib/macro/scenarios"
import type { WeeklyOilRelease } from "@/lib/macro/oil-weekly"
import { formatCompactCountdown, formatCountdown, formatDataAge, formatLocalDateTime, formatLocalTime, formatTimeAgo, urgencyFor } from "@/lib/macro/format"
import { formatValue } from "@/lib/macro/taxonomy"
import { EventOddsInline, usePredictionState } from "./PredictionOddsPanel"

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

// ── Next events strip ───────────────────────────────────────────────────────

export function NextEventsStrip({ events }: { events: ScheduledEvent[] | undefined }) {
  const now = useNow(15_000)
  if (!events || events.length === 0) return null
  const list = events.filter((e) => new Date(e.time).getTime() > now - 60_000).slice(0, 6)
  return (
    <div id="sec-macro-strip" className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-0">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--brand, #9CA3AF)" }}>Next events</span>
      {list.map((e) => {
        const s = Math.round((new Date(e.time).getTime() - now) / 1000)
        const u = urgencyFor(s)
        const look = chipLook("urgency", u)
        return (
          <Tip
            key={e.id}
            content={`${formatLocalDateTime(e.time)} · ${impLabel[e.importance]}${e.forecastRaw ? ` · forecast ${e.forecastRaw}${e.forecastSource ? ` (${e.forecastSource})` : ""}` : ""}${e.previousRaw ? ` · previous ${e.previousRaw}` : ""}${e.expectationNote ? ` · ${e.expectationNote}` : ""}`}
          >
            <span className={cn("shrink-0 inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[11px]", look.weight)} style={{ color: look.color }}>
              <ImportanceDot importance={e.importance} />
              {e.title}
              <LiveCountdown iso={e.time} compact className="font-mono tabular-nums" />
              {(e.forecastRaw || e.previousRaw) && (
                <span className="font-mono text-[10px] text-white/50">
                  {e.forecastRaw ? `f ${e.forecastRaw}${e.forecastSource ? "~" : ""}` : "f —"}
                  {e.previousRaw ? ` · p ${e.previousRaw}` : ""}
                </span>
              )}
            </span>
          </Tip>
        )
      })}
    </div>
  )
}

// ── Economic calendar table: last 7d with actuals, next 14d with consensus ──

const kindTag: Partial<Record<CalendarRow["kind"], string>> = {
  housing: "housing",
  inflation: "inflation",
  labor_strength: "labor",
  labor_weakness: "labor",
  wages: "wages",
  growth: "growth",
  policy_rate: "fed",
  fed_communication: "fed",
  oil_inventory: "oil",
  oil_product_inventory: "oil",
  oil_production: "oil",
  sentiment: "sentiment",
  auction: "treasury",
}

const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(iso))
const timeLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso))

export function EconomicCalendar({ rows, isLoading }: { rows: CalendarRow[] | undefined; isLoading?: boolean }) {
  const now = useNow(15_000)
  const [showPast, setShowPast] = useState(true)
  const [showLow, setShowLow] = useState(false)
  // Grouping is rebuilt only when the rows or the filters change, not on every 15s urgency tick.
  const groups = useMemo(() => {
    const out: { day: string; rows: CalendarRow[] }[] = []
    for (const r of rows ?? []) {
      if (!(showPast || !r.released) || !(showLow || r.importance !== "low")) continue
      const day = dayLabel(r.time)
      const g = out[out.length - 1]
      if (g && g.day === day) g.rows.push(r)
      else out.push({ day, rows: [r] })
    }
    return out
  }, [rows, showPast, showLow])
  if (!rows || rows.length === 0) {
    if (!isLoading) return null
    return (
      <div className={cn(SURFACE, "px-3 py-3 space-y-2")} aria-busy="true" aria-label="Loading economic calendar">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-5 rounded bg-white/[0.04] animate-pulse" />
        ))}
      </div>
    )
  }
  const pastCount = rows.filter((r) => r.released).length
  const lowCount = rows.filter((r) => r.importance === "low").length
  const cell = "px-2 py-1 font-mono text-[11px] tabular-nums whitespace-nowrap"
  return (
    <div id="sec-calendar" className={cn(SURFACE, "bg-[rgb(var(--surface-rgb,10_14_23)/0.6)]")}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <CalendarClock className="size-3.5" style={{ color: "var(--brand, #9CA3AF)" }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--brand, #9CA3AF)" }}>Economic calendar</span>
        <span className="text-[11px] text-white/50">last 7d with actuals · next 14d with consensus · US, ECB, BoE, BoJ, China</span>
        <span className="ml-auto inline-flex items-center gap-1">
          {lowCount > 0 && (
            <Toggle pressed={showLow} onClick={() => setShowLow((v) => !v)}>
              low impact ({lowCount})
            </Toggle>
          )}
          {pastCount > 0 && (
            <Toggle pressed={showPast} onClick={() => setShowPast((v) => !v)}>
              released ({pastCount})
            </Toggle>
          )}
        </span>
      </div>
      <div className="max-h-[28rem] overflow-auto border-t border-white/[0.05]">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-[rgb(var(--surface-rgb,10_14_23))] text-[10px] uppercase tracking-[0.08em] text-white/50">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Time</th>
              <th className="px-2 py-1.5 text-left font-semibold">Release</th>
              <th className="px-2 py-1.5 text-right font-semibold">Actual</th>
              <th className="px-2 py-1.5 text-right font-semibold">Forecast</th>
              <th className="px-2 py-1.5 text-right font-semibold">Previous</th>
              <th className="px-2 py-1.5 text-left font-semibold">Read</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g.day}>
                <tr>
                  <td colSpan={6} className="bg-white/[0.03] px-2 py-1 text-[11px] font-semibold text-white/60">{g.day}</td>
                </tr>
                {g.rows.map((r) => {
                  const s = Math.round((new Date(r.time).getTime() - now) / 1000)
                  const u = r.released ? "normal" : urgencyFor(s)
                  const look = chipLook("urgency", u)
                  const hot = !r.released && (u === "now" || u === "urgent" || u === "strong")
                  const tag = kindTag[r.kind]
                  const text = r.kind === "fed_communication" || r.kind === "auction"
                  return (
                    <tr key={r.id} className={cn("border-t border-white/[0.04] hover:bg-white/[0.04]", hot && "bg-white/[0.03]", r.released ? "text-white/60" : "text-white/80")} title={formatLocalDateTime(r.time)}>
                      <td className={cell}>
                        <span className="text-white/60">{timeLabel(r.time)}</span>
                        {!r.released && (
                          <span className={cn("ml-1.5", look.weight)} style={{ color: look.color }}>
                            {s <= 0 ? "now" : formatCompactCountdown(s)}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-[12px]">
                        <span className="inline-flex items-center gap-1.5">
                          <ImportanceDot importance={r.importance} />
                          {r.country !== "US" && <span className="rounded bg-white/[0.06] px-1 py-px text-[10px] font-bold text-white/60">{r.country === "EMU" ? "EU" : r.country}</span>}
                          <span className={cn("font-sans", r.released ? "text-white/65" : "text-white/85")}>{r.title}</span>
                          {tag && <Chip variant="kind">{tag}</Chip>}
                        </span>
                      </td>
                      <td className={`${cell} text-right ${r.actualRaw ? "font-bold text-white" : "text-white/50"}`}>
                        {r.actualRaw ?? (r.released && !text ? <Chip variant="verification" value="awaiting">awaiting</Chip> : "—")}
                      </td>
                      <td className={`${cell} text-right text-white/70`}>
                        {r.forecastRaw ? (
                          r.forecastSource ? (
                            <Tip content={`Proxy consensus: ${r.forecastSource}`}>
                              <span>~{r.forecastRaw}</span>
                            </Tip>
                          ) : (
                            r.forecastRaw
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${cell} text-right text-white/70`}>{r.previousRaw ?? "—"}</td>
                      <td className="px-2 py-1 text-[12px]">
                        {r.read ? (
                          <span style={{ color: r.score != null && Math.abs(r.score) >= 50 ? AMBER : "rgba(255,255,255,0.7)" }}>{r.read}</span>
                        ) : (
                          <span className="text-white/50">{text ? "market read after release" : r.released ? "" : "pending"}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Recent results: released events stay visible with their outcome ─────────

export function RecentResults({ recent, active }: { recent: EventState[] | undefined; active: EventState | null | undefined }) {
  const now = useNow(15_000)
  const list = useMemo(
    () =>
      [...(active && active.secondsToRelease <= 0 ? [active] : []), ...(recent ?? [])]
        .filter((s) => s.outcome && new Date(s.event.time).getTime() <= now)
        .sort((a, b) => new Date(b.event.time).getTime() - new Date(a.event.time).getTime())
        .slice(0, 6),
    [recent, active, now]
  )
  if (list.length === 0) return null
  return (
    <div id="sec-macro-results" className={cn(SURFACE, "px-3 py-2")}>
      <div className="flex items-center gap-2 mb-1.5">
        <CheckCircle2 className="size-3.5" style={{ color: "var(--brand, #9CA3AF)" }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--brand, #9CA3AF)" }}>Recent results</span>
        <span className="text-[11px] text-white/50">last 24h · impact at latest market sample</span>
      </div>
      <div className="divide-y divide-white/[0.05]">
        {list.map((s) => {
          const o = s.outcome!
          const ago = Math.round((now - new Date(s.event.time).getTime()) / 1000)
          return (
            <div key={s.event.id} className="py-1.5 text-[12px] leading-snug">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <ImportanceDot importance={s.event.importance} />
                <span className="font-semibold text-white/85">{s.event.title}</span>
                <Tip content={formatLocalDateTime(s.event.time)}>
                  <span className="inline-flex items-center gap-1 font-mono text-white/50">
                    <Clock className="size-3" />
                    {formatTimeAgo(ago)}
                  </span>
                </Tip>
                <Chip variant="verification" value={o.status}>
                  {o.status === "verified" ? "verified" : o.status === "awaiting" ? "awaiting data" : o.status === "conflict" ? "data conflict" : "unverified"}
                </Chip>
                <span className="text-white/75">{o.headline}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 pl-3.5 text-white/60">
                <DirGlyph d={o.direction} />
                {o.perAsset.map((p) => (
                  <Tip key={p.asset} content={`expected ${p.expected}${p.status ? ` · ${p.status}` : ""}`}>
                    <span className="font-mono tabular-nums" style={{ color: p.movePct == null ? GRAY : p.movePct > 0 ? GREEN : p.movePct < 0 ? RED : GRAY }}>
                      {assetLabel[p.asset]} {p.movePct == null ? "—" : `${p.movePct >= 0 ? "+" : ""}${p.movePct.toFixed(2)}%`}
                    </span>
                  </Tip>
                ))}
                {o.basedOn ? <span className="text-white/50">@{o.basedOn}</span> : <span className="text-white/50">{o.impact}</span>}
                {o.confirmationNote && <span className="text-white/50">· {o.confirmationNote}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
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

// Scenario guide: what each print range would mean per asset. Shown before the release so the reader knows what to
// watch for, and after it with the actual's band highlighted. `focus` puts the selected ticker's asset first.
function ScenarioRows({ guide, released, focus }: { guide: ScenarioGuideData | null; released: boolean; focus: MacroAsset | null }) {
  if (!guide) return null
  const assets = ([...(focus ? [focus] : []), ...(["BTC", "GOLD", "WTI"] as MacroAsset[]).filter((a) => a !== focus)]) as MacroAsset[]
  const arrow = (d: Direction) => (d === "bullish" ? "↑" : d === "bearish" ? "↓" : "↔")
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1.5">
        {released ? "What each outcome would have meant" : "What each outcome would mean"}
        <span className="ml-1 normal-case tracking-normal text-white/50">· vs {guide.anchorKind === "consensus" ? "consensus" : "prior print"}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <tbody>
            {guide.bands.map((b) => (
              <tr key={b.key} className={b.hit ? "bg-white/[0.06]" : ""} style={b.hit ? { boxShadow: "inset 2px 0 0 var(--brand, #F59E0B)" } : undefined}>
                <td className="py-1 pl-2 pr-3 font-mono whitespace-nowrap text-white/85">{b.range}</td>
                <td className="py-1 pr-3 text-white/55">{b.meaning}</td>
                {assets.map((a) => (
                  <td key={a} className="py-1 pr-2 whitespace-nowrap font-semibold" style={{ color: dirColor(b.directions[a]) }} title={`${assetLabel[a]}: ${dirText(b.directions[a])}`}>
                    <span className="mr-1 font-mono text-[10px] text-white/50">{assetLabel[a]}</span>
                    {arrow(b.directions[a])} {dirText(b.directions[a]).toLowerCase()}
                  </td>
                ))}
                <td className="py-1 pr-2 text-[10px] font-bold whitespace-nowrap" style={{ color: BRAND }}>{b.hit ? "← actual" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-white/50">{guide.note}</p>
    </div>
  )
}

const CHECK_THR: Record<SnapshotKey, number> = { dxy: 0.1, us2y: 0.02, us10y: 0.02, spx: 0.15, ndx: 0.2, vix: 2, btc: 0.3, gold: 0.2, wti: 0.4 }

export function MacroEventCard({ state, isLoading, asset }: { state: MacroApi | undefined; isLoading: boolean; asset?: MacroAsset | null }) {
  const predQ = usePredictionState()
  if (isLoading && !state) {
    return <div id="sec-macro" className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 animate-pulse h-40" />
  }
  const a = state?.active
  if (!a) {
    const next = state?.upcoming?.[0]
    return (
      <div id="sec-macro" className={cn(SURFACE, "rounded-2xl px-5 py-4 flex flex-wrap items-center gap-3 text-sm")}>
        <Radio className="size-4 text-white/60" />
        <span className="text-white/50">No scheduled release in the next two hours.</span>
        {next && (
          <span className="text-white/70">
            Next: <span className="font-semibold">{next.title}</span> <span className="text-white/50">{formatLocalDateTime(next.time)}</span> · <LiveCountdown iso={next.time} compact className="font-mono" />
            {(next.forecastRaw || next.previousRaw) && (
              <span className="ml-2 font-mono text-[11px] text-white/50">
                {next.forecastRaw ? `forecast ${next.forecastRaw}${next.forecastSource ? "*" : ""}` : "no consensus"}
                {next.previousRaw ? ` · prev ${next.previousRaw}` : ""}
              </span>
            )}
          </span>
        )}
        {state?.regime && <span className="ml-auto text-[11px] text-white/50">{state.regime.summary}</span>}
      </div>
    )
  }

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
    <div id="sec-macro" className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: frame.border, background: `linear-gradient(135deg, ${frame.bg} 0%, rgb(var(--surface-rgb, 10 14 23) / 0.75) 60%)` }}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Chip variant={released ? "phase" : "importance"} value={released ? "releasing" : imp} icon={released ? Zap : undefined}>
          {released ? `${a.event.title} released` : impLabel[imp]}
        </Chip>
        {!released && <span className="text-sm font-bold text-white">{a.event.title}</span>}
        <span className="text-[11px] text-white/50">{formatLocalTime(a.event.time)}</span>
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
            <ScenarioRows guide={a.scenarios} released={false} focus={asset ?? null} />
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

          <ScenarioRows guide={a.scenarios} released focus={asset ?? null} />

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
