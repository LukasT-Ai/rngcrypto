// features.book: the resting-book imbalance and nearest walls already computed by orderflow.ts (findWalls), lifted
// into the features object so the FLOW block and the UI read one shape. Book imbalance is a wall locator, not a
// direction predictor at hour scale (research 1.5), so nothing here is weighted beyond what the engine does today.

import type { OrderBookSummary } from "../orderflow";
import type { BookFeature } from "./types";

export const BOOK_TTL = 45e3; // orderflow.ts TTL

export function buildBookFeature(book: OrderBookSummary | null | undefined, asOf = Date.now()): BookFeature | null {
  if (!book || book.depth.length === 0) return null;
  const d = book.depth[book.depth.length - 1];
  return {
    asOf,
    ttlMs: BOOK_TTL,
    imbalance: d.imbalance,
    band: d.band,
    bidWallPct: book.bidWalls[0]?.distancePct ?? null,
    askWallPct: book.askWalls[0]?.distancePct ?? null,
    venue: book.venue,
  };
}
