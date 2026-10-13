import type { AssetImpact, Importance, MacroScores } from "@/lib/macro/types"
import type { SignalFeatures } from "@/lib/signals/features/types"

// Phase 4 keyless feature feeds (design F2); produced by be-features, every sub-object nullable except session.
export type { SignalFeatures, FundingFeature, OiFeature, CvdFeature, BookFeature, VolFeature, BasisFeature, MacroRatesFeature, StablecoinFeature, SessionFeature, OiQuadrant } from "@/lib/signals/features/types"
// Canonical UI name (ui-flow's features-contract.ts becomes a re-export of this).
export type Features = SignalFeatures

// ---------------------------------------------------------------------------
// Verdict v2 contract (research/design-ux-ui.md F1.1). Every field is optional and nullable until the producing
// backend phase ships; the UI renders a defined fallback for each null.
// ---------------------------------------------------------------------------

export type CallMode = "trend" | "reversion" | "standby"
export type InvalidationKind = "stop" | "regime" | "structure"
export type FlipDirection = "to_long" | "to_short" | "to_wait"
export type EventWindowState = "none" | "pre" | "blackout" | "releasing" | "post"
export type FirstMoveGate = "pending" | "confirmed" | "failed"
export type HoldTF = "15m" | "1h" | "4h" | "1d"

export interface CallInvalidation {
  level: number
  kind: InvalidationKind
  reason: string
}

export interface CallFlip {
  text: string
  factor: string
  distance: number
  direction: FlipDirection
}

export interface ExpectedHold {
  medianMin: number
  p25Min: number
  p75Min: number
  n: number
  tf: HoldTF
}

export interface CallBlocks {
  trend: number
  timing: number
  flow: number
}
/** PR 26: block votes (-1 / 0 / +1) and the weighted vote agreement (-1..1) behind call.blocks. */
export interface CallBlockVotes {
  trend: -1 | 0 | 1
  timing: -1 | 0 | 1
  flow: -1 | 0 | 1
  agreement: number
}


// Wire shape is EventWindowInfo (be-macro); this alias keeps the F1.1 name used by the verdict UI.
export type EventWindow = EventWindowInfo

export interface SizingPart {
  key: string
  mult: number
  reason: string
}

// Wire shape is SizingInfo (be-macro): { base, parts: [{label, mult}], total }.
export type CallSizing = SizingInfo

export interface MacroCoupling {
  corr30d: number
  mult: number
}

// Response shapes for /api/signals, /api/signals/market-map and /api/signals/history.
// recommendation.ts imports these through dashboard.tsx, which re-exports them.

export interface OilGeoForce {
  category: string
  count: number
  avgScore: number
  avgReactionPct: number | null
  topHeadline: string
  weightedTotal: number
  weightShare: number
}

export interface OilGeo {
  score: number
  label: string
  eventCount: number
  lastUpdated: string
  events: {
    title: string
    source: string
    publishedAt: string
    category: string
    sentiment: "bullish" | "bearish" | "neutral"
    impact: "high" | "medium" | "low"
    score: number
    url: string
    priceReaction: { eventPrice: number; sinceEventPct: number; confirms: boolean | null } | null
    // F2.9 (be-catalyst): decayed weight used in the net, the confirms vote hoisted to the row, and whether the row
    // counts at all (false for GENERAL price-reporting headlines). Absent on older payloads -> glyph "-" and no weight.
    w?: number
    confirms?: boolean | null
    inNet?: boolean
  }[]
  categoryBreakdown: { category: string; count: number; avgScore: number; avgReactionPct: number | null }[]
  priceContext: { current: number; change24h: number; changePct24h: number; weekHigh: number; weekLow: number } | null
  verdict: {
    bullForce: OilGeoForce | null
    bearForce: OilGeoForce | null
    netLean: "bullish" | "bearish" | "neutral"
    priceFollowing: string | null
    summary: string
    flipCondition: string
    netBasis: string
  } | null
  sourcesUsed: string[]
  asset: string
  assetName: string
  panelTitle: string
  regime: "calm" | "elevated" | "extreme" | "whipsaw"
  nextScheduled: { name: string; time: string; impact: "high" | "medium" | "low" } | null
}

// Order flow (OKX sample). Mirrors LiquidationSummary / OrderBookSummary in lib/signals/orderflow.ts.
export type LiqSide = "long" | "short"
export interface LiqEventInfo { ts: number; side: LiqSide; price: number; usd: number }
export interface LiqBucketInfo { longUsd: number; shortUsd: number; longN: number; shortN: number }
export interface LiquidationInfo {
  longLiqs24h: number | null
  shortLiqs24h: number | null
  venue: "OKX"
  windowHours: number
  truncated: boolean
  h1: LiqBucketInfo
  h4: LiqBucketInfo
  window: LiqBucketInfo
  largest: LiqEventInfo | null
  clusters: { price: number; usd: number; side: LiqSide; longUsd: number; shortUsd: number; distancePct: number }[]
  tape: LiqEventInfo[]
  dominant: LiqSide | null
  longPct: number | null
  read: string
}
export interface WallInfo { price: number; usd: number; distancePct: number; share: number; strength: number }
export interface OrderBookInfo {
  venue: "OKX" | "Hyperliquid"
  mid: number
  spreadPct: number
  coveragePct: number
  depth: { band: number; bidUsd: number; askUsd: number; imbalance: number }[]
  bidWalls: WallInfo[]
  askWalls: WallInfo[]
  read: string
}

// Cloud / 200MA / ADX regime factor (engine 2026.10.12-regime). Top-level and nullable so cached
// pre-regime responses never crash the UI.
export type RegimeTF = "15m" | "4h" | "1d"
export type TrendStrength = "none" | "weak" | "emerging" | "strong" | "extreme"
export interface RegimeTFInfo {
  score: number
  cloud: "above" | "inside" | "below"
  cloudColor: "bullish" | "bearish" | "flat"
  cloudThin: boolean
  tkCross: "bullish" | "bearish" | "none"
  tkCrossBarsAgo: number
  tkState: "bullish" | "bearish" | "flat"
  kumoTwist: "bullish" | "bearish" | "none"
  chikou: "above" | "below" | "at"
  tenkan: number
  kijun: number
  cloudTop: number
  cloudBottom: number
  sma200: number | null
  ema200: number | null
  ma200Side: "above" | "below" | "at" | null
  ma200DistAtr: number | null
  ma200Slope: "rising" | "falling" | "flat" | null
  freshCross: "bullish" | "bearish" | null
  barsSinceCross: number | null
  goldenCross: "golden" | "death" | null
  adx: number
  plusDI: number
  minusDI: number
  adxSlope: "rising" | "falling" | "flat"
  diBias: "bullish" | "bearish" | "flat"
  trendStrength: TrendStrength
}
export interface RegimeInfo {
  score: number
  label: "Bull regime" | "Bear regime" | "Transition" | "Mixed"
  trendStrength: TrendStrength
  gate: "none" | "blocked_long" | "blocked_short" | "counter_trend"
  perTF: Partial<Record<RegimeTF, RegimeTFInfo>>
  notes: string[]
  /** Phase 3.3: rolling 30d BTC/SPX correlation and the macro-weight multiplier (crypto only; null otherwise). */
  macroCoupling?: { corr30d: number; mult: number; /** Optional rolling 30-point corr30d history for the sparkline (F2.8); no producer yet. */ series?: number[] | null } | null
}

/** Phase 3.2 universal event gate state on the verdict. null when no relevant release is near. */
export interface EventWindowInfo {
  state: "pre" | "blackout" | "releasing" | "post"
  event: { id: string; title: string; time: string; importance: "low" | "medium" | "high" | "critical" } | null
  /** Minutes until this state ends (to the release for pre/blackout, to the window end for post). */
  minutesLeft: number
  /** Signed minutes since the release (negative before it). */
  minutesSince: number | null
  sizeMult: number
  stopMult: number
  firstMoveGate: "pending" | "confirmed" | "unconfirmed" | null
  firstMovePct: number | null
  note: string | null
}

/** Phase 3.2 size decomposition: headline regime and counter-trend combine by min, the event window multiplies on top. */
export interface SizingInfo {
  base: number
  parts: { label: string; mult: number }[]
  total: number
}

export interface SignalsResponse {
  // Added by the 2026-10 engine: scoring version and whether the entry is a market or resting limit order.
  engineVersion?: string
  entryType?: "market" | "limit" | null
  timestamp: number
  asset: string
  assetLabel: string
  price: {
    mark: number
    last: number
    high24h: number
    low24h: number
    change24h: number
  }
  indicators: {
    rsi: number
    rsi5m: number | null
    stochRsi: { k: number; d: number }
    ema9: number
    ema21: number
    ema50: number
    ema200: number | null
    sma50: number | null
    sma200: number | null
    macd: { value: number; signal: number; histogram: number }
    adx: number
    atr: number
    bb: { upper: number; middle: number; lower: number; width: number }
    regime: string
    trendDirection: string
    supertrend: number
  }
  htf: {
    rsi1h: number
    trend1h: string
    rsi4h: number
    trend4h: string
    rsiDaily: number | null
    trendDaily: string | null
  }
  levels: {
    supports: number[]
    resistances: number[]
    fibonacci: { level: string; price: number }[]
    dailyHigh: number | null
    dailyLow: number | null
    weeklyHigh: number | null
    weeklyLow: number | null
  }
  volume: {
    current: number
    average: number
    ratio: number
    trend: string
    cvd: number
    ema20: number
    spikeRatio: number
    spikeLabel: string
    absorption: { detected: boolean; direction: "bullish" | "bearish" | null; strength: number } | null
  }
  market: {
    fearGreed: { value: number; classification: string } | null
    btcDominance: number | null
    openInterest: number | null
    fundingRate: number | null
    deribitFunding8h: number | null
    putCallRatio: number | null
    hashRate: number | null
    etfFlow: { net: number; description: string } | null
    liquidations: LiquidationInfo | null
  }
  orderBook?: OrderBookInfo | null
  regime?: RegimeInfo | null
  divergences: {
    rsiDivergence15m: string | null
    rsiDivergence1h: string | null
    macdDivergence: string | null
    volumeDivergence: string | null
  }
  patterns: {
    candlestick: string | null
    squeeze: string | null
  }
  call: {
    bias: "LONG" | "SHORT" | "WAIT"
    confidence: number
    grade: string
    regime: string
    entry: number
    secondaryEntry: number | null
    stopLoss: number
    secondaryStopLoss: number | null
    tp1: number
    tp2: number
    tp3: number
    extendedTarget: number | null
    riskReward: number
    reasoning: string[]
    bullCase: string[]
    bearCase: string[]
    confirms: string[]
    invalidates: string[]
    catalystRisk: string | null
    signalFactors: { category: string; assessment: string; weight: number }[]
    geoOverride?: string | null
    sizeMultiplier?: number
    stopMultiplier?: number
    // Optional: how the engine suggests entering. Absent on older engine builds.
    entryType?: "market" | "limit" | null
    // Measurement layer (2026-10-13, be-measure). All optional; every consumer renders a fallback when absent.
    /** Raw component votes and in-play weights; absent on older engine builds. */
    components?: Record<string, { score: number; weight: number }>
    gateNotes?: string[]
    /** 50 + |weightedScore| / 2 before haircuts (tooltip only). */
    confidenceRaw?: number
    /** Calibrated P(TP1), only when >= 100 decided calls exist on the current engine version; else null. */
    pTp1?: number | null
    pTp1Ci?: [number, number] | null
    calibrationVersion?: string | null
    /** Set on WAIT states when the declined lean was logged as a shadow record (design F2.10 line); null otherwise. */
    shadowClass?: "wait_lean" | "htf_blocked_short" | "regime_blocked" | "event_gated" | null
    /** Phase 3.2 event-window state; absent on older engine builds, null when no release is near. */
    eventWindow?: EventWindowInfo | null
    /** Phase 3.2 size decomposition; absent on older engine builds. */
    sizing?: SizingInfo | null
    // ── Verdict v2 (F1.1) extras from ui-structure; all optional with UI fallbacks. ──
    /** Stop plus structural reason. Fallback: `invalidates[0]`. */
    invalidation?: CallInvalidation | null
    /** Two smallest flip distances. Fallback: reco.confirmation / reco.butWatch. */
    flips?: CallFlip[] | null
    /** Hold-time bucket (symbol x bias x regime). Fallback: `expectedDuration` string labelled "estimate". */
    expectedHold?: ExpectedHold | null
    horizonMin?: number | null
    /** Strategy family chosen by regime and ADX. Chip hidden when null. */
    mode?: CallMode | null
    /** One-line reason for `mode` (be-strategy); tooltip only. */
    modeReason?: string | null
    /** Timeframe whose trend-system component carries the largest |score| (be-strategy). */
    dominantTf?: HoldTF | null
    /** TREND / TIMING / FLOW block scores, -100..100. Header tally shown when null. */
    blocks?: CallBlocks | null
    /** PR 26: block votes and agreement; decides the call only when blockDetail.mode is "vote" or "sum". */
    blockVotes?: CallBlockVotes | null
    /** PR 26: combiner read and the members / notes / gate behind each block (Models tab, audit). */
    blockDetail?: {
      mode: "off" | "vote" | "sum"
      composite: number
      agreeing: number
      magnitude: number
      trend: { members: { name: string; score: number; weight: number; note?: string }[]; notes: string[]; gate: string | null }
      timing: { members: { name: string; score: number; weight: number; note?: string }[]; notes: string[]; gate: string | null }
      flow: { members: { name: string; score: number; weight: number; note?: string }[]; notes: string[]; gate: string | null }
    } | null
    /** Stop anchor label ("4h swing", "1h swing", "AVWAP"). Shown on the STOP tile when present. */
    stopAnchor?: string | null
  }
  /** Feed names that were down at call time (engine audit 4.8). Empty or absent means all feeds were up. */
  degraded?: string[]
  /** Phase 4 features (F2). Absent on older engine builds. */
  features?: SignalFeatures | null
  anticipatory: {
    approachingLevels: Array<{
      level: number
      type: "support" | "resistance" | "fib" | "order_block"
      distance: number
      tier: "IMMINENT" | "APPROACHING" | "WATCHLIST"
      velocity: number
      estimatedCandles: number | null
      fibLevel?: string
    }>
    retestSetup: {
      active: boolean
      level: number | null
      state: "BREAKOUT_DETECTED" | "PULLBACK_IN_PROGRESS" | "RETEST_ZONE" | null
      direction: "long" | "short" | null
      volumeConfirms: boolean
      rsiResetting: boolean
    }
    structureSignals: Array<{
      type: "BOS_FORMING" | "CHOCH_FORMING" | "LIQUIDITY_SWEEP"
      direction: "bullish" | "bearish"
      referenceLevel: number
      distanceToTrigger: number
    }>
    confluence: {
      score: number
      status: "SETUP_IMMINENT" | "SETUP_FORMING" | "NO_SETUP"
      convergingIndicators: Array<{
        name: string
        detail: string
        weight: number
      }>
    }
    orderFlow: {
      cvdDivergenceForming: { detected: boolean; direction: "bullish" | "bearish" | null }
      fundingInflection: boolean
      absorptionSequence: number
      oiPriceDivergence: string | null
    }
    projections: Array<{
      indicator: string
      trigger: string
      estimatedCandles: number
      direction: "bullish" | "bearish"
    }>
    overallReadiness: "SETUP_READY" | "SETUP_FORMING" | "NO_SETUP"
    actionableIn: string
  } | null
  timeframeOutlook: {
    short: { label: string; timeframes: string[]; biases: Array<{ timeframe: string; bias: "LONG" | "SHORT" | "NEUTRAL"; confidence: number; trend: string; rsi: number; emaAlignment: string; momentum: string; keyLevel: string | null; entry: number | null; stopLoss: number | null; tp1: number | null; tp2: number | null; riskReward: number | null }>; consensus: "LONG" | "SHORT" | "NEUTRAL"; strength: number }
    medium: { label: string; timeframes: string[]; biases: Array<{ timeframe: string; bias: "LONG" | "SHORT" | "NEUTRAL"; confidence: number; trend: string; rsi: number; emaAlignment: string; momentum: string; keyLevel: string | null; entry: number | null; stopLoss: number | null; tp1: number | null; tp2: number | null; riskReward: number | null }>; consensus: "LONG" | "SHORT" | "NEUTRAL"; strength: number }
    long: { label: string; timeframes: string[]; biases: Array<{ timeframe: string; bias: "LONG" | "SHORT" | "NEUTRAL"; confidence: number; trend: string; rsi: number; emaAlignment: string; momentum: string; keyLevel: string | null; entry: number | null; stopLoss: number | null; tp1: number | null; tp2: number | null; riskReward: number | null }>; consensus: "LONG" | "SHORT" | "NEUTRAL"; strength: number }
    alignment: {
      allAligned: boolean
      direction: "LONG" | "SHORT" | "NEUTRAL"
      alignedCount: number
      totalCount: number
      tradeType: "ULTIMATE" | "POSITION" | "SWING" | "SCALP" | "CONFLICTED"
      description: string
    }
  } | null
  activeSetups: Array<{
    horizon: string
    horizonLabel: string
    timeframes: string
    bias: "LONG" | "SHORT" | "NEUTRAL"
    entry: number
    stopLoss: number
    tp1: number
    tp2: number
    tp3: number
    riskReward: number
    basedOn: string
    confidence: number
    expectedDuration: string
    /** When this direction first appeared for the horizon; resets on flip or when the setup drops out. */
    calledAt?: number
    /** Entry price when the call was first published. */
    calledEntry?: number
  }>
  setupAlignment: {
    allAligned: boolean
    direction: "LONG" | "SHORT" | "NEUTRAL"
    alignedCount: number
    totalCount: number
    tradeType: "ULTIMATE" | "POSITION" | "SWING" | "SCALP" | "CONFLICTED"
    description: string
  } | null
  newsSentiment?: {
    score: number
    label: string
    headlines: { title: string; sentiment: string }[]
  } | null
  oilGeopolitical?: OilGeo | null
  macroEvent?: {
    asset: "BTC" | "GOLD" | "WTI"
    scores: MacroScores
    preEventRisk: { title: string; time: string; minutes: number; importance: string } | null
    active: {
      id: string
      title: string
      time: string
      phase: string
      secondsToRelease: number
      releaseStatus: string | null
      surpriseLabel: string | null
      impact: AssetImpact | null
      confirmation: { status: string; pct: number | null; note: string } | null
    } | null
  } | null
  oilForecast?: {
    horizonHours: number
    scenarios: {
      name: string
      direction: "LONG" | "SHORT"
      trigger: string
      target: number
      stopRef: number
      probability: number
      rr: number
    }[]
    sizeMultiplier: number
    stopMultiplier: number
    note: string
  } | null
  positioning?: {
    longShortRatio: number | null
    longShortChange: number | null
    topTraderLongRatio: number | null
    openInterestChange: number | null
    takerBuySellRatio: number | null
    binanceOI: number | null
    okxOI: number | null
    squeezeRisk: string | null
  } | null
  events?: { name: string; time: string; impact: string; currency: string }[]
  candles: { time: number; open: number; high: number; low: number; close: number }[]
}

// Market Map types
export interface MarketMapResponse {
  ema5Disconnect: {
    price: number
    ema5: number
    deviation: number
    deviationATR: number
    side: "above" | "below" | "at"
    isDisconnected: boolean
    daysSinceReconnect: number
    reconnectWindow: { total: number; pct3day: number; pct5day: number; pct7day: number }
    signal: { direction: "long" | "short"; reason: string; targetPrice: number } | null
  } | null
  ema5xSma200: {
    ema5: number
    sma200: number
    smaPeriod: number
    price: number
    isAbove: boolean
    freshCross: boolean
    crossType: "bullish" | "bearish" | null
    daysSinceCross: number
    ema5Slope: number
    sma200Slope: number
    totalCrossovers: number
    recentCrossovers: { type: "bullish" | "bearish"; fwdReturn5: number | null; fwdReturn10: number | null }[]
  } | null
  rsiStructure: {
    daily: {
      currentRSI: number
      rsiTrend: "bullish" | "bearish" | "neutral"
      swingHighs: { value: number; barsAgo: number }[]
      swingLows: { value: number; barsAgo: number }[]
      consecutiveHH: number; consecutiveHL: number
      consecutiveLH: number; consecutiveLL: number
      pullbacksHoldAbove50: boolean
      ralliesFailBelow50: boolean
      trendline: {
        support: { slope: number; projected: number } | null
        resistance: { slope: number; projected: number } | null
        breakDetected: boolean
        breakType: "support_break" | "resistance_break" | null
      } | null
      divergence: { type: "bullish" | "bearish" | null; description: string | null }
    } | null
    h4: { currentRSI: number; rsiTrend: string } | null
    h1: { currentRSI: number; rsiTrend: string } | null
  }
  ema21Bounce: {
    price: number
    ema21: number
    distancePct: number
    distanceATR: number
    isAbove: boolean
    slopeRising: boolean
    recentBounce: boolean
    bounceType: "support_bounce" | "resistance_bounce" | null
    bounceBar: number | null
    invalidation: boolean
    invalidationType: "bullish_invalidated" | "bearish_invalidated" | null
    bounceSuccessRate: number | null
    bounceSampleSize: number
  } | null
  bounceProbabilities: {
    currentPrice: number
    rsiZone: string
    ema5Side: string
    sma200Side: string | null
    windows: Record<string, {
      all: { sampleSize: number; positivePct: number; avgReturn: number; medianReturn: number } | null
      conditioned: { sampleSize: number; positivePct: number; avgReturn: number; medianReturn: number } | null
    }>
  } | null
  rsiAlignment: {
    aligned: boolean
    direction: "bullish" | "bearish" | null
    details: { rsi1h: number | null; rsi4h: number | null; rsi1d: number | null; conflict?: string }
  } | null
  signal: {
    bias: "LONG" | "SHORT" | "WAIT"
    conviction: number
    grade: "A+" | "A" | "B" | "C" | "NO TRADE"
    rawScore: number
    factors: { module: string; score: number; weight: number; note: string }[]
    reasoning: string[]
    activeSignals: number
    totalModules: number
  }
  generatedAt: string
}

export interface HotPlay {
  symbol: string
  label: string
  color: string
  price: number
  change24h: number
  bias: "LONG" | "SHORT" | "WAIT"
  confidence: number
  grade: string
  entry: number
  stopLoss: number
  tp1: number
  riskReward: number
  regime: string
  reasoning: string[]
  volSpikeRatio: number | null
  volSpikeLabel: string | null
  regimeLabel?: RegimeInfo["label"] | null
  regimeScore?: number | null
  trendStrength?: TrendStrength | null
  cloud1d?: RegimeTFInfo["cloud"] | null
  ma200Side1d?: RegimeTFInfo["ma200Side"] | null
  adx15m?: number | null
}

export interface HotResponse {
  timestamp: number
  hot: HotPlay[]
  all: HotPlay[]
}

export interface SignalLog {
  id: string
  symbol: string
  timestamp: number
  bias: "LONG" | "SHORT"
  confidence: number
  grade: string
  entry: number
  stopLoss: number
  tp1: number
  tp2: number
  tp3: number
  priceAtSignal: number
  outcome: "pending" | "tp1" | "tp2" | "tp3" | "stopped" | "expired"
  outcomePrice: number | null
  outcomeTimestamp: number | null
  maxFavorable: number | null
  maxAdverse: number | null
}

export interface CalibrationBucket {
  n: number
  wins: number
  losses: number
  tp1Rate: number
  winRate: number
  avgR: number | null
}

export interface HistoryResponse {
  signals: SignalLog[]
  stats: {
    total: number
    wins: number
    losses: number
    pending: number
    expired: number
    winRate: number
    avgConfidence: number
    avgRR: number
    profitFactor: number
    bySymbol: Record<string, { total: number; wins: number; losses: number; winRate: number }>
    byGradeSymbol?: Record<string, Record<string, CalibrationBucket>>
    oilByRegime?: Record<string, CalibrationBucket>
    byBias?: Record<"LONG" | "SHORT", CalibrationBucket & { total: number; pending: number }>
  }
}

// ---------------------------------------------------------------------------
// Performance page v2 (design-ux-ui.md F4.1). Every field is optional so the page
// renders against today's API and lights up as the measurement PRs land.
// Rates are percent (0-100) like the existing tp1Rate; Brier terms are raw.
// ---------------------------------------------------------------------------

export interface PerfCostModel {
  venue: string
  takerBps: number
  makerBps: number
  slipBps: number
  fundingApplied: boolean
}

export interface PerfKpisV2 {
  expectancyNetR?: number | null
  profitFactorNet?: number | null
  sumNetR?: number | null
  costModel?: PerfCostModel | null
  maxDrawdownR?: number | null
  maxDrawdownNetR?: number | null
  longestUnderwaterDays?: number | null
  /** SD(R) / sqrt(n) */
  seExpectancyR?: number | null
  fillRate?: { market: number | null; limit: number | null; nMarket: number; nLimit: number } | null
  expiryRate?: number | null
  medianHoldMin?: { winners: number | null; losers: number | null } | null
  /** Share of closed signals beyond +2R, percent. */
  shareAbove2R?: number | null
  holdMin?: Record<"all" | "winners" | "losers", { n: number; p25: number | null; median: number | null; p75: number | null }> | null
}

export interface PerfRHistogramBin {
  bin: string
  n: number
  netN: number
}

export interface PerfCalBucket {
  key: string
  n: number
  wins: number
  losses: number
  tp1Rate: number | null
  expectancyR: number | null
  meanConf?: number | null
  wilsonLo?: number | null
  wilsonHi?: number | null
  pPos?: number | null
  meanNetR?: number | null
  brierNaive?: number | null
  brierCal?: number | null
}

export interface PerfBrier {
  naive: number | null
  calibrated: number | null
  base: number | null
  bss: number | null
  bssCalibrated: number | null
  reliability: number | null
  resolution: number | null
  uncertainty: number | null
  n: number
}

export interface PerfPlatt {
  a: number
  b: number
  n: number
  holdoutBrier: number
  fitAt: string
  version: string
}

export interface PerfCalibrationV2 {
  byConfidence?: PerfCalBucket[]
  byGrade?: PerfCalBucket[]
  byRr1?: PerfCalBucket[]
  byPTp1?: PerfCalBucket[]
  brier?: PerfBrier | null
  platt?: PerfPlatt | null
}

/** be-measure PR 12. pWin* and lift* are FRACTIONS 0..1 (Newcombe 95% on lift); weight is the mean in-play weight. */
export interface PerfComponentRow {
  name: string
  nAgree: number
  nDisagree: number
  pWinAgree: number | null
  pWinDisagree: number | null
  lift: number | null
  liftLo: number | null
  liftHi: number | null
  weight: number
  candidateWeight: number | null
}

export type PerfShadowClass = "wait_lean" | "htf_blocked_short" | "regime_blocked" | "event_gated"
export interface PerfShadowRow {
  key: PerfShadowClass
  /** decided count */
  n: number
  tp1Rate: number | null
  wilsonLo: number | null
  wilsonHi: number | null
  expectancyR: number | null
  expectancyNetR?: number | null
  openN?: number
}

export interface PerfVersionRow {
  version: string
  firstAt: number
  lastAt: number
  n: number
  netR: number | null
}

export interface PerfLedger {
  /** ?format=raw: the exact bytes the hash covers */
  url: string
  csvUrl: string
  sha256: string
  hashedAt: string
  bytes: number
  count?: number
}

export interface PerfChangelogEntry {
  at: string
  commit: string
  title: string
  effect: string
}

/** Optional additions to PerformanceStats (F4.1). Intersected with the server type in PerformanceDashboard. */
export interface PerformanceStatsV2 {
  kpis: PerfKpisV2
  rHistogram?: PerfRHistogramBin[]
  calibration: PerfCalibrationV2
  components?: PerfComponentRow[]
  shadow?: { byClass: PerfShadowRow[]; note: string } | null
  versions?: PerfVersionRow[]
  ledger?: PerfLedger | null
  changelog?: PerfChangelogEntry[]
  breakdowns?: { byEntryType?: PerfBucketLike[]; byRr1?: PerfBucketLike[]; byAtrPct?: PerfBucketLike[] }
  meta: {
    /** Current engine version and when it started, for the provisional banner. */
    engineVersion?: string | null
    engineVersionSince?: number | null
    /** Decided signals on the current engine version: the calibration-gate counter toward 100. */
    decidedNCurrentVersion?: number | null
    /** Shadow (declined) rows logged; never in any public number. */
    shadowN?: number | null
  }
}

export interface PerfBucketLike {
  key: string
  n: number
  tp1Rate: number | null
  expectancyR: number | null
  wins: number
  losses: number
}

/** Optional per-row additions on NormalizedSignal (be-measure PR 04 names). realizedR stays gross. */
export interface SignalRowV2 {
  entryType?: "market" | "limit" | null
  fillPrice?: number | null
  costR?: number | null
  /** true = legacy close, cost estimated without funding */
  costEstimated?: boolean
  realizedNetR?: number | null
  shadow?: boolean
  shadowClass?: string | null
  coverageGap?: boolean
  /** Plain-language resolution sentence (PR 13). */
  reasonText?: string | null
  /** Calibrated P(TP1) as a FRACTION 0..1 (PR 17). */
  pTp1?: number | null
  // Call-time inputs logged on the row (PR 05); the audit drawer uses them when the audit endpoint is absent.
  weightedScore?: number | null
  confidenceRaw?: number | null
  rr1?: number | null
  atrPct?: number | null
  calibrationVersion?: string | null
  components?: Record<string, { score: number; weight: number }> | null
  minutesToNextEvent?: number | null
}

/** Optional additions on open rows. */
export interface OpenSignalV2 {
  /** ms epoch when the fill window closes (pending fills). */
  fillWindowEndsAt?: number | null
  /** ms epoch of the last candle the checker evaluated. */
  lastCheckAt?: number | null
  checkerStalled?: boolean
}

/** GET /api/signals/history/:id (be-measure PR 13). Times are epoch ms UTC; every scalar nullable. */
export interface AuditRecord {
  signal: Record<string, unknown>
  row?: Record<string, unknown>
  inputs: {
    weightedScore?: number | null
    confidenceRaw?: number | null
    components?: Record<string, { score: number; weight: number }>
    rr1?: number | null
    rr2?: number | null
    rr3?: number | null
    entryType?: "market" | "limit" | null
    atrPct?: number | null
    fundingRate?: number | null
    minutesToNextEvent?: number | null
    tuning?: Record<string, unknown> | null
    gateNotes?: string[] | null
    engineVersion?: string | null
    calibrationVersion?: string | null
    pTp1?: number | null
    regime?: string | null
    regimeGate?: string | null
    markAtSignal?: number | null
    lastAtSignal?: number | null
    candleCloseTime?: number | null
    factors?: Record<string, string> | null
    blocks?: Record<string, number> | null
    mode?: string | null
    eventWindow?: Record<string, unknown> | null
  } | null
  resolution: {
    firstEligibleCandle?: number | null
    fillWindowEnd?: number | null
    fillCandle?: number | null
    fillPrice?: number | null
    tpTouches?: { level: 1 | 2 | 3; at: number; price: number }[]
    stopTouch?: { at: number; price: number; afterTp?: number | null } | null
    horizonEnd?: number | null
    closedAt?: number | null
    closedReason?: string | null
    grossR?: number | null
    netR?: number | null
    costR?: number | null
    costEstimated?: boolean | null
    coverageGap?: boolean | { from: number; to: number; detectedAt?: number | null } | null
    lastCheckedAt?: number | null
    mfeR?: number | null
    maeR?: number | null
    reasonText?: string | null
  } | null
}

/** Optional additions on equity points: the net-of-cost cumulative curve. */
export interface PerfEquityPointV2 {
  cumNetR?: number | null
}
