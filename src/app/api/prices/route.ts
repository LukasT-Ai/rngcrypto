import { NextRequest, NextResponse } from "next/server"
import { rateLimit } from "@/lib/rate-limit"

const cache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL = 30_000
const STALE_OK_MS = 15 * 60_000

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 60)
  if (blocked) return blocked
  const idsParam = req.nextUrl.searchParams.get("ids")
  const ids = idsParam == null ? "bitcoin,ethereum,solana,cardano" : idsParam
  const perPage = req.nextUrl.searchParams.get("per_page") ?? "50"
  const sparkline = req.nextUrl.searchParams.get("sparkline") ?? "true"

  const cacheKey = `${ids}-${perPage}-${sparkline}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
    return NextResponse.json(hit.data, { headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=30" } })
  }

  const idsQuery = ids ? `&ids=${encodeURIComponent(ids)}` : ""
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd${idsQuery}&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=${sparkline}`,
      { cache: "no-store", headers: { "User-Agent": "RNGcrypto/1.0" } }
    )

    if (!res.ok) {
      // CoinGecko free tier 429s often; serve the last good payload rather than breaking the page
      if (hit && Date.now() - hit.timestamp < STALE_OK_MS) {
        return NextResponse.json(hit.data, { headers: { "X-Cache": "STALE", "Cache-Control": "public, s-maxage=30" } })
      }
      return NextResponse.json({ error: "CoinGecko API error" }, { status: res.status })
    }

    const data = await res.json()
    if (!Array.isArray(data)) {
      if (hit) return NextResponse.json(hit.data, { headers: { "X-Cache": "STALE" } })
      return NextResponse.json({ error: "Unexpected CoinGecko payload" }, { status: 502 })
    }
    cache.set(cacheKey, { data, timestamp: Date.now() })
    return NextResponse.json(data, { headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=30" } })
  } catch {
    if (hit) return NextResponse.json(hit.data, { headers: { "X-Cache": "STALE" } })
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 500 })
  }
}
