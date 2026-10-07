"use client"

import React from "react"
import { Activity, BarChart, BarChart3, Gauge, Layers, Target, TrendingUp, Waves, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SignalsResponse } from "../types"
import { AMBER, DivergenceCard, GRAY, GREEN, RED, SURFACE, SectionTitle, StatCard, dirColor, dirLabel, fmt, fmtPrice } from "../shared"

function HtfCard({ label, trend, rsi }: { label: string; trend: string; rsi: number }) {
  const tc = dirColor(trend)
  return (
    <div className={cn(SURFACE, "p-4")}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-white/50 uppercase">{label}</span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ backgroundColor: `${tc}15`, color: tc }}>{trend}</span>
      </div>
      <span className="text-[10px] text-white/40">RSI</span>
      <p className="font-mono text-lg font-bold tabular-nums" style={{ color: rsi < 30 ? GREEN : rsi > 70 ? RED : "rgba(255,255,255,0.85)" }}>{fmt(rsi, 1)}</p>
    </div>
  )
}

export function MomentumTab({ d }: { d: SignalsResponse }) {
  const ind = d.indicators
  const px = d.price.mark
  const divs = d.divergences
  const pats = d.patterns
  const tfo = d.timeframeOutlook
  const htf = d.htf

  const trends = [htf.trend1h, htf.trend4h, ...(htf.trendDaily ? [htf.trendDaily] : [])]
  const htfAligned = trends.every((t) => t === trends[0])

  return (
    <div className="space-y-6">
      {/* Technical indicators */}
      <div id="sec-indicators">
        <SectionTitle icon={Gauge}>Technical indicators</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="RSI (14)" value={fmt(ind.rsi, 1)} sub={ind.rsi < 30 ? "Oversold" : ind.rsi > 70 ? "Overbought" : "Neutral"} color={ind.rsi < 30 ? GREEN : ind.rsi > 70 ? RED : undefined} icon={Gauge} />
          {ind.rsi5m != null && <StatCard label="RSI 5m" value={fmt(ind.rsi5m, 1)} sub={ind.rsi5m < 30 ? "Oversold" : ind.rsi5m > 70 ? "Overbought" : "Neutral"} color={ind.rsi5m < 30 ? GREEN : ind.rsi5m > 70 ? RED : undefined} icon={Gauge} />}
          <StatCard label="Stoch RSI" value={`K ${fmt(ind.stochRsi.k, 1)} / D ${fmt(ind.stochRsi.d, 1)}`} sub={ind.stochRsi.k > 80 ? "Stretched high" : ind.stochRsi.k < 20 ? "Washed out" : "Neutral"} color={ind.stochRsi.k > 80 ? RED : ind.stochRsi.k < 20 ? GREEN : undefined} icon={Activity} />
          <StatCard label="MACD Hist" value={fmt(ind.macd.histogram, 2)} sub={ind.macd.histogram > 0 ? "Bullish momentum" : "Bearish momentum"} color={ind.macd.histogram > 0 ? GREEN : RED} icon={BarChart3} />
          <StatCard label="MACD Line" value={fmt(ind.macd.value, 2)} sub={ind.macd.value > ind.macd.signal ? "Above signal" : "Below signal"} color={ind.macd.value > ind.macd.signal ? GREEN : RED} icon={Zap} />
          <StatCard label="ADX" value={fmt(ind.adx, 1)} sub={ind.regime} color={ind.adx > 25 ? undefined : GRAY} icon={Activity} />
          <StatCard label="Trend" value={ind.trendDirection} sub={`EMA ${ind.ema9 > ind.ema21 ? "9>21" : "21>9"}${ind.ema21 > ind.ema50 ? " >50" : ""}`} color={dirColor(ind.trendDirection)} icon={TrendingUp} />
          <StatCard label="Supertrend" value={ind.supertrend === 1 ? "Bullish" : "Bearish"} color={ind.supertrend === 1 ? GREEN : RED} icon={Zap} />
          <StatCard
            label="Bollinger"
            value={px >= ind.bb.upper ? "Upper band" : px <= ind.bb.lower ? "Lower band" : "Middle"}
            sub={`${fmtPrice(ind.bb.lower)} — ${fmtPrice(ind.bb.upper)}`}
            color={px >= ind.bb.upper ? RED : px <= ind.bb.lower ? GREEN : undefined}
            icon={Layers}
          />
          <StatCard label="BB Width" value={fmt(ind.bb.width, 4)} sub={ind.bb.width < 0.03 ? "Compression" : ind.bb.width > 0.08 ? "Expansion" : "Normal"} color={ind.bb.width < 0.03 ? AMBER : undefined} icon={BarChart} />
          <StatCard label="ATR (14)" value={`$${fmtPrice(ind.atr)}`} sub={px > 0 ? `${((ind.atr / px) * 100).toFixed(2)}% of price` : undefined} icon={Target} />
          <StatCard label="EMA 9 / 21 / 50" value={`$${fmtPrice(ind.ema9)}`} sub={`$${fmtPrice(ind.ema21)} / $${fmtPrice(ind.ema50)}`} icon={Gauge} />
          {ind.ema200 != null && <StatCard label="EMA 200" value={`$${fmtPrice(ind.ema200)}`} sub={px > ind.ema200 ? "Price above" : "Price below"} color={px > ind.ema200 ? GREEN : RED} icon={TrendingUp} />}
        </div>
      </div>

      {/* Divergences & patterns */}
      <div id="sec-divergences">
        <SectionTitle icon={Waves}>Divergences &amp; patterns</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DivergenceCard label="RSI 15m" value={divs.rsiDivergence15m} />
          <DivergenceCard label="RSI 1H" value={divs.rsiDivergence1h} />
          <DivergenceCard label="MACD" value={divs.macdDivergence} />
          <DivergenceCard label="Volume" value={divs.volumeDivergence} />
        </div>
        {(pats.candlestick || pats.squeeze) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {pats.candlestick && (
              <span className="text-white/40">
                Candlestick: <span className="font-semibold text-white/80">{pats.candlestick.replace(/_/g, " ")}</span>
              </span>
            )}
            {pats.squeeze && (
              <span className="text-white/40">
                Squeeze: <span className="font-semibold" style={{ color: AMBER }}>{pats.squeeze.replace(/_/g, " ")}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* HTF confirmation */}
      <div id="sec-htf">
        <SectionTitle
          icon={Layers}
          right={
            <span className="ml-auto inline-flex items-center gap-2 text-[11px] text-white/45">
              <span className="size-2 rounded-full" style={{ backgroundColor: htfAligned ? dirColor(trends[0]) : GRAY }} />
              {htfAligned ? `Higher timeframes aligned, all ${trends[0]}` : "Higher timeframes disagree"}
            </span>
          }
        >
          Higher timeframe confirmation
        </SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <HtfCard label="1H" trend={htf.trend1h} rsi={htf.rsi1h} />
          <HtfCard label="4H" trend={htf.trend4h} rsi={htf.rsi4h} />
          {htf.trendDaily != null && htf.rsiDaily != null && <HtfCard label="Daily" trend={htf.trendDaily} rsi={htf.rsiDaily} />}
        </div>
      </div>

      {/* Which timeframes agree */}
      {tfo && (
        <div id="sec-tf-alignment">
          <SectionTitle
            icon={Layers}
            right={
              <span className="ml-auto inline-flex items-center gap-2 text-[11px]">
                <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-white/[0.06] text-white/75">{tfo.alignment.tradeType}</span>
                {tfo.alignment.direction !== "NEUTRAL" && (
                  <span className="font-bold" style={{ color: dirColor(tfo.alignment.direction) }}>{dirLabel(tfo.alignment.direction)}</span>
                )}
                <span className="font-mono text-white/40">{tfo.alignment.alignedCount}/{tfo.alignment.totalCount} agree</span>
              </span>
            }
          >
            Which timeframes agree
          </SectionTitle>
          <p className="text-sm text-white/55 mb-3">{tfo.alignment.description}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([tfo.short, tfo.medium, tfo.long] as const).map((h) => (
              <div key={h.label} className={cn(SURFACE, "p-4")}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">{h.label}</span>
                  <span className="rounded px-2 py-0.5 text-xs font-bold uppercase" style={{ backgroundColor: `${dirColor(h.consensus)}15`, color: dirColor(h.consensus) }}>
                    {h.consensus === "NEUTRAL" ? "Neutral" : dirLabel(h.consensus)}
                  </span>
                </div>
                <div className="space-y-2">
                  {h.biases.map((tf) => (
                    <div key={tf.timeframe} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-white/40 w-8">{tf.timeframe}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${tf.confidence}%`, backgroundColor: dirColor(tf.bias) }} />
                      </div>
                      <span className="text-[10px] font-bold uppercase w-14 text-right" style={{ color: dirColor(tf.bias) }}>{tf.bias === "NEUTRAL" ? "Neutral" : dirLabel(tf.bias)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-1">
                  {h.biases.map((tf) => (
                    <div key={`${tf.timeframe}-detail`} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-[#9CA3AF]/80 font-mono w-8">{tf.timeframe}</span>
                      <span className="text-white/40 truncate">{tf.emaAlignment}</span>
                      <span className="text-white/40 truncate">{tf.momentum}</span>
                      <span className="font-mono text-white/50">RSI {tf.rsi}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
