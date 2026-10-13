"use client"

import React, { memo, useState } from "react"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { FOCUS_RING, SURFACE } from "../signals/shared"
import type { SummaryKey, SummaryResponse, TraderRow } from "./types"
import { ASSET_GROUPS } from "./types"
import { CopyAddressButton, ExtLink, MIX_COLORS, ScoreChip, addressUrl, fmtRate, fmtUsd, shortAddr, signColor, winRateColor } from "./ct-shared"

const CARDS: { k: SummaryKey; l: string; sub: string }[] = [
  ...ASSET_GROUPS.map((g) => ({ k: g, l: g, sub: "top 5 · 30d" })),
  { k: "COPYABLE", l: "Best copyable", sub: "top 10 overall · 30d" },
]

const StripRow = memo(function StripRow({ r, card, onView }: { r: TraderRow; card: SummaryKey; onView: (r: TraderRow) => void }) {
  const a = r.asset
  const pnl = card === "COPYABLE" ? (r.stats30d?.pnlCopyable ?? null) : (a?.realizedPnl ?? null)
  const n = a ? a.wins + a.losses : 0
  return (
    <li className="flex items-center gap-2 border-t border-white/[0.05] py-1.5 first:border-0">
      <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-white/45">{r.rank}</span>
      <button type="button" onClick={() => onView(r)} aria-label={`View ${r.displayName ?? r.address}`} className={cn("min-w-0 flex-1 truncate rounded text-left text-[12px] font-semibold text-white/90 hover:underline", FOCUS_RING)} style={{ textDecorationColor: "var(--brand)" }}>
        {r.displayName ?? <span className="font-mono font-medium">{shortAddr(r.address)}</span>}
      </button>
      <span className="shrink-0 font-mono text-[12px] tabular-nums" style={{ color: signColor(pnl) ?? "rgba(255,255,255,0.5)" }} title={card === "COPYABLE" ? "30d realized PnL in copyable markets" : `30d realized ${card} PnL`}>
        {fmtUsd(pnl, { sign: true })}
      </span>
      {card === "COPYABLE" ? (
        <ScoreChip score={r.score} />
      ) : (
        <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums" style={{ color: winRateColor(a?.winRate, n) ?? "rgba(255,255,255,0.55)" }} title={a ? `${a.wins} wins / ${a.losses} losses` : undefined}>
          {fmtRate(a?.winRate)}
        </span>
      )}
      <CopyAddressButton text={r.address} />
      <ExtLink href={addressUrl(r.address)} label="Open on Hyperliquid explorer" className="hidden sm:inline-flex" />
    </li>
  )
})

function StripCard({ card, rows, loading, onView }: { card: (typeof CARDS)[number]; rows: TraderRow[] | undefined; loading: boolean; onView: (r: TraderRow) => void }) {
  const [all, setAll] = useState(false)
  const shown = rows ? (all ? rows : rows.slice(0, 5)) : []
  const accent = card.k === "COPYABLE" ? "var(--brand)" : MIX_COLORS[card.k]
  return (
    <section className={cn(SURFACE, "flex min-w-0 flex-col px-3 py-2.5", card.k === "COPYABLE" && "sm:col-span-2 2xl:col-span-1")} aria-labelledby={`strip-${card.k}`}>
      <div className="mb-1 flex items-center gap-2">
        {card.k === "COPYABLE" ? <Star className="size-3.5" style={{ color: accent }} aria-hidden /> : <span aria-hidden className="inline-block size-2 rounded-sm" style={{ backgroundColor: accent }} />}
        <h3 id={`strip-${card.k}`} className="text-[12px] font-semibold uppercase tracking-[0.06em] text-white/80">
          {card.l}
        </h3>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{card.sub}</span>
      </div>
      {loading && !rows ? (
        <div className="space-y-1.5" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-white/[0.04]" />
          ))}
        </div>
      ) : !rows || rows.length === 0 ? (
        <p className="py-2 text-[11px] text-white/45">No ranked wallets yet.</p>
      ) : (
        <>
          <ul className="min-w-0">
            {shown.map((r) => (
              <StripRow key={r.address} r={r} card={card.k} onView={onView} />
            ))}
          </ul>
          {rows.length > 5 && (
            <button type="button" onClick={() => setAll((v) => !v)} className={cn("mt-1 self-start rounded text-[11px] text-white/50 hover:text-white", FOCUS_RING)}>
              {all ? "Show 5" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export default function TopStrip({ data, loading, error, onView }: { data: SummaryResponse | undefined; loading: boolean; error: boolean; onView: (r: TraderRow) => void }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-white/60">Top traders</h2>
        <span className="text-[11px] text-white/45">ranked by copyability inside each market, month window</span>
        {error && !data && <span className="text-[11px] text-[#FF3B5C]">strip unavailable</span>}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {CARDS.map((c) => (
          <StripCard key={c.k} card={c} rows={data?.top?.[c.k]} loading={loading} onView={onView} />
        ))}
      </div>
    </div>
  )
}
