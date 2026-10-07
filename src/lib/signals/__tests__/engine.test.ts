import { describe, expect, it } from "vitest";
import { FUNDING, TF_MS, assetClassFor, closedCandles, ema, gradeFor, scoreFromCandles, type Candle } from "../engine";

const bar = (time: number, close: number, spread = 0.002, volume = 1000): Candle => ({
  time,
  open: close * (1 - spread / 2),
  high: close * (1 + spread),
  low: close * (1 - spread),
  close,
  volume,
});

function series(n: number, intervalMs: number, endMs: number, priceAt: (i: number) => number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) out.push(bar(endMs - (n - 1 - i) * intervalMs, priceAt(i)));
  return out;
}

describe("closed-candle discipline", () => {
  it("drops the forming bar and keeps a completed one", () => {
    const now = 1_800_000_000_000;
    const c = series(5, TF_MS["15m"], now - 600e3, (i) => 100 + i); // last bar opened 10 min ago: still forming
    expect(closedCandles(c, TF_MS["15m"], now)).toHaveLength(4);
    const done = series(5, TF_MS["15m"], now - TF_MS["15m"] - 1, (i) => 100 + i); // last bar closed 1 ms ago
    expect(closedCandles(done, TF_MS["15m"], now)).toHaveLength(5);
    expect(closedCandles([], TF_MS["15m"], now)).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("seeds the EMA with a running mean, not the first close", () => {
    const closes = [10, 20, 30, 40, 50, 60];
    const e = ema(closes, 3);
    expect(e).toHaveLength(closes.length);
    expect(e[1]).toBeCloseTo(15); // running mean during warm-up
    expect(e[2]).toBeCloseTo(20);
    expect(e[5]).toBeGreaterThan(e[2]);
  });
  it("funding thresholds are fractions per interval, small enough to fire on real funding", () => {
    expect(FUNDING.ELEVATED).toBeLessThan(0.001);
    expect(FUNDING.HIGH).toBeGreaterThan(FUNDING.ELEVATED);
    expect(FUNDING.EXTREME).toBeGreaterThan(FUNDING.HIGH);
    expect(FUNDING.EXTREME).toBeLessThan(0.01);
  });
  it("grades: A+ needs 85 and three agreeing factors; below 55 is no trade", () => {
    expect(gradeFor(90, 3)).toBe("A+");
    expect(gradeFor(90, 2)).toBe("A");
    expect(gradeFor(54, 5)).toBe("NO TRADE");
  });
  it("asset classes", () => {
    expect(assetClassFor("SP500", false)).toBe("index");
    expect(assetClassFor("OIL", false)).toBe("commodity");
    expect(assetClassFor("NIGHT", true)).toBe("thin");
    expect(assetClassFor("BTC", true)).toBe("crypto");
    expect(assetClassFor("TSLA", false)).toBe("stock");
  });
});

describe("scoreFromCandles (pure path)", () => {
  const now = 1_800_000_000_000;
  const build = (price: (tf: string, i: number, n: number) => number) => ({
    symbol: "BTC",
    c5: series(120, TF_MS["5m"], now - TF_MS["5m"], (i) => price("5m", i, 120)),
    c15: series(220, TF_MS["15m"], now - TF_MS["15m"], (i) => price("15m", i, 220)),
    c1h: series(120, TF_MS["1h"], now - TF_MS["1h"], (i) => price("1h", i, 120)),
    c4h: series(120, TF_MS["4h"], now - TF_MS["4h"], (i) => price("4h", i, 120)),
    c1d: series(220, TF_MS["1d"], now - TF_MS["1d"], (i) => price("1d", i, 220)),
    now,
  });

  it("returns null without enough candles", () => {
    const inp = build(() => 100);
    expect(scoreFromCandles({ ...inp, c15: inp.c15.slice(-10) })).toBeNull();
  });

  it("flat tape: stands aside or stays near 50 confidence", () => {
    const r = scoreFromCandles(build((_tf, i) => 60000 + Math.sin(i / 3) * 5));
    expect(r).not.toBeNull();
    expect(["WAIT", "LONG", "SHORT"]).toContain(r!.bias);
    expect(r!.confidence).toBeLessThan(65);
    expect(r!.entry).toBeGreaterThan(0);
    expect(r!.stopLoss).toBeGreaterThan(0);
  });

  it("persistent uptrend across timeframes: does not call a short", () => {
    const r = scoreFromCandles(build((_tf, i, n) => 40000 * Math.pow(1.0008, i - n)));
    expect(r).not.toBeNull();
    expect(r!.bias).not.toBe("SHORT");
    expect(r!.weightedScore).toBeGreaterThan(0);
  });

  it("is deterministic and ignores the forming bar", () => {
    const inp = build((_tf, i, n) => 40000 * Math.pow(1.0008, i - n));
    const a = scoreFromCandles(inp)!;
    // Append a wild still-forming 15m bar; it must not change the call.
    const forming = bar(now - 60e3, 90000, 0.2);
    const b = scoreFromCandles({ ...inp, c15: [...inp.c15, forming], price: a.price })!;
    expect(b.bias).toBe(a.bias);
    expect(b.confidence).toBe(a.confidence);
  });

  it("non-candle feeds are null: no derivatives, ETF or liquidation factor votes", () => {
    const r = scoreFromCandles(build((_tf, i, n) => 40000 * Math.pow(1.0008, i - n)))!;
    const voting = r.factors.filter((f) => f.weight > 0).map((f) => f.category);
    expect(voting).not.toContain("ETF Flows");
    expect(voting).not.toContain("Liquidation/Positioning");
    expect(voting).not.toContain("Derivatives");
  });
});
