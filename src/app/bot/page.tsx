"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bot, TrendingUp, Shield, Zap, BarChart3 } from "lucide-react"
import { PageTransition } from "@/components/page-transition"

export default function BotPage() {
  return (
    <PageTransition>
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 lg:px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">RnG Daytrader Bot</h1>
        <Badge variant="secondary" className="bg-gain-bg text-gain text-xs gap-1">
          <span className="size-1.5 rounded-full bg-gain pulse-live" />
          Live
        </Badge>
      </div>

      {/* Strategy overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Strategy</p>
              <p className="font-mono text-sm font-medium">EMA 9/21/50</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-chart-3/10">
              <Zap className="size-5 text-chart-3" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Indicators</p>
              <p className="font-mono text-sm font-medium">RSI + ATR</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-chart-4/10">
              <Shield className="size-5 text-chart-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Max Leverage</p>
              <p className="font-mono text-sm font-medium">3x</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-chart-5/10">
              <TrendingUp className="size-5 text-chart-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Risk Per Trade</p>
              <p className="font-mono text-sm font-medium">1%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pairs */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Active Pairs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { pair: "BTC/USDC", type: "Primary" },
              { pair: "ETH/USDC", type: "Primary" },
              { pair: "SOL/USDC", type: "Secondary" },
              { pair: "ADA/USDC", type: "Secondary" },
            ].map((p) => (
              <div
                key={p.pair}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <span className="font-mono text-sm font-medium">{p.pair}</span>
                <Badge
                  variant="secondary"
                  className={
                    p.type === "Primary"
                      ? "bg-primary/10 text-primary text-xs"
                      : "text-xs"
                  }
                >
                  {p.type}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How RnG Bot Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            RnG Daytrader uses a triple EMA crossover (9/21/50) combined with RSI momentum
            and ATR-based stop losses to identify high-probability trade setups on Coinbase Advanced Trade.
          </p>
          <p>
            The bot runs 24/7 via PM2, analyzing markets every 6 hours. It checks the
            Fear & Greed Index before entering positions, refusing to go long during
            Extreme Fear and short during Extreme Greed.
          </p>
          <p>
            All trades use a maximum of 3x leverage with strict 1% risk per trade.
            Performance metrics, trade history, and live positions will be displayed here
            in Phase 2.
          </p>
        </CardContent>
      </Card>
    </div>
    </PageTransition>
  )
}
