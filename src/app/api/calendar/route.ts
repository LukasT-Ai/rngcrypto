import { NextRequest, NextResponse } from "next/server"
import { rateLimit } from "@/lib/rate-limit"
import { getUpcomingEvents } from "@/lib/economic-calendar"

export const dynamic = "force-dynamic"

let cache: { data: unknown; timestamp: number } | null = null
const CACHE_TTL = 15 * 60_000

// Live economic calendar (Fair Economy feed + scheduled FOMC/CPI/NFP/PCE), same source the signal engine uses.
export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 60)
  if (blocked) return blocked
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data, { headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=900" } })
  }

  try {
    const events = (await getUpcomingEvents(45 * 24))
      .filter((e) => e.currency === "USD" || e.currency === "ALL")
      .filter((e) => e.impact !== "low")
      .slice(0, 25)
      .map((e) => ({
        date: e.time.toISOString().slice(0, 10),
        time: e.time.toISOString(),
        event: e.name,
        country: "US",
        impact: /FOMC/i.test(e.name) ? "critical" : e.impact,
        actual: null,
        estimate: null,
        source: e.source,
      }))

    cache = { data: events, timestamp: Date.now() }
    return NextResponse.json(events, { headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=900" } })
  } catch {
    if (cache) return NextResponse.json(cache.data, { headers: { "X-Cache": "STALE" } })
    return NextResponse.json({ error: "Failed to build calendar" }, { status: 500 })
  }
}
