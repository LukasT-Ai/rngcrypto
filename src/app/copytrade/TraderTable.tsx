"use client"

import React, { memo } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Chip, FOCUS_RING, SURFACE } from "../signals/shared"
import type { Asset, OpenPosition, SortKey, TraderRow, Window } from "./types"
import { Ago, MixBar, ScoreChip, TraderName, dirWord, fmtInt, fmtNum, fmtPct, fmtRate, fmtSize, fmtUsd, signColor, winRateColor } from "./ct-shared"

export type ColKey = SortKey | "rank" | "pnl" | "trades" | "lastTrade" | "tradesPerDay" | "maxDd"
export type SortDir = "asc" | "desc"

const TH = "px-2 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-white/50 whitespace-nowrap"
const TD = "px-2 py-1.5 font-mono text-xs tabular-nums whitespace-nowrap align-middle"

export const WINDOW_WORD: Record<Window, string> = { day: "24h", week: "7d", month: "30d", allTime: "all time" }

interface Col {
  id: string
  k: ColKey
  l: string
  align: "left" | "right"
  sortable: boolean
  hide?: string
}

const COLS: Col[] = [
  { id: "rank", k: "rank", l: "#", align: "right", sortable: true },
  { id: "trader", k: "equity", l: "Trader", align: "left", sortable: false },
  { id: "score", k: "copyability", l: "Score", align: "left", sortable: true },
  { id: "mix", k: "focus", l: "Mix · copyable", align: "left", sortable: true },
  { id: "equity", k: "equity", l: "Equity", align: "right", sortable: true, hide: "hidden lg:table-cell" },
  { id: "pnl", k: "pnl", l: "Window PnL", align: "right", sortable: true },
  { id: "assetPnl", k: "assetPnl", l: "Asset PnL", align: "right", sortable: true },
  { id: "winRate", k: "winRate", l: "Win rate", align: "right", sortable: true },
  { id: "tpd", k: "tradesPerDay", l: "Tr/day", align: "right", sortable: true, hide: "hidden lg:table-cell" },
  { id: "dd", k: "maxDd", l: "Max DD", align: "right", sortable: true, hide: "hidden xl:table-cell" },
  { id: "last", k: "lastTrade", l: "Last trade", align: "right", sortable: true, hide: "hidden 2xl:table-cell" },
  { id: "open", k: "volume", l: "Open position", align: "left", sortable: false },
]

export function OpenChip({ p, compact = false }: { p: OpenPosition | null; compact?: boolean }) {
  if (!p) return <span className="text-[11px] text-white/35">flat</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <Chip variant="direction" value={p.side}>
        {p.side}
      </Chip>
      <span className="font-mono text-xs tabular-nums text-white/85">
        {fmtSize(p.size)} {!compact && <span className="text-white/45">{p.coin}</span>}
      </span>
      <span className="font-mono text-xs tabular-nums" style={{ color: signColor(p.unrealizedPnl) ?? "rgba(255,255,255,0.6)" }} title="Unrealized PnL">
        {fmtUsd(p.unrealizedPnl, { sign: true })}
      </span>
    </span>
  )
}

function OpenSummary({ r }: { r: TraderRow }) {
  if (r.open.count === 0) return <span className="text-[11px] text-white/35">flat</span>
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums">
      <span className="text-white/85">
        {r.open.count} open <span className="text-white/45">{r.open.coins.slice(0, 3).join(" ")}{r.open.coins.length > 3 ? " +" : ""}</span>
      </span>
      <span style={{ color: signColor(r.open.unrealizedPnl) ?? "rgba(255,255,255,0.6)" }} title="Unrealized PnL across open positions">
        {fmtUsd(r.open.unrealizedPnl, { sign: true })}
      </span>
    </span>
  )
}

function WinRate({ r }: { r: TraderRow }) {
  const a = r.asset
  if (!a) return <span className="text-white/40">—</span>
  const n = a.wins + a.losses
  return (
    <span title={n < 5 ? `Only ${n} decided trades; too few to read` : `${a.wins} wins, ${a.losses} losses`}>
      <span style={{ color: winRateColor(a.winRate, n) ?? (a.winRate == null ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.85)") }}>{fmtRate(a.winRate)}</span>
      <span className="ml-1 text-[11px] text-white/45">
        {a.wins}/{a.losses}
      </span>
    </span>
  )
}

const ddColor = (dd: number | null | undefined) => (dd == null ? "rgba(255,255,255,0.4)" : dd > 25 ? "#F59E0B" : "rgba(255,255,255,0.85)")

interface RowProps {
  r: TraderRow
  pos: number
  asset: Asset
  onView: (r: TraderRow) => void
}

const Row = memo(function Row({ r, pos, asset, onView }: RowProps) {
  const a = r.asset
  const s = r.stats30d
  const open = () => onView(r)
  return (
    <tr
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          open()
        }
      }}
      aria-label={`View ${r.displayName ?? r.address}`}
      className={cn("cursor-pointer border-t border-white/[0.05] transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.05]", FOCUS_RING, "focus-visible:ring-inset focus-visible:ring-offset-0")}
    >
      <td className={cn(TD, "text-right text-white/50")}>{pos}</td>
      <td className={cn(TD, "max-w-[200px] font-sans")}>
        <TraderName address={r.address} displayName={r.displayName} />
      </td>
      <td className={cn(TD, "font-sans")}>
        <ScoreChip score={r.score} />
      </td>
      <td className={cn(TD, "font-sans")}>
        <MixBar mix={r.mix} width={72} />
      </td>
      <td className={cn(TD, "hidden text-right text-white/85 lg:table-cell")}>{fmtUsd(r.equity)}</td>
      <td className={cn(TD, "text-right")}>
        <span style={{ color: signColor(r.window.pnl) ?? "rgba(255,255,255,0.85)" }}>{fmtUsd(r.window.pnl, { sign: true })}</span>
        <span className="ml-1 text-[11px] text-white/45">{fmtPct(r.window.roi)}</span>
      </td>
      <td className={cn(TD, "text-right")} style={{ color: a ? signColor(a.realizedPnl) ?? "rgba(255,255,255,0.85)" : s ? signColor(s.pnlCopyable) ?? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)" }} title={a ? `Realized ${a.coin} PnL over the last 30 days, fees ${fmtUsd(a.fees)}` : s ? "30d realized PnL across BTC, ADA, GOLD and WTI" : "Pick an asset for per-asset stats"}>
        {a ? fmtUsd(a.realizedPnl, { sign: true }) : s ? fmtUsd(s.pnlCopyable, { sign: true }) : "—"}
      </td>
      <td className={cn(TD, "text-right")}>
        <WinRate r={r} />
      </td>
      <td className={cn(TD, "hidden text-right text-white/85 lg:table-cell")} title={a ? `${fmtInt(a.trades)} ${a.coin} trades · ${fmtUsd(a.volumeUsd)} volume in 30d` : undefined}>
        {fmtNum(s?.tradesPerDay)}
      </td>
      <td className={cn(TD, "hidden text-right xl:table-cell")} style={{ color: ddColor(s?.maxDrawdownPct) }} title={s?.maxDrawdownPct != null ? `Max drawdown ${s.maxDrawdownPct.toFixed(1)}% over 30d${s.maxDrawdownPct > 25 ? " (deep)" : ""}` : "Drawdown not available"}>
        {s?.maxDrawdownPct == null ? "—" : `-${s.maxDrawdownPct.toFixed(1)}%`}
      </td>
      <td className={cn(TD, "hidden text-right text-white/70 2xl:table-cell")}>
        <Ago ts={a?.lastTradeAt ?? null} />
      </td>
      <td className={cn(TD, "font-sans")}>{asset === "ALL" ? <OpenSummary r={r} /> : <OpenChip p={r.openForAsset} compact />}</td>
      <td className={cn(TD, "text-right")}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
          aria-label={`View ${r.displayName ?? r.address}`}
          className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-sans text-[11px] font-medium text-white/60 hover:bg-white/[0.06] hover:text-white", FOCUS_RING)}
        >
          View <ChevronRight className="size-3.5" />
        </button>
      </td>
    </tr>
  )
})

const Card = memo(function Card({ r, pos, asset, onView }: RowProps) {
  const a = r.asset
  const s = r.stats30d
  const L = "text-[10px] font-sans uppercase tracking-[0.08em] text-white/45"
  return (
    <div className={cn(SURFACE, "space-y-2 p-3")}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-white/50">#{pos}</span>
        <div className="min-w-0 flex-1">
          <TraderName address={r.address} displayName={r.displayName} />
        </div>
        <button type="button" onClick={() => onView(r)} aria-label={`View ${r.displayName ?? r.address}`} className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-md border border-white/10 px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/[0.06]", FOCUS_RING)}>
          View <ChevronRight className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ScoreChip score={r.score} />
        <MixBar mix={r.mix} width={96} />
        {a && (
          <Chip variant="direction" value={a.direction ?? "mixed"}>
            {dirWord(a.direction)}
          </Chip>
        )}
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 font-mono text-xs tabular-nums">
        <div>
          <div className={L}>Equity</div>
          <div className="text-white/85">{fmtUsd(r.equity)}</div>
        </div>
        <div>
          <div className={L}>PnL</div>
          <div style={{ color: signColor(r.window.pnl) ?? "rgba(255,255,255,0.85)" }}>
            {fmtUsd(r.window.pnl, { sign: true })} <span className="text-white/45">{fmtPct(r.window.roi)}</span>
          </div>
        </div>
        <div>
          <div className={L}>{a ? `${a.coin} PnL` : "Copyable PnL"}</div>
          <div style={{ color: a ? signColor(a.realizedPnl) ?? "rgba(255,255,255,0.85)" : signColor(s?.pnlCopyable) ?? "rgba(255,255,255,0.4)" }}>{a ? fmtUsd(a.realizedPnl, { sign: true }) : fmtUsd(s?.pnlCopyable, { sign: true })}</div>
        </div>
        <div>
          <div className={L}>Win rate</div>
          <div>
            <WinRate r={r} />
          </div>
        </div>
        <div>
          <div className={L}>Tr/day · max DD</div>
          <div className="text-white/85">
            {fmtNum(s?.tradesPerDay)} <span style={{ color: ddColor(s?.maxDrawdownPct) }}>{s?.maxDrawdownPct == null ? "—" : `-${s.maxDrawdownPct.toFixed(1)}%`}</span>
          </div>
        </div>
        <div>
          <div className={L}>Last trade</div>
          <div className="text-white/70">
            <Ago ts={a?.lastTradeAt ?? null} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{asset === "ALL" ? <OpenSummary r={r} /> : <OpenChip p={r.openForAsset} />}</div>
    </div>
  )
})

export interface TraderTableProps {
  rows: TraderRow[]
  asset: Asset
  window: Window
  sortKey: ColKey
  sortDir: SortDir
  onSort: (k: ColKey) => void
  onView: (r: TraderRow) => void
}

export default function TraderTable({ rows, asset, window, sortKey, sortDir, onSort, onView }: TraderTableProps) {
  const cols = COLS.map((c) => (c.id === "pnl" ? { ...c, l: `PnL ${WINDOW_WORD[window]}` } : c.id === "assetPnl" ? { ...c, l: asset === "ALL" ? "Copyable PnL 30d" : `${asset} PnL 30d` } : c.id === "open" ? { ...c, l: asset === "ALL" ? "Open" : `Open ${asset}` } : c))
  return (
    <>
      <div className={cn(SURFACE, "hidden overflow-hidden md:block")}>
        <div className="max-h-[70vh] overflow-auto [scrollbar-width:thin]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-[#0B0F1A]">
              <tr>
                {cols.map((c) => {
                  const active = c.sortable && sortKey === c.k
                  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
                  return (
                    <th key={c.id} scope="col" aria-sort={c.sortable ? (active ? (sortDir === "asc" ? "ascending" : "descending") : "none") : undefined} className={cn(TH, c.hide, c.align === "right" ? "text-right" : "text-left")}>
                      {c.sortable ? (
                        <button type="button" onClick={() => onSort(c.k)} className={cn("inline-flex items-center gap-1 rounded px-0.5 hover:text-white/85", FOCUS_RING, active && "text-white/85")}>
                          {c.l}
                          <Icon className={cn("size-3", active ? "opacity-100" : "opacity-40")} aria-hidden />
                        </button>
                      ) : (
                        c.l
                      )}
                    </th>
                  )
                })}
                <th scope="col" className={TH}>
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Row key={r.address} r={r} pos={i + 1} asset={asset} onView={onView} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="space-y-2 md:hidden">
        {rows.map((r, i) => (
          <Card key={r.address} r={r} pos={i + 1} asset={asset} onView={onView} />
        ))}
      </div>
    </>
  )
}
