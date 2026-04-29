import { NextResponse } from "next/server"

let protocolCache: { data: unknown; timestamp: number } | null = null
let tvlCache: { data: unknown; timestamp: number } | null = null
const CACHE_TTL = 300_000 // 5 minutes

export async function GET() {
  const now = Date.now()

  if (
    protocolCache &&
    tvlCache &&
    now - protocolCache.timestamp < CACHE_TTL
  ) {
    return NextResponse.json(
      { protocols: protocolCache.data, tvl: tvlCache.data },
      { headers: { "X-Cache": "HIT" } }
    )
  }

  try {
    const [protRes, tvlRes] = await Promise.all([
      fetch("https://api.llama.fi/protocols"),
      fetch("https://api.llama.fi/v2/historicalChainTvl"),
    ])

    const protocols = protRes.ok
      ? (await protRes.json())
          .sort((a: any, b: any) => (b.tvl ?? 0) - (a.tvl ?? 0))
          .slice(0, 20)
          .map((p: any) => ({
            name: p.name,
            tvl: p.tvl,
            change_1d: p.change_1d,
            change_7d: p.change_7d,
            category: p.category,
            chains: p.chains?.slice(0, 3),
            logo: p.logo,
            url: p.url,
          }))
      : []

    const tvlData = tvlRes.ok
      ? (await tvlRes.json()).slice(-90).map((d: any) => ({
          date: new Date(d.date * 1000).toISOString().slice(0, 10),
          tvl: d.tvl,
        }))
      : []

    protocolCache = { data: protocols, timestamp: now }
    tvlCache = { data: tvlData, timestamp: now }

    return NextResponse.json(
      { protocols, tvl: tvlData },
      { headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=300" } }
    )
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch DeFi data" }, { status: 500 })
  }
}
