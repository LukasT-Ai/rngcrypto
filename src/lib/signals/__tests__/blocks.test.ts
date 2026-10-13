import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BLOCK_OPTIONS,
  aggregateMembers,
  combineBlocks,
  combineWithVote,
  getBlockOptions,
  resetBlockOptions,
  scoreFlowBlock,
  scoreTimingBlock,
  scoreTrendBlock,
  setBlockOptions,
  type BlockResult,
  type FlowInput,
  type TimingInput,
  type TrendInput,
} from "../blocks";
import type { BookFeature, CvdFeature, FundingFeature, OiFeature } from "../features/types";

afterEach(() => resetBlockOptions());

const trendIn = (over: Partial<TrendInput> = {}): TrendInput => ({
  ema9: 103,
  ema21: 102,
  ema50: 100,
  supertrendDir: 1,
  regimeScore: 60,
  structureScore: 50,
  trend1h: "bull",
  trend4h: "bull",
  ...over,
});

const timingIn = (over: Partial<TimingInput> = {}): TimingInput => ({
  price: 100,
  rsi: 50,
  stochK: 50,
  stochD: 50,
  macdHist: 0,
  atr: 2,
  bbUpper: 104,
  bbLower: 96,
  squeeze: null,
  rsiDiv15m: null,
  rsiDiv1h: null,
  macdDiv: null,
  volDiv: null,
  pattern: null,
  sweepScore: null,
  regimeDir: 0,
  trendVote: 0,
  reversalConfirmed: 0,
  ...over,
});

const cvd = (over: Partial<CvdFeature> = {}): CvdFeature => ({ asOf: 0, ttlMs: 60e3, cum4hUsd: 1e6, slope1hUsd: 5e5, takerRatio1h: 1.5, takerImbalance15m: 0.2, series15m: [], qhImbalance: null, qhReadings: [], ...over });
const oi = (quadrant: OiFeature["quadrant"]): OiFeature => ({ asOf: 0, ttlMs: 60e3, oi: 1, oiUsd: null, change1hPct: null, change24hPct: null, sd: null, priceChange24hPct: null, quadrant, quadrantRaw: quadrant });
const book = (imbalance: number): BookFeature => ({ asOf: 0, ttlMs: 60e3, imbalance, band: 0.01, bidWallPct: null, askWallPct: null, venue: "OKX" });
const funding = (crowded: FundingFeature["crowded"]): FundingFeature => ({ asOf: 0, ttlMs: 60e3, rate8h: 0.0001, z: crowded ? (crowded === "long" ? 2.5 : -2.5) : 0, venues: { okx: 0.0001, hl: null, binance: null, bybit: null }, spreadRatio: null, crowded, regime: crowded === "long" ? "crowded_long" : crowded === "short" ? "crowded_short" : "neutral", n: 100 });
const flowIn = (over: Partial<FlowInput> = {}): FlowInput => ({ cvd: null, oi: null, funding: null, book: null, longLiqs24h: null, shortLiqs24h: null, volumeProxy: null, crowdedFallback: null, ...over });

const blk = (score: number, vote: -1 | 0 | 1 = Math.abs(score) >= 25 ? (score > 0 ? 1 : -1) : 0, abstained = false): BlockResult => ({ score, vote, magnitude: Math.abs(score), members: [], notes: [], gate: null, abstained });

describe("aggregateMembers", () => {
  it("weighted mean ignores zero-weight members and clamps", () => {
    expect(aggregateMembers([{ name: "a", score: 100, weight: 1 }, { name: "b", score: -100, weight: 1 }], "mean")).toBe(0);
    expect(aggregateMembers([{ name: "a", score: 100, weight: 3 }, { name: "b", score: 0, weight: 1 }, { name: "c", score: 50, weight: 0 }], "mean")).toBe(75);
    expect(aggregateMembers([], "mean")).toBe(0);
  });
  it("median of signs scaled by the strongest magnitude is robust to one member going wild", () => {
    expect(aggregateMembers([{ name: "a", score: 20, weight: 1 }, { name: "b", score: 30, weight: 1 }, { name: "c", score: -100, weight: 1 }], "median")).toBe(100);
    expect(aggregateMembers([{ name: "a", score: 20, weight: 1 }, { name: "b", score: -30, weight: 1 }], "median")).toBe(0);
  });
});

describe("TREND block", () => {
  it("full bull stack, bull regime, bullish structure and Supertrend vote +1 with a high score", () => {
    const r = scoreTrendBlock(trendIn());
    expect(r.vote).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.abstained).toBe(false);
    expect(r.members.map((m) => m.name)).toEqual(["emaStack", "regime", "structure", "supertrend"]);
  });
  it("is sign-symmetric", () => {
    const up = scoreTrendBlock(trendIn());
    const down = scoreTrendBlock(trendIn({ ema9: 97, ema21: 98, ema50: 100, supertrendDir: -1, regimeScore: -60, structureScore: -50, trend1h: "bear", trend4h: "bear" }));
    expect(down.score).toBe(-up.score);
    expect(down.vote).toBe(-1);
  });
  it("the 4h trend is a gate, not a vote: an opposing 4h trend withholds the vote and halves the score", () => {
    const r = scoreTrendBlock(trendIn({ trend4h: "bear", trend1h: "bear" }));
    expect(r.vote).toBe(0);
    expect(r.gate).toMatch(/4h trend bear opposes/);
    expect(r.score).toBe(Math.round(scoreTrendBlock(trendIn()).score * 0.5));
    // an agreeing 4h trend adds nothing on top of the members
    expect(scoreTrendBlock(trendIn({ trend4h: "bull" })).score).toBe(scoreTrendBlock(trendIn({ trend4h: "mixed", trend1h: "bull" })).score);
  });
  it("a mixed 4h with the 1h against trims the score but keeps the vote", () => {
    const r = scoreTrendBlock(trendIn({ trend4h: "mixed", trend1h: "bear" }));
    expect(r.vote).toBe(1);
    expect(r.score).toBeLessThan(scoreTrendBlock(trendIn()).score);
  });
  it("missing regime and structure leave the EMA stack and Supertrend to decide; a dropped block abstains", () => {
    const r = scoreTrendBlock(trendIn({ regimeScore: null, structureScore: null }));
    expect(r.members).toHaveLength(2);
    expect(r.score).toBe(100);
    setBlockOptions({ drop: ["trend"] });
    expect(scoreTrendBlock(trendIn()).abstained).toBe(true);
  });
});

describe("TIMING block", () => {
  it("neutral inputs score 0 and abstain from voting", () => {
    const r = scoreTimingBlock(timingIn());
    expect(r.score).toBe(0);
    expect(r.vote).toBe(0);
  });
  it("one momentum read: RSI, Stoch and MACD agree bullish -> positive, mirrored bearish -> negative", () => {
    const up = scoreTimingBlock(timingIn({ rsi: 65, stochK: 70, stochD: 60, macdHist: 1 }));
    const down = scoreTimingBlock(timingIn({ rsi: 35, stochK: 30, stochD: 40, macdHist: -1 }));
    expect(up.score).toBeGreaterThan(0);
    expect(down.score).toBe(-up.score);
  });
  it("mean reversion counts only toward a trending regime: a lower-band dip votes long in a bull regime, is muted in a bear regime", () => {
    const dip = timingIn({ price: 96, rsi: 42, stochK: 25, stochD: 20, macdHist: -0.1 });
    const bull = scoreTimingBlock({ ...dip, regimeDir: 1 });
    const bear = scoreTimingBlock({ ...dip, regimeDir: -1 });
    const range = scoreTimingBlock({ ...dip, regimeDir: 0 });
    expect(bull.score).toBeGreaterThan(0);
    expect(bull.members.find((m) => m.name === "location")!.score).toBe(100);
    expect(bear.members.find((m) => m.name === "location")!.score).toBe(0);
    expect(bear.notes.some((n) => n.includes("mean reversion muted"))).toBe(true);
    expect(range.score).toBe(bull.score);
  });
  it("divergences, patterns and sweeps only confirm: they add magnitude when agreeing and never flip the sign", () => {
    const base = scoreTimingBlock(timingIn({ rsi: 65, stochK: 70, stochD: 60, macdHist: 1 }));
    const confirmed = scoreTimingBlock(timingIn({ rsi: 65, stochK: 70, stochD: 60, macdHist: 1, rsiDiv1h: "bullish", pattern: "hammer", sweepScore: 60 }));
    const against = scoreTimingBlock(timingIn({ rsi: 65, stochK: 70, stochD: 60, macdHist: 1, rsiDiv1h: "bearish", macdDiv: "bearish", pattern: "shooting_star", sweepScore: -80 }));
    expect(confirmed.score).toBeGreaterThan(base.score);
    expect(against.score).toBe(base.score);
    expect(Math.sign(against.score)).toBe(1);
    expect(against.notes.filter((n) => n.includes("ignored"))).toHaveLength(3);
  });
  it("a volatility squeeze trims the timing read", () => {
    const open = scoreTimingBlock(timingIn({ rsi: 70, stochK: 80, stochD: 60, macdHist: 1 }));
    const squeezed = scoreTimingBlock(timingIn({ rsi: 70, stochK: 80, stochD: 60, macdHist: 1, squeeze: "volatility_compression" }));
    expect(squeezed.score).toBe(Math.round(open.score * 0.7));
  });
  it("a counter-trend timing vote needs a confirmed reversal (taSystem gate)", () => {
    const bearishTiming = timingIn({ rsi: 30, stochK: 15, stochD: 25, macdHist: -1, trendVote: 1 });
    const gated = scoreTimingBlock(bearishTiming);
    expect(gated.vote).toBe(0);
    expect(gated.gate).toMatch(/no confirmed reversal/);
    const confirmed = scoreTimingBlock({ ...bearishTiming, reversalConfirmed: -1 });
    expect(confirmed.vote).toBe(-1);
    expect(confirmed.gate).toBeNull();
    // a reversal confirmed the OTHER way does not open the gate
    expect(scoreTimingBlock({ ...bearishTiming, reversalConfirmed: 1 }).vote).toBe(0);
    // with the trend abstaining there is nothing to be counter to
    expect(scoreTimingBlock({ ...bearishTiming, trendVote: 0 }).vote).toBe(-1);
  });
});

describe("FLOW block", () => {
  it("abstains with no order-flow data at all", () => {
    const r = scoreFlowBlock(flowIn());
    expect(r.abstained).toBe(true);
    expect(r.vote).toBe(0);
    expect(r.score).toBe(0);
  });
  it("real CVD, OI quadrant, book and liquidation skew each vote; null members abstain", () => {
    const r = scoreFlowBlock(flowIn({ cvd: cvd(), oi: oi("new_longs"), book: book(0.3), longLiqs24h: 80, shortLiqs24h: 20 }));
    expect(r.members.map((m) => m.name)).toEqual(["cvd", "oiQuadrant", "book", "liqSkew"]);
    expect(r.vote).toBe(1);
    const partial = scoreFlowBlock(flowIn({ book: book(-0.4) }));
    expect(partial.members.map((m) => m.name)).toEqual(["book"]);
    expect(partial.score).toBe(-100);
  });
  it("the candle volume proxy stands in for CVD only when the taker feed is absent", () => {
    const proxy = scoreFlowBlock(flowIn({ volumeProxy: 60 }));
    expect(proxy.members[0].name).toBe("volumeCandles");
    expect(proxy.score).toBe(60);
    const real = scoreFlowBlock(flowIn({ volumeProxy: 60, cvd: cvd() }));
    expect(real.members.some((m) => m.name === "volumeCandles")).toBe(false);
  });
  it("quarter-hour imbalance joins when present", () => {
    const r = scoreFlowBlock(flowIn({ cvd: cvd({ qhImbalance: 0.4 }) }));
    expect(r.members.map((m) => m.name)).toEqual(["cvd", "qhImbalance"]);
  });
  it("funding crowding is a gate: it haircuts the crowded side and never flips the direction", () => {
    const open = scoreFlowBlock(flowIn({ cvd: cvd() }));
    const crowdedLong = scoreFlowBlock(flowIn({ cvd: cvd(), funding: funding("long") }));
    const crowdedShort = scoreFlowBlock(flowIn({ cvd: cvd(), funding: funding("short") }));
    expect(open.score).toBeGreaterThan(0);
    expect(crowdedLong.score).toBe(Math.round(open.score * 0.6));
    expect(crowdedShort.score).toBe(open.score);
    expect(crowdedLong.notes[0]).toMatch(/crowding is a gate/);
    // legacy raw-funding fallback behaves the same
    expect(scoreFlowBlock(flowIn({ cvd: cvd(), crowdedFallback: "long" })).score).toBe(crowdedLong.score);
  });
  it("is sign-symmetric on mirrored inputs", () => {
    const up = scoreFlowBlock(flowIn({ cvd: cvd({ takerRatio1h: 1.5, takerImbalance15m: 0.2 }), oi: oi("new_longs"), book: book(0.3) }));
    const down = scoreFlowBlock(flowIn({ cvd: cvd({ takerRatio1h: 1 / 1.5, takerImbalance15m: -0.2 }), oi: oi("new_shorts"), book: book(-0.3) }));
    expect(down.score).toBe(-up.score);
  });
});

describe("combiner", () => {
  it("vote mode: direction by weighted vote, confidence from agreement x magnitude", () => {
    const all = combineBlocks({ trend: blk(60), timing: blk(40), flow: blk(30) }, "vote");
    expect(all.direction).toBe(1);
    expect(all.agreement).toBe(1);
    expect(all.agreeing).toBe(3);
    // weighted mean magnitude 0.45*60 + 0.30*40 + 0.25*30 = 46.5 -> composite 47 (conf 73.5)
    expect(all.composite).toBe(47);
    const trendOnly = combineBlocks({ trend: blk(60), timing: blk(10), flow: blk(0, 0, true) }, "vote");
    expect(trendOnly.direction).toBe(1);
    expect(trendOnly.agreement).toBe(0.45);
    expect(trendOnly.composite).toBe(Math.round(0.45 * 60));
    expect(trendOnly.composite).toBeGreaterThanOrEqual(20); // publishes at the 60 threshold
  });
  it("opposition cuts the strength; timing + flow outvote the trend only on weight, and a 3-way split stays near zero", () => {
    const opposed = combineBlocks({ trend: blk(60), timing: blk(-50), flow: blk(0, 0, true) }, "vote");
    expect(opposed.direction).toBe(1);
    expect(opposed.agreement).toBeCloseTo(0.15, 5);
    expect(opposed.composite).toBe(9); // 0.15 x 60
    const outvoted = combineBlocks({ trend: blk(60), timing: blk(-50), flow: blk(-40) }, "vote");
    expect(outvoted.direction).toBe(-1);
    expect(outvoted.agreement).toBeCloseTo(0.1, 5);
    expect(Math.abs(outvoted.composite)).toBeLessThan(10);
  });
  it("no votes -> no direction, composite 0", () => {
    const r = combineBlocks({ trend: blk(20), timing: blk(-10), flow: blk(0, 0, true) }, "vote");
    expect(r.direction).toBe(0);
    expect(r.composite).toBe(0);
    expect(r.agreeing).toBe(0);
  });
  it("is sign-symmetric", () => {
    const up = combineBlocks({ trend: blk(60), timing: blk(40), flow: blk(-30) }, "vote");
    const down = combineBlocks({ trend: blk(-60), timing: blk(-40), flow: blk(30) }, "vote");
    expect(down.composite).toBe(-up.composite);
    expect(down.agreement).toBe(up.agreement);
  });
  it("sum mode: weighted mean of the non-abstaining block scores", () => {
    const r = combineBlocks({ trend: blk(60), timing: blk(-20), flow: blk(0, 0, true) }, "sum");
    expect(r.composite).toBe(Math.round((0.45 * 60 - 0.3 * 20) / 0.75));
    expect(r.direction).toBe(1);
  });
  it("dropping a block (ablation) removes it from the vote; weights and threshold are tunable", () => {
    setBlockOptions({ weights: { trend: 0.5, timing: 0.5, flow: 0 }, voteThreshold: 40 });
    expect(getBlockOptions().weights).toEqual({ trend: 0.5, timing: 0.5, flow: 0 });
    const r = combineBlocks({ trend: blk(60), timing: blk(60), flow: blk(-80) }, "vote");
    expect(r.agreement).toBe(1);
    expect(r.composite).toBe(60);
    resetBlockOptions();
    expect(getBlockOptions()).toEqual({ ...DEFAULT_BLOCK_OPTIONS, weights: { ...DEFAULT_BLOCK_OPTIONS.weights }, drop: [] });
  });
  it("combineWithVote re-runs the combiner with one vote replaced (flip distances)", () => {
    const set = { trend: blk(60), timing: blk(10), flow: blk(0, 0, true) };
    const joined = combineWithVote(set, "timing", 1, "vote");
    expect(joined.agreeing).toBe(2);
    expect(joined.composite).toBeGreaterThan(combineBlocks(set, "vote").composite);
    const dropped = combineWithVote(set, "trend", 0, "vote");
    expect(dropped.direction).toBe(0);
  });
});
