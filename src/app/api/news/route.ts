import { NextRequest, NextResponse } from "next/server"
import { rateLimit } from "@/lib/rate-limit"
import { fetchFeedList, gnq } from "@/lib/catalyst-news"

export const dynamic = "force-dynamic"

let cache: { data: unknown; timestamp: number } | null = null
const CACHE_TTL = 120_000

const FEEDS = [
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", name: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", name: "Cointelegraph" },
  { url: "https://decrypt.co/feed", name: "Decrypt" },
  { url: "https://www.theblock.co/rss.xml", name: "The Block" },
  { url: gnq("(crypto OR bitcoin OR ethereum OR solana OR cardano OR stablecoin) when:1d"), name: "Google News" },
]

const CURRENCIES: { code: string; title: string; re: RegExp }[] = [
  { code: "BTC", title: "Bitcoin", re: /bitcoin|\bbtc\b/i },
  { code: "ETH", title: "Ethereum", re: /ethereum|\beth\b/i },
  { code: "SOL", title: "Solana", re: /solana|\bsol\b/i },
  { code: "ADA", title: "Cardano", re: /cardano|\$ada\b/i },
  { code: "XRP", title: "XRP", re: /\bxrp\b|ripple/i },
  { code: "BNB", title: "BNB", re: /\bbnb\b|binance\s*coin/i },
  { code: "DOGE", title: "Dogecoin", re: /dogecoin|\bdoge\b/i },
  { code: "HYPE", title: "Hyperliquid", re: /hyperliquid|\bhype\b/i },
  { code: "LINK", title: "Chainlink", re: /chainlink|\blink\b/i },
  { code: "AVAX", title: "Avalanche", re: /avalanche|\bavax\b/i },
  { code: "DOT", title: "Polkadot", re: /polkadot|\bdot\b/i },
  { code: "TON", title: "Toncoin", re: /toncoin|\bton\b/i },
  { code: "SUI", title: "Sui", re: /\bsui\b/i },
  { code: "ZEC", title: "Zcash", re: /zcash|\bzec\b/i },
  { code: "USDT", title: "Tether", re: /tether|\busdt\b/i },
  { code: "USDC", title: "USD Coin", re: /\busdc\b|circle/i },
]

function hashId(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 60)
  if (blocked) return blocked
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data, { headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=120" } })
  }

  try {
    const { items } = await fetchFeedList(FEEDS)
    const seen = new Set<string>()
    const data = items
      .filter((it) => {
        const k = it.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60)
        if (!k || seen.has(k)) return false
        seen.add(k)
        return true
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 60)
      .map((it) => {
        let domain = ""
        try {
          domain = new URL(it.url).hostname.replace(/^www\./, "")
        } catch {
          /* ignore */
        }
        return {
          id: hashId(it.url || it.title),
          kind: "news",
          title: it.title,
          url: it.url,
          source: { title: it.source, domain },
          published_at: it.publishedAt,
          created_at: it.publishedAt,
          description: it.description,
          currencies: CURRENCIES.filter((c) => c.re.test(it.title)).slice(0, 3).map((c) => ({ code: c.code, title: c.title, slug: c.title.toLowerCase(), url: "" })),
        }
      })

    cache = { data, timestamp: Date.now() }
    return NextResponse.json(data, { headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=120" } })
  } catch {
    if (cache) return NextResponse.json(cache.data, { headers: { "X-Cache": "STALE" } })
    return NextResponse.json({ error: "Failed to fetch news" }, { status: 500 })
  }
}
