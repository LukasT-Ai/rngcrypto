import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_TUNING, DEFAULT_WEIGHTS, ENGINE_VERSION, ENGINE_VERSION_BASE, getWeights, resetWeights, setTuning, setWeights, shortHash } from "../engine";

// The literal that lived inside computeMultiFactorCall before DEFAULT_WEIGHTS existed (2026-10-13).
const PREVIOUS_LITERAL = {
  marketStructure: 0.13,
  momentum: 0.11,
  volume: 0.1,
  derivatives: 0.08,
  htf: 0.08,
  bollinger: 0.07,
  divergences: 0.07,
  sentiment: 0.03,
  marketData: 0.05,
  patterns: 0.05,
  etf: 0.05,
  catalyst: 0.02,
  liquidation: 0.05,
  elliott: 0.08,
  taSystem: 0.09,
  regime: 0.05,
  macro: 0,
  event: 0,
  confirmation: 0,
};

describe("factor weights", () => {
  afterEach(() => {
    resetWeights();
    setTuning(DEFAULT_TUNING);
  });

  it("defaults to exactly the previous weight literal", () => {
    expect({ ...DEFAULT_WEIGHTS }).toEqual(PREVIOUS_LITERAL);
    expect(getWeights()).toEqual(PREVIOUS_LITERAL);
    expect(Object.keys(getWeights())).toEqual(Object.keys(PREVIOUS_LITERAL));
  });

  it("applies overrides, ignores unknown or invalid keys, and keeps regime on the tuning knob", () => {
    const w = setWeights({ momentum: 0.2, bogus: 1, volume: -1 } as Partial<typeof DEFAULT_WEIGHTS>);
    expect(w.momentum).toBe(0.2);
    expect(w.volume).toBe(0.1);
    expect("bogus" in w).toBe(false);
    setTuning({ regimeWeight: 0.1 });
    expect(getWeights().regime).toBe(0.1);
    resetWeights();
    expect(getWeights().momentum).toBe(0.11);
  });

  it("stamps the engine version with the tuning hash", () => {
    expect(ENGINE_VERSION).toBe(`${ENGINE_VERSION_BASE}-${shortHash(JSON.stringify(DEFAULT_TUNING))}`);
    expect(ENGINE_VERSION).toMatch(/^2026\.10\.13-wave2-[0-9a-f]{6}$/);
  });
});
