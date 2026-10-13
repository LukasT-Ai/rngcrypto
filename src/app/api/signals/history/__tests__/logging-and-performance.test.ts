import { describe, expect, it } from "vitest";
import { shouldAppend, type SignalLog } from "../logger";
import { computePerformance, computeStats, conservativeR } from "../performance";

const NOW = Date.now();

function sig(over: Partial<SignalLog> = {}): SignalLog {
  return {
    id: `BTC-${NOW}`,
    symbol: "BTC",
    timestamp: NOW - 3600e3,
    bias: "LONG",
    confidence: 70,
    grade: "A",
    entry: 100,
    stopLoss: 99,
    tp1: 101,
    tp2: 102,
    tp3: 103,
    priceAtSignal: 100,
    outcome: "pending",
    outcomePrice: null,
    outcomeTimestamp: null,
    maxFavorable: null,
    maxAdverse: null,
    status: "open",
    tpHits: [],
    fillStatus: "pending",
    filledAt: null,
    ...over,
  };
}

describe("appendSignal dedupe rule", () => {
  it("blocks a second log while an open record with the same symbol and bias exists, regardless of age", () => {
    const open = sig({ timestamp: NOW - 48 * 3600e3 });
    expect(shouldAppend([open], "BTC", "LONG")).toBe(false);
  });

  it("allows a bias flip and a different symbol", () => {
    const open = sig();
    expect(shouldAppend([open], "BTC", "SHORT")).toBe(true);
    expect(shouldAppend([open], "ETH", "LONG")).toBe(true);
  });

  it("allows a new log once the previous record closed", () => {
    const closed = sig({ status: "closed", outcome: "stopped", closedReason: "stop_before_tp", realizedR: -1 });
    expect(shouldAppend([closed], "BTC", "LONG")).toBe(true);
    const legacyClosed = sig({ status: undefined, outcome: "tp1" });
    expect(shouldAppend([legacyClosed], "BTC", "LONG")).toBe(true);
  });
});

describe("conservativeR", () => {
  const base = { bias: "LONG" as const, entry: 100, stopLoss: 99, tp1: 101, tp2: 102, tp3: 103 };
  it("is the realized R when TP1 was never reached", () => {
    expect(conservativeR({ ...base, highestTp: 0, stoppedAfterTp: 0, realizedR: -1 })).toBe(-1);
    expect(conservativeR({ ...base, highestTp: 0, stoppedAfterTp: null, realizedR: 0.3 })).toBe(0.3);
  });
  it("banks half at TP1 and zero on the rest when stopped after a TP", () => {
    expect(conservativeR({ ...base, highestTp: 1, stoppedAfterTp: 1, realizedR: 1 })).toBe(0.5);
    expect(conservativeR({ ...base, highestTp: 2, stoppedAfterTp: 2, realizedR: 2 })).toBe(0.5);
  });
  it("banks half at TP1 and half at the highest TP when not stopped", () => {
    expect(conservativeR({ ...base, highestTp: 3, stoppedAfterTp: null, realizedR: 3 })).toBe(2);
    expect(conservativeR({ ...base, highestTp: 2, stoppedAfterTp: null, realizedR: 1.2 })).toBe(1.5);
  });
  it("works for shorts", () => {
    expect(conservativeR({ bias: "SHORT", entry: 100, stopLoss: 101, tp1: 99, tp2: 98, tp3: 97, highestTp: 3, stoppedAfterTp: null, realizedR: 3 })).toBe(2);
  });
});

describe("performance exclusions", () => {
  const win = sig({ id: "a", status: "closed", outcome: "tp3", closedReason: "tp3", realizedR: 3, tpHits: [{ level: 1, at: NOW, price: 101 }, { level: 2, at: NOW, price: 102 }, { level: 3, at: NOW, price: 103 }], outcomeTimestamp: NOW, fillStatus: "filled", filledAt: NOW - 3000e3 });
  const loss = sig({ id: "b", status: "closed", outcome: "stopped", closedReason: "stop_before_tp", realizedR: -1, stoppedAfterTp: 0, outcomeTimestamp: NOW, fillStatus: "filled", filledAt: NOW - 3000e3 });
  const unfilled = sig({ id: "c", status: "closed", outcome: "expired", closedReason: "unfilled", fillStatus: "unfilled", realizedR: null, outcomeTimestamp: NOW });
  const unverifiable = sig({ id: "d", status: "closed", outcome: "expired", closedReason: "unverifiable", realizedR: null, outcomeTimestamp: NOW });
  const pendingFill = sig({ id: "e" });

  it("drops unfilled and unverifiable records from rates, R, equity and streaks but reports them in meta", () => {
    const { stats, signals } = computePerformance([win, loss, unfilled, unverifiable, pendingFill], { dedupe: false, rangeDays: null });
    expect(stats.kpis.closedN).toBe(2);
    expect(stats.kpis.tp1Rate).toBe(50);
    expect(stats.kpis.sumR).toBe(2);
    expect(stats.equity).toHaveLength(2);
    expect(stats.streaks.maxWin).toBe(1);
    expect(stats.meta.filledN).toBe(2);
    expect(stats.meta.unfilledN).toBe(1);
    expect(stats.meta.unverifiableN).toBe(1);
    expect(stats.meta.pendingFillN).toBe(1);
    expect(stats.meta.provisional).toBe(true);
    expect(signals.find((s) => s.id === "c")?.outcomeLabel).toBe("Unfilled");
    expect(signals.find((s) => s.id === "e")?.outcomeLabel).toBe("Pending fill");
  });

  it("keeps an expired no-verdict signal in R but out of the hit and stop rates", () => {
    // Filled, horizon reached, neither TP1 nor stop touched: exited at the last close for +0.3R.
    const expired = sig({ id: "f", status: "closed", outcome: "expired", closedReason: "horizon", realizedR: 0.3, stoppedAfterTp: null, outcomeTimestamp: NOW, fillStatus: "filled", filledAt: NOW - 3000e3 });
    const { stats, signals } = computePerformance([win, loss, expired], { dedupe: false, rangeDays: null });
    expect(stats.kpis.closedN).toBe(3);
    expect(stats.kpis.decidedN).toBe(2);
    expect(stats.kpis.expiredN).toBe(1);
    expect(stats.meta.expiredN).toBe(1);
    // 1 win of 2 decided, not 1 of 3 closed
    expect(stats.kpis.tp1Rate).toBe(50);
    expect(stats.kpis.stopBeforeTpRate).toBe(50);
    // Real P&L still counts
    expect(stats.kpis.sumR).toBe(2.3);
    expect(stats.equity).toHaveLength(3);
    expect(signals.find((s) => s.id === "f")?.outcomeLabel).toBe("Expired");
    // Breakdown buckets use the same rule
    const long = stats.breakdowns.byBias.find((b) => b.key === "LONG");
    expect(long?.n).toBe(3);
    expect(long?.tp1Rate).toBe(50);
  });

  it("reports net R beside gross and estimates a cost for records closed before the cost model", () => {
    const winNet = { ...win, costR: 0.2, realizedNetR: 2.8, fillPrice: 100 };
    const lossNet = { ...loss, costR: 0.1, realizedNetR: -1.1, fillPrice: 100 };
    const { stats, signals } = computePerformance([winNet, lossNet], { dedupe: false, rangeDays: null });
    expect(stats.kpis.sumR).toBe(2);
    expect(stats.kpis.sumNetR).toBe(1.7);
    expect(stats.kpis.costModel.venue).toBe("Strike");
    expect(stats.equity.map((e) => e.cumNetR)).toEqual([2.8, 1.7]);
    expect(signals.every((s) => s.costEstimated === false)).toBe(true);
    // A legacy close (no costR) gets a fee + slippage estimate, flagged as estimated.
    const legacy = computePerformance([win], { dedupe: false, rangeDays: null }).signals[0];
    expect(legacy.costEstimated).toBe(true);
    expect(legacy.costR).toBeGreaterThan(0);
    expect(legacy.realizedNetR).toBeLessThan(3);
  });

  it("builds the calibration table with Wilson intervals, Brier and the track-record KPIs", () => {
    const mk = (i: number, conf: number, tp1: boolean, r: number, extra: Partial<SignalLog> = {}) =>
      sig({
        id: `s${i}`,
        timestamp: NOW - (50 - i) * 3600e3,
        confidence: conf,
        grade: conf >= 75 ? "A" : "B",
        status: "closed",
        outcome: tp1 ? "tp1" : "stopped",
        closedReason: tp1 ? "stop_after_tp" : "stop_before_tp",
        stoppedAfterTp: tp1 ? 1 : 0,
        tpHits: tp1 ? [{ level: 1, at: NOW, price: 101 }] : [],
        realizedR: r,
        realizedNetR: r - 0.1,
        costR: 0.1,
        fillPrice: 100,
        outcomeTimestamp: NOW - (50 - i) * 3600e3 + 90e5,
        filledAt: NOW - (50 - i) * 3600e3 + 300e3,
        fillStatus: "filled",
        engineVersion: i < 10 ? "v1" : "v2",
        ...extra,
      });
    const rows: SignalLog[] = [];
    // 62-band: 12 rows, 6 wins. 77-band: 8 rows, 6 wins. 15 of 20 TP1s go to +1R, stops to -1R.
    for (let i = 0; i < 12; i++) rows.push(mk(i, 62, i % 2 === 0, i % 2 === 0 ? 1 : -1));
    for (let i = 12; i < 20; i++) rows.push(mk(i, 77, i % 4 !== 3, i % 4 !== 3 ? 1 : -1));
    // One expired no-verdict row with a positive horizon exit and one unfilled limit.
    rows.push(mk(20, 62, false, 0.3, { outcome: "expired", closedReason: "horizon", stoppedAfterTp: null }));
    rows.push(mk(21, 62, false, 0, { outcome: "expired", closedReason: "unfilled", fillStatus: "unfilled", realizedR: null, realizedNetR: null, costR: null, entry: 95, priceAtSignal: 100 }));
    const { stats } = computePerformance(rows, { dedupe: false, rangeDays: null, engineVersion: "v2" });
    const c = stats.calibration;
    const b62 = c.byConfidence.find((b) => b.key === "60-64")!;
    expect(b62.n).toBe(12);
    expect(b62.tp1Rate).toBe(50);
    expect(b62.wilsonLo).toBeCloseTo(25.4, 0);
    expect(b62.wilsonHi).toBeCloseTo(74.6, 0);
    // Expectancy and pPos use the expired row too (13 closed rows in the band).
    expect(b62.pPos).toBe(Math.round((7 / 13) * 1000) / 10);
    expect(b62.meanNetR).toBeCloseTo((6 * 0.9 + 6 * -1.1 + 0.2) / 13, 2);
    expect(b62.brierNaive).toBeCloseTo(((0.62 - 1) ** 2 * 6 + 0.62 ** 2 * 6) / 12, 3);
    expect(b62.brierCal).toBeNull();
    const b77 = c.byConfidence.find((b) => b.key === "75-79")!;
    expect(b77.n).toBe(8);
    expect(b77.tp1Rate).toBe(75);
    expect(c.byGrade.map((b) => b.key)).toEqual(["A", "B"]);
    expect(c.byRr1.find((b) => b.key === "1-1.5")?.n).toBe(20);
    expect(c.byPTp1).toEqual([]);
    expect(c.brier.n).toBe(20);
    expect(c.brier.uncertainty).toBeCloseTo(0.6 * 0.4, 6);
    expect(c.brier.base).toBe(c.brier.uncertainty);
    expect(c.brier.calibrated).toBeNull();
    expect(c.platt).toBeNull();
    // KPIs
    expect(stats.kpis.expiryRate).toBe(Math.round((1 / 21) * 1000) / 10);
    expect(stats.kpis.fillRate).toEqual({ market: 100, limit: 0, nMarket: 21, nLimit: 1 });
    expect(stats.kpis.medianHoldMin.winners).toBe(145);
    expect(stats.kpis.holdMin.losers.n).toBe(8);
    expect(stats.kpis.seExpectancyR).toBeGreaterThan(0);
    expect(stats.kpis.maxDrawdownR).toBeLessThan(0);
    expect(stats.kpis.maxDrawdownNetR).toBeLessThan(stats.kpis.maxDrawdownR as number);
    expect(stats.kpis.longestUnderwaterDays).toBeGreaterThan(0);
    expect(stats.kpis.shareAbove2R).toBe(0);
    // Histogram: 12 rows at +1R land in the "1.0" bin gross and the "0.5" bin net (0.9R).
    expect(stats.rHistogram.find((b) => b.bin === "1.0")?.n).toBe(12);
    expect(stats.rHistogram.find((b) => b.bin === "0.5")?.netN).toBe(12);
    expect(stats.rHistogram[0].bin).toBe("<-3");
    expect(stats.rHistogram[stats.rHistogram.length - 1].bin).toBe("5+");
    // Versions, newest last signal first, with date ranges.
    expect(stats.versions.map((v) => v.version)).toEqual(["v2", "v1"]);
    expect(stats.versions[1].n).toBe(10);
    expect(stats.versions[0].firstAt).toBeLessThan(stats.versions[0].lastAt);
    expect(stats.meta.engineVersion).toBe("v2");
    expect(stats.meta.decidedNCurrentVersion).toBe(10);
    expect(stats.breakdowns.byEntryType.find((b) => b.key === "market")?.n).toBe(21);
  });

  it("keeps shadow records out of every public number and reports them in their own block", () => {
    const shadowWin = sig({ ...win, id: "sw", shadow: true, shadowClass: "wait_lean" });
    const shadowLoss = sig({ ...loss, id: "sl", shadow: true, shadowClass: "htf_blocked_short", bias: "SHORT" });
    const shadowOpen = sig({ id: "so", shadow: true, shadowClass: "regime_blocked" });
    const { stats, signals } = computePerformance([win, loss, shadowWin, shadowLoss, shadowOpen], { dedupe: false, rangeDays: null });
    expect(stats.kpis.closedN).toBe(2);
    expect(stats.kpis.openN).toBe(0);
    expect(stats.kpis.sumR).toBe(2);
    expect(stats.equity).toHaveLength(2);
    expect(stats.calibration.brier.n).toBe(2);
    expect(stats.versions[0].n).toBe(2);
    expect(signals.some((s) => s.shadow)).toBe(false);
    expect(stats.meta.shadowN).toBe(3);
    const lean = stats.shadow.byClass.find((c) => c.key === "wait_lean")!;
    expect(lean.n).toBe(1);
    expect(lean.tp1Rate).toBe(100);
    expect(lean.expectancyR).toBe(3);
    expect(stats.shadow.byClass.find((c) => c.key === "htf_blocked_short")?.tp1Rate).toBe(0);
    expect(stats.shadow.byClass.find((c) => c.key === "regime_blocked")).toMatchObject({ n: 0, openN: 1, tp1Rate: null });
    expect(stats.shadow.byClass.find((c) => c.key === "event_gated")?.n).toBe(0);
    // The legacy view agrees.
    expect(computeStats([win, loss, shadowWin, shadowLoss]).total).toBe(2);
  });

  it("builds the per-component reliability table from logged inputs", () => {
    const inputs = (ms: number, mom: number): NonNullable<SignalLog["context"]>["inputs"] => ({
      weightedScore: ms, confidenceRaw: 60, components: { marketStructure: { score: ms, weight: 0.13 }, momentum: { score: mom, weight: 0.11 }, etf: { score: 50, weight: 0 } }, rr1: 1, rr2: 2, rr3: 3, entryType: "market", atrPct: 1, fundingRate: null, minutesToNextEvent: null, tuning: {}, gateNotes: [], engineVersion: "v", calibrationVersion: null, pTp1: null, regime: null, regimeGate: null, markAtSignal: 100, lastAtSignal: 100, candleCloseTime: null,
    });
    const ctx = (ms: number, mom: number) => ({ factors: {}, catalystScore: 0, oilGeoScore: null, oilRegime: null, atr: 1, tradeType: null, timeframe: "15m", inputs: inputs(ms, mom) });
    const rows: SignalLog[] = [];
    // marketStructure agrees on 6 rows: 5 wins. Disagrees on 4 rows: 1 win. momentum: neutral everywhere.
    for (let i = 0; i < 6; i++) rows.push({ ...(i < 5 ? win : loss), id: `a${i}`, context: ctx(30, 0) });
    for (let i = 0; i < 4; i++) rows.push({ ...(i < 1 ? win : loss), id: `d${i}`, context: ctx(-30, 0) });
    const { stats } = computePerformance(rows, { dedupe: false, rangeDays: null });
    const ms = stats.components.find((c) => c.name === "marketStructure")!;
    expect(ms).toMatchObject({ nAgree: 6, nDisagree: 4, weight: 0.13, candidateWeight: null });
    expect(ms.pWinAgree).toBeCloseTo(5 / 6, 4);
    expect(ms.pWinDisagree).toBe(0.25);
    expect(ms.lift).toBeCloseTo(5 / 6 - 0.25, 4);
    expect(ms.liftLo).toBeLessThan(ms.lift as number);
    expect(ms.liftHi).toBeGreaterThan(ms.lift as number);
    // Neutral votes are "disagree or neutral"; a feed that was down (weight 0) casts no vote at all.
    expect(stats.components.find((c) => c.name === "momentum")).toMatchObject({ nAgree: 0, nDisagree: 10, lift: null });
    expect(stats.components.find((c) => c.name === "etf")).toMatchObject({ nAgree: 0, nDisagree: 0, weight: 0 });
    expect(stats.components[0].name).toBe("marketStructure");
  });

  it("keeps the legacy stats object in R and skips excluded records", () => {
    const stats = computeStats([win, loss, unfilled, unverifiable]);
    expect(stats.total).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.profitFactor).toBe(3);
  });
});
