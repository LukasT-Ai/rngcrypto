import { afterEach, describe, expect, it } from "vitest";
import { HOLD_BUCKET_MIN_N, HOLD_LEDGER_MIN_N, buildHoldBuckets, expectedHoldFor, holdBucketKeys, setHoldBuckets, setHoldLedgerLoader } from "../setup-tracker";

afterEach(() => {
  setHoldBuckets(null);
  setHoldLedgerLoader(null);
});

describe("hold buckets", () => {
  it("keys run from the finest (symbol x bias x regime) to the coarsest (all)", () => {
    expect(holdBucketKeys("BTC", "LONG", "Bull regime")).toEqual(["BTC|LONG|Bull regime", "BTC|LONG|*", "*|LONG|Bull regime", "*|LONG|*", "*|*|*"]);
    expect(holdBucketKeys("ETH", "SHORT", null)[0]).toBe("ETH|SHORT|none");
  });
  it("builds quantiles for every granularity", () => {
    const samples = [10, 20, 30, 40, 50].map((holdMin) => ({ symbol: "BTC", bias: "LONG" as const, regime: "Bull regime", holdMin }));
    const b = buildHoldBuckets([...samples, { symbol: "ETH", bias: "LONG", regime: "Mixed", holdMin: 100 }, { symbol: "ETH", bias: "LONG", regime: "Mixed", holdMin: -5 }]);
    expect(b["BTC|LONG|Bull regime"]).toEqual({ n: 5, p25: 20, median: 30, p75: 40 });
    expect(b["*|LONG|*"].n).toBe(6); // the negative sample is dropped
    expect(b["*|*|*"].n).toBe(6);
    expect(b["ETH|LONG|Mixed"]).toEqual({ n: 1, p25: 100, median: 100, p75: 100 });
  });
  it("answers from the finest bucket with enough samples, else falls back", () => {
    setHoldBuckets({
      "BTC|LONG|Bull regime": { n: HOLD_BUCKET_MIN_N - 1, p25: 1, median: 2, p75: 3 },
      "BTC|LONG|*": { n: HOLD_BUCKET_MIN_N, p25: 30, median: 60, p75: 90 },
      "*|*|*": { n: 500, p25: 100, median: 200, p75: 300 },
    });
    expect(expectedHoldFor("BTC", "LONG", "Bull regime", "15m")).toMatchObject({ medianMin: 60, n: HOLD_BUCKET_MIN_N, tf: "15m", source: "backtest", bucket: "BTC|LONG|*" });
    expect(expectedHoldFor("SOL", "SHORT", "Mixed", "4h")).toMatchObject({ medianMin: 200, tf: "4h", bucket: "*|*|*" });
  });
  it("returns null when nothing qualifies", () => {
    setHoldBuckets({ "*|*|*": { n: 3, p25: 1, median: 2, p75: 3 } });
    expect(expectedHoldFor("BTC", "LONG", "Bull regime", "15m")).toBeNull();
  });
  it("the live ledger overrides the backtest bucket once it has enough samples", () => {
    setHoldBuckets({ "BTC|LONG|Bull regime": { n: 50, p25: 10, median: 20, p75: 30 } });
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ symbol: "BTC", bias: "LONG" as const, regime: "Bull regime", holdMin: 100 + i }));
    setHoldLedgerLoader(() => mk(HOLD_LEDGER_MIN_N - 1));
    expect(expectedHoldFor("BTC", "LONG", "Bull regime", "1h")!.source).toBe("backtest");
    setHoldLedgerLoader(() => mk(HOLD_LEDGER_MIN_N));
    const r = expectedHoldFor("BTC", "LONG", "Bull regime", "1h");
    expect(r!.source).toBe("ledger");
    expect(r!.n).toBe(HOLD_LEDGER_MIN_N);
    expect(r!.medianMin).toBeGreaterThan(100);
  });
  it("a throwing ledger loader degrades to the backtest bucket", () => {
    setHoldBuckets({ "*|*|*": { n: 20, p25: 1, median: 2, p75: 3 } });
    setHoldLedgerLoader(() => {
      throw new Error("ledger unreadable");
    });
    expect(expectedHoldFor("BTC", "LONG", null, "15m")!.source).toBe("backtest");
  });
});
