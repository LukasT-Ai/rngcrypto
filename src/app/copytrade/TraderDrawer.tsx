"use client"

import React, { useMemo, useState } from "react"
import { AlertTriangle, ExternalLink, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AMBER, Chip, FOCUS_RING, GREEN, LABEL, RED, Tip } from "../signals/shared"
import { Kpi, Segmented } from "../signals/performance/perf-shared"
import { RNG_THEME, themeStyle } from "../signals/themes"
import type { Asset, AssetGroup, AssetStats, Mix, OpenPosition, Score, Stats30d, Trade, TraderDetail, TraderRow, Window } from "./types"
import { ASSET_GROUPS } from "./types"
import { Ago, CopyButton, GRADE_WORD, GROUP_COINS, MIX_COLORS, MixBar, MixLegend, SUBSCORES, ScoreChip, addressUrl, dirWord, fmtInt, fmtNum, fmtPct, fmtPx, fmtRate, fmtSize, fmtUsd, groupOf, posHealth, shortAddr, sideColor, signColor, tradeUrl, txUrl, utc, winRateColor } from "./ct-shared"
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

// ---------------------------------------------------------------------------
// Why this wallet: grade, copyability, five sub-score bars (single hue, length = value), reasons, mix breakdown.
// ---------------------------------------------------------------------------

function ScoreBar({ label, value, hint }: { label: string; value: number | null | undefined; hint: string }) {
  const v = value == null ? null : Math.max(0, Math.min(100, value))
  return (
    <div className="grid grid-cols-[88px_1fr_36px] items-center gap-2 text-[11px]">
      <Tip content={hint}>
        <span className="cursor-help text-white/70 underline decoration-dotted decoration-white/25 underline-offset-2">{label}</span>
      </Tip>
      <div className="relative h-1.5 rounded-full bg-white/[0.06]" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v ?? undefined}>
        {v != null && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${v}%`, backgroundColor: "#00C466", opacity: 0.5 + v / 200 }} />}
      </div>
      <span className="text-right font-mono tabular-nums text-white/85">{v == null ? "—" : v}</span>
    </div>
  )
}

function WhyPanel({ score, mix, stats }: { score: Score | null | undefined; mix: Mix | null | undefined; stats: Stats30d | null | undefined }) {
  if (!score && !mix && !stats) return <p className="text-xs text-white/45">Scoring not yet available for this wallet.</p>
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <ScoreChip score={score} />
          <span className="font-mono text-2xl font-bold tabular-nums text-white/90">{score ? score.copyability : "—"}</span>
          <span className="text-[11px] text-white/50">/ 100 copyability{score ? ` · ${GRADE_WORD[score.grade]}` : ""}</span>
        </div>
        <div className="mt-3 space-y-1.5">
          {SUBSCORES.map((s) => (
            <ScoreBar key={s.k} label={s.l} value={score?.[s.k]} hint={s.hint} />
          ))}
        </div>
        {score?.reasons?.length ? (
          <ul className="mt-3 list-disc space-y-0.5 pl-4 text-[12px] leading-snug text-white/80">
            {score.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[11px] text-white/45">No reasons recorded.</p>
        )}
      </div>
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL}>Asset mix · 30d volume</span>
          <span className="font-mono text-xs tabular-nums text-white/85">{mix ? `${fmtRate(mix.copyableSharePct)} copyable` : "—"}</span>
        </div>
        <div className="mt-2">
          <MixBar mix={mix} width={999} showNumber={false} className="w-full [&>span]:w-full [&>span>span]:w-full" />
        </div>
        <MixLegend className="mt-2" />
        {mix && (
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr>
                <th scope="col" className={cn(TH, "pl-0 text-left")}>Group</th>
                <th scope="col" className={cn(TH, "text-right")}>Share</th>
                <th scope="col" className={cn(TH, "text-right")}>Volume</th>
                <th scope="col" className={cn(TH, "pr-0 text-right")}>Trades</th>
              </tr>
            </thead>
            <tbody>
              {([...ASSET_GROUPS, "OTHER"] as const).map((k) => {
                const s = mix.byAsset?.[k]
                return (
                  <tr key={k} className="border-t border-white/[0.05]">
                    <td className={cn(TD, "pl-0 font-sans")}>
                      <span aria-hidden className="mr-1.5 inline-block size-2 rounded-sm align-middle" style={{ backgroundColor: MIX_COLORS[k] }} />
                      <span className="text-white/80">{k}</span>
                    </td>
                    <td className={cn(TD, "text-right text-white/85")}>{fmtRate(s?.sharePct)}</td>
                    <td className={cn(TD, "text-right text-white/70")}>{fmtUsd(s?.volumeUsd)}</td>
                    <td className={cn(TD, "pr-0 text-right text-white/70")}>{fmtInt(s?.trades)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {mix?.topCoins?.length ? (
          <p className="mt-2 text-[11px] text-white/50">
            Top markets:{" "}
            {mix.topCoins.map((c, i) => (
              <span key={c.coin} className="font-mono text-white/75">
                {i > 0 && <span className="text-white/35">, </span>}
                {c.coin} {fmtRate(c.sharePct)}
              </span>
            ))}
          </p>
        ) : null}
        {mix && <p className="mt-1 text-[11px] text-white/45">By trade count: {fmtRate(mix.copyableTradeSharePct)} copyable.</p>}
      </div>
      {stats && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 font-mono text-[11px] tabular-nums text-white/60 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-6">
          <div>
            <dt className="font-sans text-[10px] uppercase tracking-[0.08em] text-white/45">Trades/day</dt>
            <dd className="text-white/85">{fmtNum(stats.tradesPerDay)}</dd>
          </div>
          <div>
            <dt className="font-sans text-[10px] uppercase tracking-[0.08em] text-white/45">Avg hold</dt>
            <dd className="text-white/85">{stats.avgHoldMin == null ? "—" : stats.avgHoldMin < 60 ? `${Math.round(stats.avgHoldMin)}m` : stats.avgHoldMin < 1440 ? `${(stats.avgHoldMin / 60).toFixed(1)}h` : `${(stats.avgHoldMin / 1440).toFixed(1)}d`}</dd>
          </div>
          <div>
            <dt className="font-sans text-[10px] uppercase tracking-[0.08em] text-white/45">Median lev</dt>
            <dd className="text-white/85">{stats.medianLeverage == null ? "—" : `${stats.medianLeverage}x`}</dd>
          </div>
          <div>
            <dt className="font-sans text-[10px] uppercase tracking-[0.08em] text-white/45">Max DD</dt>
            <dd style={{ color: stats.maxDrawdownPct != null && stats.maxDrawdownPct > 25 ? AMBER : "rgba(255,255,255,0.85)" }}>{stats.maxDrawdownPct == null ? "—" : `-${stats.maxDrawdownPct.toFixed(1)}%`}</dd>
          </div>
          <div>
            <dt className="font-sans text-[10px] uppercase tracking-[0.08em] text-white/45">Profitable wks</dt>
            <dd className="text-white/85">{fmtRate(stats.profitableWeeksPct)}</dd>
          </div>
          <div>
            <dt className="font-sans text-[10px] uppercase tracking-[0.08em] text-white/45">Copyable · other</dt>
            <dd>
              <span style={{ color: signColor(stats.pnlCopyable) ?? "rgba(255,255,255,0.85)" }}>{fmtUsd(stats.pnlCopyable, { sign: true })}</span>
              <span className="text-white/35"> · </span>
              <span style={{ color: signColor(stats.pnlOther) ?? "rgba(255,255,255,0.6)" }}>{fmtUsd(stats.pnlOther, { sign: true })}</span>
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}

function AssetTile({ a, coin }: { a: AssetStats | null | undefined; coin: AssetGroup }) {
  if (!a) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 opacity-70">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2 rounded-sm" style={{ backgroundColor: MIX_COLORS[coin] }} />
          <span className={LABEL}>{coin}</span>
        </div>
        <div className="mt-1 font-mono text-sm text-white/40">No {coin} fills in 30d</div>
      </div>
    )
  }
  const n = a.wins + a.losses
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2 rounded-sm" style={{ backgroundColor: MIX_COLORS[coin] }} />
          <span className={LABEL}>{coin} · 30d</span>
        </span>
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
        {a.coins && a.coins.length > 0 && (
          <>
            <dt>Markets</dt>
            <dd className="truncate text-right text-white/70" title={a.coins.join(", ")}>{a.coins.join(" ")}</dd>
          </>
        )}
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
            const g = groupOf(p.coin)
            return (
              <tr key={`${p.coin}-${p.side}-${i}`} className="border-t border-white/[0.05]">
                <td className={cn(TD, "font-bold text-white")}>
                  <span aria-hidden className="mr-1.5 inline-block size-2 rounded-sm align-middle" style={{ backgroundColor: MIX_COLORS[g] }} />
                  {p.coin}
                </td>
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
              <td className={cn(TD, "text-white/70")}>
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
  const positions = useMemo(() => (d ? (effAsset === "ALL" ? d.openPositions : d.openPositions.filter((p) => GROUP_COINS[effAsset].includes(p.coin))) : []), [d, effAsset])
  const explorer = d?.links?.hyperliquid ?? (row ? addressUrl(row.address) : "#")
  // Market to open on Hyperliquid: the trader's own market inside the selected group, else the group's primary market.
  const copyCoin = asset === "ALL" ? (row?.openForAsset?.coin ?? positions[0]?.coin ?? "BTC") : (row?.asset?.coins?.[0] ?? d?.perAsset?.[asset]?.coins?.[0] ?? GROUP_COINS[asset][0])
  const series = d ? (range === "month" ? d.pnlHistory.month : d.pnlHistory.allTime) : []
  const totalUpnl = d ? d.openPositions.reduce((s, p) => s + p.unrealizedPnl, 0) : row?.open.unrealizedPnl
  const score = d?.score ?? row?.score
  const mix = d?.mix ?? row?.mix
  const stats = d?.stats30d ?? row?.stats30d

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
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto border-white/10 bg-[#0A0E17] text-white sm:max-w-[760px]" style={themeStyle(RNG_THEME)}>
        {row && (
          <>
            <SheetHeader className="pr-10">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-white">
                <Wallet className="size-4 text-white/50" aria-hidden />
                <span className="font-semibold">{row.displayName ?? shortAddr(row.address)}</span>
                <ScoreChip score={score} />
                <span className="font-mono text-xs text-white/50">#{row.rank}</span>
                {isFetching && !isLoading && <span className="text-[11px] text-white/40">refreshing…</span>}
              </SheetTitle>
              <SheetDescription className="text-xs text-white/60">Public on-chain activity for one Hyperliquid account. Not advice; past results do not predict the next trade.</SheetDescription>
              <div className="flex flex-wrap items-center gap-1 font-mono text-[11px] text-white/70">
                <span className="break-all">{row.address}</span>
                <CopyButton text={row.address} size="md" />
                <a href={explorer} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-[11px] text-white/70 hover:bg-white/[0.06] hover:text-white", FOCUS_RING)}>
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

              <Section title="Why this wallet">
                <WhyPanel score={score} mix={mix} stats={stats} />
              </Section>

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
                  {ASSET_GROUPS.map((g) => (
                    <AssetTile key={g} coin={g} a={d ? d.perAsset?.[g] : row.asset?.coin === g ? row.asset : undefined} />
                  ))}
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
