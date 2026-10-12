import { beforeEach, describe, expect, it } from "vitest";
import { resetSetupTracker, stampActiveSetups } from "../setup-tracker";

const setup = (horizonLabel: string, bias: "LONG" | "SHORT", entry: number) => ({ horizonLabel, bias, entry });

describe("active setup age tracker", () => {
  beforeEach(() => resetSetupTracker());
  const sym = `T${Date.now()}`;

  it("keeps the original calledAt while the direction holds and the entry drifts", () => {
    const a = stampActiveSetups(sym, [setup("SWING", "SHORT", 90.5)], 1000);
    expect(a[0].calledAt).toBe(1000);
    expect(a[0].calledEntry).toBe(90.5);
    const b = stampActiveSetups(sym, [setup("SWING", "SHORT", 91.2)], 5000);
    expect(b[0].calledAt).toBe(1000);
    expect(b[0].calledEntry).toBe(90.5);
    expect(b[0].entry).toBe(91.2);
  });

  it("resets on a direction flip", () => {
    stampActiveSetups(sym, [setup("SWING", "SHORT", 90)], 1000);
    const b = stampActiveSetups(sym, [setup("SWING", "LONG", 90)], 5000);
    expect(b[0].calledAt).toBe(5000);
  });

  it("resets when the horizon drops out and comes back", () => {
    stampActiveSetups(sym, [setup("SWING", "SHORT", 90), setup("POSITION", "SHORT", 92)], 1000);
    const mid = stampActiveSetups(sym, [setup("POSITION", "SHORT", 92)], 5000);
    expect(mid).toHaveLength(1);
    expect(mid[0].calledAt).toBe(1000);
    const back = stampActiveSetups(sym, [setup("SWING", "SHORT", 90), setup("POSITION", "SHORT", 92)], 9000);
    expect(back.find((s) => s.horizonLabel === "SWING")?.calledAt).toBe(9000);
    expect(back.find((s) => s.horizonLabel === "POSITION")?.calledAt).toBe(1000);
  });

  it("tracks symbols independently", () => {
    stampActiveSetups(sym, [setup("SCALP", "LONG", 1)], 1000);
    const other = stampActiveSetups(`${sym}B`, [setup("SCALP", "LONG", 1)], 7000);
    expect(other[0].calledAt).toBe(7000);
    stampActiveSetups(`${sym}B`, [], 8000);
    expect(stampActiveSetups(sym, [setup("SCALP", "LONG", 1)], 9000)[0].calledAt).toBe(1000);
  });
});
