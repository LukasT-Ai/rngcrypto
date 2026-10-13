"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { AMBER, HINTS, LABEL, SURFACE, Tip } from "../shared"

// Stat tile for wave 2 feature objects (design-ux-ui.md 4.4 + F2 preamble). Differences from `StatCard`:
//  - `off` renders the value `—` and the sub `feed off` at white/40 (the tile is never hidden, so a dead feed is visible);
//  - `stale` renders an amber `stale 14h` tag and drops the value to white/50;
//  - `aside` places a sparkline or glyph on the right without breaking the 2-column mobile grid;
//  - `sub` accepts nodes so a single word inside it can carry a color (e.g. "crowded" in amber).

export const FeatureTile = React.memo(function FeatureTile({
  label,
  value,
  sub,
  color,
  icon: Icon,
  hint,
  off = false,
  offText = "feed off",
  stale,
  aside,
  footer,
  className,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  color?: string
  icon?: React.ElementType
  hint?: React.ReactNode
  off?: boolean
  offText?: string
  stale?: string | null
  aside?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  const tip = hint ?? HINTS[label]
  const labelEl = <span className={cn(LABEL, tip && "cursor-help underline decoration-dotted decoration-white/25 underline-offset-2")}>{label}</span>
  const valueColor = off ? "rgba(255,255,255,0.4)" : stale ? "rgba(255,255,255,0.5)" : (color ?? "rgba(255,255,255,0.9)")
  return (
    <div className={cn(SURFACE, "min-w-0 px-3 py-2.5 sm:px-4 sm:py-3", className)}>
      <div className="mb-1 flex items-center gap-2">
        {Icon && <Icon className="size-3.5 shrink-0 text-white/50" />}
        {tip ? <Tip content={tip}>{labelEl}</Tip> : labelEl}
        {stale && !off && (
          <span className="ml-auto rounded-md px-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: AMBER, backgroundColor: `${AMBER}1A` }}>
            {stale}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-lg font-bold leading-tight tabular-nums" style={{ color: valueColor }}>
            {off ? "—" : value}
          </p>
          <p className={cn("mt-0.5 text-[11px]", off ? "text-white/40" : "text-white/50")}>{off ? offText : sub}</p>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  )
})
