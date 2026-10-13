import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  computeImbalance,
  pageCoverage,
  emaOfLast,
  qhBoundary,
  nextQhBoundary,
  qhWindowFor,
  QH_WINDOW_MS,
  QH_SLOT_MS,
  type OkxTrade,
} from "./qh-imbalance";

const B = Date.UTC(2026, 9, 13, 14, 15, 0); // 14:15:00 UTC boundary
const E = B + QH_WINDOW_MS;

const t = (id: number, side: "buy" | "sell", sz: string, px: string, ts: number): OkxTrade => ({ tradeId: String(id), side, sz, px, ts: String(ts) });

describe("quarter-hour boundary logic", () => {
  it("qhBoundary floors to the owning :00/:15/:30/:45 and nextQhBoundary is strictly after", () => {
    expect(qhBoundary(B)).toBe(B);
    expect(qhBoundary(B + 1)).toBe(B);
    expect(qhBoundary(B + 14 * 60_000 + 59_999)).toBe(B);
    expect(qhBoundary(B - 1)).toBe(B - QH_SLOT_MS);
    expect(nextQhBoundary(B)).toBe(B + QH_SLOT_MS);
    expect(nextQhBoundary(B - 1)).toBe(B);
    const d = new Date(nextQhBoundary(Date.UTC(2026, 9, 13, 14, 47, 3)));
    expect([d.getUTCMinutes(), d.getUTCSeconds()]).toEqual([0, 0]);
    expect(d.getUTCHours()).toBe(15);
  });

  it("qhWindowFor spans the opening minute after the boundary", () => {
    expect(qhWindowFor(B + 30_000)).toEqual({ start: B, end: E });
    expect(qhWindowFor(B + 5 * 60_000)).toEqual({ start: B, end: E });
  });
});

describe("computeImbalance from recorded trades", () => {
  // Recorded shape from OKX BTC-USDT-SWAP (ctVal 0.01 BTC per contract).
  const ctVal = 0.01;
  const page: OkxTrade[] = [
    t(5, "sell", "2", "80000", B + 50_000), // newest first, as OKX returns
    t(4, "buy", "10", "80000", B + 40_000),
    t(3, "buy", "5", "80000", B + 20_000),
    t(2, "sell", "1", "80000", B + 1_000),
    t(1, "buy", "100", "80000", B - 500), // before the boundary: ignored
  ];

  it("computes (buy - sell) / (buy + sell) on contract notional inside [B, B+60s)", () => {
    const r = computeImbalance([page], B, E, ctVal, { lastFetchedAt: E + 1000 });
    expect(r).not.toBeNull();
    // buy = (10 + 5) * 0.01 * 80000 = 12000 ; sell = (2 + 1) * 0.01 * 80000 = 2400
    expect(r!.buyUsd).toBe(12000);
    expect(r!.sellUsd).toBe(2400);
    expect(r!.n).toBe(4);
    expect(r!.imbalance).toBeCloseTo((12000 - 2400) / 14400, 3);
  });

  it("dedupes overlapping pages by tradeId and ignores trades at or after the window end", () => {
    const later: OkxTrade[] = [t(7, "sell", "1", "80000", E + 10), t(6, "buy", "1", "80000", E), t(5, "sell", "2", "80000", B + 50_000), t(4, "buy", "10", "80000", B + 40_000)];
    const once = computeImbalance([page], B, E, ctVal);
    const twice = computeImbalance([page, later, page], B, E, ctVal);
    expect(twice!.n).toBe(once!.n);
    expect(twice!.buyUsd).toBe(once!.buyUsd);
    expect(twice!.sellUsd).toBe(once!.sellUsd);
  });

  it("returns null when nothing traded inside the window and skips malformed rows", () => {
    expect(computeImbalance([[t(1, "buy", "1", "80000", B - 1)]], B, E, ctVal)).toBeNull();
    expect(computeImbalance([[]], B, E, ctVal)).toBeNull();
    const r = computeImbalance([[t(1, "buy", "x", "80000", B + 1), t(2, "sell", "1", "80000", B + 2)]], B, E, ctVal);
    expect(r!.n).toBe(1);
    expect(r!.imbalance).toBe(-1);
  });

  it("is +1 for all taker buys and -1 for all taker sells", () => {
    expect(computeImbalance([[t(1, "buy", "1", "1", B + 1)]], B, E, 1)!.imbalance).toBe(1);
    expect(computeImbalance([[t(1, "sell", "1", "1", B + 1)]], B, E, 1)!.imbalance).toBe(-1);
  });
});

describe("pageCoverage", () => {
  it("is 1 when one page spans the window edges", () => {
    expect(pageCoverage([[t(2, "buy", "1", "1", E + 5), t(1, "buy", "1", "1", B - 5)]], B, E)).toBe(1);
  });
  it("reports the gap between non-overlapping pages", () => {
    const p1 = [t(2, "buy", "1", "1", B + 20_000), t(1, "buy", "1", "1", B - 5)];
    const p2 = [t(4, "buy", "1", "1", E + 5), t(3, "buy", "1", "1", B + 40_000)];
    expect(pageCoverage([p1, p2], B, E)).toBeCloseTo(40 / 60, 3);
  });
  it("extends the last page to the window end when it was fetched after the window closed", () => {
    const p = [t(2, "buy", "1", "1", B + 30_000), t(1, "buy", "1", "1", B - 5)];
    expect(pageCoverage([p], B, E)).toBeCloseTo(0.5, 3);
    expect(pageCoverage([p], B, E, E + 1)).toBe(1);
    expect(pageCoverage([p], B, E, E - 1)).toBeCloseTo(0.5, 3);
  });
  it("is 0 with no usable trades", () => {
    expect(pageCoverage([[]], B, E)).toBe(0);
  });
});

describe("emaOfLast", () => {
  it("seeds with the first value and uses k = 2/(n+1) over the last n readings", () => {
    expect(emaOfLast([])).toBe(0);
    expect(emaOfLast([0.5])).toBe(0.5);
    const k = 2 / 5;
    const expected = 0.3 * k + (0.2 * k + (0.1 * k + 0 * (1 - k)) * (1 - k)) * (1 - k);
    expect(emaOfLast([9, 0, 0.1, 0.2, 0.3])).toBeCloseTo(expected, 3);
  });
});

describe("store persistence", () => {
  let dir: string;
  let mod: typeof import("./qh-imbalance");
  const prevEnv = process.env.RAILWAY_VOLUME_MOUNT_PATH;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "qh-"));
    process.env.RAILWAY_VOLUME_MOUNT_PATH = dir;
    const { vi } = await import("vitest");
    vi.resetModules();
    mod = await import("./qh-imbalance");
    mod._resetQhStore();
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
    else process.env.RAILWAY_VOLUME_MOUNT_PATH = prevEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  const win = (start: number, imbalance: number, n = 10) => ({
    windowStart: new Date(start).toISOString(),
    windowEnd: new Date(start + QH_WINDOW_MS).toISOString(),
    imbalance,
    buyUsd: 1,
    sellUsd: 1,
    n,
    coverage: 1,
  });

  it("returns null before any window, then the latest reading with EMA(4), age and stale flag", () => {
    expect(mod.getQhImbalance("BTC")).toBeNull();
    expect(mod.getQhSeries("BTC")).toEqual([]);
    mod.recordQhWindow("BTC", win(B, 0.2));
    mod.recordQhWindow("BTC", win(B + QH_SLOT_MS, 0.4));
    const r = mod.getQhImbalance("BTC", B + QH_SLOT_MS + QH_WINDOW_MS + 5 * 60_000);
    expect(r).toMatchObject({ imbalance: 0.4, n: 10, ageMin: 5, stale: false, windowEnd: new Date(B + QH_SLOT_MS + QH_WINDOW_MS).toISOString() });
    expect(r!.ema4).toBeCloseTo(0.2 * 0.6 + 0.4 * 0.4, 3);
    expect(mod.getQhImbalance("BTC", B + QH_SLOT_MS + QH_WINDOW_MS + 21 * 60_000)!.stale).toBe(true);
    expect(mod.getQhSeries("BTC", 1)).toEqual([{ imbalance: 0.4, windowEnd: new Date(B + QH_SLOT_MS + QH_WINDOW_MS).toISOString(), n: 10 }]);
  });

  it("replaces a window with the same start, caps at 96 and keeps symbols separate", () => {
    for (let i = 0; i < 100; i++) mod.recordQhWindow("ETH", win(B + i * QH_SLOT_MS, i / 100));
    mod.recordQhWindow("ETH", win(B + 99 * QH_SLOT_MS, 0.5));
    expect(mod.getQhWindows("ETH").length).toBe(96);
    expect(mod.getQhImbalance("ETH")!.imbalance).toBe(0.5);
    expect(mod.getQhImbalance("BTC")).toBeNull();
  });

  it("persists to <volume>/signals/qh-imbalance.json and reloads after a module reset", async () => {
    mod.recordQhWindow("SOL", win(B, -0.3));
    const file = join(dir, "signals", "qh-imbalance.json");
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf-8")).windows.SOL[0].imbalance).toBe(-0.3);
    mod._resetQhStore();
    expect(mod.getQhImbalance("SOL")!.imbalance).toBe(-0.3);
  });

  it("sampleQhWindow polls pages until the window closes and stores the result", async () => {
    let clock = B + 1000;
    const pages: OkxTrade[][] = [
      [t(2, "buy", "1", "100", B + 500), t(1, "sell", "1", "100", B - 100)],
      [t(4, "buy", "2", "100", B + 30_000), t(3, "sell", "1", "100", B + 10_000), t(2, "buy", "1", "100", B + 500)],
      [t(6, "sell", "1", "100", E + 50), t(5, "buy", "1", "100", B + 59_000), t(4, "buy", "2", "100", B + 30_000)],
    ];
    let calls = 0;
    const w = await mod.sampleQhWindow("BTC", "BTC-USDT-SWAP", B, {
      stepMs: 1,
      ctVal: 1,
      now: () => clock,
      fetchPage: async () => {
        const p = pages[Math.min(calls, pages.length - 1)];
        calls++;
        clock += 20_000;
        return p;
      },
    });
    expect(calls).toBe(3);
    expect(w).not.toBeNull();
    // buy 1 + 2 + 1 = 4 x 100 ; sell 1 x 100 (trade 1 before B, trade 6 after E excluded)
    expect(w!.buyUsd).toBe(400);
    expect(w!.sellUsd).toBe(100);
    expect(w!.n).toBe(4);
    expect(w!.imbalance).toBe(0.6);
    expect(w!.coverage).toBe(1);
    expect(mod.getQhImbalance("BTC", E)!.imbalance).toBe(0.6);
  });

  it("sampleQhWindow never throws when the feed is down", async () => {
    const w = await mod.sampleQhWindow("BTC", "BTC-USDT-SWAP", B, { stepMs: 1, ctVal: 1, now: () => E + 100_000, fetchPage: async () => null });
    expect(w).toBeNull();
    const w2 = await mod.sampleQhWindow("BTC", "BTC-USDT-SWAP", B, {
      stepMs: 1,
      ctVal: 1,
      now: () => E + 100_000,
      fetchPage: async () => {
        throw new Error("boom");
      },
    });
    expect(w2).toBeNull();
    expect(mod.getQhImbalance("BTC")).toBeNull();
  });
});
