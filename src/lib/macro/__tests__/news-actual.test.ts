import { describe, expect, it } from "vitest";
import { parseApiCrudeHeadline } from "../news-actual";

describe("API crude headline parser", () => {
  it("reads draws as negative and builds as positive, in million barrels", () => {
    expect(parseApiCrudeHeadline("API: US crude inventories fell 3.2 million barrels last week")).toBe(-3.2);
    expect(parseApiCrudeHeadline("Oil prices rise after API reports crude stocks drew down by 2.5M barrels")).toBe(-2.5);
    expect(parseApiCrudeHeadline("API data shows U.S. crude oil inventories rose 1.1 million barrels")).toBe(1.1);
    expect(parseApiCrudeHeadline("Crude stockpiles climb 4.6 mln bbl: API", "The American Petroleum Institute said crude inventories increased 4.6 million barrels")).toBe(4.6);
  });
  it("ignores unrelated or ambiguous headlines", () => {
    expect(parseApiCrudeHeadline("EIA: crude inventories fell 2.1 million barrels")).toBeNull();
    expect(parseApiCrudeHeadline("Oil steady ahead of API inventory report")).toBeNull();
    expect(parseApiCrudeHeadline("API: crude stocks fell 120 million barrels")).toBeNull();
  });
});
