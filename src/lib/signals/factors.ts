/**
 * Canonical signal-factor category names.
 *
 * The engine (src/lib/signals/engine.ts) emits `call.signalFactors[].category` using these strings and the
 * dashboard recommendation builder (src/app/signals/recommendation.ts) switches on them. Both MUST import
 * from here; a typo on either side silently drops a factor from the "because" list.
 */
export const FACTOR = {
  MARKET_STRUCTURE: "Market Structure",
  MOMENTUM: "Momentum",
  VOLUME: "Volume",
  DERIVATIVES: "Derivatives",
  HTF: "HTF Confirmation",
  BOLLINGER: "Bollinger/Volatility",
  DIVERGENCES: "Divergences",
  TREND_SYSTEM: "Trend System",
  ELLIOTT: "Elliott Wave",
  SENTIMENT: "Sentiment",
  MARKET_DATA: "Market Data",
  ETF_FLOWS: "ETF Flows",
  LIQUIDATION: "Liquidation/Positioning",
  GEOPOLITICAL: "Geopolitical",
  CATALYSTS: "Catalysts",
  MACRO: "Macro",
  EVENT: "Event",
  MARKET_CONFIRMATION: "Market Confirmation",
  PATTERNS: "Patterns",
  CATALYST_RISK: "Catalyst Risk",
} as const;

export type FactorCategory = (typeof FACTOR)[keyof typeof FACTOR];
