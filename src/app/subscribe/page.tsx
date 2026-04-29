"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { NewsletterForm } from "@/components/newsletter-form"
import { Check, Mail, BarChart3, Bot, Newspaper } from "lucide-react"

const tiers = [
  {
    name: "Free",
    price: "$0",
    description: "Daily market briefs and weekly recaps.",
    features: [
      "Daily market brief (5x/week)",
      "Weekly macro recap",
      "Blog post notifications",
      "YouTube video alerts",
      "RnG Bot summary (weekly)",
    ],
    cta: "Subscribe Free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$15/mo",
    description: "Trading signals, bot data, and community access.",
    features: [
      "Everything in Free",
      "Trading signals (daily)",
      "Full RnG Bot trade data",
      "Deep dive analysis",
      "Discord community access",
      "Priority email support",
    ],
    cta: "Coming Soon",
    highlighted: true,
  },
  {
    name: "Institutional",
    price: "$49/mo",
    description: "Macro dashboards, portfolio models, and AMAs.",
    features: [
      "Everything in Pro",
      "Macro dashboard exports",
      "Portfolio allocation models",
      "Quarterly thesis reports",
      "Monthly AMA sessions",
      "Custom alerts configuration",
    ],
    cta: "Coming Soon",
    highlighted: false,
  },
]

const contentPillars = [
  { icon: Newspaper, label: "Daily Market Brief", freq: "5x/week" },
  { icon: BarChart3, label: "Macro Monday Analysis", freq: "Weekly" },
  { icon: Bot, label: "RnG Bot Recap", freq: "Daily" },
  { icon: Mail, label: "Weekly Deep Dive", freq: "Sunday" },
]

export default function SubscribePage() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-8 px-4 py-6 lg:px-6">
      {/* Hero */}
      <div className="space-y-4 text-center">
        <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">
          <Mail className="mr-1 size-3" />
          Newsletter
        </Badge>
        <h1 className="font-display text-3xl font-bold lg:text-4xl">
          Stay Ahead of the Market
        </h1>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Weekly market analysis, trading signals, macro insights, and RnG Bot
          performance delivered to your inbox. Free.
        </p>
      </div>

      {/* Subscribe form */}
      <div className="mx-auto max-w-md">
        <NewsletterForm variant="card" />
      </div>

      {/* What you get */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {contentPillars.map((p) => (
          <Card key={p.label} className="border-border bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                <p.icon className="size-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{p.label}</p>
                <p className="text-xs text-muted-foreground">{p.freq}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pricing tiers */}
      <div className="grid gap-4 lg:grid-cols-3">
        {tiers.map((tier) => (
          <Card
            key={tier.name}
            className={`border-border bg-card ${
              tier.highlighted ? "ring-2 ring-primary" : ""
            }`}
          >
            <CardContent className="p-6">
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <span className="font-mono text-2xl font-bold">{tier.price}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {tier.description}
              </p>
              <ul className="mt-4 space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="size-3.5 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {tier.name === "Free" ? (
                  <NewsletterForm variant="inline" />
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    {tier.cta}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Powered by Beehiiv. Unsubscribe anytime. No spam, ever.
      </p>
    </div>
  )
}
