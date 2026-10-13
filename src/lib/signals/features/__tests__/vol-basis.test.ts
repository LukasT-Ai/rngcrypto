import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildVolFeature, dvolStopMult, expectedMovePct, parseDvol } from "../deribit";
import { annualizedBasisPct, basisZ, buildBasisFeature, computeBasis, parseDatedFutures, parseExpiry, recordDailySample } from "../basis";

const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"));

describe("DVOL feature", () => {
  const bars = parseDvol(fx("deribit-dvol-btc-daily.json"));

  it("parses daily OHLC closes ascending", () => {
    expect(bars.length).toBeGreaterThan(390);
    expect(bars[0].ts).toBeLessThan(bars[1].ts);
    expect(bars[bars.length - 1].close).toBeCloseTo(36.99, 2);
    expect(parseDvol(null)).toEqual([]);
  });
  it("expected move from DVOL: 1 sd 24h = DVOL / sqrt(365), 4h = DVOL / sqrt(365 * 6)", () => {
    expect(expectedMovePct(50, 24)).toBeCloseTo(50 / Math.sqrt(365), 9);
    expect(expectedMovePct(50, 4)).toBeCloseTo(50 / Math.sqrt(365 * 6), 9);
  });
  it("builds percentiles, change and USD moves", () => {
    const now = bars[bars.length - 1].ts + 3600e3;
    const f = buildVolFeature(bars, 80_000, now)!;
    expect(f.dvol).toBeCloseTo(36.99, 2);
    expect(f.dvolPct).not.toBeNull();
    expect(f.dvolPct!).toBeGreaterThanOrEqual(0);
    expect(f.dvolPct!).toBeLessThanOrEqual(100);
    expect(f.dvolPct90d).not.toBeNull();
    expect(f.change24hPct).toBeCloseTo(((36.99 - 37.71) / 37.71) * 100, 1);
    expect(f.expectedMove24hPct).toBeCloseTo(36.99 / Math.sqrt(365), 2);
    expect(f.expectedMove24hUsd).toBeCloseTo((80_000 * f.expectedMove24hPct) / 100, 0);
    expect(f.expectedMove4hUsd).toBeLessThan(f.expectedMove24hUsd!);
    expect(buildVolFeature(bars, null, now)!.expectedMove24hUsd).toBeNull();
    expect(buildVolFeature([], 1)).toBeNull();
  });
  it("percentile reads 100 for a record high and null below 30 bars", () => {
    const spike = [...bars, { ts: bars[bars.length - 1].ts + 86400e3, close: 999 }];
    expect(buildVolFeature(spike, 1)!.dvolPct).toBeGreaterThan(99);
    expect(buildVolFeature(bars.slice(-5), 1)!.dvolPct).toBeNull();
  });
  it("stop multiplier helper for be-strategy", () => {
    expect(dvolStopMult(null)).toBe(1);
    expect(dvolStopMult(50)).toBe(1);
    expect(dvolStopMult(100)).toBe(1.15);
    expect(dvolStopMult(0)).toBe(0.85);
  });
});

describe("basis feature", () => {
  const futures = parseDatedFutures(fx("deribit-futures-btc.json"));
  const NOW = Date.UTC(2026, 9, 13, 5);

  it("parses Deribit dated names and skips the perpetual", () => {
    expect(parseExpiry("BTC-27NOV26")).toBe(Date.UTC(2026, 10, 27, 8));
    expect(parseExpiry("BTC-PERPETUAL")).toBeNull();
    expect(futures.map((f) => f.instrument)).not.toContain("BTC-PERPETUAL");
    expect(futures[0].expiry).toBeLessThan(futures[1].expiry);
    expect(futures.every((f) => f.index > 0 && f.mark > 0)).toBe(true);
  });
  it("annualizes basis", () => {
    expect(annualizedBasisPct(105, 100, 365)).toBeCloseTo(5, 9);
    expect(annualizedBasisPct(101, 100, 91.25)).toBeCloseTo(4, 9);
    expect(annualizedBasisPct(100, 100, 0)).toBeNull();
  });
  it("picks the nearest quarterly beyond 30d, slopes 6m-3m, reads stress off the front", () => {
    const snap = computeBasis(futures, NOW)!;
    // Nearest expiry beyond 30 days on 2026-10-13 is BTC-27NOV26 (45 days): 84165.3 vs 83569.38.
    expect(snap.annPct).toBeCloseTo((84165.3 / 83569.38 - 1) * (365 / ((Date.UTC(2026, 10, 27, 8) - NOW) / 86400e3)) * 100, 2);
    expect(snap.stress).toBe(false);
    expect(snap.front!.instrument).toBe("BTC-23OCT26"); // first dated future >= 7 days out
    expect(snap.curveSlope).not.toBeNull();
    expect(Math.abs(snap.curveSlope!)).toBeLessThan(5);
  });
  it("backwardation on the front future sets stress", () => {
    const back = futures.map((f) => ({ ...f, mark: f.index * 0.99 }));
    expect(computeBasis(back, NOW)!.stress).toBe(true);
    expect(computeBasis(back, NOW)!.annPct).toBeLessThan(0);
    expect(computeBasis([], NOW)).toBeNull();
  });
  it("daily sample store keeps one sample per day, max 90, and z needs 10", () => {
    let samples: { day: string; annPct: number }[] = [];
    for (let i = 0; i < 100; i++) samples = recordDailySample(samples, `2026-01-${String((i % 28) + 1).padStart(2, "0")}-${Math.floor(i / 28)}`, i);
    expect(samples.length).toBeLessThanOrEqual(90);
    samples = recordDailySample(samples, "2026-05-01", 1);
    samples = recordDailySample(samples, "2026-05-01", 2); // same day overwrites
    expect(samples.filter((s) => s.day === "2026-05-01")).toEqual([{ day: "2026-05-01", annPct: 2 }]);
    expect(basisZ(samples.slice(0, 5), 3)).toBeNull();
    const flat = Array.from({ length: 20 }, (_, i) => ({ annPct: 5 + (i % 2 ? 0.5 : -0.5) }));
    expect(basisZ(flat, 10)).toBeGreaterThan(2);
    const f = buildBasisFeature(computeBasis(futures, NOW), flat.map((x, i) => ({ day: `d${i}`, annPct: x.annPct })), NOW)!;
    expect(f.n).toBe(20);
    expect(f.z).not.toBeNull();
    expect(buildBasisFeature(null, [], NOW)).toBeNull();
  });
});
