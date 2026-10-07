"use client"

import { motion, useReducedMotion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts"
import { Activity, ArrowRight, ArrowUpRight, CalendarClock, CheckCircle2, Crosshair, ExternalLink, Flame, Layers, Radar, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PerformanceStats } from "@/app/api/signals/history/performance"
import { HotBoardState, HotPlayCard, HotStamp, hotStatus, useHotPlays } from "@/app/signals/HotBoard"

export type HomePost = { slug: string; title: string; description: string; date: string; category: string; readTime: string }

const GREEN = "#00FF88"
const RED = "#FF3B5C"
const AMBER = "#F59E0B"
const ASCEND = "#F35233"
const LIQWID = "#22D3EE"

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

type PerfResp = { stats: PerformanceStats; meta: PerformanceStats["meta"] & { closedN: number; openN: number }; open: { id: string }[] }

function usePerformance(range: "30" | "all") {
  return useQuery<PerfResp>({
    queryKey: ["home-performance", range],
    queryFn: async () => {
      const r = await fetch(`/api/signals/history?view=performance&range=${range === "all" ? "all" : "30d"}&limit=300`)
      if (!r.ok) throw new Error(`performance ${r.status}`)
      return r.json()
    },
    refetchInterval: 60_000,
    retry: false,
  })
}


// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

const fmtR = (r: number | null | undefined, dp = 2) => (r == null ? "—" : `${r > 0 ? "+" : ""}${r.toFixed(dp)}R`)
const fmtPct = (p: number | null | undefined) => (p == null ? "—" : `${Math.round(p)}%`)
const fmtDate = (d: string) => {
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

// Entrance motion. Honours prefers-reduced-motion: everything renders in place, no fades or slides.
type MotionProps = Record<string, unknown>
function useMotion() {
  const reduce = useReducedMotion()
  return {
    // Scroll-in reveal for sections and cards.
    fade: (delay = 0): MotionProps =>
      reduce ? {} : { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { delay, duration: 0.55, ease: "easeOut" as const } },
    // On-load rise for the hero.
    rise: (delay = 0, from: MotionProps = { opacity: 0, y: 20 }): MotionProps =>
      reduce ? {} : { initial: from, animate: { opacity: 1, y: 0, scale: 1 }, transition: { delay, duration: 0.6, ease: "easeOut" as const } },
  }
}

function LivePulse({ color = GREEN }: { color?: string }) {
  return (
    <span className="relative flex size-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: color }} />
      <span className="relative inline-flex size-2 rounded-full" style={{ backgroundColor: color }} />
    </span>
  )
}

function Eyebrow({ children, color = GREEN, pulse = false }: { children: React.ReactNode; color?: string; pulse?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ borderColor: `${color}33`, backgroundColor: `${color}0d`, color }}>
      {pulse && <LivePulse color={color} />}
      {children}
    </div>
  )
}

function SectionHead({ eyebrow, title, blurb, color, pulse, right }: { eyebrow: string; title: React.ReactNode; blurb?: string; color?: string; pulse?: boolean; right?: React.ReactNode }) {
  const m = useMotion()
  return (
    <motion.div {...m.fade()} className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Eyebrow color={color} pulse={pulse}>{eyebrow}</Eyebrow>
        <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.08]">{title}</h2>
        {blurb && <p className="mt-3 max-w-2xl text-base text-white/45 sm:text-lg">{blurb}</p>}
      </div>
      {right}
    </motion.div>
  )
}

function Kpi({ label, value, sub, tone = "white", big = false }: { label: string; value: string; sub?: string; tone?: "green" | "red" | "white" | "amber"; big?: boolean }) {
  const color = tone === "green" ? GREEN : tone === "red" ? RED : tone === "amber" ? AMBER : "#F9FAFB"
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</p>
      <p className={cn("mt-2 font-mono font-bold tracking-tight tabular-nums", big ? "text-4xl" : "text-3xl")} style={{ color }}>{value}</p>
      {sub && <p className="mt-1 text-xs text-white/35">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  const m = useMotion()
  const perf = usePerformance("30")
  const hot = useHotPlays()
  const k = perf.data?.stats.kpis
  const markets = hot.data?.all.length ?? 31

  return (
    <section className="relative overflow-hidden">
      {/* Backdrop: grid + green bloom. Kept subtle so the numbers do the talking. */}
      <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[-20%] h-[640px] w-[640px] -translate-x-1/2 rounded-full blur-3xl" style={{ background: `radial-gradient(circle, ${GREEN}26 0%, transparent 65%)` }} />

      <div className="relative mx-auto flex min-h-[92vh] max-w-7xl flex-col items-center justify-center px-4 pb-20 pt-32 text-center lg:px-8">
        <motion.div {...m.rise(0, { opacity: 0, scale: 0.85 })} className="relative mb-8">
          <div className="relative size-28 overflow-hidden rounded-3xl ring-2 ring-white/10 sm:size-32" style={{ boxShadow: `0 0 60px ${GREEN}26` }}>
            <Image src="/avatar/character.jpg" alt="RnGcrYptO" fill className="object-cover" priority sizes="128px" />
          </div>
          <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#06080F] px-2.5 py-1 ring-1 ring-white/10">
            <LivePulse />
            <span className="text-[10px] font-semibold text-[#00FF88]">signals live</span>
          </div>
        </motion.div>

        <motion.h1 {...m.rise(0.15)} className="font-display text-5xl font-bold tracking-tight sm:text-7xl lg:text-8xl">
          <span className="text-[#00FF88]">RnG</span>
          <span className="text-white">crYptO</span>
        </motion.h1>

        <motion.p {...m.rise(0.3)} className="mt-5 max-w-2xl text-balance text-lg text-white/55 sm:text-2xl">
          Plain-English trade calls across {markets} markets. Every call logged. Every call checked against the tape, not against vibes.
        </motion.p>

        {/* Live proof strip */}
        <motion.div {...m.rise(0.45)} className="mt-9 grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-4">
          {(() => {
            const meta = perf.data?.meta
            // Until 100 filled closed signals exist the expectancy and profit factor are previews, so the
            // strip says so instead of quoting them. TP1 rate and the verified count stay.
            const provisional = meta?.provisional ?? true
            const verified = meta ? `${meta.filledN}/${meta.provisionalTarget} verified` : "—"
            const tiles = provisional
              ? [
                  { l: "Expectancy", v: "Provisional", sub: verified, c: AMBER, href: "/signals/performance" },
                  { l: "TP1 hit rate", v: fmtPct(k?.tp1Rate), c: "#F9FAFB" },
                  { l: "Profit factor", v: "Provisional", sub: verified, c: AMBER, href: "/signals/performance" },
                  { l: "Calls verified", v: k ? String(k.closedN) : "—", c: "#F9FAFB" },
                ]
              : [
                  { l: "30d expectancy", v: fmtR(k?.expectancyR), c: (k?.expectancyR ?? 0) >= 0 ? GREEN : RED },
                  { l: "TP1 hit rate", v: fmtPct(k?.tp1Rate), c: "#F9FAFB" },
                  { l: "Profit factor", v: k?.profitFactor == null ? "—" : k.profitFactor.toFixed(2), c: (k?.profitFactor ?? 1) >= 1 ? GREEN : RED },
                  { l: "Calls verified", v: k ? String(k.closedN) : "—", c: "#F9FAFB" },
                ]
            return tiles.map((s) => {
              const body = (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{s.l}</p>
                  <p className={cn("mt-1 font-mono font-bold tabular-nums", "sub" in s && s.sub ? "text-lg" : "text-2xl", perf.isLoading && "skeleton rounded")} style={{ color: s.c }}>{s.v}</p>
                  {"sub" in s && s.sub && <p className="text-[11px] text-white/45">{s.sub}</p>}
                </>
              )
              return "href" in s && s.href ? (
                <Link key={s.l} href={s.href} title="Open the performance page" className="block bg-[#06080F]/90 px-4 py-4 transition-colors hover:bg-[#0A0E17]">
                  {body}
                </Link>
              ) : (
                <div key={s.l} className="bg-[#06080F]/90 px-4 py-4">
                  {body}
                </div>
              )
            })
          })()}
        </motion.div>

        <motion.div {...m.rise(0.6)} className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link href="/signals/strike" className="group flex items-center justify-center gap-2 rounded-full bg-[#00FF88] px-8 py-3.5 text-sm font-bold text-[#06080F] transition-all hover:shadow-[0_0_40px_rgba(0,255,136,0.35)]">
            <Radar className="size-4" />
            Open the signals
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link href="/signals/performance" className="flex items-center justify-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.03] px-8 py-3.5 text-sm font-semibold text-white/80 transition-all hover:border-white/[0.3] hover:bg-white/[0.06] hover:text-white">
            <ShieldCheck className="size-4" />
            Verified track record
          </Link>
        </motion.div>

        <motion.p {...m.rise(0.9, { opacity: 0 })} className="mt-6 text-xs text-white/30">
          Not financial advice. A degen&apos;s tooling, shared in the open.
        </motion.p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Live board
// ---------------------------------------------------------------------------

function LiveBoard() {
  const m = useMotion()
  const hot = useHotPlays()
  const plays = (hot.data?.hot ?? []).filter((p) => p.bias !== "WAIT").slice(0, 6)
  const status = hotStatus(hot, plays)

  return (
    <section id="live" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHead
          eyebrow="On the board right now"
          pulse
          title={<>The hottest setups, <span className="text-[#00FF88]">live</span></>}
          blurb="Highest-conviction calls across crypto, metals, oil, stocks and indices. Tap one to open the full breakdown."
          right={<HotStamp ts={hot.data?.timestamp} />}
        />

        {status !== "ready" ? (
          <HotBoardState status={status} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plays.map((p, i) => (
              <motion.div key={p.symbol} {...m.fade(i * 0.06)}>
                <HotPlayCard p={p} href={`/signals/strike?symbol=${encodeURIComponent(p.symbol)}`} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

function EquityTooltip({ active, payload }: { active?: boolean; payload?: { payload: { cumR: number; symbol: string; t: number } }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-white/10 bg-[#0A0E17] px-3 py-2 text-xs shadow-xl">
      <p className="font-mono font-bold" style={{ color: d.cumR >= 0 ? GREEN : RED }}>{fmtR(d.cumR)}</p>
      <p className="text-white/50">{d.symbol} · {new Date(d.t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
    </div>
  )
}

function Performance() {
  const m = useMotion()
  const perf = usePerformance("30")
  const s = perf.data?.stats
  const k = s?.kpis
  const eq = s?.equity ?? []
  const last = eq.length ? eq[eq.length - 1].cumR : null
  const positive = (last ?? 0) >= 0
  const line = positive ? GREEN : RED
  const streak = s?.streaks.current

  return (
    <section id="performance" className="relative py-20 sm:py-24">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#00FF88]/[0.02] to-transparent" />
      <div className="relative mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHead
          eyebrow="Receipts, not screenshots"
          title={<>Every call is <span className="text-[#00FF88]">verified</span> against 5-minute candles</>}
          blurb="Take-profit ladder, stop-outs, realized R, equity curve and calibration by confidence. Duplicates merged, nothing cherry-picked."
          right={
            <Link href="/signals/performance" className="group inline-flex items-center gap-2 text-sm font-semibold text-white/70 transition-colors hover:text-white">
              Full performance page <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          }
        />

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Equity curve */}
          <motion.div {...m.fade()} className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 lg:col-span-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Cumulative R · last 30 days</p>
                <p className={cn("mt-1 font-mono text-4xl font-bold tabular-nums", perf.isLoading && "skeleton rounded")} style={{ color: line }}>{fmtR(last)}</p>
              </div>
              {streak?.type && (
                <span className="rounded-md px-2 py-1 text-[11px] font-bold" style={{ color: streak.type === "win" ? GREEN : RED, backgroundColor: `${streak.type === "win" ? GREEN : RED}1a` }}>
                  {streak.length} {streak.type} streak
                </span>
              )}
            </div>
            <div className="mt-4 h-56">
              {eq.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={eq} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id="home-eq" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={line} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={line} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip content={<EquityTooltip />} cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="cumR" stroke={line} strokeWidth={2} fill="url(#home-eq)" dot={false} activeDot={{ r: 4, stroke: "#06080F", strokeWidth: 2, fill: line }} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/35">{perf.isLoading ? "Loading the curve…" : "Not enough closed calls in the window yet"}</div>
              )}
            </div>
            <p className="mt-2 text-[11px] text-white/35">{s?.meta.sampleNote ?? "Each point is one closed call; R = profit measured in units of initial risk."}</p>
          </motion.div>

          {/* KPIs */}
          <motion.div {...m.fade(0.08)} className="grid grid-cols-2 gap-4 lg:col-span-2">
            {perf.data?.meta.provisional ?? true ? (
              <>
                <Kpi label="Expectancy" value="Provisional" sub={perf.data ? `${perf.data.meta.filledN} of ${perf.data.meta.provisionalTarget} filled closed signals` : "waiting for data"} tone="amber" />
                <Kpi label="Profit factor" value="Provisional" sub="quoted once 100 signals have verifiably filled and closed" tone="amber" />
              </>
            ) : (
              <>
                <Kpi label="Expectancy" value={fmtR(k?.expectancyR)} sub={k?.expectancyConservativeR != null ? `${fmtR(k.expectancyConservativeR)} conservative` : "per call, in R"} tone={(k?.expectancyR ?? 0) >= 0 ? "green" : "red"} />
                <Kpi label="Profit factor" value={k?.profitFactor == null ? "—" : k.profitFactor.toFixed(2)} sub="gross wins ÷ gross losses" tone={(k?.profitFactor ?? 1) >= 1 ? "green" : "red"} />
              </>
            )}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Target ladder</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[["TP1", k?.tp1Rate], ["TP2", k?.tp2Rate], ["TP3", k?.tp3Rate]].map(([l, v]) => (
                  <div key={l as string}>
                    <p className="font-mono text-xl font-bold tabular-nums text-white">{fmtPct(v as number | null | undefined)}</p>
                    <p className="text-[10px] text-white/35">{l as string}</p>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-white/35">hit rates</p>
            </div>
            <Kpi label="Stopped before TP1" value={fmtPct(k?.stopBeforeTpRate)} sub="clean losses" tone="amber" />
            <Kpi label="Median time to TP1" value={k?.medianTimeToTp1Min == null ? "—" : k.medianTimeToTp1Min < 90 ? `${Math.round(k.medianTimeToTp1Min)}m` : `${(k.medianTimeToTp1Min / 60).toFixed(1)}h`} sub="how fast it pays" />
            <Kpi label="Closed · open" value={k ? `${k.closedN} · ${k.openN}` : "—"} sub="calls in window" />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// How it reads the market
// ---------------------------------------------------------------------------

const pillars = [
  { icon: Crosshair, title: "14-component scorer", body: "Trend, momentum, structure, volume, divergence, sweeps and order flow blended into one conviction score and a letter grade. No single indicator gets to be the hero." },
  { icon: Layers, title: "5 timeframes, 31 markets", body: "Scalp to swing, from BTC and ADA to gold, WTI, Nvidia and the Nasdaq. Entry, stop and a three-rung take-profit ladder on every call." },
  { icon: CalendarClock, title: "Macro and odds, wired in", body: "CPI, payrolls, FOMC, EIA and API crude. Each release is scored for surprise, mapped to BTC, gold and oil, and cross-checked against Kalshi and Polymarket odds." },
  { icon: CheckCircle2, title: "Verified, not vibes", body: "Every call is logged the second it fires and re-checked against 5-minute candles until it hits a target or the stop. The track record is the log, not a highlight reel." },
]

function HowItWorks() {
  const m = useMotion()
  return (
    <section id="how" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHead eyebrow="Under the hood" title={<>How the bot <span className="text-[#00FF88]">reads</span> the market</>} blurb="A scanner that thinks like a disciplined trader and explains itself in plain English." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p, i) => (
            <motion.div key={p.title} {...m.fade(i * 0.07)} className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6 transition-all duration-300 hover:border-[#00FF88]/30 hover:bg-white/[0.04]">
              <div className="flex size-11 items-center justify-center rounded-xl bg-[#00FF88]/10 text-[#00FF88] transition-transform duration-300 group-hover:scale-105">
                <p.icon className="size-5" />
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/45">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Ascend + Liqwid
// ---------------------------------------------------------------------------

function Ecosystem() {
  const m = useMotion()
  return (
    <section id="ecosystem" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHead eyebrow="Cardano, where I actually live" title={<>Two protocols I <span className="text-[#00FF88]">back</span> with my own bags</>} blurb="Not sponsors. The venues and primitives the whole stack is built around." />

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Ascend */}
          <motion.article {...m.fade()} className="group relative overflow-hidden rounded-3xl border p-7 sm:p-9" style={{ borderColor: `${ASCEND}40`, background: `linear-gradient(140deg, ${ASCEND}1f 0%, rgba(12,11,15,0.85) 55%)` }}>
            <div className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full blur-3xl transition-opacity duration-500 group-hover:opacity-100" style={{ backgroundColor: `${ASCEND}2e` }} />
            <div className="pointer-events-none absolute -bottom-8 -right-8 size-48 opacity-70 [mask-image:radial-gradient(circle,black_40%,transparent_72%)]">
              <Image src="/avatar/ascend_logo_coin.jpg" alt="" fill className="object-cover" sizes="192px" />
            </div>
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="relative size-12 overflow-hidden rounded-2xl ring-1 ring-white/10">
                  <Image src="/avatar/ascend_logo_coin.jpg" alt="Ascend" fill className="object-cover" sizes="48px" />
                </div>
                <div>
                  <h3 className="font-display text-2xl font-bold text-white">Ascend Market</h3>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: ASCEND }}>Event perpetuals on Midnight</p>
                </div>
              </div>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/60">
                Perps on world events, metals, stocks and crypto, priced 0 to 1 with up to 1001x. The <span className="font-semibold text-white">$ASCEND</span> token shares 100% of platform fees with holders, fair launched with no VC overhang and real liquid staking.
              </p>
              <ul className="mt-5 grid gap-2 text-sm text-white/55 sm:grid-cols-2">
                {["BTC, Gold, Cardano and WTI signals tuned to Ascend's markets", "Macro event engine for the releases Ascend lists", "Live Kalshi and Polymarket odds beside each call", "$ASCEND lives on Cardano, trades on Minswap"].map((x) => (
                  <li key={x} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: ASCEND }} />{x}</li>
                ))}
              </ul>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/signals/ascend" className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-[#06080F] transition-all hover:shadow-[0_0_30px_rgba(243,82,51,0.4)]" style={{ backgroundColor: ASCEND }}>
                  <Activity className="size-4" /> Ascend signals
                </Link>
                <a href="https://ascend.market" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/[0.14] px-5 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:border-white/30 hover:text-white">
                  ascend.market <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          </motion.article>

          {/* Liqwid */}
          <motion.article {...m.fade(0.08)} className="group relative overflow-hidden rounded-3xl border p-7 sm:p-9" style={{ borderColor: `${LIQWID}40`, background: `linear-gradient(140deg, ${LIQWID}1c 0%, rgba(10,14,23,0.85) 55%)` }}>
            <div className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full blur-3xl" style={{ backgroundColor: `${LIQWID}29` }} />
            <div className="pointer-events-none absolute -bottom-6 -right-6 size-44 opacity-70 [mask-image:radial-gradient(circle,black_40%,transparent_72%)]">
              <Image src="/avatar/robot_character.jpg" alt="" fill className="object-cover" sizes="176px" />
            </div>
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-2xl font-display text-xl font-black text-[#06080F] ring-1 ring-white/10" style={{ backgroundColor: LIQWID }}>LQ</div>
                <div>
                  <h3 className="font-display text-2xl font-bold text-white">Liqwid Finance</h3>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: LIQWID }}>Cardano&apos;s lending layer</p>
                </div>
              </div>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/60">
                Not an Aave fork. Built from scratch for eUTXO, with Lombard loans that let you borrow against staked ADA while the staking rewards keep flowing. Where the dry powder sits between trades.
              </p>
              <ul className="mt-5 grid gap-2 text-sm text-white/55 sm:grid-cols-2">
                {["Non-custodial lending for ADA and native tokens", "Borrow against staked ADA, keep the rewards", "$LQ governance, NFT boosters for yield", "Deepest lending TVL on Cardano"].map((x) => (
                  <li key={x} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: LIQWID }} />{x}</li>
                ))}
              </ul>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="https://app.liqwid.finance" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-[#06080F] transition-all hover:shadow-[0_0_30px_rgba(34,211,238,0.4)]" style={{ backgroundColor: LIQWID }}>
                  Open Liqwid <ExternalLink className="size-3.5" />
                </a>
                <Link href="/blog/why-liqwid-is-the-best-on-cardano" className="inline-flex items-center gap-2 rounded-full border border-white/[0.14] px-5 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:border-white/30 hover:text-white">
                  Why I&apos;m bullish <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </motion.article>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Latest + social
// ---------------------------------------------------------------------------

function Latest({ posts }: { posts: HomePost[] }) {
  const m = useMotion()
  if (posts.length === 0) return null
  return (
    <section id="latest" className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHead
          eyebrow="From the blog"
          title="Latest from the trenches"
          right={
            <Link href="/blog" className="group inline-flex items-center gap-2 text-sm font-semibold text-white/70 transition-colors hover:text-white">
              All posts <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          }
        />
        <div className="grid gap-4 md:grid-cols-3">
          {posts.map((p, i) => (
            <motion.div key={p.slug} {...m.fade(i * 0.07)}>
              <Link href={`/blog/${p.slug}`} className="group flex h-full flex-col rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.045]">
                <div className="flex items-center gap-3 text-xs">
                  <span className="rounded-full bg-[#00FF88]/10 px-2.5 py-0.5 font-semibold text-[#00FF88]">{p.category}</span>
                  <span className="text-white/35">{fmtDate(p.date)} · {p.readTime}</span>
                </div>
                <h3 className="mt-4 font-display text-lg font-bold leading-snug text-white transition-colors group-hover:text-[#00FF88]">{p.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-white/45">{p.description}</p>
                <span className="mt-auto flex items-center gap-1 pt-5 text-xs font-medium text-white/35 transition-colors group-hover:text-white/70">Read <ArrowRight className="size-3" /></span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

const socials = [
  { href: "https://x.com/RnGcrYptO", label: "@RnGcrYptO", sub: "calls, charts, cope", color: GREEN },
  { href: "https://www.youtube.com/@RnGcrYptO", label: "YouTube", sub: "walkthroughs", color: "#FF0000" },
  { href: "https://x.com/ascendperps", label: "@ascendperps", sub: "Ascend Market", color: ASCEND },
  { href: "https://x.com/liqwidfinance", label: "@liqwidfinance", sub: "Liqwid Finance", color: LIQWID },
]

function Social() {
  return (
    <section className="border-t border-white/[0.06] py-16">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3 px-4 lg:px-8">
        {socials.map((s) => (
          <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 rounded-full border border-white/[0.08] bg-white/[0.02] py-2 pl-2 pr-5 transition-all hover:border-white/[0.2] hover:bg-white/[0.05]">
            <span className="flex size-8 items-center justify-center rounded-full text-[#06080F]" style={{ backgroundColor: s.color }}><Flame className="size-4" /></span>
            <span>
              <span className="block text-sm font-semibold text-white/85">{s.label}</span>
              <span className="block text-[11px] text-white/35">{s.sub}</span>
            </span>
            <ArrowUpRight className="size-4 text-white/30 transition-colors group-hover:text-white/70" />
          </a>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

export default function HomeContent({ posts }: { posts: HomePost[] }) {
  return (
    <>
      <Hero />
      <LiveBoard />
      <Performance />
      <HowItWorks />
      <Ecosystem />
      <Latest posts={posts} />
      <Social />
    </>
  )
}
