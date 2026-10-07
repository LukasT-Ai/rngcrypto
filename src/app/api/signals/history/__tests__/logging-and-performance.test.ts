import { describe, expect, it } from "vitest";
import { computeStats, shouldAppend, type SignalLog } from "../logger";
import { computePerformance, conservativeR } from "../performance";

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

  it("keeps the legacy stats object in R and skips excluded records", () => {
    const stats = computeStats([win, loss, unfilled, unverifiable]);
    expect(stats.total).toBe(2);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.profitFactor).toBe(3);
  });
});
