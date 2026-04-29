"use client"

import { useEffect, useRef, memo } from "react"

interface TradingViewChartProps {
  symbol: string
  height?: number
}

function TradingViewChartInner({ symbol, height = 400 }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    container.innerHTML = ""

    const script = document.createElement("script")
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
    script.type = "text/javascript"
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(6, 8, 15, 1)",
      gridColor: "rgba(31, 41, 55, 0.15)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: true,
      save_image: false,
      calendar: false,
      studies: ["RSI@tv-basicstudies", "MAExp@tv-basicstudies"],
      support_host: "https://www.tradingview.com",
    })

    container.appendChild(script)

    return () => {
      container.innerHTML = ""
    }
  }, [symbol])

  return (
    <div className="tradingview-widget-container" style={{ height }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </div>
  )
}

export const TradingViewChart = memo(TradingViewChartInner)
