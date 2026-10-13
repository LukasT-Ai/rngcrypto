// Hyperliquid info-endpoint client with a weight-based token bucket and exponential backoff on 429.
//
// The public limit is 1200 weight per minute per IP. userFills / userFillsByTime / portfolio weigh 20,
// clearinghouseState 2. The bucket defaults to 800 weight per minute (~40 fill requests; 1000 produced a steady trickle of 429s live) so the scanner leaves
// headroom for the on-demand trader endpoint and the rest of the site. Nothing here throws: every call resolves
// to null on failure after its retries are exhausted.

import { fetchWithTimeout } from "@/lib/signals/features/fetch";

export const INFO_URL = "https://api.hyperliquid.xyz/info";

export const WEIGHT = {
  userFills: 20,
  userFillsByTime: 20,
  portfolio: 20,
  clearinghouseState: 2,
  meta: 20,
} as const;

/** Continuous-refill token bucket. `take` resolves once `weight` tokens are available. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private capacity: number,
    private refillPerMs: number,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  private refill() {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + (t - this.last) * this.refillPerMs);
    this.last = t;
  }

  /** Tokens available right now (after refill), for tests and status. */
  available(): number {
    this.refill();
    return this.tokens;
  }

  /** Milliseconds until `weight` tokens are available (0 when they already are). */
  waitFor(weight: number): number {
    this.refill();
    if (this.tokens >= weight) return 0;
    return Math.ceil((weight - this.tokens) / this.refillPerMs);
  }

  take(weight: number): Promise<void> {
    // Serialise takers so a big request cannot be starved by a stream of small ones.
    const run = async () => {
      const w = Math.min(weight, this.capacity);
      const wait = this.waitFor(w);
      if (wait > 0) await this.sleep(wait);
      this.refill();
      this.tokens -= w;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}

/** Shared bucket for every Hyperliquid info call made by this process. */
export const hlBucket = new TokenBucket(
  Number(process.env.COPYTRADE_WEIGHT_PER_MIN ?? 800),
  Number(process.env.COPYTRADE_WEIGHT_PER_MIN ?? 800) / 60_000
);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface InfoStats {
  calls: number;
  failures: number;
  rateLimited: number;
  lastErrorAt: number | null;
  lastError: string | null;
}

export const infoStats: InfoStats = { calls: 0, failures: 0, rateLimited: 0, lastErrorAt: null, lastError: null };

let globalBackoffUntil = 0;

/**
 * POST /info with the bucket and backoff. Returns null on any failure. 429 (and 5xx) back off 2s, 4s, 8s ... up
 * to `retries` attempts; a 429 also pauses every other caller for the same period.
 */
export async function info<T>(body: Record<string, unknown>, weight: number, opts: { timeoutMs?: number; retries?: number } = {}): Promise<T | null> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retries = opts.retries ?? 4;
  let delay = 2_000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const pause = globalBackoffUntil - Date.now();
    if (pause > 0) await sleep(pause);
    await hlBucket.take(weight);
    infoStats.calls++;
    try {
      const r = await fetchWithTimeout(INFO_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);
      if (r.ok) return (await r.json()) as T;
      if (r.status === 429 || r.status >= 500) {
        if (r.status === 429) infoStats.rateLimited++;
        infoStats.lastErrorAt = Date.now();
        infoStats.lastError = `HTTP ${r.status} ${String(body.type)}`;
        if (attempt === retries) break;
        globalBackoffUntil = Math.max(globalBackoffUntil, Date.now() + delay);
        await sleep(delay);
        delay = Math.min(delay * 2, 60_000);
        continue;
      }
      // 4xx other than 429: invalid request (bad address etc.) -> do not retry.
      infoStats.lastErrorAt = Date.now();
      infoStats.lastError = `HTTP ${r.status} ${String(body.type)}`;
      break;
    } catch (e) {
      infoStats.lastErrorAt = Date.now();
      infoStats.lastError = e instanceof Error ? e.message : String(e);
      if (attempt === retries) break;
      await sleep(delay);
      delay = Math.min(delay * 2, 60_000);
    }
  }
  infoStats.failures++;
  return null;
}

export const isAddress = (s: unknown): s is string => typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
