"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageTransition } from "@/components/page-transition"
import { TrendingUp, TrendingDown, Layers, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

function formatTvl(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  return `$${n.toLocaleString()}`
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return "N/A"
  const sign = n >= 0 ? "+" : ""
  return `${sign}${n.toFixed(2)}%`
}

export default function DefiPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["defi-data"],
    queryFn: async () => {
      const res = await fetch("/api/defi")
      return res.json()
    },
    refetchInterval: 300_000,
  })

  const protocols = data?.protocols ?? []
  const tvlHistory = data?.tvl ?? []
  const latestTvl = tvlHistory[tvlHistory.length - 1]?.tvl

  return (
    <PageTransition>
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 lg:px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">DeFi</h1>
        <Badge variant="secondary" className="gap-1 text-xs">
          <Layers className="size-3" />
          DefiLlama
        </Badge>
        {latestTvl && (
          <span className="font-mono text-sm text-muted-foreground">
            Total TVL: {formatTvl(latestTvl)}
          </span>
        )}
      </div>

      {/* TVL Chart */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Total Value Locked (90D)</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          {tvlHistory.length === 0 ? (
            <div className="skeleton h-64 w-full rounded" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={tvlHistory}>
                <defs>
                  <linearGradient id="tvlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00FF88" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#00FF88" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F293720" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#6B7280" }}
                  tickFormatter={(d) => d.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#6B7280" }}
                  domain={["auto", "auto"]}
                  width={55}
                  tickFormatter={(v) => `$${(v / 1e9).toFixed(0)}B`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0A0E17",
                    border: "1px solid #1F2937",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number | undefined) => [
                    v != null ? formatTvl(v) : "",
                    "TVL",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="tvl"
                  stroke="#00FF88"
                  fill="url(#tvlGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Protocols Table */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top Protocols by TVL</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-accent/50 text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Protocol</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-right">TVL</th>
                  <th className="px-4 py-3 text-right">1D</th>
                  <th className="px-4 py-3 text-right">7D</th>
                  <th className="hidden px-4 py-3 text-left md:table-cell">
                    Chains
                  </th>
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
                          <div className="skeleton h-4 w-28 rounded" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="skeleton h-4 w-16 rounded" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="skeleton ml-auto h-4 w-20 rounded" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="skeleton ml-auto h-4 w-14 rounded" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="skeleton ml-auto h-4 w-14 rounded" />
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          <div className="skeleton h-4 w-24 rounded" />
                        </td>
                      </tr>
                    ))
                  : protocols.map((p: any, i: number) => (
                      <tr
                        key={p.name}
                        className="border-b border-border transition-colors hover:bg-muted last:border-0"
                      >
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {p.logo && (
                              <img
                                src={p.logo}
                                alt={p.name}
                                className="size-5 rounded-full"
                              />
                            )}
                            <span className="text-sm font-medium">
                              {p.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="text-[10px]">
                            {p.category}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm">
                          {formatTvl(p.tvl)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right font-mono text-sm",
                            p.change_1d > 0
                              ? "text-gain"
                              : p.change_1d < 0
                                ? "text-loss"
                                : "text-muted-foreground"
                          )}
                        >
                          {formatPct(p.change_1d)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right font-mono text-sm",
                            p.change_7d > 0
                              ? "text-gain"
                              : p.change_7d < 0
                                ? "text-loss"
                                : "text-muted-foreground"
                          )}
                        >
                          {formatPct(p.change_7d)}
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          <div className="flex gap-1">
                            {p.chains?.map((c: string) => (
                              <Badge
                                key={c}
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {c}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
    </PageTransition>
  )
}
