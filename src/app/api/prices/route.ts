import { NextRequest, NextResponse } from "next/server"

let cache: { data: unknown; timestamp: number } | null = null
const CACHE_TTL = 30_000 // 30 seconds

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids") ?? "bitcoin,ethereum,solana,cardano"
  const perPage = req.nextUrl.searchParams.get("per_page") ?? "50"
  const sparkline = req.nextUrl.searchParams.get("sparkline") ?? "true"

  const cacheKey = `${ids}-${perPage}-${sparkline}`

  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=30" },
    })
  }

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=${sparkline}`,
      { next: { revalidate: 30 } }
    )

    if (!res.ok) {
      return NextResponse.json({ error: "CoinGecko API error" }, { status: res.status })
    }

    const data = await res.json()
    cache = { data, timestamp: Date.now() }

    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=30" },
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 500 })
  }
}
