import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_TUNING, ENGINE_VERSION, ENGINE_VERSION_BASE, TF_MS, resetWeights, scoreFromCandles, setTuning, shortHash, type Candle } from "../engine";
import { resetBlockOptions, setBlockOptions } from "../blocks";
import { setHoldBuckets, setHoldLedgerLoader } from "../setup-tracker";

// ── Synthetic tape (same generators as strategy-rules.test.ts) ────────────────────────────────────────────
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
  resetBlockOptions();
  setHoldBuckets(null);
  setHoldLedgerLoader(null);
});

describe("block mode defaults and emitted fields", () => {
  it("blockMode is part of the tuning and hashed into the engine version", () => {
    expect(["off", "vote", "sum"]).toContain(DEFAULT_TUNING.blockMode);
    expect(ENGINE_VERSION).toBe(`${ENGINE_VERSION_BASE}-${shortHash(JSON.stringify(DEFAULT_TUNING))}`);
  });
  it("emits call.blocks, call.blockVotes and call.blockDetail in every mode, with the documented shapes", () => {
    for (const mode of ["off", "vote", "sum"] as const) {
      const r = run(tape("up", "up"), { blockMode: mode });
      expect(Object.keys(r.blocks).sort()).toEqual(["flow", "timing", "trend"]);
      for (const v of Object.values(r.blocks)) {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(100);
      }
      expect(Object.keys(r.blockVotes).sort()).toEqual(["agreement", "flow", "timing", "trend"]);
      for (const k of ["trend", "timing", "flow"] as const) expect([-1, 0, 1]).toContain(r.blockVotes[k]);
      expect(r.blockVotes.agreement).toBeGreaterThanOrEqual(-1);
      expect(r.blockVotes.agreement).toBeLessThanOrEqual(1);
      expect(r.blockDetail.mode).toBe(mode);
      expect(r.blockDetail.trend.members.map((m) => m.name)).toContain("regime");
      expect(r.blockDetail.timing.members.map((m) => m.name)).toContain("momentum");
      // candles-only: the flow block runs on the volume proxy (or abstains on the synthetic near-constant volume), never on a taker feed
      expect([[], ["volumeCandles"]]).toContainEqual(r.blockDetail.flow.members.map((m) => m.name));
    }
  });
  it("blockMode off: the weighted sum still decides (components intact, composite only reported)", () => {
    const r = run(tape("up", "up"), { blockMode: "off" });
    expect(Object.keys(r.components).length).toBeGreaterThan(10);
    expect(r.blockDetail.composite).not.toBe(r.weightedScore);
  });
});

describe("block mode vote: synthetic regimes", () => {
  it("an aligned uptrend reads bullish on the TREND block, never calls a short, and sizes confidence from the votes", () => {
    const r = run(tape("up", "up"), { blockMode: "vote" });
    expect(r.blocks.trend).toBeGreaterThan(0);
    expect(r.blockVotes.trend).toBe(1);
    expect(r.bias).not.toBe("SHORT");
    expect(Math.abs(r.weightedScore)).toBe(Math.abs(r.blockDetail.composite));
    // confidence = 50 + |composite| / 2 before haircuts (the same mapping the weighted sum used)
    if (r.bias !== "WAIT") expect(r.confidence).toBe(Math.round(50 + Math.abs(r.blockDetail.composite) / 2));
  });
  it("an aligned downtrend reads bearish on the TREND block and never calls a long", () => {
    const r = run(tape("down", "down"), { blockMode: "vote" });
    expect(r.blocks.trend).toBeLessThan(0);
    expect(r.blockVotes.trend).toBe(-1);
    expect(r.bias).not.toBe("LONG");
  });
  it("sum mode decides by the weighted mean of the block scores", () => {
    const r = run(tape("up", "up"), { blockMode: "sum" });
    expect(r.blockDetail.mode).toBe("sum");
    expect(r.weightedScore).toBe(r.blockDetail.composite);
    expect(r.bias).not.toBe("SHORT");
  });
  it("dropping the trend block (ablation) leaves a counter-vote-free decision to timing and flow", () => {
    setBlockOptions({ drop: ["trend"] });
    const r = run(tape("up", "up"), { blockMode: "vote" });
    expect(r.blocks.trend).toBe(0);
    expect(r.blockVotes.trend).toBe(0);
    expect(r.blockDetail.trend.notes[0]).toMatch(/dropped/);
  });
  it("flip rows in block mode name blocks, not factors", () => {
    const r = run(tape("up", "up"), { blockMode: "vote" });
    for (const f of r.flips) expect(["trend", "timing", "flow", "gate"]).toContain(f.factor);
  });
});
