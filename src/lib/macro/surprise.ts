import type { MacroEventDef, SdSource, SurpriseMagnitude, SurpriseResult, ZAnchor } from "./types";
import { formatValue } from "./taxonomy";
import { blendedAnchor } from "../prediction/conversions";

// Optional market-implied expectation for the print (from a liquid Kalshi ladder, see prediction/conversions.ts).
// `mean` becomes the surprise anchor blended 0.6/0.4 with the consensus; `sd` replaces the SD prior when present.
export interface MarketPrior {
  mean: number | null;
  sd: number | null;
}

export function magnitudeFromZ(z: number | null): SurpriseMagnitude {
  if (z == null) return "inline";
  // Round first so 0.3 / 0.1 (= 2.9999…) buckets as the 3-SD miss it is.
  const a = Math.abs(Math.round(z * 100) / 100);
  if (a < 0.5) return "inline";
  if (a < 1.5) return "small";
  if (a < 3) return "large";
  return "extreme";
}

// Economic surprise −100..+100 (positive = higher than consensus). Saturates smoothly at ~3 SD.
export function scoreFromZ(z: number | null): number | null {
  if (z == null) return null;
  return Math.round(100 * Math.tanh(z / 1.8));
}

export const KIND_WORDS: Record<string, { above: string; below: string }> = {
  inflation: { above: "hotter than expected", below: "cooler than expected" },
  wages: { above: "hotter than expected", below: "softer than expected" },
  growth: { above: "stronger than expected", below: "weaker than expected" },
  labor_strength: { above: "stronger than expected", below: "weaker than expected" },
  labor_weakness: { above: "weaker labor than expected", below: "firmer labor than expected" },
  oil_inventory: { above: "a bigger build than expected", below: "a bigger draw than expected" },
  oil_product_inventory: { above: "a bigger build than expected", below: "a bigger draw than expected" },
  oil_production: { above: "higher than expected", below: "lower than expected" },
  policy_rate: { above: "more hawkish than expected", below: "more dovish than expected" },
  sentiment: { above: "stronger than expected", below: "weaker than expected" },
  housing: { above: "stronger than expected", below: "weaker than expected" },
  foreign_cb: { above: "more hawkish than expected", below: "more dovish than expected" },
  trade: { above: "a narrower deficit than expected", below: "a wider deficit than expected" },
  fiscal: { above: "larger than expected", below: "smaller than expected" },
  positioning: { above: "more net long than expected", below: "less net long than expected" },
};

export function computeSurprise(
  def: MacroEventDef,
  actual: number | null,
  forecast: number | null,
  previous: number | null,
  sdOverride?: number | null,
  market?: MarketPrior | null
): SurpriseResult {
  const unit = def.unit;
  // Anchor priority: blended market/consensus, market alone, consensus, then the previous print.
  const mk = blendedAnchor(market?.mean ?? null, forecast);
  // No consensus (and no market) but a previous print: judge the change versus previous with a wider band (a move
  // versus the prior print is noisier than a miss versus consensus), and say so in the label.
  const vsPrev = mk == null && actual != null && previous != null;
  const anchor = mk?.anchor ?? (vsPrev ? previous : null);
  const zAnchor: ZAnchor | null = mk?.source ?? (vsPrev ? "previous" : null);
  if (actual == null || anchor == null) {
    return {
      delta: null,
      unit,
      zScore: null,
      anchor: null,
      zAnchor: null,
      sdSource: null,
      score: null,
      magnitude: "inline",
      label: actual == null ? "Awaiting actual" : "No consensus available",
      vsPrevious: actual != null && previous != null ? round(actual - previous, 3) : null,
    };
  }
  const marketSd = market?.sd != null && market.sd > 0 ? market.sd : null;
  const baseSd = marketSd ?? sdOverride ?? def.typicalSurpriseSD;
  const sdSource: SdSource | null = baseSd == null ? null : marketSd != null ? "market" : sdOverride != null ? "rolling" : "prior";
  const sd = baseSd != null && vsPrev ? baseSd * 1.5 : baseSd;
  const delta = round(actual - anchor, 4);
  const z = sd && sd > 0 ? delta / sd : null;
  const magnitude = magnitudeFromZ(z);
  const words = KIND_WORDS[def.kind] ?? { above: "above expectations", below: "below expectations" };
  const qualifier = magnitude === "extreme" ? "Dramatically " : magnitude === "large" ? "Significantly " : magnitude === "small" ? "Slightly " : "";
  const direction = delta > 0 ? words.above : words.below;
  // Without a consensus the comparison is week-over-week, so the words must say "last print", not "expected".
  const phrase = vsPrev ? direction.replace(/than expected/, "than the prior print").replace(/expectations/, "the prior print") : direction;
  const label = magnitude === "inline" ? (vsPrev ? "Little changed from the prior print" : "In line with expectations") : `${qualifier}${phrase}`;
  const anchorWord = zAnchor === "blended" ? "market-blended consensus" : zAnchor === "market" ? "market-implied mean" : "consensus";
  const detail = vsPrev
    ? `${formatValue(actual, unit, def.decimals)} vs ${formatValue(anchor, unit, def.decimals)} prior; no consensus published`
    : `${delta > 0 ? "+" : ""}${formatValue(delta, unit, def.decimals)} vs ${anchorWord}`;
  return {
    delta,
    unit,
    zScore: z == null ? null : round(z, 2),
    anchor: round(anchor, 4),
    zAnchor,
    sdSource,
    score: scoreFromZ(z),
    magnitude,
    label: `${label} (${detail})`,
    vsPrevious: previous != null ? round(actual - previous, 4) : null,
  };
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
