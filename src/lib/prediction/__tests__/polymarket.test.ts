import { describe, expect, it } from "vitest";
import {
  classifyEvent,
  detectPriceTopic,
  fedBucket,
  fedCutsBucket,
  fedLevelBucket,
  normalizeEvent,
  openMarkets,
  parseJobsBucket,
  parseJsonArray,
  parseMonthPeriod,
  parsePercent,
  parseStrike,
  parseStrikeSide,
  periodFromEndDate,
  selectMarkets,
  yesProbability,
  type GammaEvent,
} from "../polymarket";

// Fixtures trimmed from live Gamma API responses captured 2026-10-06.
const FED_OCT: GammaEvent = {
  id: 606422,
  slug: "fed-decision-in-october-20260617190323537",
  title: "Fed Decision in October?",
  endDate: "2026-10-29T03:59:00Z",
  volume: 27212841.06177198,
  liquidity: 2888903.02345,
  closed: false,
  markets: [
    { id: 2589810, conditionId: "0xa69ef420", question: "Will the Fed decrease interest rates by 50+ bps after the October 2026 meeting?", groupItemTitle: "50+ bps decrease", outcomes: '["Yes", "No"]', outcomePrices: '["0.0015", "0.9985"]', bestBid: 0.001, bestAsk: 0.002, volume: 4381632.73, closed: false },
    { id: 2589811, conditionId: "0x9cf563d7", question: "Will the Fed decrease interest rates by 25 bps after the October 2026 meeting?", groupItemTitle: "25 bps decrease", outcomes: '["Yes", "No"]', outcomePrices: '["0.0045", "0.9955"]', bestBid: 0.004, bestAsk: 0.005, volume: 4837972.81, closed: false },
    { id: 2589812, conditionId: "0xdf9bf27e", question: "Will there be no change in Fed interest rates after the October 2026 meeting?", groupItemTitle: "No change", outcomes: '["Yes", "No"]', outcomePrices: '["0.825", "0.175"]', bestBid: 0.82, bestAsk: 0.83, volume: 7707661.41, closed: false },
    { id: 2589813, conditionId: "0x12aa13b3", question: "Will the Fed increase interest rates by 25 bps after the October 2026 meeting?", groupItemTitle: "25 bps increase", outcomes: '["Yes", "No"]', outcomePrices: '["0.165", "0.835"]', bestBid: 0.16, bestAsk: 0.17, volume: 6532055.03, closed: false },
    { id: 2589814, conditionId: "0xde5d75ab", question: "Will the Fed increase interest rates by 50+ bps after the October 2026 meeting?", groupItemTitle: "50+ bps increase", outcomes: '["Yes", "No"]', outcomePrices: '["0.0035", "0.9965"]', bestBid: 0.003, bestAsk: 0.004, volume: 3753519.07, closed: false },
  ],
};

const FED_CUTS: GammaEvent = {
  slug: "how-many-fed-rate-cuts-in-2026",
  title: "How many Fed rate cuts in 2026?",
  endDate: "2027-01-01T04:59:00Z",
  volume: "53900685.75",
  liquidity: "4131180.69",
  markets: [
    { id: 1, conditionId: "0xd4e77ba6", question: "Will no Fed rate cuts happen in 2026?", groupItemTitle: "0 (0 bps)", outcomes: '["Yes", "No"]', outcomePrices: '["0.9585", "0.0415"]', bestBid: 0.958, bestAsk: 0.959, volume: 8799059.74 },
    { id: 2, conditionId: "0x5e082f0b", question: "Will 1 Fed rate cut happen in 2026?", groupItemTitle: "1 (25 bps)", outcomes: '["Yes", "No"]', outcomePrices: '["0.0175", "0.9825"]', bestBid: 0.017, bestAsk: 0.018, volume: 3464512.63 },
    { id: 3, conditionId: "0xffa0accb", question: "Will 12 or more Fed rate cuts happen in 2026?", groupItemTitle: "12+ (300+ bps)", outcomes: '["Yes", "No"]', outcomePrices: '["0.0005", "0.9995"]', bestAsk: 0.001, volume: 3981255.53 },
  ],
};

const BTC_OCT: GammaEvent = {
  id: 1112205,
  slug: "what-price-will-bitcoin-hit-in-october-2026",
  title: "What price will Bitcoin hit in October?",
  endDate: "2026-11-01T04:00:00Z",
  volume: 2958260.15,
  liquidity: 1728708.38,
  markets: [
    { id: 5170727, question: "Will Bitcoin reach $150,000 in October?", groupItemTitle: "↑ 150,000", outcomes: '["Yes", "No"]', outcomePrices: '["0.0045", "0.9955"]', bestBid: 0.004, bestAsk: 0.005, volume: 247293.5, closed: false },
    { id: 5170734, question: "Will Bitcoin reach $90,000 in October?", groupItemTitle: "↑ 90,000", outcomes: '["Yes", "No"]', outcomePrices: '["0.555", "0.445"]', bestBid: 0.55, bestAsk: 0.56, volume: 76845.61, closed: false },
    { id: 5170736, question: "Will Bitcoin reach $85,000 in October?", groupItemTitle: "↑ 85,000", outcomes: '["Yes", "No"]', outcomePrices: '["1", "0"]', bestBid: 0.999, bestAsk: 1, volume: 59941.98, closed: true },
    { id: 5239979, question: "Will Bitcoin reach $85,000 in October?", groupItemTitle: "↑ 85,000", outcomes: '["Yes", "No"]', outcomePrices: '["1", "0"]', bestBid: 0.999, bestAsk: 1, volume: 23737.82, closed: true },
    { id: 5170738, question: "Will Bitcoin dip to $80,000 in October?", groupItemTitle: "↓ 80,000", outcomes: '["Yes", "No"]', outcomePrices: '["0.425", "0.575"]', bestBid: 0.42, bestAsk: 0.43, volume: 77745.37, closed: false },
    { id: 5288011, question: "Will Bitcoin dip to $85,000 in October?", groupItemTitle: "↓ 85,000", outcomes: '["Yes", "No"]', outcomePrices: '["1", "0"]', bestBid: 0.999, bestAsk: 1, volume: 49601.95, closed: true },
    { id: 5378936, question: "Will Bitcoin dip to $85,000 in October?", groupItemTitle: "↓ 85,000", outcomes: '["Yes", "No"]', outcomePrices: '["0.97", "0.03"]', bestBid: 0.96, bestAsk: 0.98, volume: 172.81, closed: false },
  ],
};

const BTC_ABOVE: GammaEvent = {
  slug: "bitcoin-above-on-october-7-2026",
  title: "Bitcoin above ___ on October 7?",
  endDate: "2026-10-07T16:00:00Z",
  volume: 441155.22,
  liquidity: 653942.88,
  markets: [
    { id: 5156700, question: "Will the price of Bitcoin be above $86,000 on October 7?", groupItemTitle: "86,000", outcomes: '["Yes", "No"]', outcomePrices: '["0.325", "0.675"]', bestBid: 0.32, bestAsk: 0.33, volume: 14514.12 },
    { id: 5156698, question: "Will the price of Bitcoin be above $84,000 on October 7?", groupItemTitle: "84,000", outcomes: '["Yes", "No"]', outcomePrices: '["0.9205", "0.0795"]', bestBid: 0.92, bestAsk: 0.921, volume: 35281.64 },
    { id: 5156709, question: "Will the price of Bitcoin be above $94,000 on October 7?", groupItemTitle: "94,000", outcomes: '["Yes", "No"]', outcomePrices: '["0.0005", "0.9995"]', bestAsk: 0.001, volume: 28742.56 },
  ],
};

const CPI_MOM: GammaEvent = {
  slug: "core-cpi-mom-september-2026",
  title: "Core CPI MoM - September 2026",
  endDate: "2026-10-15T03:59:00Z",
  volume: 21586.57,
  liquidity: 6543.34,
  markets: [
    { id: 4469520, conditionId: "0xa662cf5a", question: "Will Core CPI MoM be 0.0% or less in September?", groupItemTitle: "≤0.0%", outcomes: '["Yes", "No"]', outcomePrices: '["0.0695", "0.9305"]', bestBid: 0.014, bestAsk: 0.125, volume: 1285.19 },
    { id: 4469522, conditionId: "0xddf5a3cc", question: "Will Core CPI MoM be 0.2% in September?", groupItemTitle: "0.2%", outcomes: '["Yes", "No"]', outcomePrices: '["0.365", "0.635"]', bestBid: 0.36, bestAsk: 0.37, volume: 8567.78 },
    { id: 4469526, conditionId: "0x69d8d35d", question: "Will Core CPI MoM be 0.6% or more in September?", groupItemTitle: "0.6%+", outcomes: '["Yes", "No"]', outcomePrices: '["0.0025", "0.9975"]', bestBid: 0.001, bestAsk: 0.004, volume: 815.99 },
  ],
};

const NFP_OCT: GammaEvent = {
  slug: "how-many-jobs-added-in-october-2026",
  title: "How many jobs added in October?",
  endDate: "2026-11-07T04:59:00Z",
  volume: 10016.61,
  markets: [
    { id: 5211624, question: "Will the US lose more than 25k jobs in October?", groupItemTitle: "<-25k", outcomes: '["Yes", "No"]', outcomePrices: '["0.0945", "0.9055"]', bestBid: 0.01, bestAsk: 0.179, volume: 469.38 },
    { id: 5211625, question: "Will the US lose between 0 and 25k jobs in October?", groupItemTitle: "-25k to 0", outcomes: '["Yes", "No"]', outcomePrices: '["0.13", "0.87"]', bestBid: 0.12, bestAsk: 0.14, volume: 1826.57 },
    { id: 5211630, question: "Will the US add at least 100k jobs in October?", groupItemTitle: "100k+", outcomes: '["Yes", "No"]', outcomePrices: '["0.305", "0.695"]', bestBid: 0.26, bestAsk: 0.35, volume: 4343.7 },
  ],
};

const RECESSION: GammaEvent = {
  id: 48802,
  slug: "us-recession-by-end-of-2026",
  title: "US recession by end of 2026?",
  endDate: "2026-12-31T00:00:00Z",
  volume: 2271548.45,
  liquidity: 82724.25,
  markets: [{ id: 609655, conditionId: "0xfdc73f10", question: "US recession by end of 2026?", groupItemTitle: "", outcomes: '["Yes", "No"]', outcomePrices: '["0.065", "0.935"]', bestBid: 0.06, bestAsk: 0.07, volume: 2271548.45 }],
};

const WTI_OCT: GammaEvent = {
  slug: "what-price-will-wti-hit-in-october-2026",
  title: "What will WTI Crude Oil (WTI) hit in October 2026?",
  endDate: "2026-11-01T03:59:59.999Z",
  volume: 964417.94,
  markets: [
    { id: 4936103, question: "Will WTI Crude Oil (WTI) hit (HIGH) $100 in October?", groupItemTitle: "↑ $100", outcomes: '["Yes", "No"]', outcomePrices: '["0.295", "0.705"]', bestBid: 0.29, bestAsk: 0.3, volume: 102160.81 },
    { id: 4936106, question: "Will WTI Crude Oil (WTI) hit (LOW) $70 in October?", groupItemTitle: "↓ $70", outcomes: '["Yes", "No"]', outcomePrices: '["0.08", "0.92"]', bestBid: 0.07, bestAsk: 0.09, volume: 26961.69 },
  ],
};

const AT = "2026-10-06T12:00:00.000Z";

describe("parseJsonArray / yesProbability", () => {
  it("parses JSON-encoded string arrays and real arrays", () => {
    expect(parseJsonArray('["Yes", "No"]')).toEqual(["Yes", "No"]);
    expect(parseJsonArray(["Yes", "No"])).toEqual(["Yes", "No"]);
    expect(parseJsonArray("not json")).toEqual([]);
    expect(parseJsonArray(undefined)).toEqual([]);
  });

  it("uses bid/ask mid when both exist, else the Yes outcomePrice", () => {
    expect(yesProbability({ outcomes: '["Yes","No"]', outcomePrices: '["0.825","0.175"]', bestBid: 0.82, bestAsk: 0.83 })).toBe(0.825);
    expect(yesProbability({ outcomes: '["Yes","No"]', outcomePrices: '["0.0005","0.9995"]', bestAsk: 0.001 })).toBe(0.0005);
    expect(yesProbability({ outcomes: '["No","Yes"]', outcomePrices: '["0.3","0.7"]' })).toBe(0.7);
    expect(yesProbability({ outcomes: '["Yes","No"]' })).toBeNull();
  });
});

describe("parseStrike / parseStrikeSide", () => {
  it("parses dollar, k-suffix, and comma formats", () => {
    expect(parseStrike("$150,000")).toBe(150000);
    expect(parseStrike("150k")).toBe(150000);
    expect(parseStrike("$150k")).toBe(150000);
    expect(parseStrike("$4,000")).toBe(4000);
    expect(parseStrike("$70")).toBe(70);
    expect(parseStrike("↑ 92,500")).toBe(92500);
    expect(parseStrike("↓ $3,500")).toBe(3500);
    expect(parseStrike("Will the price of Bitcoin be above $74,000 on October 7?")).toBe(74000);
  });

  it("ignores dates and bare small numbers", () => {
    expect(parseStrike("by December 31, 2026")).toBeNull();
    expect(parseStrike("October 7")).toBeNull();
    expect(parseStrike("")).toBeNull();
  });

  it("detects direction", () => {
    expect(parseStrikeSide("Will Bitcoin reach $150,000 in October?")).toBe("above");
    expect(parseStrikeSide("Will Bitcoin dip to $80,000 in October?")).toBe("below");
    expect(parseStrikeSide("Will Gold (GC) hit (LOW) $3,500 by end of December?")).toBe("below");
    expect(parseStrikeSide("Will WTI Crude Oil (WTI) hit (HIGH) $100 in October?")).toBe("above");
    expect(parseStrikeSide("↓ $70")).toBe("below");
    expect(parseStrikeSide("86,000")).toBeNull();
  });
});

describe("fed buckets", () => {
  it("labels FOMC meeting buckets with signed bps", () => {
    expect(fedBucket("25 bps decrease")).toEqual({ label: "Cut 25bps", value: -25 });
    expect(fedBucket("50+ bps decrease")).toEqual({ label: "Cut 50+bps", value: -50 });
    expect(fedBucket("No change")).toEqual({ label: "Hold", value: 0 });
    expect(fedBucket("25 bps increase")).toEqual({ label: "Hike 25bps", value: 25 });
    expect(fedBucket("50+ bps increase")).toEqual({ label: "Hike 50+bps", value: 50 });
    expect(fedBucket("", "Will there be no change in Fed interest rates after the October 2026 meeting?")).toEqual({ label: "Hold", value: 0 });
  });

  it("labels yearly cut-count buckets", () => {
    expect(fedCutsBucket("0 (0 bps)")).toEqual({ label: "0 cuts", value: 0 });
    expect(fedCutsBucket("1 (25 bps)")).toEqual({ label: "1 cut", value: 25 });
    expect(fedCutsBucket("12+ (300+ bps)")).toEqual({ label: "12+ cuts", value: 300 });
  });

  it("labels rate-level buckets in bps", () => {
    expect(fedLevelBucket("↑ 5.0%")).toEqual({ label: "≥ 5.00%", value: 500 });
    expect(fedLevelBucket("↓ 2.0%")).toEqual({ label: "≤ 2.00%", value: 200 });
    expect(fedLevelBucket("≥ 4.5%")).toEqual({ label: "≥ 4.50%", value: 450 });
    expect(fedLevelBucket("4.25%")).toEqual({ label: "4.25%", value: 425 });
    expect(fedLevelBucket("≤1.0%")).toEqual({ label: "≤ 1.00%", value: 100 });
  });
});

describe("macro bucket parsing", () => {
  it("parses percents and jobs buckets", () => {
    expect(parsePercent("≤0.0%")).toBe(0);
    expect(parsePercent("0.6%+")).toBe(0.6);
    expect(parsePercent("≥4.6%")).toBe(4.6);
    expect(parseJobsBucket("<-25k")).toBe(-25000);
    expect(parseJobsBucket("-25k to 0")).toBe(-25000);
    expect(parseJobsBucket("0 to 25k")).toBe(0);
    expect(parseJobsBucket("100k+")).toBe(100000);
  });

  it("derives periods", () => {
    expect(periodFromEndDate("2026-10-29T03:59:00Z")).toBe("2026-10-28");
    expect(periodFromEndDate("2026-12-10T04:59:00Z")).toBe("2026-12-09");
    expect(periodFromEndDate("2026-11-01T04:00:00Z")).toBe("2026-10-31");
    expect(periodFromEndDate("2027-01-01T05:00:00Z")).toBe("2026-12-31");
    expect(periodFromEndDate("2026-12-31T00:00:00Z")).toBe("2026-12-31");
    expect(periodFromEndDate("2026-10-07T16:00:00Z")).toBe("2026-10-07");
    expect(periodFromEndDate("2026-11-06T13:30:00Z")).toBe("2026-11-06");
    expect(periodFromEndDate(null)).toBeNull();
    expect(parseMonthPeriod("Core CPI MoM - September 2026")).toBe("2026-09");
    expect(parseMonthPeriod("September Inflation US - Annual", "2026-10-15T03:59:00Z")).toBe("2026-09");
    expect(parseMonthPeriod("December Unemployment Rate", "2027-01-09T13:30:00Z")).toBe("2026-12");
    expect(parseMonthPeriod("nothing here")).toBeNull();
  });
});

describe("classifyEvent", () => {
  it("maps slugs/titles to topics", () => {
    expect(classifyEvent("fed-decision-in-october-20260617190323537", "Fed Decision in October?")).toBe("fed_decision");
    expect(classifyEvent("how-many-fed-rate-cuts-in-2026", "How many Fed rate cuts in 2026?")).toBe("fed_cuts_year");
    expect(classifyEvent("what-will-fed-rate-hit-before-2027", "What will Fed Rate hit before 2027?")).toBe("fed_rate_level");
    expect(classifyEvent("what-will-the-fed-rate-be-at-the-end-of-2026", "What will the Fed rate be at the end of 2026?")).toBe("fed_rate_level");
    expect(classifyEvent("us-recession-by-end-of-2026", "US recession by end of 2026?")).toBe("recession");
    expect(classifyEvent("core-cpi-mom-september-2026", "Core CPI MoM - September 2026")).toBe("cpi");
    expect(classifyEvent("september-inflation-us-annual", "September Inflation US - Annual")).toBe("cpi");
    expect(classifyEvent("how-many-jobs-added-in-october-2026", "How many jobs added in October?")).toBe("nfp");
    expect(classifyEvent("october-unemployment-rate-2026", "October Unemployment Rate")).toBe("unemployment");
    expect(classifyEvent("what-price-will-bitcoin-hit-in-october-2026", "What price will Bitcoin hit in October?")).toBe("btc_price");
    expect(classifyEvent("bitcoin-above-on-october-7-2026", "Bitcoin above ___ on October 7?")).toBe("btc_price");
    expect(classifyEvent("ethereum-above-on-october-7-2026", "Ethereum above ___ on October 7?")).toBe("eth_price");
    expect(classifyEvent("what-will-gold-gc-hit-by-end-of-december", "What will Gold (GC) hit__ by end of December?")).toBe("gold_price");
    expect(classifyEvent("what-price-will-xauusd-hit-in-october-2026", "What will Gold (XAUUSD) hit in October 2026?")).toBe("gold_price");
    expect(classifyEvent("what-price-will-wti-hit-in-october-2026", "What will WTI Crude Oil (WTI) hit in October 2026?")).toBe("oil_price");
    expect(classifyEvent("wti-closes-above-on-october-6-2026", "WTI Crude Oil (WTI) closes above ___ on October 6?")).toBe("oil_price");
  });

  it("rejects non-US macro and non-price crypto/commodity events", () => {
    expect(classifyEvent("japan-core-cpi-yoy-in-2026", "Japan Core CPI YoY in 2026")).toBeNull();
    expect(classifyEvent("uk-recession-in-2026", "UK Recession in 2026?")).toBeNull();
    expect(classifyEvent("bitcoin-up-or-down-on-october-5-2026", "Bitcoin Up or Down on October 5?")).toBeNull();
    expect(classifyEvent("bitcoin-all-time-high-by", "Bitcoin all time high by ___?")).toBeNull();
    expect(classifyEvent("bitcoin-vs-gold-vs-sp-500-in-2026", "Bitcoin vs. Gold vs. S&P 500 in 2026")).toBeNull();
    expect(classifyEvent("what-price-will-ethbtc-hit-october-5-11-2026", "What price will ETH/BTC hit October 5-11?")).toBeNull();
    expect(classifyEvent("robinhood-gold-subscribers-above-in-q1", "Robinhood Gold Subscribers above __ in Q1?")).toBeNull();
    expect(classifyEvent("opec-crude-oil-production-above-in-may", "OPEC Crude Oil production above __ in May?")).toBeNull();
    expect(classifyEvent("what-price-will-solana-hit-before-2027", "What price will Solana hit in 2026?")).toBeNull();
    expect(detectPriceTopic("What will Silver (XAGUSD) hit in October 2026?")).toBeNull();
  });
});

describe("normalizeEvent", () => {
  it("groups FOMC sub-markets into one market with signed-bps outcomes", () => {
    const m = normalizeEvent(FED_OCT, AT)!;
    expect(m.venue).toBe("polymarket");
    expect(m.topic).toBe("fed_decision");
    expect(m.id).toBe("fed-decision-in-october-20260617190323537");
    expect(m.url).toBe("https://polymarket.com/event/fed-decision-in-october-20260617190323537");
    expect(m.eventDefId).toBe("fed_funds");
    expect(m.period).toBe("2026-10-28");
    expect(m.volume).toBeCloseTo(27212841.06, 1);
    expect(m.liquidity).toBeCloseTo(2888903.02, 1);
    expect(m.outcomes.map((o) => o.label)).toEqual(["Cut 50+bps", "Cut 25bps", "Hold", "Hike 25bps", "Hike 50+bps"]);
    expect(m.outcomes.map((o) => o.value)).toEqual([-50, -25, 0, 25, 50]);
    const hold = m.outcomes.find((o) => o.label === "Hold")!;
    expect(hold.prob).toBe(0.825);
    expect(hold.marketId).toBe("0xdf9bf27e");
  });

  it("normalizes yearly cut counts (string volume) with YYYY-MM period", () => {
    const m = normalizeEvent(FED_CUTS, AT)!;
    expect(m.topic).toBe("fed_cuts_year");
    expect(m.period).toBe("2026-12");
    expect(m.volume).toBeCloseTo(53900685.75, 1);
    expect(m.outcomes.map((o) => o.label)).toEqual(["0 cuts", "1 cut", "12+ cuts"]);
    expect(m.outcomes[0].prob).toBe(0.9585);
    expect(m.outcomes[2].prob).toBe(0.0005);
  });

  it("builds a BTC hit ladder, drops closed/duplicate buckets, sorts by strike", () => {
    const m = normalizeEvent(BTC_OCT, AT)!;
    expect(m.topic).toBe("btc_price");
    expect(m.asset).toBe("BTC");
    expect(m.strike).toBeNull();
    expect(m.strikeSide).toBeNull(); // mixed hit/dip
    expect(m.period).toBe("2026-10-31");
    expect(m.outcomes.map((o) => [o.label, o.value])).toEqual([
      ["Dip to $80,000", 80000],
      ["Dip to $85,000", 85000],
      ["Hit $90,000", 90000],
      ["Hit $150,000", 150000],
    ]);
    expect(m.outcomes[1].prob).toBe(0.97);
  });

  it("builds an above-on-date multi-strike with strikeSide above", () => {
    const m = normalizeEvent(BTC_ABOVE, AT)!;
    expect(m.strikeSide).toBe("above");
    expect(m.period).toBe("2026-10-07");
    expect(m.outcomes.map((o) => o.value)).toEqual([84000, 86000, 94000]);
    expect(m.outcomes.map((o) => o.label)).toEqual(["Above $84,000", "Above $86,000", "Above $94,000"]);
    expect(m.outcomes[2].prob).toBe(0.0005);
  });

  it("normalizes CPI, NFP, and recession events", () => {
    const cpi = normalizeEvent(CPI_MOM, AT)!;
    expect(cpi.eventDefId).toBe("cpi_mom");
    expect(cpi.period).toBe("2026-09");
    expect(cpi.outcomes.map((o) => [o.label, o.value])).toEqual([["≤0.0%", 0], ["0.2%", 0.2], ["0.6%+", 0.6]]);

    const nfp = normalizeEvent(NFP_OCT, AT)!;
    expect(nfp.eventDefId).toBe("nfp");
    expect(nfp.period).toBe("2026-10");
    expect(nfp.outcomes.map((o) => o.value)).toEqual([-25000, -25000, 100000]);

    const rec = normalizeEvent(RECESSION, AT)!;
    expect(rec.topic).toBe("recession");
    expect(rec.outcomes).toHaveLength(2);
    expect(rec.outcomes[0]).toMatchObject({ label: "Yes", prob: 0.065 });
    expect(rec.outcomes[1]).toMatchObject({ label: "No", prob: 0.935 });
    expect(rec.period).toBe("2026-12-31");
  });

  it("maps WTI to asset WTI with hit/dip labels", () => {
    const m = normalizeEvent(WTI_OCT, AT)!;
    expect(m.topic).toBe("oil_price");
    expect(m.asset).toBe("WTI");
    expect(m.outcomes.map((o) => o.label)).toEqual(["Dip to $70", "Hit $100"]);
  });

  it("returns null for unclassified events or ones with no open priced markets", () => {
    expect(normalizeEvent({ slug: "bitcoin-up-or-down-on-october-5-2026", title: "Bitcoin Up or Down on October 5?", markets: [] }, AT)).toBeNull();
    expect(normalizeEvent({ ...FED_OCT, markets: FED_OCT.markets!.map((x) => ({ ...x, closed: true })) }, AT)).toBeNull();
    expect(openMarkets({ markets: [{ outcomes: '["Yes","No"]' }] })).toEqual([]);
  });
});

describe("selectMarkets", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  const mk = (over: Partial<ReturnType<typeof normalizeEvent>> & { id: string }) => ({ ...normalizeEvent(BTC_ABOVE, AT)!, ...over });

  it("keeps the next two FOMC meetings in date order", () => {
    const dec = normalizeEvent({ ...FED_OCT, slug: "fed-decision-in-december-x", title: "Fed Decision in December?", endDate: "2026-12-10T04:59:00Z" }, AT)!;
    const jan = normalizeEvent({ ...FED_OCT, slug: "fed-decision-in-january-x", title: "Fed Decision in January?", endDate: "2027-01-28T04:59:00Z" }, AT)!;
    const oct = normalizeEvent(FED_OCT, AT)!;
    const out = selectMarkets([jan, dec, oct], now);
    expect(out.map((m) => m.id)).toEqual([oct.id, dec.id]);
  });

  it("drops expired and far-dated markets, caps per topic by volume", () => {
    const expired = mk({ id: "old", closeTime: "2026-10-01T16:00:00Z" });
    const far = mk({ id: "far", closeTime: "2026-12-20T16:00:00Z" }); // not a hit ladder -> 45-day window
    const items = Array.from({ length: 8 }, (_, i) => mk({ id: `b${i}`, volume: i }));
    const out = selectMarkets([expired, far, ...items], now);
    expect(out.map((m) => m.id)).toEqual(["b7", "b6", "b5", "b4", "b3", "b2"]);
  });

  it("lets hit ladders run to year end and dedupes by id", () => {
    const yearLadder = normalizeEvent({ ...BTC_OCT, slug: "what-price-will-bitcoin-hit-before-2027", title: "What price will Bitcoin hit in 2026?", endDate: "2027-01-01T05:00:00Z" }, AT)!;
    const out = selectMarkets([yearLadder, yearLadder], now);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("what-price-will-bitcoin-hit-before-2027");
  });
});
