"use client"

import React, { useState } from "react"
import { ArrowUpRight, Clock, Flame, Globe, Newspaper } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MacroAsset } from "@/lib/macro/types"
import type { SignalsResponse } from "../types"
import { MacroAlerts, WeeklyOilCard, type MacroApi } from "../MacroEventPanel"
import { EconomicCalendar } from "../calendar/EconomicCalendar"
import { PredictionOddsPanel, usePredictionState } from "../PredictionOddsPanel"
import { RatesDollarStrip } from "../macro/RatesDollarStrip"
import { readFeatures } from "../flow/features-contract"
import { Sparkline, couplingTip } from "../RegimeStrip"
import { Chip, FOCUS_RING, GRAY, GREEN, RED, SURFACE, SectionTitle, Tip, fmtPrice, signed, timeAgo, timeUntil, useNow } from "../shared"

const HEADLINE_CAP = 3

// Headline catalysts (OIL/BTC/GOLD lens): net lean, the two forces, price context, category chips and the row list.
function CatalystPanel({ g, d, now }: { g: NonNullable<SignalsResponse["oilGeopolitical"]>; d: SignalsResponse; now: number }) {
  const [showAll, setShowAll] = useState(false)
  // Net lean is a direction: green/red. Neutral is gray, never amber.
  const col = (s: number) => (s >= 15 ? GREEN : s <= -15 ? RED : GRAY)
  const pct = (p: number | null) => (p == null ? "—" : `${signed(p, 2)}%`)
  const shown = showAll ? g.events : g.events.slice(0, HEADLINE_CAP)
  const v = g.verdict
  const pc = g.priceContext
  const whipsaw = g.regime === "whipsaw" || g.regime === "extreme"
  return (
    <div id="sec-geo">
      <SectionTitle
        icon={Globe}
        right={
          <>
            <Chip variant="direction" value={g.score >= 15 ? "bullish" : g.score <= -15 ? "bearish" : "neutral"}>
              {g.label}
            </Chip>
            <span className="font-mono text-xs font-bold tabular-nums" style={{ color: col(g.score) }}>
              {signed(g.score)}
            </span>
            {whipsaw ? (
              <Chip variant="warning" tip="Bullish and bearish catalysts are landing in quick succession, so price keeps reversing.">
                {g.regime}
              </Chip>
            ) : (
              <Chip variant="vol">{g.regime}</Chip>
            )}
            <span className="ml-auto font-mono text-[11px] tabular-nums text-white/50">{g.eventCount} headlines · 72h</span>
          </>
        }
      >
        {g.panelTitle ?? "Catalyst Headlines"}
      </SectionTitle>

      {v && (v.bullForce || v.bearForce) && (
        <div className={cn(SURFACE, "p-4 mb-3 space-y-2.5")}>
          {([
            ["BULL", v.bullForce, GREEN],
            ["BEAR", v.bearForce, RED],
          ] as const).map(([side, f, color]) =>
            f ? (
              <div key={side} className="flex items-start gap-3">
                <span className="w-9 shrink-0 text-[10px] font-bold mt-0.5" style={{ color }}>{side}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 min-w-0">
                    <span className="text-xs text-white/75 leading-snug break-words min-w-0">
                      <span className="font-semibold">{f.category.replace(/_/g, " ")}</span>
                      <span className="text-white/50"> · {f.topHeadline}</span>
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-white/50 shrink-0">
                      {f.count} ev · avg {signed(f.avgScore)} · <span style={{ color }}>{f.weightShare}% wt</span> · {pct(f.avgReactionPct)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 rounded bg-white/[0.05]">
                    <div className="h-1 rounded" style={{ width: `${f.weightShare}%`, backgroundColor: color, opacity: 0.85 }} />
                  </div>
                </div>
              </div>
            ) : null
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 border-t border-white/[0.04]">
            <span className="w-9 shrink-0 text-[10px] font-bold text-white/50">NET</span>
            <span className="text-xs font-semibold" style={{ color: col(g.score) }}>
              {v.netLean.toUpperCase()} {signed(g.score)}
            </span>
            <span className="text-xs text-white/50">· {v.priceFollowing ? `price is following ${v.priceFollowing.replace("_", " ")}` : "price undecided"}</span>
          </div>
          {v.netBasis && (
            <div className="flex items-start gap-3 -mt-1">
              <span className="w-9 shrink-0" />
              <span className="text-[11px] text-white/50 leading-snug">{v.netBasis}</span>
            </div>
          )}
          {v.flipCondition && (
            <div className="flex items-start gap-3">
              <span className="w-9 shrink-0 text-[10px] font-bold text-white/60 mt-0.5">FLIP</span>
              <span className="text-xs text-white/60 leading-snug">{v.flipCondition}</span>
            </div>
          )}
        </div>
      )}

      {pc && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-white/50">{g.assetName ?? d.assetLabel}</div>
              <div className="font-mono text-lg font-bold tabular-nums text-white/90">${fmtPrice(pc.current)}</div>
            </div>
            <div className="font-mono text-sm font-bold tabular-nums" style={{ color: pc.change24h >= 0 ? GREEN : RED }}>
              {pc.change24h >= 0 ? "+" : ""}
              {fmtPrice(pc.change24h)} <span className="text-xs">({signed(pc.changePct24h, 2)}%)</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span>
              <span className="text-white/50">7d H </span>
              <span className="font-mono text-white/70">${fmtPrice(pc.weekHigh)}</span>
            </span>
            <span>
              <span className="text-white/50">7d L </span>
              <span className="font-mono text-white/70">${fmtPrice(pc.weekLow)}</span>
            </span>
            {g.nextScheduled && (
              <Chip variant="importance" value={g.nextScheduled.impact === "high" ? "high" : g.nextScheduled.impact === "medium" ? "medium" : "low"} size="label" icon={Clock}>
                {g.nextScheduled.name} {timeUntil(new Date(g.nextScheduled.time).getTime(), now)}
              </Chip>
            )}
          </div>
        </div>
      )}

      {g.categoryBreakdown.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {g.categoryBreakdown.map((cat) => (
            <Chip key={cat.category} variant="direction" value={cat.avgScore >= 10 ? "bullish" : cat.avgScore <= -10 ? "bearish" : "neutral"} size="label" icon={Flame}>
              {cat.category.replace("_", " ")}
              <span className="font-mono text-[10px] opacity-70">({cat.count})</span>
              {cat.avgReactionPct != null && <span className="font-mono text-[10px] opacity-90">{pct(cat.avgReactionPct)}</span>}
            </Chip>
          ))}
        </div>
      )}

      <div className={cn(SURFACE, "divide-y divide-white/[0.04]")}>
        {shown.map((ev, i) => {
          const dot = ev.sentiment === "bullish" ? GREEN : ev.sentiment === "bearish" ? RED : GRAY
          // F2.9: confirms vote hoisted to the row (falls back to priceReaction), decayed weight, GENERAL marker.
          const confirms = ev.confirms !== undefined ? ev.confirms : ev.priceReaction?.confirms ?? null
          const rc = confirms === true ? GREEN : confirms === false ? RED : "rgba(255,255,255,0.4)"
          const inNet = ev.inNet ?? ev.category.toUpperCase() !== "GENERAL"
          return (
            <a key={`${ev.url}-${i}`} href={ev.url} target="_blank" rel="noopener noreferrer" className={cn("flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors group", FOCUS_RING)}>
              <span className="mt-2 size-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
              <div className="flex-1 min-w-0">
                <span className="text-[13px] text-white/65 leading-relaxed group-hover:text-white/85 transition-colors line-clamp-2">{ev.title}</span>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-white/50">
                  <span>{ev.source}</span>
                  <span>·</span>
                  <span className="font-mono">{timeAgo(new Date(ev.publishedAt).getTime(), now)}</span>
                  <span>·</span>
                  <span className={cn("font-medium uppercase", ev.impact === "high" ? "text-white/85" : ev.impact === "medium" ? "text-white/65" : "text-white/50")}>{ev.impact}</span>
                  <Chip variant="kind">{ev.category.replace("_", " ")}</Chip>
                  {!inNet ? (
                    <Chip variant="kind" tip="Price-reporting headline: describes the move instead of causing it, so it is excluded from the net lean.">
                      price-report · not scored
                    </Chip>
                  ) : ev.w != null ? (
                    <Tip content={`Decayed weight in the net lean: half-life decay by age${confirms === false ? ", cut to 0.3x because price rejected the narrative" : ""}.`}>
                      <span className="font-mono text-[10px] tabular-nums text-white/50">w {ev.w.toFixed(2)}</span>
                    </Tip>
                  ) : null}
                </div>
              </div>
              <span className="shrink-0 mt-1 inline-flex items-center gap-1.5">
                <Tip content={confirms === true ? "Price moved with this headline (confirmed)." : confirms === false ? "Price moved against this headline (rejected): weight cut to 0.3x." : "No price verdict yet."}>
                  <span aria-label={confirms === true ? "confirmed" : confirms === false ? "rejected" : "unverified"} className="font-mono text-[11px] font-bold" style={{ color: rc }}>
                    {confirms === true ? "✓" : confirms === false ? "✗" : "–"}
                  </span>
                </Tip>
                {ev.priceReaction && (
                  <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: confirms == null ? GRAY : rc }}>
                    {pct(ev.priceReaction.sinceEventPct)}
                  </span>
                )}
              </span>
              <ArrowUpRight className="size-3.5 text-white/50 group-hover:text-white/70 transition-colors shrink-0 mt-1" />
            </a>
          )
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {g.events.length > HEADLINE_CAP ? (
          <button type="button" aria-expanded={showAll} onClick={() => setShowAll((s) => !s)} className={cn("rounded-sm text-[11px] text-white/50 hover:text-white/80 transition-colors", FOCUS_RING)}>
            {showAll ? "Show less" : `Show ${g.events.length - HEADLINE_CAP} more`}
          </button>
        ) : (
          <span />
        )}
        <span className="text-[11px] text-white/50 text-right">
          Updated {new Date(g.lastUpdated).toLocaleTimeString()}
          {g.sourcesUsed.length > 0 ? ` · Sources: ${g.sourcesUsed.join(", ")}` : ""}
        </span>
      </div>
    </div>
  )
}

function NewsPanel({ news }: { news: NonNullable<SignalsResponse["newsSentiment"]> }) {
  const [open, setOpen] = useState(false)
  const dirv = news.score >= 20 ? "bullish" : news.score <= -20 ? "bearish" : "neutral"
  const rows = open ? news.headlines : news.headlines.slice(0, 3)
  return (
    <div id="sec-news">
      <SectionTitle
        icon={Newspaper}
        right={
          <>
            <Chip variant="direction" value={dirv}>
              {news.label}
            </Chip>
            <span className="font-mono text-xs font-bold tabular-nums" style={{ color: dirv === "bullish" ? GREEN : dirv === "bearish" ? RED : GRAY }}>
              {signed(news.score)}
            </span>
          </>
        }
      >
        News Sentiment
      </SectionTitle>
      <div className={cn(SURFACE, "divide-y divide-white/[0.04]")}>
        {rows.map((h, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-2.5">
            <span className="mt-2 size-2 rounded-full shrink-0" style={{ backgroundColor: h.sentiment === "bullish" ? GREEN : h.sentiment === "bearish" ? RED : GRAY }} />
            <span className="text-[13px] text-white/65 flex-1 leading-relaxed">{h.title}</span>
          </div>
        ))}
      </div>
      {news.headlines.length > 3 && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((s) => !s)} className={cn("mt-2 rounded-sm text-[11px] text-white/50 hover:text-white/80 transition-colors", FOCUS_RING)}>
          {open ? "Show less" : `Show ${news.headlines.length - 3} more`}
        </button>
      )}
    </div>
  )
}

export interface MacroTabProps {
  d: SignalsResponse
  macro: MacroApi | undefined
  macroLoading: boolean
  macroLens: MacroAsset
  predAsset: MacroAsset | null
  symbol: string
}

// Macro tab body. Memoized so a 30s signals poll does not rebuild the calendar, and the macro poll does not
// touch the other tabs. The 15s ticker drives the "ago" and "until" copy for the whole tab.
export const MacroTab = React.memo(function MacroTab({ d, macro, macroLoading, macroLens, predAsset, symbol }: MacroTabProps) {
  const now = useNow(15_000)
  const geo = d.oilGeopolitical
  const predQ = usePredictionState()
  const venueCounts = predQ.data?.venues?.map((v) => `${v.venue === "polymarket" ? "Polymarket" : "Kalshi"} ${v.ok ? v.count : "down"}`).join(" · ") ?? "Kalshi · Polymarket"
  // Coupling header (F2.8): crypto lens only; the macro endpoint carries the fuller record, the call carries the series.
  const coupling = macroLens === "BTC" ? macro?.macroCoupling ?? d.regime?.macroCoupling ?? null : null
  const couplingSeries = d.regime?.macroCoupling?.series ?? null
  return (
    <div className="space-y-5">
      {macroLens === "BTC" && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50">
          {coupling ? (
            <>
              <Chip variant="vol" size="label" tip={couplingTip(coupling)}>
                coupling {coupling.mult.toFixed(1)} · corr30d {coupling.corr30d.toFixed(2)}
                <Sparkline series={couplingSeries} />
              </Chip>
              {coupling.mult < 0.3 && <span>macro features mostly silenced in this regime</span>}
              {"n" in coupling && coupling.n != null && <span className="font-mono tabular-nums">n={coupling.n}</span>}
            </>
          ) : (
            <Chip variant="vol" size="label" tip="BTC/SPX 30-day correlation unavailable; macro weights run unscaled.">
              coupling n/a
            </Chip>
          )}
        </div>
      )}
      <MacroAlerts alerts={macro?.alerts} />
      {/* Rates & dollar strip (F2.5): BTC and GOLD lenses; ui-flow's component, mounted here */}
      {macroLens !== "WTI" && <RatesDollarStrip macroRates={readFeatures(d)?.macroRates} asset={macroLens} />}
      {/* WTI only: latest weekly inventory print + countdown to the next one */}
      {macroLens === "WTI" && <WeeklyOilCard releases={macro?.oilWeekly} />}
      {/* Economic calendar v2: the live card sits in its Live group, then upcoming and released rows, per lens */}
      <EconomicCalendar state={macro} isLoading={macroLoading} lens={macroLens} predAsset={predAsset} />
      {geo && geo.events.length > 0 && <CatalystPanel g={geo} d={d} now={now} />}
      {d.newsSentiment && d.newsSentiment.headlines.length > 0 && <NewsPanel news={d.newsSentiment} />}
      {/* Prediction markets: collapsed; the live card already shows the odds that matter */}
      {predAsset && (
        <details className="group" id="sec-prediction">
          <summary className={cn("cursor-pointer list-none rounded-sm py-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-white/60 hover:text-white/80 transition-colors", FOCUS_RING)}>
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span> Prediction markets <span className="normal-case tracking-normal text-white/45">({venueCounts})</span>
          </summary>
          <div className="mt-2">
            <PredictionOddsPanel asset={predAsset} symbol={symbol} />
          </div>
        </details>
      )}
    </div>
  )
})
