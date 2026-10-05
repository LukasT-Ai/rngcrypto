import type { MacroEventDef, SurpriseMagnitude, SurpriseResult } from "./types";
import { formatValue } from "./taxonomy";

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

const KIND_WORDS: Record<string, { above: string; below: string }> = {
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
};

export function computeSurprise(
  def: MacroEventDef,
  actual: number | null,
  forecast: number | null,
  previous: number | null,
  sdOverride?: number | null
): SurpriseResult {
  const unit = def.unit;
  if (actual == null || forecast == null) {
    return {
      delta: null,
      unit,
      zScore: null,
      score: null,
      magnitude: "inline",
      label: actual == null ? "Awaiting actual" : "No consensus available",
      vsPrevious: actual != null && previous != null ? round(actual - previous, 3) : null,
    };
  }
  const sd = sdOverride ?? def.typicalSurpriseSD;
  const delta = round(actual - forecast, 4);
  const z = sd && sd > 0 ? delta / sd : null;
  const magnitude = magnitudeFromZ(z);
  const words = KIND_WORDS[def.kind] ?? { above: "above expectations", below: "below expectations" };
  const qualifier = magnitude === "extreme" ? "Dramatically " : magnitude === "large" ? "Significantly " : magnitude === "small" ? "Slightly " : "";
  const label =
    magnitude === "inline"
      ? "In line with expectations"
      : `${qualifier}${delta > 0 ? words.above : words.below}`;
  return {
    delta,
    unit,
    zScore: z == null ? null : round(z, 2),
    score: scoreFromZ(z),
    magnitude,
    label: `${label} (${delta > 0 ? "+" : ""}${formatValue(delta, unit, def.decimals)} vs consensus)`,
    vsPrevious: previous != null ? round(actual - previous, 4) : null,
  };
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
