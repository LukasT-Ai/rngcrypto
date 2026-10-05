import { describe, expect, it } from "vitest";
import { evaluateConfirmation } from "../confirmation";
import { impactForSurprise, transmission } from "../impact";
import { classifyRegime } from "../regime";
import { EVENT_DEFS } from "../taxonomy";
import type { ReactionPoint, SnapshotKey } from "../types";

const def = EVENT_DEFS.find((d) => d.id === "cpi_mom")!;
const regime = classifyRegime({ us2y: 4.4, us10y: 4.3, us2yChg5d: 0, dxy: 102, dxyChg5d: 0, vix: 18, spxChg5d: 0.5, cpiYoY: 2.9 });
const trans = transmission(def, -85, regime);
const impacts = impactForSurprise(def, -85, "extreme", regime);

const point = (label: ReactionPoint["label"], c: Partial<Record<SnapshotKey, number | null>>): ReactionPoint => ({
  label,
  at: new Date().toISOString(),
  changesPct: { dxy: null, us2y: null, us10y: null, spx: null, ndx: null, vix: null, btc: null, gold: null, wti: null, ...c },
});

describe("market confirmation", () => {
  it("is awaiting with no samples", () => {
    expect(evaluateConfirmation(trans, impacts, []).status).toBe("awaiting");
  });
  it("confirms when rates, dollar and risk assets move as expected after cooler CPI", () => {
    const c = evaluateConfirmation(trans, impacts, [point("5m", { dxy: -0.4, us2y: -0.08, us10y: -0.05, spx: 0.6, ndx: 0.9, vix: -5, btc: 1.2, gold: 0.7, wti: 0.1 })]);
    expect(c.status).toBe("confirmed");
    expect(c.pct).toBeGreaterThanOrEqual(70);
    expect(c.perAsset.BTC.status).toBe("confirmed");
  });
  it("refuses to confirm when the dollar and 2Y go the wrong way even if BTC ticks up", () => {
    const c = evaluateConfirmation(trans, impacts, [point("5m", { dxy: 0.4, us2y: 0.09, us10y: 0.06, spx: -0.3, ndx: -0.5, vix: 4, btc: 0.4, gold: -0.4 })]);
    expect(["unconfirmed", "conflicted"]).toContain(c.status);
    expect(c.perAsset.BTC.status).not.toBe("confirmed");
    expect(c.summary).toMatch(/not confirmed|Mixed tape/);
  });
  it("flags a reversal when the 15m sample flips the 5m move", () => {
    const c = evaluateConfirmation(trans, impacts, [
      point("5m", { dxy: -0.3, us2y: -0.06, btc: 1.2, gold: 0.5 }),
      point("15m", { dxy: 0.2, us2y: 0.05, btc: -0.6, gold: -0.3 }),
    ]);
    expect(c.perAsset.BTC.status).toBe("reversing");
    expect(c.perAsset.BTC.note).toMatch(/reversed/i);
  });
  it("flags fading when the move shrinks below 40% of the 5m move", () => {
    const c = evaluateConfirmation(trans, impacts, [point("5m", { btc: 1.5, dxy: -0.3, us2y: -0.06 }), point("1h", { btc: 0.4, dxy: -0.2, us2y: -0.05 })]);
    expect(c.perAsset.BTC.status).toBe("fading");
  });
  it("does not penalise flat prices in the first minute", () => {
    const c = evaluateConfirmation(trans, impacts, [point("30s", { dxy: 0.02, us2y: 0.0, btc: 0.05 })]);
    expect(c.perAsset.BTC.status).toBe("awaiting");
  });
});
