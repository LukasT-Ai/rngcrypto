import { describe, it, expect } from "vitest";
import {
  type Candle,
  mirrorCandles,
  runAllIndicators,
  scoreShortSideComposite,
  squeezeMomentum,
  chandelierExit,
  parabolicSAR,
  ichimoku,
  vwapBands,
  keltner,
  donchian,
  williamsR,
  cci,
  tdSequential,
  heikinAshi,
  macdZeroCross,
  deathGoldenCross,
  detectDoubleTop,
  detectDoubleBottom,
  detectDoubleTopBottom,
  detectHeadAndShoulders,
  detectInverseHeadAndShoulders,
  detectRisingWedge,
  detectFallingWedge,
  marketStructure,
  bearishBosChoch,
  bullishBosChoch,
  liquiditySweep,
  volumeClimax,
  findPivots,
  sround,
} from "../indicators";

// ── Synthetic data ──────────────────────────────────────────────────────────

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Build OHLCV candles from a close path. Wick sizes are deterministic per bar. */
function fromCloses(closes: number[], seed = 7, wick = 0.6, volume?: number[]): Candle[] {
  const r = prng(seed);
  const out: Candle[] = [];
  for (let i = 0; i < closes.length; i++) {
    const open = i === 0 ? closes[0] : closes[i - 1];
    const close = closes[i];
    const hiW = r() * wick;
    const loW = r() * wick;
    out.push({
      time: 1_700_000_000 + i * 3600,
      open,
      high: Math.max(open, close) + hiW,
      low: Math.min(open, close) - loW,
      close,
      volume: volume ? volume[i] : 1000 + Math.floor(r() * 200),
    });
  }
  return out;
}

function trendCloses(n: number, drift: number, noise: number, seed = 1, start = 1000): number[] {
  const r = prng(seed);
  const out = [start];
  for (let i = 1; i < n; i++) out.push(out[i - 1] + drift + (r() - 0.5) * 2 * noise);
  return out;
}

function uptrend(n = 260): Candle[] {
  return fromCloses(trendCloses(n, 0.8, 1.0, 11), 21);
}
function downtrend(n = 260): Candle[] {
  return fromCloses(trendCloses(n, -0.8, 1.0, 11), 21);
}
function range(n = 260): Candle[] {
  const r = prng(3);
  const closes: number[] = [];
  for (let i = 0; i < n; i++) closes.push(1000 + 10 * Math.sin((2 * Math.PI * i) / 40) + (r() - 0.5) * 1.5);
  return fromCloses(closes, 5);
}

/** Uptrend, then two equal peaks separated by a trough, then a break below the trough. */
function doubleTopSeries(): Candle[] {
  const closes: number[] = [];
  let p = 1000;
  for (let i = 0; i < 120; i++) { p += 0.6; closes.push(p); } // 1072
  // first peak
  for (let i = 0; i < 12; i++) { p += 1.5; closes.push(p); } // 1090
  for (let i = 0; i < 12; i++) { p -= 1.5; closes.push(p); } // 1072 trough
  for (let i = 0; i < 12; i++) { p += 1.5; closes.push(p); } // 1090 second peak
  for (let i = 0; i < 10; i++) { p -= 1.5; closes.push(p); } // 1075
  return fromCloses(closes, 9, 0.4);
}
function doubleTopBroken(): Candle[] {
  const c = doubleTopSeries();
  const closes = c.map((k) => k.close);
  let p = closes[closes.length - 1];
  for (let i = 0; i < 6; i++) { p -= 1.5; closes.push(p); } // below 1072 neckline
  return fromCloses(closes, 9, 0.4);
}

/** Left shoulder, head, right shoulder, neckline break. */
function headAndShouldersSeries(broken: boolean): Candle[] {
  const closes: number[] = [];
  let p = 1000;
  for (let i = 0; i < 110; i++) { p += 0.5; closes.push(p); } // 1055
  const leg = (d: number, n: number) => { for (let i = 0; i < n; i++) { p += d; closes.push(p); } };
  leg(1.5, 12); // LS 1073
  leg(-1.5, 10); // 1058
  leg(1.5, 18); // head 1085
  leg(-1.5, 18); // 1058
  leg(1.5, 10); // RS 1073
  leg(-1.5, 8); // 1061
  if (broken) leg(-1.5, 6); // 1052 < neckline 1058
  return fromCloses(closes, 13, 0.4);
}

/** Rising wedge: rising base with shrinking oscillation amplitude, then breakdown. */
function risingWedgeSeries(broken: boolean): Candle[] {
  const closes: number[] = [];
  const n = 96;
  for (let i = 0; i < n; i++) {
    const base = 1000 + 0.25 * i;
    const amp = 8 - (6.5 * i) / n;
    closes.push(base + amp * Math.sin((2 * Math.PI * i) / 12));
  }
  if (broken) {
    let p = closes[closes.length - 1];
    for (let i = 0; i < 6; i++) { p -= 3; closes.push(p); }
  }
  return fromCloses(closes, 17, 0.3);
}

/** Uptrend that reverses: breaks the last higher low (bearish CHoCH) then keeps falling (BOS). */
function reversalSeries(): Candle[] {
  const closes: number[] = [];
  let p = 1000;
  const leg = (d: number, n: number) => { for (let i = 0; i < n; i++) { p += d; closes.push(p); } };
  for (let k = 0; k < 6; k++) { leg(1.2, 12); leg(-0.6, 8); } // HH / HL staircase
  leg(1.2, 8);
  leg(-1.2, 14); // breaks last HL -> CHoCH
  leg(0.6, 6);
  leg(-1.2, 14); // BOS
  return fromCloses(closes, 23, 0.4);
}

/** Range with a final bar that wicks above the swing high and closes back inside. */
function sweepHighSeries(): Candle[] {
  const c = range(120);
  const piv = findPivots(c, 5, 5).filter((p) => p.type === "high");
  const lvl = piv[piv.length - 1].price;
  const lastC = c[c.length - 1];
  const open = lastC.close;
  c.push({ time: lastC.time + 3600, open, high: lvl + 2, low: open - 0.5, close: open - 1, volume: 1200 });
  return c;
}

/** Uptrend ending with a huge volume, wide range bar that closes near its low. */
function buyingClimaxSeries(): Candle[] {
  const closes = trendCloses(120, 0.8, 0.6, 31);
  const vols = closes.map(() => 1000);
  const c = fromCloses(closes, 33, 0.5, vols);
  const lastC = c[c.length - 1];
  const open = lastC.close;
  c.push({ time: lastC.time + 3600, open, high: open + 12, low: open - 1, close: open + 1, volume: 5000 });
  return c;
}

const ALL_SERIES: Record<string, Candle[]> = {
  uptrend: uptrend(),
  downtrend: downtrend(),
  range: range(),
  doubleTop: doubleTopBroken(),
  doubleTopForming: doubleTopSeries(),
  headAndShoulders: headAndShouldersSeries(true),
  risingWedge: risingWedgeSeries(true),
  reversal: reversalSeries(),
  sweep: sweepHighSeries(),
  climax: buyingClimaxSeries(),
};

// ── Symmetry ────────────────────────────────────────────────────────────────

describe("symmetry: mirroring a series negates every score", () => {
  for (const [label, series] of Object.entries(ALL_SERIES)) {
    it(`${label}: every component flips sign`, () => {
      const a = runAllIndicators(series);
      const b = runAllIndicators(mirrorCandles(series));
      expect(a.length).toBe(b.length);
      for (let i = 0; i < a.length; i++) {
        expect(a[i].name).toBe(b[i].name);
        expect(b[i].score, `${a[i].name} on ${label}: ${a[i].score} vs ${b[i].score}`).toBeCloseTo(-a[i].score, 4);
        const expectedBias = a[i].bias === "bullish" ? "bearish" : a[i].bias === "bearish" ? "bullish" : "neutral";
        expect(b[i].bias, `${a[i].name} bias on ${label}`).toBe(expectedBias);
      }
    });
    it(`${label}: composite flips sign`, () => {
      const a = scoreShortSideComposite(series);
      const b = scoreShortSideComposite(mirrorCandles(series));
      expect(b.score).toBeCloseTo(-a.score, 4);
      expect(b.trendScore).toBeCloseTo(-a.trendScore, 4);
      expect(b.exhaustionScore).toBeCloseTo(-a.exhaustionScore, 4);
    });
  }

  it("double mirror is the identity on scores", () => {
    const s = ALL_SERIES.doubleTop;
    const a = runAllIndicators(s);
    const b = runAllIndicators(mirrorCandles(mirrorCandles(s)));
    for (let i = 0; i < a.length; i++) expect(b[i].score).toBeCloseTo(a[i].score, 4);
  });

  it("mirrorCandles keeps high >= low and swaps the trend", () => {
    const m = mirrorCandles(uptrend());
    for (const k of m) expect(k.high).toBeGreaterThanOrEqual(k.low);
    expect(m[m.length - 1].close).toBeLessThan(m[0].close);
  });
});

// ── Trend-following tools ───────────────────────────────────────────────────

describe("trend tools on clean trends", () => {
  const up = uptrend();
  const down = downtrend();

  it("chandelierExit direction", () => {
    expect(chandelierExit(up).direction).toBe(1);
    expect(chandelierExit(down).direction).toBe(-1);
    expect(chandelierExit(down).bias).toBe("bearish");
    expect(chandelierExit(down).shortStop).toBeGreaterThan(down[down.length - 1].close);
  });

  it("parabolicSAR direction", () => {
    expect(parabolicSAR(up).direction).toBe(1);
    expect(parabolicSAR(down).direction).toBe(-1);
    expect(parabolicSAR(down).sar).toBeGreaterThan(down[down.length - 1].close);
  });

  it("ichimoku cloud position", () => {
    const u = ichimoku(up);
    const d = ichimoku(down);
    expect(u.pricePosition).toBe("above");
    expect(d.pricePosition).toBe("below");
    expect(u.bias).toBe("bullish");
    expect(d.bias).toBe("bearish");
  });

  it("heikinAshi run sign", () => {
    expect(heikinAshi(up).run).toBeGreaterThan(0);
    expect(heikinAshi(down).run).toBeLessThan(0);
    expect(heikinAshi(down).bias).toBe("bearish");
  });

  it("macd zero line regime", () => {
    expect(macdZeroCross(up).macd).toBeGreaterThan(0);
    expect(macdZeroCross(down).macd).toBeLessThan(0);
    expect(macdZeroCross(down).bias).toBe("bearish");
  });

  it("death / golden cross regime", () => {
    expect(deathGoldenCross(up).state).toBe("golden");
    expect(deathGoldenCross(down).state).toBe("death");
    expect(deathGoldenCross(down).bias).toBe("bearish");
    expect(deathGoldenCross(down.slice(0, 100)).bias).toBe("neutral"); // not enough bars
  });

  it("keltner position", () => {
    expect(keltner(up).position).toBeGreaterThan(0);
    expect(keltner(down).position).toBeLessThan(0);
  });

  it("donchian channel position / breakout", () => {
    expect(donchian(up).score).toBeGreaterThan(0);
    expect(donchian(down).score).toBeLessThan(0);
    // forced breakdown: add a close below the 20 bar low
    const c = range(100);
    const lo = Math.min(...c.slice(-20).map((k) => k.low));
    const lastC = c[c.length - 1];
    c.push({ time: lastC.time + 3600, open: lastC.close, high: lastC.close, low: lo - 5, close: lo - 4, volume: 1000 });
    const r = donchian(c);
    expect(r.breakout).toBe("down");
    expect(r.bias).toBe("bearish");
  });

  it("vwap bands z sign follows the trend", () => {
    expect(vwapBands(up, { anchor: "start" }).z).toBeGreaterThan(0);
    expect(vwapBands(down, { anchor: "start" }).z).toBeLessThan(0);
    const b = vwapBands(down, { anchor: "start" }).bands;
    expect(b.upper3).toBeGreaterThan(b.upper2);
    expect(b.lower2).toBeGreaterThan(b.lower3);
  });

  it("squeeze momentum sign and squeeze detection", () => {
    expect(squeezeMomentum(up).momentum).toBeGreaterThan(0);
    expect(squeezeMomentum(down).momentum).toBeLessThan(0);
    // flat, tiny-range tail => squeeze on
    const flat = fromCloses([...trendCloses(60, 0, 3, 5), ...Array(30).fill(1000)], 1, 0.05);
    expect(squeezeMomentum(flat).squeezeOn).toBe(true);
  });

  it("market structure on a staircase reversal: bearish CHoCH then BOS", () => {
    const r = marketStructure(reversalSeries());
    expect(r.trend).toBe(-1);
    expect(r.lastEvent?.direction).toBe("bearish");
    const types = r.events.filter((e) => e.direction === "bearish").map((e) => e.type);
    expect(types[0]).toBe("CHoCH");
    expect(types).toContain("BOS");
    expect(r.bias).toBe("bearish");
    expect(bearishBosChoch(reversalSeries()).score).toBeLessThan(0);
    expect(bullishBosChoch(reversalSeries()).score).toBe(0);
    const m = marketStructure(mirrorCandles(reversalSeries()));
    expect(m.trend).toBe(1);
    expect(bullishBosChoch(mirrorCandles(reversalSeries())).score).toBeGreaterThan(0);
  });

  it("composite bias on clean trends", () => {
    const u = scoreShortSideComposite(up);
    const d = scoreShortSideComposite(down);
    expect(u.bias).toBe("bullish");
    expect(d.bias).toBe("bearish");
    expect(u.trendScore).toBeGreaterThan(30);
    expect(d.trendScore).toBeLessThan(-30);
    expect(d.components.length).toBe(19);
    expect(d.components.find((k) => k.name === "chandelierExit")?.score).toBeLessThan(0);
  });

  it("composite is roughly flat on a range", () => {
    const r = scoreShortSideComposite(range());
    expect(Math.abs(r.score)).toBeLessThan(40);
  });
});

// ── Oscillators / exhaustion ────────────────────────────────────────────────

describe("oscillators", () => {
  it("williamsR bounds and overbought/oversold", () => {
    const w = williamsR(uptrend());
    expect(w.value).toBeGreaterThanOrEqual(-100);
    expect(w.value).toBeLessThanOrEqual(0);
    expect(w.value).toBeGreaterThan(-50);
    expect(williamsR(downtrend()).value).toBeLessThan(-50);
  });

  it("cci sign", () => {
    expect(cci(uptrend()).value).toBeGreaterThan(0);
    expect(cci(downtrend()).value).toBeLessThan(0);
  });

  it("tdSequential sell setup completes after 9 closes above close[4]", () => {
    const closes = [...trendCloses(30, 0, 0.5, 2), ...Array.from({ length: 13 }, (_, i) => 1003 + i)];
    const c = fromCloses(closes, 3, 0.1);
    const r = tdSequential(c);
    expect(r.lastCompleted).toBe("sell");
    expect(r.bias).toBe("bearish");
    expect(r.sellSetup).toBeGreaterThanOrEqual(9);
    const m = tdSequential(mirrorCandles(c));
    expect(m.lastCompleted).toBe("buy");
    expect(m.bias).toBe("bullish");
  });
});

// ── Patterns ────────────────────────────────────────────────────────────────

describe("chart patterns", () => {
  it("double top forming and confirmed", () => {
    const forming = detectDoubleTop(doubleTopSeries());
    expect(forming.found).toBe(true);
    expect(forming.confirmed).toBe(false);
    expect(forming.bias).toBe("bearish");
    const broken = detectDoubleTop(doubleTopBroken());
    expect(broken.found).toBe(true);
    expect(broken.confirmed).toBe(true);
    expect(broken.score).toBeLessThanOrEqual(-55);
    expect(detectDoubleBottom(doubleTopBroken()).found).toBe(false);
    // mirror = double bottom
    const db = detectDoubleBottom(mirrorCandles(doubleTopBroken()));
    expect(db.found).toBe(true);
    expect(db.confirmed).toBe(true);
    expect(db.bias).toBe("bullish");
    expect(db.score).toBeCloseTo(-broken.score, 6);
    expect(detectDoubleTopBottom(doubleTopBroken()).bias).toBe("bearish");
  });

  it("no double top in a clean uptrend", () => {
    expect(detectDoubleTop(uptrend()).found).toBe(false);
  });

  it("head and shoulders forming and confirmed", () => {
    const forming = detectHeadAndShoulders(headAndShouldersSeries(false));
    expect(forming.found).toBe(true);
    expect(forming.confirmed).toBe(false);
    const broken = detectHeadAndShoulders(headAndShouldersSeries(true));
    expect(broken.found).toBe(true);
    expect(broken.confirmed).toBe(true);
    expect(broken.bias).toBe("bearish");
    expect(broken.head!.price).toBeGreaterThan(broken.leftShoulder!.price);
    expect(broken.head!.price).toBeGreaterThan(broken.rightShoulder!.price);
    const inv = detectInverseHeadAndShoulders(mirrorCandles(headAndShouldersSeries(true)));
    expect(inv.found).toBe(true);
    expect(inv.bias).toBe("bullish");
    expect(inv.score).toBeCloseTo(-broken.score, 6);
    expect(detectInverseHeadAndShoulders(headAndShouldersSeries(true)).found).toBe(false);
  });

  it("rising wedge forming and broken; falling wedge on the mirror", () => {
    const forming = detectRisingWedge(risingWedgeSeries(false));
    expect(forming.found).toBe(true);
    expect(forming.upperSlopeAtr).toBeGreaterThan(0);
    expect(forming.lowerSlopeAtr).toBeGreaterThan(forming.upperSlopeAtr);
    expect(forming.bias).toBe("bearish");
    const broken = detectRisingWedge(risingWedgeSeries(true));
    expect(broken.found).toBe(true);
    expect(broken.confirmed).toBe(true);
    const fw = detectFallingWedge(mirrorCandles(risingWedgeSeries(true)));
    expect(fw.found).toBe(true);
    expect(fw.bias).toBe("bullish");
    expect(fw.upperSlopeAtr).toBeLessThan(0);
    expect(detectFallingWedge(risingWedgeSeries(true)).found).toBe(false);
  });

  it("liquidity sweep of a swing high", () => {
    const s = sweepHighSeries();
    const r = liquiditySweep(s, 5, 1); // only inspect the final bar
    expect(r.sweepHigh).not.toBeNull();
    expect(r.sweepHigh!.index).toBe(s.length - 1);
    expect(r.sweepLow).toBeNull();
    expect(r.bias).toBe("bearish");
    const m = liquiditySweep(mirrorCandles(s), 5, 1);
    expect(m.sweepLow).not.toBeNull();
    expect(m.sweepHigh).toBeNull();
    expect(m.bias).toBe("bullish");
    expect(m.score).toBeCloseTo(-r.score, 6);
  });

  it("buying climax after an uptrend", () => {
    const r = volumeClimax(buyingClimaxSeries());
    expect(r.buyingClimax).not.toBeNull();
    expect(r.buyingClimax!.volRatio).toBeGreaterThan(2.5);
    expect(r.bias).toBe("bearish");
    expect(volumeClimax(mirrorCandles(buyingClimaxSeries())).sellingClimax).not.toBeNull();
    expect(volumeClimax(uptrend()).buyingClimax).toBeNull();
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("short series return neutral without throwing", () => {
    const tiny = uptrend(2);
    for (const r of runAllIndicators(tiny)) {
      expect(r.bias).toBe("neutral");
      expect(r.score).toBe(0);
    }
    const comp = scoreShortSideComposite(tiny);
    expect(comp.score).toBe(0);
    expect(scoreShortSideComposite([]).score).toBe(0);
  });

  it("scores are clamped to [-100, 100]", () => {
    for (const s of Object.values(ALL_SERIES)) {
      for (const r of runAllIndicators(s)) {
        expect(r.score).toBeGreaterThanOrEqual(-100);
        expect(r.score).toBeLessThanOrEqual(100);
        expect(r.notes.length).toBeGreaterThan(0);
      }
    }
  });

  it("sround is sign symmetric", () => {
    expect(sround(0.05, 1)).toBe(0.1);
    expect(sround(-0.05, 1)).toBe(-0.1);
    expect(sround(-12.345, 2)).toBe(-12.35);
  });

  it("composite accepts weight overrides", () => {
    const d = downtrend();
    const a = scoreShortSideComposite(d, { weights: { ichimoku: 0 } });
    expect(a.components.find((k) => k.name === "ichimoku")?.weight).toBe(0);
    expect(a.bias).toBe("bearish");
  });
});
