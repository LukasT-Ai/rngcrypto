"use client"

import React, { useEffect, useMemo, useRef } from "react"
import { CandlestickSeries, ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from "lightweight-charts"

// Levels chart (design-ux-ui.md P1-12 + F2.4). lightweight-charts candlesticks from `d.candles` with:
//  - plan lines: entry (accent, solid), stop (red, solid), TP1-3 (green, solid, thinner);
//  - order-book walls: bid walls green dotted, ask walls red dotted, labelled with their size;
//  - expected-move band: two white/35 dashed hairlines at price +/- 1 sd 24h (from DVOL), hidden when null.
// Colors follow the brand candle rule (#00FF88 / #FF3B5C bodies and wicks). Every line carries an axis label, so
// identity never rests on color alone. Hover shows a crosshair plus an OHLC readout written straight to a DOM node
// (no React state per mouse move). The chart autosizes to its container, so the 390px layout gets the full width.

export interface ChartCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
}

export interface PlanLine {
  price: number
  /** Axis label text, e.g. "Entry", "Stop", "TP1", "Bid wall $4.1M", "1 sd 24h". */
  title: string
  color: string
  style?: "solid" | "dashed" | "dotted"
  width?: 1 | 2
}

const SURFACE = "#0A0E17"
const GRID = "rgba(255,255,255,0.06)"
const TICK = "#9CA3AF"
const UP = "#00FF88"
const DOWN = "#FF3B5C"

const toSec = (t: number) => (t > 1e12 ? Math.floor(t / 1000) : Math.floor(t)) as UTCTimestamp

const STYLE: Record<NonNullable<PlanLine["style"]>, LineStyle> = { solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted }

function fmtNum(n: number, dp: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

function LevelsChartInner({ candles, lines, dp, height, ariaLabel }: { candles: ChartCandle[]; lines: PlanLine[]; dp: number; height: number; ariaLabel: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])

  // Sorted, de-duplicated candle data in seconds. Memoized on the array identity the poll hands us.
  const data = useMemo(() => {
    const seen = new Set<number>()
    const out: { time: UTCTimestamp; open: number; high: number; low: number; close: number }[] = []
    for (const c of candles) {
      const t = toSec(c.time)
      if (seen.has(t) || !Number.isFinite(c.open)) continue
      seen.add(t)
      out.push({ time: t, open: c.open, high: c.high, low: c.low, close: c.close })
    }
    out.sort((a, b) => a.time - b.time)
    return out
  }, [candles])

  // Create once per mount; autoSize follows the container (ResizeObserver), so mobile widths work without JS math.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const chart = createChart(host, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: SURFACE }, textColor: TICK, fontSize: 11, fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace", attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: GRID, style: LineStyle.Solid } },
      rightPriceScale: { borderColor: GRID, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: GRID, timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "rgba(255,255,255,0.25)", labelBackgroundColor: "#111827" }, horzLine: { color: "rgba(255,255,255,0.25)", labelBackgroundColor: "#111827" } },
      handleScale: { axisPressedMouseMove: true, mouseWheel: false, pinch: true },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      localization: { priceFormatter: (p: number) => fmtNum(p, dp) },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
      priceFormat: { type: "price", precision: dp, minMove: Math.pow(10, -dp) },
    })
    chartRef.current = chart
    seriesRef.current = series

    const onMove: Parameters<IChartApi["subscribeCrosshairMove"]>[0] = (param) => {
      const el = readoutRef.current
      if (!el) return
      const bar = param.seriesData.get(series) as { open: number; high: number; low: number; close: number } | undefined
      if (!param.time || !bar) {
        el.textContent = ""
        return
      }
      const t = new Date((param.time as number) * 1000)
      const stamp = t.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      const chg = bar.open > 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0
      el.textContent = `${stamp}  O ${fmtNum(bar.open, dp)}  H ${fmtNum(bar.high, dp)}  L ${fmtNum(bar.low, dp)}  C ${fmtNum(bar.close, dp)}  ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`
    }
    chart.subscribeCrosshairMove(onMove)
    return () => {
      chart.unsubscribeCrosshairMove(onMove)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      priceLinesRef.current = []
    }
    // dp only changes with the asset, which remounts the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const series = seriesRef.current
    const chart = chartRef.current
    if (!series || !chart) return
    series.setData(data)
    // Show the last ~120 bars so plan lines sit near price instead of a 400-bar squeeze.
    const n = data.length
    if (n > 0) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 120), to: n + 4 })
  }, [data])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    for (const l of priceLinesRef.current) series.removePriceLine(l)
    priceLinesRef.current = lines
      .filter((l) => Number.isFinite(l.price) && l.price > 0)
      .map((l) =>
        series.createPriceLine({
          price: l.price,
          color: l.color,
          lineWidth: l.width ?? 1,
          lineStyle: STYLE[l.style ?? "solid"],
          axisLabelVisible: true,
          title: l.title,
        })
      )
  }, [lines])

  return (
    <div className="relative" style={{ height }}>
      <div ref={hostRef} tabIndex={0} role="img" aria-label={ariaLabel} className="h-full w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand,#00FF88)]" />
      <div ref={readoutRef} aria-live="off" className="pointer-events-none absolute left-2 top-1.5 whitespace-pre font-mono text-[10px] tabular-nums text-white/70" />
    </div>
  )
}

export const LevelsChart = React.memo(LevelsChartInner)
