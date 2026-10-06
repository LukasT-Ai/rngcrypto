import { describe, expect, it } from "vitest";
import {
  biasFromScore,
  computeCross,
  computeMacroRegime,
  computeWeeklyStochastic,
  buildWeeklyCandles,
  macroBonus,
  type DailyCandle,
  type RegimeBias,
} from "../macro-regime";

const DAY = 86_400_000;
const MONDAY = Date.UTC(2025, 0, 6); // 2025-01-06 is a Monday

function series(closes: number[]): DailyCandle[] {
  return closes.map((close, i) => {
    const wobble = 0.012 + 0.004 * Math.sin(i / 3);
    const open = i === 0 ? close : closes[i - 1];
    return {
      time: MONDAY + i * DAY,
      open,
      high: Math.max(open, close) * (1 + wobble),
      low: Math.min(open, close) * (1 - wobble),
      close,
    };
  });
}

/** Slow grind down for `downDays`, then an accelerating rally with weekly-scale swings. */
function bullCloses(downDays = 300, upDays = 200): number[] {
  const out: number[] = [];
  let p = 100;
  for (let i = 0; i < downDays; i++) {
    p *= 1 - 0.0008 + 0.004 * Math.sin(i / 9);
    out.push(p);
  }
  for (let i = 0; i < upDays; i++) {
    p *= 1 + 0.0045 + 0.006 * Math.sin(i / 11);
    out.push(p);
  }
  return out;
}

/** Long rally into a top, then a bear leg with lower highs and lower lows. */
function bearCloses(upDays = 300, downDays = 200): number[] {
  const out: number[] = [];
  let p = 100;
  for (let i = 0; i < upDays; i++) {
    p *= 1 + 0.0012 + 0.004 * Math.sin(i / 9);
    out.push(p);
  }
  for (let i = 0; i < downDays; i++) {
    p *= 1 - 0.0045 + 0.006 * Math.sin(i / 11);
    out.push(p);
  }
  return out;
}

/** Reflect every price about a constant so all moving-average relationships invert exactly. */
function mirror(candles: DailyCandle[]): DailyCandle[] {
  const mean = candles.reduce((s, c) => s + c.close, 0) / candles.length;
  const C = 2 * mean;
  return candles.map((c) => ({ time: c.time, open: C - c.open, high: C - c.low, low: C - c.high, close: C - c.close }));
}

const MIRROR_BIAS: Record<RegimeBias, RegimeBias> = {
  strong_bull: "strong_bear",
  bull: "bear",
  lean_bull: "lean_bear",
  neutral: "neutral",
  lean_bear: "lean_bull",
  bear: "bull",
  strong_bear: "strong_bull",
};

describe("computeMacroRegime: bull regime", () => {
  const res = computeMacroRegime(series(bullCloses()));

  it("scores strongly positive with a bull bias", () => {
    expect(res.score).toBeGreaterThanOrEqual(20);
    expect(["bull", "strong_bull"]).toContain(res.bias);
  });

  it("flags golden cross, bullish 21/377 and HH/HL structure", () => {
    expect(res.details.cross.direction).toBe(1);
    expect(res.details.cross.daysSinceCross).not.toBeNull();
    expect(res.details.cross.returnSinceCross!).toBeGreaterThan(0);
    expect(res.details.ema21_377.direction).toBe(1);
    expect(res.details.structure.pattern).toBe("HH_HL");
    expect(res.details.sma200SlopePct!).toBeGreaterThan(0);
    expect(res.details.rangePosition!).toBeGreaterThan(0.8);
    const cross = res.components.find((c) => c.name === "sma50_200")!;
    expect(cross.score).toBeGreaterThan(0);
  });

  it("stochastic is in a bullish state", () => {
    expect(res.details.stochastic).not.toBeNull();
    expect(res.details.stochastic!.k).toBeGreaterThan(50);
    expect(res.components.find((c) => c.name === "weekly_stochastic")!.score).toBeGreaterThanOrEqual(0);
  });

  it("lists a human-readable signal per non-zero component", () => {
    const nonZero = res.components.filter((c) => c.score !== 0).length;
    expect(res.signals).toHaveLength(nonZero);
  });
});

describe("computeMacroRegime: bear regime", () => {
  const res = computeMacroRegime(series(bearCloses()));

  it("scores strongly negative with a bear bias", () => {
    expect(res.score).toBeLessThanOrEqual(-20);
    expect(["bear", "strong_bear"]).toContain(res.bias);
  });

  it("flags death cross with negative return since cross and LH/LL structure", () => {
    expect(res.details.cross.direction).toBe(-1);
    expect(res.details.cross.daysSinceCross).not.toBeNull();
    expect(res.details.cross.returnSinceCross!).toBeLessThan(0);
    const cross = res.components.find((c) => c.name === "sma50_200")!;
    expect(cross.score).toBeLessThan(0);
    expect(cross.note).toMatch(/Death cross/);
    expect(res.details.structure.pattern).toBe("LH_LL");
    expect(res.details.ema21_377.direction).toBe(-1);
    expect(res.details.sma200SlopePct!).toBeLessThan(0);
    expect(res.details.drawdownFromHigh!).toBeLessThan(-0.2);
  });

  it("stochastic is in a bearish state", () => {
    expect(res.details.stochastic!.k).toBeLessThan(50);
    expect(res.components.find((c) => c.name === "weekly_stochastic")!.score).toBeLessThanOrEqual(0);
  });
});

describe("mirror symmetry", () => {
  const bull = series(bullCloses());
  const a = computeMacroRegime(bull);
  const b = computeMacroRegime(mirror(bull));

  it("inverting the series flips the sign of the total score and the bias", () => {
    expect(Math.sign(a.score)).toBe(-Math.sign(b.score));
    expect(b.bias).toBe(MIRROR_BIAS[a.bias]);
  });

  it("every component except Pi Cycle flips sign exactly", () => {
    for (const comp of a.components) {
      if (comp.name === "pi_cycle") continue;
      const m = b.components.find((c) => c.name === comp.name);
      expect(m, comp.name).toBeDefined();
      // Sum of signs is 0 only when the signs are equal and opposite (or both zero). Avoids the +0/-0 trap.
      expect(Math.sign(m!.score) + Math.sign(comp.score), `${comp.name}: ${comp.note} vs ${m!.note}`).toBe(0);
    }
  });

  it("sign-based components mirror with identical magnitude", () => {
    for (const name of ["weekly_stochastic", "ema21_377", "weekly_engulfing", "weekly_structure", "confluence_double", "confluence_triple"]) {
      const x = a.components.find((c) => c.name === name);
      const y = b.components.find((c) => c.name === name);
      if (!x && !y) continue;
      expect(x && y, name).toBeTruthy();
      expect(x!.score + y!.score, name).toBe(0);
    }
  });

  it("weekly stochastic K reflects to 100 - K", () => {
    const sa = computeWeeklyStochastic(buildWeeklyCandles(bull))!;
    const sb = computeWeeklyStochastic(buildWeeklyCandles(mirror(bull)))!;
    expect(sa.k + sb.k).toBeCloseTo(100, 6);
    expect(sa.weeksBelow80).toBe(sb.weeksAbove20);
    expect(sa.weeksAbove80).toBe(sb.weeksBelow20);
  });

  it("death cross is the exact mirror of the golden cross", () => {
    const ga = computeCross(bull);
    const dc = computeCross(mirror(bull));
    expect(ga.direction).toBe(1);
    expect(dc.direction).toBe(-1);
    expect(dc.daysSinceCross).toBe(ga.daysSinceCross);
  });
});

describe("stochastic 80/20 regime signals", () => {
  // Build weekly candles directly: 40 weeks with controlled closes.
  const weekly = (closes: number[]): DailyCandle[] =>
    closes.map((close, i) => ({ time: MONDAY + i * 7 * DAY, open: close, high: close * 1.01, low: close * 0.99, close }));

  it("BEAR_TRIGGER when K crosses below 20 after an extended stay above", () => {
    // Rising for 30 weeks (K high), then a sharp collapse to the bottom of the 14w range.
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) closes.push(100 + i * 2);
    closes.push(131, 120, 110); // breaks the 14-week low gently enough that the smoothed K crosses 20 this week
    const s = computeWeeklyStochastic(weekly(closes))!;
    expect(s.k).toBeLessThanOrEqual(20);
    expect(s.weeksAbove20).toBeGreaterThanOrEqual(8);
    expect(s.signal).toBe("BEAR_TRIGGER");
  });

  it("BEAR_EXHAUST when K loses 80 after >= 8 weeks overbought", () => {
    const closes: number[] = [];
    for (let i = 0; i < 36; i++) closes.push(100 + i * 2); // K pinned near 100
    closes.push(170, 160, 152); // roll over, K drops below 80 but stays above 20
    const s = computeWeeklyStochastic(weekly(closes))!;
    expect(s.weeksAbove80).toBeGreaterThanOrEqual(8);
    expect(s.k).toBeLessThan(80);
    expect(s.k).toBeGreaterThan(20);
    expect(s.signal).toBe("BEAR_EXHAUST");
  });

  it("BULL_TRIGGER when K crosses above 80 after an extended stay below", () => {
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) closes.push(160 - i * 2);
    closes.push(129, 140, 150);
    const s = computeWeeklyStochastic(weekly(closes))!;
    expect(s.k).toBeGreaterThanOrEqual(80);
    expect(s.weeksBelow80).toBeGreaterThanOrEqual(8);
    expect(s.signal).toBe("BULL_TRIGGER");
  });
});

describe("macroBonus", () => {
  it("is symmetric: bear regime does for SHORT what bull does for LONG", () => {
    for (const s of [-60, -40, -25, -15, -10, 0, 10, 15, 25, 40, 60]) {
      expect(macroBonus(s, "LONG")).toBe(macroBonus(-s, "SHORT"));
    }
  });

  it("boosts aligned calls up to +20 and penalises opposing calls up to -10", () => {
    expect(macroBonus(40, "LONG")).toBe(20);
    expect(macroBonus(60, "LONG")).toBe(20);
    expect(macroBonus(10, "LONG")).toBe(5);
    expect(macroBonus(-40, "SHORT")).toBe(20);
    expect(macroBonus(-10, "SHORT")).toBe(5);
    expect(macroBonus(40, "SHORT")).toBe(-10);
    expect(macroBonus(-40, "LONG")).toBe(-10);
    expect(macroBonus(16, "SHORT")).toBe(-4);
    expect(macroBonus(10, "SHORT")).toBe(0);
    expect(macroBonus(-10, "LONG")).toBe(0);
    expect(macroBonus(50, "WAIT")).toBe(0);
  });
});

describe("biasFromScore", () => {
  it("maps symmetric thresholds", () => {
    expect(biasFromScore(45)).toBe("strong_bull");
    expect(biasFromScore(-45)).toBe("strong_bear");
    expect(biasFromScore(20)).toBe("bull");
    expect(biasFromScore(-20)).toBe("bear");
    expect(biasFromScore(8)).toBe("lean_bull");
    expect(biasFromScore(-8)).toBe("lean_bear");
    expect(biasFromScore(0)).toBe("neutral");
  });
});

describe("robustness", () => {
  it("handles short inputs without throwing", () => {
    const res = computeMacroRegime(series(bullCloses(20, 20)));
    // Only the 30-day range-position component can fire on 40 days of data.
    expect(Math.abs(res.score)).toBeLessThanOrEqual(6);
    expect(computeMacroRegime([]).score).toBe(0);
  });

  it("sorts unordered candles", () => {
    const bull = series(bullCloses());
    const shuffled = [...bull].reverse();
    expect(computeMacroRegime(shuffled).score).toBe(computeMacroRegime(bull).score);
  });
});
