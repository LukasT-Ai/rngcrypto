import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_HORIZON_MIN, DEFAULT_TUNING, HORIZON_MIN_BY_TF, TF_MS, resetWeights, scoreFromCandles, setTuning, type Candle } from "../engine";
import { setHoldBuckets, setHoldLedgerLoader } from "../setup-tracker";

// ── Synthetic tape (same generators as regime-factor.test.ts) ─────────────────────────────────────────────
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function fromCloses(closes: number[], intervalMs: number, endMs: number, seed = 7, wick = 0.6): Candle[] {
  const r = prng(seed);
  const out: Candle[] = [];
  const n = closes.length;
  for (let i = 0; i < n; i++) {
    const open = i === 0 ? closes[0] : closes[i - 1];
    const close = closes[i];
    out.push({ time: endMs - (n - 1 - i) * intervalMs, open, high: Math.max(open, close) + r() * wick, low: Math.min(open, close) - r() * wick, close, volume: 1000 + Math.floor(r() * 200) });
  }
  return out;
}
function trendCloses(n: number, drift: number, noise: number, seed = 1, start = 1000): number[] {
  const r = prng(seed);
  const out = [start];
  for (let i = 1; i < n; i++) out.push(out[i - 1] + drift + (r() - 0.5) * 2 * noise);
  return out;
}
const NOW = Date.parse("2026-10-07T14:00:00.000Z"); // Wednesday 14:00 UTC
type Dir = "up" | "down";
function tape(dir15: Dir, dirHtf: Dir, now = NOW, symbol = "BTC") {
  const d = (x: Dir) => (x === "up" ? 0.8 : -0.8);
  const mk = (n: number, ms: number, x: Dir, seed: number) => fromCloses(trendCloses(n, d(x), 1.0, seed), ms, now - ms, seed + 10);
  const c15 = mk(420, TF_MS["15m"], dir15, 11);
  return {
    symbol,
    c5: mk(120, TF_MS["5m"], dir15, 12),
    c15,
    c1h: mk(120, TF_MS["1h"], dirHtf, 13),
    c4h: mk(420, TF_MS["4h"], dirHtf, 14),
    c1d: mk(420, TF_MS["1d"], dirHtf, 15),
    price: c15[c15.length - 1].close,
    now,
  };
}
type Result = NonNullable<ReturnType<typeof scoreFromCandles>>;
const run = (inp: ReturnType<typeof tape>, over: Partial<typeof DEFAULT_TUNING> = {}): Result => {
  setTuning({ ...DEFAULT_TUNING, ...over });
  const r = scoreFromCandles(inp);
  expect(r).not.toBeNull();
  return r as Result;
};

afterEach(() => {
  setTuning({ ...DEFAULT_TUNING });
  resetWeights();
  setHoldBuckets(null);
  setHoldLedgerLoader(null);
});

describe("wave 2 defaults", () => {
  it("validated knobs are ON (short-in-Bear-regime, session rules); the rest OFF; macro bonus frozen", () => {
    expect(DEFAULT_TUNING.mrWithRegime).toBe(false);
    expect(DEFAULT_TUNING.breakevenAfterTp1).toBe(false);
    expect(DEFAULT_TUNING.horizonByTf).toBe(false);
    expect(DEFAULT_TUNING.htfGateBoth).toBe(false);
    expect(DEFAULT_TUNING.htfVote).toBe(true);
    expect(DEFAULT_TUNING.shortNeedsBearRegime).toBe(true);
    expect(DEFAULT_TUNING.minRr).toBe(0);
    expect(DEFAULT_TUNING.sessionRules).toBe(true);
    expect(DEFAULT_TUNING.macroBonusScale).toBe(0);
    expect(HORIZON_MIN_BY_TF).toEqual({ "15m": 720, "1h": 2160, "4h": 5760, "1d": 5760 });
    expect(DEFAULT_HORIZON_MIN).toBe(1440);
  });
});

describe("synthetic regimes", () => {
  it("an aligned uptrend reads as a Bull regime and a downtrend as a Bear regime", () => {
    expect(run(tape("up", "up")).regimeLabel).toBe("Bull regime");
    expect(run(tape("down", "down")).regimeLabel).toBe("Bear regime");
  });
});

describe("mean reversion only toward the regime (--mr-with-regime)", () => {
  it("never lowers a bull-regime board: muted votes are the counter-regime fades only", () => {
    const inp = tape("up", "up");
    const off = run(inp, { mrWithRegime: false });
    const on = run(inp, { mrWithRegime: true });
    expect(on.regimeLabel).toBe("Bull regime");
    for (const k of ["momentum", "bollinger", "divergences"] as const) {
      expect(on.components[k].score).toBeGreaterThanOrEqual(off.components[k].score);
    }
    // Every other component is untouched by the knob.
    for (const k of ["marketStructure", "volume", "htf", "regime", "taSystem", "patterns"] as const) {
      expect(on.components[k].score).toBe(off.components[k].score);
    }
    expect(on.weightedScore).toBeGreaterThanOrEqual(off.weightedScore);
  });
  it("mirror: never raises a bear-regime board", () => {
    const inp = tape("down", "down");
    const off = run(inp, { mrWithRegime: false });
    const on = run(inp, { mrWithRegime: true });
    expect(on.regimeLabel).toBe("Bear regime");
    for (const k of ["momentum", "bollinger", "divergences"] as const) {
      expect(on.components[k].score).toBeLessThanOrEqual(off.components[k].score);
    }
    expect(on.weightedScore).toBeLessThanOrEqual(off.weightedScore);
  });
});

describe("HTF gate and vote (--htf-gate-both 1 --htf-vote 0)", () => {
  it("with the symmetric gate a LONG cannot be published against bearish higher timeframes", () => {
    const inp = tape("up", "down");
    const on = run(inp, { htfGateBoth: true, regimeGate: "off", shortNeedsHtfBear: false });
    expect(on.bias).not.toBe("LONG");
    if (on.weightedScore > 0) expect(on.gateNotes.some((n) => n.includes("not trending up"))).toBe(true);
  });
  it("the gate does not touch an aligned long", () => {
    const inp = tape("up", "up");
    expect(run(inp, { htfGateBoth: true }).bias).toBe(run(inp, { htfGateBoth: false }).bias);
  });
  it("htfVote 0 removes the HTF factor from the denominator", () => {
    const inp = tape("up", "up");
    expect(run(inp, { htfVote: true }).components.htf.weight).toBeGreaterThan(0);
    expect(run(inp, { htfVote: false }).components.htf.weight).toBe(0);
  });
});

describe("SHORT only in a Bear regime (--short-regime 1)", () => {
  it("a short is impossible in a Bull regime without a confirmed reversal", () => {
    const r = run(tape("down", "up"), { shortNeedsBearRegime: true, shortNeedsHtfBear: false, regimeGate: "off" });
    expect(r.bias).not.toBe("SHORT");
    if (r.weightedScore < 0 && r.regimeLabel !== "Bear regime" && r.setup !== "reversal_confirmed") {
      expect(r.regimeGate).toBe("blocked_short");
      expect(r.gateNotes.some((n) => n.includes("shorts need a bear regime"))).toBe(true);
    }
  });
  it("a Bear regime keeps the short side open", () => {
    const inp = tape("down", "down");
    const off = run(inp, { shortNeedsBearRegime: false });
    const on = run(inp, { shortNeedsBearRegime: true });
    expect(on.regimeLabel).toBe("Bear regime");
    expect(on.bias).toBe(off.bias);
  });
});

describe("minimum reward-to-risk (--min-rr)", () => {
  it("an unreachable minimum turns every directional call into WAIT with the plan kept", () => {
    // Publish threshold lowered so the synthetic board is a directional call before the R:R gate.
    const off = run(tape("up", "up"), { minPublishConfidence: 50 });
    expect(off.bias).not.toBe("WAIT");
    const r = run(tape("up", "up"), { minPublishConfidence: 50, minRr: 100 });
    expect(r.bias).toBe("WAIT");
    expect(r.gateNotes[0]).toMatch(/Reward-to-risk/);
    expect(r.invalidation).toBeNull();
    expect(r.stopAnchor).toBeNull();
    expect(r.mode).toBe("standby");
  });
  it("a reachable minimum leaves the call alone", () => {
    const inp = tape("up", "up");
    const off = run(inp, { minRr: 0 });
    const on = run(inp, { minRr: 0.1 });
    expect(on.bias).toBe(off.bias);
    expect(on.riskReward).toBeGreaterThanOrEqual(0.1);
  });
});

describe("session rules (--session-rules 1)", () => {
  const SAT = Date.parse("2026-10-10T14:00:00.000Z");
  const LATE = Date.parse("2026-10-07T22:00:00.000Z");
  it("crypto weekend: half size as a sizing part", () => {
    const r = run(tape("up", "up", SAT), { sessionRules: true });
    if (r.bias !== "WAIT") {
      expect(r.sizeMultiplier).toBeLessThanOrEqual(0.5);
    }
    const off = run(tape("up", "up", SAT), { sessionRules: false });
    expect(off.sizeMultiplier).toBe(1);
  });
  it("non-crypto weekend: market closed, WAIT", () => {
    const off = run(tape("up", "up", SAT, "GOLD"), { sessionRules: false, minPublishConfidence: 50 });
    expect(off.bias).not.toBe("WAIT");
    expect(off.gateNotes.some((n) => n.includes("Market closed"))).toBe(false);
    const r = run(tape("up", "up", SAT, "GOLD"), { sessionRules: true, minPublishConfidence: 50 });
    expect(r.bias).toBe("WAIT");
    expect(r.gateNotes[0]).toMatch(/Market closed/);
  });
  it("21-24 UTC: a call survives only when the trend and flow blocks both back it", () => {
    const r = run(tape("up", "up", LATE), { sessionRules: true });
    if (r.bias !== "WAIT") {
      const side = r.bias === "LONG" ? 1 : -1;
      expect(Math.sign(r.blocks.trend)).toBe(side);
      expect(Math.sign(r.blocks.flow)).toBe(side);
      expect(Math.abs(r.blocks.trend)).toBeGreaterThanOrEqual(20);
      expect(Math.abs(r.blocks.flow)).toBeGreaterThanOrEqual(20);
    } else {
      expect(r.gateNotes.some((n) => n.includes("Late session")) || r.confidence < DEFAULT_TUNING.minPublishConfidence).toBe(true);
    }
  });
  it("weekday daytime is untouched by the knob", () => {
    const inp = tape("up", "up");
    expect(run(inp, { sessionRules: true }).bias).toBe(run(inp, { sessionRules: false }).bias);
  });
});

describe("emitted call fields (F1.1)", () => {
  it("mode, horizon, blocks, flips, invalidation and stop anchor on a directional call", () => {
    const r = run(tape("up", "up"), { minPublishConfidence: 50 });
    expect(r.bias).not.toBe("WAIT");
    expect(["trend", "reversion", "standby"]).toContain(r.mode);
    expect(r.horizonMin).toBe(1440);
    expect(["15m", "1h", "4h", "1d"]).toContain(r.dominantTf);
    for (const k of ["trend", "timing", "flow"] as const) {
      expect(r.blocks[k]).toBeGreaterThanOrEqual(-100);
      expect(r.blocks[k]).toBeLessThanOrEqual(100);
    }
    expect(r.flips.length).toBeLessThanOrEqual(2);
    for (const f of r.flips) {
      expect(["to_long", "to_short", "to_wait"]).toContain(f.direction);
      expect(f.distance).toBeGreaterThanOrEqual(0);
      expect(f.text.length).toBeGreaterThan(0);
    }
    if (r.bias !== "WAIT") {
      expect(r.mode).not.toBe("standby");
      expect(r.invalidation).not.toBeNull();
      expect(r.invalidation!.level).toBe(r.stopLoss);
      expect(["stop", "regime", "structure"]).toContain(r.invalidation!.kind);
      expect(typeof r.stopAnchor).toBe("string");
      for (const f of r.flips) expect(f.direction).toBe("to_wait");
    } else {
      expect(r.mode).toBe("standby");
      expect(r.invalidation).toBeNull();
    }
  });
  it("mode follows the regime: trend in a trending Bull regime, standby on WAIT", () => {
    const r = run(tape("up", "up"));
    if (r.bias !== "WAIT") expect(r.mode).toBe("trend");
    const w = run(tape("up", "up"), { minPublishConfidence: 50, minRr: 100 });
    expect(w.mode).toBe("standby");
  });
  it("horizon by timeframe maps the dominant TF to 12 / 36 / 96 hours", () => {
    const r = run(tape("up", "up"), { horizonByTf: true });
    expect(r.horizonMin).toBe(HORIZON_MIN_BY_TF[r.dominantTf]);
    expect([720, 2160, 5760]).toContain(r.horizonMin);
  });
  it("expectedHold comes from the hold buckets with the finest qualifying key", () => {
    setHoldBuckets({ "*|LONG|*": { n: 40, p25: 100, median: 200, p75: 400 }, "BTC|LONG|Bull regime": { n: 12, p25: 60, median: 90, p75: 150 } });
    const r = run(tape("up", "up"), { minPublishConfidence: 50 });
    if (r.bias === "LONG") {
      expect(r.expectedHold).toMatchObject({ medianMin: 90, p25Min: 60, p75Min: 150, n: 12, tf: r.dominantTf, source: "backtest", bucket: "BTC|LONG|Bull regime" });
    } else {
      expect(r.expectedHold).toBeNull();
    }
  });
});
