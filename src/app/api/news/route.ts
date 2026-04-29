import { NextRequest, NextResponse } from "next/server"

let cache: { data: unknown; timestamp: number } | null = null
const CACHE_TTL = 120_000 // 2 minutes

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=120" },
    })
  }

  try {
    const res = await fetch(
      "https://cryptopanic.com/api/free/v1/posts/?auth_token=free&public=true&kind=news",
      { next: { revalidate: 120 } }
    )

    if (!res.ok) {
      return NextResponse.json({ error: "CryptoPanic API error" }, { status: res.status })
    }

    const json = await res.json()
    const data = json.results ?? []
    cache = { data, timestamp: Date.now() }

    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=120" },
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch news" }, { status: 500 })
  }
}
