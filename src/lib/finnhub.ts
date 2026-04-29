// Finnhub WebSocket client for real-time price updates
// Uses free tier: 60 API calls/min, WebSocket for real-time trades

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_KEY ?? ""
const WS_URL = `wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`

export type TradeUpdate = {
  symbol: string
  price: number
  volume: number
  timestamp: number
}

type FinnhubTrade = {
  s: string // symbol
  p: number // price
  v: number // volume
  t: number // timestamp
}

type FinnhubMessage = {
  type: string
  data?: FinnhubTrade[]
}

export type PriceCallback = (updates: TradeUpdate[]) => void

export class FinnhubSocket {
  private ws: WebSocket | null = null
  private subscribers = new Map<string, Set<PriceCallback>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private symbols = new Set<string>()

  connect() {
    if (!FINNHUB_API_KEY) {
      console.warn("[Finnhub] No API key set (NEXT_PUBLIC_FINNHUB_KEY)")
      return
    }

    if (this.ws?.readyState === WebSocket.OPEN) return

    this.ws = new WebSocket(WS_URL)

    this.ws.onopen = () => {
      console.log("[Finnhub] WebSocket connected")
      // Re-subscribe to all symbols
      this.symbols.forEach((sym) => {
        this.ws?.send(JSON.stringify({ type: "subscribe", symbol: sym }))
      })
    }

    this.ws.onmessage = (event) => {
      try {
        const msg: FinnhubMessage = JSON.parse(event.data)
        if (msg.type === "trade" && msg.data) {
          const updates: TradeUpdate[] = msg.data.map((t) => ({
            symbol: t.s,
            price: t.p,
            volume: t.v,
            timestamp: t.t,
          }))

          // Group by symbol and notify subscribers
          const bySymbol = new Map<string, TradeUpdate[]>()
          for (const u of updates) {
            const arr = bySymbol.get(u.symbol) ?? []
            arr.push(u)
            bySymbol.set(u.symbol, arr)
          }

          for (const [symbol, trades] of bySymbol) {
            const callbacks = this.subscribers.get(symbol)
            if (callbacks) {
              callbacks.forEach((cb) => cb(trades))
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    this.ws.onclose = () => {
      console.log("[Finnhub] WebSocket closed, reconnecting in 5s...")
      this.reconnectTimer = setTimeout(() => this.connect(), 5000)
    }

    this.ws.onerror = (err) => {
      console.error("[Finnhub] WebSocket error:", err)
    }
  }

  subscribe(symbol: string, callback: PriceCallback) {
    this.symbols.add(symbol)

    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, new Set())
    }
    this.subscribers.get(symbol)!.add(callback)

    // Subscribe on the WebSocket if connected
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "subscribe", symbol }))
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(symbol)
      if (callbacks) {
        callbacks.delete(callback)
        if (callbacks.size === 0) {
          this.subscribers.delete(symbol)
          this.symbols.delete(symbol)
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "unsubscribe", symbol }))
          }
        }
      }
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }
}

// Singleton instance
let instance: FinnhubSocket | null = null

export function getFinnhubSocket(): FinnhubSocket {
  if (!instance) {
    instance = new FinnhubSocket()
  }
  return instance
}

// Finnhub REST API helpers
const API_BASE = "https://finnhub.io/api/v1"

export async function getEconomicCalendar(): Promise<any[]> {
  if (!FINNHUB_API_KEY) return []

  const from = new Date().toISOString().slice(0, 10)
  const to = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

  try {
    const res = await fetch(
      `${API_BASE}/calendar/economic?from=${from}&to=${to}&token=${FINNHUB_API_KEY}`
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.economicCalendar ?? []
  } catch {
    return []
  }
}

export async function getMarketNews(category = "crypto"): Promise<any[]> {
  if (!FINNHUB_API_KEY) return []

  try {
    const res = await fetch(
      `${API_BASE}/news?category=${category}&token=${FINNHUB_API_KEY}`
    )
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}
