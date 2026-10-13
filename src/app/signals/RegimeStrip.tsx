"use client"

import React from "react"
import { ArrowDownRight, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SectionId } from "./recommendation"
import type { RegimeInfo, RegimeTF, RegimeTFInfo, TrendStrength } from "./types"
import { AMBER, Chip, FOCUS_RING, GRAY, GREEN, RED, fmt, fmtPrice } from "./shared"

// Compact Ichimoku cloud / 200MA / ADX regime strip for the verdict card. One scan-line that wraps.
// Two visual channels: direction (cloud, 200MA, DI) uses colour; strength (ADX) uses opacity plus a word.
// Renders nothing when the engine did not produce a regime block (cached pre-regime responses).

export const TF_ORDER: RegimeTF[] = ["15m", "4h", "1d"]

export const regimeLabelColor = (label: RegimeInfo["label"] | string | null | undefined) => {
  if (label === "Bull regime") return GREEN
  if (label === "Bear regime") return RED
  if (label === "Transition") return AMBER
  return GRAY
}

export const isWeakStrength = (s: TrendStrength | null | undefined) => s == null || s === "none" || s === "weak"

// Suffix on the overall label chip. Strength is a word, never a colour.
export const strengthSuffix = (s: TrendStrength | null | undefined) => {
  if (s === "emerging") return "emerging"
  if (s === "strong") return "strong"
  if (s === "extreme") return "stretched"
  return "no trend yet"
}

// Inside the cloud is "undecided": neutral gray, not a warning.
export const cloudColor = (c: RegimeTFInfo["cloud"] | null | undefined) => (c === "above" ? GREEN : c === "below" ? RED : GRAY)
export const cloudLabel = (c: RegimeTFInfo["cloud"] | null | undefined) => (c === "above" ? "Above cloud" : c === "below" ? "Below cloud" : c === "inside" ? "In cloud" : "Cloud n/a")
export const cloudDir = (c: RegimeTFInfo["cloud"] | null | undefined) => (c === "above" ? "bullish" : c === "below" ? "bearish" : "neutral")
export const ma200Color = (s: RegimeTFInfo["ma200Side"] | null | undefined) => (s === "above" ? GREEN : s === "below" ? RED : GRAY)
export const ma200Label = (s: RegimeTFInfo["ma200Side"] | null | undefined) => (s === "above" ? "> 200MA" : s === "below" ? "< 200MA" : s === "at" ? "At 200MA" : "200MA n/a")
export const ma200Dir = (s: RegimeTFInfo["ma200Side"] | null | undefined) => (s === "above" ? "bullish" : s === "below" ? "bearish" : "neutral")
export const slopeGlyph = (s: "rising" | "falling" | "flat" | null | undefined) => (s === "rising" ? "↗" : s === "falling" ? "↘" : "→")

export function tfTooltip(tf: RegimeTF, t: RegimeTFInfo): string {
  const parts = [
    `${tf} regime score ${t.score > 0 ? "+" : ""}${t.score}`,
    `Cloud ${t.cloud} (${t.cloudColor}${t.cloudThin ? ", thin" : ""}) top ${fmtPrice(t.cloudTop)} / bottom ${fmtPrice(t.cloudBottom)}`,
    `Kijun ${fmtPrice(t.kijun)} · Tenkan ${fmtPrice(t.tenkan)}`,
    t.tkCross !== "none" && t.tkCrossBarsAgo >= 0 ? `TK cross ${t.tkCross} ${t.tkCrossBarsAgo} bars ago` : `TK state ${t.tkState}`,
    t.kumoTwist !== "none" ? `Kumo twist ${t.kumoTwist} ahead` : null,
    `Chikou ${t.chikou} price`,
    t.sma200 != null ? `SMA200 ${fmtPrice(t.sma200)}${t.ma200Side ? ` (price ${t.ma200Side})` : ""}` : "SMA200 n/a",
    t.ema200 != null ? `EMA200 ${fmtPrice(t.ema200)}` : null,
    t.ma200DistAtr != null ? `Distance ${fmt(t.ma200DistAtr, 1)} ATR` : null,
    t.ma200Slope ? `200MA slope ${t.ma200Slope}` : null,
    t.freshCross ? `Fresh ${t.freshCross} 200MA cross${t.barsSinceCross != null ? ` ${t.barsSinceCross} bars ago` : ""}` : null,
    t.goldenCross ? `${t.goldenCross} cross in place` : null,
    `ADX ${fmt(t.adx, 1)} (${t.trendStrength}, ${t.adxSlope}) · +DI ${fmt(t.plusDI, 1)} / -DI ${fmt(t.minusDI, 1)} (${t.diBias})`,
  ].filter(Boolean)
  return parts.join("\n")
}

// 30-point sparkline of the rolling correlation (F2.8): white/35 line, last point in the brand colour, no axes.
// Renders nothing below two points.
export function Sparkline({ series, width = 48, height = 12, className }: { series: number[] | null | undefined; width?: number; height?: number; className?: string }) {
  const pts = (series ?? []).filter((v) => Number.isFinite(v)).slice(-30)
  if (pts.length < 2) return null
  const lo = Math.min(...pts)
  const hi = Math.max(...pts)
  const span = hi - lo || 1
  const x = (i: number) => (i / (pts.length - 1)) * (width - 2) + 1
  const y = (v: number) => height - 1 - ((v - lo) / span) * (height - 2)
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
  const last = pts[pts.length - 1]
  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("shrink-0", className)}>
      <path d={d} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(pts.length - 1)} cy={y(last)} r={1.5} fill="var(--brand, #00FF88)" />
    </svg>
  )
}

export const couplingTip = (c: { corr30d: number; mult: number }) => `30-day correlation with risk assets ${c.corr30d.toFixed(2)}; macro and event weights are scaled by ${c.mult.toFixed(2)}.${c.mult < 0.3 ? " Macro features are mostly silenced in this regime." : ""}`

export function RegimeStrip({ regime, onJump, showCoupling = false }: { regime: RegimeInfo | null | undefined; onJump: (anchor: SectionId) => void; showCoupling?: boolean }) {
  if (!regime) return null
  const directional = regime.label === "Bull regime" || regime.label === "Bear regime"
  const weak = directional && isWeakStrength(regime.trendStrength)
  const tfs = TF_ORDER.filter((tf) => regime.perTF[tf])
  const coupling = showCoupling ? regime.macroCoupling ?? null : null

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <Chip variant="regime" value={regime.label} tip={regime.notes[0]} className={cn(weak && "opacity-55")}>
        {regime.label}
        <span className="font-medium normal-case tracking-normal opacity-80">· {strengthSuffix(regime.trendStrength)}</span>
      </Chip>
      {regime.trendStrength === "extreme" && (
        <Chip variant="warning" tip="ADX above 40: the move is stretched; late entries carry mean-reversion risk">
          stretched
        </Chip>
      )}
      {weak && (
        <Chip variant="vol" tip="Price is on the trending side of the cloud and 200MA, but ADX says there is no trend: treat it as a range, not a breakout">
          range, no breakout
        </Chip>
      )}
      {regime.gate === "counter_trend" && (
        <Chip variant="warning" tip="This call fights the higher-timeframe regime: half size, capped targets">
          counter-trend
        </Chip>
      )}
      {tfs.map((tf) => {
        const t = regime.perTF[tf]!
        const tip = tfTooltip(tf, t)
        const tfWeak = isWeakStrength(t.trendStrength)
        const freshTk = t.tkCross !== "none" && t.tkCrossBarsAgo >= 0 && t.tkCrossBarsAgo <= 3
        const twist = t.kumoTwist !== "none"
        const tkDir = freshTk ? t.tkCross : t.kumoTwist
        return (
          <span key={tf} className={cn("items-center gap-1", tf === "15m" ? "hidden sm:inline-flex" : "inline-flex")}>
            <span className="ml-1 font-mono text-[11px] text-white/50">{tf}</span>
            <span className={cn("inline-flex items-center gap-1", tfWeak && "opacity-55")}>
              <Chip variant="direction" value={cloudDir(t.cloud)} tip={tip}>
                {cloudLabel(t.cloud)}
              </Chip>
              {t.ma200Side != null && (
                <Chip variant="direction" value={ma200Dir(t.ma200Side)} tip={tip}>
                  {ma200Label(t.ma200Side)}
                </Chip>
              )}
              {(freshTk || twist) && (
                <Chip variant="direction" value={tkDir} icon={Zap} tip={freshTk ? `Fresh ${t.tkCross} Tenkan/Kijun cross ${t.tkCrossBarsAgo} bars ago` : `${t.kumoTwist} kumo twist ahead`}>
                  {freshTk ? `TK ${t.tkCross === "bullish" ? "↑" : "↓"}` : `Twist ${t.kumoTwist === "bullish" ? "↑" : "↓"}`}
                </Chip>
              )}
            </span>
            {tfWeak && (
              <Chip variant="vol" tip={tip}>
                ADX {fmt(t.adx, 0)} · range
              </Chip>
            )}
          </span>
        )
      })}
      {coupling && (
        <Chip variant="vol" className="ml-auto" tip={couplingTip(coupling)}>
          coupling {coupling.mult.toFixed(1)}
          <Sparkline series={coupling.series} />
        </Chip>
      )}
      <a
        href="#sec-regime"
        onClick={(e) => {
          e.preventDefault()
          onJump("sec-regime")
        }}
        className={cn("inline-flex items-center gap-0.5 rounded-sm text-[11px] text-white/50 hover:text-white/80 transition-colors", !coupling && "ml-auto", FOCUS_RING)}
      >
        regime breakdown <ArrowDownRight className="size-3" />
      </a>
    </div>
  )
}
