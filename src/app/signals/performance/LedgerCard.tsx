"use client"

import React, { useState } from "react"
import { Check, Copy, Download, FileJson, FileSpreadsheet } from "lucide-react"
import type { PerfLedger } from "../types"
import { CARD, CardTitle, Hint, fmtBytes } from "./perf-shared"

const BTN = "inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80 hover:border-white/25 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)] transition-colors"

export default function LedgerCard({ ledger, recordCount }: { ledger?: PerfLedger | null; recordCount: number }) {
  const [copied, setCopied] = useState(false)
  const jsonUrl = ledger?.url ?? "/api/signals/history/backup"
  const csvUrl = ledger?.csvUrl ?? "/api/signals/history/backup?format=csv"
  const sha = ledger?.sha256 ?? null
  const copy = async () => {
    if (!sha) return
    try {
      await navigator.clipboard.writeText(sha)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className={`${CARD} p-4`}>
      <CardTitle>Ledger</CardTitle>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/60">
        <a href={jsonUrl} download className={BTN}><FileJson className="size-3.5" /> JSON <Download className="size-3 opacity-60" /></a>
        <a href={csvUrl} download className={BTN} title={ledger?.csvUrl ? undefined : "CSV export arrives with the ledger update"}><FileSpreadsheet className="size-3.5" /> CSV <Download className="size-3 opacity-60" /></a>
        <span className="inline-flex items-center gap-1.5">
          <span className="uppercase tracking-[0.08em] text-white/50">SHA-256</span>
          {sha ? (
            <>
              <span className="font-mono text-white/85" title={sha}>{sha.slice(0, 8)}…{sha.slice(-2)}</span>
              <button type="button" onClick={copy} aria-label="Copy full SHA-256" className="inline-flex items-center text-white/50 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--brand)] rounded">
                {copied ? <Check className="size-3.5 text-[var(--brand)]" /> : <Copy className="size-3.5" />}
              </button>
            </>
          ) : (
            <Hint text="The daily SHA-256 of the ledger file is not yet published. It arrives with the ledger update and is also served as a response header on the download, so the number here can be checked against the file."><span className="font-mono text-white/40 cursor-help" tabIndex={0}>—</span></Hint>
          )}
        </span>
        {ledger?.hashedAt && <span>hashed {new Date(ledger.hashedAt).toISOString().replace("T", " ").slice(0, 16)} UTC</span>}
        <span><span className="font-mono text-white/85">{ledger?.count ?? recordCount}</span> records{ledger?.bytes ? <> · <span className="font-mono text-white/85">{fmtBytes(ledger.bytes)}</span></> : null}</span>
      </div>
      <p className="mt-2 text-[11px] text-white/45">The hash is recomputed daily at 00:05 UTC and served as a header on the same route, so a downloaded file can be checked against the number shown here.</p>
    </div>
  )
}
