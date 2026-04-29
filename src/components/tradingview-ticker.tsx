"use client"

import { useEffect, useRef } from "react"

export function TradingViewTicker() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    // Avoid duplicate script injection
    if (containerRef.current.querySelector("script")) return

    const script = document.createElement("script")
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"
    script.async = true
    script.innerHTML = JSON.stringify({
      symbols: [
        { proName: "COINBASE:BTCUSD", title: "BTC" },
        { proName: "COINBASE:ETHUSD", title: "ETH" },
        { proName: "COINBASE:SOLUSD", title: "SOL" },
        { proName: "COINBASE:ADAUSD", title: "ADA" },
        { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
        { proName: "TVC:DXY", title: "DXY" },
        { proName: "TVC:US10Y", title: "10Y Yield" },
        { proName: "TVC:VIX", title: "VIX" },
        { proName: "COINBASE:LINKUSD", title: "LINK" },
        { proName: "COINBASE:AVAXUSD", title: "AVAX" },
      ],
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: "adaptive",
      colorTheme: "dark",
      locale: "en",
    })
    containerRef.current.appendChild(script)
  }, [])

  return (
    <div className="border-b border-border bg-background/50">
      <div
        ref={containerRef}
        className="tradingview-widget-container"
      >
        <div className="tradingview-widget-container__widget" />
      </div>
    </div>
  )
}
