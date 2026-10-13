import { describe, it, expect } from "vitest";
import { aggregateHeadlines, headlineWeight, REJECTED_NARRATIVE_WEIGHT, type CatalystEvent } from "./catalyst-news";

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const H = 3600e3;

function ev(p: Partial<CatalystEvent> & { score: number; ageH: number }): CatalystEvent {
  const { ageH, ...rest } = p;
  return {
    title: rest.title ?? `headline ${rest.score}`,
    url: "https://example.com",
    source: "Reuters",
    publishedAt: new Date(NOW - ageH * H).toISOString(),
    category: rest.category ?? "ETF_FLOWS",
    sentiment: rest.score >= 10 ? "bullish" : rest.score <= -10 ? "bearish" : "neutral",
    impact: rest.impact ?? "medium",
    priceReaction: null,
    confirms: rest.confirms ?? null,
    w: 0,
    inNet: rest.inNet ?? (rest.category ?? "ETF_FLOWS") !== "GENERAL",
    ...rest,
  };
}

describe("headlineWeight", () => {
  it("is 1 at age 0 and halves every half-life", () => {
    expect(headlineWeight(0, 12, null)).toBe(1);
    expect(headlineWeight(12 * H, 12, null)).toBeCloseTo(0.5, 6);
    expect(headlineWeight(24 * H, 12, null)).toBeCloseTo(0.25, 6);
    expect(headlineWeight(6 * H, 6, true)).toBeCloseTo(0.5, 6);
    expect(headlineWeight(70 * H, 12, null)).toBeLessThan(0.02);
  });
  it("multiplies by 0.3 when the market already rejected the narrative, not when undecided", () => {
    expect(headlineWeight(0, 12, false)).toBeCloseTo(REJECTED_NARRATIVE_WEIGHT, 6);
    expect(headlineWeight(0, 12, true)).toBe(1);
    expect(headlineWeight(0, 12, null)).toBe(1);
  });
  it("treats negative ages (clock skew) as fresh", () => {
    expect(headlineWeight(-5 * H, 12, null)).toBe(1);
  });
});

describe("aggregateHeadlines: exponential decay", () => {
  it("weights a fresh headline over an old one instead of the 2/1.25/1 steps", () => {
    const events = [ev({ score: 60, ageH: 0 }), ev({ score: -60, ageH: 24 })];
    const r = aggregateHeadlines(events, 12, NOW);
    // w = 1 and 0.25 -> (60 - 15) / 1.25 = 36
    expect(r.netScore).toBe(36);
    expect(events[0].w).toBe(1);
    expect(events[1].w).toBe(0.25);
    expect(r.scoredCount).toBe(2);
    expect(r.hiBlend).toBe(false);
  });
  it("uses the asset half-life (6h OIL decays faster than 12h BTC)", () => {
    const mk = () => [ev({ score: 60, ageH: 0 }), ev({ score: -60, ageH: 12 })];
    expect(aggregateHeadlines(mk(), 12, NOW).netScore).toBe(20); // (60 - 30) / 1.5
    expect(aggregateHeadlines(mk(), 6, NOW).netScore).toBe(36); // (60 - 15) / 1.25
  });
  it("gives two equal-age headlines equal weight regardless of age", () => {
    const r = aggregateHeadlines([ev({ score: 40, ageH: 50 }), ev({ score: -20, ageH: 50 })], 12, NOW);
    expect(r.netScore).toBe(10);
  });
});

describe("aggregateHeadlines: confirms weighting", () => {
  it("a rejected narrative counts 0.3x so a confirmed opposing headline wins", () => {
    const events = [ev({ score: 60, ageH: 1, confirms: false }), ev({ score: -40, ageH: 1, confirms: true })];
    const r = aggregateHeadlines(events, 12, NOW);
    const d = Math.pow(2, -1 / 12);
    const expected = Math.round((60 * d * 0.3 + -40 * d) / (d * 0.3 + d));
    expect(r.netScore).toBe(expected);
    expect(r.netScore).toBeLessThan(0);
    expect(events[0].w).toBeCloseTo(d * 0.3, 2);
    expect(events[1].w).toBeCloseTo(d, 2);
  });
  it("confirms === true and null carry full weight", () => {
    const a = aggregateHeadlines([ev({ score: 50, ageH: 2, confirms: true }), ev({ score: -50, ageH: 2, confirms: null })], 12, NOW);
    expect(a.netScore).toBe(0);
  });
  it("the category weight share follows the confirms-weighted totals", () => {
    const events = [ev({ score: 50, ageH: 0, category: "MACRO", confirms: false }), ev({ score: -50, ageH: 0, category: "REGULATION", confirms: true })];
    const r = aggregateHeadlines(events, 12, NOW);
    expect(r.catWeighted.get("MACRO")).toBeCloseTo(15, 6);
    expect(r.catWeighted.get("REGULATION")).toBeCloseTo(-50, 6);
    expect(r.absWeightedTotal).toBeCloseTo(65, 6);
  });
});

describe("aggregateHeadlines: GENERAL rule exclusion", () => {
  it("price-reporting headlines never vote, carry w = 0 and are reported separately", () => {
    const events = [
      ev({ score: 55, ageH: 0, category: "GENERAL", title: "Bitcoin surges to record high" }),
      ev({ score: 45, ageH: 0, category: "GENERAL", title: "Bitcoin climbs again" }),
      ev({ score: -30, ageH: 0, category: "ETF_FLOWS", title: "Bitcoin ETFs see outflows" }),
    ];
    const r = aggregateHeadlines(events, 12, NOW);
    expect(r.netScore).toBe(-30);
    expect(r.scoredCount).toBe(1);
    expect(events[0].w).toBe(0);
    expect(events[1].w).toBe(0);
    expect(events[2].w).toBe(1);
    expect(r.catWeighted.has("GENERAL")).toBe(false);
    expect(r.generalScore).toBe(50);
  });
  it("with only GENERAL headlines the net is 0 and generalScore still reports", () => {
    const r = aggregateHeadlines([ev({ score: 55, ageH: 0, category: "GENERAL" })], 12, NOW);
    expect(r.netScore).toBe(0);
    expect(r.scoredCount).toBe(0);
    expect(r.generalScore).toBe(55);
  });
  it("generalScore is null when there are no GENERAL rows, and zero-score rows are skipped", () => {
    const r = aggregateHeadlines([ev({ score: 0, ageH: 0 }), ev({ score: 20, ageH: 0 })], 12, NOW);
    expect(r.generalScore).toBeNull();
    expect(r.scoredCount).toBe(1);
    expect(r.netScore).toBe(20);
  });
});

describe("aggregateHeadlines: high-impact blend", () => {
  it("blends 60/40 with the mean of >= 3 high-impact headlines from the last 12h, ignoring GENERAL", () => {
    const events = [
      ev({ score: 60, ageH: 1, impact: "high" }),
      ev({ score: 60, ageH: 2, impact: "high" }),
      ev({ score: 60, ageH: 3, impact: "high" }),
      ev({ score: 60, ageH: 1, impact: "high", category: "GENERAL" }),
      ev({ score: -60, ageH: 1, impact: "low" }),
    ];
    const r = aggregateHeadlines(events, 12, NOW);
    expect(r.hiBlend).toBe(true);
    // decayed mean of the four in-net rows is positive but < 60; blended toward the high-impact mean 60
    const d = (h: number) => Math.pow(2, -h / 12);
    const plain = Math.round((60 * d(1) + 60 * d(2) + 60 * d(3) - 60 * d(1)) / (d(1) + d(2) + d(3) + d(1)));
    expect(r.netScore).toBe(Math.round(plain * 0.4 + 60 * 0.6));
  });
  it("does not blend with only two recent high-impact headlines", () => {
    const r = aggregateHeadlines([ev({ score: 60, ageH: 1, impact: "high" }), ev({ score: 60, ageH: 13, impact: "high" }), ev({ score: 60, ageH: 2, impact: "high" })], 12, NOW);
    expect(r.hiBlend).toBe(false);
  });
});
