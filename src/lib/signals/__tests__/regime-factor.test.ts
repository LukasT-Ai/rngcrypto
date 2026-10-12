import { describe, it, expect } from "vitest";
import { computeRegime, computeDMI, type Candle } from "../engine";
import { mirrorCandles } from "@/lib/ta/indicators";

// ── Synthetic data (same generators as src/lib/ta/__tests__/indicators.test.ts) ──
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function fromCloses(closes: number[], seed = 7, wick = 0.6): Candle[] {
  const r = prng(seed);
  const out: Candle[] = [];
  for (let i = 0; i < closes.length; i++) {
    const open = i === 0 ? closes[0] : closes[i - 1];
    const close = closes[i];
    const hiW = r() * wick;
    const loW = r() * wick;
    out.push({ time: 1_700_000_000_000 + i * 900e3, open, high: Math.max(open, close) + hiW, low: Math.min(open, close) - loW, close, volume: 1000 + Math.floor(r() * 200) });
  }
  return out;
}
function trendCloses(n: number, drift: number, noise: number, seed = 1, start = 1000): number[] {
  const r = prng(seed);
  const out = [start];
  for (let i = 1; i < n; i++) out.push(out[i - 1] + drift + (r() - 0.5) * 2 * noise);
  return out;
}
const uptrend = (n = 420) => fromCloses(trendCloses(n, 0.8, 1.0, 11), 21);
const downtrend = (n = 420) => fromCloses(trendCloses(n, -0.8, 1.0, 11), 21);
/** Flat noise around 1000: thin cloud, flat 200MA, ADX in the low teens. */
function range(n = 420): Candle[] {
  const r = prng(9);
  const closes: number[] = [];
  for (let i = 0; i < n; i++) closes.push(1000 + (r() - 0.5) * 2);
  return fromCloses(closes, 4, 0.5);
}
/** Flat for 400 bars (last four closes held below the mean), then a sharp rally through the SMA200 over 8 bars. */
function freshReclaim(): Candle[] {
  const r = prng(9);
  const closes: number[] = [];
  for (let i = 0; i < 400; i++) closes.push(i >= 396 ? 998.5 : 1000 + (r() - 0.5) * 2);
  let p = closes[closes.length - 1];
  for (let i = 0; i < 8; i++) {
    p += 3;
    closes.push(p);
  }
  return fromCloses(closes, 4, 0.5);
}
/** Downtrend, then a 15-bar bounce strong enough to flip Tenkan over Kijun. */
function freshTkCross(): Candle[] {
  const closes = trendCloses(300, -0.8, 1.0, 11);
  let p = closes[closes.length - 1];
  for (let i = 0; i < 15; i++) {
    p += 2.5;
    closes.push(p);
  }
  return fromCloses(closes, 21);
}
const all = (c: Candle[]) => ({ "15m": c, "4h": c, "1d": c });

describe("computeDMI", () => {
  it("+DI leads -DI in an uptrend and the reverse after mirroring", () => {
    const u = computeDMI(uptrend());
    const n = u.adx.length - 1;
    expect(u.plusDI[n]).toBeGreaterThan(u.minusDI[n]);
    expect(u.adx[n]).toBeGreaterThan(20);
    const m = computeDMI(mirrorCandles(uptrend()));
    expect(m.minusDI[n]).toBeGreaterThan(m.plusDI[n]);
    expect(m.adx[n]).toBeCloseTo(u.adx[n], 6);
  });
});

describe("computeRegime", () => {
  it("uptrend: bull regime, above cloud and 200MA on every TF", () => {
    const r = computeRegime(all(uptrend()), 2)!;
    expect(r).not.toBeNull();
    expect(r.label).toBe("Bull regime");
    expect(r.score).toBeGreaterThan(30);
    for (const tf of ["15m", "4h", "1d"] as const) {
      expect(r.perTF[tf]?.cloud).toBe("above");
      expect(r.perTF[tf]?.ma200Side).toBe("above");
      expect(r.perTF[tf]?.diBias).toBe("bullish");
      expect(r.perTF[tf]?.goldenCross).toBe("golden");
    }
    expect(r.gate).toBe("none");
    expect(r.notes[0]).toMatch(/^Bull regime/);
  });

  it("downtrend: bear regime, below cloud and 200MA", () => {
    const r = computeRegime(all(downtrend()), 2)!;
    expect(r.label).toBe("Bear regime");
    expect(r.score).toBeLessThan(-30);
    expect(r.perTF["4h"]?.cloud).toBe("below");
    expect(r.perTF["4h"]?.ma200Side).toBe("below");
    expect(r.perTF["4h"]?.goldenCross).toBe("death");
  });

  it("range: flat chop never reads as a regime", () => {
    const r = computeRegime(all(range()), 2)!;
    expect(r.label).toBe("Mixed");
    expect(Math.abs(r.score)).toBeLessThan(30);
    expect(r.trendStrength).toBe("none");
    expect(r.perTF["15m"]?.cloudThin).toBe(true);
  });

  it("fresh Tenkan/Kijun cross is detected with a recent bar count", () => {
    const r = computeRegime({ "15m": freshTkCross() }, 2)!;
    const tf = r.perTF["15m"]!;
    expect(tf.tkCross).toBe("bullish");
    expect(tf.tkCrossBarsAgo).toBeGreaterThanOrEqual(0);
    expect(tf.tkCrossBarsAgo).toBeLessThanOrEqual(10);
  });

  it("fresh 200MA reclaim is flagged with bars since the cross", () => {
    const r = computeRegime({ "15m": freshReclaim() }, 2)!;
    const tf = r.perTF["15m"]!;
    expect(tf.ma200Side).toBe("above");
    expect(tf.freshCross).toBe("bullish");
    expect(tf.barsSinceCross).not.toBeNull();
    expect(tf.barsSinceCross!).toBeLessThanOrEqual(8);
    expect(r.notes.some((n) => n.startsWith("Fresh 200MA reclaim"))).toBe(true);
  });

  it("insufficient data: 150 bars gives cloud + ADX only, no 200MA fields, no NaN", () => {
    const r = computeRegime(all(uptrend(150)), 2)!;
    expect(r).not.toBeNull();
    for (const tf of ["15m", "4h", "1d"] as const) {
      const i = r.perTF[tf]!;
      expect(i.sma200).toBeNull();
      expect(i.ema200).toBeNull();
      expect(i.ma200Side).toBeNull();
      expect(i.ma200DistAtr).toBeNull();
      expect(i.goldenCross).toBeNull();
      expect(Number.isFinite(i.score)).toBe(true);
      expect(i.cloud).toBe("above");
    }
    expect(Number.isFinite(r.score)).toBe(true);
    expect(computeRegime(all(uptrend(50)), 2)).toBeNull();
  });

  it("low ADX on 15m and 4h damps the score and warns about a breakout trap", () => {
    const r = computeRegime(all(range()), 2)!;
    expect(r.perTF["15m"]!.adx).toBeLessThan(20);
    expect(r.notes.some((n) => n.includes("breakout-trap"))).toBe(true);
    const squeezed = computeRegime(all(range()), 2, { squeeze: "volatility_compression" })!;
    expect(Math.abs(squeezed.score)).toBeGreaterThanOrEqual(Math.abs(r.score));
  });

  it("mirror antisymmetry: reflecting the candles negates the score and flips the label", () => {
    const flip = { "Bull regime": "Bear regime", "Bear regime": "Bull regime", Transition: "Transition", Mixed: "Mixed" } as const;
    for (const s of [uptrend(), downtrend(), range(), freshReclaim(), freshTkCross(), uptrend(150)]) {
      const a = computeRegime(all(s), 2)!;
      const b = computeRegime(all(mirrorCandles(s)), 2)!;
      expect(b.score).toBeCloseTo(-a.score, 4);
      expect(b.label).toBe(flip[a.label]);
      for (const tf of ["15m", "4h", "1d"] as const) {
        expect(b.perTF[tf]!.score).toBeCloseTo(-a.perTF[tf]!.score, 4);
        expect(b.perTF[tf]!.adx).toBeCloseTo(a.perTF[tf]!.adx, 4);
      }
      const c = computeRegime(all(mirrorCandles(mirrorCandles(s))), 2)!;
      expect(c.score).toBeCloseTo(a.score, 4);
    }
  });
});
