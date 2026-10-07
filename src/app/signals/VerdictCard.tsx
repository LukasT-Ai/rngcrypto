"use client"

import React from "react"
import { ArrowDownRight, CalendarClock, History, Pause, ShieldAlert, Target, TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Recommendation, RecoLink, SectionId } from "./recommendation"
import type { SignalsResponse } from "./types"
import { AMBER, GRADE_LABEL, GREEN, RED, dirLabel, fmt, fmtPrice, pctColor, pctFrom } from "./shared"

const TONE: Record<RecoLink["tone"], string> = { pos: GREEN, neg: RED, neutral: "rgba(255,255,255,0.55)" }

function JumpLink({ link, onJump }: { link: RecoLink; onJump: (anchor: SectionId) => void }) {
  if (!link.anchor) return <span className="text-white/75">{link.text}</span>
  const anchor = link.anchor
  return (
    <a
      href={`#${anchor}`}
      onClick={(e) => {
        e.preventDefault()
        onJump(anchor)
      }}
      className="group inline text-white/75 underline decoration-dotted decoration-white/25 underline-offset-[3px] hover:text-white hover:decoration-white/70 transition-colors"
      title="Jump to the data behind this"
    >
      {link.text}
      <ArrowDownRight className="ml-0.5 inline size-3 align-[-1px] text-[#9CA3AF]/70 group-hover:text-white/70 transition-colors" />
    </a>
  )
}

// One card that merges the plain-English recommendation and the trade call: direction, grade, one confidence bar,
// price, the plan, up to three reasons, one invalidation, the next catalyst.
export function VerdictCard({
  d,
  reco,
  dp,
  symbol,
  loading,
  onJump,
}: {
  d: SignalsResponse | undefined
  reco: Recommendation | null
  dp: number
  symbol: string
  loading: boolean
  onJump: (anchor: SectionId) => void
}) {
  if (loading || !d || !reco) {
    return (
      <div id="sec-call" className="rounded-2xl border border-white/[0.08] bg-[rgb(var(--surface-rgb,10_14_23)/0.5)] backdrop-blur-md p-5 animate-pulse">
        <div className="h-6 w-56 rounded bg-white/[0.06] mb-3" />
        <div className="h-10 w-40 rounded bg-white/[0.06] mb-4" />
        <div className="h-3.5 w-full max-w-2xl rounded bg-white/[0.05] mb-2" />
        <div className="h-3.5 w-3/4 max-w-xl rounded bg-white/[0.05]" />
        <div className="mt-4 text-[11px] text-[#9CA3AF]/80">Building the {symbol} verdict…</div>
      </div>
    )
  }

  const call = d.call
  const dir = call.bias
  const c = dir === "LONG" ? GREEN : dir === "SHORT" ? RED : "rgba(255,255,255,0.7)"
  const Icon = dir === "LONG" ? TrendingUp : dir === "SHORT" ? TrendingDown : Pause
  const price = d.price.mark
  const change = d.price.change24h
  const active = dir !== "WAIT"
  const gradeLabel = GRADE_LABEL[call.grade] ?? ""
  const why = reco.because.slice(0, 3)
  const wrongIf: RecoLink | null = reco.invalidation ?? (call.invalidates[0] ? { text: call.invalidates[0], anchor: null, tone: "neg", weight: 0 } : null)
  const entryType = d.entryType ?? call.entryType ?? null

  const plan = [
    { k: "Entry", v: call.entry, col: "rgba(255,255,255,0.9)" },
    { k: "Stop", v: call.stopLoss, col: RED },
    { k: "T1", v: call.tp1, col: GREEN },
    { k: "T2", v: call.tp2, col: GREEN },
    { k: "T3", v: call.tp3, col: GREEN },
  ]

  return (
    <div
      id="sec-call"
      className="rounded-2xl border p-5 sm:p-6 backdrop-blur-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
      style={{ borderColor: active ? `${c}40` : "rgba(255,255,255,0.1)", background: `linear-gradient(135deg, ${active ? `${c}14` : "rgba(255,255,255,0.03)"} 0%, rgb(var(--surface-rgb, 10 14 23) / 0.6) 55%)` }}
    >
      {/* Row 1: direction, grade, confidence */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-black tracking-wide uppercase" style={{ backgroundColor: active ? `${c}22` : "rgba(255,255,255,0.08)", color: c }}>
          <Icon className="size-4" />
          {dirLabel(dir)}
        </span>
        <span className="rounded-md px-2 py-1 text-[11px] font-bold text-white/80 bg-white/[0.06]" title="Grade">
          {call.grade}
          {gradeLabel && <span className="ml-1 font-medium normal-case text-white/50">· {gradeLabel}</span>}
        </span>
        <span className="rounded-md px-2 py-1 text-[11px] font-medium text-white/50 bg-white/[0.04]" title="Volatility regime">
          {call.regime}
        </span>
        <div className="flex items-center gap-2 ml-auto" title="Confidence that this direction plays out">
          <span className="text-[10px] uppercase tracking-wider text-white/40">Confidence</span>
          <div className="h-1.5 w-24 sm:w-32 rounded bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded" style={{ width: `${call.confidence}%`, backgroundColor: active ? c : "rgba(255,255,255,0.5)" }} />
          </div>
          <span className="font-mono text-xs font-bold" style={{ color: active ? c : "rgba(255,255,255,0.7)" }}>{call.confidence}%</span>
        </div>
      </div>

      {/* Row 2: symbol, price, 24h */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-bold uppercase tracking-wide text-white/60">{d.assetLabel || symbol}</span>
        <span className="font-mono text-3xl sm:text-4xl font-black tabular-nums text-white">${fmtPrice(price)}</span>
        {change != null && (
          <span className={cn("font-mono text-sm font-semibold tabular-nums", pctColor(change))}>
            {change >= 0 ? "+" : ""}
            {change.toFixed(2)}% <span className="text-white/35 font-normal">24h</span>
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-white/65 leading-relaxed max-w-3xl">{reco.oneLiner}</p>

      {/* Row 3: plan */}
      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5 text-[10px] uppercase tracking-wide text-white/35">
          <span>{active ? "Trade plan" : "Reference plan · not active"}</span>
          {entryType && (
            <span className="rounded px-1.5 py-px bg-white/[0.06] text-white/60 normal-case tracking-normal" title="How the engine suggests entering">
              Entry type: {entryType}
            </span>
          )}
          {reco.plan?.horizon && <span className="normal-case tracking-normal">Horizon {reco.plan.horizon}</span>}
        </div>
        <div className={cn("grid grid-cols-3 sm:grid-cols-6 gap-2", !active && "opacity-60")}>
          {plan.map((x) => (
            <div key={x.k} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-white/35">{x.k}</div>
              <div className="font-mono text-sm font-bold truncate" style={{ color: x.col }}>${fmt(x.v, dp)}</div>
              <div className="font-mono text-[10px] text-white/35">{pctFrom(x.v, price)}</div>
            </div>
          ))}
          <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-white/35">R:R</div>
            <div className="font-mono text-sm font-bold text-white/90">1 : {call.riskReward.toFixed(1)}</div>
            {call.sizeMultiplier != null && call.sizeMultiplier < 1 && (
              <div className="font-mono text-[10px]" style={{ color: AMBER }}>size {call.sizeMultiplier}x</div>
            )}
          </div>
        </div>
        {reco.plan?.sizeNote && <div className="mt-1.5 text-[11px] font-medium" style={{ color: AMBER }}>{reco.plan.sizeNote}</div>}
      </div>

      {/* Row 4: why / wrong if / next catalyst */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-5">
        <div>
          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-wider text-white/45">
            <Target className="size-3.5" style={{ color: c }} />
            {active ? "Why" : "What the data says"}
            <span className="ml-auto font-mono text-[10px] text-[#9CA3AF]/80">{reco.tally.bull}↑ {reco.tally.bear}↓ of {reco.tally.total}</span>
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
              <li className="text-[13px] text-white/40">No strong factors.</li>
            )}
          </ul>
        </div>
        <div className="space-y-2 text-[12px]">
          {wrongIf && (
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" style={{ color: RED }} />
              <span>
                <span className="text-white/40">Wrong if: </span>
                <JumpLink link={wrongIf} onJump={onJump} />
              </span>
            </div>
          )}
          {reco.nextCatalyst && (
            <div className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 size-3.5 shrink-0" style={{ color: AMBER }} />
              <span>
                <span className="text-white/40">Next catalyst: </span>
                <JumpLink link={reco.nextCatalyst} onJump={onJump} />
              </span>
            </div>
          )}
          {reco.trackRecord && (
            <div className="flex items-start gap-2">
              <History className="mt-0.5 size-3.5 shrink-0 text-white/40" />
              <span>
                <span className="text-white/40">{symbol} history: </span>
                <JumpLink link={reco.trackRecord} onJump={onJump} />
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
