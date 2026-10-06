import type { Direction, MacroAsset, MacroEventDef, MacroRegime, ScheduledEvent } from "./types";
import { MACRO_ASSETS } from "./types";
import { impactForSurprise } from "./impact";
import { KIND_WORDS, scoreFromZ } from "./surprise";
import { formatValue } from "./taxonomy";

// Scenario guide: for a numeric release, which print ranges read bullish / neutral / bearish for each asset.
// Bands follow the surprise engine exactly: |z| < 0.5 SD is "in line", beyond that the sign decides. The guide is
// built before the release (so a reader knows what to root for) and kept after it, with the actual's band marked.

export type ScenarioBandKey = "below" | "inline" | "above";

export interface ScenarioBand {
  key: ScenarioBandKey;
  // Human range, e.g. "below -0.1M bbl" / "-0.1M to +2.3M bbl" / "above +2.3M bbl".
  range: string;
  // What the print would mean in the release's own vocabulary ("Bigger draw than expected").
  meaning: string;
  directions: Record<MacroAsset, Direction>;
  // True once an actual exists and lands in this band.
  hit: boolean;
}

export interface ScenarioGuide {
  anchor: number;
  anchorKind: "consensus" | "previous";
  sdUsed: number;
  bands: ScenarioBand[];
  note: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildScenarios(
  def: MacroEventDef,
  event: Pick<ScheduledEvent, "forecast" | "previous">,
  regime: MacroRegime,
  actual: number | null,
  sdOverride?: number | null
): ScenarioGuide | null {
  if (def.unit === "text") return null;
  const anchorKind: "consensus" | "previous" | null = event.forecast != null ? "consensus" : event.previous != null ? "previous" : null;
  if (anchorKind == null) return null;
  const anchor = anchorKind === "consensus" ? event.forecast! : event.previous!;
  const baseSd = sdOverride ?? def.typicalSurpriseSD;
  if (baseSd == null || !(baseSd > 0)) return null;
  const sd = anchorKind === "previous" ? baseSd * 1.5 : baseSd;

  const lo = anchor - 0.5 * sd;
  const hi = anchor + 0.5 * sd;
  const fmt = (v: number) => formatValue(Math.round(v * 10 ** def.decimals) / 10 ** def.decimals, def.unit, def.decimals);
  const words = KIND_WORDS[def.kind] ?? { above: "above expectations", below: "below expectations" };
  const vsPrev = anchorKind === "previous";
  const phrase = (w: string) => (vsPrev ? w.replace(/than expected/, "than the prior print").replace(/expectations/, "the prior print") : w);

  const dirs = (z: number): Record<MacroAsset, Direction> => {
    const imp = impactForSurprise(def, scoreFromZ(z), z === 0 ? "inline" : "large", regime);
    return Object.fromEntries(MACRO_ASSETS.map((a) => [a, z === 0 ? "mixed" : imp.find((i) => i.asset === a)?.direction ?? "mixed"])) as Record<MacroAsset, Direction>;
  };

  const bandOf = (v: number): ScenarioBandKey => (v < lo ? "below" : v > hi ? "above" : "inline");
  const hitKey = actual == null ? null : bandOf(actual);

  const bands: ScenarioBand[] = [
    { key: "below", range: `below ${fmt(lo)}`, meaning: cap(phrase(words.below)), directions: dirs(-1.5), hit: hitKey === "below" },
    { key: "inline", range: `${fmt(lo)} to ${fmt(hi)}`, meaning: vsPrev ? "Little changed from the prior print" : "In line with expectations", directions: dirs(0), hit: hitKey === "inline" },
    { key: "above", range: `above ${fmt(hi)}`, meaning: cap(phrase(words.above)), directions: dirs(1.5), hit: hitKey === "above" },
  ];

  const note = vsPrev
    ? `No consensus published, so ranges are set around the prior print (${fmt(anchor)}) with a wider ±${fmt(0.5 * sd).replace(/^\+/, "")} neutral band.`
    : `Ranges are set around the consensus (${fmt(anchor)}); within ±${fmt(0.5 * sd).replace(/^\+/, "")} the market usually treats the print as in line.`;

  return { anchor, anchorKind, sdUsed: Math.round(sd * 1000) / 1000, bands, note };
}
