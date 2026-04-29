"use client"

import { useQuery } from "@tanstack/react-query"
import {
  TrendingUp,
  TrendingDown,
  Search,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { useRouter } from "next/navigation"

type CoinMarket = {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number
  price_change_percentage_24h: number
  market_cap: number
  market_cap_rank: number
  total_volume: number
  sparkline_in_7d?: { price: number[] }
}

function formatPrice(n: number): string {
  if (n >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(2)}T`
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `$${n.toFixed(6)}`
}

function formatPct(n: number): string {
  const sign = n >= 0 ? "+" : ""
  return `${sign}${n.toFixed(2)}%`
}

function MiniSparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length === 0) return null
  const sampled = data.filter((_, i) => i % Math.ceil(data.length / 20) === 0)
  const min = Math.min(...sampled)
  const max = Math.max(...sampled)
  const range = max - min || 1
  const h = 20
  const w = 60
  const points = sampled
    .map((v, i) => `${(i / (sampled.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ")

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "var(--gain)" : "var(--loss)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function MarketsPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")

  const { data: coins, isLoading } = useQuery<CoinMarket[]>({
    queryKey: ["markets-list"],
    queryFn: async () => {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true"
      )
      return res.json()
    },
    refetchInterval: 60_000,
  })

  const filtered = coins?.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.symbol.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 px-4 py-6 lg:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Markets</h1>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tokens..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-accent/50 text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Token</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">24h</th>
                  <th className="hidden px-4 py-3 text-right md:table-cell">7D Chart</th>
                  <th className="hidden px-4 py-3 text-right lg:table-cell">Volume</th>
                  <th className="px-4 py-3 text-right">Market Cap</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? [...Array(10)].map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="px-4 py-3">
                          <div className="skeleton h-4 w-6 rounded" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="skeleton h-4 w-24 rounded" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="skeleton ml-auto h-4 w-20 rounded" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="skeleton ml-auto h-4 w-14 rounded" />
                        </td>
                        <td className="hidden px-4 py-3 text-right md:table-cell">
                          <div className="skeleton ml-auto h-4 w-16 rounded" />
                        </td>
                        <td className="hidden px-4 py-3 text-right lg:table-cell">
                          <div className="skeleton ml-auto h-4 w-16 rounded" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="skeleton ml-auto h-4 w-20 rounded" />
                        </td>
                      </tr>
                    ))
                  : filtered?.map((coin) => {
                      const positive = coin.price_change_percentage_24h >= 0
                      return (
                        <tr
                          key={coin.id}
                          className="border-b border-border transition-colors hover:bg-muted last:border-0 cursor-pointer"
                          onClick={() => router.push(`/markets/${coin.id}`)}
                        >
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {coin.market_cap_rank}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <img
                                src={coin.image}
                                alt={coin.name}
                                className="size-5 rounded-full"
                              />
                              <span className="text-sm font-medium">
                                {coin.name}
                              </span>
                              <span className="text-xs uppercase text-muted-foreground">
                                {coin.symbol}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm">
                            {formatPrice(coin.current_price)}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3 text-right font-mono text-sm font-medium",
                              positive ? "text-gain" : "text-loss"
                            )}
                          >
                            {formatPct(coin.price_change_percentage_24h)}
                          </td>
                          <td className="hidden px-4 py-3 text-right md:table-cell">
                            <div className="flex justify-end">
                              <MiniSparkline
                                data={coin.sparkline_in_7d?.price ?? []}
                                positive={positive}
                              />
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 text-right font-mono text-sm text-muted-foreground lg:table-cell">
                            {formatPrice(coin.total_volume)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm">
                            {formatPrice(coin.market_cap)}
                          </td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
