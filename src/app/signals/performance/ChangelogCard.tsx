"use client"

import React from "react"
import { useQuery } from "@tanstack/react-query"
import { GitCommit } from "lucide-react"
import type { PerfChangelogEntry } from "../types"
import { CARD, CardTitle, shortDate } from "./perf-shared"

const REPO = "https://github.com/LukasT-Ai/rngcrypto"

export default function ChangelogCard({ seed }: { seed?: PerfChangelogEntry[] | null }) {
  const { data } = useQuery<{ changelog: PerfChangelogEntry[] }>({
    queryKey: ["performance-changelog"],
    queryFn: async () => {
      const r = await fetch("/api/signals/history?view=changelog")
      if (!r.ok) throw new Error(`changelog ${r.status}`)
      const j = await r.json()
      // Accept either a bare array or { changelog: [...] }.
      return { changelog: Array.isArray(j) ? j : j?.changelog ?? [] }
    },
    staleTime: 10 * 60_000,
    retry: false,
  })
  const entries = [...(data?.changelog?.length ? data.changelog : seed ?? [])].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <div className={`${CARD} p-4`}>
      <CardTitle right={<span className="text-[11px] text-white/50">every rule change that moved a published number</span>}>Methodology changelog</CardTitle>
      {entries.length === 0 ? (
        <p className="text-xs text-white/50">No entries published yet. Rule changes to fills, horizons, costs and exclusions will be listed here with their commit.</p>
      ) : (
        <ol className="space-y-1.5">
          {entries.map((e) => (
            <li key={`${e.commit}-${e.at}`} className="flex flex-col gap-0.5 text-xs sm:flex-row sm:items-baseline sm:gap-3">
              <span className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-white/50 w-14">{shortDate(e.at)}</span>
                <a href={`${REPO}/commit/${e.commit}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-white/70 hover:text-white hover:underline" style={{ textDecorationColor: "var(--brand)" }}>
                  <GitCommit className="size-3" /> {e.commit.slice(0, 7)}
                </a>
              </span>
              <span className="min-w-0">
                <span className="text-white/85">{e.title}</span>
                {e.effect && <span className="text-white/50"> · {e.effect}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
