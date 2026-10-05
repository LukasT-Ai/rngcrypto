import type { Confidence, MacroRegime } from "./types";

export interface RegimeInputs {
  us2y: number | null;
  us10y: number | null;
  us2yChg5d: number | null;
  dxy: number | null;
  dxyChg5d: number | null;
  vix: number | null;
  spxChg5d: number | null;
  cpiYoY: number | null;
}

// Heuristic regime read from observable market state. Documented thresholds, no hidden ML.
export function classifyRegime(i: RegimeInputs, asOf = new Date().toISOString()): MacroRegime {
  let present = 0;
  for (const v of Object.values(i)) if (v != null) present++;

  const inflationFocus: MacroRegime["inflationFocus"] =
    i.cpiYoY == null ? "normal" : i.cpiYoY >= 3.5 ? "high" : i.cpiYoY <= 2.3 ? "low" : "normal";

  // Front-end yields rising with a firm dollar = market pricing tighter policy; falling = easing.
  let policyBias: MacroRegime["policyBias"] = "hold";
  if (i.us2yChg5d != null) {
    if (i.us2yChg5d >= 0.12) policyBias = "tightening";
    else if (i.us2yChg5d <= -0.12) policyBias = "easing";
  }
  if (policyBias === "hold" && i.us2y != null && i.us10y != null && i.us2y - i.us10y > 0.25) policyBias = "tightening";

  let risk: MacroRegime["risk"] = "neutral";
  if (i.vix != null) {
    if (i.vix >= 24 || (i.spxChg5d != null && i.spxChg5d <= -2.5)) risk = "off";
    else if (i.vix <= 17 && (i.spxChg5d ?? 0) >= -0.5) risk = "on";
  }

  const confidence: Confidence = present >= 7 ? "high" : present >= 4 ? "medium" : "low";
  const summary =
    `${inflationFocus === "high" ? "Inflation-focused" : inflationFocus === "low" ? "Low-inflation" : "Balanced-inflation"} regime, ` +
    `${policyBias === "tightening" ? "market leaning hawkish" : policyBias === "easing" ? "market leaning dovish" : "policy on hold"}, ` +
    `risk ${risk === "on" ? "on" : risk === "off" ? "off" : "neutral"}` +
    (i.vix != null ? ` (VIX ${i.vix.toFixed(1)})` : "") +
    ".";

  return { inflationFocus, policyBias, risk, confidence, summary, asOf, inputs: { ...i } };
}
