import { NextRequest, NextResponse } from "next/server"

const cache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL = 3600_000 // 1 hour

export async function GET(req: NextRequest) {
  const seriesId = req.nextUrl.searchParams.get("series") ?? "FEDFUNDS"
  const limit = req.nextUrl.searchParams.get("limit") ?? "252"

  const cacheKey = `${seriesId}-${limit}`
  const cached = cache.get(cacheKey)

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=3600" },
    })
  }

  try {
    const apiKey = process.env.FRED_API_KEY ?? "DEMO_KEY"
    const res = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`,
      { next: { revalidate: 3600 } }
    )

    if (!res.ok) {
      return NextResponse.json({ error: "FRED API error" }, { status: res.status })
    }

    const json = await res.json()
    const data = (json.observations ?? [])
      .filter((o: { value: string }) => o.value !== ".")
      .reverse()
      .map((o: { date: string; value: string }) => ({
        date: o.date,
        value: parseFloat(o.value),
      }))

    cache.set(cacheKey, { data, timestamp: Date.now() })

    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=3600" },
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch FRED data" }, { status: 500 })
  }
}
