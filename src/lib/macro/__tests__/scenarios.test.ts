import { describe, expect, it } from "vitest";
import { buildScenarios } from "../scenarios";
import { EVENT_DEFS } from "../taxonomy";
import type { MacroRegime } from "../types";

const def = (id: string) => EVENT_DEFS.find((d) => d.id === id)!;
const regime = { inflationFocus: "balanced", policyBias: "neutral", risk: "neutral" } as unknown as MacroRegime;

describe("scenario guide", () => {
  it("builds three bands around the consensus with oil vocabulary and WTI directions", () => {
    const g = buildScenarios(def("eia_crude"), { forecast: -2.0, previous: 1.0 }, regime, null, null)!;
    expect(g.anchorKind).toBe("consensus");
    expect(g.bands.map((b) => b.key)).toEqual(["below", "inline", "above"]);
    expect(g.bands[0].meaning).toMatch(/bigger draw than expected/i);
    expect(g.bands[2].meaning).toMatch(/bigger build than expected/i);
    expect(g.bands[0].directions.WTI).toBe("bullish");
    expect(g.bands[2].directions.WTI).toBe("bearish");
    expect(g.bands[1].directions.WTI).toBe("mixed");
    expect(g.bands.every((b) => !b.hit)).toBe(true);
  });
  it("falls back to the prior print with a wider band and marks the actual's band after release", () => {
    const g = buildScenarios(def("api_crude"), { forecast: null, previous: 1.0 }, regime, -2.1, null)!;
    expect(g.anchorKind).toBe("previous");
    expect(g.sdUsed).toBeCloseTo(2.5 * 1.5);
    expect(g.bands[0].meaning).toMatch(/than the prior print/i);
    expect(g.bands.filter((b) => b.hit).map((b) => b.key)).toEqual(["below"]);
    expect(g.note).toMatch(/No consensus published/);
  });
  it("marks in-line prints and returns null for text events or when nothing anchors", () => {
    const g = buildScenarios(def("cpi_mom"), { forecast: 0.3, previous: 0.2 }, regime, 0.3, null)!;
    expect(g.bands.find((b) => b.hit)?.key).toBe("inline");
    expect(buildScenarios(def("cpi_mom"), { forecast: null, previous: null }, regime, 0.3, null)).toBeNull();
    const text = EVENT_DEFS.find((d) => d.unit === "text");
    if (text) expect(buildScenarios(text, { forecast: null, previous: null }, regime, null, null)).toBeNull();
  });
});
