// features.cvd: real cumulative volume delta from the OKX taker-volume feed at 5-minute resolution (100 buckets,
// about 8h), requested in USD (unit=2). Replaces the candle-colour "CVD" the volume factor used
// (audit 4.4). The quarter-hour boundary imbalance (research 1.4) comes from be-catalyst's store and is read here
// so the UI gets one object; it is null until that store has readings.

import { FeedCache, okxData, round, roundOrNull } from "./fetch";
import type { CvdFeature } from "./types";

export const CVD_TTL = 60e3;
const BUCKET_MS = 5 * 60e3;

export interface TakerBucket {
  ts: number;
  buy: number; // USD
  sell: number;
}

// OKX rows: [ts, sellVol, buyVol], NEWEST FIRST on the wire (verified 2026-10-13: index 1 is the sell side).
export function parseTakerBuckets(rows: string[][] | null): TakerBucket[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ ts: Number(r[0]), sell: parseFloat(r[1]), buy: parseFloat(r[2]) }))
    .filter((b) => Number.isFinite(b.ts) && Number.isFinite(b.buy) && Number.isFinite(b.sell))
    .sort((a, b) => a.ts - b.ts);
}

export interface QhReading {
  value: number;
  readings: number[];
  asOf: number;
}

export function buildCvdFeature(buckets: TakerBucket[], qh: QhReading | null, now = Date.now()): CvdFeature | null {
  if (buckets.length === 0) return null;
  // Only buckets that have closed: the newest bucket on the wire is the forming 5 minutes.
  const latestTs = buckets[buckets.length - 1].ts;
  const closed = latestTs + BUCKET_MS > now ? buckets.slice(0, -1) : buckets;
  if (closed.length === 0) return null;
  const delta = (b: TakerBucket) => b.buy - b.sell;
  const last = (n: number) => closed.slice(-n);
  const sum = (bs: TakerBucket[]) => bs.reduce((s, b) => s + delta(b), 0);
  const h4 = last(48);
  const h1 = last(12);
  const m15 = last(3);
  const buy1h = h1.reduce((s, b) => s + b.buy, 0);
  const sell1h = h1.reduce((s, b) => s + b.sell, 0);
  const buy15 = m15.reduce((s, b) => s + b.buy, 0);
  const sell15 = m15.reduce((s, b) => s + b.sell, 0);
  // 16 points at 15-minute steps, cumulative from the start of the 4h window.
  const series15m: number[] = [];
  let cum = 0;
  for (let i = 0; i < h4.length; i++) {
    cum += delta(h4[i]);
    if ((i + 1) % 3 === 0 || i === h4.length - 1) series15m.push(round(cum, 0));
  }
  return {
    asOf: Math.min(now, closed[closed.length - 1].ts + BUCKET_MS),
    ttlMs: CVD_TTL,
    cum4hUsd: round(sum(h4), 0),
    slope1hUsd: round(sum(h1), 0),
    takerRatio1h: sell1h > 0 ? round(buy1h / sell1h, 3) : null,
    takerImbalance15m: buy15 + sell15 > 0 ? round((buy15 - sell15) / (buy15 + sell15), 3) : null,
    series15m,
    qhImbalance: qh ? roundOrNull(qh.value, 3) : null,
    qhReadings: qh ? qh.readings.map((r) => round(r, 3)) : [],
  };
}

// ── Fetchers ────────────────────────────────────────────────────────────────

export interface CvdRaw {
  buckets: TakerBucket[];
}

const cache = new FeedCache<CvdRaw>(CVD_TTL);

export async function fetchCvdRaw(ccy: string | undefined): Promise<CvdRaw | null> {
  if (!ccy) return null;
  return cache.get(ccy, async () => {
    const rows = await okxData<string[][]>(`/api/v5/rubik/stat/taker-volume-contract?instId=${ccy}-USDT-SWAP&period=5m&limit=100&unit=2`);
    const buckets = parseTakerBuckets(rows);
    if (buckets.length === 0) return null;
    return { buckets };
  });
}

// be-catalyst's quarter-hour store (PR 23) registers its reader here so this module compiles and runs before that
// file lands; after the merge the store module calls registerQhReader(readQhImbalance) at import time.
export type QhReader = (ccy: string) => QhReading | null;
let qhReader: QhReader | null = null;

export function registerQhReader(fn: QhReader | null) {
  qhReader = fn;
}

export function readQhImbalance(ccy: string): QhReading | null {
  if (!qhReader) return null;
  try {
    const r = qhReader(ccy);
    if (!r || !Number.isFinite(r.value)) return null;
    return { value: r.value, readings: Array.isArray(r.readings) ? r.readings.filter((x) => Number.isFinite(x)) : [], asOf: r.asOf };
  } catch {
    return null;
  }
}

export function _resetCvdCache() {
  cache.clear();
}
