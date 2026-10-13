import { describe, expect, it } from "vitest";
import { deflatedSharpe, expectedMaxSharpe, minTrl, normCdf, normInv, psr, sharpeStats } from "../../../../scripts/backtest-stats";

describe("backtest statistics (R5.2)", () => {
  it("normal CDF and its inverse agree", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.644854)).toBeCloseTo(0.95, 4);
    expect(normInv(0.95)).toBeCloseTo(1.644854, 4);
    expect(normInv(0.5)).toBeCloseTo(0, 6);
    for (const p of [0.01, 0.2, 0.7, 0.99]) expect(normCdf(normInv(p))).toBeCloseTo(p, 5);
  });
  it("per-trade Sharpe, t-stat, skew and kurtosis", () => {
    const xs = [1, -1, 2, -1, 1.5, -1, 3, -1];
    const s = sharpeStats(xs);
    expect(s.n).toBe(8);
    expect(s.mean).toBeCloseTo(0.4375, 2);
    expect(s.sharpe).toBeCloseTo(0.4375 / (s.sd as number), 2);
    expect(s.tStat).toBeCloseTo((s.sharpe as number) * Math.sqrt(8), 2);
    expect(s.skew).toBeGreaterThan(0);
    expect(s.kurtosis).toBeGreaterThan(1);
    expect(sharpeStats([1]).sharpe).toBeNull();
    expect(sharpeStats([2, 2, 2]).sharpe).toBeNull();
  });
  it("expected maximum Sharpe of 36 trials with sd 0.08 is about 0.17 (the paper's worked number)", () => {
    expect(expectedMaxSharpe(0.08 * 0.08, 36)).toBeCloseTo(0.17, 1);
    expect(expectedMaxSharpe(0.08 * 0.08, 2)).toBeLessThan(expectedMaxSharpe(0.08 * 0.08, 36));
  });
  it("PSR rises with the track record and falls with the benchmark", () => {
    expect(psr(0.18, 0, 200, 0, 3)).toBeGreaterThan(0.95);
    expect(psr(0.18, 0, 20, 0, 3)).toBeLessThan(psr(0.18, 0, 200, 0, 3));
    expect(psr(0.18, 0.17, 200, 0, 3)).toBeLessThan(0.7);
    expect(psr(0.18, 0.17, 200, 0, 3)).toBeGreaterThan(0.5);
  });
  it("MinTRL: about 85 trades for +0.2R / 1.1R-sd to beat zero at 95%, null when below the benchmark", () => {
    const sr = 0.2 / 1.1;
    const t = minTrl(sr, 0, 0, 3);
    expect(t).toBeGreaterThan(70);
    expect(t).toBeLessThan(100);
    expect(minTrl(0.1, 0.2, 0, 3)).toBeNull();
  });
  it("deflated report flags a config that is not distinguishable from selection luck", () => {
    const net = Array.from({ length: 200 }, (_, i) => (i % 5 === 0 ? 2.2 : i % 2 ? -1 : 0.9));
    const trials = Array.from({ length: 36 }, (_, i) => 0.05 + 0.005 * (i % 7));
    const d = deflatedSharpe(net, trials, 36);
    expect(d.n).toBe(200);
    expect(d.sr0).not.toBeNull();
    expect(d.psr0).not.toBeNull();
    expect(d.verdict).toMatch(/PSR/);
    expect(deflatedSharpe([1], [], 36).verdict).toMatch(/not enough/);
  });
});
