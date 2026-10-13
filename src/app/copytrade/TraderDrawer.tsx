"use client"

import React, { useMemo, useState } from "react"
import { AlertTriangle, ExternalLink, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AMBER, Chip, FOCUS_RING, GREEN, LABEL, RED } from "../signals/shared"
import { Kpi, Segmented } from "../signals/performance/perf-shared"
import { RNG_THEME, themeStyle } from "../signals/themes"
import type { Asset, AssetStats, OpenPosition, Trade, TraderDetail, TraderRow, Window } from "./types"
import { Ago, CopyButton, addressUrl, dirWord, fmtInt, fmtPct, fmtPx, fmtRate, fmtSize, fmtUsd, posHealth, shortAddr, sideColor, signColor, tradeUrl, txUrl, utc, winRateColor } from "./ct-shared"
import { useTrader } from "./useCopyTrade"
import PnlChart from "./PnlChart"
import { WINDOW_WORD } from "./TraderTable"

const TH = "px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-white/50 whitespace-nowrap"
const TD = "px-2 py-1.5 font-mono text-xs tabular-nums whitespace-nowrap"
const WINDOWS: Window[] = ["day", "week", "month", "allTime"]

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-white/60">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

function Scroll({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-white/[0.06] [scrollbar-width:thin]">{children}</div>
}

function AssetTile({ a, coin }: { a: AssetStats | null | undefined; coin: string }) {
  if (!a) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 opacity-70">
        <div className={LABEL}>{coin}</div>
        <div className="mt-1 font-mono text-sm text-white/40">No {coin} fills in 30d</div>
      </div>
    )
  }
  const n = a.wins + a.losses
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL}>{coin} · 30d</span>
        <Chip variant="direction" value={a.direction ?? "mixed"}>
          {dirWord(a.direction)}
        </Chip>
      </div>
      <div className="mt-1 font-mono text-lg font-bold tabular-nums leading-tight" style={{ color: signColor(a.realizedPnl) ?? "rgba(255,255,255,0.9)" }}>
        {fmtUsd(a.realizedPnl, { sign: true })}
      </div>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px] tabular-nums text-white/60">
        <dt>Win rate</dt>
        <dd className="text-right">
          <span style={{ color: winRateColor(a.winRate, n) ?? undefined }}>{fmtRate(a.winRate)}</span> <span className="text-white/45">{a.wins}/{a.losses}</span>
        </dd>
        <dt>Trades</dt>
        <dd className="text-right text-white/80">{fmtInt(a.trades)}</dd>
        <dt>Volume</dt>
        <dd className="text-right text-white/80">{fmtUsd(a.volumeUsd)}</dd>
        <dt>Avg trade</dt>
        <dd className="text-right text-white/80">{fmtUsd(a.avgTradeUsd)}</dd>
        <dt>Fees</dt>
        <dd className="text-right text-white/80">{fmtUsd(a.fees)}</dd>
        <dt>First 30d</dt>
        <dd className="text-right" style={{ color: signColor(a.first30dPnl) ?? "rgba(255,255,255,0.8)" }}>{fmtUsd(a.first30dPnl, { sign: true })}</dd>
        <dt>Last trade</dt>
        <dd className="text-right text-white/80">
          <Ago ts={a.lastTradeAt} />
        </dd>
      </dl>
    </div>
  )
}

function PositionsTable({ rows }: { rows: OpenPosition[] }) {
  if (!rows.length) return <p className="text-xs text-white/45">No open positions.</p>
  return (
    <Scroll>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-white/[0.03]">
            <th scope="col" className={cn(TH, "text-left")}>Coin</th>
            <th scope="col" className={cn(TH, "text-left")}>Side</th>
            <th scope="col" className={cn(TH, "text-right")}>Size</th>
            <th scope="col" className={cn(TH, "text-right")}>Notional</th>
            <th scope="col" className={cn(TH, "text-right")}>Entry</th>
            <th scope="col" className={cn(TH, "text-right")}>Mark</th>
            <th scope="col" className={cn(TH, "text-right")}>Liq</th>
            <th scope="col" className={cn(TH, "text-right")}>Lev</th>
            <th scope="col" className={cn(TH, "text-right")}>Margin</th>
            <th scope="col" className={cn(TH, "text-right")}>uPnL / ROE</th>
            <th scope="col" className={cn(TH, "text-right")}>Funding</th>
            <th scope="col" className={cn(TH, "text-right")}>Opened</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const h = posHealth(p)
            return (
              <tr key={`${p.coin}-${p.side}-${i}`} className="border-t border-white/[0.05]">
                <td className={cn(TD, "font-bold text-white")}>{p.coin}</td>
                <td className={cn(TD, "font-sans")}>
                  <Chip variant="direction" value={p.side}>
                    {p.side}
                  </Chip>
                </td>
                <td className={cn(TD, "text-right text-white/85")}>{fmtSize(p.size)}</td>
                <td className={cn(TD, "text-right text-white/85")}>{fmtUsd(p.notionalUsd)}</td>
                <td className={cn(TD, "text-right text-white/85")}>{fmtPx(p.entryPx)}</td>
                <td className={cn(TD, "text-right text-white/85")}>{fmtPx(p.markPx)}</td>
                <td className={cn(TD, "text-right")} title={h.pct != null ? `${h.pct.toFixed(1)}% from mark` : "No liquidation price (low leverage or not reported)"}>
                  {p.liqPx == null ? (
                    <span className="text-white/40">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-1" style={{ color: h.warn ? AMBER : "rgba(255,255,255,0.85)" }}>
                      {h.warn && <AlertTriangle className="size-3" aria-label="Within 5% of liquidation" />}
                      {fmtPx(p.liqPx)}
                    </span>
                  )}
                </td>
                <td className={cn(TD, "text-right text-white/85")}>
                  {p.leverage}x <span className="text-white/45">{p.leverageType === "isolated" ? "iso" : "cross"}</span>
                </td>
                <td className={cn(TD, "text-right text-white/85")}>{fmtUsd(p.marginUsed)}</td>
                <td className={cn(TD, "text-right")} style={{ color: signColor(p.unrealizedPnl) ?? "rgba(255,255,255,0.85)" }}>
                  {fmtUsd(p.unrealizedPnl, { sign: true })} <span className="text-[11px] opacity-80">{fmtPct(p.roe)}</span>
                </td>
                <td className={cn(TD, "text-right")} style={{ color: signColor(-p.fundingPaid) ?? "rgba(255,255,255,0.7)" }} title="Funding paid (negative means received)">
                  {fmtUsd(-p.fundingPaid, { sign: true })}
                </td>
                <td className={cn(TD, "text-right text-white/70")}>
                  <Ago ts={p.openedAt} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Scroll>
  )
}

function TradesTable({ rows }: { rows: Trade[] }) {
  if (!rows.length) return <p className="text-xs text-white/45">No recent fills for this filter.</p>
  return (
    <Scroll>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-white/[0.03]">
            <th scope="col" className={cn(TH, "text-left")}>Time</th>
            <th scope="col" className={cn(TH, "text-left")}>Coin</th>
            <th scope="col" className={cn(TH, "text-left")}>Side</th>
            <th scope="col" className={cn(TH, "text-left")}>Dir</th>
            <th scope="col" className={cn(TH, "text-right")}>Px</th>
            <th scope="col" className={cn(TH, "text-right")}>Size</th>
            <th scope="col" className={cn(TH, "text-right")}>Notional</th>
            <th scope="col" className={cn(TH, "text-right")}>Closed PnL</th>
            <th scope="col" className={cn(TH, "text-right")}>Fee</th>
            <th scope="col" className={cn(TH, "text-right")}>Tx</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr key={`${t.hash}-${i}`} className="border-t border-white/[0.05]">
              <td className={cn(TD, "text-white/70")} title={utc(t.time)}>
                <Ago ts={t.time} />
              </td>
              <td className={cn(TD, "font-bold text-white")}>{t.coin}</td>
              <td className={cn(TD, "font-semibold")} style={{ color: sideColor(t.side) }}>
                {t.side}
              </td>
              <td className={cn(TD, "font-sans text-white/75")}>{t.dir || "—"}</td>
              <td className={cn(TD, "text-right text-white/85")}>{fmtPx(t.px)}</td>
              <td className={cn(TD, "text-right text-white/85")}>{fmtSize(t.size)}</td>
              <td className={cn(TD, "text-right text-white/85")}>{fmtUsd(t.notionalUsd)}</td>
              <td className={cn(TD, "text-right")} style={{ color: signColor(t.closedPnl) ?? "rgba(255,255,255,0.5)" }}>
                {t.closedPnl === 0 ? "—" : fmtUsd(t.closedPnl, { sign: true })}
              </td>
              <td className={cn(TD, "text-right text-white/60")}>{fmtUsd(t.fee, { dp: 2 })}</td>
              <td className={cn(TD, "text-right")}>
                {t.hash ? (
                  <a href={txUrl(t.hash)} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-1 rounded text-white/60 hover:text-white", FOCUS_RING)} aria-label={`Open transaction ${t.hash} on Hyperliquid explorer`}>
                    {shortAddr(t.hash)} <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : (
                  <span className="text-white/40">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Scroll>
  )
}

export default function TraderDrawer({ row, asset, mock, onClose }: { row: TraderRow | null; asset: Asset; mock: boolean; onClose: () => void }) {
  const open = row != null
  const [allCoins, setAllCoins] = useState(false)
  const [range, setRange] = useState<"month" | "allTime">("month")
  const effAsset: Asset = asset === "ALL" || allCoins ? "ALL" : asset
  const { data, isLoading, isError, isFetching } = useTrader(row?.address ?? null, effAsset, mock)
  const d: TraderDetail | undefined = data
  const positions = useMemo(() => (d ? (effAsset === "ALL" ? d.openPositions : d.openPositions.filter((p) => p.coin === effAsset)) : []), [d, effAsset])
  const explorer = d?.links?.hyperliquid ?? (row ? addressUrl(row.address) : "#")
  const copyCoin = asset === "ALL" ? (row?.openForAsset?.coin ?? positions[0]?.coin ?? "BTC") : asset
  const series = d ? (range === "month" ? d.pnlHistory.month : d.pnlHistory.allTime) : []
  const totalUpnl = d ? d.openPositions.reduce((s, p) => s + p.unrealizedPnl, 0) : row?.open.unrealizedPnl

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose()
          setAllCoins(false)
        }
      }}
    >
      {/* The sheet portals outside the themed page div, so the brand variables are re-applied here. */}
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto border-white/10 bg-[#0A0E17] text-white sm:max-w-[720px]" style={themeStyle(RNG_THEME)}>
        {row && (
          <>
            <SheetHeader className="pr-10">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-white">
                <Wallet className="size-4 text-white/50" aria-hidden />
                <span className="font-semibold">{row.displayName ?? shortAddr(row.address)}</span>
                <span className="font-mono text-xs text-white/50">#{row.rank}</span>
                {isFetching && !isLoading && <span className="text-[11px] text-white/40">refreshing…</span>}
              </SheetTitle>
              <SheetDescription className="text-xs text-white/60">Public on-chain activity for one Hyperliquid account. Not advice; past results do not predict the next trade.</SheetDescription>
              <div className="flex flex-wrap items-center gap-1 font-mono text-[11px] text-white/70">
                <span className="break-all">{row.address}</span>
                <CopyButton text={row.address} />
                <a href={explorer} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-[11px] text-white/70 hover:text-white hover:bg-white/[0.06]", FOCUS_RING)}>
                  Open explorer <ExternalLink className="size-3" aria-hidden />
                </a>
              </div>
            </SheetHeader>

            <div className="px-4 pb-8">
              <div className="flex flex-wrap items-center gap-2">
                <a href={tradeUrl(copyCoin)} target="_blank" rel="noopener noreferrer" className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-bold text-[#06080F]", FOCUS_RING)} style={{ backgroundColor: "var(--brand, #00FF88)" }}>
                  Copy on Hyperliquid · {copyCoin} <ExternalLink className="size-3.5" aria-hidden />
                </a>
                {asset !== "ALL" && (
                  <button type="button" aria-pressed={allCoins} onClick={() => setAllCoins((v) => !v)} className={cn("h-8 rounded-md border border-white/10 px-3 text-[12px] font-medium text-white/80 hover:bg-white/[0.06]", FOCUS_RING, allCoins && "bg-white/[0.08]")}>
                    {allCoins ? "Showing all coins" : `Showing ${asset} only`}
                  </button>
                )}
              </div>

              {isError && !d && <p className="mt-3 rounded-lg border border-[#FF3B5C]/40 bg-[#FF3B5C]/10 px-3 py-2 text-xs text-white/85">Could not load this trader right now. Showing the leaderboard row only.</p>}

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Kpi label="Equity" value={fmtUsd(d?.equity ?? row.equity)} sub={d ? `withdrawable ${fmtUsd(d.withdrawable)}` : undefined} />
                <Kpi label="Open uPnL" value={fmtUsd(totalUpnl ?? null, { sign: true })} color={signColor(totalUpnl)} sub={`${d ? d.openPositions.length : row.open.count} position${(d ? d.openPositions.length : row.open.count) === 1 ? "" : "s"} · ${fmtUsd(d ? d.openPositions.reduce((s, p) => s + p.notionalUsd, 0) : row.open.notionalUsd)} notional`} />
                <Kpi label="PnL 30d" value={fmtUsd(d?.windows.month.pnl ?? null, { sign: true })} color={signColor(d?.windows.month.pnl)} sub={d ? `ROI ${fmtPct(d.windows.month.roi)}` : undefined} dim={!d} />
              </div>

              <Section title="Windows">
                {isLoading && !d ? (
                  <div className="h-24 animate-pulse rounded-lg bg-white/[0.04]" />
                ) : d ? (
                  <Scroll>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-white/[0.03]">
                          <th scope="col" className={cn(TH, "text-left")}>Window</th>
                          <th scope="col" className={cn(TH, "text-right")}>PnL</th>
                          <th scope="col" className={cn(TH, "text-right")}>ROI</th>
                          <th scope="col" className={cn(TH, "text-right")}>Volume</th>
                        </tr>
                      </thead>
                      <tbody>
                        {WINDOWS.map((w) => {
                          const x = d.windows[w]
                          return (
                            <tr key={w} className="border-t border-white/[0.05]">
                              <td className={cn(TD, "font-sans text-white/80")}>{WINDOW_WORD[w]}</td>
                              <td className={cn(TD, "text-right")} style={{ color: signColor(x?.pnl) ?? "rgba(255,255,255,0.85)" }}>{fmtUsd(x?.pnl, { sign: true })}</td>
                              <td className={cn(TD, "text-right")} style={{ color: signColor(x?.roi) ?? "rgba(255,255,255,0.85)" }}>{fmtPct(x?.roi)}</td>
                              <td className={cn(TD, "text-right text-white/80")}>{fmtUsd(x?.volume)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </Scroll>
                ) : (
                  <p className="text-xs text-white/45">Window stats unavailable.</p>
                )}
              </Section>

              <Section title="PnL history" right={<Segmented label="PnL range" value={range} onChange={setRange} options={[{ k: "month", l: "30d" }, { k: "allTime", l: "All time" }]} />}>
                {isLoading && !d ? <div className="h-40 animate-pulse rounded-lg bg-white/[0.04]" /> : <PnlChart series={series} label={range === "month" ? "30 day" : "All time"} />}
              </Section>

              <Section title="Per-asset, last 30d">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <AssetTile coin="BTC" a={d ? d.perAsset.BTC : row.asset?.coin === "BTC" ? row.asset : undefined} />
                  <AssetTile coin="ADA" a={d ? d.perAsset.ADA : row.asset?.coin === "ADA" ? row.asset : undefined} />
                </div>
              </Section>

              <Section title={`Open positions${effAsset === "ALL" ? "" : ` · ${effAsset}`}`} right={<span className="font-mono text-[11px] tabular-nums text-white/50">{positions.length} shown</span>}>
                {isLoading && !d ? <div className="h-16 animate-pulse rounded-lg bg-white/[0.04]" /> : d ? <PositionsTable rows={positions} /> : row.openForAsset ? <PositionsTable rows={[row.openForAsset]} /> : <p className="text-xs text-white/45">No open positions.</p>}
              </Section>

              <Section title={`Recent trades${effAsset === "ALL" ? "" : ` · ${effAsset}`}`} right={d && <span className="font-mono text-[11px] tabular-nums text-white/50">last {d.recentTrades.length}</span>}>
                {isLoading && !d ? <div className="h-32 animate-pulse rounded-lg bg-white/[0.04]" /> : d ? <TradesTable rows={d.recentTrades} /> : <p className="text-xs text-white/45">Fills unavailable.</p>}
              </Section>

              {d && <p className="mt-4 text-[11px] text-white/40">As of {utc(d.asOf)}. Refreshes every 30s while open. Green and red mark sign only: <span style={{ color: GREEN }}>profit</span> / <span style={{ color: RED }}>loss</span>.</p>}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
