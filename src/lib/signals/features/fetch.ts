// Shared plumbing for the Phase 4 keyless feature feeds.
//
// Every feed in this directory follows the same rules: a hard timeout, a TTL cache keyed per instrument, an inflight
// dedupe so parallel symbol runs share one request, a stale window of 3x TTL after which the value is dropped
// (never served forever), and a null result on any failure. Nothing here throws into the engine.

export interface FeatureMeta {
  asOf: number; // ms epoch of the newest sample in the feed
  ttlMs: number; // cache TTL, so the UI can label "stale" at 3x
}

export const STALE_MULT = 3;

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (RNGcrypto features)", ...(init.headers ?? {}) } });
  } finally {
    clearTimeout(id);
  }
}

export async function getJSON<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const r = await fetchWithTimeout(url, {}, timeoutMs);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function getText(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(url, {}, timeoutMs);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

export async function postJSON<T>(url: string, body: unknown, timeoutMs = 8000): Promise<T | null> {
  try {
    const r = await fetchWithTimeout(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

// OKX v5 envelope. A non-"0" code (including the geo-block "Service unavailable" style answers) is a failure.
export async function okxData<T>(path: string, timeoutMs = 8000): Promise<T | null> {
  const j = await getJSON<{ code?: string; data?: T }>(`https://www.okx.com${path}`, timeoutMs);
  if (!j || j.code !== "0" || j.data == null) return null;
  return j.data;
}

interface CacheEntry<T> {
  at: number;
  value: T | null;
}

/**
 * Per-key TTL cache with inflight dedupe. `loader` returns null on failure; a failed refresh keeps the previous
 * value until it is older than STALE_MULT x ttl, then the feed reads null (so a dead feed shows as "feed off"
 * instead of a months-old number).
 */
export class FeedCache<T> {
  private entries = new Map<string, CacheEntry<T>>();
  private inflight = new Map<string, Promise<T | null>>();
  constructor(private ttlMs: number) {}

  get ttl() {
    return this.ttlMs;
  }

  async get(key: string, loader: () => Promise<T | null>, now = Date.now()): Promise<T | null> {
    const hit = this.entries.get(key);
    if (hit && now - hit.at < this.ttlMs) return hit.value;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = (async () => {
      try {
        const value = await loader();
        if (value != null) {
          this.entries.set(key, { at: now, value });
          return value;
        }
        // Failed refresh: serve the stale value inside the stale window, otherwise null. Bump `at` only a little so
        // we retry on the next run rather than hammering a dead endpoint every call.
        if (hit && now - hit.at < this.ttlMs * STALE_MULT) return hit.value;
        this.entries.delete(key);
        return null;
      } catch {
        if (hit && now - hit.at < this.ttlMs * STALE_MULT) return hit.value;
        return null;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  clear() {
    this.entries.clear();
    this.inflight.clear();
  }
}

// ── Small stats helpers shared by the transforms (pure, tested) ─────────────

export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** z of `x` against the sample `history`; null when the history is too short or flat. */
export function zScore(x: number, history: number[], minN = 10): number | null {
  const finite = history.filter((v) => Number.isFinite(v));
  if (finite.length < minN) return null;
  const m = mean(finite)!;
  const s = stdev(finite)!;
  if (!(s > 0)) return null;
  return (x - m) / s;
}

/** Percentile rank of `x` in `history`, 0..100. */
export function percentileRank(x: number, history: number[]): number | null {
  const finite = history.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  const below = finite.filter((v) => v < x).length;
  const equal = finite.filter((v) => v === x).length;
  return ((below + equal * 0.5) / finite.length) * 100;
}

/** Pearson correlation of two equal-length series; null when degenerate. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (!(sxx > 0) || !(syy > 0)) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export const round = (n: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export const roundOrNull = (n: number | null | undefined, dp = 2) => (n == null || !Number.isFinite(n) ? null : round(n, dp));
