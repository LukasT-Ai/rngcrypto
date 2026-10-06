import { describe, expect, it } from "vitest";
import { summarizeOutcome } from "../outcome";
import { defFor } from "../calendar";
import type { EventState, ScheduledEvent } from "../types";

const T0 = Date.parse("2026-10-06T14:30:00.000Z");

function baseState(defId: string, over: Partial<EventState> = {}): EventState {
  const def = defFor(defId);
  const event: ScheduledEvent = {
    id: `${defId}-${T0}`,
    defId,
    title: def.title,
    time: new Date(T0).toISOString(),
    importance: "high",
    forecast: 1.1,
    forecastRaw: "1.1M",
    previous: -2.0,
    previousRaw: "-2.0M",
    unit: "mb",
    source: "faireconomy",
    retrievedAt: new Date(T0).toISOString(),
  } as ScheduledEvent;
  return {
    event,
    def,
    phase: "released",
    secondsToRelease: -600,
    scenarios: null,
    preMap: [
      { asset: "BTC", direction: "mixed", score: 0, confidence: "low", horizon: { immediate: "mixed", shortTerm: "mixed", swing: "mixed" }, channel: [], reason: "" },
      { asset: "GOLD", direction: "mixed", score: 0, confidence: "low", horizon: { immediate: "mixed", shortTerm: "mixed", swing: "mixed" }, channel: [], reason: "" },
      { asset: "WTI", direction: "bullish", score: 40, confidence: "medium", horizon: { immediate: "bullish", shortTerm: "bullish", swing: "mixed" }, channel: [], reason: "" },
    ],
    release: null,
    surprise: null,
    postImpact: null,
    confirmation: null,
    reactions: [],
    releaseSnapshot: null,
    historical: null,
    dataAgeMs: null,
    alerts: [],
    outcome: null,
    ...over,
  };
}

describe("summarizeOutcome", () => {
  it("is null before the release time", () => {
    expect(summarizeOutcome(baseState("eia_crude"), T0 - 1000)).toBeNull();
  });

  it("says awaiting shortly after release with no data", () => {
    const o = summarizeOutcome(baseState("eia_crude"), T0 + 2 * 60e3)!;
    expect(o.status).toBe("awaiting");
    expect(o.headline).toMatch(/awaiting verified actual/i);
    expect(o.impact).toMatch(/No market reaction samples|pending/);
    expect(o.basedOn).toBeNull();
  });

  it("falls back to market reaction for events with no machine-readable source", () => {
    const st = baseState("eia_crude", {
      release: { eventId: "x", status: "unavailable", actual: null, candidates: [], note: "No authoritative source", checkedAt: new Date().toISOString() },
      reactions: [
        { label: "5m", at: "", changesPct: { dxy: 0.05, us2y: 0, us10y: 0, spx: 0.1, ndx: 0.1, vix: -0.3, btc: 0.1, gold: -0.05, wti: 0.9 } },
        { label: "15m", at: "", changesPct: { dxy: 0.05, us2y: 0, us10y: 0, spx: 0.1, ndx: 0.1, vix: -0.3, btc: 0.2, gold: -0.1, wti: 1.4 } },
      ],
    });
    const o = summarizeOutcome(st, T0 + 60 * 60e3)!;
    expect(o.status).toBe("unverified");
    expect(o.headline).toMatch(/No verified actual/);
    expect(o.basedOn).toBe("15m");
    expect(o.impact).toContain("WTI +1.40%");
    expect(o.direction).toBe("bullish");
    expect(o.perAsset.find((p) => p.asset === "WTI")!.observed).toBe("bullish");
    expect(o.perAsset.find((p) => p.asset === "BTC")!.observed).toBe("mixed");
  });

  it("reports actual vs forecast and the confirmation read when verified", () => {
    const st = baseState("eia_crude", {
      release: {
        eventId: "x",
        status: "verified",
        actual: { value: -3.2, raw: "-3.2", period: "", revisionStatus: "unknown", provider: "EIA", series: "", sourceTimestamp: null, retrievedAt: "", priorRevised: null },
        candidates: [],
        note: "ok",
        checkedAt: "",
      },
      surprise: { delta: -4.3, unit: "mb", zScore: -2.1, score: -82, magnitude: "large", label: "Significantly a bigger draw than expected (-4.3M vs consensus)", vsPrevious: -1.2 } as EventState["surprise"],
      postImpact: [
        { asset: "BTC", direction: "mixed", score: 0, confidence: "low", horizon: { immediate: "mixed", shortTerm: "mixed", swing: "mixed" }, channel: [], reason: "" },
        { asset: "GOLD", direction: "mixed", score: 0, confidence: "low", horizon: { immediate: "mixed", shortTerm: "mixed", swing: "mixed" }, channel: [], reason: "" },
        { asset: "WTI", direction: "bullish", score: 70, confidence: "high", horizon: { immediate: "bullish", shortTerm: "bullish", swing: "mixed" }, channel: [], reason: "" },
      ],
      reactions: [{ label: "15m", at: "", changesPct: { dxy: 0, us2y: 0, us10y: 0, spx: 0, ndx: 0, vix: 0, btc: 0, gold: 0, wti: 1.1 } }],
      confirmation: {
        status: "confirmed",
        pct: 75,
        checks: [],
        perAsset: {
          BTC: { status: "awaiting", direction: "mixed", note: "" },
          GOLD: { status: "awaiting", direction: "mixed", note: "" },
          WTI: { status: "confirmed", direction: "bullish", note: "" },
        },
        summary: "",
        basedOn: "15m",
        asOf: "",
      },
    });
    const o = summarizeOutcome(st, T0 + 20 * 60e3)!;
    expect(o.status).toBe("verified");
    expect(o.headline).toContain("vs 1.1M forecast");
    expect(o.headline).toContain("bigger draw than expected");
    expect(o.headline).not.toContain("vs consensus");
    expect(o.confirmationNote).toBe("Expected reaction confirmed (75%) @15m");
    expect(o.perAsset.find((p) => p.asset === "WTI")!.status).toBe("confirmed");
  });
});
