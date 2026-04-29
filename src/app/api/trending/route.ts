import { NextResponse } from "next/server"

let cache: { data: unknown; timestamp: number } | null = null
const CACHE_TTL = 300_000 // 5 minutes

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { "X-Cache": "HIT" },
    })
  }

  try {
    const [cgRes, dsRes] = await Promise.allSettled([
      fetch("https://api.coingecko.com/api/v3/search/trending"),
      fetch("https://api.dexscreener.com/token-boosts/top/v1"),
    ])

    const cgTrending =
      cgRes.status === "fulfilled" && cgRes.value.ok
        ? (await cgRes.value.json()).coins?.slice(0, 7).map((c: any) => ({
            id: c.item.id,
            name: c.item.name,
            symbol: c.item.symbol,
            thumb: c.item.thumb,
            market_cap_rank: c.item.market_cap_rank,
            price_btc: c.item.price_btc,
            source: "coingecko",
          }))
        : []

    const dsTrending =
      dsRes.status === "fulfilled" && dsRes.value.ok
        ? (await dsRes.value.json())?.slice(0, 5).map((t: any) => ({
            id: t.tokenAddress,
            name: t.description ?? t.tokenAddress?.slice(0, 8),
            symbol: t.symbol ?? "???",
            url: t.url,
            chain: t.chainId,
            source: "dexscreener",
          }))
        : []

    const data = {
      coingecko: cgTrending,
      dexscreener: dsTrending,
    }

    cache = { data, timestamp: Date.now() }

    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=300" },
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch trending" }, { status: 500 })
  }
}
