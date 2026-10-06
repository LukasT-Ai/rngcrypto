import { describe, it, expect } from "vitest";
import {
  analyzeElliott,
  analyzeElliottMTF,
  countCorrection,
  countImpulse,
  elliottWaveOscillator,
  zigzag,
  zigzagState,
  type Candle,
  type Pivot,
} from "../elliott";

// ── Synthetic data ───────────────────────────────────────────────────────────

/** Deterministic pseudo-noise in [-1, 1]. */
function noise(i: number): number {
  return Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 78.233) * 0.5;
}

/**
 * Build candles that walk through `legs` (price targets), `bars` per leg,
 * with small deterministic wiggle so ATR is non-zero but well below swing size.
 */
function pathCandles(start: number, legs: { to: number; bars: number }[], wiggle = 0.15): Candle[] {
  const out: Candle[] = [];
  let price = start;
  let t = 1_700_000_000;
  let i = 0;
  // Warm-up flat segment so EMAs have history.
  for (let k = 0; k < 40; k++) {
    const w = noise(i) * wiggle;
    const o = price + w;
    const c = price - w * 0.5;
    out.push({ time: t, open: o, high: Math.max(o, c) + wiggle * 0.5, low: Math.min(o, c) - wiggle * 0.5, close: c, volume: 1000 });
    t += 60;
    i++;
  }
  for (const leg of legs) {
    const from = price;
    for (let k = 1; k <= leg.bars; k++) {
      const prev = from + ((leg.to - from) * (k - 1)) / leg.bars;
      const cur = from + ((leg.to - from) * k) / leg.bars;
      const w = noise(i) * wiggle;
      const o = prev + w * 0.3;
      const c = cur;
      out.push({ time: t, open: o, high: Math.max(o, c) + Math.abs(w) * 0.5, low: Math.min(o, c) - Math.abs(w) * 0.5, close: c, volume: 1000 });
      t += 60;
      i++;
    }
    price = leg.to;
  }
  return out;
}

/** Mirror a series about its mean close (exact reflection: high/low swap). */
function mirror(candles: Candle[]): Candle[] {
  const m = candles.reduce((a, c) => a + c.close, 0) / candles.length;
  return candles.map((c) => ({
    time: c.time,
    open: 2 * m - c.open,
    high: 2 * m - c.low,
    low: 2 * m - c.high,
    close: 2 * m - c.close,
    volume: c.volume,
  }));
}

// Fib-correct bull impulse: W1 = 10, W2 = 61.8% retrace, W3 = 1.618 x W1,
// W4 = 38.2% of W3, W5 = W1. Then a drop that confirms the wave-5 pivot.
const P0 = 100;
const P1 = 110;
const P2 = P1 - 0.618 * 10; // 103.82
const P3 = P2 + 1.618 * 10; // 120.0
const P4 = P3 - 0.382 * (P3 - P2); // 113.82
const P5 = P4 + 10; // 123.82

const impulseLegs = [
  { to: P1, bars: 20 },
  { to: P2, bars: 12 },
  { to: P3, bars: 30 },
  { to: P4, bars: 18 },
  { to: P5, bars: 28 }, // slower than wave 3 => weaker EWO => divergence
];

const impulseUp = pathCandles(P0, [...impulseLegs, { to: P5 - 3.5, bars: 6 }]);

// ABC zigzag down after the impulse: A = 10 (to the wave-4 low), B = 61.8%, C = A, then bounce.
const A_END = P5 - 10; // 113.82
const B_END = A_END + 0.618 * 10; // 120.0
const C_END = B_END - 10; // 110.0
const abcAfterImpulse = pathCandles(P0, [
  ...impulseLegs,
  { to: A_END, bars: 16 },
  { to: B_END, bars: 14 },
  { to: C_END, bars: 18 },
  { to: C_END + 3.5, bars: 6 },
]);

const ZZ = { depth: 3, deviationPct: 1.0, atrMult: 2.0 };

function mkPivots(prices: number[], firstType: "high" | "low"): Pivot[] {
  return prices.map((p, i) => ({
    index: i * 10,
    price: p,
    type: (i % 2 === 0) === (firstType === "low") ? "low" : "high",
    time: i * 600,
  }));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("zigzag", () => {
  it("finds the six impulse pivots in order with alternating types", () => {
    const piv = zigzag(impulseUp, ZZ);
    expect(piv.length).toBe(6);
    expect(piv.map((p) => p.type)).toEqual(["low", "high", "low", "high", "low", "high"]);
    const prices = piv.map((p) => p.price);
    expect(prices[0]).toBeCloseTo(P0, 0);
    expect(prices[1]).toBeCloseTo(P1, 0);
    expect(prices[3]).toBeCloseTo(P3, 0);
    expect(prices[5]).toBeCloseTo(P5, 0);
    for (let i = 1; i < piv.length; i++) expect(piv[i].index).toBeGreaterThan(piv[i - 1].index);
  });

  it("is reflection-symmetric about the series mean", () => {
    const a = zigzagState(impulseUp, ZZ);
    const b = zigzagState(mirror(impulseUp), ZZ);
    expect(b.pivots.length).toBe(a.pivots.length);
    for (let i = 0; i < a.pivots.length; i++) {
      expect(b.pivots[i].index).toBe(a.pivots[i].index);
      expect(b.pivots[i].type).toBe(a.pivots[i].type === "high" ? "low" : "high");
    }
    expect(b.threshold).toBeCloseTo(a.threshold, 8);
  });

  it("returns an empty list on empty input", () => {
    expect(zigzag([], ZZ)).toEqual([]);
  });
});

describe("countImpulse hard rules", () => {
  it("accepts a fib-correct bullish impulse", () => {
    const piv = mkPivots([P0, P1, P2, P3, P4, P5], "low");
    const c = countImpulse(piv).filter((x) => x.complete && x.direction === "bullish");
    expect(c.length).toBe(1);
    expect(c[0].fit).toBeGreaterThan(0.75);
    expect(c[0].ratios.w2Retrace).toBeCloseTo(0.618, 3);
    expect(c[0].ratios.w3Ext).toBeCloseTo(1.618, 3);
    expect(c[0].ratios.w4Retrace).toBeCloseTo(0.382, 3);
    expect(c[0].ratios.w5ToW1).toBeCloseTo(1.0, 3);
  });

  it("rejects wave 4 overlapping wave 1 territory (unless diagonal allowed)", () => {
    // wave 4 low 108 < wave 1 high 110
    const piv = mkPivots([100, 110, 104, 120, 108, 124], "low");
    expect(countImpulse(piv).filter((x) => x.complete)).toHaveLength(0);
    expect(countImpulse(piv, { allowDiagonal: true }).filter((x) => x.complete && x.diagonal)).toHaveLength(1);
  });

  it("rejects wave 2 retracing more than 100% of wave 1", () => {
    const piv = mkPivots([100, 110, 99, 120, 114, 124], "low");
    expect(countImpulse(piv).filter((x) => x.complete)).toHaveLength(0);
    // Also no partial 3-pivot count may start there.
    expect(countImpulse(piv.slice(0, 3)).filter((x) => x.pivotCount === 3)).toHaveLength(0);
  });

  it("rejects wave 3 being the shortest", () => {
    // W1 = 10, W3 = 6, W5 = 12
    const piv = mkPivots([100, 110, 106, 112, 110.5, 122.5], "low");
    expect(countImpulse(piv).filter((x) => x.complete)).toHaveLength(0);
  });

  it("rejects a truncated fifth unless allowed", () => {
    const piv = mkPivots([100, 110, 104, 120, 114, 119], "low");
    expect(countImpulse(piv).filter((x) => x.complete)).toHaveLength(0);
    const t = countImpulse(piv, { allowTruncation: true }).filter((x) => x.complete);
    expect(t).toHaveLength(1);
    expect(t[0].truncated).toBe(true);
  });

  it("detects a bearish impulse from mirrored pivots", () => {
    const piv = mkPivots([200 - P0, 200 - P1, 200 - P2, 200 - P3, 200 - P4, 200 - P5], "high");
    const c = countImpulse(piv).filter((x) => x.complete);
    expect(c).toHaveLength(1);
    expect(c[0].direction).toBe("bearish");
  });
});

describe("countCorrection", () => {
  it("classifies a zigzag ABC down and computes C targets", () => {
    const piv = mkPivots([P5, A_END, B_END, C_END], "high");
    const c = countCorrection(piv).filter((x) => x.complete && x.direction === "bearish");
    expect(c).toHaveLength(1);
    expect(c[0].type).toBe("zigzag");
    expect(c[0].ratios.bRetrace).toBeCloseTo(0.618, 3);
    expect(c[0].ratios.cToA).toBeCloseTo(1.0, 3);
    const eq = c[0].cTargets.find((t) => t.label === "C = A");
    expect(eq?.price).toBeCloseTo(C_END, 6);
    const ext = c[0].cTargets.find((t) => t.label === "C = 1.618 A");
    expect(ext?.price).toBeCloseTo(B_END - 16.18, 6);
  });

  it("classifies a flat when B retraces ~100% of A", () => {
    const piv = mkPivots([120, 110, 119.5, 104], "high");
    const c = countCorrection(piv).filter((x) => x.complete);
    expect(c[0].type).toBe("flat");
  });

  it("rejects a B wave that exceeds expanded-flat territory", () => {
    const piv = mkPivots([120, 110, 135, 104], "high");
    expect(countCorrection(piv).filter((x) => x.complete)).toHaveLength(0);
  });
});

describe("elliottWaveOscillator", () => {
  it("flags bearish divergence when wave 5 tops on a weaker oscillator", () => {
    const { values, divergence } = elliottWaveOscillator(impulseUp, { zigzag: ZZ });
    expect(values.length).toBe(impulseUp.length);
    expect(divergence.type).toBe("bearish");
    expect(divergence.strength).toBeGreaterThan(0.1);
  });

  it("negates exactly under reflection", () => {
    const a = elliottWaveOscillator(impulseUp, { zigzag: ZZ });
    const b = elliottWaveOscillator(mirror(impulseUp), { zigzag: ZZ });
    for (let i = 0; i < a.values.length; i += 17) expect(b.values[i]).toBeCloseTo(-a.values[i], 6);
    expect(b.divergence.type).toBe("bullish");
    expect(b.divergence.strength).toBeCloseTo(a.divergence.strength, 6);
  });
});

describe("analyzeElliott", () => {
  it("calls a completed bullish impulse with a bearish (short) score", () => {
    const r = analyzeElliott(impulseUp, { zigzag: ZZ });
    expect(r.pattern).toBe("impulse");
    expect(r.direction).toBe("bullish");
    expect(r.currentWave).toMatch(/wave 5 likely complete/);
    expect(r.score).toBeLessThan(-60);
    expect(r.confidence).toBeGreaterThan(50);
    expect(r.waves.map((w) => w.label)).toEqual(["1", "2", "3", "4", "5"]);
    expect(r.targets.invalidation).toBeCloseTo(P5, 0);
    expect(r.targets.nextWaveTarget).toBeCloseTo(P4, 0);
    expect(r.meta.ewoDivergence?.type).toBe("bearish");
    expect(r.notes.join(" ")).toMatch(/EWO divergence/);
  });

  it("is strictly symmetric: mirrored series gives equal |score| with flipped sign", () => {
    const a = analyzeElliott(impulseUp, { zigzag: ZZ });
    const b = analyzeElliott(mirror(impulseUp), { zigzag: ZZ });
    expect(b.pattern).toBe("impulse");
    expect(b.direction).toBe("bearish");
    expect(b.score).toBeCloseTo(-a.score, 6);
    expect(b.confidence).toBe(a.confidence);
    expect(b.currentWave).toMatch(/wave 5 likely complete/);
    expect(b.waves.length).toBe(a.waves.length);
  });

  it("calls a completed ABC zigzag after an impulse with a bullish (long) score", () => {
    const r = analyzeElliott(abcAfterImpulse, { zigzag: ZZ });
    expect(r.pattern).toBe("correction");
    expect(r.direction).toBe("bearish"); // the corrective move itself points down
    expect(r.currentWave).toMatch(/wave C likely complete/);
    expect(r.score).toBeGreaterThan(60);
    expect(r.meta.correctionType).toBe("zigzag");
    expect(r.waves.map((w) => w.label)).toEqual(["A", "B", "C"]);
    expect(r.targets.invalidation).toBeCloseTo(C_END, 0);
    expect(r.notes.join(" ")).toMatch(/trend-resumption long/);
  });

  it("mirrors the correction case too", () => {
    const a = analyzeElliott(abcAfterImpulse, { zigzag: ZZ });
    const b = analyzeElliott(mirror(abcAfterImpulse), { zigzag: ZZ });
    expect(b.pattern).toBe("correction");
    expect(b.direction).toBe("bullish");
    expect(b.score).toBeCloseTo(-a.score, 6);
    expect(b.confidence).toBe(a.confidence);
  });

  it("reads an in-progress wave 4 pullback as a buy-the-dip (positive) score", () => {
    const series = pathCandles(P0, [
      { to: P1, bars: 20 },
      { to: P2, bars: 12 },
      { to: P3, bars: 30 },
      { to: P3 - 0.35 * (P3 - P2), bars: 10 },
    ]);
    const r = analyzeElliott(series, { zigzag: ZZ, usePending: false });
    expect(r.pattern).toBe("impulse");
    expect(r.currentWave).toMatch(/wave 4 pullback/);
    expect(r.score).toBeGreaterThan(20);
    expect(r.targets.invalidation).toBeCloseTo(P1, 0);
  });

  it("reads a wave 2 completion (in wave 3) as strongly positive", () => {
    const series = pathCandles(P0, [
      { to: P1, bars: 20 },
      { to: P2, bars: 12 },
      { to: P2 + 4, bars: 8 },
    ]);
    const r = analyzeElliott(series, { zigzag: ZZ, usePending: false });
    expect(r.pattern).toBe("impulse");
    expect(r.currentWave).toMatch(/in wave 3/);
    expect(r.score).toBeGreaterThan(40);
    expect(r.targets.nextWaveTarget).toBeCloseTo(P2 + 16.18, 0);
  });

  it("returns a null pattern when there is not enough data", () => {
    const r = analyzeElliott(impulseUp.slice(0, 20), { zigzag: ZZ });
    expect(r.pattern).toBeNull();
    expect(r.score).toBe(0);
  });
});

describe("analyzeElliottMTF", () => {
  it("aggregates per-timeframe results into a weighted consensus", () => {
    const r = analyzeElliottMTF({ "15m": impulseUp, "1h": impulseUp, "4h": abcAfterImpulse }, { zigzag: ZZ });
    expect(Object.keys(r.perTF)).toEqual(["15m", "1h", "4h"]);
    expect(r.perTF["15m"].score).toBeLessThan(0);
    expect(r.perTF["4h"].score).toBeGreaterThan(0);
    expect(r.consensus.agreement).toBeCloseTo(2 / 3, 6);
    expect(r.consensus.notes.join(" ")).toMatch(/disagree/);
  });

  it("consensus is symmetric under reflection", () => {
    const a = analyzeElliottMTF({ "15m": impulseUp, "4h": abcAfterImpulse }, { zigzag: ZZ });
    const b = analyzeElliottMTF({ "15m": mirror(impulseUp), "4h": mirror(abcAfterImpulse) }, { zigzag: ZZ });
    expect(b.consensus.score).toBeCloseTo(-a.consensus.score, 6);
    expect(b.consensus.confidence).toBe(a.consensus.confidence);
  });
});
