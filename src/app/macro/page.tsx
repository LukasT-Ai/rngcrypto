"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TrendingUp, TrendingDown, Activity, Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
  Legend,
} from "recharts"

const FRED_SERIES = {
  FEDFUNDS: { label: "Fed Funds Rate", suffix: "%" },
  DGS10: { label: "10Y Treasury Yield", suffix: "%" },
  DEXUSEU: { label: "EUR/USD", suffix: "" },
  VIXCLS: { label: "VIX", suffix: "" },
  CPIAUCSL: { label: "CPI (YoY)", suffix: "" },
  UNRATE: { label: "Unemployment Rate", suffix: "%" },
}

type FredObs = { date: string; value: string }

function useFredSeries(seriesId: string) {
  return useQuery({
    queryKey: ["fred", seriesId],
    queryFn: async () => {
      const res = await fetch(`/api/macro?series=${seriesId}&limit=252`)
      return res.json()
    },
    staleTime: 3600_000,
  })
}

function MacroChart({
  title,
  data,
  color,
  suffix,
}: {
  title: string
  data: { date: string; value: number }[] | undefined
  color: string
  suffix: string
}) {
  if (!data || data.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex h-48 items-center justify-center p-4">
          <div className="skeleton h-full w-full rounded" />
        </CardContent>
      </Card>
    )
  }

  const latest = data[data.length - 1]
  const prev = data[data.length - 2]
  const change = latest && prev ? latest.value - prev.value : 0

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-semibold">
              {latest?.value.toFixed(2)}
              {suffix}
            </span>
            {change !== 0 && (
              <span
                className={cn(
                  "flex items-center gap-0.5 font-mono text-xs font-medium",
                  change > 0 ? "text-loss" : "text-gain"
                )}
              >
                {change > 0 ? (
                  <TrendingUp className="size-3" />
                ) : (
                  <TrendingDown className="size-3" />
                )}
                {change > 0 ? "+" : ""}
                {change.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
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
              width={45}
            />
            <Tooltip
              contentStyle={{
                background: "#0A0E17",
                border: "1px solid #1F2937",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#9CA3AF" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={`url(#grad-${title})`}
              strokeWidth={1.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function CorrelationView() {
  const { data: btcData } = useQuery({
    queryKey: ["btc-history"],
    queryFn: async () => {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=90&interval=daily"
      )
      const json = await res.json()
      return json.prices?.map((p: [number, number]) => ({
        date: new Date(p[0]).toISOString().slice(0, 10),
        btc: p[1],
      }))
    },
    staleTime: 3600_000,
  })

  const { data: dxyData } = useFredSeries("DTWEXBGS")
  const { data: yieldData } = useFredSeries("DGS10")

  // Merge datasets by date
  const merged =
    btcData && dxyData && yieldData
      ? btcData
          .map((b: { date: string; btc: number }) => {
            const dxy = dxyData.find(
              (d: { date: string }) => d.date === b.date
            )
            const y10 = yieldData.find(
              (d: { date: string }) => d.date === b.date
            )
            if (!dxy || !y10) return null
            return {
              date: b.date,
              BTC: ((b.btc / btcData[0].btc) * 100).toFixed(1),
              DXY: ((dxy.value / dxyData[0].value) * 100).toFixed(1),
              "10Y": ((y10.value / yieldData[0].value) * 100).toFixed(1),
            }
          })
          .filter(Boolean)
      : []

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          BTC vs DXY vs 10Y Yield (Normalized, 90D)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        {merged.length === 0 ? (
          <div className="skeleton h-64 w-full rounded" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={merged}>
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
                width={40}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "#0A0E17",
                  border: "1px solid #1F2937",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="BTC"
                stroke="#00FF88"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="DXY"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="10Y"
                stroke="#6366F1"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

function EconomicCalendar() {
  const { data: events, isLoading } = useQuery({
    queryKey: ["econ-calendar"],
    queryFn: async () => {
      const res = await fetch("/api/calendar")
      return res.json()
    },
    staleTime: 3600_000,
  })

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Upcoming Economic Events</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton h-12 w-full rounded" />
            ))}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            {(events ?? []).map((e: any, i: number) => (
              <div
                key={`${e.date}-${e.event}-${i}`}
                className="flex items-center justify-between rounded-md border border-border p-3 transition-colors hover:bg-muted"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">
                    {e.date}
                  </span>
                  <span className="font-medium">{e.event}</span>
                  {e.estimate && (
                    <span className="text-xs text-muted-foreground">
                      Est: {e.estimate}
                    </span>
                  )}
                </div>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-xs shrink-0",
                    e.impact === "critical" && "bg-loss-bg text-loss",
                    e.impact === "high" && "bg-chart-4/10 text-chart-4",
                    e.impact === "medium" && "bg-secondary text-secondary-foreground"
                  )}
                >
                  {e.impact}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function MacroPage() {
  const fedFunds = useFredSeries("FEDFUNDS")
  const dgs10 = useFredSeries("DGS10")
  const vix = useFredSeries("VIXCLS")
  const eurUsd = useFredSeries("DEXUSEU")

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 lg:px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Macro Economy</h1>
        <Badge variant="secondary" className="gap-1 text-xs">
          <Globe className="size-3" />
          FRED
        </Badge>
      </div>

      {/* Correlation chart */}
      <CorrelationView />

      {/* Individual macro charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <MacroChart
          title="Fed Funds Rate"
          data={fedFunds.data}
          color="#FF3B5C"
          suffix="%"
        />
        <MacroChart
          title="10Y Treasury Yield"
          data={dgs10.data}
          color="#6366F1"
          suffix="%"
        />
        <MacroChart
          title="VIX (Volatility)"
          data={vix.data}
          color="#F59E0B"
          suffix=""
        />
        <MacroChart
          title="EUR/USD"
          data={eurUsd.data}
          color="#22D3EE"
          suffix=""
        />
      </div>

      {/* Macro Calendar from API */}
      <EconomicCalendar />
    </div>
  )
}
