import { describe, expect, it } from "vitest";
import { computeSurprise, magnitudeFromZ, scoreFromZ } from "../surprise";
import { EVENT_DEFS } from "../taxonomy";

const def = (id: string) => EVENT_DEFS.find((d) => d.id === id)!;

describe("surprise engine", () => {
  it("scores a 3-tenths cooler CPI as a large negative economic surprise", () => {
    const s = computeSurprise(def("cpi_mom"), 0.0, 0.3, 0.2);
    expect(s.delta).toBeCloseTo(-0.3);
    expect(s.zScore).toBeCloseTo(-3);
    expect(s.magnitude).toBe("extreme");
    expect(s.score).toBeLessThan(-80);
    expect(s.label).toMatch(/cooler than expected/i);
  });
  it("treats an in-line print as inline with score near zero", () => {
    const s = computeSurprise(def("nfp"), 190, 185, 150);
    expect(s.magnitude).toBe("inline");
    expect(Math.abs(s.score ?? 99)).toBeLessThan(10);
    expect(s.vsPrevious).toBe(40);
  });
  it("uses oil vocabulary and sign for inventories", () => {
    const s = computeSurprise(def("eia_crude"), -7.2, -2.1, 1.4);
    expect(s.delta).toBeCloseTo(-5.1);
    expect(s.label).toMatch(/bigger draw than expected/i);
    expect(s.magnitude).toBe("large");
  });
  it("never invents a surprise when actual or consensus is missing", () => {
    expect(computeSurprise(def("cpi_mom"), null, 0.3, 0.2).score).toBeNull();
    // No consensus and no previous: nothing to judge against.
    expect(computeSurprise(def("cpi_mom"), 0.3, null, null).score).toBeNull();
    // No consensus but a previous print: judged against previous and labelled as such.
    const prev = computeSurprise(def("cpi_mom"), 0.3, null, 0.2).label;
    expect(prev).toContain("no consensus published");
    expect(prev).not.toMatch(/than expected/);
    // Oil without a consensus: a draw after a build reads as a bigger draw than the prior print, bullish for WTI.
    const api = computeSurprise(def("api_crude"), -2.1, null, 1.0);
    expect(api.label).toMatch(/bigger draw than the prior print/i);
    expect(api.label).toContain("-2.1M bbl vs +1.0M bbl prior");
    expect(api.score!).toBeLessThan(0);
    expect(computeSurprise(def("cpi_mom"), null, 0.3, 0.2).label).toMatch(/awaiting/i);
  });
  it("honours a rolling SD override", () => {
    const prior = computeSurprise(def("cpi_mom"), 0.5, 0.3, 0.2);
    const wide = computeSurprise(def("cpi_mom"), 0.5, 0.3, 0.2, 0.4);
    expect(Math.abs(wide.zScore!)).toBeLessThan(Math.abs(prior.zScore!));
  });
  it("saturates the score smoothly", () => {
    expect(scoreFromZ(0)).toBe(0);
    expect(scoreFromZ(10)).toBeLessThanOrEqual(100);
    expect(scoreFromZ(-10)).toBeGreaterThanOrEqual(-100);
    expect(magnitudeFromZ(0.3)).toBe("inline");
    expect(magnitudeFromZ(2)).toBe("large");
  });
});

describe("no-consensus fallback", () => {
  it("judges against previous with a wider band and says so", async () => {
    const { computeSurprise } = await import("../surprise");
    const { EVENT_DEFS } = await import("../taxonomy");
    const def = EVENT_DEFS.find((d) => d.id === "api_crude")!;
    const r = computeSurprise(def, -5.0, null, 0.9);
    expect(r.score).not.toBeNull();
    expect(r.score! < 0).toBe(true);
    expect(r.label).toContain("no consensus published");
    expect(r.vsPrevious).toBeCloseTo(-5.9, 3);
    // Same delta vs consensus should score stronger than vs previous (1.5x SD).
    const c = computeSurprise(def, -5.0, 0.9, null);
    expect(Math.abs(c.score!)).toBeGreaterThan(Math.abs(r.score!));
  });
});
