import { describe, expect, it } from "vitest";
import { CANDLE_MS, evaluate, firstEligibleCandleTime, legacyResetPatch, needsLegacyReverify, type Candle } from "../check/core";
import type { SignalLog } from "../logger";

// Signal timestamp sits 2 minutes into the 10:00 candle; the first eligible candle opens at 10:05.
const T0 = Date.parse("2026-10-06T10:02:00.000Z");
const C0 = Date.parse("2026-10-06T10:00:00.000Z");

function sig(over: Partial<SignalLog> = {}): SignalLog {
  return {
    id: "BTC-1",
    symbol: "BTC",
    timestamp: T0,
    bias: "LONG",
    confidence: 70,
    grade: "A",
    entry: 98_000, // 2% below the market: a resting limit
    stopLoss: 97_000,
    tp1: 99_000,
    tp2: 100_000,
    tp3: 101_000,
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
    context: { factors: {}, catalystScore: 0, oilGeoScore: null, oilRegime: null, atr: 0, tradeType: "SCALP", timeframe: "15m" },
    ...over,
  };
}

// Build consecutive 5m candles from C0; each entry is [open, high, low, close].
function candles(rows: [number, number, number, number][], start = C0): Candle[] {
  return rows.map(([open, high, low, close], i) => ({ time: start + i * CANDLE_MS, open, high, low, close }));
}

describe("fill model", () => {
  it("excludes the candle containing the signal timestamp", () => {
    expect(firstEligibleCandleTime(sig())).toBe(C0 + CANDLE_MS);
    // The 10:00 candle dips through the entry, but it is the signal candle; 10:05 and 10:10 stay above.
    const cs = candles([
      [100_000, 100_500, 97_900, 100_000],
      [100_000, 100_200, 99_500, 100_000],
      [100_000, 100_200, 99_500, 100_000],
    ]);
    const upd = evaluate(sig(), cs, C0 + 3 * CANDLE_MS);
    expect(upd?.fillStatus).toBe("pending");
    expect(upd?.status).toBe("open");
    expect(upd?.filledAt).toBeUndefined();
  });

  it("fills a limit entry when a later candle trades through it and then tracks targets", () => {
    const cs = candles([
      [100_000, 100_500, 99_800, 100_000], // signal candle
      [100_000, 100_200, 99_500, 99_600],
      [99_600, 99_700, 97_950, 98_200], // fill: low <= 98,000
      [98_200, 99_100, 98_100, 99_000], // TP1 touched
    ]);
    const upd = evaluate(sig(), cs, C0 + 4 * CANDLE_MS);
    expect(upd?.fillStatus).toBe("filled");
    expect(upd?.filledAt).toBe(C0 + 2 * CANDLE_MS);
    expect(upd?.tpHits?.map((h) => h.level)).toEqual([1]);
    expect(upd?.outcome).toBe("tp1");
    expect(upd?.status).toBe("open");
    // MFE/MAE are measured from the fill candle, not from the signal.
    expect(upd?.maxAdverse).toBe(50);
  });

  it("does not credit a TP on the limit fill candle itself", () => {
    // The fill candle swept from 100,200 down to the entry; its high is above TP1 but that was before the fill.
    const cs = candles([
      [100_000, 100_500, 99_800, 100_000],
      [100_000, 100_200, 97_950, 98_200],
    ]);
    const upd = evaluate(sig(), cs, C0 + 2 * CANDLE_MS);
    expect(upd?.fillStatus).toBe("filled");
    expect(upd?.tpHits).toEqual([]);
  });

  it("treats an entry within 0.1% of the signal price as a market order filled at the next candle open", () => {
    const s = sig({ entry: 99_950, stopLoss: 99_000, tp1: 100_900, tp2: 101_800, tp3: 102_700 });
    const cs = candles([
      [100_000, 100_100, 99_900, 100_000],
      [100_000, 100_950, 99_980, 100_800], // never touches 99,950, but a market order is in; TP1 touched
    ]);
    const upd = evaluate(s, cs, C0 + 2 * CANDLE_MS);
    expect(upd?.fillStatus).toBe("filled");
    expect(upd?.filledAt).toBe(C0 + CANDLE_MS);
    expect(upd?.tpHits?.map((h) => h.level)).toEqual([1]);
  });

  it("closes as unfilled after the fill window elapses with no touch", () => {
    const rows: [number, number, number, number][] = Array.from({ length: 30 }, () => [100_000, 100_300, 99_700, 100_000]);
    const cs = candles(rows);
    // SCALP window: 24 candles starting 10:05, so the window ends at 12:05 and the last candle closes 12:10.
    const beforeDeadline = evaluate(sig(), cs, C0 + 25 * CANDLE_MS);
    expect(beforeDeadline?.fillStatus).toBe("pending");
    const after = evaluate(sig(), cs, C0 + 26 * CANDLE_MS);
    expect(after?.status).toBe("closed");
    expect(after?.closedReason).toBe("unfilled");
    expect(after?.fillStatus).toBe("unfilled");
    expect(after?.realizedR).toBeNull();
  });

  it("resolves same-candle TP and SL as the stop after a fill", () => {
    const cs = candles([
      [100_000, 100_500, 99_800, 100_000],
      [100_000, 100_200, 97_950, 98_200], // fill
      [98_200, 99_500, 96_900, 97_500], // touches TP1 and SL in one candle
    ]);
    const upd = evaluate(sig(), cs, C0 + 3 * CANDLE_MS);
    expect(upd?.status).toBe("closed");
    expect(upd?.closedReason).toBe("stop_before_tp");
    expect(upd?.realizedR).toBe(-1);
    expect(upd?.tpHits).toEqual([]);
  });

  it("marks a signal unverifiable when its fill window predates the fetchable candle range", () => {
    const cs = candles([[100_000, 100_300, 99_700, 100_000]], C0 + 600 * CANDLE_MS);
    const upd = evaluate(sig(), cs, C0 + 601 * CANDLE_MS);
    expect(upd?.status).toBe("closed");
    expect(upd?.closedReason).toBe("unverifiable");
    expect(upd?.realizedR).toBeNull();
  });

  it("re-verifies only legacy first-touch records with a resting limit entry", () => {
    const legacyLimit = sig({ status: undefined, outcome: "tp2", fillStatus: undefined });
    const legacyMarket = sig({ status: undefined, outcome: "tp2", fillStatus: undefined, entry: 99_900 });
    const ladder = sig({ outcome: "tp2" });
    expect(needsLegacyReverify(legacyLimit)).toBe(true);
    expect(needsLegacyReverify(legacyMarket)).toBe(false);
    expect(needsLegacyReverify(ladder)).toBe(false);
    const patch = legacyResetPatch(legacyLimit);
    expect(patch.status).toBe("open");
    expect(patch.outcome).toBe("pending");
    expect(patch.fillStatus).toBe("pending");
    expect(patch.legacyOutcome).toBe("tp2");
    expect(patch.lastCheckedAt).toBe(T0);
  });
});
