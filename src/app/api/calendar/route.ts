import { NextResponse } from "next/server"

let cache: { data: unknown; timestamp: number } | null = null
const CACHE_TTL = 3600_000 // 1 hour

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "X-Cache": "HIT" },
    })
  }

  const apiKey = process.env.FINNHUB_API_KEY ?? ""

  if (!apiKey) {
    // Return static economic calendar as fallback
    const fallback = [
      { date: "2026-03-07", event: "Non-Farm Payrolls", country: "US", impact: "high", actual: null, estimate: "185K" },
      { date: "2026-03-12", event: "CPI Inflation (YoY)", country: "US", impact: "high", actual: null, estimate: "2.8%" },
      { date: "2026-03-13", event: "PPI (MoM)", country: "US", impact: "medium", actual: null, estimate: "0.2%" },
      { date: "2026-03-18", event: "FOMC Rate Decision", country: "US", impact: "critical", actual: null, estimate: "4.25%" },
      { date: "2026-03-19", event: "FOMC Press Conference", country: "US", impact: "critical", actual: null, estimate: null },
      { date: "2026-03-27", event: "GDP (Q4 Final)", country: "US", impact: "medium", actual: null, estimate: "3.2%" },
      { date: "2026-03-28", event: "PCE Price Index", country: "US", impact: "high", actual: null, estimate: "2.6%" },
      { date: "2026-04-02", event: "ISM Manufacturing PMI", country: "US", impact: "medium", actual: null, estimate: "50.5" },
      { date: "2026-04-04", event: "Non-Farm Payrolls", country: "US", impact: "high", actual: null, estimate: null },
      { date: "2026-04-10", event: "CPI Inflation (YoY)", country: "US", impact: "high", actual: null, estimate: null },
    ]
    return NextResponse.json(fallback)
  }

  try {
    const from = new Date().toISOString().slice(0, 10)
    const to = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10)

    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`
    )

    if (!res.ok) {
      return NextResponse.json({ error: "Finnhub error" }, { status: res.status })
    }

    const json = await res.json()
    const events = (json.economicCalendar ?? [])
      .filter((e: any) => e.country === "US")
      .map((e: any) => ({
        date: e.time?.slice(0, 10) ?? e.date,
        event: e.event,
        country: e.country,
        impact: e.impact === 3 ? "critical" : e.impact === 2 ? "high" : "medium",
        actual: e.actual,
        estimate: e.estimate,
        prev: e.prev,
        unit: e.unit,
      }))
      .slice(0, 20)

    cache = { data: events, timestamp: Date.now() }

    return NextResponse.json(events, {
      headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=3600" },
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 })
  }
}
