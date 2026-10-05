import { describe, expect, it } from "vitest";
import { formatValue, matchEventDef, parseValue } from "../taxonomy";

describe("parseValue", () => {
  it("parses percentages, thousands, millions and barrels into the def unit", () => {
    expect(parseValue("2.8%", "pct")).toBe(2.8);
    expect(parseValue("185K", "k")).toBe(185);
    expect(parseValue("0.2M", "k")).toBe(200);
    expect(parseValue("7.56M", "m")).toBeCloseTo(7.56);
    expect(parseValue("-2.1M", "mb")).toBeCloseTo(-2.1);
    expect(parseValue("<4.50%", "pct")).toBe(4.5);
    expect(parseValue("55.1", "index")).toBe(55.1);
  });
  it("returns null for missing or garbage values instead of guessing", () => {
    expect(parseValue("", "pct")).toBeNull();
    expect(parseValue(null, "pct")).toBeNull();
    expect(parseValue("n/a", "pct")).toBeNull();
    expect(parseValue("—", "k")).toBeNull();
  });
});

describe("matchEventDef", () => {
  it("maps Fair Economy titles to canonical events", () => {
    expect(matchEventDef("CPI m/m")?.id).toBe("cpi_mom");
    expect(matchEventDef("Core CPI m/m")?.id).toBe("core_cpi_mom");
    expect(matchEventDef("Non-Farm Employment Change")?.id).toBe("nfp");
    expect(matchEventDef("Crude Oil Inventories")?.id).toBe("eia_crude");
    expect(matchEventDef("FOMC Press Conference")?.id).toBe("fomc_presser");
    expect(matchEventDef("Fed Chair Powell Speaks")?.id).toBe("fed_speech");
    expect(matchEventDef("Advance GDP q/q")?.id).toBe("gdp_qq");
  });
  it("does not match unrelated titles", () => {
    expect(matchEventDef("Bank Holiday")).toBeNull();
    expect(matchEventDef("Spanish Services PMI")).toBeNull();
  });
});

describe("formatValue", () => {
  it("formats by unit", () => {
    expect(formatValue(2.5, "pct", 1)).toBe("2.5%");
    expect(formatValue(185, "k", 0)).toBe("185K");
    expect(formatValue(-7.2, "mb", 1)).toBe("-7.2M bbl");
    expect(formatValue(null, "pct", 1)).toBe("—");
  });
});
