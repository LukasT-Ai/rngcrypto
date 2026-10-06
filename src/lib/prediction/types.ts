import type { MacroAsset } from "../macro/types";

// Shared contract for prediction-market adapters (Kalshi, Polymarket). Adapters return normalized PMMarket[]
// and never throw: on any network/parse failure they return [] (or the last cached list).

export type PMVenue = "kalshi" | "polymarket";

// What the market is about. Used to attach odds to macro events (fed_decision -> fed_funds/fomc_*,
// cpi -> cpi_*, nfp -> nfp, unemployment -> unemployment) and to assets (btc_price -> BTC, etc.).
export type PMTopic =
  | "fed_decision" // outcome of a specific FOMC meeting (cut/hold/hike buckets)
  | "fed_cuts_year" // number of cuts in a calendar year
  | "fed_rate_level" // fed funds upper bound at/above/below a level by a date
  | "cpi" // monthly CPI print buckets (m/m or y/y)
  | "nfp" // payrolls print buckets
  | "unemployment" // unemployment rate buckets
  | "recession" // NBER recession by date
  | "btc_price" // BTC above/below strike by date, or "hits X" ladders
  | "eth_price"
  | "gold_price"
  | "oil_price"
  | "other";

export interface PMOutcome {
  // Human label, e.g. "Hold", "Cut 25bps", "Yes", ">= 3.2%", "$150k"
  label: string;
  // Implied probability 0..1 (mid of bid/ask when both exist, else last trade price).
  prob: number;
  // Optional numeric strike/bucket the label represents (basis points for fed, level for prices/prints).
  value?: number | null;
  // Underlying market id for deep-linking individual binary markets inside a multi-outcome event.
  marketId?: string;
  volume?: number | null;
}

export interface PMMarket {
  venue: PMVenue;
  // Venue-native id (Kalshi event_ticker or market ticker; Polymarket event slug or condition id)
  id: string;
  topic: PMTopic;
  title: string;
  url: string;
  // ISO date the market closes/resolves, if known.
  closeTime: string | null;
  // Mutually exclusive outcomes (for a binary market: [{Yes}, {No}]). Probabilities need not sum to exactly 1.
  outcomes: PMOutcome[];
  // USD notional traded (lifetime if 24h not available) and open interest/liquidity when available.
  volume: number | null;
  liquidity: number | null;
  // Mapping hints (adapter fills what it can; service.ts refines):
  // macro taxonomy def id this market informs (e.g. "fed_funds", "cpi_mom", "nfp", "unemployment")
  eventDefId: string | null;
  asset: MacroAsset | null;
  // For price markets: the threshold the market is about, in asset units (USD).
  strike: number | null;
  // For price markets: direction of the Yes outcome relative to strike.
  strikeSide?: "above" | "below" | null;
  // For dated markets (fed meeting, CPI month, price-by-date): the reference date YYYY-MM-DD or YYYY-MM.
  period: string | null;
  retrievedAt: string;
}

export interface PMAdapterResult {
  venue: PMVenue;
  ok: boolean;
  note: string;
  markets: PMMarket[];
  retrievedAt: string;
}
