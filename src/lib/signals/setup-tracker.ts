/**
 * Active-setup age tracker. The engine rebuilds its horizon setups (SCALP / SWING / POSITION) from scratch on
 * every run, so the entry/stop/targets drift with price and nothing says how long a call has been standing.
 * This module remembers, per symbol and horizon, when the current direction was first published and stamps
 * it onto each setup as `calledAt`. The stamp resets when the direction flips or the horizon goes quiet
 * (no setup on a run), so "called 3h ago" always refers to the current uninterrupted call.
 *
 * Persisted next to signal-history.json so a redeploy does not zero every age.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "signals")
  : join(process.cwd(), "data");
const FILE_PATH = join(DATA_DIR, "active-setups.json");

export type SetupBias = "LONG" | "SHORT" | "NEUTRAL";

export interface TrackedSetup {
  bias: SetupBias;
  /** First run on which this direction appeared for the horizon. */
  calledAt: number;
  /** Entry price on the run that first published the call. */
  calledEntry: number;
  lastSeenAt: number;
}

type Store = Record<string, Record<string, TrackedSetup>>;

let memory: Store | null = null;

function load(): Store {
  if (memory) return memory;
  try {
    if (existsSync(FILE_PATH)) {
      memory = JSON.parse(readFileSync(FILE_PATH, "utf-8")) as Store;
      return memory;
    }
  } catch {
    /* corrupt file: start fresh */
  }
  memory = {};
  return memory;
}

function save(store: Store): void {
  memory = store;
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE_PATH}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(store), "utf-8");
    renameSync(tmp, FILE_PATH); // atomic replace
  } catch {
    /* read-only filesystem: ages survive in memory for this process only */
  }
}

/** Test hook: drop the in-memory store so each test starts clean. */
export function resetSetupTracker(): void {
  memory = null;
}

/**
 * Reconcile the setups an engine run produced with what was tracked and return the same setups with
 * `calledAt` / `calledEntry` attached. Horizons missing from `setups` are forgotten.
 */
export function stampActiveSetups<T extends { horizonLabel: string; bias: SetupBias; entry: number }>(
  symbol: string,
  setups: T[],
  now = Date.now(),
): Array<T & { calledAt: number; calledEntry: number }> {
  const store = load();
  const prev = store[symbol] ?? {};
  const next: Record<string, TrackedSetup> = {};

  const stamped = setups.map((s) => {
    const was = prev[s.horizonLabel];
    const rec: TrackedSetup =
      was && was.bias === s.bias
        ? { ...was, lastSeenAt: now }
        : { bias: s.bias, calledAt: now, calledEntry: s.entry, lastSeenAt: now };
    next[s.horizonLabel] = rec;
    return { ...s, calledAt: rec.calledAt, calledEntry: rec.calledEntry };
  });

  if (Object.keys(next).length === 0) delete store[symbol];
  else store[symbol] = next;
  save(store);
  return stamped;
}

// ── Expected hold buckets (PR 15, design F1.1 `call.expectedHold`) ───────────────────────────────────────────
// Minutes from fill to close, bucketed symbol x bias x regime with coarser fallbacks. Two sources: the latest
// backtest (scripts/backtest.ts --write-hold-buckets writes data/hold-buckets.json, committed with the repo) and
// the live ledger (signal-history.json), which takes over per bucket once it has enough decided records.

export type HoldTF = "15m" | "1h" | "4h" | "1d";
export interface HoldBucket {
  n: number;
  p25: number;
  median: number;
  p75: number;
}
export interface HoldBucketFile {
  generatedAt: string;
  source: string;
  buckets: Record<string, HoldBucket>;
}
export interface ExpectedHold {
  medianMin: number;
  p25Min: number;
  p75Min: number;
  n: number;
  tf: HoldTF;
  /** Which source and bucket answered (for the tooltip / audit). */
  source: "ledger" | "backtest";
  bucket: string;
}
export interface HoldSample {
  symbol: string;
  bias: "LONG" | "SHORT";
  regime: string | null;
  holdMin: number;
}

/** Minimum decided samples before a bucket is quoted; below it the next coarser bucket answers. */
export const HOLD_BUCKET_MIN_N = 10;
/** Live ledger overrides the backtest bucket once it has this many samples. */
export const HOLD_LEDGER_MIN_N = 20;

export function holdBucketKeys(symbol: string, bias: "LONG" | "SHORT", regime: string | null): string[] {
  const r = regime ?? "none";
  return [`${symbol}|${bias}|${r}`, `${symbol}|${bias}|*`, `*|${bias}|${r}`, `*|${bias}|*`, `*|*|*`];
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Build every bucket (all granularities) from hold samples tagged with symbol, bias and regime. */
export function buildHoldBuckets(samples: HoldSample[]): Record<string, HoldBucket> {
  const groups = new Map<string, number[]>();
  for (const s of samples) {
    if (!(s.holdMin >= 0) || !Number.isFinite(s.holdMin)) continue;
    for (const k of holdBucketKeys(s.symbol, s.bias, s.regime)) groups.set(k, [...(groups.get(k) ?? []), s.holdMin]);
  }
  const out: Record<string, HoldBucket> = {};
  for (const [k, v] of groups) {
    const a = [...v].sort((x, y) => x - y);
    out[k] = { n: a.length, p25: Math.round(quantile(a, 0.25)), median: Math.round(quantile(a, 0.5)), p75: Math.round(quantile(a, 0.75)) };
  }
  return out;
}

const HOLD_FILE_CANDIDATES = [join(process.cwd(), "data", "hold-buckets.json"), join(DATA_DIR, "hold-buckets.json")];
let holdFileCache: { at: number; buckets: Record<string, HoldBucket> } | null = null;
let holdFileOverride: Record<string, HoldBucket> | null = null;
let ledgerCache: { at: number; buckets: Record<string, HoldBucket> } | null = null;
let ledgerLoader: (() => HoldSample[]) | null = null;
const HOLD_CACHE_MS = 5 * 60e3;

/** Test / backtest hook: use these backtest buckets instead of the file (null restores the file). */
export function setHoldBuckets(buckets: Record<string, HoldBucket> | null): void {
  holdFileOverride = buckets;
  holdFileCache = null;
}
/** Engine hook: supply the live ledger samples lazily (keeps this module free of the logger import). */
export function setHoldLedgerLoader(loader: (() => HoldSample[]) | null): void {
  ledgerLoader = loader;
  ledgerCache = null;
}

function backtestBuckets(now: number): Record<string, HoldBucket> {
  if (holdFileOverride) return holdFileOverride;
  if (holdFileCache && now - holdFileCache.at < HOLD_CACHE_MS) return holdFileCache.buckets;
  let buckets: Record<string, HoldBucket> = {};
  for (const f of HOLD_FILE_CANDIDATES) {
    try {
      if (!existsSync(f)) continue;
      const parsed = JSON.parse(readFileSync(f, "utf-8")) as Partial<HoldBucketFile>;
      if (parsed && parsed.buckets && typeof parsed.buckets === "object") {
        buckets = parsed.buckets;
        break;
      }
    } catch {
      /* unreadable: treat as absent */
    }
  }
  holdFileCache = { at: now, buckets };
  return buckets;
}

function ledgerBuckets(now: number): Record<string, HoldBucket> {
  if (!ledgerLoader) return {};
  if (ledgerCache && now - ledgerCache.at < HOLD_CACHE_MS) return ledgerCache.buckets;
  let buckets: Record<string, HoldBucket> = {};
  try {
    buckets = buildHoldBuckets(ledgerLoader());
  } catch {
    buckets = {};
  }
  ledgerCache = { at: now, buckets };
  return buckets;
}

/**
 * Expected hold for a call: the finest bucket with enough samples, the live ledger preferred over the backtest
 * once it has HOLD_LEDGER_MIN_N samples in that bucket. null when nothing qualifies.
 */
export function expectedHoldFor(symbol: string, bias: "LONG" | "SHORT", regime: string | null, tf: HoldTF, now = Date.now()): ExpectedHold | null {
  const bt = backtestBuckets(now);
  const lg = ledgerBuckets(now);
  for (const key of holdBucketKeys(symbol, bias, regime)) {
    const l = lg[key];
    if (l && l.n >= HOLD_LEDGER_MIN_N) return { medianMin: l.median, p25Min: l.p25, p75Min: l.p75, n: l.n, tf, source: "ledger", bucket: key };
    const b = bt[key];
    if (b && b.n >= HOLD_BUCKET_MIN_N) return { medianMin: b.median, p25Min: b.p25, p75Min: b.p75, n: b.n, tf, source: "backtest", bucket: key };
  }
  return null;
}
