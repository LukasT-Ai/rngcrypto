export type MacroAsset = "BTC" | "GOLD" | "WTI";
export const MACRO_ASSETS: MacroAsset[] = ["BTC", "GOLD", "WTI"];

export type Direction = "bullish" | "bearish" | "mixed";
export type Confidence = "low" | "medium" | "high";
export type Importance = "low" | "medium" | "high" | "critical";

// What a HIGHER-than-expected print means economically. Asset direction is derived from this + regime, never hard-coded per event.
export type EventKind =
  | "inflation"
  | "growth"
  | "labor_strength"
  | "labor_weakness"
  | "wages"
  | "oil_inventory"
  | "oil_product_inventory"
  | "oil_production"
  | "policy_rate"
  | "fed_communication"
  | "sentiment"
  | "auction"
  | "housing"
  // Foreign central banks and the foreign data that moves them: + = hawkish abroad = weaker dollar.
  | "foreign_cb"
  // Trade balance style prints: + = narrower deficit.
  | "trade"
  // Budget, TIC flows, consumer credit: informational, no transmission.
  | "fiscal"
  // CFTC positioning: informational, no transmission.
  | "positioning"
  // Options expiries, elections: dated risk events with no number.
  | "market_event"
  | "crypto";

export type Unit = "pct" | "k" | "m" | "b" | "index" | "mb" | "rate" | "text";

export type SourceProvider = "BLS" | "FRED" | "EIA" | "BEA" | "FXSTREET" | "NEWS" | "NONE";
export type Transform = "mom_pct" | "yoy_pct" | "diff_k" | "level" | "level_m" | "weekly_change_mb";

export interface MacroEventDef {
  id: string;
  title: string;
  aliases: RegExp;
  kind: EventKind;
  importance: Importance;
  unit: Unit;
  decimals: number;
  typicalSurpriseSD: number | null;
  relevance: Record<MacroAsset, number>;
  source: { provider: SourceProvider; series?: string; transform?: Transform; components?: { name: string; series: string; transform: Transform }[] };
  logic: string;
}

export interface ScheduledEvent {
  id: string;
  defId: string;
  title: string;
  time: string;
  importance: Importance;
  forecast: number | null;
  forecastRaw: string | null;
  previous: number | null;
  previousRaw: string | null;
  unit: Unit;
  source: "fxstreet" | "faireconomy" | "scheduled";
  retrievedAt: string;
  // FXStreet country code (US, EMU, UK, JP, CN, ...). Undefined = US.
  country?: string;
  // Where forecast/previous came from when not straight from the calendar feed (e.g. "BLS prior print",
  // "EIA consensus (proxy)"). null = calendar consensus. Lets the UI label proxies honestly.
  forecastSource?: string | null;
  previousSource?: string | null;
  // One line explaining a missing or proxied expectation ("No consensus: text event; market read via 2Y/DXY").
  expectationNote?: string | null;
}

export type RevisionStatus = "preliminary" | "revised" | "final" | "unknown";

export interface ReleaseValue {
  value: number;
  raw: string;
  period: string;
  revisionStatus: RevisionStatus;
  provider: SourceProvider;
  series: string;
  sourceTimestamp: string | null;
  retrievedAt: string;
  priorRevised: { period: string; from: number; to: number } | null;
  components?: Record<string, number | null>;
}

export type ReleaseStatus = "verified" | "awaiting" | "conflict" | "unavailable";

export interface VerifiedRelease {
  eventId: string;
  status: ReleaseStatus;
  actual: ReleaseValue | null;
  candidates: ReleaseValue[];
  note: string;
  checkedAt: string;
}

export type SurpriseMagnitude = "inline" | "small" | "large" | "extreme";

export type ZAnchor = "consensus" | "market" | "blended" | "previous";
export type SdSource = "market" | "rolling" | "prior";

export interface SurpriseResult {
  delta: number | null;
  unit: Unit;
  zScore: number | null;
  // The expectation the delta and z were measured against, and where it came from (null when no surprise).
  anchor: number | null;
  zAnchor: ZAnchor | null;
  // Where the SD behind the z came from: a liquid Kalshi ladder, our own rolling history, or the taxonomy prior.
  sdSource: SdSource | null;
  // Economic surprise, −100..+100: positive = higher than consensus. Asset sign is applied in impact.ts.
  score: number | null;
  magnitude: SurpriseMagnitude;
  label: string;
  vsPrevious: number | null;
}

export interface MacroRegime {
  inflationFocus: "high" | "normal" | "low";
  policyBias: "tightening" | "hold" | "easing";
  risk: "on" | "off" | "neutral";
  confidence: Confidence;
  summary: string;
  asOf: string;
  inputs: {
    us2y: number | null;
    us10y: number | null;
    us2yChg5d: number | null;
    dxy: number | null;
    dxyChg5d: number | null;
    vix: number | null;
    spxChg5d: number | null;
    cpiYoY: number | null;
  };
}

export interface AssetImpact {
  asset: MacroAsset;
  direction: Direction;
  score: number;
  confidence: Confidence;
  horizon: { immediate: Direction; shortTerm: Direction; swing: Direction };
  channel: string[];
  reason: string;
  conditional?: { ifAbove: Direction; ifBelow: Direction };
}

export type SnapshotKey = "dxy" | "us2y" | "us10y" | "spx" | "ndx" | "vix" | "btc" | "gold" | "wti";
export const SNAPSHOT_KEYS: SnapshotKey[] = ["dxy", "us2y", "us10y", "spx", "ndx", "vix", "btc", "gold", "wti"];

export interface MarketSnapshot {
  at: string;
  prices: Record<SnapshotKey, number | null>;
  dataAgeMs: number | null;
}

export type ReactionLabel = "30s" | "1m" | "5m" | "15m" | "1h" | "4h" | "24h";
export const REACTION_SCHEDULE: { label: ReactionLabel; afterMs: number }[] = [
  { label: "30s", afterMs: 30_000 },
  { label: "1m", afterMs: 60_000 },
  { label: "5m", afterMs: 5 * 60_000 },
  { label: "15m", afterMs: 15 * 60_000 },
  { label: "1h", afterMs: 60 * 60_000 },
  { label: "4h", afterMs: 4 * 60 * 60_000 },
  { label: "24h", afterMs: 24 * 60 * 60_000 },
];

export interface ReactionPoint {
  label: ReactionLabel;
  at: string;
  changesPct: Record<SnapshotKey, number | null>;
}

export type ConfirmationStatus = "awaiting" | "confirmed" | "unconfirmed" | "fading" | "reversing" | "conflicted";

export interface ConfirmationCheck {
  name: string;
  key: SnapshotKey;
  expected: "up" | "down" | "flat";
  observedPct: number | null;
  observed: "up" | "down" | "flat" | null;
  agrees: boolean | null;
}

export interface Confirmation {
  status: ConfirmationStatus;
  pct: number | null;
  checks: ConfirmationCheck[];
  perAsset: Record<MacroAsset, { status: ConfirmationStatus; direction: Direction; note: string }>;
  summary: string;
  basedOn: ReactionLabel | null;
  asOf: string;
}

export type EventPhase = "upcoming" | "imminent" | "releasing" | "released" | "confirming" | "settled";

export interface Alert {
  id: string;
  at: string;
  kind: "pre_event" | "release" | "reversal" | "conflict" | "unverified";
  importance: Importance;
  asset: MacroAsset | null;
  title: string;
  body: string;
  confidence?: Confidence;
  direction?: Direction;
}

export interface EventOutcome {
  status: "verified" | "awaiting" | "unverified" | "conflict";
  // One line: actual vs forecast and the surprise read, or why no number exists.
  headline: string;
  // One line: what the market did at the latest reaction sample and whether it confirmed the expected move.
  impact: string;
  // e.g. "Expected reaction confirmed (75%) @15m"; null until the first sample is judged.
  confirmationNote: string | null;
  direction: Direction;
  perAsset: { asset: MacroAsset; expected: Direction; observed: Direction | null; movePct: number | null; status: ConfirmationStatus | null }[];
  basedOn: ReactionLabel | null;
  asOf: string;
}

export interface EventState {
  event: ScheduledEvent;
  def: MacroEventDef;
  phase: EventPhase;
  secondsToRelease: number;
  preMap: AssetImpact[];
  // What print ranges would read bullish / neutral / bearish per asset; kept after release with the actual's band marked.
  scenarios: import("./scenarios").ScenarioGuide | null;
  release: VerifiedRelease | null;
  surprise: SurpriseResult | null;
  postImpact: AssetImpact[] | null;
  confirmation: Confirmation | null;
  reactions: ReactionPoint[];
  releaseSnapshot: MarketSnapshot | null;
  historical: HistoricalStats | null;
  dataAgeMs: number | null;
  alerts: Alert[];
  // Filled once the event time has passed; persists in `recent` so results stay visible after the live card moves on.
  outcome: EventOutcome | null;
}

export interface HistoricalStats {
  eventId: string;
  segment: string;
  sampleSize: number;
  medians: Record<MacroAsset, Partial<Record<ReactionLabel, number>>>;
}

export interface StoredRelease {
  id: string;
  defId: string;
  eventTime: string;
  forecast: number | null;
  previous: number | null;
  actual: number | null;
  actualRaw?: string | null;
  actualProvider?: SourceProvider | null;
  actualSeries?: string | null;
  surpriseScore: number | null;
  magnitude: SurpriseMagnitude;
  regime: Pick<MacroRegime, "inflationFocus" | "policyBias" | "risk">;
  releaseSnapshot: MarketSnapshot | null;
  reactions: ReactionPoint[];
  confirmation: ConfirmationStatus | null;
  recordedAt: string;
}

export interface MacroScores {
  macro: number;
  event: number;
  confirmation: number;
  weights: { macro: number; event: number; confirmation: number };
  eventAgeMinutes: number | null;
  note: string;
}

// One line of the economic calendar table: a release from the last 7 days or the next 14, with consensus, previous
// and (once out) the actual plus the surprise read. Built per lens so each ticker sees only what moves it.
export interface CalendarRow {
  id: string;
  defId: string;
  title: string;
  time: string;
  importance: Importance;
  kind: EventKind;
  country: string;
  forecastRaw: string | null;
  forecastSource: string | null;
  previousRaw: string | null;
  actualRaw: string | null;
  released: boolean;
  // "Slightly stronger than expected" once an actual exists; null before release or for text events.
  read: string | null;
  // Economic surprise -100..+100 (positive = above consensus); null without an actual.
  score: number | null;
  // ── v2 (design F3). All nullable; the UI renders a fallback for every null. ──
  // Taxonomy relevance per asset (0..1) and the lens asset's relevance after the macro-coupling multiplier.
  relevance: Record<MacroAsset, number>;
  lensRelevance: number;
  // Lens asset: expected direction before the print (from the priced tail skew), observed at the latest reaction
  // sample after it (falls back to the expected post-print direction while no sample exists).
  assetDirection: Direction | null;
  assetDirectionBasis: "expected" | "observed" | null;
  zScore: number | null;
  zAnchor: ZAnchor | null;
  isLive: boolean;
  market: CalendarMarket | null;
  fed: CalendarFed | null;
  reaction: CalendarReaction | null;
  // First-5-minute confirmation gate for the lens asset: > 0.7% in the surprise direction = confirmed, < 0.5% or
  // against it = unconfirmed; pending until the 5m sample exists; null before release or without a direction.
  firstMoveGate: FirstMoveGate | null;
}

export type FirstMoveGate = "pending" | "confirmed" | "unconfirmed";

export interface CalendarMarket {
  mean: number | null;
  sd: number | null;
  tailSkew: number | null;
  venue: "kalshi" | "polymarket" | null;
  volumeUsd: number | null;
  asOf: string | null;
  shrunk: boolean;
}

export interface CalendarFed {
  expectedChangeBp: number;
  surpriseSdBp: number;
  modalLabel: string;
  modalProb: number;
}

export interface CalendarReaction {
  label: ReactionLabel;
  lensMovePct: number | null;
  confirmation: ConfirmationStatus | null;
  // Per-asset moves at the stored samples (5m / 15m / 1h), so the row expansion can show the reaction table.
  samples: Partial<Record<"5m" | "15m" | "1h", Record<MacroAsset, number | null>>>;
}

// Rolling 30-day BTC/SPX daily-return correlation and the multiplier it implies for macro and event weights on
// crypto (0.3..1.0). null when either series is unavailable; the engine then behaves as if mult were 1.
export interface MacroCoupling {
  corr30d: number;
  mult: number;
  n: number;
  asOf: string;
}

export interface MacroState {
  asOf: string;
  regime: MacroRegime;
  market: MarketSnapshot;
  upcoming: ScheduledEvent[];
  // Full calendar table (last 7d + next 14d) for the lens, with actuals.
  calendar: CalendarRow[];
  active: EventState | null;
  recent: EventState[];
  scores: Record<MacroAsset, MacroScores>;
  alerts: Alert[];
  preEventRisk: { event: ScheduledEvent; minutes: number; importance: Importance } | null;
  // Phase 3.3: BTC/SPX coupling (null when the SPX proxy is unavailable).
  macroCoupling: MacroCoupling | null;
  sources: { provider: SourceProvider; enabled: boolean; note: string }[];
  // WTI lens only: latest EIA / API crude inventory prints paired with the next scheduled release.
  oilWeekly?: import("./oil-weekly").WeeklyOilRelease[];
}
