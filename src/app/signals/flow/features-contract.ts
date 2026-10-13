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

export interface FundingFeature {
  asOf: number;
  ttlMs: number;
  rate8h: number; // OKX realized 8h rate, fraction (0.0001 = 0.01%)
  z: number | null; // vs OKX 30-day funding history (100 x 8h)
  venues: { okx: number; hl: number | null; binance: number | null; bybit: number | null }; // all 8h-equivalent
  spreadRatio: number | null; // max/min absolute venue rate (same sign), null when any venue is at zero
  crowded: "long" | "short" | null; // |z| > 2 only; never a direction vote
  regime: "neutral" | "crowded_long" | "crowded_short";
  n: number; // history samples behind z
}

export type OiQuadrant = "new_longs" | "short_cover" | "new_shorts" | "long_flush";

export interface OiFeature {
  asOf: number;
  ttlMs: number;
  oi: number; // base currency units (OKX oiCcy)
  oiUsd: number | null;
  change1hPct: number | null;
  change24hPct: number | null;
  sd: number | null; // change24hPct in units of its 30-day daily SD
  priceChange24hPct: number | null;
  quadrant: OiQuadrant | null; // null when |sd| < 1 or price change unknown
  quadrantRaw: OiQuadrant | null; // sign-only label regardless of the 1 SD filter
}

export interface CvdFeature {
  asOf: number;
  ttlMs: number;
  cum4hUsd: number; // taker buy - sell over the last 4h, USD
  slope1hUsd: number; // last 1h taker buy - sell, USD
  takerRatio1h: number | null; // buy/sell over the last hour
  takerImbalance15m: number | null; // (buy-sell)/(buy+sell) over the last 15 min, -1..1
  series15m: number[]; // cumulative CVD at 15-minute steps over the last 4h (16 points), USD, oldest first
  qhImbalance: number | null; // EMA(4) of quarter-hour boundary imbalance (be-catalyst's store); null until it exists
  qhReadings: number[]; // last readings behind qhImbalance, oldest first
}

export interface BookFeature {
  asOf: number;
  ttlMs: number;
  imbalance: number; // (bid-ask)/(bid+ask) within `band`
  band: number; // fraction of mid the imbalance was measured in (0.01 / 0.02 / 0.05)
  bidWallPct: number | null; // distance of the nearest bid wall from mid, negative
  askWallPct: number | null; // distance of the nearest ask wall from mid, positive
  venue: "OKX" | "Hyperliquid";
}

export interface VolFeature {
  asOf: number;
  ttlMs: number;
  dvol: number; // Deribit DVOL, annualized vol in percent
  dvolPct: number | null; // 1-year percentile, 0..100
  dvolPct90d: number | null; // 90-day percentile, 0..100
  change24hPct: number | null; // DVOL change vs the prior daily close, percent
  expectedMove24hPct: number; // 1 sd, DVOL / sqrt(365)
  expectedMove24hUsd: number | null;
  expectedMove4hPct: number; // 1 sd, DVOL / sqrt(365 * 6)
  expectedMove4hUsd: number | null;
}

export interface BasisFeature {
  asOf: number;
  ttlMs: number;
  annPct: number; // annualized basis of the nearest dated future > 30d, percent
  z: number | null; // vs up to 90 daily samples collected by this process
  curveSlope: number | null; // b(~6m) - b(~3m), percentage points
  stress: boolean; // nearest dated future (>= 7d) marks below index: backwardation
  front: { instrument: string; daysToExpiry: number; annPct: number } | null;
  n: number; // samples behind z
}

export interface MacroRatesFeature {
  asOf: number;
  ttlMs: number;
  realYield10y: number | null; // percent
  realYield5dChgBp: number | null;
  dxy: number | null;
  dxy5dChgPct: number | null;
  corr30d: number | null; // rolling 30-day correlation of the asset's daily returns with the stronger of the two drivers
  corrRealYield30d: number | null;
  corrDxy30d: number | null;
  gated: boolean; // true = |corr30d| < 0.3, feature silenced
  realYieldSeries: number[]; // last 20 daily closes, oldest first
  dxySeries: number[];
}

export interface StablecoinFeature {
  asOf: number;
  ttlMs: number;
  supplyUsd: number;
  supply7dChgPct: number | null;
  z: number | null; // 7d change vs 1 year of 7d changes
  usdtMint24hUsd: number | null; // USDT circulating - circulatingPrevDay
  usdcMint24hUsd: number | null;
  flag: "tailwind" | "headwind" | null; // z > +1 / z < -1
  mintFlag: boolean; // usdtMint24hUsd >= $500M
}

export interface SessionFeature {
  asOf: number;
  ttlMs: number;
  name: "asia" | "london" | "us" | "off";
  volScale: number; // expected-move multiplier: US 1.3, Asia 0.8, London 1.0, off 0.9; weekend 0.7
  weekend: boolean;
  lowLiquidity: boolean; // weekend or off-hours
  haircutPct: number; // confidence haircut suggested (weekend 10)
  gate: "none" | "late_utc" | "nonc_weekend";
  hourUtc: number;
}

export interface SignalFeatures {
  funding: FundingFeature | null;
  oi: OiFeature | null;
  cvd: CvdFeature | null;
  book: BookFeature | null;
  vol: VolFeature | null;
  basis: BasisFeature | null;
  macroRates: MacroRatesFeature | null;
  stablecoins: StablecoinFeature | null;
  session: SessionFeature;
}

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
