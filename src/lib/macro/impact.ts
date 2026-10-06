import type { AssetImpact, Confidence, Direction, MacroAsset, MacroEventDef, MacroRegime, SurpriseMagnitude } from "./types";
import { MACRO_ASSETS } from "./types";

// Transmission shocks in [-1, 1]:
//   r = rate-path shock (+ = more hawkish / higher yields / stronger dollar)
//   g = growth shock   (+ = stronger growth)
//   o = oil supply shock (+ = tighter supply)
export interface Transmission {
  r: number;
  g: number;
  o: number;
  channels: string[];
  regimeNotes: string[];
}

const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

export function transmission(def: MacroEventDef, surpriseScore: number | null, regime: MacroRegime, components?: Record<string, number | null>): Transmission {
  const s = surpriseScore == null ? 0 : surpriseScore / 100;
  let r = 0;
  let g = 0;
  let o = 0;
  const notes: string[] = [];

  switch (def.kind) {
    case "inflation":
    case "wages":
      r = s;
      break;
    case "growth":
    case "sentiment":
      g = s;
      r = 0.5 * s;
      break;
    case "labor_strength":
      g = s;
      r = 0.6 * s;
      break;
    case "labor_weakness":
      g = -s;
      r = -0.6 * s;
      break;
    case "policy_rate":
      r = s;
      break;
    case "oil_inventory":
      o = -s;
      break;
    case "oil_product_inventory":
      o = -0.6 * s;
      break;
    case "oil_production":
      o = -0.5 * s;
      break;
    case "fed_communication":
      // Synthetic surprise from the front-end yield reaction: + = hawkish (yields up), - = dovish
      r = s;
      break;
    case "auction":
    case "crypto":
      break;
  }

  // Regime modulation: the same print means different things depending on what the market is worried about.
  if (regime.inflationFocus === "high") {
    if (def.kind === "inflation" || def.kind === "wages") {
      r *= 1.3;
      notes.push("inflation-focused regime amplifies price data");
    }
    if (g !== 0) {
      r += 0.3 * g;
      notes.push("strong growth reads as hawkish while inflation is the focus");
    }
  }
  if (regime.risk === "off" && (def.kind === "growth" || def.kind === "labor_strength" || def.kind === "labor_weakness")) {
    r *= 0.5;
    g *= 1.2;
    notes.push("risk-off regime: growth relief matters more than the rate path");
  }
  if (regime.policyBias === "tightening" && r > 0) {
    r *= 1.2;
    notes.push("hawkish surprises bite harder while the market leans tighter");
  }
  if (regime.policyBias === "easing" && r < 0) {
    r *= 1.2;
    notes.push("dovish surprises extend an easing narrative");
  }

  // EIA report internals can contradict the headline crude number.
  if (components && def.kind === "oil_inventory") {
    let bearishParts = 0;
    let bullishParts = 0;
    const c = components;
    const consider = (v: number | null | undefined, bearishIfPositive: boolean, w: number, label: string) => {
      if (v == null) return;
      const bearish = bearishIfPositive ? v > 0.3 : v < -0.3;
      const bullish = bearishIfPositive ? v < -0.3 : v > 0.3;
      if (bearish) {
        o -= w;
        bearishParts++;
        notes.push(`${label} leans bearish`);
      } else if (bullish) {
        o += w;
        bullishParts++;
        notes.push(`${label} leans bullish`);
      }
    };
    consider(c.cushing, true, 0.15, "Cushing stocks");
    consider(c.gasoline, true, 0.1, "gasoline stocks");
    consider(c.distillate, true, 0.1, "distillate stocks");
    consider(c.production, true, 0.1, "crude production");
    if (c.refineryUtil != null && c.refineryUtil < 85) {
      o -= 0.05;
      notes.push("low refinery utilization");
    }
    if ((s < -0.3 && bearishParts >= 2) || (s > 0.3 && bullishParts >= 2)) {
      o *= 0.4;
      notes.push("report internals contradict the headline — downgraded to mixed");
    }
  }

  r = clamp(r);
  g = clamp(g);
  o = clamp(o);

  const channels: string[] = [];
  if (Math.abs(r) >= 0.15) {
    channels.push(def.kind === "inflation" || def.kind === "wages" ? `Inflation ${r > 0 ? "↑" : "↓"}` : `Rate path ${r > 0 ? "↑" : "↓"}`);
    channels.push(`Fed expectations ${r > 0 ? "hawkish" : "dovish"}`, `Yields ${r > 0 ? "↑" : "↓"}`, `DXY ${r > 0 ? "↑" : "↓"}`, `Liquidity ${r > 0 ? "↓" : "↑"}`);
  }
  if (Math.abs(g) >= 0.15) channels.push(`Growth ${g > 0 ? "↑" : "↓"}`, `Risk appetite ${g > 0 ? "↑" : "↓"}`);
  if (Math.abs(o) >= 0.15) channels.push(`Oil supply ${o > 0 ? "tighter" : "looser"}`, `Inflation expectations ${o > 0 ? "↑" : "↓"}`);

  return { r, g, o, channels, regimeNotes: notes };
}

export function assetScores(t: Transmission, regime: MacroRegime): Record<MacroAsset, number> {
  const riskOffBoost = regime.risk === "off" ? 0.2 : 0;
  const btc = -0.8 * t.r + (0.5 + riskOffBoost) * t.g - 0.15 * t.o;
  const gold = -0.9 * t.r - 0.2 * t.g + 0.25 * t.o;
  const wti = 0.9 * t.o + 0.5 * t.g - 0.15 * t.r;
  return {
    BTC: Math.round(clamp(btc) * 100),
    GOLD: Math.round(clamp(gold) * 100),
    WTI: Math.round(clamp(wti) * 100),
  };
}

export function directionOf(score: number): Direction {
  return score >= 15 ? "bullish" : score <= -15 ? "bearish" : "mixed";
}

function confidenceFor(score: number, magnitude: SurpriseMagnitude | null, relevance: number, kind: MacroEventDef["kind"]): Confidence {
  if (kind === "auction") return "low";
  // Fed communication has no number: confidence comes only from a synthetic score derived from the 2Y reaction.
  if (kind === "fed_communication" && (magnitude == null || Math.abs(score) < 20)) return "low";
  const a = Math.abs(score);
  if (a >= 45 && (magnitude === "large" || magnitude === "extreme") && relevance >= 0.6) return "high";
  if (a >= 20 && relevance >= 0.4) return "medium";
  return "low";
}

export function impactForSurprise(
  def: MacroEventDef,
  surpriseScore: number | null,
  magnitude: SurpriseMagnitude | null,
  regime: MacroRegime,
  components?: Record<string, number | null>
): AssetImpact[] {
  const t = transmission(def, surpriseScore, regime, components);
  const raw = assetScores(t, regime);
  return MACRO_ASSETS.map((asset) => {
    const rel = def.relevance[asset];
    const score = Math.round(raw[asset] * rel);
    const direction = directionOf(score);
    const confidence = confidenceFor(score, magnitude, rel, def.kind);
    const swing: Direction = magnitude === "large" || magnitude === "extreme" ? direction : "mixed";
    const shortTerm: Direction = confidence === "low" ? "mixed" : direction;
    const keyNote = t.regimeNotes.find((n) => /contradict/i.test(n)) ?? t.regimeNotes[0];
    const why = [...t.channels.slice(0, 3), ...(keyNote ? [keyNote] : [])].join(" · ");
    return {
      asset,
      direction,
      score,
      confidence,
      horizon: { immediate: direction, shortTerm, swing },
      channel: t.channels,
      reason: why || (rel < 0.2 ? "Little direct transmission to this asset" : "No meaningful surprise"),
    };
  });
}

// Pre-release: conditional map ("bullish if below forecast") derived from the same engine with a ±1 SD hypothetical.
export function preReleaseMap(def: MacroEventDef, regime: MacroRegime): AssetImpact[] {
  const up = impactForSurprise(def, 55, "large", regime);
  const down = impactForSurprise(def, -55, "large", regime);
  return MACRO_ASSETS.map((asset, i) => {
    const rel = def.relevance[asset];
    const numeric = def.unit !== "text";
    const conf: Confidence = rel >= 0.8 ? "medium" : "low";
    return {
      asset,
      direction: "mixed",
      score: 0,
      confidence: conf,
      horizon: { immediate: "mixed", shortTerm: "mixed", swing: "mixed" },
      channel: up[i].channel,
      reason: numeric
        ? `${label(up[i].direction)} if above forecast, ${label(down[i].direction)} if below`
        : "Direction will be read from the 2Y yield and dollar reaction, not a headline number",
      conditional: numeric ? { ifAbove: up[i].direction, ifBelow: down[i].direction } : undefined,
    };
  });
}

function label(d: Direction) {
  return d === "bullish" ? "bullish" : d === "bearish" ? "bearish" : "mixed";
}
