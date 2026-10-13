"use client"

import React, { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Area, AreaChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Activity, ChevronRight, CheckCircle2, Clock, Flame, Info, Percent, Target, Timer, TrendingDown, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import { RNG_THEME, themeStyle } from "../themes"
import { Chip } from "../shared"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { NormalizedSignal, PerformanceStats, Bucket } from "@/app/api/signals/history/performance"
import type { OpenSignalV2, PerfCalBucket, PerfEquityPointV2, PerformanceStatsV2, SignalRowV2 } from "../types"
import { AMBER, CARD, CardTitle, GRAY, GREEN, Hint, Kpi, LINE, NotYet, RED, Rate, Segmented, TOOLTIP_STYLE, ago, dur, fmtCi, fmtPct, fmtPrice, fmtR, rColor, rateCi, shortDate, utc } from "./perf-shared"
import RHistogram from "./RHistogram"
import ReliabilityPlot from "./ReliabilityPlot"
import ComponentsTable from "./ComponentsTable"
import ShadowCard from "./ShadowCard"
import LedgerCard from "./LedgerCard"
import ChangelogCard from "./ChangelogCard"
import AuditDrawer, { type AuditRow } from "./AuditDrawer"

type OpenSig = NormalizedSignal & SignalRowV2 & OpenSignalV2 & { markPrice: number | null; unrealizedR: number | null; distToNextTpR: number | null; distToSlR: number | null; ageMin: number }
type Stats = Omit<PerformanceStats, "equity"> & PerformanceStatsV2 & { equity: (PerformanceStats["equity"][number] & PerfEquityPointV2)[] }
interface Resp {
  signals: AuditRow[]
  open: OpenSig[]
  stats: Stats
  meta: Stats["meta"] & { closedN: number; openN: number }
}
type Mode = "net" | "gross"

// Every trade links to the live signal page for its ticker; Strike carries the full market set.
const signalHref = (symbol: string) => `/signals/strike?symbol=${encodeURIComponent(symbol)}`
const STALL_MIN = 15

function TpBadges({ s }: { s: NormalizedSignal }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {([1, 2, 3] as const).map((l) => {
        const hit = s.tpLevels.find((t) => t.level === l)
        const minutes = hit?.at ? Math.round((hit.at - s.timestamp) / 60e3) : null
        return (
          <span
            key={l}
            title={hit ? `TP${l} hit${minutes != null ? ` after ${dur(minutes)}` : ""} at ${fmtPrice(hit.price)}` : `TP${l} not reached`}
            className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-px font-mono text-[11px] font-bold"
            style={hit ? { color: GREEN, backgroundColor: `${GREEN}18`, border: `1px solid ${GREEN}40` } : { color: "#6B7280", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            TP{l} {hit ? "✓" : "—"}
            {hit && minutes != null && <span className="opacity-70">{dur(minutes)}</span>}
          </span>
        )
      })}
      {s.stoppedAfterTp != null && (
        <span className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-px font-mono text-[11px] font-bold" style={{ color: s.stoppedAfterTp === 0 ? RED : AMBER, backgroundColor: `${s.stoppedAfterTp === 0 ? RED : AMBER}18`, border: `1px solid ${s.stoppedAfterTp === 0 ? RED : AMBER}40` }}>
          {s.stoppedAfterTp === 0 ? "STOPPED" : `STOP after TP${s.stoppedAfterTp}`}
        </span>
      )}
      {!s.open && s.closedReason === "horizon" && s.highestTp === 0 && <span className="rounded-md px-1.5 py-px font-mono text-[11px] text-[#9CA3AF] border border-white/10">EXPIRED</span>}
      {s.excluded && <span title="Entry never filled or could not be verified; not counted" className="rounded-md px-1.5 py-px font-mono text-[11px] text-[#9CA3AF] border border-dashed border-white/20">{s.closedReason === "unfilled" ? "UNFILLED" : "UNVERIFIABLE"}</span>}
      {s.open && <span className="rounded-md px-1.5 py-px font-mono text-[11px] border" style={{ color: "var(--brand)", borderColor: "color-mix(in srgb, var(--brand) 40%, transparent)" }}>{s.fillStatus === "pending" ? "PENDING FILL" : "OPEN"}</span>}
      {s.duplicatesMerged > 0 && <span className="text-[11px] text-[#9CA3AF]" title="Near-identical logs merged">+{s.duplicatesMerged} dup</span>}
    </div>
  )
}

const TH = "text-[11px] font-medium uppercase tracking-[0.08em] text-white/50"

function BucketTable({ rows, label, minN = 8, mode, base }: { rows: (Bucket & Partial<PerfCalBucket>)[]; label: string; minN?: number; mode: Mode; base: number }) {
  if (!rows.length) return <div className="text-xs text-[#9CA3AF]">No closed signals in this cut yet.</div>
  const hasNet = rows.some((b) => b.meanNetR != null)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className={TH}>
            <th scope="col" className="text-left font-medium py-1">{label}</th>
            <th scope="col" className="text-right font-medium">n</th>
            <th scope="col" className="text-right font-medium">TP1 [95%]</th>
            <th scope="col" className="text-right font-medium">Exp. {mode === "net" && hasNet ? "net" : ""}</th>
            <th scope="col" className="text-right font-medium hidden sm:table-cell">W / L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const thin = b.n < minN
            const exp = mode === "net" && hasNet ? b.meanNetR ?? null : b.expectancyR
            return (
              <tr key={b.key} className={cn("border-t border-white/[0.05]", thin && "opacity-50")} title={thin ? `n=${b.n} below ${minN}; treat as anecdotal` : undefined}>
                <td className="py-1.5 font-medium text-white/85">{b.key}</td>
                <td className="text-right font-mono tabular-nums text-[#9CA3AF]">{b.n}</td>
                <td className="text-right"><Rate rate={b.tp1Rate} n={b.n} lo={b.wilsonLo} hi={b.wilsonHi} base={base} /></td>
                <td className="text-right font-mono tabular-nums" style={{ color: rColor(exp, b.n) ?? (exp == null ? GRAY : undefined) }}>{fmtR(exp)}</td>
                <td className="text-right font-mono tabular-nums text-[#9CA3AF] hidden sm:table-cell">{b.wins} / {b.losses}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CalibrationTable({ rows, label, mode, base }: { rows: PerfCalBucket[]; label: string; mode: Mode; base: number }) {
  if (!rows.length) return null
  const rich = rows.some((b) => b.meanConf != null || b.pPos != null || b.brierNaive != null)
  if (!rich) return <BucketTable rows={rows} label={label} mode={mode} base={base} />
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className={TH}>
            <th scope="col" className="text-left font-medium py-1">{label}</th>
            <th scope="col" className="text-right font-medium">n</th>
            <th scope="col" className="text-right font-medium">conf</th>
            <th scope="col" className="text-right font-medium">TP1 [95%]</th>
            <th scope="col" className="text-right font-medium hidden sm:table-cell">P(R&gt;0)</th>
            <th scope="col" className="text-right font-medium">{mode === "net" ? "net R" : "R"}</th>
            <th scope="col" className="text-right font-medium hidden md:table-cell">Brier</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const thin = b.n < 8
            const r = mode === "net" ? b.meanNetR ?? b.expectancyR : b.expectancyR
            return (
              <tr key={b.key} className={cn("border-t border-white/[0.05]", thin && "opacity-50")}>
                <td className="py-1.5 font-medium text-white/85">{b.key}</td>
                <td className="text-right font-mono tabular-nums text-[#9CA3AF]">{b.n}</td>
                <td className="text-right font-mono tabular-nums text-white/70">{b.meanConf == null ? "—" : b.meanConf.toFixed(0)}</td>
                <td className="text-right"><Rate rate={b.tp1Rate} n={b.n} lo={b.wilsonLo} hi={b.wilsonHi} base={base} /></td>
                <td className="text-right font-mono tabular-nums text-white/70 hidden sm:table-cell">{fmtPct(b.pPos)}</td>
                <td className="text-right font-mono tabular-nums" style={{ color: rColor(r, b.n) ?? (r == null ? GRAY : undefined) }}>{fmtR(r)}</td>
                <td className="text-right font-mono tabular-nums text-white/70 hidden md:table-cell" title={b.brierCal != null ? `calibrated ${b.brierCal.toFixed(3)}` : undefined}>{b.brierNaive == null ? "—" : b.brierNaive.toFixed(3)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Peak-to-trough span of the deepest drawdown on a cumulative series. */
function deepestDrawdown(series: { i: number; v: number }[]): { from: number; to: number; depth: number } | null {
  let peakI = series[0]?.i ?? 0
  let peak = series[0]?.v ?? 0
  let best: { from: number; to: number; depth: number } | null = null
  for (const p of series) {
    if (p.v > peak) {
      peak = p.v
      peakI = p.i
    }
    const dd = peak - p.v
    if (dd > 0 && (!best || dd > best.depth)) best = { from: peakI, to: p.i, depth: dd }
  }
  return best
}

const f3 = (x: number | null | undefined) => (x == null ? "—" : x.toFixed(3))
const f2s = (x: number | null | undefined) => (x == null ? "—" : `${x > 0 ? "+" : ""}${x.toFixed(2)}`)
const RANGES = [{ k: "7", l: "7d" }, { k: "30", l: "30d" }, { k: "90", l: "90d" }, { k: "all", l: "All" }]
const GRADES = ["A+", "A", "B", "C"]
const TABS = [
  { k: "bySymbol", l: "Symbol", col: "Symbol" },
  { k: "byClass", l: "Asset class", col: "Class" },
  { k: "byBias", l: "Bias", col: "Bias" },
  { k: "byTradeType", l: "Horizon", col: "Trade type" },
  { k: "byHourUtc", l: "Hour (UTC)", col: "Hour" },
  { k: "byWeekday", l: "Weekday", col: "Day" },
  { k: "byOilRegime", l: "OIL regime", col: "Regime" },
  { k: "byRegime", l: "Cloud/200MA", col: "Regime factor" },
  { k: "byRegimeAlignment", l: "With / against regime", col: "Alignment" },
  { k: "byEngineVersion", l: "Engine", col: "Version" },
  { k: "byEntryType", l: "Entry type", col: "Entry" },
  { k: "byRr1", l: "rr1", col: "rr1" },
  { k: "byAtrPct", l: "ATR %", col: "ATR % of price" },
] as const

export default function PerformanceDashboard() {
  const [range, setRange] = useState("30")
  const [assets, setAssets] = useState<string[]>([])
  const [grades, setGrades] = useState<string[]>([])
  const [bias, setBias] = useState<"" | "LONG" | "SHORT">("")
  const [dedupe, setDedupe] = useState(true)
  const [tab, setTab] = useState<(typeof TABS)[number]["k"]>("bySymbol")
  const [showAll, setShowAll] = useState(false)
  const [userMode, setUserMode] = useState<Mode | null>(null)
  const [auditRow, setAuditRow] = useState<AuditRow | null>(null)

  const qs = new URLSearchParams({ view: "performance", range, dedupe: dedupe ? "1" : "0" })
  if (assets.length) qs.set("asset", assets.join(","))
  if (grades.length) qs.set("grade", grades.join(","))
  if (bias) qs.set("bias", bias)

  const { data, isLoading, isError } = useQuery<Resp>({
    queryKey: ["performance", qs.toString()],
    queryFn: async () => {
      const r = await fetch(`/api/signals/history?${qs.toString()}`)
      if (!r.ok) throw new Error(`history ${r.status}`)
      return r.json()
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const symbolsPresent = useMemo(() => {
    const s = new Set<string>()
    for (const x of data?.signals ?? []) s.add(x.symbol)
    for (const x of data?.open ?? []) s.add(x.symbol)
    return [...s].sort()
  }, [data])

  const k = data?.stats.kpis
  const hasNet = k?.expectancyNetR != null
  const mode: Mode = userMode ?? (hasNet ? "net" : "gross")
  const net = mode === "net" && hasNet
  const early = (k?.closedN ?? 0) < 20
  const decidedN = k?.decidedN ?? k?.closedN ?? 0
  const closedN = k?.closedN ?? 0
  const rows = showAll ? data?.signals ?? [] : (data?.signals ?? []).slice(0, 40)
  const base = k?.tp1Rate ?? 50
  const brier = data?.stats.calibration.brier ?? null
  // Clock for "time left" and "stalled" reads: the response timestamp, so render stays pure.
  const now = data ? new Date(data.meta.generatedAt).getTime() : 0

  // Current engine version: meta first, then the latest versions[] row, then the newest signal.
  const versions = useMemo(() => [...(data?.stats.versions ?? [])].sort((a, b) => b.lastAt - a.lastAt), [data])
  const engineVersion = data?.stats.meta.engineVersion ?? versions[0]?.version ?? data?.signals[0]?.engineVersion ?? null
  const engineSince = data?.stats.meta.engineVersionSince ?? versions[0]?.firstAt ?? null

  const equity = useMemo(() => {
    const e = data?.stats.equity ?? []
    const hasNetCurve = e.some((p) => p.cumNetR != null)
    const pts = e.map((p) => ({ ...p, shown: net && hasNetCurve ? p.cumNetR ?? p.cumR : p.cumR, ghost: hasNetCurve ? p.cumR : null }))
    const dd = deepestDrawdown(pts.map((p) => ({ i: p.i, v: p.shown })))
    return { pts, hasNetCurve, dd }
  }, [data, net])

  const costTitle = k?.costModel ? `${k.costModel.venue}: taker ${k.costModel.takerBps}bp, maker ${k.costModel.makerBps}bp, slip ${k.costModel.slipBps}bp, funding ${k.costModel.fundingApplied ? "applied" : "not applied"}` : "Cost model not yet available; all numbers are gross"

  const cal = data?.stats.calibration
  const expectancyShown = net ? k?.expectancyNetR : k?.expectancyR
  const pfShown = net ? k?.profitFactorNet : k?.profitFactor
  const ddShown = net ? k?.maxDrawdownNetR ?? k?.maxDrawdownR : k?.maxDrawdownR
  const tp1Ci = k ? rateCi(k.tp1Rate, decidedN) : null

  return (
    <TooltipProvider>
      <div className="min-h-screen pt-24 pb-16 overflow-x-hidden" style={themeStyle(RNG_THEME)}>
        <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-8 space-y-4 lg:space-y-5">
          <div className={cn(CARD, "flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between")} style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--brand) 10%, transparent) 0%, rgb(var(--surface-rgb) / 0.55) 60%)" }}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Trophy className="size-5" style={{ color: "var(--brand)" }} />
                <h1 className="font-display text-xl sm:text-2xl font-bold text-white">Signal Performance</h1>
              </div>
              <p className="mt-1 text-[13px] leading-snug text-[#9CA3AF]">Every logged call, checked against 5-minute candles. Each take-profit is recorded the moment it is touched; a stop before TP1 is a loss and a stop after a TP keeps the targets already reached.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Segmented label="Range" value={range} onChange={setRange} options={RANGES} />
              <Segmented label="Bias" value={bias} onChange={setBias} options={[{ k: "" as const, l: "Both" }, { k: "LONG" as const, l: "Long" }, { k: "SHORT" as const, l: "Short" }]} activeColor={(b) => (b === "SHORT" ? RED : b === "LONG" ? GREEN : undefined)} />
              <div className="flex gap-1" role="group" aria-label="Grades">
                {GRADES.map((g) => (
                  <button key={g} type="button" aria-pressed={grades.includes(g)} onClick={() => setGrades((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]))} className={cn("rounded-md border px-2 py-1 font-mono font-bold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)]", grades.includes(g) ? "border-transparent text-[#06080F]" : "border-white/10 text-[#9CA3AF] hover:text-white")} style={grades.includes(g) ? { backgroundColor: "var(--brand)" } : undefined}>
                    {g}
                  </button>
                ))}
              </div>
              <span title={costTitle}>
                <Segmented label="Net or gross of costs" value={mode} onChange={setUserMode} options={[{ k: "net" as const, l: "Net", disabled: !hasNet, title: costTitle }, { k: "gross" as const, l: "Gross", title: "Before fees, slippage and funding" }]} />
              </span>
              <label className="flex items-center gap-1.5 text-[#9CA3AF] cursor-pointer">
                <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} className="accent-[#00FF88]" /> merge duplicates
              </label>
            </div>
          </div>

          {symbolsPresent.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Assets">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Assets</span>
              <button type="button" aria-pressed={assets.length === 0} onClick={() => setAssets([])} className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)]", assets.length === 0 ? "border-transparent text-[#06080F]" : "border-white/10 text-[#9CA3AF]")} style={assets.length === 0 ? { backgroundColor: "var(--brand)" } : undefined}>All</button>
              {symbolsPresent.map((s) => (
                <button key={s} type="button" aria-pressed={assets.includes(s)} onClick={() => setAssets((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))} className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)]", assets.includes(s) ? "border-transparent text-[#06080F]" : "border-white/10 text-[#9CA3AF] hover:text-white")} style={assets.includes(s) ? { backgroundColor: "var(--brand)" } : undefined}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {isError && <div className={cn(CARD, "px-4 py-3 text-sm text-[#FF3B5C]")}>Could not load performance data.</div>}
          {isLoading && !data && <div className={cn(CARD, "h-40 animate-pulse")} />}

          {data && k && (
            <>
              {data.meta.provisional && (
                <div className="flex items-start gap-2 rounded-xl border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-4 py-3 text-xs text-white/85">
                  <Info className="mt-0.5 size-4 shrink-0 text-[#F59E0B]" />
                  <span>
                    <span className="font-bold text-[#F59E0B]">Provisional: <span className="font-mono">{data.stats.meta.decidedNCurrentVersion ?? decidedN}</span> of <span className="font-mono">{data.meta.provisionalTarget}</span> decided signals{data.stats.meta.decidedNCurrentVersion != null ? " on the current engine" : ""}.</span>{" "}
                    Every rate below is a preview until {data.meta.provisionalTarget} filled signals have reached a verdict on one engine version.
                    {engineVersion && <> Engine <span className="font-mono text-white">{engineVersion}</span>{engineSince ? ` since ${shortDate(engineSince)}` : ""}.</>}
                    {early ? ` ${data.meta.sampleNote}` : ""}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#9CA3AF]">
                <span className="font-semibold uppercase tracking-[0.14em]">Fill audit</span>
                <span><span className="font-mono text-white">{data.meta.filledN}</span> filled &amp; closed</span>
                <span><span className="font-mono text-white">{decidedN}</span> decided</span>
                <span><span className="font-mono text-white">{data.meta.pendingFillN}</span> awaiting fill</span>
                <span title="Entry never traded within the fill window; excluded from every rate"><span className="font-mono text-white">{data.meta.unfilledN}</span> unfilled</span>
                <span title="Candles needed to verify the fill are no longer available; excluded"><span className="font-mono text-white">{data.meta.unverifiableN}</span> unverifiable</span>
                <span title="Filled, but neither TP1 nor the stop was touched before the horizon. Counted in R, excluded from hit and stop rates"><span className="font-mono text-white">{data.meta.expiredN ?? 0}</span> expired, no verdict</span>
                {data.stats.meta.shadowN != null && data.stats.meta.shadowN > 0 && <span title="Calls declined by a gate and logged for audit only; never in any public number"><span className="font-mono text-white">{data.stats.meta.shadowN}</span> shadow, excluded</span>}
                {k.fillRate && (
                  <span title={`market n=${k.fillRate.nMarket}, limit n=${k.fillRate.nLimit}`}>fill rate mkt <span className="font-mono text-white">{fmtPct(k.fillRate.market)}</span> · lim <span className="font-mono text-white">{fmtPct(k.fillRate.limit)}</span></span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 2xl:grid-cols-8">
                <Kpi label="TP1 hit rate" icon={Target} value={<Rate rate={k.tp1Rate} n={decidedN} className="text-xl" />} sub={`n=${decidedN} decided${k.expiredN ? ` · ${k.expiredN} expired excluded` : ""}`} hint="Share of decided signals that touched TP1 before the stop. Bracket is the 95% Wilson interval. No color below n=30." />
                <Kpi
                  label={`Expectancy${net ? " net" : ""}`}
                  icon={Activity}
                  value={expectancyShown == null ? (early && !hasNet ? "n<20" : <NotYet what="Net expectancy" />) : fmtR(expectancyShown)}
                  ghost={hasNet ? `${fmtR(net ? k.expectancyR : k.expectancyNetR)} ${net ? "gross" : "net"}` : undefined}
                  color={rColor(expectancyShown, decidedN)}
                  sub={k.seExpectancyR != null ? `SE ±${k.seExpectancyR.toFixed(2)}R${k.expectancyConservativeR != null ? ` · ${fmtR(k.expectancyConservativeR)} conservative` : ""}` : k.expectancyConservativeR != null ? `${fmtR(k.expectancyConservativeR)} conservative · 50% at TP1, stop to BE` : k.sumR != null ? `${fmtR(k.sumR)} total` : undefined}
                  hint={net ? `Mean R per filled signal after costs. ${costTitle}` : "Mean R per filled signal before costs."}
                  dim={expectancyShown == null}
                />
                <Kpi
                  label={`Profit factor${net ? " net" : ""}`}
                  icon={Flame}
                  value={pfShown == null ? (early && !hasNet ? "n<20" : closedN && !net && k.profitFactor == null ? "no losses" : <NotYet what="Net profit factor" />) : pfShown.toFixed(2)}
                  ghost={hasNet && k.profitFactorNet != null && k.profitFactor != null ? `${(net ? k.profitFactor : k.profitFactorNet).toFixed(2)} ${net ? "gross" : "net"}` : undefined}
                  sub="ΣR⁺ / |ΣR⁻|"
                  color={pfShown == null || closedN < 30 ? undefined : pfShown >= 1.5 ? GREEN : pfShown < 1 ? RED : undefined}
                  dim={pfShown == null}
                />
                <Kpi
                  label={`Max drawdown${net ? " net" : ""}`}
                  icon={TrendingDown}
                  value={ddShown != null ? fmtR(-Math.abs(ddShown)) : equity.dd ? fmtR(-equity.dd.depth) : <NotYet what="Max drawdown" />}
                  ghost={hasNet && k.maxDrawdownR != null && k.maxDrawdownNetR != null ? `${fmtR(-Math.abs(net ? k.maxDrawdownR : k.maxDrawdownNetR))} ${net ? "gross" : "net"}` : undefined}
                  sub={k.longestUnderwaterDays != null ? `longest underwater ${k.longestUnderwaterDays}d` : ddShown == null && equity.dd ? `from the ${net && equity.hasNetCurve ? "net" : "gross"} curve, signals #${equity.dd.from} to #${equity.dd.to}` : undefined}
                  hint="Deepest peak-to-trough fall of the cumulative R curve, by close order."
                  dim={ddShown == null && !equity.dd}
                />
                <Kpi
                  label="Brier skill"
                  icon={Percent}
                  value={brier && brier.bss != null ? `BSS ${f2s(brier.bss)}` : <NotYet what="Brier skill score" />}
                  color={!brier || brier.bss == null || brier.n < 100 ? undefined : brier.bss > 0.05 ? GREEN : brier.bss < -0.05 ? RED : undefined}
                  sub={brier ? `Brier ${f3(brier.naive)} · base ${f3(brier.base)}${brier.calibrated != null ? ` · cal ${f3(brier.calibrated)}` : ""} · n ${brier.n}` : "needs calibration update"}
                  hint={brier ? `Murphy decomposition: reliability ${f3(brier.reliability)}, resolution ${f3(brier.resolution)}, uncertainty ${f3(brier.uncertainty)}, n=${brier.n}. BSS at or below zero means stated confidence carries no information beyond the base rate.` : "Brier skill score of the stated confidence against the base hit rate. At or below zero means the confidence number adds nothing."}
                  dim={!brier || brier.bss == null}
                />
                <Kpi
                  label="Fill rate"
                  icon={CheckCircle2}
                  value={k.fillRate ? <span>{fmtPct(k.fillRate.market)} <span className="text-[11px] text-white/50">mkt</span></span> : <NotYet what="Fill rate by entry type" />}
                  sub={k.fillRate ? `${fmtPct(k.fillRate.limit)} limit · n ${k.fillRate.nMarket}/${k.fillRate.nLimit}` : undefined}
                  hint="Share of published entries that verifiably traded inside the fill window, split by market and limit entries."
                  dim={!k.fillRate}
                />
                <Kpi
                  label="Expiry rate"
                  icon={Timer}
                  value={k.expiryRate != null ? fmtPct(k.expiryRate) : closedN ? fmtPct(closedN ? ((k.expiredN ?? 0) / closedN) * 100 : null) : <NotYet what="Expiry rate" />}
                  sub={`${k.expiredN ?? 0} of ${closedN} filled hit the horizon with no verdict`}
                  color={closedN >= 30 && (k.expiryRate ?? ((k.expiredN ?? 0) / Math.max(1, closedN)) * 100) >= 50 ? AMBER : undefined}
                  hint="Filled signals where neither TP1 nor the stop was touched before the horizon. Counted in R, excluded from hit rates. A high value means targets sit too far for the horizon."
                />
                <Kpi
                  label="Median hold"
                  icon={Clock}
                  value={k.medianHoldMin ? dur(k.medianHoldMin.winners) : dur(k.medianTimeToTp1Min)}
                  sub={k.medianHoldMin ? `winners · losers ${dur(k.medianHoldMin.losers)}` : k.ladder.n1 >= 5 ? `to TP1 · ${k.ladder.n1} winners` : "to TP1 · needs 5 winners"}
                  hint={k.medianHoldMin ? "Median time from fill to close for winners and for losers." : "Median time from signal to TP1 touch. Hold by winners and losers arrives with the measurement update."}
                  dim={k.medianHoldMin ? k.medianHoldMin.winners == null : k.medianTimeToTp1Min == null}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className={cn(CARD, "p-4 lg:col-span-2")}>
                  <CardTitle right={<span className="font-mono text-xs tabular-nums" style={{ color: rColor(equity.pts.at(-1)?.shown ?? null, closedN) }}>{fmtR(equity.pts.at(-1)?.shown ?? null)}</span>}>
                    Equity curve ({net && equity.hasNetCurve ? "net" : "gross"} cumulative R by close order)
                  </CardTitle>
                  {equity.pts.length >= 2 ? (
                    <div className="h-44" role="img" aria-label="Cumulative R by close order">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={equity.pts} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                          <defs>
                            <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={GREEN} stopOpacity={0.12} />
                              <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="i" tick={{ fill: GRAY, fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: GRAY, fontSize: 11, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}R`} />
                          {equity.dd && equity.dd.from !== equity.dd.to && <ReferenceArea x1={equity.dd.from} x2={equity.dd.to} fill="rgba(255,255,255,0.1)" stroke="none" />}
                          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => `Signal #${v}`} formatter={(v, name) => [`${Number(v).toFixed(2)}R`, name === "ghost" ? "Gross" : net && equity.hasNetCurve ? "Net" : "Cumulative"]} />
                          {equity.hasNetCurve && net && <Line type="monotone" dataKey="ghost" stroke="rgba(255,255,255,0.35)" strokeWidth={1} strokeDasharray="2 3" dot={false} isAnimationActive={false} name="ghost" />}
                          <Area type="monotone" dataKey="shown" stroke={LINE} strokeWidth={2} fill="url(#eq)" dot={equity.pts.length < 40 ? { r: 4, fill: LINE, stroke: "#0A0E17", strokeWidth: 2 } : false} isAnimationActive={false} name="shown" />
                          {equity.hasNetCurve && net && <Legend verticalAlign="top" height={20} iconType="plainline" formatter={(v) => <span className="text-[11px] text-white/60">{v === "ghost" ? "gross" : "net"}</span>} />}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="mt-6 text-sm text-[#9CA3AF]">Curve appears after two closed signals.</div>
                  )}
                  {equity.dd && <p className="mt-1 text-[11px] text-white/45">Shaded span: deepest drawdown, {fmtR(-equity.dd.depth)} from signal #{equity.dd.from} to #{equity.dd.to}.</p>}
                </div>

                <RHistogram bins={data.stats.rHistogram} mode={mode} seExpectancyR={k.seExpectancyR} shareAbove2R={k.shareAbove2R} n={closedN} />
              </div>

              <div className={cn(CARD, "p-4 space-y-3")}>
                <CardTitle right={<span className="text-[11px] text-white/50">stopped before TP1 <span className="font-mono text-white/80">{fmtPct(k.stopBeforeTpRate)}</span>{k.stopAfterTpRate != null && <> · {fmtPct(k.stopAfterTpRate)} of winners stopped later</>}</span>}>Target ladder</CardTitle>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {([
                    { l: "Reached TP1", v: k.tp1Rate, n: decidedN, sub: "of decided" },
                    { l: "TP1 → TP2", v: k.ladder.tp2GivenTp1, n: k.ladder.n1, sub: "of TP1 winners" },
                    { l: "TP2 → TP3", v: k.ladder.tp3GivenTp2, n: k.ladder.n2, sub: "of TP2 winners" },
                  ] as const).map((r) => (
                    <div key={r.l}>
                      <div className="flex items-baseline justify-between text-xs gap-2">
                        <span className="text-white/80">{r.l}</span>
                        <span><Rate rate={r.v} n={r.n} colorize={false} className="font-bold text-white" /> <span className="font-mono text-[#9CA3AF]">n={r.n}</span></span>
                      </div>
                      <div className="mt-1 h-1.5 rounded bg-white/[0.06]"><div className="h-1.5 rounded" style={{ width: `${r.v ?? 0}%`, backgroundColor: LINE }} /></div>
                      <div className="text-[11px] text-white/45">{r.sub}</div>
                    </div>
                  ))}
                </div>
                <div className="pt-1 text-[11px] text-[#9CA3AF] flex flex-wrap gap-x-4 gap-y-0.5">
                  <span>Median MFE <span className="font-mono">{fmtR(data.stats.excursion.medianMfeR)}</span> · MAE <span className="font-mono">{fmtR(data.stats.excursion.medianMaeR)}</span> <span className="opacity-70">(n={data.stats.excursion.n})</span></span>
                  <span>Winners ran <span className="font-mono">{fmtR(data.stats.excursion.winnersOvershootR)}</span> past TP1 · losers got within <span className="font-mono">{fmtR(data.stats.excursion.losersNearMissR)}</span></span>
                  <span>Best streak <span className="font-mono">{data.stats.streaks.maxWin}</span> wins · worst <span className="font-mono">{data.stats.streaks.maxLoss}</span> losses{data.stats.streaks.current.type && <> · now <span className="font-mono">{data.stats.streaks.current.length}</span> {data.stats.streaks.current.type}{data.stats.streaks.current.length > 1 ? "s" : ""}</>}</span>
                  <span>Open now <span className="font-mono text-white">{k.openN}</span></span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className={cn(CARD, "p-4")}>
                  <CardTitle>Calibration: stated vs realized</CardTitle>
                  <CalibrationTable rows={cal?.byConfidence ?? []} label="Confidence" mode={mode} base={base} />
                  {cal?.byGrade?.length ? <div className="mt-3"><CalibrationTable rows={cal.byGrade} label="Grade" mode={mode} base={base} /></div> : null}
                  {cal?.byRr1?.length ? <div className="mt-3"><CalibrationTable rows={cal.byRr1} label="rr1" mode={mode} base={base} /></div> : null}
                  {brier ? (
                    <p className="mt-2 font-mono text-[11px] text-white/60 tabular-nums">Brier naive {f3(brier.naive)} · base {f3(brier.base)} · BSS {f2s(brier.bss)} · rel {f3(brier.reliability)} · res {f3(brier.resolution)} · unc {f3(brier.uncertainty)} · n {brier.n}{cal?.platt ? ` · calibrated ${f3(brier.calibrated)} (${cal.platt.version}, holdout ${f3(cal.platt.holdoutBrier)})` : ""}</p>
                  ) : (
                    <p className="mt-2 text-[11px] text-white/45 flex items-center gap-1.5"><Hint text="Brier score, its Murphy decomposition and the skill score against the base rate appear once the calibration update ships." /> Brier decomposition not yet available.</p>
                  )}
                  <p className="mt-2 text-[11px] text-[#9CA3AF]">Well-calibrated calls have a realized rate close to the stated confidence; rows under n=8 are greyed. Brackets are 95% Wilson intervals; colors appear only when n ≥ 30 and the interval excludes the overall hit rate ({fmtPct(base)}).</p>
                </div>
                <ReliabilityPlot byConfidence={cal?.byConfidence} byPTp1={cal?.byPTp1} />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ComponentsTable rows={data.stats.components} />
                <ShadowCard shadow={data.stats.shadow} mode={mode} />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className={cn(CARD, "p-4")}>
                  <label className="md:hidden mb-2 flex items-center gap-2 text-[11px] text-white/50">
                    Breakdown
                    <select aria-label="Breakdown" value={tab} onChange={(e) => setTab(e.target.value as (typeof TABS)[number]["k"])} className="flex-1 rounded-md border border-white/10 bg-transparent px-2 py-1 text-white/85 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)]">
                      {TABS.map((t) => <option key={t.k} value={t.k} className="bg-[#111827]">{t.l}</option>)}
                    </select>
                  </label>
                  <div className="hidden md:flex flex-wrap gap-1 mb-2" role="tablist" aria-label="Breakdown">
                    {TABS.map((t) => (
                      <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)} className={cn("rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)]", tab === t.k ? "border-transparent text-[#06080F]" : "border-white/10 text-[#9CA3AF] hover:text-white")} style={tab === t.k ? { backgroundColor: "var(--brand)" } : undefined}>
                        {t.l}
                      </button>
                    ))}
                  </div>
                  <BucketTable rows={(data.stats.breakdowns as Record<string, Bucket[] | undefined>)[tab] ?? []} label={TABS.find((t) => t.k === tab)!.col} mode={mode} base={base} />
                </div>
                <div className={cn(CARD, "p-4")}>
                  <CardTitle>Engine versions</CardTitle>
                  {versions.length === 0 ? (
                    <p className="text-xs text-white/50 flex items-center gap-2"><NotYet what="Version date ranges" /> Per-version date ranges arrive with the measurement update. The Engine breakdown tab shows counts by version today.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className={TH}>
                            <th scope="col" className="text-left font-medium py-1">Version</th>
                            <th scope="col" className="text-left font-medium">From</th>
                            <th scope="col" className="text-left font-medium">To</th>
                            <th scope="col" className="text-right font-medium">n</th>
                            <th scope="col" className="text-right font-medium">net R</th>
                          </tr>
                        </thead>
                        <tbody>
                          {versions.map((v, i) => (
                            <tr key={v.version} className={cn("border-t border-white/[0.05]", i === 0 ? "text-white/90" : "text-white/60")}>
                              <td className="py-1.5 font-mono">{v.version}</td>
                              <td className="font-mono tabular-nums">{shortDate(v.firstAt)}</td>
                              <td className="font-mono tabular-nums">{i === 0 ? "now" : shortDate(v.lastAt)}</td>
                              <td className="text-right font-mono tabular-nums">{v.n}</td>
                              <td className="text-right font-mono tabular-nums" style={{ color: rColor(v.netR, v.n) }}>{fmtR(v.netR)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {data.open.length > 0 && (
                <div className={cn(CARD, "p-4")}>
                  <CardTitle>Open signals, live progress</CardTitle>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {data.open.map((s) => {
                      const stalled = s.checkerStalled ?? (s.lastCheckAt != null && now - s.lastCheckAt > STALL_MIN * 60e3)
                      const windowLeft = s.fillStatus === "pending" && s.fillWindowEndsAt != null ? Math.max(0, Math.round((s.fillWindowEndsAt - now) / 60e3)) : null
                      return (
                        <div key={s.id} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-xs space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <a href={signalHref(s.symbol)} className="font-mono font-bold text-white hover:underline" style={{ textDecorationColor: "var(--brand)" }}>{s.symbol}</a>
                            <span className="font-bold" style={{ color: s.bias === "LONG" ? GREEN : RED }}>{s.bias}</span>
                            <span className="text-[#9CA3AF]">{ago(s.timestamp)}</span>
                            <span className="ml-auto font-mono tabular-nums" style={{ color: (s.unrealizedR ?? 0) >= 0 ? GREEN : RED }}>{fmtR(s.unrealizedR)}</span>
                            {s.highestTp > 0 && <span className="rounded-md px-1 text-[11px] font-bold font-mono" style={{ color: GREEN, backgroundColor: `${GREEN}18` }}>TP{s.highestTp} ✓</span>}
                            <button type="button" onClick={() => setAuditRow(s)} aria-label={`Audit ${s.symbol} ${s.bias} call`} className="inline-flex items-center text-white/40 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)] rounded"><ChevronRight className="size-4" /></button>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#9CA3AF]">
                            <span className="font-mono" title="Distance to next target / to stop, in R">→TP {s.distToNextTpR == null ? "—" : s.distToNextTpR.toFixed(2)} · SL {s.distToSlR == null ? "—" : s.distToSlR.toFixed(2)}</span>
                            {s.fillStatus === "pending" && windowLeft != null && <span>fill window: <span className="font-mono text-white/80">{windowLeft === 0 ? "closing" : `${dur(windowLeft)} left`}</span></span>}
                            {s.lastCheckAt != null && <span>last check: <span className="font-mono text-white/80">{utc(s.lastCheckAt).replace(" UTC", "")} UTC candle</span></span>}
                            {s.coverageGap && <Chip color={AMBER} className="rounded-md normal-case tracking-normal" title="The checker was offline for part of this signal's life">coverage gap</Chip>}
                            {stalled && <Chip color={AMBER} className="rounded-md normal-case tracking-normal">checker stalled</Chip>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className={cn(CARD, "p-4")}>
                <CardTitle right={<span className="text-[11px] text-[#9CA3AF]">{data.signals.length} shown{data.meta.duplicatesMerged ? ` · ${data.meta.duplicatesMerged} duplicate log${data.meta.duplicatesMerged > 1 ? "s" : ""} merged` : ""}</span>}>Signal log</CardTitle>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className={TH}>
                        <th scope="col" className="text-left font-medium py-1">Time</th>
                        <th scope="col" className="text-left font-medium">Symbol</th>
                        <th scope="col" className="text-left font-medium">Bias</th>
                        <th scope="col" className="text-right font-medium">Entry</th>
                        <th scope="col" className="text-right font-medium" title="Calibrated P(TP1) / stated confidence and grade">pTP1 / conf</th>
                        <th scope="col" className="text-left font-medium pl-4">Targets</th>
                        <th scope="col" className="text-right font-medium">R {hasNet ? "net (gross)" : ""}</th>
                        <th scope="col" className="text-right font-medium">MFE / MAE</th>
                        <th scope="col" className="text-right font-medium"><span className="sr-only">Audit</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s) => {
                        const rShown = s.open ? null : s.excluded ? null : hasNet ? s.realizedNetR ?? s.realizedR : s.realizedR
                        const reason = s.reasonText ?? null
                        return (
                          <React.Fragment key={s.id}>
                            <tr onClick={() => setAuditRow(s)} className={cn("cursor-pointer border-t border-white/[0.05] hover:bg-white/[0.04]", reason && "border-b-0")}>
                              <td className="py-2 text-[#9CA3AF] whitespace-nowrap">{ago(s.timestamp)}</td>
                              <td className="font-mono font-bold text-white"><a href={signalHref(s.symbol)} onClick={(e) => e.stopPropagation()} className="hover:underline" style={{ textDecorationColor: "var(--brand)" }}>{s.symbol}</a></td>
                              <td className="font-bold" style={{ color: s.bias === "LONG" ? GREEN : RED }}>{s.bias}</td>
                              <td className="text-right font-mono tabular-nums text-white/85">${fmtPrice(s.entry)}</td>
                              <td className="text-right font-mono tabular-nums text-[#9CA3AF]">{s.pTp1 != null ? `${Math.round(s.pTp1 * 100)}% / ` : "— / "}{s.confidence} <span className="opacity-70">{s.grade}</span></td>
                              <td className="pl-4"><TpBadges s={s} /></td>
                              <td className="text-right font-mono tabular-nums whitespace-nowrap" style={{ color: rShown == null ? GRAY : rShown > 0 ? GREEN : rShown < 0 ? RED : "#F9FAFB" }}>
                                {s.open ? (s.fillStatus === "pending" ? "pending fill" : "open") : s.excluded ? "n/a" : fmtR(rShown)}
                                {!s.open && !s.excluded && hasNet && s.realizedNetR != null && <span className="text-white/50"> ({fmtR(s.realizedR)})</span>}
                              </td>
                              <td className="text-right font-mono tabular-nums text-[#9CA3AF]">{s.mfeR == null ? "—" : `+${s.mfeR.toFixed(2)}`} / {s.maeR == null ? "—" : `-${s.maeR.toFixed(2)}`}</td>
                              <td className="text-right">
                                <button type="button" onClick={(e) => { e.stopPropagation(); setAuditRow(s) }} aria-label={`Audit ${s.symbol} ${s.bias} call from ${utc(s.timestamp)}`} className="inline-flex items-center gap-0.5 text-[11px] text-white/50 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)] rounded px-1">audit <ChevronRight className="size-3.5" /></button>
                              </td>
                            </tr>
                            {reason && (
                              <tr onClick={() => setAuditRow(s)} className="cursor-pointer hover:bg-white/[0.04]">
                                <td colSpan={9} className="pb-2 pl-1 text-[12px] leading-snug text-white/55">{reason}</td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden space-y-2">
                  {rows.map((s) => {
                    const rShown = s.open ? null : s.excluded ? null : hasNet ? s.realizedNetR ?? s.realizedR : s.realizedR
                    return (
                      <button type="button" key={s.id} onClick={() => setAuditRow(s)} className="block w-full text-left rounded-lg border border-white/[0.06] bg-black/20 p-3 text-xs space-y-1.5 transition-colors hover:border-white/20 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)]">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white">{s.symbol}</span>
                          <span className="font-bold" style={{ color: s.bias === "LONG" ? GREEN : RED }}>{s.bias}</span>
                          <span className="text-[#9CA3AF]">{ago(s.timestamp)}</span>
                          <span className="ml-auto font-mono tabular-nums" style={{ color: rShown == null ? GRAY : rShown > 0 ? GREEN : RED }}>{s.open ? (s.fillStatus === "pending" ? "pending fill" : "open") : s.excluded ? "n/a" : fmtR(rShown)}</span>
                          <ChevronRight className="size-4 text-white/40" />
                        </div>
                        <div className="text-[#9CA3AF] font-mono">Entry ${fmtPrice(s.entry)} · {s.pTp1 != null ? `${Math.round(s.pTp1 * 100)}% / ` : ""}{s.confidence} {s.grade}</div>
                        <TpBadges s={s} />
                        {s.reasonText && <div className="text-[12px] leading-snug text-white/55">{s.reasonText}</div>}
                      </button>
                    )
                  })}
                </div>
                {data.signals.length > 40 && (
                  <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 text-[11px] text-[#9CA3AF] hover:text-white">{showAll ? "Show fewer" : `Show all ${data.signals.length}`}</button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <LedgerCard ledger={data.stats.ledger} recordCount={data.meta.totalRaw} />
                <ChangelogCard seed={data.stats.changelog} />
              </div>

              <div className="flex items-start gap-2 text-[11px] text-[#9CA3AF]">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                <span>{data.meta.assumptions} Generated {new Date(data.meta.generatedAt).toLocaleTimeString()}.{tp1Ci && ` TP1 interval ${fmtCi(tp1Ci)}.`}</span>
              </div>
            </>
          )}
        </div>
        <AuditDrawer row={auditRow} onClose={() => setAuditRow(null)} />
      </div>
    </TooltipProvider>
  )
}
