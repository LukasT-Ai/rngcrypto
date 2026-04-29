"use client"

import { useEffect, useRef, useState } from "react"
import { getFinnhubSocket, type TradeUpdate } from "@/lib/finnhub"

type PriceState = {
  price: number | null
  prevPrice: number | null
  direction: "up" | "down" | "neutral"
  volume: number
  lastUpdate: number
}

/**
 * Hook for real-time price updates via Finnhub WebSocket.
 *
 * Usage:
 *   const { price, direction } = useRealtimePrice("BINANCE:BTCUSDT")
 *
 * Finnhub symbols for crypto:
 *   BINANCE:BTCUSDT, BINANCE:ETHUSDT, BINANCE:SOLUSDT, COINBASE:BTC-USD
 */
export function useRealtimePrice(symbol: string) {
  const [state, setState] = useState<PriceState>({
    price: null,
    prevPrice: null,
    direction: "neutral",
    volume: 0,
    lastUpdate: 0,
  })

  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (!symbol) return

    const socket = getFinnhubSocket()
    socket.connect()

    const unsub = socket.subscribe(symbol, (updates: TradeUpdate[]) => {
      const latest = updates[updates.length - 1]
      if (!latest) return

      const prev = stateRef.current.price
      const direction =
        prev === null
          ? "neutral"
          : latest.price > prev
            ? "up"
            : latest.price < prev
              ? "down"
              : "neutral"

      setState({
        price: latest.price,
        prevPrice: prev,
        direction,
        volume: latest.volume,
        lastUpdate: latest.timestamp,
      })
    })

    return () => {
      unsub()
    }
  }, [symbol])

  return state
}

/**
 * Hook for multiple real-time prices.
 *
 * Usage:
 *   const prices = useRealtimePrices(["BINANCE:BTCUSDT", "BINANCE:ETHUSDT"])
 */
export function useRealtimePrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, PriceState>>({})

  useEffect(() => {
    if (symbols.length === 0) return

    const socket = getFinnhubSocket()
    socket.connect()

    const unsubs = symbols.map((symbol) =>
      socket.subscribe(symbol, (updates: TradeUpdate[]) => {
        const latest = updates[updates.length - 1]
        if (!latest) return

        setPrices((prev) => {
          const old = prev[symbol]
          const oldPrice = old?.price ?? null
          const direction =
            oldPrice === null
              ? "neutral"
              : latest.price > oldPrice
                ? "up"
                : latest.price < oldPrice
                  ? "down"
                  : ("neutral" as const)

          return {
            ...prev,
            [symbol]: {
              price: latest.price,
              prevPrice: oldPrice,
              direction,
              volume: latest.volume,
              lastUpdate: latest.timestamp,
            },
          }
        })
      })
    )

    return () => {
      unsubs.forEach((unsub) => unsub())
    }
  }, [symbols.join(",")])

  return prices
}
