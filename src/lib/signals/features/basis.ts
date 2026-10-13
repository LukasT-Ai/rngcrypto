// features.basis: annualized basis and curve slope from Deribit dated futures (BTC and ETH). Deribit has no keyless
// basis history, so the z-score is built from one sample per UTC day collected by this process (persisted to the
// data dir so a restart does not wipe it) and reads null below 10 samples. Backwardation on the front dated future
// is the stress flag (research 1.6).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FeedCache, getJSON, round, roundOrNull, zScore } from "./fetch";
import type { BasisFeature } from "./types";

export const BASIS_TTL = 5 * 60e3;
const MAX_SAMPLES = 90;
const MIN_Z_SAMPLES = 10;

export interface DatedFuture {
  instrument: string;
  expiry: number; // ms
  mark: number;
  index: number;
}

type BookSummary = { result?: { instrument_name: string; mark_price: number; estimated_delivery_price?: number; underlying_price?: number }[] };

const MONTHS: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

/** Deribit dated names look like BTC-27NOV26; delivery is 08:00 UTC on that day. */
export function parseExpiry(instrument: string): number | null {
  const m = /^[A-Z]+-(\d{1,2})([A-Z]{3})(\d{2})$/.exec(instrument);
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (month == null) return null;
  return Date.UTC(2000 + Number(m[3]), month, Number(m[1]), 8, 0, 0);
}

export function parseDatedFutures(res: BookSummary | null): DatedFuture[] {
  const rows = res?.result;
  if (!Array.isArray(rows)) return [];
  const out: DatedFuture[] = [];
  for (const r of rows) {
    const expiry = parseExpiry(r.instrument_name);
    const index = r.estimated_delivery_price ?? r.underlying_price;
    if (expiry == null || !(r.mark_price > 0) || index == null || !(index > 0)) continue;
    out.push({ instrument: r.instrument_name, expiry, mark: r.mark_price, index });
  }
  return out.sort((a, b) => a.expiry - b.expiry);
}

/** Annualized basis in percent: (F / index - 1) * 365 / daysToExpiry. */
export function annualizedBasisPct(mark: number, index: number, daysToExpiry: number): number | null {
  if (!(mark > 0) || !(index > 0) || !(daysToExpiry > 0)) return null;
  return (mark / index - 1) * (365 / daysToExpiry) * 100;
}

function nearestTo(futs: { days: number; ann: number }[], targetDays: number) {
  let best: { days: number; ann: number } | null = null;
  for (const f of futs) if (!best || Math.abs(f.days - targetDays) < Math.abs(best.days - targetDays)) best = f;
  return best;
}

export interface BasisSnapshot {
  annPct: number;
  curveSlope: number | null;
  stress: boolean;
  front: { instrument: string; daysToExpiry: number; annPct: number } | null;
}

export function computeBasis(futures: DatedFuture[], now = Date.now()): BasisSnapshot | null {
  const rows = futures
    .map((f) => {
      const days = (f.expiry - now) / 86400e3;
      const ann = annualizedBasisPct(f.mark, f.index, days);
      return { ...f, days, ann: ann as number };
    })
    .filter((f) => f.days >= 1 && Number.isFinite(f.ann));
  if (rows.length === 0) return null;
  // Reference: nearest expiry beyond 30 days (the quarterly), falling back to the longest-dated one.
  const beyond30 = rows.filter((f) => f.days > 30);
  const ref = beyond30[0] ?? rows[rows.length - 1];
  const front = rows.find((f) => f.days >= 7) ?? rows[0];
  const b3 = nearestTo(rows, 90);
  const b6 = nearestTo(rows, 180);
  const curveSlope = b3 && b6 && b3 !== b6 ? b6.ann - b3.ann : null;
  return {
    annPct: ref.ann,
    curveSlope,
    stress: front.mark < front.index,
    front: { instrument: front.instrument, daysToExpiry: round(front.days, 1), annPct: round(front.ann, 2) },
  };
}

// ── Daily sample store for the z-score ──────────────────────────────────────

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "signals") : join(process.cwd(), "data", "signals");
const FILE = join(DATA_DIR, "basis-history.json");
type Store = Record<string, { day: string; annPct: number }[]>;
let store: Store | null = null;

function loadStore(): Store {
  if (store) return store;
  try {
    store = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as Store) : {};
  } catch {
    store = {};
  }
  return store!;
}

function saveStore() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(store ?? {}));
  } catch {
    /* best effort */
  }
}

/** Records one sample per UTC day per currency and returns the history (oldest first). Pure given `samples`. */
export function recordDailySample(samples: { day: string; annPct: number }[], day: string, annPct: number): { day: string; annPct: number }[] {
  const next = samples.filter((s) => s.day !== day);
  next.push({ day, annPct });
  return next.sort((a, b) => a.day.localeCompare(b.day)).slice(-MAX_SAMPLES);
}

export function basisZ(history: { annPct: number }[], annPct: number): number | null {
  return zScore(annPct, history.map((h) => h.annPct), MIN_Z_SAMPLES);
}

export function buildBasisFeature(snap: BasisSnapshot | null, history: { day: string; annPct: number }[], now = Date.now()): BasisFeature | null {
  if (!snap) return null;
  return {
    asOf: now,
    ttlMs: BASIS_TTL,
    annPct: round(snap.annPct, 2),
    z: roundOrNull(basisZ(history, snap.annPct), 2),
    curveSlope: roundOrNull(snap.curveSlope, 2),
    stress: snap.stress,
    front: snap.front,
    n: history.length,
  };
}

// ── Fetcher ─────────────────────────────────────────────────────────────────

const cache = new FeedCache<BasisFeature>(BASIS_TTL);

export async function fetchBasisFeature(currency: "BTC" | "ETH" | undefined, now = Date.now()): Promise<BasisFeature | null> {
  if (!currency) return null;
  return cache.get(currency, async () => {
    const res = await getJSON<BookSummary>(`https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=future`);
    const snap = computeBasis(parseDatedFutures(res), now);
    if (!snap) return null;
    const s = loadStore();
    const day = new Date(now).toISOString().slice(0, 10);
    const prior = s[currency] ?? [];
    const updated = recordDailySample(prior, day, snap.annPct);
    if (prior.length !== updated.length || prior[prior.length - 1]?.day !== day) {
      s[currency] = updated;
      saveStore();
    }
    // z is against the days BEFORE today so today's own sample does not shrink it.
    return buildBasisFeature(snap, updated.filter((x) => x.day !== day), now);
  });
}

export function _resetBasisCache() {
  cache.clear();
}
