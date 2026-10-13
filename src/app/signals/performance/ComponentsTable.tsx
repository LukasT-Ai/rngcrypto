"use client"

import React, { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PerfComponentRow } from "../types"
import { CARD, CardTitle, GRAY, Hint, NotYet, Rate, fmtPct } from "./perf-shared"

type SortKey = "name" | "weight" | "nAgree" | "pWinAgree" | "pWinDisagree" | "lift" | "candidateWeight"
const COLS: { k: SortKey; l: string; align: "left" | "right"; hint?: string }[] = [
  { k: "name", l: "Factor", align: "left" },
  { k: "weight", l: "w", align: "right", hint: "Weight the engine applies to this component today." },
  { k: "nAgree", l: "n agree", align: "right", hint: "Decided signals where this component pointed the same way as the call." },
  { k: "pWinAgree", l: "P(win | agree)", align: "right", hint: "TP1 rate when the component agreed with the call, with a 95% Wilson interval." },
  { k: "pWinDisagree", l: "P(win | dis)", align: "right", hint: "TP1 rate when the component disagreed with the call." },
  { k: "lift", l: "Lift", align: "right", hint: "P(win | agree) minus P(win | disagree). A marker appears when the 95% interval excludes zero." },
]

const sortVal = (r: PerfComponentRow, k: SortKey): number | string => {
  if (k === "name") return r.name
  if (k === "lift") return Math.abs(r.lift ?? -Infinity)
  const v = r[k]
  return v == null ? -Infinity : v
}

function LiftCell({ r }: { r: PerfComponentRow }) {
  if (r.lift == null) return <span className="text-white/40">—</span>
  const sig = r.liftLo != null && r.liftHi != null && (r.liftLo > 0 || r.liftHi < 0)
  return (
    <span className="font-mono tabular-nums" title={r.liftLo != null && r.liftHi != null ? `95% interval ${r.liftLo.toFixed(2)} to ${r.liftHi.toFixed(2)}` : undefined}>
      {r.lift > 0 ? "+" : ""}{r.lift.toFixed(2)}
      {sig && <span className="ml-1 text-[var(--brand)]" aria-label="interval excludes zero">●</span>}
    </span>
  )
}

export default function ComponentsTable({ rows }: { rows?: PerfComponentRow[] | null }) {
  const [sort, setSort] = useState<{ k: SortKey; dir: "asc" | "desc" }>({ k: "lift", dir: "desc" })
  const hasCandidate = !!rows?.some((r) => r.candidateWeight != null)
  const cols = useMemo(() => (hasCandidate ? [...COLS, { k: "candidateWeight" as SortKey, l: "Candidate w", align: "right" as const, hint: "Display only. Candidate weight from the reliability table; validated in the backtest before it is applied." }] : COLS), [hasCandidate])
  const sorted = useMemo(() => {
    const list = [...(rows ?? [])]
    list.sort((a, b) => {
      const va = sortVal(a, sort.k)
      const vb = sortVal(b, sort.k)
      const c = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb)
      return sort.dir === "asc" ? c : -c
    })
    return list
  }, [rows, sort])

  const toggle = (k: SortKey) => setSort((s) => (s.k === k ? { k, dir: s.dir === "asc" ? "desc" : "asc" } : { k, dir: k === "name" ? "asc" : "desc" }))

  return (
    <div className={`${CARD} p-4`}>
      <CardTitle right={<span className="text-[11px] text-white/50">agree vs disagree, decided signals</span>}>Components</CardTitle>
      {!rows || rows.length === 0 ? (
        <div className="mt-2 text-xs text-white/50 flex items-center gap-2"><NotYet what="Per-component reliability" /> Per-factor hit rates appear once the engine logs component scores at call time.</div>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.08em] text-white/50">
                  {cols.map((c) => (
                    <th key={c.k} scope="col" aria-sort={sort.k === c.k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("py-1 font-medium", c.align === "right" ? "text-right" : "text-left")}>
                      <button type="button" onClick={() => toggle(c.k)} className={cn("inline-flex items-center gap-1 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)] rounded px-0.5", c.align === "right" && "flex-row-reverse")}>
                        {c.l}
                        {sort.k === c.k ? (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                      {c.hint && <Hint text={c.hint} className="ml-1 align-middle" />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.name} className="border-t border-white/[0.05]">
                    <td className="py-1.5 font-medium text-white/85">{r.name}</td>
                    <td className="text-right font-mono tabular-nums text-white/70">{r.weight.toFixed(2)}</td>
                    <td className="text-right font-mono tabular-nums text-white/70">{r.nAgree}</td>
                    <td className="text-right"><Rate rate={r.pWinAgree} n={r.nAgree} /></td>
                    <td className="text-right font-mono tabular-nums text-white/70" title={`n=${r.nDisagree}`}>{fmtPct(r.pWinDisagree)}</td>
                    <td className="text-right"><LiftCell r={r} /></td>
                    {hasCandidate && <td className="text-right font-mono tabular-nums text-white/70">{r.candidateWeight == null ? "—" : r.candidateWeight.toFixed(2)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] text-white/50">
              Sort
              <select aria-label="Sort components" value={sort.k} onChange={(e) => setSort({ k: e.target.value as SortKey, dir: "desc" })} className="rounded border border-white/10 bg-transparent px-1.5 py-0.5 text-white/80">
                {cols.map((c) => <option key={c.k} value={c.k} className="bg-[#111827]">{c.l}</option>)}
              </select>
            </div>
            {sorted.map((r) => (
              <div key={r.name} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white/85">{r.name}</span>
                  <span className="font-mono text-white/60">w {r.weight.toFixed(2)} · n {r.nAgree}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span><span className="text-white/50">agree </span><Rate rate={r.pWinAgree} n={r.nAgree} /></span>
                  <span><span className="text-white/50">dis </span><span className="font-mono">{fmtPct(r.pWinDisagree)}</span></span>
                  <span><span className="text-white/50">lift </span><LiftCell r={r} /></span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: GRAY }}>Sorted by |lift| by default. No color below n = 30. {hasCandidate && "Candidate weights are display only and are validated in the backtest before use."}</p>
        </>
      )}
    </div>
  )
}
