"use client"

import React, { useCallback, useState } from "react"
import { Activity, AlertTriangle, ArrowDown, ArrowUp, Check, ChevronRight, Clock, Copy, Crosshair, Eye, Gauge, GitBranch, Minus, Waves, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MarketMapResponse, SignalsResponse } from "../types"
import { AMBER, BRAND, Chip, FOCUS_RING, FactorRow, GREEN, LABEL, RED, SURFACE, SectionTitle, Tip, fmtPrice, signed } from "../shared"

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [value])
  return (
    <button type="button" onClick={copy} aria-label={`Copy ${value}`} className={cn("ml-2 inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-white/50 hover:bg-white/10 hover:text-white/80 transition-colors", FOCUS_RING)}>
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

const KV = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-xs text-white/50">{k}</span>
    {children}
  </div>
)

const CardTitle = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-3 gap-2">
    <span className={cn(LABEL, "font-bold")}>{children}</span>
    {right}
  </div>
)

// Market map: six daily-structure modules. Direction is green/red; magnitudes and probabilities are white.
function MarketMap({ map, accent }: { map: MarketMapResponse; accent: string }) {
  const m5 = map.ema5Disconnect
  const mx = map.ema5xSma200
  const rs = map.rsiStructure.daily
  const eb = map.ema21Bounce
  const ra = map.rsiAlignment
  const bp = map.bounceProbabilities
  return (
    <div id="sec-market-map">
      <SectionTitle icon={Activity} right={<span className="text-[11px] text-white/50">Daily structure analysis</span>}>
        Market Map
      </SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {m5 && (
          <div className={cn(SURFACE, "p-4")}>
            <CardTitle right={m5.isDisconnected && <Chip variant="direction" value={m5.signal?.direction === "long" ? "long" : "short"}>{m5.signal?.direction === "long" ? "Mean revert long" : "Mean revert short"}</Chip>}>EMA5 Disconnect</CardTitle>
            <div className="space-y-2">
              <KV k="Deviation">
                <span className="font-mono text-sm font-bold tabular-nums" style={{ color: Math.abs(m5.deviationATR) >= 1.5 ? (m5.side === "below" ? GREEN : RED) : "rgba(255,255,255,0.85)" }}>
                  {signed(m5.deviation, 2)}% <span className="text-white/50 text-[11px] ml-1">({Math.abs(m5.deviationATR).toFixed(1)} ATR)</span>
                </span>
              </KV>
              <KV k="EMA5"><span className="font-mono text-xs text-white/70">${fmtPrice(m5.ema5)}</span></KV>
              <KV k="Days since reconnect"><span className="font-mono text-xs text-white/70">{m5.daysSinceReconnect}</span></KV>
              {m5.reconnectWindow.total > 0 && (
                <div className="mt-2 pt-2 border-t border-white/[0.04]">
                  <span className={LABEL}>Reconnect probability</span>
                  <div className="flex gap-3 mt-1 items-end">
                    {[
                      { label: "3d", pct: m5.reconnectWindow.pct3day },
                      { label: "5d", pct: m5.reconnectWindow.pct5day },
                      { label: "7d", pct: m5.reconnectWindow.pct7day },
                    ].map(({ label, pct }) => (
                      <div key={label} className="text-center">
                        <span className="font-mono text-sm font-bold tabular-nums" style={{ color: `rgba(255,255,255,${0.45 + (pct / 100) * 0.5})` }}>{pct}%</span>
                        <span className="block text-[11px] text-white/50">{label}</span>
                      </div>
                    ))}
                    <span className="text-[11px] text-white/50">n={m5.reconnectWindow.total}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {mx && (
          <div className={cn(SURFACE, "p-4")}>
            <CardTitle right={mx.freshCross && <Chip variant="direction" value={mx.crossType ?? "neutral"}>Fresh {mx.crossType} cross</Chip>}>EMA5 × SMA{mx.smaPeriod}</CardTitle>
            <div className="space-y-2">
              <KV k="Position"><span className="text-xs font-bold" style={{ color: mx.isAbove ? GREEN : RED }}>EMA5 {mx.isAbove ? "Above" : "Below"} SMA{mx.smaPeriod}</span></KV>
              <KV k="Last cross"><span className="font-mono text-xs text-white/70">{mx.crossType ? `${mx.crossType} ${mx.daysSinceCross}d ago` : "None found"}</span></KV>
              <KV k="EMA5 slope"><span className="font-mono text-xs tabular-nums" style={{ color: mx.ema5Slope > 0 ? GREEN : RED }}>{signed(mx.ema5Slope, 3)}%</span></KV>
              <KV k="Total crosses"><span className="font-mono text-xs text-white/70">{mx.totalCrossovers}</span></KV>
              {mx.recentCrossovers.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/[0.04]">
                  <span className={LABEL}>Recent cross returns</span>
                  <div className="space-y-1 mt-1">
                    {mx.recentCrossovers.slice(-3).map((cross, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <Chip variant="direction" value={cross.type}>{cross.type === "bullish" ? "Bull" : "Bear"}</Chip>
                        {cross.fwdReturn5 != null && <span className="font-mono tabular-nums" style={{ color: cross.fwdReturn5 > 0 ? GREEN : RED }}>5d: {signed(cross.fwdReturn5, 1)}%</span>}
                        {cross.fwdReturn10 != null && <span className="font-mono tabular-nums" style={{ color: cross.fwdReturn10 > 0 ? GREEN : RED }}>10d: {signed(cross.fwdReturn10, 1)}%</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {rs && (
          <div className={cn(SURFACE, "p-4")}>
            <CardTitle right={<Chip variant="direction" value={rs.rsiTrend}>{rs.rsiTrend}</Chip>}>RSI Structure</CardTitle>
            <div className="space-y-2">
              <KV k="Daily RSI"><span className="font-mono text-lg font-bold tabular-nums" style={{ color: rs.currentRSI < 30 ? GREEN : rs.currentRSI > 70 ? RED : "rgba(255,255,255,0.85)" }}>{rs.currentRSI.toFixed(1)}</span></KV>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center rounded-lg bg-white/[0.02] p-2">
                  <span className="text-[11px] text-white/50">HH / HL</span>
                  <p className="font-mono text-xs font-bold tabular-nums" style={{ color: GREEN }}>{rs.consecutiveHH} / {rs.consecutiveHL}</p>
                </div>
                <div className="text-center rounded-lg bg-white/[0.02] p-2">
                  <span className="text-[11px] text-white/50">LH / LL</span>
                  <p className="font-mono text-xs font-bold tabular-nums" style={{ color: RED }}>{rs.consecutiveLH} / {rs.consecutiveLL}</p>
                </div>
              </div>
              {rs.pullbacksHoldAbove50 && <div className="flex items-center gap-1.5 text-[11px]" style={{ color: GREEN }}><Check className="size-3" />Pullbacks hold above 50</div>}
              {rs.ralliesFailBelow50 && <div className="flex items-center gap-1.5 text-[11px]" style={{ color: RED }}><AlertTriangle className="size-3" />Rallies failing below 50</div>}
              {rs.trendline?.breakDetected && (
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: rs.trendline.breakType === "resistance_break" ? GREEN : RED }}>
                  <Zap className="size-3" />RSI {rs.trendline.breakType === "resistance_break" ? "resistance" : "support"} break
                </div>
              )}
              {rs.divergence.type && (
                <div className="mt-1 pt-1 border-t border-white/[0.04]">
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: rs.divergence.type === "bullish" ? GREEN : RED }}><GitBranch className="size-3" />{rs.divergence.description}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {eb && (
          <div className={cn(SURFACE, "p-4")}>
            <CardTitle
              right={
                eb.invalidation ? (
                  <Chip variant="warning">{eb.invalidationType === "bullish_invalidated" ? "Bull invalid" : "Bear invalid"}</Chip>
                ) : eb.recentBounce ? (
                  <Chip variant="direction" value={eb.bounceType === "support_bounce" ? "bullish" : "bearish"}>{eb.bounceType === "support_bounce" ? "Support hold" : "Resist hold"}</Chip>
                ) : null
              }
            >
              EMA21 Bounce
            </CardTitle>
            <div className="space-y-2">
              <KV k="Distance">
                <span className="font-mono text-sm font-bold tabular-nums" style={{ color: eb.isAbove ? GREEN : RED }}>
                  {signed(eb.distancePct, 2)}% <span className="text-white/50 text-[11px] ml-1">({Math.abs(eb.distanceATR).toFixed(1)} ATR)</span>
                </span>
              </KV>
              <KV k="EMA21"><span className="font-mono text-xs text-white/70">${fmtPrice(eb.ema21)}</span></KV>
              <KV k="Slope"><span className="text-xs" style={{ color: eb.slopeRising ? GREEN : RED }}>{eb.slopeRising ? "Rising" : "Falling"}</span></KV>
              {eb.bounceSuccessRate != null && (
                <KV k="Bounce success rate">
                  <span className="font-mono text-xs tabular-nums text-white/85">
                    {eb.bounceSuccessRate}% <span className="text-white/50 ml-1">n={eb.bounceSampleSize}</span>
                  </span>
                </KV>
              )}
            </div>
          </div>
        )}

        {ra && (
          <div className={cn(SURFACE, "p-4")}>
            <CardTitle right={<Chip variant="direction" value={ra.aligned ? ra.direction ?? "neutral" : "neutral"}>{ra.aligned ? `Aligned ${ra.direction}` : "Divergent"}</Chip>}>RSI Alignment</CardTitle>
            <div className="space-y-2">
              {(["rsi1h", "rsi4h", "rsi1d"] as const).map((key) => {
                const label = key === "rsi1h" ? "1H" : key === "rsi4h" ? "4H" : "Daily"
                const val = ra.details[key]
                if (val == null) return null
                const c = val > 50 ? GREEN : val < 50 ? RED : accent
                return (
                  <KV key={key} k={`${label} RSI`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold tabular-nums" style={{ color: c }}>{val.toFixed(1)}</span>
                      <div className="w-12 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${val}%`, backgroundColor: c, opacity: 0.85 }} />
                      </div>
                    </div>
                  </KV>
                )
              })}
              {ra.details.conflict && <div className="flex items-center gap-1.5 text-[11px]" style={{ color: AMBER }}><AlertTriangle className="size-3" />{ra.details.conflict}</div>}
            </div>
          </div>
        )}

        {bp && (
          <div className={cn(SURFACE, "p-4")}>
            <CardTitle right={<Chip variant="neutral">RSI {bp.rsiZone}</Chip>}>Forward Returns</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-white/50 border-b border-white/[0.04]">
                    <th className="text-left py-1 font-medium">Window</th>
                    <th className="text-right py-1 font-medium">Win %</th>
                    <th className="text-right py-1 font-medium">Avg</th>
                    <th className="text-right py-1 font-medium">Median</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(bp.windows).map(([window, data]) => {
                    const w = data.conditioned ?? data.all
                    if (!w) return null
                    return (
                      <tr key={window} className="border-b border-white/[0.02]">
                        <td className="py-1.5 text-white/60 font-mono">{window}</td>
                        <td className="py-1.5 text-right font-mono font-bold tabular-nums text-white/85">{w.positivePct}%</td>
                        <td className="py-1.5 text-right font-mono tabular-nums" style={{ color: w.avgReturn > 0 ? GREEN : RED }}>{signed(w.avgReturn, 2)}%</td>
                        <td className="py-1.5 text-right font-mono tabular-nums" style={{ color: w.medianReturn > 0 ? GREEN : RED }}>{signed(w.medianReturn, 2)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex gap-3 text-[11px] text-white/50">
              <span>EMA5: {bp.ema5Side}</span>
              {bp.sma200Side && <span>SMA200: {bp.sma200Side}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Early setups: approaching levels, retest tracker, structure signals, confluence meter, order-flow alerts, projections.
// Tier and status are urgency words (luminance and the brand accent), never red.
function SetupScanner({ a, dp }: { a: NonNullable<SignalsResponse["anticipatory"]>; dp: number }) {
  const ready = a.overallReadiness === "SETUP_READY"
  const forming = a.overallReadiness === "SETUP_FORMING"
  const tierLook = (tier: "IMMINENT" | "APPROACHING" | "WATCHLIST") => (tier === "IMMINENT" ? { color: BRAND, bg: "rgba(255,255,255,0.06)" } : tier === "APPROACHING" ? { color: "rgba(255,255,255,0.85)", bg: "rgba(255,255,255,0.06)" } : { color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.04)" })
  return (
    <details className="group" id="sec-setups">
      <summary className={cn("cursor-pointer list-none flex items-center gap-2 rounded-sm text-[13px] font-semibold text-white/60 uppercase tracking-[0.06em] py-2 hover:text-white/80 transition-colors", FOCUS_RING)}>
        <Eye className="size-4" />
        Early setups forming
        <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-4 mt-2">
        <div className={cn("rounded-xl border p-4 flex items-center gap-4", ready ? "border-white/[0.18] bg-white/[0.03]" : "border-white/[0.06] bg-white/[0.02]")} style={ready ? { borderColor: `color-mix(in srgb, ${BRAND} 40%, transparent)` } : undefined}>
          <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: ready ? BRAND : forming ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)" }} />
          <span className="text-sm font-bold uppercase tracking-wider" style={{ color: ready ? BRAND : forming ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)" }}>
            {ready ? "Setup ready" : forming ? "Setup forming" : "No active setup"}
          </span>
          {a.overallReadiness !== "NO_SETUP" && <span className="font-mono text-xs text-white/50">{a.actionableIn}</span>}
        </div>

        {a.approachingLevels.length > 0 && (
          <div className={cn(SURFACE, "overflow-hidden")}>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04]">
              <Crosshair className="size-4 text-white/50" />
              <span className={cn(LABEL, "font-semibold")}>Approaching levels</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {[...a.approachingLevels]
                .sort((x, y) => {
                  const tierOrder = { IMMINENT: 0, APPROACHING: 1, WATCHLIST: 2 }
                  return (tierOrder[x.tier] ?? 3) - (tierOrder[y.tier] ?? 3) || x.distance - y.distance
                })
                .map((lvl, i) => {
                  const look = tierLook(lvl.tier)
                  return (
                    <div key={i} className="flex items-center justify-between px-4 py-2 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ color: look.color, backgroundColor: look.bg }}>{lvl.tier}</span>
                        <Chip variant="kind">{lvl.type.replace("_", " ")}{lvl.fibLevel ? ` ${lvl.fibLevel}` : ""}</Chip>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm font-semibold tabular-nums text-white/85">{lvl.level.toFixed(dp)}</span>
                          <CopyBtn value={lvl.level.toFixed(dp)} />
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs">
                        <span className="font-mono tabular-nums text-white/50">{lvl.distance.toFixed(2)} ATR</span>
                        <span className={Math.abs(lvl.velocity) > 0.5 ? "text-white/85" : "text-white/50"}>{lvl.velocity > 0 ? <ArrowUp className="size-3 inline" /> : <ArrowDown className="size-3 inline" />}</span>
                        {lvl.estimatedCandles != null && <span className="font-mono text-[11px] tabular-nums text-white/50">~{lvl.estimatedCandles}c</span>}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {a.retestSetup.active && a.retestSetup.state && (
          <div className={cn(SURFACE, "p-4")}>
            <div className="flex items-center gap-2 mb-4">
              <GitBranch className="size-4 text-white/50" />
              <span className={cn(LABEL, "font-semibold")}>Retest tracker</span>
              {a.retestSetup.direction && <Chip variant="direction" value={a.retestSetup.direction}>{a.retestSetup.direction}</Chip>}
            </div>
            <div className="flex items-center gap-2 mb-4">
              {(["BREAKOUT_DETECTED", "PULLBACK_IN_PROGRESS", "RETEST_ZONE"] as const).map((step, i) => {
                const stepLabels = { BREAKOUT_DETECTED: "Breakout", PULLBACK_IN_PROGRESS: "Pullback", RETEST_ZONE: "Retest zone" }
                const stepOrder = { BREAKOUT_DETECTED: 0, PULLBACK_IN_PROGRESS: 1, RETEST_ZONE: 2 }
                const cur = a.retestSetup.state ? stepOrder[a.retestSetup.state] : -1
                const isActive = a.retestSetup.state === step
                const isPast = stepOrder[step] < cur
                return (
                  <React.Fragment key={step}>
                    {i > 0 && <div className={cn("h-px flex-1", isPast || isActive ? "bg-white/40" : "bg-white/10")} />}
                    <div className="flex flex-col items-center gap-1">
                      <span className="size-3 rounded-full border-2" style={isActive ? { borderColor: BRAND, backgroundColor: BRAND } : isPast ? { borderColor: "rgba(255,255,255,0.4)", backgroundColor: "rgba(255,255,255,0.2)" } : { borderColor: "rgba(255,255,255,0.2)" }} />
                      <span className={cn("text-[10px] uppercase tracking-wider whitespace-nowrap", isActive ? "font-bold text-white/90" : "text-white/50")}>{stepLabels[step]}</span>
                    </div>
                  </React.Fragment>
                )
              })}
            </div>
            <div className="flex items-center gap-4">
              {a.retestSetup.level != null && (
                <div className="flex items-center gap-1.5">
                  <span className={LABEL}>Level</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-white/85">{a.retestSetup.level.toFixed(dp)}</span>
                  <CopyBtn value={a.retestSetup.level.toFixed(dp)} />
                </div>
              )}
              <div className="flex items-center gap-2 ml-auto">
                {([
                  ["Vol", a.retestSetup.volumeConfirms],
                  ["RSI", a.retestSetup.rsiResetting],
                ] as const).map(([k, ok]) => (
                  <span key={k} className={cn("flex items-center gap-1 text-[11px] uppercase", ok ? "text-white/85" : "text-white/50")}>
                    {ok ? <Check className="size-3" style={{ color: GREEN }} /> : <Minus className="size-3" />}
                    {k}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {a.structureSignals.length > 0 && (
          <div className={cn(SURFACE, "p-4")}>
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="size-4 text-white/50" />
              <span className={cn(LABEL, "font-semibold")}>Structure signals</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {a.structureSignals.map((sig, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Chip variant="kind">{sig.type.replace("_", " ")}</Chip>
                    {sig.direction === "bullish" ? <ArrowUp className="size-3" style={{ color: GREEN }} /> : <ArrowDown className="size-3" style={{ color: RED }} />}
                  </div>
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span className="text-xs text-white/70">{sig.referenceLevel.toFixed(dp)}</span>
                    <span className="text-[11px] text-white/50">{sig.distanceToTrigger.toFixed(2)} ATR</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={cn(SURFACE, "p-4")}>
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="size-4 text-white/50" />
            <span className={cn(LABEL, "font-semibold")}>Confluence</span>
            <span className="ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ color: a.confluence.status === "SETUP_IMMINENT" ? BRAND : a.confluence.status === "SETUP_FORMING" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)", backgroundColor: "rgba(255,255,255,0.06)" }}>
              {a.confluence.status.replace("_", " ")}
            </span>
          </div>
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className={LABEL}>Score</span>
              <span className="font-mono text-sm font-bold tabular-nums text-white/90">{a.confluence.score}/100</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${a.confluence.score}%`, backgroundColor: a.confluence.score >= 70 ? BRAND : `rgba(255,255,255,${0.35 + a.confluence.score / 200})` }} />
            </div>
          </div>
          {a.confluence.convergingIndicators.length > 0 && (
            <div className="space-y-1.5">
              {a.confluence.convergingIndicators.map((ind, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-white/60 min-w-[100px] truncate">{ind.name}</span>
                  <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full bg-white/50" style={{ width: `${Math.min(ind.weight * 100, 100)}%` }} />
                  </div>
                  <span className="text-[11px] text-white/50 min-w-[80px] truncate text-right">{ind.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {(a.orderFlow.cvdDivergenceForming.detected || a.orderFlow.fundingInflection || a.orderFlow.absorptionSequence > 0 || a.orderFlow.oiPriceDivergence) && (
          <div className={cn(SURFACE, "p-4")}>
            <div className="flex items-center gap-2 mb-3">
              <Waves className="size-4 text-white/50" />
              <span className={cn(LABEL, "font-semibold")}>Order flow</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {a.orderFlow.cvdDivergenceForming.detected && <Chip variant="direction" value={a.orderFlow.cvdDivergenceForming.direction ?? "neutral"}>CVD div {a.orderFlow.cvdDivergenceForming.direction}</Chip>}
              {a.orderFlow.fundingInflection && <Chip variant="warning">Funding inflection</Chip>}
              {a.orderFlow.absorptionSequence > 0 && <Chip variant="neutral" tip="Consecutive candles with heavy volume and little progress.">Absorption x{a.orderFlow.absorptionSequence}</Chip>}
              {a.orderFlow.oiPriceDivergence && <Chip variant="neutral">OI: {a.orderFlow.oiPriceDivergence}</Chip>}
            </div>
          </div>
        )}

        {a.projections.length > 0 && (
          <div className={cn(SURFACE, "p-4")}>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="size-4 text-white/50" />
              <span className={cn(LABEL, "font-semibold")}>Projections</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[...a.projections]
                .sort((x, y) => x.estimatedCandles - y.estimatedCandles)
                .map((proj, i) => {
                  const c = proj.direction === "bullish" ? GREEN : RED
                  return (
                    <div key={i} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: `${c}33`, backgroundColor: `${c}08` }}>
                      <span className="text-xs font-semibold" style={{ color: c }}>{proj.trigger}</span>
                      <span className="font-mono text-[11px] tabular-nums text-white/50">~{proj.estimatedCandles}c</span>
                      {proj.direction === "bullish" ? <ArrowUp className="size-3" style={{ color: c }} /> : <ArrowDown className="size-3" style={{ color: c }} />}
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    </details>
  )
}

function OilForecast({ f, price }: { f: NonNullable<SignalsResponse["oilForecast"]>; price: number }) {
  return (
    <div id="sec-forecast">
      <SectionTitle icon={Crosshair} right={<span className="ml-auto font-mono text-[11px] tabular-nums text-white/50">horizon ~{f.horizonHours}h</span>}>
        Scenario Forecast
      </SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {f.scenarios.map((s, i) => {
          const c = s.direction === "LONG" ? GREEN : RED
          const tp = price ? ((s.target - price) / price) * 100 : 0
          const p = Math.round(s.probability * 100)
          return (
            <div key={i} className="rounded-xl border p-4" style={{ borderColor: `${c}30`, backgroundColor: `${c}08` }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <Chip variant="direction" value={s.direction}>{s.direction}</Chip>
                <span className="font-mono text-xs font-bold tabular-nums text-white/90">{p}%</span>
              </div>
              <div className="text-sm text-white/85 font-medium leading-snug mb-1">{s.name}</div>
              <div className="text-[11px] text-white/50 mb-3 leading-snug">If: {s.trigger}</div>
              <div className="h-1 rounded bg-white/[0.05] mb-3">
                <div className="h-1 rounded bg-white/50" style={{ width: `${p}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-white/50">Target</div>
                  <div className="font-mono tabular-nums text-white/85">
                    ${fmtPrice(s.target)} <span style={{ color: c }}>({signed(tp, 1)}%)</span>
                  </div>
                </div>
                <div>
                  <div className="text-white/50">Stop ref</div>
                  <div className="font-mono tabular-nums text-white/70">${fmtPrice(s.stopRef)}</div>
                </div>
                <div>
                  <div className="text-white/50">R:R</div>
                  <div className="font-mono tabular-nums text-white/85">{s.rr.toFixed(2)}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 text-[11px] text-white/50 leading-snug">{f.note}</div>
    </div>
  )
}

export interface ModelsTabProps {
  d: SignalsResponse
  mapData: MarketMapResponse | undefined
  dp: number
  accent: string
}

// Models tab body: factor confluence (signed bars), market map, early setups, scenario forecast. Memoized.
export const ModelsTab = React.memo(function ModelsTab({ d, mapData, dp, accent }: ModelsTabProps) {
  const call = d.call
  return (
    <div className="space-y-5">
      {call.signalFactors.length > 0 && (
        <div id="sec-confluence">
          <SectionTitle
            right={
              <Tip content="Each row is one factor group. The bar is the factor's read (left = bearish, right = bullish, length = strength); the number is its weight in the score.">
                <span className="text-[11px] text-white/50 underline decoration-dotted underline-offset-2">read · weight</span>
              </Tip>
            }
          >
            Signal Confluence
          </SectionTitle>
          <div className={cn(SURFACE, "px-4 py-2")}>
            {call.signalFactors.map((f, i) => (
              <FactorRow key={i} category={f.category} assessment={f.assessment} weight={f.weight} />
            ))}
          </div>
        </div>
      )}
      {mapData && <MarketMap map={mapData} accent={accent} />}
      {d.anticipatory && <SetupScanner a={d.anticipatory} dp={dp} />}
      {d.oilForecast && d.oilForecast.scenarios.length > 0 && <OilForecast f={d.oilForecast} price={d.price.mark} />}
    </div>
  )
})
