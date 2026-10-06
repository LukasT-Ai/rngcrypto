import { describe, expect, it } from "vitest";
import { impliedMedian, isAboveLadder, ladderWindow } from "../ladder";
import type { PMMarket } from "../types";

const base: PMMarket = { venue: "kalshi", id: "x", topic: "btc_price", title: "t", url: "u", closeTime: null, outcomes: [], volume: null, liquidity: null, eventDefId: null, asset: "BTC", strike: null, strikeSide: "above", period: null, retrievedAt: "" };
const rungs = Array.from({ length: 12 }, (_, i) => ({ label: `$${80000 + i * 1000} or above`, value: 80000 + i * 1000, prob: Math.max(0.01, Math.min(0.99, 1 - i * 0.09)) }));

describe("ladder helpers", () => {
  it("detects an above-ladder and finds the implied median", () => {
    const m = { ...base, outcomes: rungs };
    expect(isAboveLadder(m)).toBe(true);
    const med = impliedMedian(m)!;
    // probs: 1.0, .91, .82, .73, .64, .55, .46 → crosses 0.5 between $85k (.55) and $86k (.46)
    expect(med.value).toBeGreaterThan(85000);
    expect(med.value).toBeLessThan(86000);
  });
  it("windows a long ladder around the 50% rung", () => {
    const w = ladderWindow({ ...base, outcomes: rungs }, 5);
    expect(w).toHaveLength(5);
    expect(w.some((o) => o.value === 85000)).toBe(true);
    expect(w.some((o) => o.value === 86000)).toBe(true);
  });
  it("ignores binaries and below-ladders", () => {
    expect(impliedMedian({ ...base, outcomes: [{ label: "Yes", prob: 0.6 }, { label: "No", prob: 0.4 }] })).toBeNull();
    expect(impliedMedian({ ...base, strikeSide: "below", outcomes: rungs })).toBeNull();
  });
});
