import { describe, expect, it } from "vitest";
import {
  blendedAnchor,
  fedExpectedChange,
  impliedDistribution,
  marketExpectation,
  printImpliedMean,
  printImpliedSd,
  printTailSkew,
  shouldShrink,
  shrinkMarket,
  shrinkProb,
  survivalAt,
  survivalLadder,
} from "../conversions";
import type { PMMarket } from "../types";

const NOW = Date.parse("2026-10-13T12:00:00Z");
// Inside 14 days of the Oct 28 meeting, so the horizon shrink does not apply.
const NEAR = Date.parse("2026-10-20T12:00:00Z");

// Kalshi-style "CPI m/m > k" ladder (one-decimal print). P(>0.1)=0.97, P(>0.2)=0.80, P(>0.3)=0.40, P(>0.4)=0.10, P(>0.5)=0.02.
function cpiLadder(over: Partial<PMMarket> = {}): PMMarket {
  return {
    venue: "kalshi",
    id: "KXCPI-26SEP",
    topic: "cpi",
    title: "CPI in September",
    url: "",
    closeTime: "2026-10-14T12:25:00Z",
    outcomes: [
      { label: ">0.1", prob: 0.97, value: 0.1 },
      { label: ">0.2", prob: 0.8, value: 0.2 },
      { label: ">0.3", prob: 0.4, value: 0.3 },
      { label: ">0.4", prob: 0.1, value: 0.4 },
      { label: ">0.5", prob: 0.02, value: 0.5 },
    ],
    volume: 180_000,
    liquidity: 60_000,
    eventDefId: "cpi_mom",
    asset: null,
    strike: null,
    strikeSide: null,
    period: "2026-09",
    retrievedAt: new Date(NOW - 60e3).toISOString(),
    ...over,
  };
}

describe("fedExpectedChange", () => {
  const buckets = (hike: number | null, hold: number | null, cut25: number | null, cut50: number | null) => [
    { bucket: "hike" as const, label: "Hike", kalshi: hike, polymarket: null, blended: hike },
    { bucket: "hold" as const, label: "Hold", kalshi: hold, polymarket: null, blended: hold },
    { bucket: "cut25" as const, label: "Cut 25bp", kalshi: cut25, polymarket: null, blended: cut25 },
    { bucket: "cut50" as const, label: "Cut 50bp+", kalshi: cut50, polymarket: null, blended: cut50 },
  ];
  it("prices a 92% hold as a ~2bp expected change with a ~7bp surprise SD", () => {
    const fx = fedExpectedChange({ period: "2026-10-28", buckets: buckets(0.01, 0.92, 0.06, 0.01) }, NEAR)!;
    expect(fx.expectedChangeBp).toBeCloseTo(-1.75, 0);
    expect(fx.surpriseSdBp).toBeGreaterThan(5);
    expect(fx.surpriseSdBp).toBeLessThan(9);
    expect(fx.modalLabel).toBe("Hold");
    expect(fx.modalProb).toBeCloseTo(0.92, 2);
    expect(fx.shrunk).toBe(false);
  });
  it("renormalises venue rounding and takes a one-sided ladder to the bucket delta", () => {
    const fx = fedExpectedChange({ period: "2026-10-28", buckets: buckets(null, 0.1, 0.95, null) }, NEAR)!;
    // 0.1/1.05 hold, 0.95/1.05 cut25 -> E = -25 * 0.905 = -22.6
    expect(fx.expectedChangeBp).toBeCloseTo(-22.6, 0);
    expect(fx.modalLabel).toBe("Cut 25bp");
  });
  it("shrinks a meeting more than 14 days out toward uniform and flags it", () => {
    const near = fedExpectedChange({ period: "2026-10-28", buckets: buckets(0, 1, 0, 0) }, NEAR)!;
    const far = fedExpectedChange({ period: "2026-12-16", buckets: buckets(0, 1, 0, 0) }, NEAR)!;
    expect(near.surpriseSdBp).toBe(0);
    expect(far.shrunk).toBe(true);
    expect(far.modalProb).toBeCloseTo(0.775, 2);
    expect(far.surpriseSdBp).toBeGreaterThan(10);
  });
  it("returns null with no probabilities", () => {
    expect(fedExpectedChange({ period: "2026-10-28", buckets: buckets(null, null, null, null) }, NOW)).toBeNull();
  });
});

describe("survival ladder and implied moments", () => {
  it("builds a monotone survival function and interpolates between rungs", () => {
    const l = survivalLadder(cpiLadder())!;
    expect(l.thresholds).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(survivalAt(l, 0.25)).toBeCloseTo(0.6, 6);
    expect(survivalAt(l, 0.0)).toBe(1);
    expect(survivalAt(l, 0.9)).toBe(0);
  });
  it("forces a noisy rung monotone instead of producing negative mass", () => {
    const m = cpiLadder({ outcomes: [{ label: ">0.1", prob: 0.9, value: 0.1 }, { label: ">0.2", prob: 0.92, value: 0.2 }, { label: ">0.3", prob: 0.4, value: 0.3 }, { label: ">0.4", prob: 0.1, value: 0.4 }] });
    const l = survivalLadder(m)!;
    expect(l.survival[1]).toBe(0.9);
    const d = impliedDistribution(l, 0.1);
    expect(d.mean).toBeGreaterThan(0.2);
    expect(d.sd).toBeGreaterThan(0);
  });
  it("computes a CPI-style implied mean near the 50% crossing and an SD around one tenth", () => {
    const mean = printImpliedMean(cpiLadder(), 0.1)!;
    const sd = printImpliedSd(cpiLadder(), 0.1)!;
    // Mass: <=0.1: 0.03 @0.1, 0.2: 0.17, 0.3: 0.40, 0.4: 0.30, 0.5: 0.08, >0.5: 0.02 @0.6 -> mean ~0.33
    expect(mean).toBeCloseTo(0.33, 1);
    expect(sd).toBeGreaterThan(0.08);
    expect(sd).toBeLessThan(0.13);
  });
  it("uses plain midpoints for a continuous print such as payrolls", () => {
    const nfp = cpiLadder({
      id: "KXPAYROLLS-26OCT",
      eventDefId: "nfp",
      outcomes: [
        { label: ">50k", prob: 0.95, value: 50 },
        { label: ">100k", prob: 0.7, value: 100 },
        { label: ">150k", prob: 0.35, value: 150 },
        { label: ">200k", prob: 0.1, value: 200 },
      ],
    });
    const mean = printImpliedMean(nfp)!;
    // 0.05@25 + 0.25@75 + 0.35@125 + 0.25@175 + 0.1@225 = 1.25+18.75+43.75+43.75+22.5 = 130
    expect(mean).toBeCloseTo(130, 0);
    expect(printImpliedSd(nfp)!).toBeGreaterThan(40);
  });
  it("rejects below-ladders and ladders with fewer than three rungs", () => {
    expect(survivalLadder(cpiLadder({ strikeSide: "below" }))).toBeNull();
    expect(survivalLadder(cpiLadder({ outcomes: [{ label: "a", prob: 0.9, value: 0.1 }, { label: "b", prob: 0.2, value: 0.2 }] }))).toBeNull();
  });
});

describe("printTailSkew", () => {
  it("is positive when the ladder prices an upside miss and negative for a downside miss", () => {
    // consensus 0.2: P(>0.3)=0.40 vs P(<0.1)=P(<=0.0)=1-S(0.0)=0 -> +0.40
    expect(printTailSkew(cpiLadder(), 0.2, 0.1, 0.1)).toBeCloseTo(0.4, 2);
    // consensus 0.4: P(>0.5)=0.02 vs P(<0.3)=P(<=0.2)=1-0.80=0.20 -> -0.18
    expect(printTailSkew(cpiLadder(), 0.4, 0.1, 0.1)).toBeCloseTo(-0.18, 2);
  });
  it("returns null for an invalid band or consensus", () => {
    expect(printTailSkew(cpiLadder(), NaN, 0.1, 0.1)).toBeNull();
    expect(printTailSkew(cpiLadder(), 0.3, 0, 0.1)).toBeNull();
  });
});

describe("odds shrink", () => {
  it("shrinks toward 0.5 by lambda 0.3", () => {
    expect(shrinkProb(0.9)).toBeCloseTo(0.78, 4);
    expect(shrinkProb(0.1)).toBeCloseTo(0.22, 4);
    expect(shrinkProb(0.5)).toBe(0.5);
  });
  it("only shrinks far-dated or stale markets", () => {
    expect(shouldShrink(cpiLadder(), NOW)).toBe(false);
    expect(shouldShrink(cpiLadder({ closeTime: new Date(NOW + 20 * 86400e3).toISOString() }), NOW)).toBe(true);
    expect(shouldShrink(cpiLadder({ retrievedAt: new Date(NOW - 30 * 3600e3).toISOString() }), NOW)).toBe(true);
    const { market, shrunk } = shrinkMarket(cpiLadder({ closeTime: new Date(NOW + 20 * 86400e3).toISOString() }), NOW);
    expect(shrunk).toBe(true);
    expect(market.outcomes[0].prob).toBeCloseTo(0.829, 3);
  });
});

describe("marketExpectation", () => {
  it("picks the ladder resolving with the release, trusts the SD only when liquid, and reports the venue", () => {
    const far = cpiLadder({ id: "KXCPI-26OCT", closeTime: "2026-11-10T13:25:00Z", volume: 900_000 });
    const mx = marketExpectation([far, cpiLadder()], { eventTime: Date.parse("2026-10-14T12:30:00Z"), consensus: 0.3, resolution: 0.1, band: 0.1, now: NOW })!;
    expect(mx.marketId).toBe("KXCPI-26SEP");
    expect(mx.liquid).toBe(true);
    expect(mx.sd).not.toBeNull();
    expect(mx.venue).toBe("kalshi");
    expect(mx.shrunk).toBe(false);
    // consensus 0.3: P(>0.4)=0.10 vs P(<0.2)=P(<=0.1)=1-0.97=0.03 -> +0.07
    expect(mx.tailSkew).toBeCloseTo(0.07, 2);
  });
  it("keeps the mean but drops the SD for a thin ladder", () => {
    const mx = marketExpectation([cpiLadder({ volume: 12_000, liquidity: 3_000 })], { eventTime: Date.parse("2026-10-14T12:30:00Z"), consensus: 0.3, resolution: 0.1, now: NOW })!;
    expect(mx.liquid).toBe(false);
    expect(mx.sd).toBeNull();
    expect(mx.mean).toBeCloseTo(0.33, 1);
  });
  it("shrinks a far-dated mean toward the consensus and flags it", () => {
    const far = cpiLadder({ id: "KXCPI-26NOV", closeTime: new Date(NOW + 40 * 86400e3).toISOString() });
    const mx = marketExpectation([far], { eventTime: NOW + 40 * 86400e3, consensus: 0.1, resolution: 0.1, now: NOW })!;
    expect(mx.shrunk).toBe(true);
    // Shrunk probabilities flatten the ladder; the mean then moves 30% of the way to the consensus of 0.1.
    expect(mx.mean).toBeLessThan(0.33);
    expect(mx.mean).toBeGreaterThan(0.1);
  });
  it("returns null without a usable ladder", () => {
    expect(marketExpectation([], { eventTime: NOW, consensus: 0.3, now: NOW })).toBeNull();
  });
});

describe("blendedAnchor", () => {
  it("blends 0.6 market / 0.4 consensus, falls back to whichever exists", () => {
    expect(blendedAnchor(0.35, 0.3)).toEqual({ anchor: 0.33, source: "blended" });
    expect(blendedAnchor(0.35, null)).toEqual({ anchor: 0.35, source: "market" });
    expect(blendedAnchor(null, 0.3)).toEqual({ anchor: 0.3, source: "consensus" });
    expect(blendedAnchor(null, null)).toBeNull();
  });
});
