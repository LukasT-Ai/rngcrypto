import { describe, expect, it } from "vitest";
import { findWalls, summarizeLiquidations, type BookLevel, type LiqEvent } from "../orderflow";

const NOW = 1_800_000_000_000;

describe("summarizeLiquidations", () => {
  it("returns null with no events", () => {
    expect(summarizeLiquidations([], 100, NOW)).toBeNull();
  });

  it("buckets by age, finds the dominant side and the largest event", () => {
    const evs: LiqEvent[] = [
      { ts: NOW - 10 * 60e3, side: "long", price: 99, usd: 500_000 },
      { ts: NOW - 50 * 60e3, side: "long", price: 98.5, usd: 300_000 },
      { ts: NOW - 3 * 3600e3, side: "short", price: 101, usd: 100_000 },
      { ts: NOW - 10 * 3600e3, side: "long", price: 97, usd: 900_000 },
      { ts: NOW - 30 * 3600e3, side: "short", price: 90, usd: 5_000_000 }, // older than 24h: ignored
    ];
    const s = summarizeLiquidations(evs, 100, NOW)!;
    expect(s.h1.longUsd).toBe(800_000);
    expect(s.h1.shortUsd).toBe(0);
    expect(s.h4.shortUsd).toBe(100_000);
    expect(s.window.longUsd).toBe(1_700_000);
    expect(s.window.shortUsd).toBe(100_000);
    expect(s.dominant).toBe("long");
    expect(s.largest?.usd).toBe(900_000);
    expect(s.windowHours).toBe(10);
    expect(s.read).toMatch(/Longs took 94%/);
  });

  it("calls a balanced tape balanced", () => {
    const evs: LiqEvent[] = [
      { ts: NOW - 1e3, side: "long", price: 100, usd: 100 },
      { ts: NOW - 2e3, side: "short", price: 100, usd: 100 },
    ];
    expect(summarizeLiquidations(evs, 100, NOW)!.dominant).toBeNull();
  });

  it("clusters by 0.25% price bucket and ranks by size", () => {
    const evs: LiqEvent[] = [
      { ts: NOW - 1e3, side: "long", price: 99.0, usd: 100 },
      { ts: NOW - 2e3, side: "long", price: 99.05, usd: 100 },
      { ts: NOW - 3e3, side: "short", price: 102, usd: 50 },
    ];
    const s = summarizeLiquidations(evs, 100, NOW)!;
    expect(s.clusters[0].usd).toBe(200);
    expect(s.clusters[0].side).toBe("long");
    expect(s.clusters[0].distancePct).toBeLessThan(0);
  });
});

describe("findWalls", () => {
  const flat = (from: number, to: number, stepPx: number, usd: number): BookLevel[] => {
    const out: BookLevel[] = [];
    const n = Math.round(Math.abs(to - from) / stepPx);
    const dir = to > from ? 1 : -1;
    for (let i = 0; i <= n; i++) out.push({ price: +(from + dir * i * stepPx).toFixed(2), usd });
    return out;
  };

  it("returns null on an empty book", () => {
    expect(findWalls([], [], 100)).toBeNull();
  });

  it("detects an outsized bid and ask and reports imbalance", () => {
    const bids = flat(99.9, 95, 0.1, 10_000);
    const asks = flat(100.1, 105, 0.1, 10_000);
    bids.push({ price: 98.5, usd: 400_000 });
    asks.push({ price: 101.2, usd: 250_000 });
    const s = findWalls(bids, asks, 100)!;
    expect(s.bidWalls).toHaveLength(1);
    expect(s.bidWalls[0].price).toBeCloseTo(98.5, 1);
    expect(s.bidWalls[0].distancePct).toBeLessThan(0);
    expect(s.askWalls).toHaveLength(1);
    expect(s.askWalls[0].price).toBeCloseTo(101.2, 1);
    expect(s.depth[s.depth.length - 1].imbalance).toBeCloseTo((900_000 - 750_000) / 1_650_000, 2); // 50 flat levels x 10K per side, plus the 400K bid and 250K ask walls
    expect(s.coveragePct).toBe(5); // capped at the 5% scan band
    expect(s.read).toMatch(/buy wall/);
    expect(s.read).toMatch(/sell wall/);
  });

  it("finds nothing on a flat book", () => {
    const s = findWalls(flat(99.9, 95, 0.1, 10_000), flat(100.1, 105, 0.1, 10_000), 100)!;
    expect(s.bidWalls).toHaveLength(0);
    expect(s.askWalls).toHaveLength(0);
    expect(s.read).toMatch(/No outsized/);
  });
});
