import { describe, expect, it } from "vitest";
import {
  SERIES_SPECS,
  buildUrl,
  capPerTopic,
  eventDate,
  fedBucket,
  impliedProb,
  marketSide,
  marketThreshold,
  monthFromTicker,
  normalizeEvent,
  normalizeSeries,
  trimLadder,
  yearFromTicker,
  type KalshiRawEvent,
  type KalshiRawMarket,
  type SeriesSpec,
} from "../kalshi";
import type { PMMarket } from "../types";
import { BTCD_EVENTS, BTCMAXMON_EVENTS, FED_DECISION_EVENTS, WTIW_MARKETS } from "./kalshi.fixtures";

const spec = (series: string): SeriesSpec => {
  const s = SERIES_SPECS.find((x) => x.series === series);
  if (!s) throw new Error(`no spec for ${series}`);
  return s;
};
const NOW = new Date("2026-10-06T12:00:00Z");
const RETRIEVED = "2026-10-06T12:00:00.000Z";

describe("impliedProb", () => {
  it("uses mid of yes bid/ask when both are > 0 (dollar strings)", () => {
    const m: KalshiRawMarket = { ticker: "T", event_ticker: "E", yes_bid_dollars: "0.8200", yes_ask_dollars: "0.8300", last_price_dollars: "0.5000" };
    expect(impliedProb(m)).toBeCloseTo(0.825, 6);
  });
  it("falls back to last price when a side is zero", () => {
    const m: KalshiRawMarket = { ticker: "T", event_ticker: "E", yes_bid_dollars: "0.0000", yes_ask_dollars: "0.0100", last_price_dollars: "0.0100" };
    expect(impliedProb(m)).toBe(0.01);
  });
  it("accepts legacy integer cents fields", () => {
    const m: KalshiRawMarket = { ticker: "T", event_ticker: "E", yes_bid: 40, yes_ask: 44, last_price: 50 };
    expect(impliedProb(m)).toBeCloseTo(0.42, 6);
    expect(impliedProb({ ticker: "T", event_ticker: "E", yes_bid: 0, yes_ask: 3, last_price: 7 })).toBeCloseTo(0.07, 6);
  });
  it("clamps and defaults to 0 when nothing is present", () => {
    expect(impliedProb({ ticker: "T", event_ticker: "E" })).toBe(0);
    expect(impliedProb({ ticker: "T", event_ticker: "E", last_price_dollars: "1.2000" })).toBe(1);
  });
});

describe("ticker date helpers", () => {
  it("extracts YYYY-MM from monthly event tickers", () => {
    expect(monthFromTicker("KXCPI-26OCT")).toBe("2026-10");
    expect(monthFromTicker("KXCPI-26OCT-T0.3")).toBe("2026-10");
    expect(monthFromTicker("KXPAYROLLS-26NOV-T90000")).toBe("2026-11");
    expect(monthFromTicker("KXBTCD-26OCT0616")).toBe("2026-10");
    expect(monthFromTicker("KXRECSSNBER-27")).toBeNull();
  });
  it("extracts the year", () => {
    expect(yearFromTicker("KXRECSSNBER-27")).toBe("2027");
    expect(yearFromTicker("KXRATECUT-26DEC31")).toBe("2026");
  });
});

describe("strike helpers", () => {
  it("reads floor for greater, cap for less, floor for between", () => {
    const less = WTIW_MARKETS.find((m) => m.strike_type === "less")!;
    const greater = WTIW_MARKETS.find((m) => m.strike_type === "greater")!;
    const between = WTIW_MARKETS.find((m) => m.strike_type === "between")!;
    expect(marketThreshold(less)).toBe(79);
    expect(marketSide(less)).toBe("below");
    expect(marketThreshold(greater)).toBe(103.99);
    expect(marketSide(greater)).toBe("above");
    expect(marketThreshold(between)).toBe(between.floor_strike);
    expect(marketSide(between)).toBeNull();
  });
});

describe("fedBucket", () => {
  it("maps custom_strike Hike/Cut buckets to labels and signed bps", () => {
    const ms = FED_DECISION_EVENTS[0].markets!;
    const byTicker = Object.fromEntries(ms.map((m) => [m.ticker.split("-").pop()!, fedBucket(m)]));
    expect(byTicker.H0).toEqual({ label: "Hold", value: 0 });
    expect(byTicker.H25).toEqual({ label: "Hike 25bps", value: 25 });
    expect(byTicker.H26).toEqual({ label: "Hike 50bps+", value: 50 });
    expect(byTicker.C25).toEqual({ label: "Cut 25bps", value: -25 });
    expect(byTicker.C26).toEqual({ label: "Cut 50bps+", value: -50 });
  });
  it("falls back to the ticker suffix when custom_strike is missing", () => {
    expect(fedBucket({ ticker: "KXFEDDECISION-26OCT-C25", event_ticker: "KXFEDDECISION-26OCT" })).toEqual({ label: "Cut 25bps", value: -25 });
    expect(fedBucket({ ticker: "KXFEDDECISION-26OCT-X", event_ticker: "KXFEDDECISION-26OCT" })).toBeNull();
  });
});

describe("eventDate", () => {
  it("prefers strike_date", () => {
    expect(eventDate(FED_DECISION_EVENTS[0])).toBe("2026-10-28T18:00:00.000Z");
  });
  it("ignores finalized markets when deriving from close_time", () => {
    // first market in the fixture is finalized with an early close_time; the open ones close Nov 1
    expect(eventDate(BTCMAXMON_EVENTS[0])).toBe("2026-11-01T03:59:59.000Z");
  });
});

describe("normalizeEvent: fed_decision", () => {
  it("groups one event_ticker into a single PMMarket with ordered buckets", () => {
    const pm = normalizeEvent(spec("KXFEDDECISION"), FED_DECISION_EVENTS[0], RETRIEVED)!;
    expect(pm).toBeTruthy();
    expect(pm.venue).toBe("kalshi");
    expect(pm.topic).toBe("fed_decision");
    expect(pm.id).toBe("KXFEDDECISION-26OCT");
    expect(pm.eventDefId).toBe("fed_funds");
    expect(pm.asset).toBeNull();
    expect(pm.strike).toBeNull();
    expect(pm.period).toBe("2026-10-28");
    expect(pm.closeTime).toBe("2026-10-28T18:00:00.000Z");
    expect(pm.url).toBe("https://kalshi.com/markets/kxfeddecision/fed-meeting/kxfeddecision-26oct");
    expect(pm.outcomes.map((o) => o.label)).toEqual(["Hike 50bps+", "Hike 25bps", "Hold", "Cut 25bps", "Cut 50bps+"]);
    const hold = pm.outcomes.find((o) => o.label === "Hold")!;
    expect(hold.prob).toBeCloseTo(0.825, 6);
    expect(hold.value).toBe(0);
    expect(hold.marketId).toBe("KXFEDDECISION-26OCT-H0");
    // probabilities of mutually exclusive buckets roughly sum to 1
    const sum = pm.outcomes.reduce((a, o) => a + o.prob, 0);
    expect(sum).toBeGreaterThan(0.95);
    expect(sum).toBeLessThan(1.1);
    expect(pm.volume).toBeGreaterThan(1_000_000);
    expect(pm.liquidity).toBeGreaterThan(0);
    expect(pm.retrievedAt).toBe(RETRIEVED);
  });
});

describe("normalizeSeries: fed_decision keeps only the next 2 meetings", () => {
  it("selects by date and drops past events", () => {
    const list = normalizeSeries(spec("KXFEDDECISION"), FED_DECISION_EVENTS, NOW, RETRIEVED);
    expect(list.map((m) => m.id)).toEqual(["KXFEDDECISION-26OCT", "KXFEDDECISION-26DEC"]);
    const later = normalizeSeries(spec("KXFEDDECISION"), FED_DECISION_EVENTS, new Date("2026-11-15T00:00:00Z"), RETRIEVED);
    expect(later.map((m) => m.id)).toEqual(["KXFEDDECISION-26DEC", "KXFEDDECISION-27JAN"]);
  });
});

describe("normalizeEvent: BTC price ladder", () => {
  it("produces one PMMarket per event with per-strike outcomes and asset BTC", () => {
    const pm = normalizeEvent(spec("KXBTCD"), BTCD_EVENTS[0], RETRIEVED)!;
    expect(pm.topic).toBe("btc_price");
    expect(pm.asset).toBe("BTC");
    expect(pm.eventDefId).toBeNull();
    expect(pm.strike).toBeNull(); // multi-strike ladder: thresholds live in outcomes[].value
    expect(pm.period).toBe("2026-10-06");
    expect(pm.url).toBe("https://kalshi.com/markets/kxbtcd/bitcoin-price-abovebelow/kxbtcd-26oct0616");
    expect(pm.outcomes.length).toBeGreaterThan(2);
    expect(pm.outcomes.length).toBeLessThanOrEqual(15);
    // sorted ascending by strike, probabilities non-increasing for an "above" ladder
    const values = pm.outcomes.map((o) => o.value as number);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    for (let i = 1; i < pm.outcomes.length; i++) expect(pm.outcomes[i].prob).toBeLessThanOrEqual(pm.outcomes[i - 1].prob + 0.03);
    expect(pm.outcomes[0].label).toMatch(/or above$/);
    expect(pm.outcomes.every((o) => o.marketId?.startsWith("KXBTCD-26OCT0616-T"))).toBe(true);
  });
  it("sets strike/strikeSide for a single-threshold price market", () => {
    const ev: KalshiRawEvent = { ...BTCD_EVENTS[0], markets: [BTCD_EVENTS[0].markets![5]] };
    const pm = normalizeEvent(spec("KXBTCD"), ev, RETRIEVED)!;
    expect(pm.strike).toBe(ev.markets![0].floor_strike);
    expect(pm.strikeSide).toBe("above");
    expect(pm.outcomes.map((o) => o.label)).toEqual([`Yes (${ev.markets![0].yes_sub_title})`, "No"]);
    expect(pm.outcomes[0].prob + pm.outcomes[1].prob).toBeCloseTo(1, 6);
  });
  it("excludes finalized markets from outcomes", () => {
    const pm = normalizeEvent(spec("KXBTCMAXMON"), BTCMAXMON_EVENTS[0], RETRIEVED)!;
    expect(pm.outcomes.some((o) => o.marketId?.endsWith("-8500000"))).toBe(false);
    expect(pm.outcomes.length).toBe(7);
  });
});

describe("normalizeSeries: price horizon", () => {
  it("drops events closing beyond 45 days and keeps the in-horizon BTC monthly event", () => {
    const list = normalizeSeries(spec("KXBTCMAXMON"), BTCMAXMON_EVENTS, NOW, RETRIEVED);
    expect(list.map((m) => m.id)).toEqual(["KXBTCMAXMON-BTC-26OCT31"]);
    const far = normalizeSeries(spec("KXBTCMAXMON"), BTCMAXMON_EVENTS, new Date("2026-08-01T00:00:00Z"), RETRIEVED);
    expect(far).toEqual([]);
  });
});

describe("trimLadder / capPerTopic", () => {
  it("keeps short ladders intact and trims long ones to the informative middle", () => {
    const short = [{ label: "a", prob: 0.9 }, { label: "b", prob: 0.1 }];
    expect(trimLadder(short)).toEqual(short);
    const long = Array.from({ length: 40 }, (_, i) => ({ label: `s${i}`, prob: i < 10 ? 1 : i > 30 ? 0 : 1 - (i - 10) / 20, value: i }));
    const t = trimLadder(long, 10);
    expect(t.length).toBe(10);
    expect(t.every((o) => o.prob > 0.01 && o.prob < 0.99)).toBe(true);
  });
  it("caps price topics by volume but leaves macro topics alone", () => {
    const mk = (id: string, topic: PMMarket["topic"], volume: number): PMMarket => ({
      venue: "kalshi", id, topic, title: id, url: "", closeTime: null, outcomes: [], volume, liquidity: null,
      eventDefId: null, asset: null, strike: null, period: null, retrievedAt: RETRIEVED,
    });
    const input = [
      ...Array.from({ length: 8 }, (_, i) => mk(`b${i}`, "btc_price", i)),
      ...Array.from({ length: 8 }, (_, i) => mk(`c${i}`, "cpi", i)),
    ];
    const out = capPerTopic(input, 6);
    expect(out.filter((m) => m.topic === "btc_price").map((m) => m.id).sort()).toEqual(["b2", "b3", "b4", "b5", "b6", "b7"]);
    expect(out.filter((m) => m.topic === "cpi").length).toBe(8);
  });
});

describe("buildUrl", () => {
  it("follows kalshi.com/markets/<series>/<slug>/<event> lowercase pattern", () => {
    expect(buildUrl(spec("KXPAYROLLS"), "KXPAYROLLS-26OCT")).toBe("https://kalshi.com/markets/kxpayrolls/jobs-numbers/kxpayrolls-26oct");
  });
});
