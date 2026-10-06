import { describe, expect, it } from "vitest";
import { buildFedOdds, buildState, eventDefIdsFor, fedBucketFor } from "../service";
import type { PMAdapterResult, PMMarket } from "../types";

const now = "2026-10-06T15:00:00.000Z";
const mk = (p: Partial<PMMarket>): PMMarket => ({
  venue: "kalshi",
  id: "x",
  topic: "other",
  title: "t",
  url: "u",
  closeTime: null,
  outcomes: [],
  volume: null,
  liquidity: null,
  eventDefId: null,
  asset: null,
  strike: null,
  strikeSide: null,
  period: null,
  retrievedAt: now,
  ...p,
});

describe("fed bucket mapping", () => {
  it("maps venue labels to the four buckets", () => {
    expect(fedBucketFor("Hold")).toBe("hold");
    expect(fedBucketFor("No change")).toBe("hold");
    expect(fedBucketFor("25 bps decrease")).toBe("cut25");
    expect(fedBucketFor("Cut 50bps")).toBe("cut50");
    expect(fedBucketFor("50+ bps decrease")).toBe("cut50");
    expect(fedBucketFor("25+ bps increase")).toBe("hike");
    expect(fedBucketFor("Hike >25bps")).toBe("hike");
    expect(fedBucketFor("??", -75)).toBe("cut50");
    expect(fedBucketFor("??", 0)).toBe("hold");
  });
});

describe("fed odds blending", () => {
  it("aligns both venues on the same meeting and reports divergence", () => {
    const k = mk({ venue: "kalshi", topic: "fed_decision", period: "2026-10-28", eventDefId: "fed_funds", volume: 1000, url: "k", outcomes: [{ label: "Hold", prob: 0.9 }, { label: "Cut 25bps", prob: 0.08 }, { label: "Hike >25bps", prob: 0.02 }] });
    const p = mk({ venue: "polymarket", topic: "fed_decision", period: "2026-10", eventDefId: "fed_funds", volume: 5000, url: "p", outcomes: [{ label: "No change", prob: 0.94 }, { label: "25 bps decrease", prob: 0.05 }, { label: "50+ bps decrease", prob: 0.01 }] });
    const fed = buildFedOdds([k, p]);
    expect(fed).toHaveLength(1);
    expect(fed[0].period).toBe("2026-10-28");
    const hold = fed[0].buckets.find((b) => b.bucket === "hold")!;
    expect(hold.kalshi).toBe(0.9);
    expect(hold.polymarket).toBe(0.94);
    expect(hold.blended).toBe(0.92);
    expect(fed[0].leaning).toBe("hold");
    expect(fed[0].cutProb).toBeCloseTo(0.07, 2);
    expect(fed[0].divergence).toBeCloseTo(0.04, 2);
    expect(fed[0].urls.kalshi).toBe("k");
  });
});

describe("state assembly", () => {
  it("attaches fed odds to FOMC text events and builds asset ladders", () => {
    const res: PMAdapterResult[] = [
      { venue: "kalshi", ok: true, note: "", retrievedAt: now, markets: [mk({ topic: "fed_decision", period: "2026-10-28", eventDefId: "fed_funds", outcomes: [{ label: "Hold", prob: 0.9 }] })] },
      { venue: "polymarket", ok: true, note: "", retrievedAt: now, markets: [mk({ venue: "polymarket", topic: "btc_price", asset: "BTC", strike: 120000, strikeSide: "above", closeTime: "2026-10-31T00:00:00Z", volume: 100, outcomes: [{ label: "Yes", prob: 0.62 }, { label: "No", prob: 0.38 }] })] },
    ];
    const st = buildState(res);
    expect(eventDefIdsFor("fed_funds")).toContain("fomc_minutes");
    expect(st.byEvent.fomc_minutes).toHaveLength(1);
    expect(st.byAsset.BTC.markets).toHaveLength(1);
    expect(st.byAsset.BTC.summary).toContain("62% BTC above $120k");
    expect(st.byAsset.GOLD.summary).toBeNull();
    expect(st.venues.map((v) => v.count)).toEqual([1, 1]);
  });
});
