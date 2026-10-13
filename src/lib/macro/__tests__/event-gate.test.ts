import { describe, expect, it } from "vitest";
import { computeEventWindow, firstFiveMinuteMove, firstMoveGate, gateEligible, NO_WINDOW, profileFor, windowFor, type GateEvent } from "../event-gate";

const T0 = Date.parse("2026-10-14T12:30:00Z");
const min = (m: number) => T0 + m * 60e3;

function ev(over: Partial<GateEvent> = {}): GateEvent {
  return { id: "cpi", title: "CPI m/m", time: T0, importance: "critical", kind: "inflation", relevance: 0.9, surpriseDir: null, confirmation: null, ...over };
}

describe("gate eligibility", () => {
  it("needs high or critical importance and relevance >= 0.3 for the lens", () => {
    expect(gateEligible(ev())).toBe(true);
    expect(gateEligible(ev({ importance: "medium" }))).toBe(false);
    expect(gateEligible(ev({ relevance: 0.29 }))).toBe(false);
    expect(gateEligible(ev({ importance: "high", relevance: 0.3 }))).toBe(true);
  });
  it("uses the short profile only for WTI inventory prints", () => {
    expect(profileFor("oil_inventory", "WTI").zeroMin).toBe(30);
    expect(profileFor("oil_inventory", "BTC").zeroMin).toBe(180);
    expect(profileFor("inflation", "WTI").zeroMin).toBe(180);
  });
});

describe("critical release timeline (BTC lens)", () => {
  const events = [ev()];
  const at = (m: number, firstMove: number | null = null) => computeEventWindow({ now: min(m), events, lens: "BTC", firstMoveFor: () => firstMove });

  it("is none outside T-60 and from T+180 on (no behaviour change)", () => {
    expect(at(-61)).toEqual(NO_WINDOW);
    expect(at(180)).toEqual(NO_WINDOW);
    expect(at(-600)).toEqual(NO_WINDOW);
  });
  it("is pre with half size from T-60 to T-30", () => {
    const w = at(-45);
    expect(w.state).toBe("pre");
    expect(w.sizeMult).toBe(0.5);
    expect(w.stopMult).toBe(1);
    expect(w.gate).toBe(false);
    expect(w.minutesLeft).toBe(15);
    expect(w.event?.title).toBe("CPI m/m");
  });
  it("is blackout (no entries) inside the last 30 minutes", () => {
    const w = at(-20);
    expect(w.state).toBe("blackout");
    expect(w.gate).toBe(true);
    expect(w.sizeMult).toBe(0);
    expect(w.minutesLeft).toBe(20);
  });
  it("is releasing from T to T+10 with the first-move gate pending until the 5m candle closes", () => {
    const w = at(3);
    expect(w.state).toBe("releasing");
    expect(w.gate).toBe(true);
    expect(w.stopMult).toBe(1.3);
    expect(w.minutesLeft).toBe(7);
    expect(w.firstMoveGate).toBeNull(); // no surprise direction yet
  });
  it("is post from T+10 with half size and 1.3x stops until T+60, then full size to T+180", () => {
    const early = at(30);
    expect(early.state).toBe("post");
    expect(early.gate).toBe(false);
    expect(early.sizeMult).toBe(0.5);
    expect(early.stopMult).toBe(1.3);
    expect(early.minutesLeft).toBe(150);
    const late = at(90);
    expect(late.state).toBe("post");
    expect(late.sizeMult).toBe(1);
    expect(late.stopMult).toBe(1);
    expect(late.minutesLeft).toBe(90);
  });
  it("decays the directional weight with a 45-minute half-life from T+10 and zeroes it at T+180", () => {
    expect(at(10).eventWeight).toBeCloseTo(1, 3);
    expect(at(55).eventWeight).toBeCloseTo(0.5, 2);
    expect(at(100).eventWeight).toBeCloseTo(0.25, 2);
    expect(at(179).eventWeight).toBeGreaterThan(0);
    expect(at(180).eventWeight).toBe(0);
  });
});

describe("high-importance release (no blackout, still no entries in the first 10 minutes)", () => {
  const events = [ev({ importance: "high" })];
  it("keeps the pre window to the release, then gates the first 10 minutes", () => {
    const pre = computeEventWindow({ now: min(-10), events, lens: "BTC" });
    expect(pre.state).toBe("pre");
    expect(pre.sizeMult).toBe(0.5);
    expect(pre.gate).toBe(false);
    const rel = computeEventWindow({ now: min(5), events, lens: "BTC" });
    expect(rel.state).toBe("releasing");
    expect(rel.gate).toBe(true);
  });
});

describe("first-5-minute confirmation gate", () => {
  it("confirms above 0.7% in the surprise direction, rejects below 0.5% or the wrong way, pending in between", () => {
    expect(firstMoveGate(null, 1)).toBe("pending");
    expect(firstMoveGate(0.9, 1)).toBe("confirmed");
    expect(firstMoveGate(-0.9, -1)).toBe("confirmed");
    expect(firstMoveGate(0.3, 1)).toBe("unconfirmed");
    expect(firstMoveGate(-0.9, 1)).toBe("unconfirmed");
    expect(firstMoveGate(0.6, 1)).toBe("pending");
    expect(firstMoveGate(0.9, 0)).toBeNull();
    expect(firstMoveGate(0.9, null)).toBeNull();
  });
  it("withdraws the event weight when unconfirmed and halves it while ambiguous", () => {
    const base = [ev({ surpriseDir: -1 })];
    const confirmed = computeEventWindow({ now: min(20), events: base, lens: "BTC", firstMoveFor: () => -1.2 });
    expect(confirmed.firstMoveGate).toBe("confirmed");
    expect(confirmed.firstMovePct).toBe(-1.2);
    expect(confirmed.eventWeight).toBeCloseTo(Math.pow(0.5, 10 / 45), 3);
    const failed = computeEventWindow({ now: min(20), events: base, lens: "BTC", firstMoveFor: () => 0.2 });
    expect(failed.firstMoveGate).toBe("unconfirmed");
    expect(failed.eventWeight).toBe(0);
    const ambiguous = computeEventWindow({ now: min(20), events: base, lens: "BTC", firstMoveFor: () => -0.6 });
    expect(ambiguous.firstMoveGate).toBe("pending");
    expect(ambiguous.eventWeight).toBeCloseTo(0.5 * Math.pow(0.5, 10 / 45), 3);
  });
  it("respects the confirmation layer: reversing vetoes, fading scales 0.3", () => {
    expect(windowFor(ev({ surpriseDir: 1, confirmation: "reversing" }), min(20), "BTC", () => 1).eventWeight).toBe(0);
    expect(windowFor(ev({ surpriseDir: 1, confirmation: "fading" }), min(20), "BTC", () => 1).eventWeight).toBeCloseTo(0.3 * Math.pow(0.5, 10 / 45), 3);
  });
  it("reads the release candle's close-vs-open from 5m candles only after it closed", () => {
    const candles = [
      { time: T0 - 300e3, open: 100, close: 100.2 },
      { time: T0, open: 100, close: 101 },
      { time: T0 + 300e3, open: 101, close: 100.5 },
    ];
    expect(firstFiveMinuteMove(candles, T0, T0 + 4 * 60e3)).toBeNull();
    expect(firstFiveMinuteMove(candles, T0, T0 + 6 * 60e3)).toBeCloseTo(1, 4);
    // Seconds-based candle times are normalised; a release at 12:32 maps onto the 12:30 candle.
    expect(firstFiveMinuteMove(candles.map((c) => ({ ...c, time: c.time / 1000 })), T0 + 2 * 60e3, T0 + 10 * 60e3)).toBeCloseTo(1, 4);
    expect(firstFiveMinuteMove([], T0, T0 + 10 * 60e3)).toBeNull();
  });
});

describe("WTI inventory timeline", () => {
  const eia = ev({ id: "eia", title: "EIA Crude Oil Inventories", importance: "high", kind: "oil_inventory", relevance: 1, surpriseDir: 1 });
  const at = (m: number) => computeEventWindow({ now: min(m), events: [eia], lens: "WTI", firstMoveFor: () => 1 });
  it("gates only the first 2 minutes, sizes/stops to T+15, decays with a 10-minute half-life and ends at T+30", () => {
    expect(at(-40).state).toBe("pre");
    expect(at(1).state).toBe("releasing");
    expect(at(1).gate).toBe(true);
    const w5 = at(5);
    expect(w5.state).toBe("post");
    expect(w5.sizeMult).toBe(0.5);
    expect(w5.stopMult).toBe(1.3);
    expect(w5.minutesLeft).toBe(25);
    expect(at(12).eventWeight).toBeCloseTo(0.5, 2);
    expect(at(20).sizeMult).toBe(1);
    expect(at(29).eventWeight).toBeGreaterThan(0);
    expect(at(30)).toEqual(NO_WINDOW);
  });
  it("is a plain 3h window on the BTC lens (CPI relevance), not the oil profile", () => {
    const cpiForOil = computeEventWindow({ now: min(100), events: [ev({ relevance: 0.4 })], lens: "WTI" });
    expect(cpiForOil.state).toBe("post");
    expect(cpiForOil.minutesLeft).toBe(80);
  });
});

describe("overlapping events", () => {
  it("picks the most binding state, then the higher importance", () => {
    const cpi = ev({ id: "cpi", time: T0 });
    const claims = ev({ id: "claims", title: "Unemployment Claims", importance: "high", time: T0 + 5 * 60e3 });
    // At T-20 CPI is in blackout while claims is in its pre window: blackout wins.
    const w = computeEventWindow({ now: min(-20), events: [claims, cpi], lens: "BTC" });
    expect(w.state).toBe("blackout");
    expect(w.event?.id).toBe("cpi");
    // Two hours later both are post; the critical one is reported.
    const later = computeEventWindow({ now: min(120), events: [claims, cpi], lens: "BTC" });
    expect(later.event?.id).toBe("cpi");
  });
  it("ignores events that do not clear the eligibility bar", () => {
    const w = computeEventWindow({ now: min(-20), events: [ev({ importance: "medium" }), ev({ id: "x", relevance: 0.1 })], lens: "BTC" });
    expect(w).toEqual(NO_WINDOW);
  });
});
