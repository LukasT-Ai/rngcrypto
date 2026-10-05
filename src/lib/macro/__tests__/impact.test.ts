import { describe, expect, it } from "vitest";
import { impactForSurprise, preReleaseMap } from "../impact";
import { classifyRegime } from "../regime";
import { EVENT_DEFS } from "../taxonomy";

const def = (id: string) => EVENT_DEFS.find((d) => d.id === id)!;
const base = { us2y: 4.4, us10y: 4.3, us2yChg5d: 0, dxy: 102, dxyChg5d: 0, vix: 18, spxChg5d: 0.5, cpiYoY: 2.9 };
const neutral = classifyRegime(base);
const inflationFocused = classifyRegime({ ...base, cpiYoY: 4.0, us2yChg5d: 0.2 });
const riskOff = classifyRegime({ ...base, vix: 30, spxChg5d: -4 });

const by = (list: ReturnType<typeof impactForSurprise>, a: "BTC" | "GOLD" | "WTI") => list.find((i) => i.asset === a)!;

describe("cross-asset impact mapping", () => {
  it("cooler CPI is bullish BTC and Gold, mixed/indirect for WTI", () => {
    const r = impactForSurprise(def("cpi_mom"), -85, "extreme", neutral);
    expect(by(r, "BTC").direction).toBe("bullish");
    expect(by(r, "GOLD").direction).toBe("bullish");
    expect(by(r, "GOLD").confidence).toBe("high");
    expect(["mixed", "bullish"]).toContain(by(r, "WTI").direction);
    expect(by(r, "BTC").channel.join(" ")).toMatch(/Yields ↓/);
  });
  it("hot CPI is bearish BTC and Gold, and more so in an inflation-focused regime", () => {
    const n = impactForSurprise(def("cpi_mom"), 70, "large", neutral);
    const f = impactForSurprise(def("cpi_mom"), 70, "large", inflationFocused);
    expect(by(n, "BTC").direction).toBe("bearish");
    expect(by(f, "GOLD").score).toBeLessThanOrEqual(by(n, "GOLD").score);
  });
  it("strong NFP is regime dependent: hawkish in inflation focus, relief in risk-off", () => {
    const f = impactForSurprise(def("nfp"), 70, "large", inflationFocused);
    const o = impactForSurprise(def("nfp"), 70, "large", riskOff);
    expect(by(f, "BTC").score).toBeLessThan(by(o, "BTC").score);
    expect(by(o, "BTC").score).toBeGreaterThan(0);
  });
  it("a bigger crude draw is bullish WTI; contradicting internals downgrade it to mixed", () => {
    const clean = impactForSurprise(def("eia_crude"), -75, "large", neutral);
    expect(by(clean, "WTI").direction).toBe("bullish");
    expect(by(clean, "WTI").confidence).toBe("high");
    const contradicted = impactForSurprise(def("eia_crude"), -75, "large", neutral, { cushing: 1.2, gasoline: 2.0, distillate: 1.5, production: 0.2, refineryUtil: 90 });
    expect(Math.abs(by(contradicted, "WTI").score)).toBeLessThan(Math.abs(by(clean, "WTI").score));
    expect(by(contradicted, "WTI").reason).toMatch(/contradict/i);
  });
  it("text events (FOMC presser) never claim a direction before the market speaks", () => {
    const r = impactForSurprise(def("fomc_presser"), null, null, neutral);
    for (const i of r) {
      expect(i.direction).toBe("mixed");
      expect(i.confidence).toBe("low");
    }
  });
  it("pre-release map is conditional, not a prediction", () => {
    const m = preReleaseMap(def("core_cpi_mom"), neutral);
    const btc = m.find((i) => i.asset === "BTC")!;
    expect(btc.direction).toBe("mixed");
    expect(btc.conditional?.ifBelow).toBe("bullish");
    expect(btc.conditional?.ifAbove).toBe("bearish");
  });
});
