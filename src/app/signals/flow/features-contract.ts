// ---------------------------------------------------------------------------
// Wave 2 `features.*` contract (research/design-ux-ui.md F2, CONTRACT.md wave 2).
//
// TEMPORARY MIRROR: be-features owns the canonical `Features` type in ../types.ts. Until that lands on master this
// file carries the same shape so the Flow / Momentum / Levels / Macro tiles type-check and render their "feed off"
// fallback. When the canonical type exists, replace the body of this file with
//   export type { Features } from "../types"
// and delete the local declaration. Nothing else imports from here except ui-flow owned files.
//
// Every feature object may also carry `{ asOf, ttlMs }` (F2 preamble); both are optional here so a producer that
// omits them still type-checks. Tiles show a `stale {age}` tag only when `asOf` is present and older than 3x ttl.
// ---------------------------------------------------------------------------

export interface FeatureMeta {
  /** Epoch ms when the feed last produced this value. */
  asOf?: number
  /** Feed refresh interval in ms; stale = now - asOf > 3 * ttlMs. */
  ttlMs?: number
}

export type FundingVenueKey = "hl" | "binance" | "bybit" | "okx" | "strike"

export interface FundingFeature extends FeatureMeta {
  /** Funding z-score vs the 30d distribution, in sd. */
  z: number
  /** 8h-equivalent rate as a fraction (0.0001 = 0.01%). */
  rate8h: number
  /** Per-venue 8h rates; null when a venue is unavailable. Keys are whatever the producer has. */
  venues: Partial<Record<FundingVenueKey, number | null>>
  spreadRatio: number
  crowded: "long" | "short" | null
}

export type OiQuadrantKey = "new_longs" | "short_cover" | "new_shorts" | "long_flush"

export interface OiFeature extends FeatureMeta {
  change24hPct: number
  /** OI change in sd of its 30d distribution. */
  sd: number
  quadrant: OiQuadrantKey | null
  priceChange24hPct: number
}

export interface CvdFeature extends FeatureMeta {
  cum4hUsd: number
  slope1hUsd: number
  takerRatio1h: number
  /** Quarter-hour taker imbalance, EMA of the last 4 readings; null before the first :15 boundary. */
  qhImbalance: number | null
  /** Raw quarter-hour readings, oldest first (up to 4). */
  qhReadings: number[]
  /** Optional 15m CVD series for the sparkline, oldest first (12 points = 3h, 16 = 4h). */
  series15m?: number[]
}

export interface BookFeature extends FeatureMeta {
  imbalance: number
  band: number
}

export interface VolFeature extends FeatureMeta {
  dvol: number
  /** DVOL percentile over its 1y history, 0..100. */
  dvolPct: number
  expectedMove24hPct: number
  expectedMove24hUsd: number
  change24hPct: number
}

export interface BasisFeature extends FeatureMeta {
  annPct: number
  z: number
  curveSlope: number
  stress: boolean
}

export interface MacroRatesFeature extends FeatureMeta {
  realYield10y: number
  realYield5dChgBp: number
  dxy: number
  dxy5dChgPct: number
  corr30d: number
  gated: boolean
  /** Optional 20-point histories for the sparklines, oldest first. */
  realYieldSeries?: number[]
  dxySeries?: number[]
}

export interface StablecoinFeature extends FeatureMeta {
  supply7dChgPct: number
  z: number
  usdtMint24hUsd: number
  flag: "tailwind" | "headwind" | null
}

export interface SessionFeature {
  name: "asia" | "london" | "us" | "off"
  volScale: number
  weekend: boolean
  haircutPct: number
  gate: "none" | "late_utc" | "nonc_weekend"
}

export interface Features {
  funding: FundingFeature | null
  oi: OiFeature | null
  cvd: CvdFeature | null
  book: BookFeature | null
  vol: VolFeature | null
  basis: BasisFeature | null
  macroRates: MacroRatesFeature | null
  stablecoins: StablecoinFeature | null
  session?: SessionFeature
  macroCoupling?: { corr30d: number; mult: number } | null
}

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
