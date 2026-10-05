"use client"

import React from "react"
import { ArrowDownRight, Target, ShieldAlert, CheckCircle2, History, CalendarClock, Crosshair } from "lucide-react"
import type { Recommendation, RecoLink } from "./recommendation"

export function jumpToSection(id: string, accent = "#F59E0B"): boolean {
  if (typeof document === "undefined") return false
  const el = document.getElementById(id)
  if (!el) return false
  let p: HTMLElement | null = el
  while (p) {
    if (p instanceof HTMLDetailsElement) p.open = true
    p = p.parentElement
  }
  el.style.scrollMarginTop = "88px"
  // Smooth scrolling across a 6,000px page takes seconds and feels broken; snap when the target is far away
  const distance = Math.abs(el.getBoundingClientRect().top - 88)
  el.scrollIntoView({ behavior: distance > 1800 ? "auto" : "smooth", block: "start" })
  if (!el.style.borderRadius) el.style.borderRadius = "12px"
  el.style.transition = "box-shadow 300ms ease"
  el.style.boxShadow = `0 0 0 2px ${accent}`
  window.setTimeout(() => {
    el.style.boxShadow = ""
  }, 1800)
  try {
    window.history.replaceState(null, "", `#${id}`)
  } catch {
    /* ignore */
  }
  return true
}

const TONE: Record<RecoLink["tone"], string> = {
  pos: "#00FF88",
  neg: "#FF3B5C",
  neutral: "#F59E0B",
}

function Link({ link, accent }: { link: RecoLink; accent: string }) {
  if (!link.anchor) return <span className="text-white/75">{link.text}</span>
  return (
    <a
      href={`#${link.anchor}`}
      onClick={(e) => {
        e.preventDefault()
        if (link.anchor) jumpToSection(link.anchor, accent)
      }}
      className="group inline text-white/75 underline decoration-dotted decoration-white/25 underline-offset-[3px] hover:text-white hover:decoration-white/70 transition-colors"
      title="Jump to the section that shows this"
    >
      {link.text}
      <ArrowDownRight className="ml-0.5 inline size-3 align-[-1px] text-white/25 group-hover:text-white/70 transition-colors" />
    </a>
  )
}

function Bullet({ link, accent }: { link: RecoLink; accent: string }) {
  return (
    <li className="flex items-start gap-2 text-[13px] leading-snug">
      <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ backgroundColor: TONE[link.tone] }} />
      <Link link={link} accent={accent} />
    </li>
  )
}

const fmtN = (n: number, dp: number) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })

export function RecommendationCard({
  reco,
  accent,
  dp,
  price,
  loading,
  symbol,
}: {
  reco: Recommendation | null
  accent: string
  dp: number
  price: number
  loading: boolean
  symbol: string
}) {
  if (loading || !reco) {
    return (
      <div id="sec-reco" className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 animate-pulse">
        <div className="h-5 w-56 rounded bg-white/[0.06] mb-3" />
        <div className="h-3.5 w-full max-w-2xl rounded bg-white/[0.05] mb-2" />
        <div className="h-3.5 w-3/4 max-w-xl rounded bg-white/[0.05]" />
        <div className="mt-4 text-[11px] text-white/30">Building recommendation for {symbol}…</div>
      </div>
    )
  }

  const c = reco.action === "LONG" ? "#00FF88" : reco.action === "SHORT" ? "#FF3B5C" : "#F59E0B"
  const pct = (t: number) => (price > 0 ? `${((t - price) / price) * 100 >= 0 ? "+" : ""}${(((t - price) / price) * 100).toFixed(1)}%` : "")

  return (
    <div
      id="sec-reco"
      className="rounded-2xl border p-5 sm:p-6"
      style={{ borderColor: `${c}35`, background: `linear-gradient(135deg, ${c}0D 0%, rgba(255,255,255,0.02) 55%)` }}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="rounded-md px-2.5 py-1 text-sm font-black tracking-wide" style={{ backgroundColor: `${c}22`, color: c }}>
          {reco.action}
        </span>
        <span className="rounded-md px-2 py-1 text-[11px] font-bold uppercase text-white/70 bg-white/[0.06]">
          {reco.conviction.grade} · {reco.conviction.label} conviction
        </span>
        <div className="flex items-center gap-2 ml-auto" title="Confidence">
          <div className="h-1.5 w-28 rounded bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded" style={{ width: `${reco.conviction.confidence}%`, backgroundColor: c }} />
          </div>
          <span className="font-mono text-xs font-bold" style={{ color: c }}>
            {reco.conviction.confidence}%
          </span>
        </div>
      </div>

      <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">{reco.headline}</h2>
      <p className="mt-1.5 text-sm text-white/65 leading-relaxed max-w-3xl">{reco.oneLiner}</p>

      {reco.plan && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { k: "Entry", v: reco.plan.entry, sub: pct(reco.plan.entry) },
            { k: "Stop", v: reco.plan.stop, sub: pct(reco.plan.stop), col: "#FF3B5C" },
            { k: "Target 1", v: reco.plan.tp1, sub: pct(reco.plan.tp1), col: "#00FF88" },
            { k: "Target 2", v: reco.plan.tp2, sub: pct(reco.plan.tp2), col: "#00FF88" },
          ].map((x) => (
            <button
              key={x.k}
              type="button"
              onClick={() => jumpToSection("sec-call", accent)}
              className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-left hover:border-white/20 transition-colors"
              title="Jump to the full trade card"
            >
              <div className="text-[10px] uppercase tracking-wide text-white/35">{x.k}</div>
              <div className="font-mono text-sm font-bold" style={{ color: x.col ?? "rgba(255,255,255,0.9)" }}>
                ${fmtN(x.v, dp)}
              </div>
              <div className="font-mono text-[10px] text-white/35">{x.sub}</div>
            </button>
          ))}
          <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-white/35">R:R · Horizon</div>
            <div className="font-mono text-sm font-bold text-white/90">{reco.plan.rr.toFixed(1)}</div>
            <div className="text-[10px] text-white/35">{reco.plan.horizon}</div>
          </div>
        </div>
      )}
      {reco.plan?.sizeNote && (
        <div className="mt-2 text-[11px] font-medium" style={{ color: "#F59E0B" }}>
          {reco.plan.sizeNote}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-wider text-white/45">
            <Target className="size-3.5" style={{ color: c }} />
            {reco.action === "WAIT" ? "What the data says" : "Why"}
            <span className="ml-auto font-mono text-[10px] text-white/30">
              {reco.tally.bull}↑ {reco.tally.bear}↓ of {reco.tally.total}
            </span>
          </div>
          <ul className="space-y-1.5">
            {reco.because.length > 0 ? reco.because.map((l, i) => <Bullet key={i} link={l} accent={accent} />) : <li className="text-[13px] text-white/40">No strong factors.</li>}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-wider text-white/45">
            <ShieldAlert className="size-3.5 text-[#F59E0B]" />
            Watch out for
          </div>
          <ul className="space-y-1.5">
            {reco.butWatch.length > 0 ? reco.butWatch.map((l, i) => <Bullet key={i} link={l} accent={accent} />) : <li className="text-[13px] text-white/40">No major opposing signals.</li>}
          </ul>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 border-t border-white/[0.06] pt-4 text-[12px]">
        {reco.invalidation && (
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-[#FF3B5C]" />
            <span>
              <span className="text-white/40">Idea is wrong if: </span>
              <Link link={reco.invalidation} accent={accent} />
            </span>
          </div>
        )}
        {reco.confirmation && (
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#00FF88]" />
            <span>
              <span className="text-white/40">Gets stronger if: </span>
              <Link link={reco.confirmation} accent={accent} />
            </span>
          </div>
        )}
        {reco.nextCatalyst && (
          <div className="flex items-start gap-2">
            <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-[#F59E0B]" />
            <span>
              <span className="text-white/40">Next catalyst: </span>
              <Link link={reco.nextCatalyst} accent={accent} />
            </span>
          </div>
        )}
        {reco.trackRecord ? (
          <div className="flex items-start gap-2">
            <History className="mt-0.5 size-3.5 shrink-0 text-white/40" />
            <span>
              <span className="text-white/40">Track record: </span>
              <Link link={reco.trackRecord} accent={accent} />
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-white/35">
            <History className="mt-0.5 size-3.5 shrink-0" />
            <span>Track record: not enough decided {symbol} calls yet — accuracy appears here after ~5 outcomes.</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-white/25">
        <Crosshair className="size-3" />
        Every underlined item jumps to the chart or statistic it is based on.
      </div>
    </div>
  )
}
