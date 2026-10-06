import { describe, expect, it } from "vitest";
import { fxActualFor, fxDefFor, fxToScheduled, fxValue, type FxItem } from "../fxstreet";

const item = (p: Partial<FxItem>): FxItem => ({ id: "i", eventId: "e", dateUtc: "2026-10-06T20:30:00Z", name: "API Weekly Crude Oil Stock", countryCode: "US", volatility: "LOW", consensus: null, previous: 1.786, revised: null, actual: null, unit: null, potency: "M", ...p });

describe("fxstreet adapter", () => {
  it("maps FXStreet names to taxonomy defs", () => {
    expect(fxDefFor("Consumer Price Index (MoM)")?.id).toBe("cpi_mom");
    expect(fxDefFor("Consumer Price Index ex Food & Energy (MoM)")?.id).toBe("core_cpi_mom");
    expect(fxDefFor("Nonfarm Payrolls")?.id).toBe("nfp");
    expect(fxDefFor("Fed's Waller speech")?.id).toBe("fed_speech");
    expect(fxDefFor("EIA Crude Oil Stocks Change")?.id).toBe("eia_crude");
    expect(fxDefFor("API Weekly Crude Oil Stock")?.id).toBe("api_crude");
    expect(fxDefFor("Fed Interest Rate Decision")?.id).toBe("fed_funds");
    expect(fxDefFor("ADP Employment Change 4-week average")).toBeNull();
    expect(fxDefFor("Columbus Day")).toBeNull();
  });
  it("keeps values in display scale and rescales only on potency mismatch", () => {
    expect(fxValue(90, "K", "k")).toBe(90);
    expect(fxValue(7.23, "M", "m")).toBe(7.23);
    expect(fxValue(-0.3, "M", "mb")).toBe(-0.3);
    expect(fxValue(1.5, "M", "k")).toBe(1500);
    expect(fxValue(0.4, null, "pct")).toBe(0.4);
    expect(fxValue(null, "K", "k")).toBeNull();
  });
  it("builds scheduled events with consensus/previous and marks revised previous", () => {
    const items = [
      item({}),
      item({ name: "EIA Crude Oil Stocks Change", dateUtc: "2026-10-07T14:30:00Z", consensus: 2.1, previous: 0.9 }),
      item({ name: "Nonfarm Payrolls", dateUtc: "2026-11-06T12:30:00Z", consensus: 90, previous: 29, revised: 35, potency: "K" }),
      item({ name: "Nonfarm Payrolls", dateUtc: "2026-11-06T12:30:00Z", consensus: 90, previous: 29, potency: "K" }), // duplicate day → dropped
    ];
    const from = Date.parse("2026-10-01T00:00:00Z");
    const to = Date.parse("2026-11-30T00:00:00Z");
    const ev = fxToScheduled(items, from, to, "now");
    expect(ev.map((e) => e.id)).toEqual(["api_crude-2026-10-06", "eia_crude-2026-10-07", "nfp-2026-11-06"]);
    expect(ev[0].forecast).toBeNull();
    expect(ev[0].previousRaw).toBe("+1.8M bbl");
    expect(ev[1].forecastRaw).toBe("+2.1M bbl");
    expect(ev[2].previous).toBe(35);
    expect(ev[2].previousRaw).toBe("35K (rev.)");
    expect(ev[2].source).toBe("fxstreet");
  });
  it("finds a published actual near the event time only", () => {
    const items = [item({ actual: -3.4, lastUpdated: 1791400000 })];
    expect(fxActualFor(items, "api_crude", "2026-10-06T20:30:00Z")?.value).toBe(-3.4);
    expect(fxActualFor(items, "api_crude", "2026-10-13T20:30:00Z")).toBeNull();
    expect(fxActualFor(items, "eia_crude", "2026-10-06T20:30:00Z")).toBeNull();
  });
});
