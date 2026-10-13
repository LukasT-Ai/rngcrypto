import { describe, expect, it } from "vitest";
import { computeSurprise } from "../surprise";
import { EVENT_DEFS } from "../taxonomy";
import { fedExpectationFor, fedPriorFor, marketExpectationFor, marketPriorFor, printResolution } from "../market-prior";
import { assetScores, GOLD_ASYMMETRY, impactForSurprise } from "../impact";
import type { MacroRegime } from "../types";
import type { PredictionState } from "../../prediction/service";
import type { PMMarket } from "../../prediction/types";

const def = (id: string) => EVENT_DEFS.find((d) => d.id === id)!;
const NOW = Date.parse("2026-10-13T12:00:00Z");
// Inside 14 days of the Oct 28 FOMC, so meeting odds are not shrunk.
const NEAR = Date.parse("2026-10-20T12:00:00Z");

describe("computeSurprise anchor selection", () => {
  it("uses the consensus when no market prior exists", () => {
    const s = computeSurprise(def("cpi_mom"), 0.4, 0.3, 0.2);
    expect(s.zAnchor).toBe("consensus");
    expect(s.anchor).toBe(0.3);
    expect(s.sdSource).toBe("prior");
    expect(s.zScore).toBeCloseTo(1, 2);
    expect(s.label).toContain("vs consensus");
  });
  it("blends a liquid market mean 0.6/0.4 with the consensus and takes the market SD", () => {
    const s = computeSurprise(def("cpi_mom"), 0.4, 0.3, 0.2, null, { mean: 0.35, sd: 0.08 });
    expect(s.zAnchor).toBe("blended");
    expect(s.anchor).toBeCloseTo(0.33, 4);
    expect(s.sdSource).toBe("market");
    expect(s.zScore).toBeCloseTo(0.07 / 0.08, 1);
    expect(s.label).toContain("market-blended consensus");
  });
  it("anchors on the market alone when the calendar has no consensus", () => {
    const s = computeSurprise(def("cpi_mom"), 0.4, null, 0.2, null, { mean: 0.35, sd: null });
    expect(s.zAnchor).toBe("market");
    expect(s.anchor).toBe(0.35);
    expect(s.sdSource).toBe("prior");
    expect(s.label).toContain("market-implied mean");
  });
  it("falls back to the previous print with the wider band when nothing else exists", () => {
    const s = computeSurprise(def("cpi_mom"), 0.4, null, 0.2);
    expect(s.zAnchor).toBe("previous");
    expect(s.zScore).toBeCloseTo(0.2 / 0.15, 2);
  });
  it("prefers the rolling history SD over the prior but not over the market SD", () => {
    expect(computeSurprise(def("nfp"), 250, 150, 100, 110).sdSource).toBe("rolling");
    expect(computeSurprise(def("nfp"), 250, 150, 100, 110, { mean: 160, sd: 95 }).sdSource).toBe("market");
  });
  it("reports null anchors when no actual exists", () => {
    const s = computeSurprise(def("cpi_mom"), null, 0.3, 0.2, null, { mean: 0.35, sd: 0.08 });
    expect(s.zAnchor).toBeNull();
    expect(s.anchor).toBeNull();
  });
});

describe("refreshed surprise priors", () => {
  it("carries the research 2.4 priors", () => {
    expect(def("nfp").typicalSurpriseSD).toBe(90);
    expect(def("core_cpi_mom").typicalSurpriseSD).toBe(0.09);
    expect(def("ppi_mom").typicalSurpriseSD).toBe(0.25);
    expect(def("core_pce_mom").typicalSurpriseSD).toBe(0.07);
    expect(def("eia_crude").typicalSurpriseSD).toBe(3.0);
    expect(def("claims").typicalSurpriseSD).toBe(12);
    expect(def("unemployment").typicalSurpriseSD).toBe(0.1);
  });
});

const regime: MacroRegime = {
  inflationFocus: "normal",
  policyBias: "hold",
  risk: "neutral",
  confidence: "medium",
  summary: "",
  asOf: new Date(NOW).toISOString(),
  inputs: { us2y: null, us10y: null, us2yChg5d: null, dxy: null, dxyChg5d: null, vix: null, spxChg5d: null, cpiYoY: null },
};

describe("gold asymmetry", () => {
  it("scales gold-negative surprises by 1.3 and leaves gold-positive ones alone", () => {
    const hot = assetScores({ r: 0.5, g: 0, o: 0, channels: [], regimeNotes: [] }, regime);
    const cool = assetScores({ r: -0.5, g: 0, o: 0, channels: [], regimeNotes: [] }, regime);
    expect(hot.GOLD).toBe(Math.round(-0.45 * GOLD_ASYMMETRY * 100));
    expect(cool.GOLD).toBe(45);
    expect(Math.abs(hot.GOLD)).toBeGreaterThan(Math.abs(cool.GOLD));
  });
  it("shows up in the impact map for a hot CPI", () => {
    const hot = impactForSurprise(def("cpi_mom"), 55, "large", regime).find((i) => i.asset === "GOLD")!;
    const cool = impactForSurprise(def("cpi_mom"), -55, "large", regime).find((i) => i.asset === "GOLD")!;
    expect(hot.direction).toBe("bearish");
    expect(Math.abs(hot.score)).toBeGreaterThan(Math.abs(cool.score));
  });
});

function ladder(id: string, eventDefId: string, closeTime: string, volume: number, period: string): PMMarket {
  return {
    venue: "kalshi",
    id,
    topic: "cpi",
    title: id,
    url: "",
    closeTime,
    outcomes: [
      { label: ">0.1", prob: 0.97, value: 0.1 },
      { label: ">0.2", prob: 0.8, value: 0.2 },
      { label: ">0.3", prob: 0.4, value: 0.3 },
      { label: ">0.4", prob: 0.1, value: 0.4 },
    ],
    volume,
    liquidity: null,
    eventDefId,
    asset: null,
    strike: null,
    strikeSide: null,
    period,
    retrievedAt: new Date(NOW).toISOString(),
  };
}

function pred(markets: PMMarket[], fed: PredictionState["fed"] = []): PredictionState {
  const byEvent: Record<string, PMMarket[]> = {};
  for (const m of markets) if (m.eventDefId) byEvent[m.eventDefId] = [...(byEvent[m.eventDefId] ?? []), m];
  return {
    asOf: new Date(NOW).toISOString(),
    venues: [],
    fed,
    byEvent,
    byAsset: { BTC: { asset: "BTC", markets: [], summary: null }, GOLD: { asset: "GOLD", markets: [], summary: null }, WTI: { asset: "WTI", markets: [], summary: null } },
    recession: [],
    all: markets,
  };
}

describe("market prior selection", () => {
  const cpi = ladder("KXCPI-26SEP", "cpi_mom", "2026-10-14T12:25:00Z", 200_000, "2026-09");
  const event = { time: "2026-10-14T12:30:00Z", forecast: 0.3, previous: 0.2 };
  it("resolves the print step from the taxonomy", () => {
    expect(printResolution(def("cpi_mom"))).toBeCloseTo(0.1);
    expect(printResolution(def("nfp"))).toBe(0);
  });
  it("attaches a liquid CPI ladder to the CPI event and exposes mean, sd and skew", () => {
    const mx = marketExpectationFor(def("cpi_mom"), event, pred([cpi]), NOW)!;
    expect(mx.liquid).toBe(true);
    expect(mx.mean).toBeGreaterThan(0.25);
    expect(mx.sd).not.toBeNull();
    expect(mx.tailSkew).not.toBeNull();
    expect(marketPriorFor(def("cpi_mom"), event, pred([cpi]), NOW)).toEqual({ mean: mx.mean, sd: mx.sd });
  });
  it("does not let a thin ladder anchor the surprise", () => {
    const thin = ladder("KXCPI-26SEP", "cpi_mom", "2026-10-14T12:25:00Z", 20_000, "2026-09");
    expect(marketExpectationFor(def("cpi_mom"), event, pred([thin]), NOW)?.liquid).toBe(false);
    expect(marketPriorFor(def("cpi_mom"), event, pred([thin]), NOW)).toBeNull();
  });
  it("ignores alias markets (a headline CPI ladder does not anchor core CPI) and events without ladders", () => {
    expect(marketExpectationFor(def("core_cpi_mom"), event, pred([cpi]), NOW)).toBeNull();
    expect(marketExpectationFor(def("retail_mom"), event, pred([cpi]), NOW)).toBeNull();
    expect(marketExpectationFor(def("cpi_mom"), event, null, NOW)).toBeNull();
  });
  it("maps Fed meeting odds onto the decision and the statement by month, and prices the rate as a prior", () => {
    const fed: PredictionState["fed"] = [
      {
        period: "2026-10-28",
        buckets: [
          { bucket: "hike", label: "Hike", kalshi: 0.01, polymarket: null, blended: 0.01 },
          { bucket: "hold", label: "Hold", kalshi: 0.92, polymarket: null, blended: 0.92 },
          { bucket: "cut25", label: "Cut 25bp", kalshi: 0.06, polymarket: null, blended: 0.06 },
          { bucket: "cut50", label: "Cut 50bp+", kalshi: 0.01, polymarket: null, blended: 0.01 },
        ],
        cutProb: 0.07,
        hikeProb: 0.01,
        divergence: null,
        leaning: "hold",
        urls: {},
        volume: 1_000_000,
      },
    ];
    const p = pred([], fed);
    const fx = fedExpectationFor(def("fomc_statement"), { time: "2026-10-28T18:00:00Z" }, p, NEAR)!;
    expect(fx.modalLabel).toBe("Hold");
    expect(fx.expectedChangeBp).toBeCloseTo(-1.75, 0);
    expect(fedExpectationFor(def("fomc_statement"), { time: "2026-12-16T19:00:00Z" }, p, NEAR)).toBeNull();
    const prior = fedPriorFor(def("fed_funds"), { time: "2026-10-28T18:00:00Z", previous: 4.0 }, p, NEAR)!;
    expect(prior.mean).toBeCloseTo(3.983, 2);
    expect(prior.sd).toBeGreaterThan(0.05);
    // A hold when a hold is 92% priced is an inline surprise; a surprise cut is extreme.
    expect(computeSurprise(def("fed_funds"), 4.0, 4.0, 4.0, null, prior).magnitude).toBe("inline");
    const cut = computeSurprise(def("fed_funds"), 3.75, 4.0, 4.0, null, prior);
    expect(Math.abs(cut.zScore!)).toBeGreaterThan(2.5);
    expect(["large", "extreme"]).toContain(cut.magnitude);
  });
});
