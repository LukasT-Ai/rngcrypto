"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  TrendingUp,
  TrendingDown,
  ExternalLink,
  ArrowLeft,
  Globe,
  Twitter,
  Activity,
  Star,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { TradingViewChart } from "@/components/tradingview-chart"
import { PageTransition } from "@/components/page-transition"
import { useWatchlist } from "@/stores/watchlist"

// CoinGecko ID -> TradingView symbol mapping for top tokens
const TV_SYMBOLS: Record<string, string> = {
  bitcoin: "BINANCE:BTCUSDT",
  ethereum: "BINANCE:ETHUSDT",
  solana: "BINANCE:SOLUSDT",
  cardano: "BINANCE:ADAUSDT",
  chainlink: "BINANCE:LINKUSDT",
  "avalanche-2": "BINANCE:AVAXUSDT",
  polkadot: "BINANCE:DOTUSDT",
  "matic-network": "BINANCE:MATICUSDT",
  dogecoin: "BINANCE:DOGEUSDT",
  ripple: "BINANCE:XRPUSDT",
  litecoin: "BINANCE:LTCUSDT",
  "shiba-inu": "BINANCE:SHIBUSDT",
  uniswap: "BINANCE:UNIUSDT",
  aave: "BINANCE:AAVEUSDT",
  tron: "BINANCE:TRXUSDT",
  "near-protocol": "BINANCE:NEARUSDT",
  cosmos: "BINANCE:ATOMUSDT",
  stellar: "BINANCE:XLMUSDT",
  aptos: "BINANCE:APTUSDT",
  arbitrum: "BINANCE:ARBUSDT",
  optimism: "BINANCE:OPUSDT",
  sui: "BINANCE:SUIUSDT",
  render: "BINANCE:RENDERUSDT",
  injective: "BINANCE:INJUSDT",
  sei: "BINANCE:SEIUSDT",
  celestia: "BINANCE:TIAUSDT",
}

function formatPrice(n: number): string {
  if (n >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(2)}T`
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1)
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `$${n.toFixed(6)}`
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return "N/A"
  const sign = n >= 0 ? "+" : ""
  return `${sign}${n.toFixed(2)}%`
}

export default function TokenDetailPage() {
  const params = useParams()
  const id = params.id as string
  const { hasToken, addToken, removeToken } = useWatchlist()
  const isWatched = hasToken(id)

  const { data: coin, isLoading } = useQuery({
    queryKey: ["coin-detail", id],
    queryFn: async () => {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`
      )
      return res.json()
    },
    staleTime: 60_000,
  })

  const price = coin?.market_data?.current_price?.usd
  const change24h = coin?.market_data?.price_change_percentage_24h
  const positive = change24h != null && change24h >= 0
  const tvSymbol = TV_SYMBOLS[id]

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 lg:px-6">
        {/* Back link */}
        <Link
          href="/markets"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Markets
        </Link>

        {isLoading ? (
          <div className="space-y-4">
            <div className="skeleton h-10 w-48 rounded" />
            <div className="skeleton h-8 w-32 rounded" />
            <div className="skeleton h-80 w-full rounded-lg" />
          </div>
        ) : coin ? (
          <>
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {coin.image?.large && (
                  <img
                    src={coin.image.large}
                    alt={coin.name}
                    className="size-10 rounded-full"
                  />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-semibold">{coin.name}</h1>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => isWatched ? removeToken(id) : addToken(id)}
                    >
                      <Star
                        className={cn(
                          "size-4",
                          isWatched ? "fill-primary text-primary" : "text-muted-foreground"
                        )}
                      />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm uppercase text-muted-foreground">
                      {coin.symbol}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      Rank #{coin.market_cap_rank}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-3xl font-bold tracking-tight">
                  {price != null ? formatPrice(price) : "..."}
                </p>
                {change24h != null && (
                  <div className="mt-1 flex items-center justify-end gap-1">
                    {positive ? (
                      <TrendingUp className="size-4 text-gain" />
                    ) : (
                      <TrendingDown className="size-4 text-loss" />
                    )}
                    <span
                      className={cn(
                        "font-mono text-sm font-medium",
                        positive ? "text-gain" : "text-loss"
                      )}
                    >
                      {formatPct(change24h)} (24h)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* TradingView Chart or fallback notice */}
            <Card className="border-border bg-card overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {tvSymbol ? "TradingView Chart" : "Price Chart"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {tvSymbol ? (
                  <TradingViewChart symbol={tvSymbol} height={480} />
                ) : (
                  <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                    TradingView chart not available for this token. View on{" "}
                    <a
                      href={`https://www.coingecko.com/en/coins/${id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-primary hover:underline"
                    >
                      CoinGecko
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stats Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "Market Cap",
                  value: formatPrice(coin.market_data?.market_cap?.usd ?? 0),
                },
                {
                  label: "24h Volume",
                  value: formatPrice(coin.market_data?.total_volume?.usd ?? 0),
                },
                {
                  label: "Circulating Supply",
                  value: coin.market_data?.circulating_supply
                    ? `${(coin.market_data.circulating_supply / 1e6).toFixed(1)}M ${coin.symbol?.toUpperCase()}`
                    : "N/A",
                },
                {
                  label: "All-Time High",
                  value: coin.market_data?.ath?.usd
                    ? formatPrice(coin.market_data.ath.usd)
                    : "N/A",
                },
                {
                  label: "ATH Change",
                  value: formatPct(coin.market_data?.ath_change_percentage?.usd),
                },
                {
                  label: "7D Change",
                  value: formatPct(coin.market_data?.price_change_percentage_7d),
                },
                {
                  label: "30D Change",
                  value: formatPct(coin.market_data?.price_change_percentage_30d),
                },
                {
                  label: "1Y Change",
                  value: formatPct(coin.market_data?.price_change_percentage_1y),
                },
              ].map((stat) => (
                <Card key={stat.label} className="border-border bg-card">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="mt-1 font-mono text-sm font-semibold">
                      {stat.value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Description + Links */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border-border bg-card lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">About {coin.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p
                    className="text-sm text-muted-foreground leading-relaxed line-clamp-6"
                    dangerouslySetInnerHTML={{
                      __html: coin.description?.en?.slice(0, 800) ?? "No description available.",
                    }}
                  />
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Links</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {coin.links?.homepage?.[0] && (
                    <a
                      href={coin.links.homepage[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Globe className="size-4" />
                      Website
                      <ExternalLink className="ml-auto size-3" />
                    </a>
                  )}
                  {coin.links?.twitter_screen_name && (
                    <a
                      href={`https://x.com/${coin.links.twitter_screen_name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Twitter className="size-4" />
                      @{coin.links.twitter_screen_name}
                      <ExternalLink className="ml-auto size-3" />
                    </a>
                  )}
                  {coin.links?.blockchain_site?.[0] && (
                    <a
                      href={coin.links.blockchain_site[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Activity className="size-4" />
                      Explorer
                      <ExternalLink className="ml-auto size-3" />
                    </a>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">Token not found.</p>
        )}
      </div>
    </PageTransition>
  )
}
