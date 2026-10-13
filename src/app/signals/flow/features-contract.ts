// ---------------------------------------------------------------------------
// Wave 2 `features.*` contract. TEMPORARY MIRROR of be-features' canonical types (build/be-features 1e6837a,
// src/lib/signals/features/types.ts, re-exported from ../types.ts as `features?: SignalFeatures | null`). The type
// block below is copied verbatim so the tiles are compiled against the real nullability. After the branches merge,
// replace the block with
//   export type { SignalFeatures as Features, FundingFeature, OiFeature, CvdFeature, BookFeature, VolFeature, BasisFeature, MacroRatesFeature, StablecoinFeature, SessionFeature } from "@/lib/signals/features/types"
// and keep the helpers. Only ui-flow owned files import from here.
// ---------------------------------------------------------------------------

// The `features` object on SignalsResponse (design-ux-ui.md F2, Phase 4). Names follow F2; a few extra fields the
// research spec asked for ride alongside. Every feature object is null when its feed is off, and every numeric
// field inside can be null when that particular transform had too little history. Each object carries asOf and
// ttlMs so the UI can label "stale" at 3x TTL.

export type { SignalFeatures, FundingFeature, OiFeature, CvdFeature, BookFeature, VolFeature, BasisFeature, MacroRatesFeature, StablecoinFeature, SessionFeature, OiQuadrant } from "@/lib/signals/features/types"
import type { SignalFeatures, FundingFeature, OiQuadrant } from "@/lib/signals/features/types"

export type Features = SignalFeatures
export type OiQuadrantKey = OiQuadrant
export type FundingVenueKey = keyof FundingFeature["venues"]
export type FeatureMeta = { asOf?: number; ttlMs?: number }

/** Reads `features` off a response object without requiring the canonical field to exist on the type yet. */
export function readFeatures(d: unknown): Partial<Features> | null {
  if (!d || typeof d !== "object") return null
  const f = (d as { features?: Partial<Features> | null }).features
  return f && typeof f === "object" ? f : null
}

/** "stale 14h" when `asOf` is older than 3x `ttlMs`; null otherwise or when the producer sends no metadata. */
export function staleLabel(meta: FeatureMeta | null | undefined, now: number): string | null {
  if (!meta?.asOf || !meta.ttlMs || now <= 0) return null
  const age = now - meta.asOf
  if (age <= meta.ttlMs * 3) return null
  const h = age / 3.6e6
  if (h >= 48) return `stale ${Math.floor(h / 24)}d`
  if (h >= 1) return `stale ${Math.floor(h)}h`
  return `stale ${Math.max(1, Math.floor(age / 6e4))}m`
}

/** Z-score in the house format: `+1.8 sd`. */
export const fmtSd = (z: number | null | undefined, dp = 1) => (z == null || !Number.isFinite(z) ? "—" : `${z >= 0 ? "+" : ""}${z.toFixed(dp)} sd`)

/** Ordinal percentile: 82 -> `82nd pct`. */
export const fmtPct = (p: number | null | undefined) => {
  if (p == null || !Number.isFinite(p)) return "—"
  const n = Math.round(p)
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"
  return `${n}${s} pct`
}

/** Signed compact dollars: 12_400_000 -> `+$12.4M`. */
export const fmtSignedUsd = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return "—"
  const a = Math.abs(n)
  const body = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}K` : a.toFixed(0)
  return `${n < 0 ? "-" : "+"}$${body}`
}

export const fmtSignedPct = (n: number | null | undefined, dp = 1) => (n == null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`)
