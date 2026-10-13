import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLeaderboard, parseVaults, selectCandidates, selectSpecialists, DEFAULT_CRITERIA, DEFAULT_SPECIALISTS } from "./leaderboard";
import { describeOutcome, isOutcomeCoin, outcomeLabel, parseOutcomeCoin } from "./outcomes";
import { compactFill, groupStats, mapPositions, mergeFills, openedAtFromFills, perCoinStats, positionForGroup, recentTrades, summarizeOpen, isPerpCoin, countCopyableFills, totalEquity } from "./stats";
import { TokenBucket } from "./http";
import { buildRecord, buildRows, buildSummary, labelMix, perAssetCounts, scoreAll } from "./scanner";
import { parsePortfolio } from "./trader";
import { averageHoldMinutes, computeMix, computeStats30d, dailySeries, equityStartOf, lin, maxDrawdownPct, monthStartEquity, pnlRanks, profitableWeeks, scoreTrader, sortinoDaily, compareScored } from "./score";
import { copyStats } from "./stats";
import type { CompactFill, CopyStats, HlClearinghouseState, HlFill, HlPortfolio, LeaderRow, OpenPosition, TraderRecord } from "./types";

const fx = <T>(name: string): T => JSON.parse(readFileSync(join(__dirname, "__tests__", "fixtures", name), "utf-8")) as T;

// ── Leaderboard ──────────────────────────────────────────────────────────────

describe("leaderboard parse + candidate filter", () => {
  const rows = parseLeaderboard(fx("hl-leaderboard-sample.json"));

  it("parses strings to numbers and lowercases addresses", () => {
    expect(rows.length).toBe(12);
    const top = rows.find((r) => r.address === "0x77375a8c9d13bf79afb2a87f1b0ac1dfd5f5bf66")!;
    expect(top.displayName).toBeNull();
    expect(top.equity).toBeCloseTo(48126694.25, 1);
    expect(top.windows.month.pnl).toBeCloseTo(14593291.43, 1);
    expect(top.windows.month.volume).toBeCloseTo(17810108.34, 1);
    expect(top.windows.month.roi).toBeCloseTo(0.4347 * 100, 1); // percent, from the fraction 0.4347...
    expect(rows.find((r) => r.displayName === "Vault")?.address).toBe("0xvault000000000000000000000000000000000001");
    expect(rows.every((r) => r.address === r.address.toLowerCase())).toBe(true);
  });

  it("tolerates garbage rows", () => {
    expect(parseLeaderboard(null)).toEqual([]);
    expect(parseLeaderboard({ leaderboardRows: [null, {}, { ethAddress: "0xabc" }] })).toEqual([]);
  });

  it("filters by equity band, month volume/roi, drops vaults and zero-volume rows, ranks by month pnl", () => {
    const vaults = new Set(["0xvault000000000000000000000000000000000001"]);
    const c = selectCandidates(rows, vaults, { ...DEFAULT_CRITERIA, take: 400 });
    expect(c.find((r) => r.displayName === "Vault")).toBeUndefined();
    expect(c.find((r) => r.address === "0x00000000000000000000000000000000000000aa")).toBeUndefined();
    for (const r of c) {
      expect(r.equity).toBeGreaterThanOrEqual(25_000);
      expect(r.equity).toBeLessThanOrEqual(100_000_000);
      expect(r.windows.month.volume).toBeGreaterThanOrEqual(2_000_000);
      expect(r.windows.month.roi).toBeGreaterThan(0);
    }
    for (let i = 1; i < c.length; i++) expect(c[i - 1].windows.month.pnl).toBeGreaterThanOrEqual(c[i].windows.month.pnl);
    // 6 pre-filtered leaders + 1 qualifying random row; 3 random rows (negative roi / tiny equity), the vault and
    // the zero-volume row are dropped.
    expect(c.length).toBe(7);
    expect(selectCandidates(rows, vaults, { ...DEFAULT_CRITERIA, take: 2 }).length).toBe(2);
  });

  it("selects specialists: 25k..5M equity, month roi > 15%, volume > 300k, ranked by roi", () => {
    const sp = selectSpecialists(rows, new Set(), { ...DEFAULT_SPECIALISTS, take: 50 });
    for (const r of sp) {
      expect(r.equity).toBeGreaterThanOrEqual(25_000);
      expect(r.equity).toBeLessThanOrEqual(5_000_000);
      expect(r.windows.month.roi).toBeGreaterThan(15);
      expect(r.windows.month.volume).toBeGreaterThan(300_000);
    }
    for (let i = 1; i < sp.length; i++) expect(sp[i - 1].windows.month.roi).toBeGreaterThanOrEqual(sp[i].windows.month.roi);
    // the 48M and 15M leaders are out; the 4.3M (144% roi) and 0x350e-style accounts are in
    expect(sp.find((r) => r.address === "0x77375a8c9d13bf79afb2a87f1b0ac1dfd5f5bf66")).toBeUndefined();
    expect(sp.find((r) => r.address === "0x30afce2f6842bf183c7e3fe7162e279ff0b6393e")).toBeDefined();
    expect(sp.find((r) => r.displayName === "Vault")).toBeDefined(); // vault filtering is the caller's set
    expect(selectSpecialists(rows, new Set(["0xvault000000000000000000000000000000000001"]), DEFAULT_SPECIALISTS).find((r) => r.displayName === "Vault")).toBeUndefined();
  });

  it("parses the vault list into a lowercase address set", () => {
    const set = parseVaults([{ summary: { vaultAddress: "0xABCDEF" } }, { summary: {} }, null]);
    expect([...set]).toEqual(["0xabcdef"]);
  });
});

// ── Fill stats ───────────────────────────────────────────────────────────────

const mk = (over: Partial<HlFill> & { time: number; coin: string; dir: string; px: string; sz: string }): HlFill => ({
  side: over.dir.includes("Long") && over.dir.startsWith("Open") ? "B" : "A",
  startPosition: "0.0",
  closedPnl: "0.0",
  hash: "0xhash",
  oid: 1,
  crossed: true,
  fee: "0.0",
  tid: over.time,
  ...over,
});

describe("per-coin stats from fills", () => {
  const fills: CompactFill[] = [
    mk({ time: 1000, coin: "BTC", dir: "Open Long", px: "100000", sz: "1", fee: "10", startPosition: "0.0" }),
    mk({ time: 2000, coin: "BTC", dir: "Close Long", px: "101000", sz: "1", fee: "10", closedPnl: "1000", startPosition: "1.0" }),
    mk({ time: 3000, coin: "BTC", dir: "Open Long", px: "100000", sz: "2", fee: "20" }),
    mk({ time: 4000, coin: "BTC", dir: "Close Long", px: "99000", sz: "2", fee: "20", closedPnl: "-2000", startPosition: "2.0" }),
    mk({ time: 5000, coin: "BTC", dir: "Open Short", px: "100000", sz: "0.5", fee: "5" }),
    mk({ time: 6000, coin: "BTC", dir: "Close Short", px: "99000", sz: "0.5", fee: "5", closedPnl: "500", startPosition: "-0.5" }),
    mk({ time: 7000, coin: "BTC", dir: "Open Long", px: "100000", sz: "1", fee: "10" }),
    mk({ time: 8000, coin: "BTC", dir: "Long > Short", px: "102000", sz: "2", fee: "20", closedPnl: "2000", startPosition: "1.0" }),
    mk({ time: 9000, coin: "BTC", dir: "Close Short", px: "101000", sz: "1", fee: "10", closedPnl: "1000", startPosition: "-1.0" }),
    mk({ time: 9500, coin: "ADA", dir: "Open Long", px: "0.5", sz: "10000", fee: "1" }),
    mk({ time: 9600, coin: "ADA", dir: "Close Long", px: "0.55", sz: "10000", fee: "1", closedPnl: "500", startPosition: "10000" }),
    mk({ time: 9700, coin: "PURR/USDC", dir: "Buy", px: "0.1", sz: "10", fee: "0" }),
  ].map(compactFill);

  it("computes trades, volume, pnl, fees, wins/losses, win rate, avg size, last trade, direction", () => {
    const s = perCoinStats(fills);
    const btc = s.BTC;
    expect(btc.trades).toBe(9);
    // 100k + 101k + 200k + 198k + 50k + 49.5k + 100k + 204k + 101k
    expect(btc.volumeUsd).toBeCloseTo(1_103_500, 0);
    expect(btc.realizedPnl).toBe(2500);
    expect(btc.fees).toBe(110);
    expect(btc.first30dPnl).toBe(2390);
    expect(btc.wins).toBe(4); // 1000, 500, 2000 (flip), 1000
    expect(btc.losses).toBe(1);
    expect(btc.winRate).toBe(80); // percent
    expect(btc.avgTradeUsd).toBeCloseTo(1_103_500 / 9, 2);
    expect(btc.lastTradeAt).toBe(9000);
    expect(btc.coins).toEqual(["BTC"]);
    // opens: long 100k+200k+100k = 400k, short 50k + 204k (flip) = 254k -> 61% long -> mixed
    expect(btc.direction).toBe("mixed");
    expect(s["PURR/USDC"]).toBeUndefined();
  });

  it("hides the win rate under 5 closes and reports direction from the dominant side", () => {
    const ada = perCoinStats(fills).ADA;
    expect(ada.trades).toBe(2);
    expect(ada.wins).toBe(1);
    expect(ada.losses).toBe(0);
    expect(ada.winRate).toBeNull();
    expect(ada.direction).toBe("long");
    expect(ada.volumeUsd).toBeCloseTo(10_500, 2);
  });

  it("merges by tid, prunes by age and orders newest first", () => {
    const a = fills.slice(0, 4);
    const b = fills.slice(2, 6);
    const m = mergeFills(a, b, 2000);
    expect(m.map((f) => f[0])).toEqual([6000, 5000, 4000, 3000, 2000]);
  });

  it("derives openedAt from the newest flat-start or flip fill for the coin and side", () => {
    expect(openedAtFromFills(fills, "BTC", "short")).toBe(8000); // Long > Short flip
    expect(openedAtFromFills(fills, "BTC", "long")).toBe(7000);
    expect(openedAtFromFills(fills, "ETH", "long")).toBeNull();
  });

  it("recentTrades maps to the contract Trade shape and filters by coin", () => {
    const t = recentTrades(fills, 100, "ADA");
    expect(t.length).toBe(2);
    expect(t[0]).toMatchObject({ time: 9600, coin: "ADA", side: "sell", dir: "Close Long", px: 0.55, size: 10000, notionalUsd: 5500, closedPnl: 500, fee: 1, hash: "0xhash" });
    expect(recentTrades(fills, 3).length).toBe(3);
    expect(recentTrades(fills).some((x) => x.coin === "PURR/USDC")).toBe(false);
  });

  it("handles the recorded fill sample (flips, builder perps, spot exclusion)", () => {
    const raw = fx<HlFill[]>("hl-user-fills-sample.json");
    const s = perCoinStats(raw.map(compactFill));
    expect(s.BTC.trades).toBe(4);
    expect(s["xyz:NBIS"].trades).toBe(2);
    expect(isPerpCoin("xyz:NBIS")).toBe(true);
    expect(isPerpCoin("@107")).toBe(false);
    for (const st of Object.values(s)) {
      expect(Number.isFinite(st.volumeUsd)).toBe(true);
      expect(st.lastTradeAt).not.toBeNull();
    }
  });
});

// ── Open positions ───────────────────────────────────────────────────────────

describe("open-position mapping", () => {
  const state = fx<HlClearinghouseState>("hl-clearinghouse-state.json");

  it("maps clearinghouseState positions to the contract shape", () => {
    const pos = mapPositions(state);
    expect(pos.length).toBe(state.assetPositions.length);
    const btc = pos.find((p) => p.coin === "BTC")!;
    expect(btc.side).toBe("short");
    expect(btc.size).toBe(1);
    expect(btc.notionalUsd).toBe(83476);
    expect(btc.entryPx).toBe(81208);
    expect(btc.markPx).toBeCloseTo(83476, 6);
    expect(btc.leverage).toBe(11);
    expect(btc.leverageType).toBe("cross");
    expect(btc.unrealizedPnl).toBe(-2268);
    expect(btc.roe).toBeCloseTo(-30.72, 2); // percent
    expect(btc.fundingPaid).toBeCloseTo(-982.91, 2);
    expect(btc.liqPx).toBeGreaterThan(0);
    expect(btc.openedAt).toBeNull();
    // sorted by notional desc
    for (let i = 1; i < pos.length; i++) expect(pos[i - 1].notionalUsd).toBeGreaterThanOrEqual(pos[i].notionalUsd);
  });

  it("fills in openedAt from fills and summarises", () => {
    const fills = [compactFill(mk({ time: 123, coin: "BTC", dir: "Open Short", px: "81208", sz: "1", startPosition: "0.0" }))];
    const pos = mapPositions(state, fills);
    expect(pos.find((p) => p.coin === "BTC")!.openedAt).toBe(123);
    const sum = summarizeOpen(pos);
    expect(sum.count).toBe(pos.length);
    expect(sum.coins).toContain("BTC");
    expect(sum.notionalUsd).toBeCloseTo(pos.reduce((s, p) => s + p.notionalUsd, 0), 1);
  });

  it("returns nothing for null or empty state and skips zero-size positions", () => {
    expect(mapPositions(null)).toEqual([]);
    const z = { ...state, assetPositions: [{ type: "oneWay", position: { ...state.assetPositions[0].position, szi: "0.0" } }] };
    expect(mapPositions(z)).toEqual([]);
  });

  it("merges main + dex states (first occurrence of a coin wins) and totalEquity sums account values", () => {
    const dex: HlClearinghouseState = { ...state, marginSummary: { ...state.marginSummary, accountValue: "1000" }, assetPositions: [{ type: "oneWay", position: { ...state.assetPositions[0].position, coin: "xyz:GOLD", szi: "2", positionValue: "8000" } }] };
    const pos = mapPositions([state, null, dex]);
    expect(pos.length).toBe(state.assetPositions.length + 1);
    expect(pos.find((p) => p.coin === "xyz:GOLD")?.side).toBe("long");
    expect(totalEquity([state, null, dex])).toBeCloseTo(1386799.69 + 1000, 1);
    expect(totalEquity([null, null])).toBeNull();
  });
});

// ── Token bucket ─────────────────────────────────────────────────────────────

describe("token bucket", () => {
  it("serves from capacity, then waits for refill, and never exceeds capacity", async () => {
    let t = 0;
    const slept: number[] = [];
    const b = new TokenBucket(100, 100 / 60_000, () => t, async (ms) => {
      slept.push(ms);
      t += ms;
    });
    await b.take(20);
    await b.take(20);
    expect(b.available()).toBeCloseTo(60, 6);
    expect(slept).toEqual([]);
    await b.take(80); // needs 20 more -> 12s at 100/min
    expect(slept.length).toBe(1);
    expect(slept[0]).toBe(12_000);
    expect(b.available()).toBeCloseTo(0, 6);
    t += 10 * 60_000;
    expect(b.available()).toBe(100);
    expect(b.waitFor(2)).toBe(0);
  });

  it("serialises concurrent takers", async () => {
    let t = 0;
    const b = new TokenBucket(40, 40 / 60_000, () => t, async (ms) => {
      t += ms;
    });
    await Promise.all([b.take(20), b.take(20), b.take(20)]);
    expect(t).toBe(30_000);
    expect(b.available()).toBeCloseTo(0, 6);
  });
});

// ── Outcome markets ──────────────────────────────────────────────────────────

describe("outcome markets", () => {
  it("recognises #<outcomeId><side> coins and labels them", () => {
    expect(isOutcomeCoin("#106090")).toBe(true);
    expect(isOutcomeCoin("BTC")).toBe(false);
    expect(isOutcomeCoin("#1")).toBe(false);
    expect(parseOutcomeCoin("#106090")).toEqual([10609, 0]);
    expect(parseOutcomeCoin("#12301")).toEqual([1230, 1]);
    expect(parseOutcomeCoin("xyz:GOLD")).toBeNull();
    expect(outcomeLabel("#106090")).toBe("Outcome market #10609 · Yes"); // nothing cached in tests
    expect(outcomeLabel("BTC")).toBeNull();
    expect(describeOutcome("template:binaryPrice", "perp:BTC|priceDescription:the Pyth BTC/USD price|seconds:90|threshold:81415", 1, [{ name: "template:Yes" }, { name: "template:No" }])).toBe("Outcome: BTC price binary (90s) · No");
    expect(describeOutcome("template:sportsContestWinner", "competition:NFL|participantA:Baltimore Ravens|participantB:Cleveland Browns|shortNameA:Ravens|shortNameB:Browns", 0, [{ name: "template:{shortNameA}" }, { name: "template:{shortNameB}" }])).toBe("Outcome: Ravens vs Browns · Yes");
  });

  it("outcome fills stay on the OTHER side of the mix and get a label in topCoins", () => {
    const perCoin = perCoinStats(
      [
        mk({ time: 1, coin: "#106090", dir: "Open Long", px: "0.6", sz: "1000" }),
        mk({ time: 2, coin: "#106090", dir: "Settlement", px: "1", sz: "1000", closedPnl: "400", startPosition: "1000" }),
        mk({ time: 3, coin: "BTC", dir: "Open Long", px: "100", sz: "4" }),
      ].map(compactFill)
    );
    const mix = labelMix(computeMix(perCoin));
    expect(mix.byAsset.OTHER.volumeUsd).toBe(1600);
    expect(mix.copyableSharePct).toBe(20);
    expect(mix.topCoins[0]).toEqual({ coin: "#106090", sharePct: 80, label: "Outcome market #10609 · Yes" });
    expect(mix.topCoins[1].label).toBeUndefined();
  });
});

// ── Groups / mix / stats30d / score ──────────────────────────────────────────

describe("asset groups and mix", () => {
  const fills = [
    mk({ time: 1, coin: "xyz:GOLD", dir: "Open Long", px: "4000", sz: "10" }), // 40k
    mk({ time: 2, coin: "xyz:GOLD", dir: "Close Long", px: "4100", sz: "10", closedPnl: "1000", startPosition: "10" }), // 41k
    mk({ time: 3, coin: "PAXG", dir: "Open Short", px: "4000", sz: "5" }), // 20k
    mk({ time: 4, coin: "PAXG", dir: "Close Short", px: "4100", sz: "5", closedPnl: "-500", startPosition: "-5" }), // 20.5k
    mk({ time: 5, coin: "xyz:CL", dir: "Open Long", px: "60", sz: "1000" }), // 60k
    mk({ time: 6, coin: "ETH", dir: "Open Long", px: "3000", sz: "10" }), // 30k
    mk({ time: 7, coin: "ETH", dir: "Close Long", px: "3000", sz: "10", startPosition: "10" }), // 30k
  ].map(compactFill);
  const perCoin = perCoinStats(fills);

  it("groupStats merges the group markets under the group name", () => {
    const gold = groupStats(perCoin, "GOLD", fills)!;
    expect(gold.coin).toBe("GOLD");
    expect([...gold.coins].sort()).toEqual(["PAXG", "xyz:GOLD"]);
    expect(gold.trades).toBe(4);
    expect(gold.volumeUsd).toBeCloseTo(121_500, 2);
    expect(gold.realizedPnl).toBe(500);
    expect(gold.wins).toBe(1);
    expect(gold.losses).toBe(1);
    expect(gold.winRate).toBeNull();
    expect(gold.lastTradeAt).toBe(4);
    expect(gold.direction).toBe("mixed"); // 40k long vs 20k short opened -> 67% long
    const wti = groupStats(perCoin, "WTI")!;
    expect(wti.coin).toBe("WTI");
    expect(wti.coins).toEqual(["xyz:CL"]);
    expect(wti.direction).toBe("long");
    expect(groupStats(perCoin, "BTC")).toBeNull();
    expect(countCopyableFills(fills)).toBe(5);
  });

  it("computeMix reports copyable share by volume and by trade count, per group and top coins", () => {
    const mix = computeMix(perCoin);
    // total 241.5k; copyable = 121.5k + 60k = 181.5k -> 75.2%
    expect(mix.copyableSharePct).toBeCloseTo(75.2, 1);
    expect(mix.copyableTradeSharePct).toBeCloseTo(71.4, 1); // 5 of 7
    expect(mix.byAsset.GOLD.volumeUsd).toBeCloseTo(121_500, 2);
    expect(mix.byAsset.GOLD.trades).toBe(4);
    expect(mix.byAsset.WTI.sharePct).toBeCloseTo(24.8, 1);
    expect(mix.byAsset.OTHER.volumeUsd).toBe(60_000);
    expect(mix.byAsset.BTC.sharePct).toBe(0);
    expect(mix.topCoins[0]).toEqual({ coin: "xyz:GOLD", sharePct: 33.5 });
    expect(mix.topCoins.length).toBe(4);
  });

  it("positionForGroup picks the largest open position among the group markets", () => {
    const base = mapPositions(fx<HlClearinghouseState>("hl-clearinghouse-state.json"));
    const pos = [...base, { ...base[0], coin: "xyz:GOLD", notionalUsd: 10 }, { ...base[0], coin: "PAXG", notionalUsd: 20 }];
    expect(positionForGroup(pos, "GOLD")?.coin).toBe("PAXG");
    expect(positionForGroup(pos, "BTC")?.coin).toBe("BTC");
    expect(positionForGroup(pos, "WTI")).toBeNull();
  });
});

describe("stats30d and portfolio metrics", () => {
  const day = 86_400_000;
  const now = 100 * day;
  // 30 daily points: +100/day except days 10..14 which lose 300/day (equityStart 10k -> peak 11k at day 9, trough 9.5k)
  const month: [number, string][] = [];
  let cum = 0;
  for (let d = 0; d < 30; d++) {
    cum += d >= 10 && d < 15 ? -300 : 100;
    month.push([now - (29 - d) * day + 1000, String(cum)]);
    month.push([now - (29 - d) * day + 2000, String(cum)]); // two samples per day collapse to one
  }
  const portfolio = [["month", { accountValueHistory: [[now - 29 * day, "10000"]], pnlHistory: month, vlm: "1" }]] as HlPortfolio;
  const daily = dailySeries(portfolio);

  it("averageHoldMinutes reconstructs round trips per coin, including flips", () => {
    const fills = [
      mk({ time: 0, coin: "BTC", dir: "Open Long", px: "1", sz: "1", startPosition: "0" }),
      mk({ time: 60_000, coin: "BTC", dir: "Close Long", px: "1", sz: "1", startPosition: "1" }), // 1 min
      mk({ time: 120_000, coin: "BTC", dir: "Open Short", px: "1", sz: "1", startPosition: "0" }),
      mk({ time: 300_000, coin: "BTC", dir: "Short > Long", px: "1", sz: "2", startPosition: "-1" }), // 3 min, then long opens
      mk({ time: 420_000, coin: "BTC", dir: "Close Long", px: "1", sz: "1", startPosition: "1" }), // 2 min
      mk({ time: 0, coin: "ETH", dir: "Open Long", px: "1", sz: "1", startPosition: "0" }), // never closed
    ].map(compactFill);
    expect(averageHoldMinutes(fills)).toBe(2);
    expect(averageHoldMinutes([])).toBeNull();
  });

  it("dailySeries resamples to one point per UTC day; drawdown, weeks and sortino follow the rubric", () => {
    expect(daily.length).toBe(30);
    expect(daily[29][1]).toBe(1000); // 25*100 - 5*300
    // peak equity 11000 (day 9), trough 9500 (day 14) -> 13.6%
    expect(maxDrawdownPct(daily, 10_000)).toBeCloseTo(13.6, 1);
    expect(maxDrawdownPct(daily.slice(0, 5), 10_000)).toBeNull();
    const pw = profitableWeeks(daily)!;
    expect(pw.weeks).toBe(4);
    expect(pw.profitable).toBe(3); // the week holding days 10..14 is negative
    expect(profitableWeeks(daily.slice(0, 10))).toBeNull();
    const sd = sortinoDaily(daily, 10_000)!;
    expect(sd).toBeGreaterThan(0);
    expect(sortinoDaily(daily.map(([t], i) => [t, i * 10] as [number, number]), 10_000)).toBe(0.3); // no losing day
    expect(dailySeries(null)).toEqual([]);
    expect(equityStartOf(12_000, 2_000)).toBe(10_000);
    expect(equityStartOf(500, 2_000)).toBe(1000);
    expect(equityStartOf(500, 2_000, 30_000)).toBe(30_000); // recorded start wins over the floor
    expect(monthStartEquity(portfolio)).toBe(10_000);
    expect(monthStartEquity(null)).toBeNull();
  });

  it("lin interpolates piecewise and clamps", () => {
    const a: [number, number][] = [[0, 0], [1, 70], [3, 100]];
    expect(lin(-5, a)).toBe(0);
    expect(lin(0.5, a)).toBe(35);
    expect(lin(2, a)).toBe(85);
    expect(lin(99, a)).toBe(100);
  });

  it("copyStats counts copyable fills, closing trades, gross wins/losses, concentration, active days", () => {
    const t0 = now;
    const fills = [
      mk({ time: t0, coin: "BTC", dir: "Open Long", px: "100", sz: "50", fee: "1" }), // notional 5000 -> lev 0.5 of 10k
      mk({ time: t0 + 3600e3, coin: "BTC", dir: "Close Long", px: "110", sz: "50", closedPnl: "500", fee: "1", startPosition: "50" }),
      mk({ time: t0 + day, coin: "xyz:GOLD", dir: "Open Short", px: "100", sz: "200", fee: "1" }), // 20000 -> lev 2
      mk({ time: t0 + day + 10, coin: "xyz:GOLD", dir: "Close Short", px: "101", sz: "200", closedPnl: "-200", fee: "1", startPosition: "-200" }),
      mk({ time: t0 + 2 * day, coin: "ADA", dir: "Close Long", px: "1", sz: "1", closedPnl: "100", fee: "0", startPosition: "1" }),
      mk({ time: t0 + 2 * day, coin: "ETH", dir: "Close Long", px: "1", sz: "1", closedPnl: "-1000", fee: "0", startPosition: "1" }), // not copyable, but makes day 3 a losing day
    ].map(compactFill);
    const c = copyStats(fills, 10_000);
    expect(c.fills).toBe(5);
    expect(c.trades).toBe(3);
    expect(c.wins).toBe(2);
    expect(c.losses).toBe(1);
    expect(c.pnlNet).toBe(400 - 4);
    expect(c.grossWins).toBe(600);
    expect(c.grossLosses).toBe(200);
    expect(c.topTradeShare).toBeCloseTo(500 / 600, 3);
    expect(c.activeDays).toBe(3);
    expect(c.profitableDaysPct).toBeCloseTo(33.3, 1); // day1 +500, day2 -200, day3 -900
    expect(c.lastFillAt).toBe(t0 + 2 * day);
    expect(c.medianNotionalLev).toBeCloseTo(1.25, 2); // median of 0.5 and 2
    expect(copyStats([], 10_000).lastFillAt).toBeNull();
  });

  it("computeStats30d splits copyable vs other pnl and trades/day", () => {
    const perCoin = perCoinStats(
      [
        mk({ time: 1, coin: "BTC", dir: "Close Long", px: "1", sz: "1", closedPnl: "300", startPosition: "1" }),
        mk({ time: 2, coin: "km:USOIL", dir: "Close Long", px: "1", sz: "1", closedPnl: "200", startPosition: "1" }),
        mk({ time: 3, coin: "ETH", dir: "Close Long", px: "1", sz: "1", closedPnl: "-50", startPosition: "1" }),
      ].map(compactFill)
    );
    const s = computeStats30d(perCoin, [], [], daily, 10_000);
    expect(s.tradesPerDay).toBe(0.1);
    expect(s.pnlCopyable).toBe(500);
    expect(s.pnlOther).toBe(-50);
    expect(s.maxDrawdownPct).toBeCloseTo(13.6, 1);
    expect(s.profitableWeeksPct).toBe(75);
    expect(s.medianLeverage).toBeNull();
    expect(s.avgHoldMin).toBeNull();
    expect(computeStats30d(perCoin, [], [], [], 10_000).maxDrawdownPct).toBeNull();
  });
});

describe("copyability score (research/copytrade-scoring.md)", () => {
  const day = 86_400_000;
  const now = 100 * day;
  const steadyDaily: [number, number][] = Array.from({ length: 30 }, (_, d) => [now - (29 - d) * day, (d + 1) * 600]); // +600/day, no losing day
  const copy = (over: Partial<CopyStats>): CopyStats => ({ fills: 150, trades: 71, pnlNet: 18_000, grossWins: 38_000, grossLosses: 20_000, wins: 41, losses: 30, topTradeShare: 0.12, activeDays: 26, profitableDaysPct: 62, lastFillAt: now - 0.5 * day, medianNotionalLev: 4, ...over });
  const mixOf = (vol: number, cnt: number) => ({ copyableSharePct: vol, copyableTradeSharePct: cnt, byAsset: { BTC: { volumeUsd: 0, trades: 0, sharePct: 0 }, ADA: { volumeUsd: 0, trades: 0, sharePct: 0 }, GOLD: { volumeUsd: 0, trades: 0, sharePct: 0 }, WTI: { volumeUsd: 0, trades: 0, sharePct: 0 }, OTHER: { volumeUsd: 0, trades: 0, sharePct: 0 } }, topCoins: [] });
  const pos = (over: Partial<OpenPosition>): OpenPosition => ({ coin: "BTC", side: "long", size: 1, notionalUsd: 100_000, entryPx: 100_000, markPx: 100_000, liqPx: 70_000, leverage: 4, leverageType: "cross", marginUsed: 25_000, unrealizedPnl: 0, roe: 0, fundingPaid: 0, openedAt: null, ...over });
  const stats = { tradesPerDay: 5, avgHoldMin: 60, medianLeverage: 4, maxDrawdownPct: 8, profitableWeeksPct: 100, pnlCopyable: 18_000, pnlOther: 1_000 };

  it("wallet A (steady BTC/GOLD) grades A with no penalties", () => {
    const sc = scoreTrader({ mix: mixOf(88, 84), stats30d: stats, copy: copy({}), positions: [pos({ notionalUsd: 144_000 })], equity: 120_000, monthPnl: 19_000, daily: steadyDaily, pnlPctl: 82, now });
    expect(sc.focus).toBeCloseTo(86.4, 1);
    expect(sc.success!).toBeGreaterThan(75);
    expect(sc.consistency!).toBeGreaterThan(85);
    expect(sc.risk!).toBeGreaterThan(85);
    expect(sc.activity!).toBeGreaterThan(85);
    expect(sc.copyability).toBeGreaterThanOrEqual(80);
    expect(sc.grade).toBe("A");
    expect(sc.thin).toBe(false);
    expect(sc.reasons[0]).toMatch(/Trades mostly BTC\/ADA\/GOLD\/WTI \(88%\)/);
    expect(sc.reasons).toContain("Profitable every week this month");
  });

  it("wallet B (alt hero) collapses under the focus multiplier and penalties", () => {
    const drawdownDaily: [number, number][] = Array.from({ length: 30 }, (_, d) => [now - (29 - d) * day, d < 10 ? d * 8_000 : d < 20 ? 80_000 - (d - 10) * 7_000 : 10_000 + (d - 20) * 5_000]);
    const sc = scoreTrader({
      mix: mixOf(22, 30),
      stats30d: { ...stats, medianLeverage: 25, maxDrawdownPct: 38 },
      copy: copy({ fills: 27, trades: 27, pnlNet: 4_000, grossWins: 17_000, grossLosses: 13_000, wins: 12, losses: 15, topTradeShare: 0.55, activeDays: 14, profitableDaysPct: 50, lastFillAt: now - 2 * day }),
      positions: [pos({ notionalUsd: 240_000, leverage: 25, liqPx: 96_000 })],
      equity: 40_000,
      monthPnl: 60_000,
      daily: drawdownDaily,
      pnlPctl: 45,
      now,
    });
    expect(sc.focus).toBeCloseTo(25.2, 1);
    expect(sc.copyability).toBeLessThan(10);
    expect(sc.grade).toBe("D");
    expect(sc.reasons).toContain("Median leverage above 10x");
    expect(sc.reasons).toContain("One position is over 3x account equity");
    expect(sc.reasons.some((r) => r.startsWith("Drawdown over"))).toBe(true); // equityStart floors at 1000 here, so the curve shows >50%
    expect(sc.reasons).toContain("Top single trade is 55% of all profit");
  });

  it("wallet C (new scalper) is thin: substitutions, trades<20 penalty, grade capped at C", () => {
    const sc = scoreTrader({
      mix: mixOf(97, 95),
      stats30d: { ...stats, medianLeverage: 12, maxDrawdownPct: 6 },
      copy: copy({ fills: 14, trades: 14, pnlNet: 2_400, grossWins: 3_000, grossLosses: 600, wins: 9, losses: 5, activeDays: 9, lastFillAt: now - 0.2 * day }),
      positions: [pos({ notionalUsd: 20_000, leverage: 12, liqPx: 93_000 })],
      equity: 8_000,
      monthPnl: 2_400,
      daily: steadyDaily.slice(21), // 9 points
      pnlPctl: null,
      now,
    });
    expect(sc.success).toBeNull();
    expect(sc.consistency).toBeNull();
    expect(sc.thin).toBe(true);
    expect(sc.grade).toBe("D");
    expect(sc.copyability).toBeLessThan(40);
    expect(sc.reasons).toContain("Not enough closed trades to judge success");
    expect(sc.reasons).toContain("Fewer than 20 copyable trades in 30 days");
  });

  it("under 5 copyable fills is not scored; grade gates drop one letter; tie-breakers are deterministic", () => {
    const none = scoreTrader({ mix: mixOf(0, 0), stats30d: stats, copy: copy({ fills: 2, trades: 1 }), positions: [], equity: 50_000, monthPnl: 1000, daily: [], pnlPctl: null, now });
    expect(none).toMatchObject({ copyability: 0, grade: "D", success: null, reasons: ["No copyable activity"] });
    // Score in the A band but fewer than 40 trades -> B.
    const gated = scoreTrader({ mix: mixOf(88, 84), stats30d: stats, copy: copy({ trades: 30, wins: 18, losses: 12 }), positions: [pos({})], equity: 120_000, monthPnl: 19_000, daily: steadyDaily, pnlPctl: 95, now });
    expect(gated.copyability).toBeGreaterThanOrEqual(75);
    expect(gated.grade).toBe("B");
    expect(gated.reasons[0]).toMatch(/grade A/);
    const a = { score: { ...gated, consistency: 90 }, stats30d: stats, copy: copy({}), address: "0xb" };
    const b = { score: { ...gated, consistency: 80 }, stats30d: stats, copy: copy({}), address: "0xa" };
    expect(compareScored(a, b)).toBeLessThan(0);
    expect(compareScored({ ...a, score: b.score }, b)).toBeGreaterThan(0); // equal -> address asc puts 0xa first
    expect(pnlRanks([5, 1, 3])).toEqual([100, 0, 50]);
    expect(pnlRanks([2, 2])).toEqual([50, 50]);
    expect(pnlRanks([7])).toEqual([50]);
  });
});

// ── Rows / records / portfolio ───────────────────────────────────────────────

describe("records and ranking", () => {
  const leader = (address: string, monthPnl: number, roi = 10): LeaderRow => ({
    address,
    displayName: null,
    equity: 100_000,
    windows: {
      day: { pnl: 0, roi: 0, volume: 0 },
      week: { pnl: 0, roi: 0, volume: 0 },
      month: { pnl: monthPnl, roi, volume: 5_000_000 },
      allTime: { pnl: monthPnl * 2, roi: roi * 2, volume: 9_000_000 },
    },
  });
  const state = fx<HlClearinghouseState>("hl-clearinghouse-state.json");
  const fillsA = [
    mk({ time: 1, coin: "BTC", dir: "Open Long", px: "100000", sz: "1" }),
    mk({ time: 2, coin: "BTC", dir: "Close Long", px: "101000", sz: "1", closedPnl: "1000", startPosition: "1" }),
  ].map(compactFill);
  const fillsB = [
    mk({ time: 1, coin: "ADA", dir: "Open Short", px: "0.5", sz: "100000" }),
    mk({ time: 2, coin: "ADA", dir: "Close Short", px: "0.4", sz: "100000", closedPnl: "10000", startPosition: "-100000" }),
    mk({ time: 3, coin: "ETH", dir: "Open Long", px: "3000", sz: "100" }), // 300k other -> focus 23%
  ].map(compactFill);
  const fillsC = Array.from({ length: 24 }, (_, i) => mk({ time: 1000 + i, coin: "xyz:CL", dir: i % 2 ? "Close Long" : "Open Long", px: "60", sz: "1000", closedPnl: i % 2 ? "100" : "0", startPosition: i % 2 ? "1000" : "0" })).map(compactFill);
  const daily: [number, number][] = Array.from({ length: 20 }, (_, d) => [d * 86_400_000, d * 10]);
  const recs: TraderRecord[] = [
    buildRecord(leader("0xa", 500), fillsA, [state, null, null], null, true, null, 10),
    buildRecord(leader("0xb", 9000), fillsB, [null, null, null], null, true, null, 10),
    buildRecord(leader("0xc", 100), fillsC, [null, null, null], null, true, { at: 1, daily, equityStart: 90_000 }, 10),
  ];
  const q = (over: Partial<Parameters<typeof buildRows>[1]>): Parameters<typeof buildRows>[1] => ({ asset: "ALL", window: "month", sort: "assetPnl", minVolume: 0, limit: 50, minFocus: 0, ...over });

  it("buildRecord uses live equity when a state is present and leaderboard equity otherwise", () => {
    expect(recs[0].equity).toBeCloseTo(1386799.69, 1);
    expect(recs[1].equity).toBe(100_000);
    expect(recs[0].open.count).toBe(state.assetPositions.length);
    expect(recs[1].open.count).toBe(0);
    expect(recs[0].perCoin.BTC.realizedPnl).toBe(1000);
    expect(recs[0].mix.copyableSharePct).toBe(100);
    expect(recs[1].mix.copyableSharePct).toBeCloseTo(23.1, 1); // 90k of 390k
    expect(recs[0].copyableFills).toBe(2);
    expect(recs[2].copy.fills).toBe(24);
    expect(recs[2].copy.trades).toBe(12);
    expect(recs[2].stats30d.maxDrawdownPct).toBe(0);
    expect(recs[2].stats30d.profitableWeeksPct).toBe(100);
  });

  it("asset rows include only traders with fills or an open position in that group, ranked by asset pnl", () => {
    const btc = buildRows(recs, q({ asset: "BTC" }));
    expect(btc.map((r) => r.address)).toEqual(["0xa"]);
    expect(btc[0].rank).toBe(1);
    expect(btc[0].asset?.coin).toBe("BTC");
    expect(btc[0].asset?.coins).toEqual(["BTC"]);
    expect(btc[0].openForAsset?.side).toBe("short");
    expect(btc[0].window.pnl).toBe(500);
    expect(btc[0].score.grade).toBeDefined();
    const ada = buildRows(recs, q({ asset: "ADA" }));
    expect(ada.map((r) => r.address)).toEqual(["0xb"]);
    expect(ada[0].openForAsset).toBeNull();
    const wti = buildRows(recs, q({ asset: "WTI" }));
    expect(wti.map((r) => r.address)).toEqual(["0xc"]);
    expect(wti[0].asset?.coin).toBe("WTI");
    expect(wti[0].asset?.coins).toEqual(["xyz:CL"]);
    expect(buildRows(recs, q({ asset: "GOLD" }))).toEqual([]);
  });

  it("asset=ALL ranks by window pnl with asset null, and honours minVolume, limit, minFocus and the sorts", () => {
    const all = buildRows(recs, q({}));
    expect(all.map((r) => r.address)).toEqual(["0xb", "0xa", "0xc"]);
    expect(all[0].asset).toBeNull();
    expect(all.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(buildRows(recs, q({ limit: 1 })).length).toBe(1);
    expect(buildRows(recs, q({ asset: "BTC", sort: "volume", minVolume: 300_000 })).length).toBe(0);
    expect(buildRows(recs, q({ sort: "equity" }))[0].address).toBe("0xa");
    expect(buildRows(recs, q({ minFocus: 70 })).map((r) => r.address).sort()).toEqual(["0xa", "0xc"]);
    expect(buildRows(recs, q({ sort: "focus" }))[0].address).toBe("0xc"); // 0xa/0xb unscored tie -> pnlNet tie-break
    // winRate: all null (under 5 closes) except 0xc -> no NaN, 0xc first
    const wr = buildRows(recs, q({ window: "allTime", sort: "winRate" }));
    expect(wr.every((r) => Number.isFinite(r.rank))).toBe(true);
    expect(wr[0].address).toBe("0xc");
    // default copyability sort: 0xa and 0xb have under 5 copyable fills -> not scored (0); 0xc leads
    const cs = buildRows(recs, q({ sort: "copyability" }));
    expect(cs[0].address).toBe("0xc");
    expect(cs[0].score.copyability).toBeGreaterThan(0);
    expect(cs[1].score.copyability).toBe(0);
  });

  it("perAssetCounts counts wallets with fills or an open position per group", () => {
    expect(perAssetCounts(recs)).toEqual({ BTC: 1, ADA: 1, GOLD: 0, WTI: 1 });
    expect(perAssetCounts([])).toEqual({ BTC: 0, ADA: 0, GOLD: 0, WTI: 0 });
  });

  it("buildSummary returns the four asset cards and the COPYABLE strip, fewer than 5 rows when fewer qualify", () => {
    const empty = buildSummary([], "month");
    expect(empty).toEqual({ BTC: [], ADA: [], GOLD: [], WTI: [], COPYABLE: [] });
    const s = buildSummary(recs, "month", 5, 10);
    expect(s.BTC.length).toBe(1);
    expect(Object.keys(s).sort()).toEqual(["ADA", "BTC", "COPYABLE", "GOLD", "WTI"]);
    expect(s.BTC.map((r) => r.address)).toEqual(["0xa"]);
    expect(s.GOLD).toEqual([]);
    expect(s.COPYABLE.map((r) => r.address)).toEqual(["0xc", "0xa"]);
    expect(s.COPYABLE.every((r) => r.asset === null && r.mix.copyableSharePct >= 70)).toBe(true);
    expect(scoreAll(recs).size).toBe(3);
  });

  it("parses the portfolio response into windows (roi in percent) and pnl histories", () => {
    const p = parsePortfolio(fx<HlPortfolio>("hl-portfolio-sample.json"));
    expect(p.pnlHistory.month.length).toBe(3);
    expect(p.pnlHistory.allTime.length).toBe(3);
    expect(typeof p.pnlHistory.month[0][0]).toBe("number");
    expect(typeof p.pnlHistory.month[0][1]).toBe("number");
    expect(p.windows.month?.volume).toBeCloseTo(32554688.29, 1);
    expect(parsePortfolio(null).pnlHistory.month).toEqual([]);
  });
});
