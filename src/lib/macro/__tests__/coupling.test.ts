import { describe, expect, it } from "vitest";
import { computeCoupling, COUPLING_MAX_MULT, COUPLING_MIN_MULT, couplingMult, type DailyClose } from "../coupling";

function series(n: number, f: (i: number) => number, weekdaysOnly = false): DailyClose[] {
  const out: DailyClose[] = [];
  let price = 100;
  const start = Date.UTC(2026, 7, 1);
  let i = 0;
  for (let d = 0; out.length < n; d++) {
    const day = new Date(start + d * 86400e3);
    const dow = day.getUTCDay();
    if (weekdaysOnly && (dow === 0 || dow === 6)) continue;
    price *= Math.exp(f(i++));
    out.push({ day: day.toISOString().slice(0, 10), close: price });
  }
  return out;
}

describe("couplingMult bounds", () => {
  it("clips the correlation into [0.3, 1]", () => {
    expect(couplingMult(0.88)).toBe(0.88);
    expect(couplingMult(1.4)).toBe(COUPLING_MAX_MULT);
    expect(couplingMult(0.1)).toBe(COUPLING_MIN_MULT);
    expect(couplingMult(-0.6)).toBe(COUPLING_MIN_MULT);
    expect(couplingMult(NaN)).toBe(COUPLING_MAX_MULT);
  });
});

describe("computeCoupling", () => {
  it("finds a correlation near 1 for a BTC series that tracks SPX, and the mult follows", () => {
    const r = (i: number) => Math.sin(i * 1.7) * 0.01;
    // SPX trades weekdays; BTC has every day. Weekend BTC returns must be dropped, not smeared into Monday.
    const spx = series(45, r, true);
    const byDay = new Map(spx.map((p) => [p.day, p.close]));
    const btc: DailyClose[] = [];
    let last = 100;
    for (let d = 0; d < 70; d++) {
      const day = new Date(Date.UTC(2026, 7, 1) + d * 86400e3).toISOString().slice(0, 10);
      const s = byDay.get(day);
      last = s != null ? s * 2 : last; // weekends flat: Monday's BTC return is then exactly SPX's Friday-to-Monday return
      btc.push({ day, close: last });
    }
    const c = computeCoupling(btc, spx)!;
    expect(c.n).toBe(30);
    expect(c.corr30d).toBeGreaterThan(0.95);
    expect(c.mult).toBeGreaterThan(0.95);
    expect(c.mult).toBeLessThanOrEqual(1);
  });
  it("floors the multiplier at 0.3 in a decoupled or inverse month", () => {
    const spx = series(45, (i) => Math.sin(i * 1.7) * 0.01, true);
    const btc = series(60, (i) => -Math.sin(i * 1.7) * 0.01, true);
    const c = computeCoupling(btc, spx)!;
    expect(c.corr30d).toBeLessThan(-0.9);
    expect(c.mult).toBe(COUPLING_MIN_MULT);
  });
  it("returns null without enough overlapping days or with a flat series", () => {
    expect(computeCoupling(series(10, () => 0.01), series(10, () => 0.01))).toBeNull();
    expect(computeCoupling(series(40, () => 0), series(40, (i) => Math.sin(i) * 0.01))).toBeNull();
  });
});
