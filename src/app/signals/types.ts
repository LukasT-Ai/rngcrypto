import type { AssetImpact, MacroScores } from "@/lib/macro/types"

// Response shapes for /api/signals, /api/signals/market-map and /api/signals/history.
// recommendation.ts imports these through dashboard.tsx, which re-exports them.

export interface OilGeoForce {
  category: string
  count: number
  avgScore: number
  avgReactionPct: number | null
  topHeadline: string
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
  } | null
  sourcesUsed: string[]
  asset: string
  assetName: string
  panelTitle: string
  regime: "calm" | "elevated" | "extreme" | "whipsaw"
  nextScheduled: { name: string; time: string; impact: "high" | "medium" | "low" } | null
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
    liquidations: { longLiqs24h: number | null; shortLiqs24h: number | null } | null
  }
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
    // Optional: how the engine suggests entering. Absent on older engine builds.
    entryType?: "market" | "limit" | null
  }
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
