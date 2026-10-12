"use client"

import React from "react"
import { Activity, BarChart, BarChart3, Gauge, Layers, Target, TrendingUp, Waves, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RegimeInfo, RegimeTF, RegimeTFInfo, SignalsResponse } from "../types"
import { AMBER, Chip, DivergenceCard, GRAY, GREEN, MUTED, RED, SURFACE, SectionTitle, StatCard, dirColor, dirLabel, fmt, fmtPrice } from "../shared"
import { TF_ORDER, cloudColor, cloudLabel, isWeakStrength, ma200Color, ma200Label, regimeLabelColor, slopeGlyph, strengthSuffix, tfTooltip } from "../RegimeStrip"

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

function KV({ k, v, color, mono = true, className }: { k: string; v: React.ReactNode; color?: string; mono?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-2 text-[10px]", className)}>
      <span className="text-white/40 shrink-0">{k}</span>
      <span className={cn("text-right truncate", mono && "font-mono tabular-nums")} style={{ color: color ?? "rgba(255,255,255,0.8)" }}>{v}</span>
    </div>
  )
}

const TF_LABEL: Record<RegimeTF, string> = { "15m": "15m entry", "4h": "4H", "1d": "Daily" }

// Caption when the direction channel and the strength channel disagree. Rendered in AMBER.
function regimeCaption(t: RegimeTFInfo): string | null {
  const bullSide = t.cloud === "above" && t.ma200Side === "above"
  const bearSide = t.cloud === "below" && t.ma200Side === "below"
  const adx = fmt(t.adx, 0)
  if (bullSide && isWeakStrength(t.trendStrength)) return `Above the cloud and 200MA, but ADX ${adx}: range, no breakout yet. Wait for ADX > 20 and +DI > -DI.`
  if (bearSide && isWeakStrength(t.trendStrength)) return `Below the cloud and 200MA, but ADX ${adx}: range, no breakdown yet. Wait for ADX > 20 and -DI > +DI.`
  if ((t.trendStrength === "strong" || t.trendStrength === "extreme") && t.cloud === "above" && t.diBias === "bearish") return "Strong pullback inside a bull regime: -DI is leading, +DI has not retaken it."
  if ((t.trendStrength === "strong" || t.trendStrength === "extreme") && t.cloud === "below" && t.diBias === "bullish") return "Strong bounce inside a bear regime: +DI is leading, -DI has not retaken it."
  return null
}

function RegimeCard({ tf, t }: { tf: RegimeTF; t: RegimeTFInfo }) {
  const sc = t.score > 12 ? GREEN : t.score < -12 ? RED : GRAY
  const weak = isWeakStrength(t.trendStrength)
  const diMax = Math.max(t.plusDI, t.minusDI, 40)
  const caption = regimeCaption(t)
  const freshTk = t.tkCross !== "none" && t.tkCrossBarsAgo >= 0
  const tk = freshTk ? `${t.tkCross} ${t.tkCrossBarsAgo}b ago` : `${t.tkState} (state)`
  const tkColor = freshTk ? dirColor(t.tkCross) : dirColor(t.tkState)
  const maV = t.ma200Side
    ? `${ma200Label(t.ma200Side)}${t.ma200DistAtr != null ? ` · ${fmt(Math.abs(t.ma200DistAtr), 1)} ATR` : ""}${t.ma200Slope ? ` ${slopeGlyph(t.ma200Slope)}` : ""}${t.ma200DistAtr != null && Math.abs(t.ma200DistAtr) > 3 ? " · stretched" : ""}`
    : "—"
  const maPrices = t.sma200 != null || t.ema200 != null ? `${t.sma200 != null ? `$${fmtPrice(t.sma200)}` : "—"} / ${t.ema200 != null ? `$${fmtPrice(t.ema200)}` : "—"}` : "insufficient bars"
  return (
    <div className={cn(SURFACE, "p-4")} title={tfTooltip(tf, t)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-white/50 uppercase">{TF_LABEL[tf]}</span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold" style={{ backgroundColor: `${sc}15`, color: sc }}>{t.score > 0 ? "+" : ""}{t.score}</span>
      </div>
      {/* Direction channel: colour */}
      <div className={cn("space-y-1.5", weak && "opacity-55")}>
        <KV k="Cloud" v={cloudLabel(t.cloud)} color={cloudColor(t.cloud)} mono={false} />
        <KV k="Cloud colour" v={<>{t.cloudColor}{t.cloudThin && <span className="ml-1 text-white/40">· thin</span>}</>} color={dirColor(t.cloudColor)} mono={false} />
        <KV k="TK cross" v={tk} color={tkColor} mono={false} />
        <KV k="Kumo twist" v={t.kumoTwist === "none" ? "none" : `${t.kumoTwist} ahead`} color={t.kumoTwist === "none" ? MUTED : dirColor(t.kumoTwist)} mono={false} className="hidden sm:flex" />
        <KV k="Chikou" v={`${t.chikou} price`} color={t.chikou === "above" ? GREEN : t.chikou === "below" ? RED : MUTED} mono={false} className="hidden sm:flex" />
        <KV k="Kijun" v={`$${fmtPrice(t.kijun)}`} />
        <KV k="Cloud top / bottom" v={`$${fmtPrice(t.cloudTop)} / $${fmtPrice(t.cloudBottom)}`} />
        <KV k="SMA200 / EMA200" v={maPrices} color={t.sma200 == null && t.ema200 == null ? MUTED : undefined} />
        <KV k="200MA" v={maV} color={t.ma200Side ? ma200Color(t.ma200Side) : MUTED} />
        {t.freshCross && <KV k="Fresh cross" v={`${t.freshCross}${t.barsSinceCross != null ? ` ${t.barsSinceCross}b ago` : ""}`} color={dirColor(t.freshCross)} mono={false} />}
        {t.goldenCross && <KV k="50 / 200" v={t.goldenCross === "golden" ? "Golden cross" : "Death cross"} color={t.goldenCross === "golden" ? GREEN : RED} mono={false} />}
      </div>
      {/* Strength channel: opacity + word, never colour */}
      <div className="mt-3 pt-3 border-t border-white/[0.04]">
        <div className="flex items-center justify-between text-[10px] mb-1.5">
          <span className="text-white/40">ADX</span>
          <span className="font-mono tabular-nums text-white/80">
            {fmt(t.adx, 1)} {slopeGlyph(t.adxSlope)} <span className="text-white/45 font-sans">· {t.trendStrength}</span>
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-7 font-mono text-[9px] text-white/40">+DI</span>
            <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (t.plusDI / diMax) * 100)}%`, backgroundColor: GREEN, opacity: t.diBias === "bullish" ? 1 : 0.5 }} />
            </div>
            <span className="w-8 text-right font-mono text-[9px] tabular-nums text-white/60">{fmt(t.plusDI, 0)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-7 font-mono text-[9px] text-white/40">-DI</span>
            <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (t.minusDI / diMax) * 100)}%`, backgroundColor: RED, opacity: t.diBias === "bearish" ? 1 : 0.5 }} />
            </div>
            <span className="w-8 text-right font-mono text-[9px] tabular-nums text-white/60">{fmt(t.minusDI, 0)}</span>
          </div>
        </div>
        <div className="hidden sm:flex mt-1.5 items-center justify-between text-[10px]">
          <span className="text-white/40">ADX slope</span>
          <span className="text-white/60">{t.adxSlope}</span>
        </div>
        {caption && <p className="mt-2 text-[11px] leading-snug" style={{ color: AMBER }}>{caption}</p>}
      </div>
    </div>
  )
}

function RegimeSection({ regime }: { regime: RegimeInfo | null | undefined }) {
  const label = regime?.label ?? null
  const lc = regimeLabelColor(label)
  const tfs = regime ? TF_ORDER.filter((tf) => regime.perTF[tf]) : []
  const dim = !!regime && isWeakStrength(regime.trendStrength) && (label === "Bull regime" || label === "Bear regime")
  return (
    <div id="sec-regime">
      <SectionTitle
        icon={Layers}
        right={
          regime ? (
            <span className="ml-auto inline-flex items-center gap-2">
              <Chip color={lc} className={cn(dim && "opacity-55")}>
                {regime.label} <span className="font-medium normal-case tracking-normal opacity-80">· {strengthSuffix(regime.trendStrength)}</span>
              </Chip>
              {regime.gate === "counter_trend" && <Chip color={AMBER}>counter-trend</Chip>}
              <span className="font-mono text-xs tabular-nums" style={{ color: lc }}>{regime.score > 0 ? "+" : ""}{regime.score}</span>
            </span>
          ) : undefined
        }
      >
        Cloud, 200MA &amp; ADX regime
      </SectionTitle>
      {!regime ? (
        <p className="text-xs" style={{ color: GRAY }}>Regime data not available for this response.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {tfs.map((tf) => (
              <RegimeCard key={tf} tf={tf} t={regime.perTF[tf]!} />
            ))}
          </div>
          {regime.notes.length > 0 && (
            <ul className="mt-3 space-y-1">
              {regime.notes.slice(0, 4).map((n, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-white/45 leading-snug">
                  <span className="mt-[6px] size-1 shrink-0 rounded-full bg-white/30" />
                  {n}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
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
      {/* Cloud / 200MA / ADX regime */}
      <RegimeSection regime={d.regime} />

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
