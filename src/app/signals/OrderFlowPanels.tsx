"use client"

import React from "react"
import { AlertTriangle, BookOpen, Flame } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SignalsResponse } from "./types"
import { GREEN, RED, SURFACE, SectionTitle, fmt, fmtCompact, timeAgo } from "./shared"

// Liquidations and order-book walls, rendered in plain English. Both feeds are OKX samples (one venue), so every
// panel names the venue and the window it covers instead of implying "the whole market".

type Liq = NonNullable<SignalsResponse["market"]["liquidations"]>
type Book = NonNullable<SignalsResponse["orderBook"]>

const usd = (n: number) => `$${fmtCompact(n)}`

function SplitBar({ long, short, label }: { long: number; short: number; label: string }) {
  const tot = long + short
  const lp = tot > 0 ? (long / tot) * 100 : 50
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/40">
        <span>{label}</span>
        <span className="font-mono normal-case tracking-normal text-white/50">{tot > 0 ? usd(tot) : "none"}</span>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full" style={{ width: `${lp}%`, backgroundColor: RED }} title={`Longs liquidated ${usd(long)}`} />
        <div className="h-full" style={{ width: `${100 - lp}%`, backgroundColor: GREEN }} title={`Shorts liquidated ${usd(short)}`} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px]">
        <span style={{ color: RED }}>L {usd(long)}</span>
        <span style={{ color: GREEN }}>S {usd(short)}</span>
      </div>
    </div>
  )
}

export function LiquidationsPanel({ liq, dp, price }: { liq: Liq; dp: number; price: number }) {
  const windowLabel = liq.windowHours >= 23 ? "24h" : `${liq.windowHours}h`
  const domColor = liq.dominant === "long" ? RED : liq.dominant === "short" ? GREEN : "rgba(255,255,255,0.7)"
  const domText = liq.dominant === "long" ? "Longs getting flushed" : liq.dominant === "short" ? "Shorts getting squeezed" : "Two-sided"
  return (
    <div id="sec-liquidations">
      <SectionTitle
        icon={Flame}
        right={
          <span className="text-[10px] text-[#9CA3AF]/80">
            {liq.venue} perps · last {windowLabel}
            {liq.truncated ? " (feed depth limit)" : ""}
          </span>
        }
      >
        Liquidations
      </SectionTitle>
      <div className={cn(SURFACE, "p-4")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: `${domColor}20`, color: domColor }}>
              {domText}
            </span>
            {liq.longPct != null && (
              <span className="ml-2 font-mono text-xs text-white/50">
                {Math.round(liq.longPct * 100)}% longs / {Math.round((1 - liq.longPct) * 100)}% shorts
              </span>
            )}
          </div>
          {liq.largest && (
            <span className="font-mono text-[11px] text-white/45">
              largest {usd(liq.largest.usd)} {liq.largest.side} at ${fmt(liq.largest.price, dp)} · {timeAgo(liq.largest.ts)}
            </span>
          )}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-white/65">{liq.read}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <SplitBar label="Last 1h" long={liq.h1.longUsd} short={liq.h1.shortUsd} />
          <SplitBar label="Last 4h" long={liq.h4.longUsd} short={liq.h4.shortUsd} />
          <SplitBar label={`Last ${windowLabel}`} long={liq.window.longUsd} short={liq.window.shortUsd} />
        </div>

        {liq.clusters.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider text-white/40">Where positions were flushed</p>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {liq.clusters.map((c) => {
                const col = c.side === "long" ? RED : GREEN
                const below = c.price < price
                return (
                  <div key={c.price} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-3 py-1.5 font-mono text-[11px]">
                    <span className="text-white/85">${fmt(c.price, dp)}</span>
                    <span className="text-white/40">{c.distancePct > 0 ? "+" : ""}{c.distancePct}%</span>
                    <span style={{ color: col }}>{usd(c.usd)} {c.side}s</span>
                    <span className="text-white/35">{below ? "swept below" : "swept above"}</span>
                  </div>
                )
              })}
            </div>
            <p className="mt-1.5 text-[10px] text-white/30">
              A zone where many longs were flushed often turns into support once the selling is exhausted. Short clusters above price can become resistance for the same reason.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export function OrderBookPanel({ book, dp, price, call }: { book: Book; dp: number; price: number; call: SignalsResponse["call"] }) {
  const d = book.depth[book.depth.length - 1]
  const lean = d.imbalance >= 0.2 ? "Bid-heavy" : d.imbalance <= -0.2 ? "Ask-heavy" : "Balanced"
  const leanColor = d.imbalance >= 0.2 ? GREEN : d.imbalance <= -0.2 ? RED : "rgba(255,255,255,0.7)"
  const bidPct = d.bidUsd + d.askUsd > 0 ? (d.bidUsd / (d.bidUsd + d.askUsd)) * 100 : 50
  const bandTxt = `${d.band * 100 < 1 ? (d.band * 100).toFixed(2) : (d.band * 100).toFixed(0)}%`

  // How the walls relate to the live plan, so the reader does not have to do the arithmetic.
  const notes: { text: string; color: string }[] = []
  if (call.bias !== "WAIT") {
    const long = call.bias === "LONG"
    const target = call.tp1
    const stop = call.stopLoss
    const blocking = long ? book.askWalls.find((w) => w.price > price && w.price < target) : book.bidWalls.find((w) => w.price < price && w.price > target)
    if (blocking) notes.push({ text: `A ${usd(blocking.usd)} ${long ? "sell" : "buy"} wall at $${fmt(blocking.price, dp)} sits between price and the first target. Consider banking part of the position in front of it.`, color: "#F59E0B" })
    const shield = long ? book.bidWalls.find((w) => w.price < price && w.price > stop) : book.askWalls.find((w) => w.price > price && w.price < stop)
    if (shield) notes.push({ text: `A ${usd(shield.usd)} ${long ? "buy" : "sell"} wall at $${fmt(shield.price, dp)} stands between price and the stop. The stop has cover; if that wall gets eaten, the setup is weakening.`, color: GREEN })
    const squeezeRisk = long ? d.imbalance <= -0.25 : d.imbalance >= 0.25
    if (squeezeRisk) notes.push({ text: `The resting book leans against this ${long ? "long" : "short"}. Size down or wait for the imbalance to ease.`, color: RED })
  }

  const Wall = ({ w, side }: { w: Book["bidWalls"][number]; side: "bid" | "ask" }) => {
    const col = side === "bid" ? GREEN : RED
    return (
      <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-3 py-1.5 font-mono text-[11px]">
        <span className="text-white/85">${fmt(w.price, dp)}</span>
        <span className="text-white/40">{w.distancePct > 0 ? "+" : ""}{w.distancePct}%</span>
        <span style={{ color: col }}>{usd(w.usd)}</span>
        <span className="text-white/35">{w.strength}× median</span>
      </div>
    )
  }

  return (
    <div id="sec-orderbook">
      <SectionTitle icon={BookOpen} right={<span className="text-[10px] text-[#9CA3AF]/80">{book.venue} perps book · covers ±{book.coveragePct}% · spread {book.spreadPct.toFixed(3)}%</span>}>
        Order book walls
      </SectionTitle>
      <div className={cn(SURFACE, "p-4")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: `${leanColor}20`, color: leanColor }}>
            {lean} within {bandTxt}
          </span>
          <span className="font-mono text-[11px] text-white/50">
            {usd(d.bidUsd)} bids vs {usd(d.askUsd)} asks
          </span>
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full" style={{ width: `${bidPct}%`, backgroundColor: GREEN }} />
          <div className="h-full" style={{ width: `${100 - bidPct}%`, backgroundColor: RED }} />
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-white/65">{book.read}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: GREEN }}>Buy walls (support)</p>
            <div className="mt-1.5 space-y-1.5">
              {book.bidWalls.length === 0 ? <p className="text-[11px] text-white/35">None within ±{book.coveragePct}%</p> : book.bidWalls.map((w) => <Wall key={w.price} w={w} side="bid" />)}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: RED }}>Sell walls (resistance)</p>
            <div className="mt-1.5 space-y-1.5">
              {book.askWalls.length === 0 ? <p className="text-[11px] text-white/35">None within ±{book.coveragePct}%</p> : book.askWalls.map((w) => <Wall key={w.price} w={w} side="ask" />)}
            </div>
          </div>
        </div>

        {notes.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {notes.map((n) => (
              <div key={n.text} className="flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed" style={{ borderColor: `${n.color}40`, backgroundColor: `${n.color}0c`, color: "rgba(255,255,255,0.75)" }}>
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" style={{ color: n.color }} />
                <span>{n.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
