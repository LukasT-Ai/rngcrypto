"use client"

import React, { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Activity, ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, Flame, Info, Target, Trophy, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { RNG_THEME, themeStyle } from "../themes"
import type { NormalizedSignal, PerformanceStats, Bucket } from "@/app/api/signals/history/performance"

type OpenSig = NormalizedSignal & { markPrice: number | null; unrealizedR: number | null; distToNextTpR: number | null; distToSlR: number | null; ageMin: number }
interface Resp {
  signals: NormalizedSignal[]
  open: OpenSig[]
  stats: PerformanceStats
  meta: PerformanceStats["meta"] & { closedN: number; openN: number }
}

const GREEN = "#00FF88"
const RED = "#FF3B5C"
const AMBER = "#F59E0B"
const GRAY = "#9CA3AF"
// Every trade links to the live signal page for its ticker; Strike carries the full market set.
const signalHref = (symbol: string) => `/signals/strike?symbol=${encodeURIComponent(symbol)}`

const CARD = "rounded-2xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.55)] backdrop-blur-xl"

const fmtR = (r: number | null | undefined, dp = 2) => (r == null ? "—" : `${r > 0 ? "+" : ""}${r.toFixed(dp)}R`)
const fmtPct = (p: number | null | undefined) => (p == null ? "—" : `${p.toFixed(p >= 10 ? 0 : 1)}%`)
const fmtPrice = (n: number) => (n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toFixed(6))
const ago = (ts: number) => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60e3))
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`
}
const dur = (min: number | null) => (min == null ? "—" : min < 60 ? `${min}m` : min < 1440 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`)

function Kpi({ label, value, sub, color, icon: Icon, dim }: { label: string; value: string; sub?: string; color?: string; icon: React.ElementType; dim?: boolean }) {
  return (
    <div className={cn(CARD, "px-4 py-3", dim && "opacity-60")}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
        <Icon className="size-3.5" style={{ color: color ?? "var(--brand)" }} />
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-black tabular-nums" style={{ color: color ?? "#F9FAFB" }}>{value}</div>
      {sub && <div className="text-[11px] text-[#9CA3AF]">{sub}</div>}
    </div>
  )
}

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
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-px font-mono text-[10px] font-bold"
            style={hit ? { color: GREEN, backgroundColor: `${GREEN}18`, border: `1px solid ${GREEN}40` } : { color: "#6B7280", backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            TP{l} {hit ? "✓" : "—"}
            {hit && minutes != null && <span className="opacity-70">{dur(minutes)}</span>}
          </span>
        )
      })}
      {s.stoppedAfterTp != null && (
        <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-px font-mono text-[10px] font-bold" style={{ color: s.stoppedAfterTp === 0 ? RED : AMBER, backgroundColor: `${s.stoppedAfterTp === 0 ? RED : AMBER}18`, border: `1px solid ${s.stoppedAfterTp === 0 ? RED : AMBER}40` }}>
          {s.stoppedAfterTp === 0 ? "STOPPED" : `STOP after TP${s.stoppedAfterTp}`}
        </span>
      )}
      {!s.open && s.closedReason === "horizon" && s.highestTp === 0 && <span className="rounded px-1.5 py-px font-mono text-[10px] text-[#9CA3AF] border border-white/10">EXPIRED</span>}
      {s.excluded && <span title="Entry never filled or could not be verified; not counted" className="rounded px-1.5 py-px font-mono text-[10px] text-[#9CA3AF] border border-dashed border-white/20">{s.closedReason === "unfilled" ? "UNFILLED" : "UNVERIFIABLE"}</span>}
      {s.open && <span className="rounded px-1.5 py-px font-mono text-[10px] border" style={{ color: "var(--brand)", borderColor: "color-mix(in srgb, var(--brand) 40%, transparent)" }}>{s.fillStatus === "pending" ? "PENDING FILL" : "OPEN"}</span>}
      {s.duplicatesMerged > 0 && <span className="text-[10px] text-[#9CA3AF]" title="Near-identical logs merged">+{s.duplicatesMerged} dup</span>}
    </div>
  )
}

function BucketTable({ rows, label, minN = 8 }: { rows: Bucket[]; label: string; minN?: number }) {
  if (!rows.length) return <div className="text-xs text-[#9CA3AF]">No closed signals in this cut yet.</div>
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">
          <th className="text-left font-medium py-1">{label}</th>
          <th className="text-right font-medium">n</th>
          <th className="text-right font-medium">TP1 rate</th>
          <th className="text-right font-medium">Expectancy</th>
          <th className="text-right font-medium hidden sm:table-cell">W / L</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => {
          const thin = b.n < minN
          return (
            <tr key={b.key} className={cn("border-t border-white/[0.05]", thin && "opacity-50")} title={thin ? `n=${b.n} below ${minN}; treat as anecdotal` : undefined}>
              <td className="py-1.5 font-medium text-white/85">{b.key}</td>
              <td className="text-right font-mono text-[#9CA3AF]">{b.n}</td>
              <td className="text-right font-mono" style={{ color: b.tp1Rate == null ? GRAY : b.tp1Rate >= 55 ? GREEN : b.tp1Rate <= 40 ? RED : "#F9FAFB" }}>{fmtPct(b.tp1Rate)}</td>
              <td className="text-right font-mono" style={{ color: b.expectancyR == null ? GRAY : b.expectancyR > 0 ? GREEN : b.expectancyR < 0 ? RED : "#F9FAFB" }}>{fmtR(b.expectancyR)}</td>
              <td className="text-right font-mono text-[#9CA3AF] hidden sm:table-cell">{b.wins} / {b.losses}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

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
] as const

export default function PerformanceDashboard() {
  const router = useRouter()
  const [range, setRange] = useState("30")
  const [assets, setAssets] = useState<string[]>([])
  const [grades, setGrades] = useState<string[]>([])
  const [bias, setBias] = useState<"" | "LONG" | "SHORT">("")
  const [dedupe, setDedupe] = useState(true)
  const [tab, setTab] = useState<(typeof TABS)[number]["k"]>("bySymbol")
  const [showAll, setShowAll] = useState(false)

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
  const early = (k?.closedN ?? 0) < 20
  const rows = showAll ? data?.signals ?? [] : (data?.signals ?? []).slice(0, 40)

  return (
    <div className="min-h-screen pt-24 pb-16" style={themeStyle(RNG_THEME)}>
      <div className="mx-auto max-w-7xl px-4 lg:px-8 space-y-5">
        <div className={cn(CARD, "flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between")} style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--brand) 10%, transparent) 0%, rgb(var(--surface-rgb) / 0.55) 60%)" }}>
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="size-5" style={{ color: "var(--brand)" }} />
              <h1 className="font-display text-2xl font-bold text-white">Signal Performance</h1>
            </div>
            <p className="mt-1 text-xs text-[#9CA3AF]">Every logged call, checked against 5-minute candles. Each take-profit is recorded the moment it is touched; a stop before TP1 is a loss and a stop after a TP keeps the targets already reached.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <div className="flex overflow-hidden rounded-md border border-white/10">
              {RANGES.map((r) => (
                <button key={r.k} onClick={() => setRange(r.k)} className={cn("px-2.5 py-1 font-semibold transition-colors", range === r.k ? "text-[#06080F]" : "text-[#9CA3AF] hover:text-white")} style={range === r.k ? { backgroundColor: "var(--brand)" } : undefined}>
                  {r.l}
                </button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-md border border-white/10">
              {(["", "LONG", "SHORT"] as const).map((b) => (
                <button key={b || "all"} onClick={() => setBias(b)} className={cn("px-2.5 py-1 font-semibold transition-colors", bias === b ? "text-[#06080F]" : "text-[#9CA3AF] hover:text-white")} style={bias === b ? { backgroundColor: b === "SHORT" ? RED : b === "LONG" ? GREEN : "var(--brand)" } : undefined}>
                  {b || "Both"}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {GRADES.map((g) => (
                <button key={g} onClick={() => setGrades((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]))} className={cn("rounded-md border px-2 py-1 font-mono font-bold transition-colors", grades.includes(g) ? "border-transparent text-[#06080F]" : "border-white/10 text-[#9CA3AF] hover:text-white")} style={grades.includes(g) ? { backgroundColor: "var(--brand)" } : undefined}>
                  {g}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-[#9CA3AF] cursor-pointer">
              <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} className="accent-[#00FF88]" /> merge duplicates
            </label>
          </div>
        </div>

        {symbolsPresent.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Assets</span>
            <button onClick={() => setAssets([])} className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold", assets.length === 0 ? "border-transparent text-[#06080F]" : "border-white/10 text-[#9CA3AF]")} style={assets.length === 0 ? { backgroundColor: "var(--brand)" } : undefined}>All</button>
            {symbolsPresent.map((s) => (
              <button key={s} onClick={() => setAssets((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))} className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold", assets.includes(s) ? "border-transparent text-[#06080F]" : "border-white/10 text-[#9CA3AF] hover:text-white")} style={assets.includes(s) ? { backgroundColor: "var(--brand)" } : undefined}>
                {s}
              </button>
            ))}
          </div>
        )}

        {isError && <div className={cn(CARD, "px-4 py-3 text-sm text-[#FF3B5C]")}>Could not load performance data.</div>}
        {isLoading && !data && <div className={cn(CARD, "h-40 animate-pulse")} />}

        {data && (
          <>
            {data.meta.provisional && (
              <div className="flex items-start gap-2 rounded-xl border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-4 py-3 text-xs text-white/85">
                <Info className="mt-0.5 size-4 shrink-0 text-[#F59E0B]" />
                <span>
                  <span className="font-bold text-[#F59E0B]">Provisional: {data.meta.filledN} of {data.meta.provisionalTarget} filled closed signals.</span>{" "}
                  Every rate below is a preview until {data.meta.provisionalTarget} signals have verifiably filled and closed.
                  {early ? ` ${data.meta.sampleNote}` : ""}
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#9CA3AF]">
              <span className="font-semibold uppercase tracking-[0.14em]">Fill audit</span>
              <span><span className="font-mono text-white">{data.meta.filledN}</span> filled &amp; closed</span>
              <span><span className="font-mono text-white">{data.meta.pendingFillN}</span> awaiting fill</span>
              <span title="Entry never traded within the fill window; excluded from every rate"><span className="font-mono text-white">{data.meta.unfilledN}</span> unfilled</span>
              <span title="Candles needed to verify the fill are no longer available; excluded"><span className="font-mono text-white">{data.meta.unverifiableN}</span> unverifiable</span>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="TP1 hit rate" value={fmtPct(k!.tp1Rate)} sub={`${k!.closedN} filled & closed`} color={k!.tp1Rate == null ? undefined : k!.tp1Rate >= 55 ? GREEN : k!.tp1Rate <= 40 ? RED : undefined} icon={Target} />
              <Kpi
                label="Expectancy"
                value={k!.expectancyR == null ? (early ? "n<20" : "—") : fmtR(k!.expectancyR)}
                sub={k!.expectancyConservativeR != null ? `${fmtR(k!.expectancyConservativeR)} conservative · 50% at TP1, stop to BE` : k!.sumR != null ? `${fmtR(k!.sumR)} total` : undefined}
                color={k!.expectancyR == null ? GRAY : k!.expectancyR > 0 ? GREEN : RED}
                icon={Activity}
                dim={k!.expectancyR == null}
              />
              <Kpi label="Profit factor" value={k!.profitFactor == null ? (early ? "n<20" : k!.closedN ? "no losses" : "—") : k!.profitFactor.toFixed(2)} sub="ΣR⁺ / |ΣR⁻|" color={k!.profitFactor == null ? GRAY : k!.profitFactor >= 1.5 ? GREEN : k!.profitFactor < 1 ? RED : undefined} icon={Flame} dim={k!.profitFactor == null} />
              <Kpi label="Stopped before TP1" value={fmtPct(k!.stopBeforeTpRate)} sub={k!.stopAfterTpRate != null ? `${fmtPct(k!.stopAfterTpRate)} of winners stopped later` : undefined} color={k!.stopBeforeTpRate == null ? undefined : k!.stopBeforeTpRate >= 50 ? RED : undefined} icon={XCircle} />
              <Kpi label="Median time to TP1" value={dur(k!.medianTimeToTp1Min)} sub={k!.ladder.n1 >= 5 ? `${k!.ladder.n1} winners` : "needs 5 winners"} icon={Clock} dim={k!.medianTimeToTp1Min == null} />
              <Kpi label="Open now" value={String(k!.openN)} sub={data.stats.streaks.current.type ? `streak: ${data.stats.streaks.current.length} ${data.stats.streaks.current.type}${data.stats.streaks.current.length > 1 ? "s" : ""}` : undefined} icon={ArrowUpRight} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className={cn(CARD, "p-4 lg:col-span-2")}>
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Equity curve (cumulative R by close order)</h2>
                  <span className="font-mono text-xs" style={{ color: (data.stats.equity.at(-1)?.cumR ?? 0) >= 0 ? GREEN : RED }}>{fmtR(data.stats.equity.at(-1)?.cumR ?? null)}</span>
                </div>
                {data.stats.equity.length >= 2 ? (
                  <div className="mt-2 h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.stats.equity} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <defs>
                          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="i" tick={{ fill: GRAY, fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: GRAY, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}R`} />
                        <Tooltip contentStyle={{ background: "#0A0E17", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelFormatter={(v) => `Signal #${v}`} formatter={(v) => [`${Number(v).toFixed(2)}R`, "Cumulative"]} />
                        <Area type="monotone" dataKey="cumR" stroke={GREEN} strokeWidth={2} fill="url(#eq)" dot={data.stats.equity.length < 40} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="mt-6 text-sm text-[#9CA3AF]">Curve appears after two closed signals.</div>
                )}
              </div>

              <div className={cn(CARD, "p-4 space-y-3")}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Target ladder</h2>
                {([
                  { l: "Reached TP1", v: k!.tp1Rate, n: k!.closedN, sub: "of closed" },
                  { l: "TP1 → TP2", v: k!.ladder.tp2GivenTp1, n: k!.ladder.n1, sub: "of TP1 winners" },
                  { l: "TP2 → TP3", v: k!.ladder.tp3GivenTp2, n: k!.ladder.n2, sub: "of TP2 winners" },
                ] as const).map((r) => (
                  <div key={r.l}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-white/80">{r.l}</span>
                      <span className="font-mono"><span className="font-bold text-white">{fmtPct(r.v)}</span> <span className="text-[#9CA3AF]">· n={r.n} {r.sub}</span></span>
                    </div>
                    <div className="mt-1 h-1.5 rounded bg-white/[0.06]"><div className="h-1.5 rounded" style={{ width: `${r.v ?? 0}%`, backgroundColor: GREEN }} /></div>
                  </div>
                ))}
                <div className="pt-2 text-[11px] text-[#9CA3AF] space-y-0.5">
                  <div>Median MFE {fmtR(data.stats.excursion.medianMfeR)} · median MAE {fmtR(data.stats.excursion.medianMaeR)} <span className="opacity-70">(n={data.stats.excursion.n})</span></div>
                  <div>Winners ran {fmtR(data.stats.excursion.winnersOvershootR)} past TP1 · losers got within {fmtR(data.stats.excursion.losersNearMissR)} of it</div>
                  <div>Best streak {data.stats.streaks.maxWin} wins · worst {data.stats.streaks.maxLoss} losses</div>
                </div>
              </div>
            </div>

            {data.open.length > 0 && (
              <div className={cn(CARD, "p-4")}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF] mb-2">Open signals — live progress</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {data.open.map((s) => (
                    <a key={s.id} href={signalHref(s.symbol)} title={`Open ${s.symbol} signal page`} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-xs transition-colors hover:border-white/20 hover:bg-white/[0.04]">
                      <span className="font-mono font-bold text-white w-14">{s.symbol}</span>
                      <span className="font-bold" style={{ color: s.bias === "LONG" ? GREEN : RED }}>{s.bias}</span>
                      <span className="text-[#9CA3AF]">{ago(s.timestamp)}</span>
                      <span className="ml-auto font-mono" style={{ color: (s.unrealizedR ?? 0) >= 0 ? GREEN : RED }}>{fmtR(s.unrealizedR)}</span>
                      <span className="font-mono text-[#9CA3AF]" title="Distance to next target / to stop, in R">→TP {s.distToNextTpR == null ? "—" : s.distToNextTpR.toFixed(2)} · SL {s.distToSlR == null ? "—" : s.distToSlR.toFixed(2)}</span>
                      {s.highestTp > 0 && <span className="rounded px-1 text-[10px] font-bold" style={{ color: GREEN, backgroundColor: `${GREEN}18` }}>TP{s.highestTp} ✓</span>}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className={cn(CARD, "p-4")}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Signal log</h2>
                <span className="text-[11px] text-[#9CA3AF]">{data.signals.length} shown{data.meta.duplicatesMerged ? ` · ${data.meta.duplicatesMerged} duplicate log${data.meta.duplicatesMerged > 1 ? "s" : ""} merged` : ""}</span>
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">
                      <th className="text-left font-medium py-1">Time</th>
                      <th className="text-left font-medium">Symbol</th>
                      <th className="text-left font-medium">Bias</th>
                      <th className="text-right font-medium">Entry</th>
                      <th className="text-right font-medium">Conf</th>
                      <th className="text-left font-medium pl-4">Targets</th>
                      <th className="text-right font-medium">R</th>
                      <th className="text-right font-medium">MFE / MAE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id} onClick={() => router.push(signalHref(s.symbol))} title={`Open ${s.symbol} signal page`} className="cursor-pointer border-t border-white/[0.05] hover:bg-white/[0.04]">
                        <td className="py-2 text-[#9CA3AF] whitespace-nowrap">{ago(s.timestamp)}</td>
                        <td className="font-mono font-bold text-white"><a href={signalHref(s.symbol)} onClick={(e) => e.stopPropagation()} className="hover:underline" style={{ textDecorationColor: "var(--brand)" }}>{s.symbol}</a></td>
                        <td className="font-bold" style={{ color: s.bias === "LONG" ? GREEN : RED }}>{s.bias}</td>
                        <td className="text-right font-mono text-white/85">${fmtPrice(s.entry)}</td>
                        <td className="text-right font-mono text-[#9CA3AF]">{s.confidence} <span className="opacity-70">{s.grade}</span></td>
                        <td className="pl-4"><TpBadges s={s} /></td>
                        <td className="text-right font-mono" style={{ color: s.realizedR == null ? GRAY : s.realizedR > 0 ? GREEN : s.realizedR < 0 ? RED : "#F9FAFB" }}>{s.open ? (s.fillStatus === "pending" ? "pending fill" : "open") : s.excluded ? "n/a" : fmtR(s.realizedR)}</td>
                        <td className="text-right font-mono text-[#9CA3AF]">{s.mfeR == null ? "—" : `+${s.mfeR.toFixed(2)}`} / {s.maeR == null ? "—" : `-${s.maeR.toFixed(2)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-2">
                {rows.map((s) => (
                  <a key={s.id} href={signalHref(s.symbol)} title={`Open ${s.symbol} signal page`} className="block rounded-lg border border-white/[0.06] bg-black/20 p-3 text-xs space-y-1.5 transition-colors hover:border-white/20 hover:bg-white/[0.04]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">{s.symbol}</span>
                      <span className="font-bold" style={{ color: s.bias === "LONG" ? GREEN : RED }}>{s.bias}</span>
                      <span className="text-[#9CA3AF]">{ago(s.timestamp)}</span>
                      <span className="ml-auto font-mono" style={{ color: s.realizedR == null ? GRAY : s.realizedR > 0 ? GREEN : RED }}>{s.open ? (s.fillStatus === "pending" ? "pending fill" : "open") : s.excluded ? "n/a" : fmtR(s.realizedR)}</span>
                    </div>
                    <div className="text-[#9CA3AF]">Entry ${fmtPrice(s.entry)} · conf {s.confidence} {s.grade}</div>
                    <TpBadges s={s} />
                  </a>
                ))}
              </div>
              {data.signals.length > 40 && (
                <button onClick={() => setShowAll(!showAll)} className="mt-2 text-[11px] text-[#9CA3AF] hover:text-white">{showAll ? "Show fewer" : `Show all ${data.signals.length}`}</button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className={cn(CARD, "p-4")}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF] mb-2">Calibration — stated confidence vs realized TP1 rate</h2>
                <BucketTable rows={data.stats.calibration.byConfidence} label="Confidence" />
                <div className="mt-3"><BucketTable rows={data.stats.calibration.byGrade} label="Grade" /></div>
                <p className="mt-2 text-[11px] text-[#9CA3AF]">Well-calibrated calls have a realized rate close to the stated confidence; rows under n=8 are greyed.</p>
              </div>
              <div className={cn(CARD, "p-4")}>
                <div className="flex flex-wrap gap-1 mb-2">
                  {TABS.map((t) => (
                    <button key={t.k} onClick={() => setTab(t.k)} className={cn("rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors", tab === t.k ? "border-transparent text-[#06080F]" : "border-white/10 text-[#9CA3AF] hover:text-white")} style={tab === t.k ? { backgroundColor: "var(--brand)" } : undefined}>
                      {t.l}
                    </button>
                  ))}
                </div>
                <BucketTable rows={data.stats.breakdowns[tab]} label={TABS.find((t) => t.k === tab)!.col} />
              </div>
            </div>

            <div className="flex items-start gap-2 text-[11px] text-[#9CA3AF]">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              <span>{data.meta.assumptions} Generated {new Date(data.meta.generatedAt).toLocaleTimeString()}.</span>
              <ArrowDownRight className="hidden" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
