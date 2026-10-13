"use client"

import React from "react"
import { Activity, AlertTriangle, BarChart3, BookOpen, Eye, GitBranch, Hash, Layers, Waves, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SignalsResponse } from "../types"
import { AMBER, Chip, GRAY, GREEN, RED, SectionTitle, StatCard, dirColor, fmt, fmtCompact, priceDp, useNow } from "../shared"
import { LiquidationsPanel, OrderBookPanel } from "../OrderFlowPanels"
import { readFeatures, staleLabel } from "../flow/features-contract"
import { FeatureTile } from "../flow/FeatureTile"
import { CvdTile } from "../flow/CvdTile"
import { QuarterHourTile } from "../flow/QuarterHourTile"
import { OiChangeTiles, OiQuadrant } from "../flow/OiQuadrant"
import { FundingTile } from "../flow/FundingTile"
import { StablecoinTiles } from "../flow/StablecoinTiles"

const CRYPTO = new Set(["BTC", "ETH", "BNB", "ADA", "HYPE", "ZEC", "PUMP", "NIGHT", "XRP", "SOL", "NEAR", "CRCL", "MINIMAX", "SPCX", "DRAM"])
const usd = (n: number) => `$${fmtCompact(n)}`

export const FlowTab = React.memo(function FlowTab({ d }: { d: SignalsResponse }) {
  const vol = d.volume
  const m = d.market
  const pos = d.positioning
  const liq = m.liquidations
  const book = d.orderBook ?? null
  const price = d.price.mark
  const dp = price > 0 ? priceDp(price) : 2
  const spikeNotable = vol.spikeLabel && !["NORMAL", "no data", "ELEVATED", "DRY"].includes(vol.spikeLabel)
  const abs = vol.absorption
  // Wave 2 feature objects (F2). Every tile renders its own "feed off" when its object is null, so the tab works
  // before the feed lands. `now` ticks once a minute and only feeds the stale tags.
  const f = readFeatures(d)
  const now = useNow(60_000)
  const isCrypto = CRYPTO.has(d.asset)
  const lastDepth = book ? book.depth[book.depth.length - 1] : null
  const bookImb = f?.book ?? (lastDepth ? { imbalance: lastDepth.imbalance, band: lastDepth.band } : null)
  const bookTone = bookImb == null ? undefined : bookImb.imbalance >= 0.2 ? GREEN : bookImb.imbalance <= -0.2 ? RED : undefined
  const bandTxt = bookImb ? `${bookImb.band * 100 < 1 ? (bookImb.band * 100).toFixed(2) : (bookImb.band * 100).toFixed(0)}%` : ""
  const nearBid = book?.bidWalls.find((w) => w.price < price) ?? book?.bidWalls[0] ?? null
  const nearAsk = book?.askWalls.find((w) => w.price > price) ?? book?.askWalls[0] ?? null

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
                <span className="text-[10px] text-white/50">vs 20 EMA</span>
              </div>
              <p className="text-[11px] text-white/50 mt-0.5">Volume well above its 20-period average: a real move, not a drift.</p>
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
          <StatCard label="Candle CVD" value={fmtCompact(vol.cvd)} sub={f?.cvd ? "candle proxy · see Order flow score" : vol.cvd > 0 ? "Buyers dominate" : "Sellers dominate"} color={vol.cvd > 0 ? GREEN : RED} icon={GitBranch} hint="Candle-colour proxy for cumulative volume delta (volume signed by whether the bar closed up or down). The Order flow score section carries the real taker-based CVD when the feed is on." />
        </div>
      </div>

      {/* Order flow score (F2.3): real CVD, quarter-hour imbalance, OI quadrant, book imbalance and nearest walls */}
      <div id="sec-order-flow">
        <SectionTitle
          icon={Waves}
          right={
            <span className="text-[10px] text-[#9CA3AF]/80">
              {f?.cvd ? "OKX taker feed" : "taker feed off"} · feeds the FLOW block of the verdict
            </span>
          }
        >
          Order flow score
        </SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CvdTile cvd={f?.cvd} now={now} />
          <QuarterHourTile cvd={f?.cvd} now={now} />
          <div className="sm:col-span-2">
            <OiQuadrant oi={f?.oi} now={now} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <OiChangeTiles oi={f?.oi} now={now} fallbackChangePct={pos?.openInterestChange ?? null} />
          <FeatureTile
            label="Book imbalance"
            icon={BookOpen}
            off={bookImb == null}
            stale={staleLabel(f?.book, now)}
            color={bookTone}
            hint="Resting bid depth minus ask depth as a share of both, within the stated band around mid. Beyond ±0.2 the book leans one way; it feeds the FLOW block and the squeeze note in the Order book panel below."
            value={bookImb ? `${bookImb.imbalance >= 0 ? "+" : ""}${bookImb.imbalance.toFixed(2)}` : null}
            sub={bookImb ? `${bookImb.imbalance >= 0.2 ? "bid-heavy" : bookImb.imbalance <= -0.2 ? "ask-heavy" : "balanced"} within ±${bandTxt}${book ? ` · ${book.venue}` : ""}` : null}
          />
          <FeatureTile
            label="Nearest walls"
            icon={Layers}
            off={!book}
            offText="book feed off"
            hint="Largest resting orders closest to price on each side. A buy wall below is cover for a stop; a sell wall above is where to bank partial profit. Walls can be pulled."
            value={
              book ? (
                <span className="flex flex-col gap-0.5 text-sm">
                  <span style={{ color: GREEN }}>{nearBid ? `${usd(nearBid.usd)} bid ${nearBid.distancePct > 0 ? "+" : ""}${nearBid.distancePct}%` : "no buy wall"}</span>
                  <span style={{ color: RED }}>{nearAsk ? `${usd(nearAsk.usd)} ask ${nearAsk.distancePct > 0 ? "+" : ""}${nearAsk.distancePct}%` : "no sell wall"}</span>
                </span>
              ) : null
            }
            sub={book ? `within ±${book.coveragePct}% · ${book.venue}` : null}
          />
        </div>
      </div>

      {/* Positioning & liquidation */}
      {!pos && (
        <div id="sec-positioning">
          <SectionTitle icon={Activity}>Positioning</SectionTitle>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="col-span-2">
              <FundingTile funding={f?.funding} now={now} fallbackRate={m.fundingRate} />
            </div>
          </div>
        </div>
      )}
      {pos && (
        <div id="sec-positioning">
          <SectionTitle
            icon={Activity}
            right={
              pos.squeezeRisk && (
                <Chip variant="warning" tip="Crowded positioning that could unwind violently">
                  {pos.squeezeRisk.replace(/_/g, " ")}
                </Chip>
              )
            }
          >
            Positioning &amp; liquidation
          </SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <FundingTile funding={f?.funding} now={now} fallbackRate={m.fundingRate} />
            </div>
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
          {m.openInterest != null && <StatCard label="Open interest" value={`$${fmtCompact(m.openInterest)}`} icon={BarChart3} />}
          {m.putCallRatio != null && (
            <StatCard label="Put/call ratio" value={fmt(m.putCallRatio, 2)} sub={m.putCallRatio > 1 ? "Bearish sentiment" : m.putCallRatio < 0.7 ? "Bullish sentiment" : "Neutral"} color={m.putCallRatio > 1 ? RED : m.putCallRatio < 0.7 ? GREEN : undefined} icon={Layers} />
          )}
          {m.btcDominance != null && <StatCard label="BTC dominance" value={`${m.btcDominance.toFixed(1)}%`} icon={Hash} />}
          {m.hashRate != null && <StatCard label="Hashrate" value={`${(m.hashRate / 1e9).toFixed(0)} EH/s`} icon={Zap} />}
          {isCrypto && <StablecoinTiles sc={f?.stablecoins} now={now} />}
          {m.deribitFunding8h != null && <StatCard label="Deribit funding 8h" value={`${(m.deribitFunding8h * 100).toFixed(4)}%`} color={m.deribitFunding8h < 0 ? GREEN : m.deribitFunding8h > 0.01 ? RED : undefined} icon={Activity} hint="Funding on Deribit perpetuals, 8-hour rate. Cross-venue check on the main funding figure." />}
        </div>
        <div className={cn("mt-2 text-[10px] text-white/50")}>Values update with every 30s scan.</div>
      </div>
    </div>
  )
})
