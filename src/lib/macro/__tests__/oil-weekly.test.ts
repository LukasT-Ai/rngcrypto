import { describe, expect, it } from "vitest";
import { buildWeeklyOil } from "../oil-weekly";
import type { ScheduledEvent, StoredRelease } from "../types";

const NOW = Date.parse("2026-10-12T12:00:00Z");

const ev = (defId: string, time: string, extra: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  id: `${defId}-${time.slice(0, 10)}`,
  defId,
  title: defId,
  time,
  importance: "high",
  forecast: null,
  forecastRaw: null,
  previous: null,
  previousRaw: null,
  unit: "mb",
  source: "fxstreet",
  retrievedAt: new Date(NOW).toISOString(),
  ...extra,
});

const rec = (defId: string, eventTime: string, actual: number | null, extra: Partial<StoredRelease> = {}): StoredRelease => ({
  id: `${defId}-${eventTime.slice(0, 10)}`,
  defId,
  eventTime,
  forecast: null,
  previous: null,
  actual,
  actualRaw: null,
  surpriseScore: null,
  magnitude: "inline",
  regime: { inflationFocus: "balanced", policyBias: "neutral", risk: "neutral" } as unknown as StoredRelease["regime"],
  releaseSnapshot: null,
  reactions: [],
  confirmation: null,
  recordedAt: eventTime,
  ...extra,
});

describe("weekly oil inventories", () => {
  it("pairs the latest stored print with the next scheduled release", () => {
    const upcoming = [
      ev("eia_crude", "2026-10-15T16:00:00Z", { previous: -3.2, previousRaw: "-3.2M bbl" }),
      ev("eia_crude", "2026-10-21T14:30:00Z"),
      ev("api_crude", "2026-10-14T20:30:00Z", { previous: -2.1, previousRaw: "-2.1M bbl" }),
    ];
    const stored = [
      rec("eia_crude", "2026-10-07T14:30:00Z", -3.186, { forecast: -1.5, surpriseScore: -0.7, magnitude: "small", actualProvider: "FXSTREET" }),
      rec("eia_crude", "2026-09-30T14:30:00Z", 1.8),
      rec("api_crude", "2026-10-06T20:30:00Z", -2.1),
    ];
    const out = buildWeeklyOil(upcoming, stored, NOW);
    const eia = out.find((r) => r.defId === "eia_crude")!;
    expect(eia.next?.time).toBe("2026-10-15T16:00:00Z");
    expect(eia.last).toMatchObject({ actual: -3.186, actualRaw: "-3.2M bbl", forecast: -1.5, magnitude: "small", source: "stored", provider: "FXSTREET" });
    const api = out.find((r) => r.defId === "api_crude")!;
    expect(api.next?.time).toBe("2026-10-14T20:30:00Z");
    expect(api.last?.actual).toBe(-2.1);
  });

  it("falls back to the calendar's previous field when nothing was recorded", () => {
    const upcoming = [ev("eia_crude", "2026-10-15T16:00:00Z", { previous: -3.2, previousRaw: "-3.2M bbl" })];
    const [eia] = buildWeeklyOil(upcoming, [], NOW);
    expect(eia.last).toMatchObject({ actual: -3.2, actualRaw: "-3.2M bbl", source: "calendar" });
    expect(eia.last?.eventTime).toBe("2026-10-08T16:00:00.000Z");
  });

  it("ignores stored records without an actual and events already past", () => {
    const upcoming = [ev("eia_crude", "2026-10-07T14:30:00Z")];
    const out = buildWeeklyOil(upcoming, [rec("eia_crude", "2026-10-07T14:30:00Z", null)], NOW);
    expect(out[0].next).toBeNull();
    expect(out[0].last).toBeNull();
  });
});
