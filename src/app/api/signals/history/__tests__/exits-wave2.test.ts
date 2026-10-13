import { describe, expect, it } from "vitest";
import { CANDLE_MS, breakevenAfterTp1For, evaluate, horizonFor, type Candle } from "../check/core";
import type { SignalLog } from "../logger";

process.env.COST_VENUE = "STRIKE";

const T0 = Date.parse("2026-10-06T10:02:00.000Z");
const C0 = Date.parse("2026-10-06T10:00:00.000Z");
const HOUR = 3600e3;

function sig(over: Partial<SignalLog> = {}, tuning: Record<string, unknown> = {}, horizonMin: number | null = null): SignalLog {
  return {
    id: "BTC-1",
    symbol: "BTC",
    timestamp: T0,
    bias: "LONG",
    confidence: 70,
    grade: "A",
    entry: 100_000, // market order: fills at the next candle open
    stopLoss: 99_000,
    tp1: 101_000,
    tp2: 102_000,
    tp3: 103_000,
    priceAtSignal: 100_000,
    outcome: "pending",
    outcomePrice: null,
    outcomeTimestamp: null,
    maxFavorable: null,
    maxAdverse: null,
    status: "open",
    tpHits: [],
    fillStatus: "pending",
    filledAt: null,
    context: {
      factors: {},
      catalystScore: 0,
      oilGeoScore: null,
      oilRegime: null,
      atr: 0,
      tradeType: "SWING",
      timeframe: "15m",
      inputs: { weightedScore: 30, confidenceRaw: 65, components: {}, rr1: 1, rr2: 2, rr3: 3, entryType: "market", atrPct: 1, fundingRate: null, minutesToNextEvent: null, horizonMin, tuning, gateNotes: [], engineVersion: "test", calibrationVersion: null, pTp1: null, regime: "Bull regime", regimeGate: "none", markAtSignal: 100_000, lastAtSignal: 100_000, candleCloseTime: C0 },
    },
    ...over,
  };
}
function candles(rows: [number, number, number, number][], start = C0): Candle[] {
  return rows.map(([open, high, low, close], i) => ({ time: start + i * CANDLE_MS, open, high, low, close }));
}
// 10:00 signal candle, 10:05 fill at 100,000, 10:10 prints TP1, 10:15 comes back to the entry (not the stop).
const TP1_THEN_RETURN = candles([
  [100_000, 100_100, 99_900, 100_000],
  [100_000, 100_200, 99_950, 100_100],
  [100_100, 101_050, 100_050, 100_900],
  [100_900, 100_950, 99_990, 100_200],
  [100_200, 100_300, 100_100, 100_250],
]);

describe("breakeven after TP1 (PR 15)", () => {
  it("is read from the tuning logged with the record", () => {
    expect(breakevenAfterTp1For(sig())).toBe(false);
    expect(breakevenAfterTp1For(sig({}, { breakevenAfterTp1: true }))).toBe(true);
    expect(breakevenAfterTp1For(sig({ context: undefined }))).toBe(false);
  });
  it("OFF: a return to the entry after TP1 keeps the trade open on the original stop", () => {
    const upd = evaluate(sig(), TP1_THEN_RETURN, C0 + 5 * CANDLE_MS);
    expect(upd?.status).toBe("open");
    expect(upd?.tpHits?.map((h) => h.level)).toEqual([1]);
  });
  it("ON: the stop sits at the fill after TP1 and a touch exits at breakeven (0R gross)", () => {
    const upd = evaluate(sig({}, { breakevenAfterTp1: true }), TP1_THEN_RETURN, C0 + 5 * CANDLE_MS);
    expect(upd?.status).toBe("closed");
    expect(upd?.closedReason).toBe("stop_after_tp");
    expect(upd?.outcome).toBe("tp1");
    expect(upd?.stoppedAfterTp).toBe(1);
    expect(upd?.outcomePrice).toBe(100_000);
    expect(upd?.realizedR).toBe(0);
    expect(upd?.realizedNetR).toBeLessThan(0); // costs still apply
    expect(upd?.outcomeTimestamp).toBe(C0 + 3 * CANDLE_MS);
  });
  it("ON: a stop before TP1 is still a full loss at the original stop", () => {
    const cs = candles([
      [100_000, 100_100, 99_900, 100_000],
      [100_000, 100_200, 99_950, 100_100],
      [100_100, 100_300, 98_900, 99_000],
    ]);
    const upd = evaluate(sig({}, { breakevenAfterTp1: true }), cs, C0 + 3 * CANDLE_MS);
    expect(upd?.closedReason).toBe("stop_before_tp");
    expect(upd?.realizedR).toBe(-1);
  });
  it("ON: TP2 and TP3 still count after TP1 when the breakeven stop is never touched", () => {
    const cs = candles([
      [100_000, 100_100, 99_900, 100_000],
      [100_000, 100_200, 99_950, 100_100],
      [100_100, 101_050, 100_050, 100_900],
      [100_900, 102_100, 100_800, 102_000],
      [102_000, 103_100, 101_900, 103_000],
    ]);
    const upd = evaluate(sig({}, { breakevenAfterTp1: true }), cs, C0 + 5 * CANDLE_MS);
    expect(upd?.closedReason).toBe("tp3");
    expect(upd?.realizedR).toBe(3);
  });
});

describe("horizon by timeframe (PR 15)", () => {
  it("uses the engine horizon logged with the record, else the tradeType mapping", () => {
    expect(horizonFor(sig())).toBe(48 * HOUR); // SWING
    expect(horizonFor(sig({}, {}, 720))).toBe(12 * HOUR);
    expect(horizonFor(sig({}, {}, 5760))).toBe(96 * HOUR);
    expect(horizonFor(sig({}, {}, 0))).toBe(48 * HOUR);
    expect(horizonFor(sig({ context: { factors: {}, catalystScore: 0, oilGeoScore: null, oilRegime: null, atr: 0, tradeType: null, timeframe: null } }))).toBe(24 * HOUR);
  });
  it("a 12h horizon closes the record before a TP that prints in hour 13", () => {
    const rows: [number, number, number, number][] = [[100_000, 100_100, 99_900, 100_000]];
    for (let i = 1; i < 13 * 12 + 2; i++) rows.push([100_000, 100_200, 99_900, 100_050]);
    rows[13 * 12] = [100_050, 101_500, 100_000, 101_200]; // TP1 would print 13h in
    const cs = candles(rows);
    const now = C0 + rows.length * CANDLE_MS;
    const short = evaluate(sig({}, {}, 720), cs, now);
    expect(short?.closedReason).toBe("horizon");
    expect(short?.tpHits).toEqual([]);
    const long = evaluate(sig({}, {}, 2160), cs, now);
    expect(long?.status).toBe("open");
    expect(long?.tpHits?.map((h) => h.level)).toEqual([1]);
  });
});
