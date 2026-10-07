"use client"

import React from "react"
import { Activity, AlertTriangle, ArrowUpRight, BarChart3, Eye, GitBranch, Hash, Layers, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SignalsResponse } from "../types"
import { AMBER, GRAY, GREEN, RED, SectionTitle, StatCard, dirColor, fmt, fmtCompact, priceDp } from "../shared"
import { LiquidationsPanel, OrderBookPanel } from "../OrderFlowPanels"

export function FlowTab({ d }: { d: SignalsResponse }) {
  const vol = d.volume
  const m = d.market
  const pos = d.positioning
  const liq = m.liquidations
  const book = d.orderBook ?? null
  const price = d.price.mark
  const dp = price > 0 ? priceDp(price) : 2
  const spikeNotable = vol.spikeLabel && !["NORMAL", "no data", "ELEVATED", "DRY"].includes(vol.spikeLabel)
  const abs = vol.absorption

  return (
    <div className="space-y-6">
      {/* Volume */}
      <div id="sec-volume">
        <SectionTitle icon={BarChart3}>Volume</SectionTitle>
        {spikeNotable && (
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.12] bg-white/[0.03] px-4 py-3 mb-3">
            <BarChart3 className="size-5 shrink-0 text-white/70" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white/85">{vol.spikeLabel}</span>
                <span className="font-mono text-sm font-bold text-white">{vol.spikeRatio.toFixed(1)}x</span>
                <span className="text-[10px] text-white/40">vs 20 EMA</span>
              </div>
              <p className="text-[11px] text-white/40 mt-0.5">Volume well above its 20-period average: a real move, not a drift.</p>
            </div>
          </div>
        )}
        {abs?.detected && (
          <div className="flex items-center gap-3 rounded-xl border px-4 py-3 mb-3" style={{ borderColor: `${dirColor(abs.direction)}40`, backgroundColor: `${dirColor(abs.direction)}08` }}>
            <AlertTriangle className="size-5 shrink-0" style={{ color: dirColor(abs.direction) }} />
            <div>
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: dirColor(abs.direction) }}>
                {abs.direction === "bullish" ? "Bullish" : abs.direction === "bearish" ? "Bearish" : "Neutral"} absorption
              </span>
              <p className="text-[11px] text-white/50 mt-0.5">
                Volume spiked {abs.strength.toFixed(1)}x but price barely moved.
                {abs.direction === "bullish" ? " Buyers are absorbing sell orders; expect an upward reversal." : abs.direction === "bearish" ? " Sellers are absorbing buy orders; expect a downward reversal." : " Neither side is winning; expect a big move."}
              </p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Current volume" value={fmtCompact(vol.current)} sub={vol.trend} icon={BarChart3} />
          <StatCard label="20 EMA volume" value={fmtCompact(vol.ema20)} sub="Baseline" icon={Activity} />
          <StatCard label="Spike ratio" value={`${vol.spikeRatio.toFixed(1)}x`} sub={vol.spikeLabel} color={vol.spikeLabel === "DRY" ? GRAY : undefined} icon={Zap} />
          <StatCard label="Volume ratio" value={fmt(vol.ratio, 2)} sub={vol.ratio > 1.5 ? "High volume" : vol.ratio < 0.5 ? "Low volume" : "Normal"} icon={Layers} />
          <StatCard label="CVD" value={fmtCompact(vol.cvd)} sub={vol.cvd > 0 ? "Buyers dominate" : "Sellers dominate"} color={vol.cvd > 0 ? GREEN : RED} icon={GitBranch} />
        </div>
      </div>

      {/* Positioning & liquidation */}
      {pos && (
        <div id="sec-positioning">
          <SectionTitle
            icon={Activity}
            right={
              pos.squeezeRisk && (
                <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase" style={{ backgroundColor: `${AMBER}15`, color: AMBER }} title="Crowded positioning that could unwind violently">
                  {pos.squeezeRisk.replace(/_/g, " ")}
                </span>
              )
            }
          >
            Positioning &amp; liquidation
          </SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {pos.longShortRatio != null && (
              <StatCard label="Long/short ratio" value={fmt(pos.longShortRatio, 2)} sub={pos.longShortRatio > 1.5 ? "Longs crowded" : pos.longShortRatio < 0.7 ? "Shorts crowded" : "Balanced"} color={pos.longShortRatio > 1.5 ? RED : pos.longShortRatio < 0.7 ? GREEN : undefined} icon={BarChart3} />
            )}
            {pos.longShortChange != null && (
              <StatCard label="L/S change" value={`${pos.longShortChange >= 0 ? "+" : ""}${pos.longShortChange.toFixed(1)}%`} sub={pos.longShortChange > 20 ? "Longs surging" : pos.longShortChange < -20 ? "Shorts surging" : "Stable"} color={Math.abs(pos.longShortChange) > 20 ? AMBER : undefined} icon={GitBranch} />
            )}
            {pos.topTraderLongRatio != null && (
              <StatCard label="Top traders" value={`${(pos.topTraderLongRatio * 100).toFixed(0)}% long`} sub={pos.topTraderLongRatio > 0.65 ? "Smart money bullish" : pos.topTraderLongRatio < 0.35 ? "Smart money bearish" : "Neutral"} color={pos.topTraderLongRatio > 0.65 ? GREEN : pos.topTraderLongRatio < 0.35 ? RED : undefined} icon={Eye} />
            )}
            {pos.openInterestChange != null && (
              <StatCard label="OI change" value={`${pos.openInterestChange >= 0 ? "+" : ""}${pos.openInterestChange.toFixed(1)}%`} sub={pos.openInterestChange > 15 ? "New money entering" : pos.openInterestChange < -15 ? "Positions unwinding" : "Stable"} color={Math.abs(pos.openInterestChange) > 15 ? (pos.openInterestChange > 0 ? GREEN : RED) : undefined} icon={BarChart3} hint="Change in open interest over 24h. Rising with price means new longs; falling means positions closing." />
            )}
            {pos.takerBuySellRatio != null && (
              <StatCard label="Taker buy/sell" value={pos.takerBuySellRatio.toFixed(2)} sub={pos.takerBuySellRatio > 1.3 ? "Aggressive buying" : pos.takerBuySellRatio < 0.7 ? "Aggressive selling" : "Balanced"} color={pos.takerBuySellRatio > 1.3 ? GREEN : pos.takerBuySellRatio < 0.7 ? RED : undefined} icon={Activity} />
            )}
          </div>
        </div>
      )}

      {/* Order flow: realized liquidations and resting walls, each with a plain-English read */}
      {liq && <LiquidationsPanel liq={liq} dp={dp} price={price} />}
      {book && <OrderBookPanel book={book} dp={dp} price={price} call={d.call} />}

      {/* Market data */}
      <div id="sec-market-data">
        <SectionTitle icon={Hash}>Market data</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {m.fearGreed && <StatCard label="Fear & Greed" value={String(m.fearGreed.value)} sub={m.fearGreed.classification} color={m.fearGreed.value >= 60 ? GREEN : m.fearGreed.value <= 40 ? RED : undefined} icon={Eye} />}
          {m.fundingRate != null && (
            <StatCard label="Funding rate" value={`${(m.fundingRate * 100).toFixed(4)}%`} sub={m.fundingRate < 0 ? "Shorts paying longs" : m.fundingRate > 0.01 ? "Overleveraged longs" : "Neutral"} color={m.fundingRate < 0 ? GREEN : m.fundingRate > 0.01 ? RED : undefined} icon={Activity} />
          )}
          {m.openInterest != null && <StatCard label="Open interest" value={`$${fmtCompact(m.openInterest)}`} icon={BarChart3} />}
          {m.putCallRatio != null && (
            <StatCard label="Put/call ratio" value={fmt(m.putCallRatio, 2)} sub={m.putCallRatio > 1 ? "Bearish sentiment" : m.putCallRatio < 0.7 ? "Bullish sentiment" : "Neutral"} color={m.putCallRatio > 1 ? RED : m.putCallRatio < 0.7 ? GREEN : undefined} icon={Layers} />
          )}
          {m.btcDominance != null && <StatCard label="BTC dominance" value={`${m.btcDominance.toFixed(1)}%`} icon={Hash} />}
          {m.hashRate != null && <StatCard label="Hashrate" value={`${(m.hashRate / 1e9).toFixed(0)} EH/s`} icon={Zap} />}
          {m.etfFlow && <StatCard label="ETF net flow" value={`$${fmtCompact(m.etfFlow.net)}`} sub={m.etfFlow.description} color={m.etfFlow.net > 0 ? GREEN : RED} icon={ArrowUpRight} />}
          {m.deribitFunding8h != null && <StatCard label="Deribit funding 8h" value={`${(m.deribitFunding8h * 100).toFixed(4)}%`} color={m.deribitFunding8h < 0 ? GREEN : m.deribitFunding8h > 0.01 ? RED : undefined} icon={Activity} hint="Funding on Deribit perpetuals, 8-hour rate. Cross-venue check on the main funding figure." />}
        </div>
        <div className={cn("mt-2 text-[10px] text-white/30")}>Values update with every 30s scan.</div>
      </div>
    </div>
  )
}
