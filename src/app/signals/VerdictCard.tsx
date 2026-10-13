"use client"

import React from "react"
import { ArrowDownRight, ArrowUpRight, CalendarClock, History, Pause, RefreshCw, Repeat, ShieldAlert, Target, TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Recommendation, RecoLink, SectionId } from "./recommendation"
import type { EventWindowInfo, SignalsResponse } from "./types"
import { AMBER, BRAND, Chip, EYEBROW, FOCUS_RING, GREEN, LABEL, RED, Tip, dirLabel, fmt, fmtMinutes, fmtPrice, pctColor, pctFrom, signed, timeAgo, useNow } from "./shared"
import { RegimeStrip } from "./RegimeStrip"

const TONE: Record<RecoLink["tone"], string> = { pos: GREEN, neg: RED, neutral: "rgba(255,255,255,0.55)" }
const MIN_RR = 1.5
const STALE_S = 90
const NO_SCAN_S = 15 * 60
const SHADOW_LABEL: Record<NonNullable<SignalsResponse["call"]["shadowClass"]>, string> = {
  wait_lean: "lean below the publish bar",
  htf_blocked_short: "short blocked by the higher timeframe",
  regime_blocked: "blocked by the regime gate",
  event_gated: "gated by the event window",
}

function JumpLink({ link, onJump, className }: { link: RecoLink; onJump: (anchor: SectionId) => void; className?: string }) {
  if (!link.anchor) return <span className={cn("text-white/75", className)}>{link.text}</span>
  const anchor = link.anchor
  return (
    <a
      href={`#${anchor}`}
      onClick={(e) => {
        e.preventDefault()
        onJump(anchor)
      }}
      className={cn("group inline rounded-sm text-white/75 underline decoration-dotted decoration-white/25 underline-offset-[3px] hover:text-white hover:decoration-white/70 transition-colors", FOCUS_RING, className)}
      aria-label={`${link.text}. Jump to the data behind this`}
    >
      {link.text}
      <ArrowDownRight className="ml-0.5 inline size-3 align-[-1px] text-white/50 group-hover:text-white/70 transition-colors" />
    </a>
  )
}

/** Market-implied hint for the NEXT row (F2.1). Null until the calendar carries prediction-market means. */
export interface NextMarketHint {
  consensus: string | null
  mean: string | null
  venue: "kalshi" | "polymarket" | null
}

// ── Event-window bar (F1.2 row 4). Four states, one visual each; no red for urgency. ──────────────
function EventClock({ at, tickMs, prefix }: { at: number; tickMs: number; prefix?: string }) {
  const now = useNow(tickMs)
  const m = Math.round((at - now) / 60000)
  const txt = m > 0 ? `in ${fmtMinutes(m)}` : m === 0 ? "now" : `${fmtMinutes(-m)} ago`
  return (
    <span className="font-mono tabular-nums text-white/90">
      {prefix}
      {txt}
    </span>
  )
}

function EventWindowBar({ ew, callTs, onJump }: { ew: EventWindowInfo; callTs: number; onJump: (anchor: SectionId) => void }) {
  const title = ew.event?.title ?? "Scheduled release"
  // Release instant: the event time when present, else reconstructed from the signed minutes-since at call time.
  const releaseAt = ew.event?.time ? new Date(ew.event.time).getTime() : ew.minutesSince != null ? callTs - ew.minutesSince * 60_000 : null
  const label = ew.state === "pre" ? "Event window · pre" : ew.state === "blackout" ? "No entry" : ew.state === "releasing" ? "Releasing" : "Post window"
  const gate = ew.firstMoveGate
  const gatePct = ew.firstMovePct != null ? ` ${signed(ew.firstMovePct, 1)}%` : ""
  const frame =
    ew.state === "blackout"
      ? { borderColor: `${AMBER}66`, backgroundColor: `${AMBER}14` }
      : ew.state === "releasing"
        ? { borderColor: BRAND, backgroundColor: "rgba(255,255,255,0.03)" }
        : { borderColor: "rgba(255,255,255,0.1)", backgroundColor: "transparent" }
  const tickMs = ew.state === "blackout" || ew.state === "releasing" ? 1000 : 15_000
  return (
    <a
      href="#sec-calendar"
      onClick={(e) => {
        e.preventDefault()
        onJump("sec-calendar")
      }}
      className={cn("mt-2.5 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:bg-white/[0.03]", FOCUS_RING)}
      style={frame}
      aria-label={`${label}: ${title}. Jump to the calendar`}
    >
      <span className={cn(EYEBROW, "shrink-0")} style={{ color: ew.state === "blackout" ? AMBER : ew.state === "releasing" ? BRAND : "rgba(255,255,255,0.6)" }}>
        {label}
      </span>
      <span className="font-medium text-white/85">{title}</span>
      {ew.state === "pre" && (
        <>
          {releaseAt != null ? <EventClock at={releaseAt} tickMs={tickMs} /> : <span className="font-mono tabular-nums text-white/90">in {fmtMinutes(ew.minutesLeft)}</span>}
          <span className="text-white/50">· size x{ew.sizeMult} · no new entries from T-30m</span>
        </>
      )}
      {ew.state === "blackout" && (
        <>
          {releaseAt != null ? <EventClock at={releaseAt} tickMs={tickMs} prefix={(ew.minutesSince ?? -1) < 0 ? "releasing " : "released "} /> : <span className="font-mono tabular-nums text-white/90">{fmtMinutes(ew.minutesLeft)} left</span>}
          <span className="text-white/50">· calls paused until T+10m</span>
        </>
      )}
      {ew.state === "releasing" && (
        <>
          <span className="text-white/50">out · first-5-minute gate:</span>
          <span className="font-mono" style={{ color: gate === "unconfirmed" ? RED : gate === "confirmed" ? GREEN : "rgba(255,255,255,0.8)" }}>
            {gate ?? "pending"}
            {gatePct}
          </span>
        </>
      )}
      {ew.state === "post" && (
        <>
          <span className="font-mono tabular-nums text-white/90">{fmtMinutes(ew.minutesLeft)} left</span>
          <span className="text-white/50">· size x{ew.sizeMult} · stop x{ew.stopMult} · confirmation</span>
          <span className="font-mono" style={{ color: gate === "unconfirmed" ? RED : "rgba(255,255,255,0.8)" }}>
            {gate === "unconfirmed" ? "reversing" : gate === "confirmed" ? "confirming" : "pending"}
            {gatePct}
          </span>
        </>
      )}
      {ew.note && <span className="hidden text-white/50 lg:inline">· {ew.note}</span>}
      <ArrowDownRight className="ml-auto size-3 text-white/50" />
    </a>
  )
}

// ── Plan tile ──────────────────────────────────────────────────────────────────────────────────────
function PlanTile({ label, value, sub, sub2, color, subColor, tip }: { label: string; value: string; sub?: string; sub2?: string; color?: string; subColor?: string; tip?: React.ReactNode }) {
  const body = (
    <div className="w-full min-w-0 rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5 sm:px-2.5">
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-white/50">{label}</div>
      <div className="truncate font-mono text-[13px] sm:text-sm font-bold tabular-nums" style={{ color: color ?? "rgba(255,255,255,0.9)" }}>
        {value}
      </div>
      {sub && (
        <div className="truncate font-mono text-[11px] tabular-nums" style={{ color: subColor ?? "rgba(255,255,255,0.5)" }}>
          {sub}
        </div>
      )}
      {sub2 && <div className="truncate font-mono text-[11px] tabular-nums text-white/50">{sub2}</div>}
    </div>
  )
  return tip ? (
    <Tip content={tip} className="block w-full">
      {body}
    </Tip>
  ) : (
    body
  )
}

// ── Right-column row: fixed label, body, always rendered ───────────────────────────────────────────
function RiskRow({ icon: Icon, iconColor, label, children, className }: { icon: React.ElementType; iconColor: string; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2 text-[12px] leading-snug", className)}>
      <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: iconColor }} />
      <span className={cn(EYEBROW, "mt-[3px] w-[66px] shrink-0 text-white/50")}>{label}</span>
      <span className="min-w-0 flex-1 text-white/75">{children}</span>
    </div>
  )
}

// One card: direction, grade (calibrated probability when it exists, evidence strength otherwise), mode, price,
// the regime strip, the event window, eight plan tiles, the why list with block scores, and the four fixed
// risk rows: WRONG IF, FLIPS IF, NEXT, HISTORY. Every field has a null fallback.
export function VerdictCard({
  d,
  reco,
  dp,
  symbol,
  loading,
  onJump,
  venue,
  nextMarket,
}: {
  d: SignalsResponse | undefined
  reco: Recommendation | null
  dp: number
  symbol: string
  loading: boolean
  onJump: (anchor: SectionId) => void
  venue?: { name: string; url: string } | null
  nextMarket?: NextMarketHint | null
}) {
  // Stale detection reads the shared 15s ticker; placed before the early return so hook order is stable.
  const now = useNow(15_000)

  if (loading || !d || !reco) {
    return (
      <div id="sec-call" className="rise-in rounded-2xl border border-white/[0.08] bg-[rgb(var(--surface-rgb,10_14_23)/0.55)] backdrop-blur-xl p-5 animate-pulse" aria-busy="true">
        <div className="h-6 w-56 rounded bg-white/[0.06] mb-3" />
        <div className="h-10 w-40 rounded bg-white/[0.06] mb-4" />
        <div className="h-3.5 w-full max-w-2xl rounded bg-white/[0.05] mb-2" />
        <div className="h-3.5 w-3/4 max-w-xl rounded bg-white/[0.05]" />
        <div className="mt-4 text-[11px] text-white/50">Building the {symbol} verdict…</div>
      </div>
    )
  }

  const call = d.call
  const dir = call.bias
  const c = dir === "LONG" ? GREEN : dir === "SHORT" ? RED : "rgba(255,255,255,0.7)"
  const Icon = dir === "LONG" ? TrendingUp : dir === "SHORT" ? TrendingDown : Pause
  const price = d.price.mark
  const change = d.price.change24h
  const active = dir !== "WAIT" && call.mode !== "standby"
  const why = reco.because.slice(0, 3)
  const entryType = d.entryType ?? call.entryType ?? null
  const ageS = d.timestamp ? (now - d.timestamp) / 1000 : 0
  const stale = ageS > STALE_S
  const noScan = ageS > NO_SCAN_S

  // Grade chip: calibrated probability when published, "evidence" otherwise. Never a probability without pTp1.
  const p = call.pTp1
  const ci = call.pTp1Ci
  const ciWide = ci ? (ci[1] - ci[0]) * 100 > 25 : false
  const gradeTip =
    p != null
      ? `Calibrated probability of reaching TP1${call.calibrationVersion ? ` (calibration ${call.calibrationVersion})` : ""}${ci ? `, 95% interval ${Math.round(ci[0] * 100)}–${Math.round(ci[1] * 100)}%` : ""}. Raw evidence strength ${call.confidenceRaw ?? call.confidence}.${ciWide ? " Wide interval: few decided calls in this bucket." : ""}`
      : `Evidence strength ${call.confidence} is the raw factor score, not a probability. A calibrated probability appears after 100 decided calls on engine ${d.engineVersion ?? "current"}.`

  // Plan numbers
  const risk = Math.abs(call.entry - call.stopLoss)
  const rr2 = risk > 0 ? Math.abs(call.tp2 - call.entry) / risk : null
  const rrOk = rr2 != null && rr2 >= MIN_RR
  const hold = call.expectedHold ?? null
  const holdFallback = reco.plan?.horizon ?? d.activeSetups?.[0]?.expectedDuration ?? "24h"
  const sizing = call.sizing ?? null
  const sizeFinal = sizing ? sizing.total : call.sizeMultiplier ?? 1
  // Parts do not multiply to the total (headline and counter-trend combine by min, the event window multiplies on top):
  // show the two largest haircuts and print the engine's total.
  const sizeParts = sizing ? [...sizing.parts].filter((x) => x.mult !== 1).sort((a, b) => Math.abs(1 - b.mult) - Math.abs(1 - a.mult)) : []
  const sizeSub = sizing ? (sizeParts.length ? sizeParts.slice(0, 2).map((x) => x.label).join(" · ") : "full size") : call.sizeMultiplier != null && call.sizeMultiplier < 1 ? "gap risk" : "full size"
  const sizeTip = sizing
    ? sizing.parts.length
      ? [...sizing.parts.map((x) => `${x.label} x${x.mult}`), `total x${sizing.total}${call.stopMultiplier != null && call.stopMultiplier !== 1 ? ` · stop x${call.stopMultiplier}` : ""}`].join("\n")
      : "No size haircuts apply."
    : reco.plan?.sizeNote ?? "Size multiplier from the engine's gap-risk rule."

  const plan: { label: string; value: string; sub?: string; sub2?: string; color?: string; subColor?: string; tip?: React.ReactNode }[] = [
    { label: "Entry", value: `$${fmt(call.entry, dp)}`, sub: entryType ?? "market", tip: entryType === "limit" ? "Resting limit order at the entry level." : "Market order at the current price." },
    { label: "Stop", value: `$${fmt(call.stopLoss, dp)}`, sub: pctFrom(call.stopLoss, price), sub2: call.stopAnchor ?? (call.invalidation?.kind === "stop" ? call.invalidation.reason : undefined), color: RED },
    { label: "T1", value: `$${fmt(call.tp1, dp)}`, sub: pctFrom(call.tp1, price), color: GREEN },
    { label: "T2", value: `$${fmt(call.tp2, dp)}`, sub: pctFrom(call.tp2, price), color: GREEN },
    { label: "T3", value: `$${fmt(call.tp3, dp)}`, sub: pctFrom(call.tp3, price), color: GREEN },
    {
      label: "R:R TP2",
      value: rr2 != null ? `1 : ${rr2.toFixed(1)}` : "—",
      sub: rr2 == null ? undefined : rrOk ? `min ${MIN_RR} ✓` : "below min",
      subColor: rrOk ? undefined : AMBER,
      tip: `Reward to risk at the second target. Engine R:R ${call.riskReward.toFixed(1)}. Calls below ${MIN_RR} are flagged.`,
    },
    hold
      ? { label: "Hold", value: `~${fmtMinutes(hold.medianMin)}`, sub: `p25 ${fmtMinutes(hold.p25Min)}`, sub2: `p75 ${fmtMinutes(hold.p75Min)}`, tip: `Median time to TP1 for this symbol, direction and regime bucket on ${hold.tf} candles; n=${hold.n}.` }
      : { label: "Hold", value: `~${holdFallback}`, sub: "estimate", color: "rgba(255,255,255,0.5)", tip: "Horizon estimate from the setup type. Measured hold times appear once the bucket has enough decided calls." },
    { label: "Size", value: `x${sizeFinal}`, sub: sizeSub, color: sizeFinal < 1 ? AMBER : "rgba(255,255,255,0.9)", tip: sizeTip },
  ]

  const degraded = d.degraded ?? []
  const lensCoupling = symbol === "BTC" || symbol === "GOLD" || symbol === "OIL"
  const hist = reco.history

  return (
    <div
      id="sec-call"
      className="rise-in rounded-2xl border p-4 sm:p-6 backdrop-blur-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
      style={{
        borderColor: stale ? "rgba(255,255,255,0.08)" : active ? `${c}40` : "rgba(255,255,255,0.1)",
        background: `linear-gradient(135deg, ${active && !stale ? `${c}14` : "rgba(255,255,255,0.03)"} 0%, rgb(var(--surface-rgb, 10 14 23) / 0.6) 55%)`,
      }}
    >
      {/* Row 1: direction, grade, mode, venue link */}
      <div className="flex flex-wrap items-center gap-2">
        <Tip content={noScan ? "No fresh scan in the last 15 minutes; do not act on this call." : undefined}>
          <span
            className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-black tracking-wide uppercase", noScan && "border border-dashed")}
            style={{ backgroundColor: active ? `${c}22` : "rgba(255,255,255,0.08)", color: c, borderColor: noScan ? `${c}80` : undefined }}
          >
            <Icon className="size-4" />
            {dirLabel(dir)}
          </span>
        </Tip>
        <Chip variant="grade" size="label" tip={gradeTip} className="h-6 gap-1.5 px-2">
          <span className="font-bold">{call.grade}</span>
          <span className="text-white/50">·</span>
          {p != null ? (
            <>
              <span className={cn("font-mono font-bold tabular-nums", ciWide ? "text-white/60" : "text-white/90")}>{Math.round(p * 100)}% TP1</span>
              {ci && <span className="font-mono text-[10px] tabular-nums text-white/60">[{Math.round(ci[0] * 100)}–{Math.round(ci[1] * 100)}]</span>}
              {ciWide && <span className="text-[10px] uppercase text-white/50">low n</span>}
            </>
          ) : (
            <span className="text-white/70">
              evidence <span className="font-mono font-bold tabular-nums text-white/90">{call.confidence}</span>
            </span>
          )}
        </Chip>
        {call.mode && (
          <Chip variant="vol" value={call.mode} tip={`Strategy family chosen by regime and ADX: ${call.mode === "trend" ? "trend continuation" : call.mode === "reversion" ? "mean reversion" : "standby, no family qualifies"}.`}>
            {call.mode}
          </Chip>
        )}
        {venue && (
          <a href={venue.url} target="_blank" rel="noopener noreferrer" className={cn("ml-auto hidden items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/70 hover:border-white/25 hover:text-white transition-colors sm:inline-flex", FOCUS_RING)}>
            {venue.name} <ArrowUpRight className="size-3" />
          </a>
        )}
      </div>

      {/* Row 2: symbol, hero price, 24h, stale and degraded chips */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-bold uppercase tracking-wide text-white/60">{d.assetLabel || symbol}</span>
        <span className={cn("font-mono text-[32px] sm:text-4xl font-extrabold tabular-nums leading-none", stale ? "text-white/60" : "text-white")}>${fmtPrice(price)}</span>
        {change != null && (
          <span className={cn("font-mono text-sm font-semibold tabular-nums", pctColor(change))}>
            {signed(change, 2)}% <span className="text-white/50 font-normal">24h</span>
          </span>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {venue && (
            <a href={venue.url} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/70 hover:border-white/25 hover:text-white transition-colors sm:hidden", FOCUS_RING)}>
              {venue.name} <ArrowUpRight className="size-3" />
            </a>
          )}
          {stale && (
            <Chip variant="warning" icon={RefreshCw} tip="The last engine scan is older than 90 seconds. Levels may have moved.">
              last scan {timeAgo(d.timestamp, now)}
            </Chip>
          )}
          {degraded.length > 0 && (
            <Chip variant="warning" tip={`Feeds down: ${degraded.join(", ")}. Their weights were removed from the denominator; the call is scored on the remaining evidence.`}>
              feeds down: {degraded.join(", ")}
            </Chip>
          )}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] text-white/65 leading-relaxed max-w-3xl">{reco.oneLiner}</p>
      {dir === "WAIT" && call.shadowClass && (
        <p className="mt-0.5 text-[11px] text-white/50">
          declined: {SHADOW_LABEL[call.shadowClass]} · logged as shadow
        </p>
      )}

      {/* Row 3: cloud / 200MA / ADX regime strip, with the macro coupling chip for the three macro lenses */}
      <RegimeStrip regime={d.regime} onJump={onJump} showCoupling={lensCoupling} />

      {/* Row 4: event-window bar, only when the engine reports a window */}
      {call.eventWindow && <EventWindowBar ew={call.eventWindow} callTs={d.timestamp} onJump={onJump} />}

      {/* Row 5: plan, eight tiles */}
      <div className="mt-4">
        <div className={cn("mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1", LABEL)}>
          <span>{active ? "Trade plan" : "Reference plan · not active"}</span>
          {reco.plan?.sizeNote && !sizing && <span className="normal-case tracking-normal" style={{ color: AMBER }}>{reco.plan.sizeNote}</span>}
        </div>
        <div className={cn("grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-8", !active && "opacity-60")}>
          {plan.map((x) => (
            <PlanTile key={x.label} {...x} />
          ))}
        </div>
      </div>

      {/* Row 6: why (block scores) and the four fixed risk rows. On phones the risk rows come first. */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-5">
        <div className="order-2 md:order-1">
          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">
            <Target className="size-3.5" style={{ color: c }} />
            {active ? "Why" : "What the data says"}
            {call.blocks ? (
              <Tip content="Block scores, -100 to 100: TREND (regime and structure), TIMING (momentum and levels), FLOW (positioning and order flow).">
                <span className="ml-auto hidden sm:inline font-mono text-[11px] normal-case tracking-normal tabular-nums text-white/60">
                  trend {signed(call.blocks.trend)} · timing {signed(call.blocks.timing)} · flow {signed(call.blocks.flow)}
                </span>
              </Tip>
            ) : (
              <span className="ml-auto font-mono text-[11px] normal-case tracking-normal tabular-nums text-white/50">
                {reco.tally.bull}↑ {reco.tally.bear}↓ of {reco.tally.total}
              </span>
            )}
          </div>
          <ul className="space-y-1.5">
            {why.length > 0 ? (
              why.map((l, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ backgroundColor: TONE[l.tone] }} />
                  <JumpLink link={l} onJump={onJump} />
                </li>
              ))
            ) : (
              <li className="text-[13px] text-white/50">No strong factors.</li>
            )}
          </ul>
        </div>
        <div className="order-1 md:order-2 space-y-2">
          <RiskRow icon={ShieldAlert} iconColor={RED} label="Wrong if">
            {reco.wrongIf ? (
              <>
                <JumpLink link={reco.wrongIf.link} onJump={onJump} />
                {reco.wrongIf.kind && (
                  <Chip variant="kind" className="ml-1.5 align-[1px]">
                    {reco.wrongIf.kind}
                  </Chip>
                )}
                {reco.wrongIf.reason && <span className="block text-white/60">{reco.wrongIf.reason}</span>}
              </>
            ) : (
              <span className="text-white/50">No invalidation level published for this call.</span>
            )}
          </RiskRow>
          <RiskRow icon={Repeat} iconColor="rgba(255,255,255,0.6)" label="Flips if">
            {reco.flipsIf.length > 0 ? (
              reco.flipsIf.map((f, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="text-white/50"> · or </span>}
                  <JumpLink link={f} onJump={onJump} />
                </React.Fragment>
              ))
            ) : (
              <span className="text-white/50">Nothing is close to flipping this call.</span>
            )}
          </RiskRow>
          <RiskRow icon={CalendarClock} iconColor="rgba(255,255,255,0.6)" label="Next">
            {reco.nextCatalyst ? (
              <>
                <JumpLink link={reco.nextCatalyst} onJump={onJump} />
                {nextMarket && nextMarket.mean != null && (
                  <span className="ml-1.5 inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-white/70">
                    <Tip content={`Prediction-market implied mean on ${nextMarket.venue === "polymarket" ? "Polymarket" : "Kalshi"} versus the consensus forecast.`}>
                      <span style={{ color: nextMarket.venue === "polymarket" ? "#A855F7" : "#22D3EE" }}>{"<>"}</span>
                    </Tip>
                    market mean {nextMarket.mean}
                    {nextMarket.consensus && <span className="text-white/50">vs {nextMarket.consensus}</span>}
                  </span>
                )}
              </>
            ) : (
              <span className="text-white/50">No high-impact release in the next 36h.</span>
            )}
          </RiskRow>
          <RiskRow icon={History} iconColor="rgba(255,255,255,0.6)" label="History" className="hidden sm:flex">
            {hist ? (
              hist.rated ? (
                <a href={`/signals/performance?symbol=${encodeURIComponent(symbol)}`} className={cn("rounded-sm underline decoration-dotted decoration-white/25 underline-offset-[3px] hover:text-white", FOCUS_RING)}>
                  {hist.label}: <span className="font-mono tabular-nums">{hist.wins}/{hist.n}</span> TP1{" "}
                  <span className="font-mono text-[11px] tabular-nums text-white/60">
                    [{Math.round(hist.lo * 100)}–{Math.round(hist.hi * 100)}%]
                  </span>
                  {hold && <span className="text-white/60"> · median {fmtMinutes(hold.medianMin)}</span>}
                </a>
              ) : (
                <span className="text-white/60">
                  {hist.label}: {hist.n} decided, too few to rate
                </span>
              )
            ) : (
              <span className="text-white/50">No decided {symbol} calls yet.</span>
            )}
          </RiskRow>
        </div>
      </div>
    </div>
  )
}
