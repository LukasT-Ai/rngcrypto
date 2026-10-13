import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSessionFeature, isWeekend, sessionName, sessionVolScale } from "../session";
import { buildMacroRatesFeature, change5d, parseTreasuryRealYield, parseYahooDaily, rollingCorr, type DailyPoint } from "@/lib/macro/treasury";
import { buildStablecoinFeature, parseMints, parseSupplyChart, sevenDayChanges } from "@/lib/macro/stablecoins";

const fx = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("session feature", () => {
  it("session buckets by UTC hour", () => {
    expect(sessionName(new Date(Date.UTC(2026, 9, 14, 3)))).toBe("asia");
    expect(sessionName(new Date(Date.UTC(2026, 9, 14, 9)))).toBe("london");
    expect(sessionName(new Date(Date.UTC(2026, 9, 14, 13, 30)))).toBe("us");
    expect(sessionName(new Date(Date.UTC(2026, 9, 14, 21)))).toBe("off");
  });
  it("weekend window Fri 21:00 to Sun 23:00 UTC", () => {
    expect(isWeekend(new Date(Date.UTC(2026, 9, 16, 20)))).toBe(false); // Friday 20:00
    expect(isWeekend(new Date(Date.UTC(2026, 9, 16, 21)))).toBe(true);
    expect(isWeekend(new Date(Date.UTC(2026, 9, 17, 12)))).toBe(true); // Saturday
    expect(isWeekend(new Date(Date.UTC(2026, 9, 18, 22)))).toBe(true); // Sunday 22:00
    expect(isWeekend(new Date(Date.UTC(2026, 9, 18, 23)))).toBe(false);
  });
  it("vol scale and gates", () => {
    expect(sessionVolScale("us", false)).toBe(1.3);
    expect(sessionVolScale("asia", false)).toBe(0.8);
    expect(sessionVolScale("us", true)).toBe(0.7);
    const late = buildSessionFeature(Date.UTC(2026, 9, 14, 22), true);
    expect(late.gate).toBe("late_utc");
    expect(late.lowLiquidity).toBe(true);
    const goldWeekend = buildSessionFeature(Date.UTC(2026, 9, 17, 12), false);
    expect(goldWeekend.gate).toBe("nonc_weekend");
    expect(goldWeekend.haircutPct).toBe(10);
    expect(goldWeekend.volScale).toBe(0.7);
    const us = buildSessionFeature(Date.UTC(2026, 9, 14, 15), true);
    expect(us).toMatchObject({ name: "us", gate: "none", weekend: false, haircutPct: 0, volScale: 1.3, hourUtc: 15 });
  });
});

describe("macroRates feature", () => {
  const ry = parseTreasuryRealYield(fx("treasury-real-yield-202610.xml"));
  const dxy = parseYahooDaily(JSON.parse(fx("yahoo-dxy-daily.json")));

  it("parses the Treasury XML (TC_10YEAR) and Yahoo daily closes", () => {
    expect(ry.length).toBeGreaterThan(5);
    expect(ry[0]).toEqual({ day: "2026-10-01", value: 2.88 });
    expect(ry[ry.length - 1].value).toBeCloseTo(2.91, 2);
    expect(parseTreasuryRealYield(null)).toEqual([]);
    expect(dxy.length).toBeGreaterThan(50);
    expect(dxy[dxy.length - 1].value).toBeCloseTo(102.427, 2);
    expect(new Set(dxy.map((p) => p.day)).size).toBe(dxy.length);
  });
  it("5-day changes", () => {
    expect(change5d(ry)).toBeCloseTo(ry[ry.length - 1].value - ry[ry.length - 6].value, 9);
    expect(change5d(ry.slice(0, 4))).toBeNull();
  });
  it("corr gate: a perfectly anti-correlated asset passes, an unrelated one is silenced", () => {
    const days = dxy.slice(-40);
    const anti: DailyPoint[] = days.map((p) => ({ day: p.day, value: 1000 / p.value }));
    expect(rollingCorr(anti, days, true)).toBeCloseTo(-1, 6);
    const f = buildMacroRatesFeature({ realYield: ry, dxy, fetchedAt: 0 }, anti, Date.UTC(2026, 9, 13))!;
    expect(f.corrDxy30d).toBeCloseTo(-1, 3);
    expect(f.gated).toBe(false);
    expect(f.corr30d).toBe(f.corrDxy30d);
    expect(f.dxy5dChgPct).toBeCloseTo((dxy[dxy.length - 1].value / dxy[dxy.length - 6].value - 1) * 100, 1);
    expect(f.realYield5dChgBp).toBeCloseTo(change5d(ry)! * 100, 0);
    expect(f.realYieldSeries.length).toBeLessThanOrEqual(20);
    expect(f.dxySeries).toHaveLength(20);
    // Alternating asset returns are uncorrelated with the dollar: silenced.
    const noise: DailyPoint[] = days.map((p, i) => ({ day: p.day, value: 100 + (i % 2) }));
    const g = buildMacroRatesFeature({ realYield: ry, dxy, fetchedAt: 0 }, noise)!;
    expect(Math.abs(g.corrDxy30d ?? 0)).toBeLessThan(0.3);
    // No asset history at all: gated, correlations null.
    const h = buildMacroRatesFeature({ realYield: ry, dxy, fetchedAt: 0 }, [])!;
    expect(h.corr30d).toBeNull();
    expect(h.gated).toBe(true);
    expect(buildMacroRatesFeature(null, [])).toBeNull();
  });
});

describe("stablecoin feature", () => {
  const series = parseSupplyChart(JSON.parse(fx("llama-stablecoincharts.json")));
  const mints = parseMints(JSON.parse(fx("llama-stablecoins.json")));

  it("parses the chart and the per-coin mints", () => {
    expect(series).toHaveLength(400);
    expect(series[399].usd).toBeGreaterThan(3e11);
    expect(mints.usdt).toBeCloseTo(183994159032.73584 - 184049272270.11313, 0);
    expect(mints.usdc).not.toBeNull();
    expect(parseMints(null)).toEqual({ usdt: null, usdc: null });
  });
  it("7-day changes, z and flags", () => {
    const changes = sevenDayChanges(series);
    expect(changes).toHaveLength(393);
    expect(changes[392]).toBeCloseTo((series[399].usd / series[392].usd - 1) * 100, 9);
    const f = buildStablecoinFeature(series, mints, series[399].ts + 3600e3)!;
    expect(f.supply7dChgPct).toBeCloseTo(changes[392], 3);
    expect(f.z).not.toBeNull();
    expect(f.flag === null || f.flag === "tailwind" || f.flag === "headwind").toBe(true);
    expect(f.mintFlag).toBe(false);
    const big = buildStablecoinFeature(series, { usdt: 600e6, usdc: null })!;
    expect(big.mintFlag).toBe(true);
    // A 10% jump in a week is a many-sigma tailwind.
    const pumped = [...series, { ts: series[399].ts + 86400e3, usd: series[399].usd * 1.1 }];
    expect(buildStablecoinFeature(pumped, mints)!.flag).toBe("tailwind");
    expect(buildStablecoinFeature([], mints)).toBeNull();
  });
});
