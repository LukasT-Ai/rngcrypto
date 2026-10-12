"use client"

import React from "react"
import { Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SectionId } from "./recommendation"
import type { RegimeInfo, RegimeTF, RegimeTFInfo, TrendStrength } from "./types"
import { AMBER, Chip, GRAY, GREEN, RED, fmt, fmtPrice } from "./shared"

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

export const cloudColor = (c: RegimeTFInfo["cloud"] | null | undefined) => (c === "above" ? GREEN : c === "below" ? RED : c === "inside" ? AMBER : GRAY)
export const cloudLabel = (c: RegimeTFInfo["cloud"] | null | undefined) => (c === "above" ? "Above cloud" : c === "below" ? "Below cloud" : c === "inside" ? "In cloud" : "Cloud n/a")
export const ma200Color = (s: RegimeTFInfo["ma200Side"] | null | undefined) => (s === "above" ? GREEN : s === "below" ? RED : GRAY)
export const ma200Label = (s: RegimeTFInfo["ma200Side"] | null | undefined) => (s === "above" ? "> 200MA" : s === "below" ? "< 200MA" : s === "at" ? "At 200MA" : "200MA n/a")
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

export function RegimeStrip({ regime, onJump }: { regime: RegimeInfo | null | undefined; onJump: (anchor: SectionId) => void }) {
  if (!regime) return null
  const lc = regimeLabelColor(regime.label)
  const directional = regime.label === "Bull regime" || regime.label === "Bear regime"
  const weak = directional && isWeakStrength(regime.trendStrength)
  const tfs = TF_ORDER.filter((tf) => regime.perTF[tf])

  return (
    <a
      href="#sec-regime"
      onClick={(e) => {
        e.preventDefault()
        onJump("sec-regime")
      }}
      className="mt-2.5 flex flex-wrap items-center gap-1.5 group"
      title="Jump to the cloud, 200MA and ADX breakdown"
    >
      <Chip color={lc} title={regime.notes[0]} className={cn(weak && "opacity-55")}>
        Regime · {regime.label}
        <span className="font-medium normal-case tracking-normal opacity-80">· {strengthSuffix(regime.trendStrength)}</span>
      </Chip>
      {regime.trendStrength === "extreme" && (
        <Chip color={AMBER} title="ADX above 40: the move is stretched; late entries carry mean-reversion risk">
          stretched
        </Chip>
      )}
      {weak && (
        <Chip color={GRAY} title="Price is on the trending side of the cloud and 200MA, but ADX says there is no trend: treat it as a range, not a breakout">
          range, no breakout
        </Chip>
      )}
      {regime.gate === "counter_trend" && (
        <Chip color={AMBER} title="This call fights the higher-timeframe regime: half size, capped targets">
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
            <span className="ml-1 font-mono text-[10px] text-white/40">{tf}</span>
            <span className={cn("inline-flex items-center gap-1", tfWeak && "opacity-55")}>
              <Chip color={cloudColor(t.cloud)} title={tip}>
                {cloudLabel(t.cloud)}
              </Chip>
              {t.ma200Side != null && (
                <Chip color={ma200Color(t.ma200Side)} title={tip}>
                  {ma200Label(t.ma200Side)}
                </Chip>
              )}
              {(freshTk || twist) && (
                <Chip color={tkDir === "bullish" ? GREEN : RED} title={freshTk ? `Fresh ${t.tkCross} Tenkan/Kijun cross ${t.tkCrossBarsAgo} bars ago` : `${t.kumoTwist} kumo twist ahead`}>
                  <Zap className="size-2.5" />
                  {freshTk ? `TK ${t.tkCross === "bullish" ? "↑" : "↓"}` : `Twist ${t.kumoTwist === "bullish" ? "↑" : "↓"}`}
                </Chip>
              )}
            </span>
            {tfWeak && (
              <Chip color={GRAY} title={tip}>
                ADX {fmt(t.adx, 0)} · range
              </Chip>
            )}
          </span>
        )
      })}
    </a>
  )
}
