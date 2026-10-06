"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"
import { ExternalLink, Scale } from "lucide-react"
import type { MacroAsset } from "@/lib/macro/types"
import type { FedMeetingOdds, PredictionState } from "@/lib/prediction/service"
import type { PMMarket, PMVenue } from "@/lib/prediction/types"
import { impliedMedian, ladderWindow } from "@/lib/prediction/ladder"

type PredictionApi = PredictionState & { serverTime: string }

export function usePredictionState() {
  return useQuery<PredictionApi>({
    queryKey: ["prediction"],
    queryFn: async () => {
      const r = await fetch("/api/prediction")
      if (!r.ok) throw new Error(`prediction ${r.status}`)
      return r.json()
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

const VENUE_LABEL: Record<PMVenue, string> = { kalshi: "Kalshi", polymarket: "Polymarket" }
const VENUE_COLOR: Record<PMVenue, string> = { kalshi: "#22D3EE", polymarket: "#A78BFA" }
const GREEN = "#00FF88"
const RED = "#FF3B5C"
const AMBER = "#F59E0B"

const pct = (p: number | null | undefined) => (p == null ? "—" : `${Math.round(p * 100)}%`)

function fmtMoney(n: number | null): string {
  if (n == null) return "—"
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`
  return `$${Math.round(n)}`
}

function fmtStrike(n: number | null): string {
  if (n == null) return "—"
  if (n >= 10000) return `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
  if (n >= 1000) return `$${n.toLocaleString("en-US")}`
  return `$${n}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function meetingLabel(period: string): string {
  const d = period.length === 7 ? new Date(`${period}-15T00:00:00Z`) : new Date(`${period}T00:00:00Z`)
  if (isNaN(d.getTime())) return period
  return period.length === 7 ? d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

// ── Inline odds line for the macro event card ───────────────────────────────

const ASSET_NAME: Record<MacroAsset, string> = { BTC: "BTC", GOLD: "Gold", WTI: "WTI crude" }

// The selected ticker's own price odds: implied median from the nearest dated ladder plus the rungs in play.
function AssetOddsLine({ asset, state }: { asset: MacroAsset; state: PredictionApi }) {
  const odds = state.byAsset[asset]
  if (!odds || odds.markets.length === 0) return null
  const soon = Date.now() + 20 * 3600e3
  const dated = odds.markets.filter((m) => impliedMedian(m) != null && (!m.closeTime || new Date(m.closeTime).getTime() > soon))
  const m = dated[0] ?? odds.markets[0]
  const med = impliedMedian(m)
  const rungs = ladderWindow(m, 5)
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{ASSET_NAME[asset]} price odds</span>
        <span className="text-[10px] font-bold" style={{ color: VENUE_COLOR[m.venue] }}>{VENUE_LABEL[m.venue]}</span>
        <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-white hover:underline underline-offset-2 truncate max-w-[55%]" title={m.title}>
          {m.title}
        </a>
        {med && (
          <span className="ml-auto font-mono text-white/85">
            median ≈ <span className="font-bold text-white">{fmtStrike(Math.round(med.value))}</span>
            {m.closeTime ? <span className="text-white/35"> {fmtDate(m.closeTime)}</span> : null}
          </span>
        )}
      </div>
      {rungs.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-white/70">
          {rungs.map((o) => (
            <span key={o.label}>
              {o.value != null ? fmtStrike(o.value) : o.label} <span className="text-white/90">{pct(o.prob)}</span>
            </span>
          ))}
        </div>
      )}
      {odds.summary && <div className="mt-0.5 text-[10px] text-white/45">{odds.summary}</div>}
    </div>
  )
}

export function EventOddsInline({ defId, state, asset }: { defId: string; state: PredictionApi | undefined; asset?: MacroAsset | null }) {
  if (!state) return null
  return (
    <div className="space-y-2">
      {asset && <AssetOddsLine asset={asset} state={state} />}
      <EventOddsBody defId={defId} state={state} />
    </div>
  )
}

function EventOddsBody({ defId, state }: { defId: string; state: PredictionApi }) {
  const fedDefs = ["fed_funds", "fomc_statement", "fomc_presser", "fomc_minutes", "fed_speech"]
  if (fedDefs.includes(defId) && state.fed.length > 0) {
    const m = state.fed[0]
    return (
      <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Prediction markets · next FOMC {meetingLabel(m.period)}</span>
          {m.divergence != null && m.divergence >= 0.05 && (
            <span className="rounded px-1.5 py-px text-[9px] font-bold uppercase" style={{ color: AMBER, backgroundColor: `${AMBER}18` }}>
              venues differ {pct(m.divergence)}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono">
          {m.buckets
            .filter((b) => b.blended != null && b.blended >= 0.01)
            .map((b) => (
              <span key={b.bucket} className="text-white/80">
                <span className="font-bold" style={{ color: b.bucket === m.leaning ? GREEN : undefined }}>{b.label}</span> {pct(b.blended)}
                <span className="text-white/35 text-[10px]"> (K {pct(b.kalshi)} · P {pct(b.polymarket)})</span>
              </span>
            ))}
        </div>
      </div>
    )
  }
  const ms = state.byEvent[defId]
  if (!ms || ms.length === 0) return null
  const top = [...ms].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 2)
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Prediction markets</div>
      {top.map((m) => (
        <MarketLine key={`${m.venue}-${m.id}`} m={m} />
      ))}
    </div>
  )
}

function MarketLine({ m }: { m: PMMarket }) {
  const shown = [...m.outcomes].sort((a, b) => b.prob - a.prob).slice(0, 4)
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="text-[10px] font-bold" style={{ color: VENUE_COLOR[m.venue] }}>{VENUE_LABEL[m.venue]}</span>
      <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-white/75 hover:text-white underline-offset-2 hover:underline">
        {m.title}
      </a>
      <span className="font-mono text-white/80">{shown.map((o) => `${o.label} ${pct(o.prob)}`).join(" · ")}</span>
    </div>
  )
}

// ── Panel ───────────────────────────────────────────────────────────────────

function FedMeeting({ m }: { m: FedMeetingOdds }) {
  const rows = m.buckets.filter((b) => b.blended != null)
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs font-bold text-white">FOMC {meetingLabel(m.period)}</span>
        {m.leaning && (
          <span className="rounded px-1.5 py-px text-[9px] font-bold uppercase" style={{ color: GREEN, backgroundColor: `${GREEN}18` }}>
            market expects {m.buckets.find((b) => b.bucket === m.leaning)?.label}
          </span>
        )}
        {m.divergence != null && (
          <span className="text-[10px] text-white/40" title="Largest gap between Kalshi and Polymarket on one outcome">
            venue gap {pct(m.divergence)}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-[10px]">
          {(Object.keys(m.urls) as PMVenue[]).map((v) => (
            <a key={v} href={m.urls[v]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:underline" style={{ color: VENUE_COLOR[v] }}>
              {VENUE_LABEL[v]} <ExternalLink className="size-2.5" />
            </a>
          ))}
        </span>
      </div>
      <div className="space-y-1.5">
        {rows.map((b) => (
          <div key={b.bucket} className="grid grid-cols-[72px_1fr_auto] items-center gap-2 text-[11px]">
            <span className={`font-semibold ${b.bucket === m.leaning ? "text-white" : "text-white/60"}`}>{b.label}</span>
            <div className="relative h-3 rounded bg-white/[0.05] overflow-hidden">
              <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${Math.round((b.blended ?? 0) * 100)}%`, backgroundColor: b.bucket === m.leaning ? GREEN : "rgba(255,255,255,0.25)" }} />
              {b.kalshi != null && <span className="absolute top-0 h-full w-px" style={{ left: `${Math.round(b.kalshi * 100)}%`, backgroundColor: VENUE_COLOR.kalshi }} title={`Kalshi ${pct(b.kalshi)}`} />}
              {b.polymarket != null && <span className="absolute top-0 h-full w-px" style={{ left: `${Math.round(b.polymarket * 100)}%`, backgroundColor: VENUE_COLOR.polymarket }} title={`Polymarket ${pct(b.polymarket)}`} />}
            </div>
            <span className="font-mono text-white/85 w-28 text-right">
              {pct(b.blended)} <span className="text-white/35 text-[10px]">K {pct(b.kalshi)} · P {pct(b.polymarket)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AssetLadder({ asset, markets, label }: { asset: MacroAsset; markets: PMMarket[]; label?: string }) {
  if (markets.length === 0) return null
  const list = markets.slice(0, 8)
  const name = asset === "WTI" ? "WTI crude" : asset === "GOLD" ? "Gold" : asset
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-white">{name} price odds</span>
        {label && <span className="rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--brand, #9CA3AF)", backgroundColor: "rgba(255,255,255,0.06)" }}>{label} ticker</span>}
      </div>
      <div className="space-y-1">
        {list.map((m) => {
          const yes = m.outcomes.find((o) => /^yes$/i.test(o.label)) ?? null
          const ladder = yes == null ? ladderWindow(m, 7) : null
          const med = yes == null ? impliedMedian(m) : null
          return (
            <div key={`${m.venue}-${m.id}`} className="text-[11px]">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="text-[10px] font-bold w-16 shrink-0" style={{ color: VENUE_COLOR[m.venue] }}>{VENUE_LABEL[m.venue]}</span>
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-white/75 hover:text-white hover:underline underline-offset-2 truncate max-w-[60%]" title={m.title}>
                  {m.strike != null ? `${m.strikeSide === "below" ? "Below" : "Above"} ${fmtStrike(m.strike)}` : m.title}
                  {m.closeTime ? <span className="text-white/35"> · {fmtDate(m.closeTime)}</span> : null}
                </a>
                {yes && (
                  <span className="ml-auto font-mono font-bold" style={{ color: yes.prob >= 0.5 ? GREEN : yes.prob <= 0.2 ? RED : "rgba(255,255,255,0.85)" }}>
                    {pct(yes.prob)}
                  </span>
                )}
                {med && (
                  <span className="ml-auto font-mono text-[11px] text-white/80" title="Threshold where the market prices 50/50 (implied median)">
                    median ≈ <span className="font-bold text-white">{fmtStrike(Math.round(med.value))}</span>
                  </span>
                )}
                {m.volume != null && <span className="text-[10px] text-white/30">{fmtMoney(m.volume)} vol</span>}
              </div>
              {ladder && ladder.length > 0 && (
                <div className="mt-0.5 pl-16 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-white/70">
                  {ladder.map((o) => (
                    <span key={o.label} style={{ color: Math.abs(o.prob - 0.5) < 0.12 ? "rgba(255,255,255,0.95)" : undefined }}>
                      {o.value != null ? fmtStrike(o.value) : o.label} <span className="text-white/90">{pct(o.prob)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function PredictionOddsPanel({ asset, symbol }: { asset: MacroAsset | null; symbol?: string }) {
  const q = usePredictionState()
  const s = q.data
  if (q.isLoading && !s) return <div id="sec-prediction" className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 animate-pulse h-28" />
  if (!s) return null
  const anyOk = s.venues.some((v) => v.ok && v.count > 0)
  const assetOdds = asset ? s.byAsset[asset] : null
  const label = symbol ?? asset ?? ""
  const recession = [...s.recession].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0] ?? null
  const recYes = recession?.outcomes.find((o) => /^yes$/i.test(o.label)) ?? null
  return (
    <div id="sec-prediction" className="rounded-2xl border border-white/[0.08] bg-[rgb(var(--surface-rgb,10_14_23)/0.5)] backdrop-blur-md p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Scale className="size-4" style={{ color: "var(--brand, #9CA3AF)" }} />
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--brand, #9CA3AF)" }}>Prediction markets</span>
        <span className="text-[10px] text-white/35">Kalshi + Polymarket · real-money odds, refreshed every minute</span>
        <span className="ml-auto flex items-center gap-2 text-[10px]">
          {s.venues.map((v) => (
            <span key={v.venue} className="inline-flex items-center gap-1" title={v.note}>
              <span className="size-1.5 rounded-full" style={{ backgroundColor: v.ok && v.count > 0 ? VENUE_COLOR[v.venue] : RED }} />
              <span className="text-white/50">
                {VENUE_LABEL[v.venue]} {v.ok ? v.count : "down"}
              </span>
            </span>
          ))}
        </span>
      </div>
      {!anyOk ? (
        <p className="text-xs text-white/45">Both venues unreachable right now. Odds return automatically when a feed answers.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-3">
            {assetOdds && assetOdds.markets.length > 0 ? (
              <AssetLadder asset={assetOdds.asset} markets={assetOdds.markets} label={label} />
            ) : (
              <p className="text-xs text-white/40">{asset ? `No open ${label} price market on Kalshi or Polymarket right now.` : `No prediction market lists ${label || "this ticker"}. Fed and recession odds still apply to it.`}</p>
            )}
            {assetOdds?.summary && <p className="text-[11px] text-white/55">{assetOdds.summary}</p>}
          </div>
          <div className="space-y-3">
            {s.fed.slice(0, 2).map((m) => (
              <FedMeeting key={m.period} m={m} />
            ))}
            {s.fed.length === 0 && <p className="text-xs text-white/40">No open Fed-decision market found on either venue.</p>}
            {recession && recYes && (
              <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[11px] flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold" style={{ color: VENUE_COLOR[recession.venue] }}>{VENUE_LABEL[recession.venue]}</span>
                <a href={recession.url} target="_blank" rel="noopener noreferrer" className="text-white/75 hover:underline underline-offset-2">{recession.title}</a>
                <span className="ml-auto font-mono font-bold" style={{ color: recYes.prob >= 0.4 ? RED : "rgba(255,255,255,0.85)" }}>{pct(recYes.prob)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
