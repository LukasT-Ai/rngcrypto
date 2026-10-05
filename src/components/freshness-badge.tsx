"use client"

import { Badge } from "@/components/ui/badge"

export interface FreshnessMeta {
  source: "push" | "push-stale" | "archive" | "none"
  pushedAt: number | null
  ageSeconds: number | null
  stale: boolean
  label: string
  asOf: string | null
}

// Honest data-freshness indicator for agent dashboards: Live only when a push landed recently.
export function FreshnessBadge({ meta, accent, loading }: { meta?: FreshnessMeta | null; accent: string; loading?: boolean }) {
  if (loading && !meta) {
    return (
      <Badge variant="secondary" className="text-xs text-muted-foreground">
        Loading…
      </Badge>
    )
  }
  const m: FreshnessMeta = meta ?? { source: "none", pushedAt: null, ageSeconds: null, stale: true, label: "No live feed", asOf: null }
  const live = m.source === "push"
  const color = live ? accent : m.source === "push-stale" ? "#F59E0B" : "#9CA3AF"
  return (
    <Badge
      variant="secondary"
      className="gap-1.5 text-xs border"
      style={{ backgroundColor: `${color}15`, color, borderColor: `${color}40` }}
      title={m.asOf ? `As of ${new Date(m.asOf).toLocaleString()}` : "No data has been pushed by the agent"}
    >
      <span className="relative flex size-1.5">
        {live && <span className="absolute inline-flex size-full animate-ping rounded-full opacity-75" style={{ backgroundColor: color }} />}
        <span className="relative inline-flex size-1.5 rounded-full" style={{ backgroundColor: color }} />
      </span>
      {m.label}
    </Badge>
  )
}
