"use client"

import { useQuery } from "@tanstack/react-query"
import { Clock, ExternalLink, Wifi, Rss } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageTransition } from "@/components/page-transition"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type NewsItem = {
  title: string
  url: string
  source: { title: string }
  published_at: string
  kind: string
  currencies?: { code: string }[]
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NewsPage() {
  const { data: news, isLoading } = useQuery<NewsItem[]>({
    queryKey: ["news-full"],
    queryFn: async () => {
      const res = await fetch(
        "https://cryptopanic.com/api/free/v1/posts/?auth_token=free&public=true&kind=news"
      )
      const json = await res.json()
      return json.results ?? []
    },
    refetchInterval: 120_000,
  })

  return (
    <PageTransition>
    <div className="mx-auto max-w-[1440px] space-y-4 px-4 py-6 lg:px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">News</h1>
        <Badge variant="secondary" className="gap-1 text-xs">
          <Wifi className="size-3 pulse-live text-primary" />
          Live
        </Badge>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="bitcoin">Bitcoin</TabsTrigger>
          <TabsTrigger value="ethereum">Ethereum</TabsTrigger>
          <TabsTrigger value="defi">DeFi</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-border bg-card lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Rss className="size-4 text-primary" />
                  Latest
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="space-y-0">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="border-b border-border px-4 py-3">
                        <div className="skeleton h-4 w-3/4 rounded" />
                        <div className="skeleton mt-2 h-3 w-1/3 rounded" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    {news?.map((item, i) => (
                      <a
                        key={i}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-start gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted last:border-0"
                      >
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
                            {item.title}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{item.source?.title}</span>
                            <span>|</span>
                            <Clock className="size-3" />
                            <span>{timeAgo(item.published_at)}</span>
                            {item.currencies?.map((c) => (
                              <Badge key={c.code} variant="secondary" className="text-[10px] px-1.5 py-0">
                                {c.code}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <ExternalLink className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              {/* Twitter/X Feed */}
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">@rngcrypto on X</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[400px] overflow-y-auto px-4 pb-4">
                    <a
                      className="twitter-timeline"
                      data-theme="dark"
                      data-chrome="noheader nofooter noborders transparent"
                      data-height="380"
                      href="https://twitter.com/rngcrypto"
                    >
                      Loading tweets...
                    </a>
                    <script async src="https://platform.twitter.com/widgets.js" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">RSS Feeds</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>CoinDesk, The Block, Decrypt, CoinTelegraph, DeFi Pulse, Bankless, The Defiant, Messari</p>
                    <p className="text-xs italic">RSS aggregation coming in Phase 2</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Macro Calendar</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">FOMC Meeting</span>
                      <span className="font-mono text-xs">Mar 18-19</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CPI Data</span>
                      <span className="font-mono text-xs">Mar 12</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Jobs Report</span>
                      <span className="font-mono text-xs">Mar 07</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GDP Final</span>
                      <span className="font-mono text-xs">Mar 27</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bitcoin" className="mt-4">
          <p className="text-sm text-muted-foreground">Bitcoin-filtered news coming soon.</p>
        </TabsContent>
        <TabsContent value="ethereum" className="mt-4">
          <p className="text-sm text-muted-foreground">Ethereum-filtered news coming soon.</p>
        </TabsContent>
        <TabsContent value="defi" className="mt-4">
          <p className="text-sm text-muted-foreground">DeFi-filtered news coming soon.</p>
        </TabsContent>
      </Tabs>
    </div>
    </PageTransition>
  )
}
