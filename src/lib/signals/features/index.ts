// Assembles the `features` object from the raw feeds the engine fetched in its parallel batch. Pure given the raw
// inputs (the only clock read is `now`), so it can be unit-tested with recorded fixtures.

import type { OrderBookSummary } from "../orderflow";
import { buildBookFeature } from "./book";
import { buildCvdFeature, readQhImbalance, type CvdRaw } from "./cvd";
import { buildVolFeature, type DvolBar } from "./deribit";
import { buildOiFeature, type OiRaw } from "./oi";
import { buildSessionFeature } from "./session";
import type { BasisFeature, FundingFeature, SignalFeatures, StablecoinFeature } from "./types";
import { buildMacroRatesFeature, type DailyPoint, type MacroRatesSeries } from "@/lib/macro/treasury";

export interface FeatureInputs {
  ccy: string | undefined; // OKX underlying ("BTC"); undefined for non-crypto
  isCrypto: boolean;
  price: number;
  priceChange24hPct: number | null;
  assetDaily: DailyPoint[]; // the symbol's own daily closes (for the macroRates correlation gate)
  funding: FundingFeature | null;
  oi: OiRaw | null;
  cvd: CvdRaw | null;
  orderBook: OrderBookSummary | null;
  dvol: DvolBar[] | null;
  basis: BasisFeature | null;
  macroRates: MacroRatesSeries | null;
  stablecoins: StablecoinFeature | null;
  now?: number;
}

export function buildFeatures(p: FeatureInputs): SignalFeatures {
  const now = p.now ?? Date.now();
  const safe = <T>(fn: () => T | null): T | null => {
    try {
      return fn();
    } catch {
      return null;
    }
  };
  return {
    funding: p.funding,
    oi: safe(() => (p.oi ? buildOiFeature(p.oi.hourly, p.oi.daily, p.priceChange24hPct, now) : null)),
    cvd: safe(() => (p.cvd ? buildCvdFeature(p.cvd.buckets, p.ccy ? readQhImbalance(p.ccy) : null, now) : null)),
    book: safe(() => buildBookFeature(p.orderBook, now)),
    vol: safe(() => (p.dvol ? buildVolFeature(p.dvol, p.price, now) : null)),
    basis: p.basis,
    macroRates: safe(() => buildMacroRatesFeature(p.macroRates, p.assetDaily, now)),
    stablecoins: p.stablecoins,
    session: buildSessionFeature(now, p.isCrypto),
  };
}

export type { SignalFeatures } from "./types";
