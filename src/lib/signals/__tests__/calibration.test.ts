import { describe, expect, it } from "vitest";
import { bandOf, brierSet, buildCalibration, fitPlatt, pTp1For, plattProbability, sigmoid, wilson } from "../calibration";
import type { SignalLog } from "../../../app/api/signals/history/logger";

describe("wilson", () => {
  it("matches the textbook interval and clamps to [0, 1]", () => {
    // 11 of 20: Wilson 95% is about [34.2%, 74.2%] (the perf audit's "55% at n = 20" example).
    const [lo, hi] = wilson(11, 20);
    expect(lo).toBeCloseTo(0.342, 2);
    expect(hi).toBeCloseTo(0.742, 2);
    expect(wilson(0, 10)[0]).toBe(0);
    expect(wilson(10, 10)[1]).toBe(1);
    expect(wilson(0, 0)).toEqual([0, 0]);
    // Narrows with n.
    const [l2, h2] = wilson(55, 100);
    expect(h2 - l2).toBeLessThan(hi - lo);
  });
});

describe("brierSet", () => {
  it("decomposes into reliability - resolution + uncertainty and scores a base-rate forecast at BSS 0", () => {
    const pairs: { p: number; y: 0 | 1; bin: string }[] = [];
    // Two bins: forecast 0.7 realised 0.5 (4 of 8), forecast 0.6 realised 0.75 (6 of 8).
    for (let i = 0; i < 8; i++) pairs.push({ p: 0.7, y: i < 4 ? 1 : 0, bin: "70" });
    for (let i = 0; i < 8; i++) pairs.push({ p: 0.6, y: i < 6 ? 1 : 0, bin: "60" });
    const s = brierSet(pairs);
    expect(s.n).toBe(16);
    const o = 10 / 16;
    expect(s.uncertainty).toBeCloseTo(o * (1 - o), 6);
    expect(s.reliability).toBeCloseTo((8 * 0.2 ** 2 + 8 * 0.15 ** 2) / 16, 6);
    expect(s.resolution).toBeCloseTo((8 * (0.5 - o) ** 2 + 8 * (0.75 - o) ** 2) / 16, 6);
    expect(s.brier).toBeCloseTo((s.reliability as number) - (s.resolution as number) + (s.uncertainty as number), 6);
    // Constant base-rate forecast: Brier = uncertainty, BSS = 0.
    const base = brierSet(pairs.map((q) => ({ ...q, p: o, bin: "all" })));
    expect(base.bss).toBeCloseTo(0, 6);
    expect(brierSet([]).brier).toBeNull();
  });
});

describe("fitPlatt", () => {
  it("recovers a known logistic relationship and returns a usable interval", () => {
    // y ~ Bernoulli(sigmoid(0.04 s - 0.2)) on a deterministic grid.
    const pts: { s: number; y: 0 | 1 }[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 2000; i++) {
      const s = -80 + rnd() * 160;
      pts.push({ s, y: rnd() < sigmoid(0.04 * s - 0.2) ? 1 : 0 });
    }
    const fit = fitPlatt(pts);
    expect(fit).not.toBeNull();
    expect(fit!.converged).toBe(true);
    expect(fit!.a).toBeCloseTo(0.04, 2);
    expect(Math.abs(fit!.b + 0.2)).toBeLessThan(0.15); // intercept carries most of the sampling noise
    const { p, ci } = plattProbability(fit!, 40);
    expect(p).toBeCloseTo(sigmoid(0.04 * 40 - 0.2), 1);
    expect(ci[0]).toBeLessThan(p);
    expect(ci[1]).toBeGreaterThan(p);
    expect(ci[1] - ci[0]).toBeLessThan(0.15);
    expect(fitPlatt(pts.slice(0, 5))).toBeNull();
  });

  it("shrinks an uninformative score to the base rate", () => {
    const pts: { s: number; y: 0 | 1 }[] = [];
    for (let i = 0; i < 200; i++) pts.push({ s: (i % 20) * 10 - 100, y: i % 3 === 0 ? 1 : 0 });
    const fit = fitPlatt(pts)!;
    expect(Math.abs(fit.a)).toBeLessThan(0.005);
    expect(sigmoid(fit.b)).toBeCloseTo(1 / 3, 1);
  });
});

describe("bandOf", () => {
  it("uses 5-point bands from 55 with <55 and 100 as the edges", () => {
    expect(bandOf(54)).toBe("<55");
    expect(bandOf(55)).toBe("55-59");
    expect(bandOf(64)).toBe("60-64");
    expect(bandOf(99)).toBe("95-99");
    expect(bandOf(100)).toBe("100");
  });
});

const V = "2026.10.13-feeds-abc123";
function decided(i: number, score: number, tp1: boolean, over: Partial<SignalLog> = {}): SignalLog {
  return {
    id: `BTC-${i}`,
    symbol: "BTC",
    timestamp: 1_790_000_000_000 + i * 3600e3,
    bias: "LONG",
    confidence: 60 + Math.max(0, Math.min(39, Math.round(Math.abs(score) / 2))),
    grade: "B",
    entry: 100,
    stopLoss: 99,
    tp1: 101,
    tp2: 102,
    tp3: 103,
    priceAtSignal: 100,
    outcome: tp1 ? "tp1" : "stopped",
    outcomePrice: tp1 ? 101 : 99,
    outcomeTimestamp: 1_790_000_000_000 + i * 3600e3 + 1800e3,
    maxFavorable: null,
    maxAdverse: null,
    status: "closed",
    tpHits: tp1 ? [{ level: 1, at: 1, price: 101 }] : [],
    stoppedAfterTp: tp1 ? 1 : 0,
    closedReason: tp1 ? "stop_after_tp" : "stop_before_tp",
    realizedR: tp1 ? 1 : -1,
    fillStatus: "filled",
    filledAt: 1_790_000_000_000 + i * 3600e3 + 300e3,
    engineVersion: V,
    context: { factors: {}, catalystScore: 0, oilGeoScore: null, oilRegime: null, atr: 1, tradeType: null, timeframe: "15m", inputs: { weightedScore: score, confidenceRaw: 60, components: {}, rr1: 1, rr2: 2, rr3: 3, entryType: "market", atrPct: 1, fundingRate: null, minutesToNextEvent: null, tuning: {}, gateNotes: [], engineVersion: V, calibrationVersion: null, pTp1: null, regime: null, regimeGate: null, markAtSignal: 100, lastAtSignal: 100, candleCloseTime: null } },
    ...over,
  };
}

describe("buildCalibration gate and guard", () => {
  it("stays inactive below 100 decided on the current engine version and publishes nulls", () => {
    const rows = Array.from({ length: 60 }, (_, i) => decided(i, 20 + (i % 40), i % 2 === 0));
    const file = buildCalibration(rows, V, 1_790_500_000_000);
    expect(file.active).toBe(false);
    expect(file.platt).toBeNull();
    expect(file.n).toBe(60);
    expect(pTp1For(30, "LONG", V, file)).toEqual({ pTp1: null, pTp1Ci: null, calibrationVersion: null });
  });

  it("ignores shadow records, other engine versions and open records when counting", () => {
    const rows = [
      ...Array.from({ length: 50 }, (_, i) => decided(i, 20, true)),
      ...Array.from({ length: 50 }, (_, i) => decided(100 + i, 20, true, { shadow: true, shadowClass: "wait_lean" })),
      ...Array.from({ length: 50 }, (_, i) => decided(200 + i, 20, true, { engineVersion: "old" })),
      ...Array.from({ length: 50 }, (_, i) => decided(300 + i, 20, true, { status: "open", outcome: "pending" })),
    ];
    expect(buildCalibration(rows, V).n).toBe(50);
  });

  it("activates at the gate with an informative score and publishes pTp1 with an interval", () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const rows = Array.from({ length: 160 }, (_, i) => {
      const score = Math.round(rnd() * 80);
      return decided(i, score, rnd() < sigmoid(0.05 * score - 1.5));
    });
    const file = buildCalibration(rows, V, 1_790_900_000_000);
    expect(file.n).toBe(160);
    expect(file.platt).not.toBeNull();
    expect(file.active).toBe(true);
    expect(file.guard?.reverted).toBe(false);
    const hi = pTp1For(70, "LONG", V, file);
    const lo = pTp1For(10, "LONG", V, file);
    expect(hi.pTp1).not.toBeNull();
    expect(hi.pTp1!).toBeGreaterThan(lo.pTp1!);
    expect(hi.pTp1Ci![0]).toBeLessThanOrEqual(hi.pTp1!);
    expect(hi.calibrationVersion).toBe(file.version);
    // A short with the same lean strength maps through the signed score.
    expect(pTp1For(-70, "SHORT", V, file).pTp1).toBe(hi.pTp1);
    expect(pTp1For(70, "WAIT", V, file).pTp1).toBeNull();
    expect(pTp1For(70, "LONG", "other-version", file).pTp1).toBeNull();
  });

  it("honours the CALIBRATION=off kill switch", () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const rows = Array.from({ length: 120 }, (_, i) => {
      const score = Math.round(rnd() * 80);
      return decided(i, score, rnd() < sigmoid(0.05 * score - 1.5));
    });
    const file = buildCalibration(rows, V, 1_790_900_000_000);
    expect(file.active).toBe(true);
    process.env.CALIBRATION = "off";
    try {
      expect(pTp1For(70, "LONG", V, file).pTp1).toBeNull();
    } finally {
      delete process.env.CALIBRATION;
    }
    expect(pTp1For(70, "LONG", V, file).pTp1).not.toBeNull();
  });

  it("reverts when the previously published mapping scores worse than raw confidence over the last 50", () => {
    // Stated confidence tracks the outcome well; a stale inverted mapping must lose the guard.
    const rows = Array.from({ length: 120 }, (_, i) => decided(i, (i % 2 === 0 ? 70 : 10), i % 2 === 0));
    const stale = buildCalibration(rows, V, 1_790_900_000_000);
    const inverted = { ...stale, platt: { ...stale.platt!, a: -stale.platt!.a, b: -stale.platt!.b } };
    const next = buildCalibration(rows, V, 1_790_950_000_000, inverted);
    expect(next.guard?.reverted).toBe(true);
    expect(next.active).toBe(false);
    expect(pTp1For(70, "LONG", V, next).pTp1).toBeNull();
  });
});
