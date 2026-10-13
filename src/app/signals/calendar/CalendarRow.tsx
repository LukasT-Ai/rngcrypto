"use client"

import React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CalendarMarket, CalendarRow, Direction, EventKind, EventState, MacroAsset } from "@/lib/macro/types"
import { formatCompactCountdown, formatLocalDateTime, formatTimeAgo, urgencyFor } from "@/lib/macro/format"
import type { ScenarioGuide as ScenarioGuideData } from "@/lib/macro/scenarios"
import { AMBER, BRAND, CYAN, Chip, FOCUS_RING, GRAY, GREEN, ImportanceDot, PURPLE, RED, Tip, chipLook } from "../shared"
import { EventOddsInline, type PredictionApi } from "../PredictionOddsPanel"
import { SurpriseBar, fmtSkew, fmtZ } from "./SurpriseBar"

// ── Vocabulary and helpers shared by the desktop row, the mobile card and the live card ────────────────────────

export const kindTag: Partial<Record<EventKind, string>> = {
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
  foreign_cb: "central bank",
  trade: "trade",
  fiscal: "fiscal",
  positioning: "cftc",
  market_event: "event",
  crypto: "crypto",
}

export const ASSETS: MacroAsset[] = ["BTC", "GOLD", "WTI"]
export const countryTag = (c: string | undefined) => (!c || c === "US" ? null : c === "EMU" ? "EU" : c)
export const isTextEvent = (r: CalendarRow) => r.kind === "fed_communication" || r.kind === "auction" || r.kind === "market_event"
export const timeLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso))
export const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(iso))

// 1 to 3 bars from a 0..1 relevance.
export const relLevel = (v: number | null | undefined) => (v == null ? 0 : v >= 0.6 ? 3 : v >= 0.3 ? 2 : v > 0 ? 1 : 0)

export const MIN_MARKET_VOL = 50_000
// A market is "liquid" when it has a mean and at least $50k of volume; below that the row shows consensus only.
export const isLiquid = (m: CalendarMarket | null | undefined): m is CalendarMarket => !!m && m.mean != null && Number.isFinite(m.mean) && (m.volumeUsd ?? 0) >= MIN_MARKET_VOL

export const VENUE_COLOR: Record<"kalshi" | "polymarket", string> = { kalshi: CYAN, polymarket: PURPLE }
export const venueName = (v: "kalshi" | "polymarket" | null | undefined) => (v === "polymarket" ? "Polymarket" : v === "kalshi" ? "Kalshi" : "prediction market")

// Format a number the way the calendar's raw strings are written: same decimals and the same unit suffix as `like`.
export function fmtLike(v: number | null | undefined, like: string | null | undefined, fallbackDp = 2): string {
  if (v == null || !Number.isFinite(v)) return "—"
  const m = like?.match(/-?\d[\d,]*(?:\.(\d+))?/)
  const dp = m ? (m[1]?.length ?? 0) : fallbackDp
  const suffix = like && m ? like.slice((m.index ?? 0) + m[0].length).trim() : ""
  const prefix = like && m && (m.index ?? 0) > 0 ? like.slice(0, m.index).replace(/[~*\s]/g, "") : ""
  const num = v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
  return `${prefix}${num}${suffix ? (suffix.length > 1 ? ` ${suffix}` : suffix) : ""}`.replace(/\s+/g, " ")
}

// Numeric value of a raw calendar string ("3.0%", "-0.5M bbl", "250K").
export function parseRaw(raw: string | null | undefined): number | null {
  if (!raw) return null
  const m = raw.match(/-?\d[\d,]*(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0].replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}

export function fmtVol(n: number | null | undefined): string {
  if (n == null) return "—"
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`
  return `$${Math.round(n)}`
}

export const dirColor = (d: Direction | null | undefined) => (d === "bullish" ? GREEN : d === "bearish" ? RED : GRAY)
export const dirArrow = (d: Direction | null | undefined) => (d === "bullish" ? "↑" : d === "bearish" ? "↓" : "↔")
export const dirWord = (d: Direction | null | undefined) => (d === "bullish" ? "up" : d === "bearish" ? "down" : "mixed")

// Blended expectation anchor: 0.6 market mean / 0.4 consensus when both exist (lib/macro/service.ts).
export function blendedAnchor(r: CalendarRow): number | null {
  const c = parseRaw(r.forecastRaw)
  const m = isLiquid(r.market) ? r.market.mean : null
  if (m != null && c != null) return 0.6 * m + 0.4 * c
  return m ?? c
}

export function VenueGlyph({ venue, tip, className }: { venue: "kalshi" | "polymarket" | null | undefined; tip?: React.ReactNode; className?: string }) {
  const color = venue ? VENUE_COLOR[venue] : "rgba(255,255,255,0.5)"
  const el = (
    <span aria-label={venueName(venue)} className={cn("font-mono text-[10px] font-bold", className)} style={{ color }}>
      {"<>"}
    </span>
  )
  return tip ? <Tip content={tip}>{el}</Tip> : el
}

// Relevance bars: one 3-bar mini chart per row, one bar per asset, the lens asset bright and the others faint.
// Dimmed when the macro coupling multiplier is below 0.5 (the engine mostly ignores macro in this regime).
export function RelevanceBars({ relevance, lensRelevance, lens, couplingMult, className }: { relevance: Record<MacroAsset, number> | null | undefined; lensRelevance: number | null | undefined; lens: MacroAsset; couplingMult: number | null; className?: string }) {
  const rel = relevance ?? null
  const dim = couplingMult != null && couplingMult < 0.5
  const lensLevel = relLevel(lensRelevance ?? rel?.[lens] ?? null)
  const tip = rel
    ? `${ASSETS.map((a) => `${a} ${rel[a] != null ? rel[a].toFixed(1) : "—"}`).join(" · ")}${couplingMult != null && lens === "BTC" ? ` · scaled by coupling ${couplingMult.toFixed(2)}${dim ? " (mostly silenced)" : ""}` : ""}`
    : "Relevance by asset is not available for this row."
  return (
    <Tip content={tip}>
      <span role="img" aria-label={`${lens} relevance ${lensLevel} of 3`} className={cn("inline-flex h-3 items-end gap-px", dim && "opacity-60", className)}>
        {ASSETS.map((a) => {
          const lvl = relLevel(rel?.[a])
          const isLens = a === lens
          return (
            <span key={a} className="inline-flex h-3 w-2 flex-col justify-end gap-px">
              {[3, 2, 1].map((step) => (
                <span
                  key={step}
                  className="block h-[3px] w-full rounded-[1px]"
                  style={{
                    backgroundColor: lvl >= step ? (isLens ? (dim ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.85)") : "rgba(255,255,255,0.22)") : "rgba(255,255,255,0.06)",
                  }}
                />
              ))}
            </span>
          )
        })}
      </span>
    </Tip>
  )
}

// First-5-minute confirmation gate on live rows and the live card. Verification family: a status, so green/red is allowed.
export function GateChip({ gate }: { gate: CalendarRow["firstMoveGate"] }) {
  if (!gate) return null
  const value = gate === "confirmed" ? "verified" : gate === "unconfirmed" ? "conflict" : "awaiting"
  const text = gate === "confirmed" ? "gate confirmed" : gate === "unconfirmed" ? "gate failed" : "gate pending"
  return (
    <Chip variant="verification" value={value} tip="First-5-minute gate: the lens asset must move more than 0.7% in the surprise direction within five minutes for the engine to trade the release.">
      {text}
    </Chip>
  )
}

// ── Cells ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function WhenCell({ r, now, liveWord }: { r: CalendarRow; now: number; liveWord?: string | null }) {
  const s = now === 0 ? null : Math.round((new Date(r.time).getTime() - now) / 1000)
  if (liveWord) {
    return (
      <span className="inline-flex flex-col leading-tight">
        <span className="font-mono text-[11px] tabular-nums text-white/60">{timeLabel(r.time)}</span>
        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--brand, #00FF88)" }}>{liveWord}</span>
      </span>
    )
  }
  if (r.released) {
    return (
      <span className="inline-flex flex-col leading-tight">
        <span className="font-mono text-[11px] tabular-nums text-white/60">{timeLabel(r.time)}</span>
        <span className="font-mono text-[10px] tabular-nums text-white/50">{s == null ? "" : formatTimeAgo(-s)}</span>
      </span>
    )
  }
  const u = s == null ? "normal" : urgencyFor(s)
  const look = chipLook("urgency", u)
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="font-mono text-[11px] tabular-nums text-white/60">{timeLabel(r.time)}</span>
      <span className={cn("font-mono text-[10px] tabular-nums", look.weight)} style={{ color: look.color }}>
        {s == null ? "" : s <= 0 ? "now" : formatCompactCountdown(s)}
      </span>
    </span>
  )
}

export function ReleaseCell({ r, expanded, onToggle, live }: { r: CalendarRow; expanded: boolean; onToggle: () => void; live?: boolean }) {
  const tag = kindTag[r.kind]
  const cc = countryTag(r.country)
  const mk = isLiquid(r.market) ? r.market : null
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      <ImportanceDot importance={r.importance} />
      {cc && <span className="rounded bg-white/[0.06] px-1 py-px text-[10px] font-bold text-white/60">{cc}</span>}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className={cn("inline-flex items-center gap-1 rounded-sm text-left font-sans text-[12px]", r.released ? "text-white/65" : "text-white/85", "hover:text-white", FOCUS_RING)}
      >
        {r.title}
        <ChevronDown className={cn("size-3 text-white/40 transition-transform", expanded && "rotate-180")} aria-hidden />
      </button>
      {tag && <Chip variant="kind">{tag}</Chip>}
      {mk && <VenueGlyph venue={mk.venue} tip={`${venueName(mk.venue)} ladder, ${fmtVol(mk.volumeUsd)} volume${mk.shrunk ? "; odds shrunk (stale or far out)" : ""}.`} />}
      {live && <GateChip gate={r.firstMoveGate} />}
    </span>
  )
}

export function ActualCell({ r }: { r: CalendarRow }) {
  if (r.actualRaw) return <span className="font-mono text-[12px] font-bold tabular-nums text-white">{r.actualRaw}</span>
  if (r.released && !isTextEvent(r))
    return (
      <Chip variant="verification" value="awaiting">
        awaiting
      </Chip>
    )
  return <span className="text-white/40">—</span>
}

// Two-line expectation cell: consensus over the market-implied mean (with venue glyph and sd), the z anchor underlined.
export function ForecastCell({ r, align = "right" }: { r: CalendarRow; align?: "right" | "left" }) {
  const mk = isLiquid(r.market) ? r.market : null
  const anchor = r.zAnchor
  const dotted = "underline decoration-dotted decoration-white/35 underline-offset-2"
  const consensus = r.forecastRaw ? (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-white/70", anchor === "consensus" && dotted)}>
      <span className="text-[9px] font-sans font-semibold text-white/40">C</span>
      {r.forecastSource ? (
        <Tip content={`Proxy consensus: ${r.forecastSource}`}>
          <span>~{r.forecastRaw}</span>
        </Tip>
      ) : (
        r.forecastRaw
      )}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-white/40">
      <span className="text-[9px] font-sans font-semibold text-white/40">C</span>—
    </span>
  )
  let second: React.ReactNode = null
  if (r.fed) {
    second = (
      <Tip content={`Market-implied expected rate change ${r.fed.expectedChangeBp > 0 ? "+" : ""}${r.fed.expectedChangeBp}bp with a ${r.fed.surpriseSdBp}bp surprise SD; modal outcome "${r.fed.modalLabel}" at ${Math.round(r.fed.modalProb * 100)}%.`}>
        <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-white/90">
          <span className="text-[9px] font-sans font-semibold text-white/40">E[Δ]</span>
          {r.fed.expectedChangeBp > 0 ? "+" : ""}
          {r.fed.expectedChangeBp}bp
          <span className="text-[10px] text-white/50">sd {r.fed.surpriseSdBp}bp</span>
        </span>
      </Tip>
    )
  } else if (mk) {
    const m = mk
    second = (
      <span className={cn("inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-white/90", (anchor === "market" || anchor === "blended") && dotted)}>
        <span className="text-[9px] font-sans font-semibold text-white/40">M</span>
        {fmtLike(m.mean, r.forecastRaw ?? r.previousRaw)}
        <VenueGlyph venue={m.venue} tip={`${venueName(m.venue)} implied mean, ${fmtVol(m.volumeUsd)} volume${m.asOf ? `, as of ${formatLocalDateTime(m.asOf)}` : ""}.`} />
        {m.sd != null && <span className="text-[10px] text-white/50">sd {fmtLike(m.sd, r.forecastRaw ?? r.previousRaw).replace(/^[+$]/, "")}</span>}
        {m.shrunk && (
          <Chip variant="kind" tip="Odds older than 24h or more than 14 days out are shrunk toward consensus.">
            shrunk
          </Chip>
        )}
      </span>
    )
  } else if (r.market && r.market.mean != null) {
    second = (
      <Tip content="No liquid market: the ladder has under $50k of volume, so consensus is the only anchor.">
        <span className="font-mono text-[10px] text-white/40">no liquid market</span>
      </Tip>
    )
  }
  return (
    <span className={cn("inline-flex flex-col leading-tight", align === "right" ? "items-end" : "items-start")}>
      {consensus}
      {second}
    </span>
  )
}

export function PreviousCell({ r }: { r: CalendarRow }) {
  return <span className="font-mono text-[11px] tabular-nums text-white/70">{r.previousRaw ?? "—"}</span>
}

// Read cell: the only cell with direction colour. `{lens} up/down` from assetDirection, then the basis and the read.
export function LensDirection({ r, lens, withMove }: { r: CalendarRow; lens: MacroAsset; withMove?: boolean }) {
  const d = r.assetDirection
  if (!d) return null
  const rx = r.reaction
  const basis =
    r.assetDirectionBasis === "observed" && rx
      ? `observed @${rx.label}${rx.confirmation ? `, ${rx.confirmation}` : ""}`
      : r.assetDirectionBasis === "expected"
        ? "expected"
        : null
  const move = withMove && rx?.lensMovePct != null ? `${rx.lensMovePct > 0 ? "+" : ""}${rx.lensMovePct.toFixed(2)}%` : null
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="font-mono text-[11px] font-bold" style={{ color: dirColor(d) }}>
        {lens} {dirArrow(d)} {dirWord(d)}
      </span>
      {move && (
        <span className="font-mono text-[11px] tabular-nums" style={{ color: dirColor(d) }}>
          {move}
        </span>
      )}
      {basis && <span className="text-[10px] text-white/45">({basis})</span>}
    </span>
  )
}

export function ReadCell({ r, lens }: { r: CalendarRow; lens: MacroAsset }) {
  const text = isTextEvent(r)
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
      <LensDirection r={r} lens={lens} />
      {r.read ? (
        <span style={{ color: r.score != null && Math.abs(r.score) >= 50 ? AMBER : "rgba(255,255,255,0.7)" }}>{r.read}</span>
      ) : !r.assetDirection ? (
        <span className="text-white/45">{text ? "market read after release" : r.released ? "" : "pending"}</span>
      ) : null}
    </span>
  )
}

// ── Scenario guide: what each print range would mean per asset ────────────────────────────────────────────────
// Shown before the release so the reader knows what to watch for, and after it with the actual's band highlighted.
// `focus` puts the selected ticker's asset first. Used by the live card and by every expanded row that has a guide.

const dirText = (d: Direction) => (d === "bullish" ? "BULLISH" : d === "bearish" ? "BEARISH" : "MIXED")

export function ScenarioRows({ guide, released, focus }: { guide: ScenarioGuideData | null; released: boolean; focus: MacroAsset | null }) {
  if (!guide) return null
  const assets = [...(focus ? [focus] : []), ...ASSETS.filter((a) => a !== focus)]
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
                  <td key={a} className="py-1 pr-2 whitespace-nowrap font-semibold" style={{ color: dirColor(b.directions[a]) }} title={`${a}: ${dirText(b.directions[a])}`}>
                    <span className="mr-1 font-mono text-[10px] text-white/50">{a}</span>
                    {dirArrow(b.directions[a])} {dirText(b.directions[a]).toLowerCase()}
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

// ── Expansion blocks (shared by the desktop row, the mobile card and the live card) ───────────────────────────

export function ExpectationsBlock({ r }: { r: CalendarRow }) {
  const mk = isLiquid(r.market) ? r.market : null
  const like = r.forecastRaw ?? r.previousRaw
  const consensus = parseRaw(r.forecastRaw)
  const blended = mk && mk.mean != null && consensus != null ? 0.6 * mk.mean + 0.4 * consensus : null
  const sdSource = mk && mk.sd != null ? `market, ${fmtVol(mk.volumeUsd)}` : "prior"
  const item = (k: string, v: React.ReactNode) => (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[10px] uppercase tracking-wide text-white/45">{k}</span>
      <span className="font-mono text-[11px] tabular-nums text-white/85">{v}</span>
    </span>
  )
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/50">Expectations</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {item("consensus", r.forecastRaw ? `${r.forecastSource ? "~" : ""}${r.forecastRaw}` : "—")}
        {r.fed
          ? item(
              "market",
              <>
                E[Δ] {r.fed.expectedChangeBp > 0 ? "+" : ""}
                {r.fed.expectedChangeBp}bp · sd {r.fed.surpriseSdBp}bp · modal {r.fed.modalLabel} {Math.round(r.fed.modalProb * 100)}%
              </>
            )
          : item(
              "market",
              mk ? (
                <>
                  {fmtLike(mk.mean, like)} <VenueGlyph venue={mk.venue} />
                  {mk.shrunk ? <span className="text-white/45"> shrunk</span> : null}
                </>
              ) : r.market?.mean != null ? (
                <span className="text-white/45">no liquid market</span>
              ) : (
                "—"
              )
            )}
        {!r.fed && item("blended", blended != null ? `${fmtLike(blended, like)} (0.6/0.4)` : "—")}
        {item("sd", mk && mk.sd != null ? `${fmtLike(mk.sd, like).replace(/^[+$]/, "")} · ${sdSource}` : `${sdSource}`)}
        {mk && mk.tailSkew != null && item("tail skew", <span style={{ color: Math.abs(mk.tailSkew) >= 0.25 ? AMBER : undefined }}>{fmtSkew(mk.tailSkew)}</span>)}
        {r.zScore != null && item("surprise", <span style={{ color: Math.abs(r.zScore) >= 2 ? AMBER : undefined }}>{fmtZ(r.zScore)}{r.zAnchor ? ` vs ${r.zAnchor}` : ""}</span>)}
      </div>
      {r.forecastSource && <p className="mt-1 text-[10px] text-white/45">Consensus is a proxy: {r.forecastSource}.</p>}
    </div>
  )
}

const SAMPLE_LABELS = ["5m", "15m", "1h"] as const

export function ReactionSamples({ r, lens }: { r: CalendarRow; lens: MacroAsset }) {
  const rx = r.reaction
  const assets = [lens, ...ASSETS.filter((a) => a !== lens)]
  const rows = rx ? SAMPLE_LABELS.filter((l) => rx.samples[l]) : []
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
        Reaction
        {rx && (
          <span className="ml-1 normal-case tracking-normal text-white/50">
            · latest {rx.label}
            {rx.confirmation ? ` · ${rx.confirmation}` : ""}
          </span>
        )}
      </div>
      {rows.length > 0 ? (
        <table className="text-[11px]">
          <thead>
            <tr className="text-white/50">
              <th className="pr-3 text-left font-medium">t+</th>
              {assets.map((a) => (
                <th key={a} className={cn("pr-3 text-right font-medium", a === lens ? "text-white/80" : "")}>{a}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l} className="font-mono tabular-nums">
                <td className="pr-3 text-white/55">{l}</td>
                {assets.map((a) => {
                  const v = rx!.samples[l]?.[a] ?? null
                  return (
                    <td key={a} className="pr-3 text-right" style={{ color: v == null ? GRAY : v > 0 ? GREEN : v < 0 ? RED : GRAY, opacity: a === lens ? 1 : 0.7 }}>
                      {v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-[11px] text-white/45">{r.released ? "No reaction samples stored for this release." : "Samples at 5m, 15m and 1h appear after the release."}</div>
      )}
    </div>
  )
}

export function RowExpansion({ r, lens, state, predState }: { r: CalendarRow; lens: MacroAsset; state: EventState | null | undefined; predState: PredictionApi | undefined }) {
  return (
    <div className="space-y-3 text-xs">
      <ExpectationsBlock r={r} />
      {state?.scenarios && <ScenarioRows guide={state.scenarios} released={r.released} focus={lens} />}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ReactionSamples r={r} lens={lens} />
        {state && state.preMap.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/50">Transmission</div>
            <div className="text-white/60">{(state.preMap[0]?.channel ?? []).join(" → ") || "No directional transmission"}</div>
            <div className="mt-1 text-white/50">{state.def.logic}</div>
          </div>
        )}
      </div>
      <EventOddsInline defId={r.defId} state={predState} asset={null} />
      <div className="text-[10px] text-white/40">{formatLocalDateTime(r.time)} · event time in your local zone</div>
    </div>
  )
}

// ── Desktop row ───────────────────────────────────────────────────────────────────────────────────────────────

export const COLS = 8

export function CalendarRowDesktop({
  r,
  lens,
  now,
  couplingMult,
  expanded,
  onToggle,
  state,
  predState,
}: {
  r: CalendarRow
  lens: MacroAsset
  now: number
  couplingMult: number | null
  expanded: boolean
  onToggle: () => void
  state: EventState | null | undefined
  predState: PredictionApi | undefined
}) {
  const s = now === 0 ? Infinity : Math.round((new Date(r.time).getTime() - now) / 1000)
  const u = r.released ? "normal" : urgencyFor(s)
  const hot = !r.released && (u === "now" || u === "urgent" || u === "strong")
  const cell = "px-2 py-1 align-top"
  return (
    <>
      <tr
        className={cn("border-t border-white/[0.04] hover:bg-white/[0.04] cursor-pointer", hot && "bg-white/[0.03]", expanded && "bg-white/[0.03]")}
        onClick={(e) => {
          const t = e.target as HTMLElement
          if (t.closest("a, button, [data-radix-popper-content-wrapper]")) return
          onToggle()
        }}
      >
        <td className={cn(cell, "whitespace-nowrap")}>
          <WhenCell r={r} now={now} />
        </td>
        <td className={cn(cell, "min-w-[180px]")}>
          <ReleaseCell r={r} expanded={expanded} onToggle={onToggle} />
        </td>
        <td className={cn(cell, "whitespace-nowrap")}>
          <RelevanceBars relevance={r.relevance} lensRelevance={r.lensRelevance} lens={lens} couplingMult={couplingMult} />
        </td>
        <td className={cn(cell, "text-right whitespace-nowrap")}>
          <ActualCell r={r} />
        </td>
        <td className={cn(cell, "text-right whitespace-nowrap")}>
          <ForecastCell r={r} />
        </td>
        <td className={cn(cell, "text-right whitespace-nowrap")}>
          <PreviousCell r={r} />
        </td>
        <td className={cn(cell, "whitespace-nowrap")}>
          <SurpriseBar score={r.score} zScore={r.zScore} tailSkew={r.market?.tailSkew ?? null} released={r.released} width={96} />
        </td>
        <td className={cn(cell, "min-w-[160px]")}>
          <ReadCell r={r} lens={lens} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-white/[0.04] bg-black/20">
          <td colSpan={COLS} className="px-3 py-3">
            <RowExpansion r={r} lens={lens} state={state} predState={predState} />
          </td>
        </tr>
      )}
    </>
  )
}
