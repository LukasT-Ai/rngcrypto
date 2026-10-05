import { describe, expect, it } from "vitest";
import { formatCompactCountdown, formatCountdown, formatLocalTime, urgencyFor } from "../format";
import { classifyRegime } from "../regime";
import { referencePeriod } from "../releases";
import { EVENT_DEFS } from "../taxonomy";

describe("countdown / timezone", () => {
  it("formats hh:mm:ss under a day and days above", () => {
    expect(formatCountdown(2 * 3600 + 14 * 60 + 32)).toBe("02:14:32");
    expect(formatCountdown(14 * 60 + 7)).toBe("14:07");
    expect(formatCountdown(2 * 86400 + 3 * 3600)).toBe("2d 3h");
    expect(formatCountdown(-5)).toBe("00:00");
    expect(formatCompactCountdown(104 * 60)).toBe("1h 44m");
  });
  it("renders the same instant in the viewer's zone", () => {
    const iso = "2026-10-13T12:30:00.000Z";
    expect(formatLocalTime(iso, "America/New_York")).toMatch(/8:30 AM/);
    expect(formatLocalTime(iso, "Europe/Berlin")).toMatch(/2:30 PM/);
  });
  it("escalates urgency as release approaches", () => {
    expect(urgencyFor(30 * 3600)).toBe("normal");
    expect(urgencyFor(3 * 3600)).toBe("highlight");
    expect(urgencyFor(50 * 60)).toBe("strong");
    expect(urgencyFor(8 * 60)).toBe("urgent");
    expect(urgencyFor(30)).toBe("now");
  });
});

describe("release reference period", () => {
  it("monthly releases cover the prior month; JOLTS lags two", () => {
    const cpi = EVENT_DEFS.find((d) => d.id === "cpi_mom")!;
    const jolts = EVENT_DEFS.find((d) => d.id === "jolts")!;
    expect(referencePeriod(cpi, new Date("2026-10-13T12:30:00Z"))).toEqual({ year: 2026, month: 9 });
    expect(referencePeriod(jolts, new Date("2026-10-06T14:00:00Z"))).toEqual({ year: 2026, month: 8 });
    expect(referencePeriod(cpi, new Date("2026-01-14T13:30:00Z"))).toEqual({ year: 2025, month: 12 });
  });
});

describe("regime classification", () => {
  it("reads hawkish repricing from a rising 2Y and inflation focus from CPI", () => {
    const r = classifyRegime({ us2y: 4.6, us10y: 4.4, us2yChg5d: 0.2, dxy: 103, dxyChg5d: 0.8, vix: 15, spxChg5d: 1, cpiYoY: 3.8 });
    expect(r.policyBias).toBe("tightening");
    expect(r.inflationFocus).toBe("high");
    expect(r.risk).toBe("on");
  });
  it("reads risk-off from VIX and a falling S&P, and lowers confidence with missing inputs", () => {
    const r = classifyRegime({ us2y: null, us10y: null, us2yChg5d: null, dxy: null, dxyChg5d: null, vix: 28, spxChg5d: -3, cpiYoY: null });
    expect(r.risk).toBe("off");
    expect(r.confidence).toBe("low");
  });
});
