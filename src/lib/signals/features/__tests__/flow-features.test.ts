import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FeedCache, pearson, percentileRank, zScore } from "../fetch";
import { buildFundingFeature, parseHlPredicted, parseOkxFundingHistory, venueSpreadRatio } from "../funding";
import { buildOiFeature, parseOiHistory, quadrantFor, type OiPoint } from "../oi";
import { buildCvdFeature, parseTakerBuckets, readQhImbalance, registerQhReader } from "../cvd";
import { buildBookFeature } from "../book";
import { buildFeatures } from "../index";
import type { OrderBookSummary } from "../../orderflow";

const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"));

describe("stats helpers", () => {
  it("z-score and percentile rank", () => {
    const hist = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(zScore(5.5, hist)).toBeCloseTo(0, 6);
    expect(zScore(5.5, hist, 20)).toBeNull(); // too short
    expect(zScore(1, [2, 2, 2, 2, 2, 2, 2, 2, 2, 2])).toBeNull(); // flat
    expect(percentileRank(10, hist)).toBe(95);
    expect(percentileRank(0, hist)).toBe(0);
    expect(percentileRank(11, hist)).toBe(100);
  });
  it("pearson", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 9);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 9);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
  it("FeedCache serves stale inside 3x TTL, null after, and dedupes inflight", async () => {
    const c = new FeedCache<number>(1000);
    let calls = 0;
    const loader = async () => {
      calls++;
      return 42;
    };
    const [a, b] = await Promise.all([c.get("k", loader, 0), c.get("k", loader, 0)]);
    expect([a, b, calls]).toEqual([42, 42, 1]);
    expect(await c.get("k", async () => null, 2500)).toBe(42); // failed refresh inside stale window
    expect(await c.get("k", async () => null, 5000)).toBeNull(); // beyond 3x TTL
  });
});

describe("funding feature", () => {
  const history = parseOkxFundingHistory(fx("okx-funding-history.json").data);
  const venues = parseHlPredicted(fx("hl-predicted-fundings.json"), "BTC");

  it("parses OKX history oldest-first with realized rates", () => {
    expect(history).toHaveLength(100);
    expect(history[0].ts).toBeLessThan(history[99].ts);
    expect(history[99].rate).toBeCloseTo(0.0000235736, 9);
  });
  it("normalizes every Hyperliquid venue to an 8h rate", () => {
    expect(venues.hl).toBeCloseTo(0.0000125 * 8, 12); // hourly x8
    expect(venues.binance).toBeCloseTo(0.00005576, 12); // already 8h
    expect(venues.bybit).toBeCloseTo(0.00005735, 12);
    expect(parseHlPredicted(fx("hl-predicted-fundings.json"), "NOPE")).toEqual({ hl: null, binance: null, bybit: null });
  });
  it("spread ratio is max/min absolute and null on a zero venue", () => {
    expect(venueSpreadRatio(0.0001, { hl: 0.0002, binance: null, bybit: 0.0004 })).toBe(4);
    expect(venueSpreadRatio(0, { hl: 0.0002, binance: null, bybit: null })).toBeNull();
    expect(venueSpreadRatio(0.0001, { hl: null, binance: null, bybit: null })).toBeNull();
  });
  it("builds the feature with z against the history and neutral regime on the fixture", () => {
    const f = buildFundingFeature(history, venues, history[99].ts + 1000)!;
    expect(f.rate8h).toBeCloseTo(0.00002357, 8);
    expect(f.n).toBe(100);
    expect(f.z).not.toBeNull();
    expect(Math.abs(f.z!)).toBeLessThan(2);
    expect(f.crowded).toBeNull();
    expect(f.regime).toBe("neutral");
    expect(f.venues.okx).toBe(f.rate8h);
    expect(f.spreadRatio).toBeGreaterThan(1);
    expect(f.asOf).toBe(history[99].ts);
  });
  it("flags crowded_long beyond +2 sd and crowded_short below -2 sd", () => {
    const base = Array.from({ length: 40 }, (_, i) => ({ ts: i * 1000, rate: 0.0001 + (i % 2 ? 0.00001 : -0.00001) }));
    const long = buildFundingFeature([...base, { ts: 99_000, rate: 0.001 }], { hl: null, binance: null, bybit: null })!;
    expect(long.crowded).toBe("long");
    expect(long.regime).toBe("crowded_long");
    const short = buildFundingFeature([...base, { ts: 99_000, rate: -0.001 }], { hl: null, binance: null, bybit: null })!;
    expect(short.regime).toBe("crowded_short");
    expect(buildFundingFeature([], venues)).toBeNull();
  });
});

describe("oi feature", () => {
  const hourly = parseOiHistory(fx("okx-oi-history-1h.json").data);

  it("sorts the newest-first wire order ascending", () => {
    expect(hourly).toHaveLength(100);
    expect(hourly[0].ts).toBeLessThan(hourly[1].ts);
    expect(hourly[99].oiCcy).toBeCloseTo(29484.757, 2);
  });
  it("quadrant labels", () => {
    expect(quadrantFor(1, 1)).toBe("new_longs");
    expect(quadrantFor(1, -1)).toBe("short_cover");
    expect(quadrantFor(-1, 1)).toBe("new_shorts");
    expect(quadrantFor(-1, -1)).toBe("long_flush");
    expect(quadrantFor(null, 1)).toBeNull();
    expect(quadrantFor(0, 1)).toBeNull();
  });
  it("computes the 24h change from the fixture independently of price", () => {
    const f = buildOiFeature(hourly, [], 2.0, hourly[99].ts)!;
    const latest = hourly[99];
    const ago = [...hourly].reverse().find((p) => p.ts <= latest.ts - 24 * 3600e3)!;
    expect(f.change24hPct).toBeCloseTo(((latest.oiCcy - ago.oiCcy) / ago.oiCcy) * 100, 2);
    expect(f.change24hPct).not.toBe(f.priceChange24hPct);
    expect(f.change1hPct).not.toBeNull();
    expect(f.priceChange24hPct).toBe(2);
    expect(f.sd).toBeNull(); // no daily history
    expect(f.quadrant).toBeNull();
    expect(f.quadrantRaw).toBe(f.change24hPct! > 0 ? "new_longs" : "short_cover");
  });
  it("only fills the quadrant beyond 1 daily SD", () => {
    const daily: OiPoint[] = Array.from({ length: 31 }, (_, i) => ({ ts: i * 86400e3, oi: 0, oiCcy: 1000 * (1 + (i % 2 ? 0.0002 : -0.0002)), oiUsd: 0 }));
    const quiet = buildOiFeature(hourly, daily, -1, hourly[99].ts)!;
    expect(quiet.sd).not.toBeNull();
    // Daily SD on that series is about 0.04%, far below the fixture's 24h change => beyond 1 SD, quadrant filled.
    expect(Math.abs(quiet.sd!)).toBeGreaterThan(1);
    expect(quiet.quadrant).toBe(quiet.change24hPct! > 0 ? "new_shorts" : "long_flush");
    const wide: OiPoint[] = Array.from({ length: 31 }, (_, i) => ({ ts: i * 86400e3, oi: 0, oiCcy: 1000 * (1 + (i % 2 ? 0.05 : -0.05)), oiUsd: 0 }));
    expect(buildOiFeature(hourly, wide, -1, hourly[99].ts)!.quadrant).toBeNull();
    expect(buildOiFeature([], [], 1)).toBeNull();
  });
});

describe("cvd feature", () => {
  const raw = fx("okx-taker-5m-usd.json").data as string[][];
  const buckets = parseTakerBuckets(raw);

  it("reads [ts, sellVol, buyVol] and sorts ascending", () => {
    const newest = raw[0];
    const last = buckets[buckets.length - 1];
    expect(last.ts).toBe(Number(newest[0]));
    expect(last.sell).toBe(parseFloat(newest[1]));
    expect(last.buy).toBe(parseFloat(newest[2]));
  });
  it("drops the forming bucket, sums 4h / 1h / 15m windows and emits a 16-point series", () => {
    const latestTs = buckets[buckets.length - 1].ts;
    const now = latestTs + 60e3; // newest bucket still forming
    const f = buildCvdFeature(buckets, null, now)!;
    const closed = buckets.slice(0, -1);
    const sum = (bs: typeof buckets) => bs.reduce((s, b) => s + b.buy - b.sell, 0);
    expect(f.cum4hUsd).toBe(Math.round(sum(closed.slice(-48))));
    expect(f.slope1hUsd).toBe(Math.round(sum(closed.slice(-12))));
    expect(f.series15m).toHaveLength(16);
    expect(f.series15m[15]).toBe(f.cum4hUsd);
    const m15 = closed.slice(-3);
    const b = m15.reduce((s, x) => s + x.buy, 0);
    const sll = m15.reduce((s, x) => s + x.sell, 0);
    expect(f.takerImbalance15m).toBeCloseTo((b - sll) / (b + sll), 3);
    expect(f.qhImbalance).toBeNull();
    expect(f.qhReadings).toEqual([]);
    // once the newest bucket has closed it counts
    const g = buildCvdFeature(buckets, null, latestTs + 6 * 60e3)!;
    expect(g.cum4hUsd).toBe(Math.round(sum(buckets.slice(-48))));
  });
  it("reads the quarter-hour store through the registry", () => {
    expect(readQhImbalance("BTC")).toBeNull();
    registerQhReader((ccy) => (ccy === "BTC" ? { value: 0.31, readings: [0.1, 0.2, 0.4, 0.5], asOf: 1 } : null));
    expect(readQhImbalance("BTC")?.value).toBe(0.31);
    expect(readQhImbalance("ETH")).toBeNull();
    const f = buildCvdFeature(buckets, readQhImbalance("BTC"), buckets[buckets.length - 1].ts + 60e3)!;
    expect(f.qhImbalance).toBe(0.31);
    expect(f.qhReadings).toEqual([0.1, 0.2, 0.4, 0.5]);
    registerQhReader(() => {
      throw new Error("boom");
    });
    expect(readQhImbalance("BTC")).toBeNull();
    registerQhReader(null);
  });
});

describe("book feature", () => {
  const book: OrderBookSummary = {
    venue: "OKX",
    mid: 100,
    spreadPct: 0.01,
    coveragePct: 2,
    depth: [
      { band: 0.01, bidUsd: 10, askUsd: 5, imbalance: 0.333 },
      { band: 0.02, bidUsd: 20, askUsd: 20, imbalance: 0 },
    ],
    bidWalls: [{ price: 99, usd: 5, distancePct: -1, share: 0.1, strength: 4 }],
    askWalls: [],
    read: "",
  };
  it("lifts the widest band imbalance and nearest walls", () => {
    const f = buildBookFeature(book, 5)!;
    expect(f).toEqual({ asOf: 5, ttlMs: 45e3, imbalance: 0, band: 0.02, bidWallPct: -1, askWallPct: null, venue: "OKX" });
    expect(buildBookFeature(null)).toBeNull();
  });
});

describe("buildFeatures", () => {
  it("returns every feed null except session when nothing was fetched", () => {
    const f = buildFeatures({ ccy: undefined, isCrypto: false, price: 100, priceChange24hPct: null, assetDaily: [], funding: null, oi: null, cvd: null, orderBook: null, dvol: null, basis: null, macroRates: null, stablecoins: null, now: Date.UTC(2026, 9, 14, 15) });
    expect(f.funding).toBeNull();
    expect(f.oi).toBeNull();
    expect(f.cvd).toBeNull();
    expect(f.book).toBeNull();
    expect(f.vol).toBeNull();
    expect(f.basis).toBeNull();
    expect(f.macroRates).toBeNull();
    expect(f.stablecoins).toBeNull();
    expect(f.session.name).toBe("us");
  });
});
