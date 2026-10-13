/**
 * Quarter-hour taker imbalance (research-predictive-features.md 1.4, Kim & Hansen 2026).
 *
 * At each :00/:15/:30/:45 UTC boundary B the poller samples OKX `/api/v5/market/trades` for every crypto symbol
 * during the opening minute [B, B+60s), dedupes by tradeId and computes
 *     imbalance = (takerBuyUsd - takerSellUsd) / (takerBuyUsd + takerSellUsd)
 * where notional = sz x ctVal x px (OKX swap `sz` is in contracts). The last 96 windows per symbol (24h) are kept
 * in memory and persisted under the data dir so a redeploy does not lose the series. The engine feature is the
 * EMA of the last 4 readings; sign = direction over the next 4 to 12 hours.
 *
 * Every public getter is synchronous and never throws. The poller swallows fetch errors (a missed window is
 * simply absent), so nothing in here can take the scheduler down.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

export const QH_SLOT_MS = 15 * 60_000;
/** Opening-minute window length after the boundary. */
export const QH_WINDOW_MS = 60_000;
/** Windows kept per symbol (24h at 15m). */
export const QH_KEEP = 96;
/** A reading older than this is reported as stale (one missed boundary plus slack). */
export const QH_STALE_MIN = 20;
export const QH_EMA_N = 4;

export interface OkxTrade {
  tradeId: string;
  px: string;
  sz: string;
  side: string;
  ts: string;
}

export interface QhWindow {
  /** Window start (the quarter-hour boundary), ISO. */
  windowStart: string;
  /** Window end (boundary + 60s), ISO. */
  windowEnd: string;
  imbalance: number;
  buyUsd: number;
  sellUsd: number;
  /** Deduped trade count inside the window. */
  n: number;
  /** Share of the 60s window covered by the polled tape, 0..1 (1 = no gaps between polls). */
  coverage: number;
}

export interface QhReading {
  imbalance: number;
  windowEnd: string;
  n: number;
}

export interface QhImbalance {
  imbalance: number;
  /** EMA of the last 4 readings (the feature value per research 1.4). */
  ema4: number;
  windowEnd: string;
  n: number;
  ageMin: number;
  stale: boolean;
}

// ── Pure computation ─────────────────────────────────────────────────────────

/** Start of the quarter hour that contains `now`. */
export function qhBoundary(now = Date.now()): number {
  return Math.floor(now / QH_SLOT_MS) * QH_SLOT_MS;
}

/** The next quarter-hour boundary strictly after `now`. */
export function nextQhBoundary(now = Date.now()): number {
  return qhBoundary(now) + QH_SLOT_MS;
}

/** Window [B, B+60s) for the boundary B that owns `now`. */
export function qhWindowFor(now = Date.now()): { start: number; end: number } {
  const start = qhBoundary(now);
  return { start, end: start + QH_WINDOW_MS };
}

/**
 * Taker imbalance from a (possibly overlapping, possibly out-of-order) set of trade pages. Trades outside
 * [start, end) are ignored; duplicates by tradeId are dropped. `ctVal` converts contracts to base units.
 * Returns null when no trade falls inside the window.
 */
export function computeImbalance(
  pages: OkxTrade[][],
  start: number,
  end: number,
  ctVal: number,
  opts: { lastFetchedAt?: number } = {},
): Omit<QhWindow, "windowStart" | "windowEnd"> | null {
  const seen = new Set<string>();
  const inWindow: { ts: number; usd: number; buy: boolean }[] = [];
  for (const page of pages) {
    for (const t of page) {
      if (!t || seen.has(t.tradeId)) continue;
      const ts = Number(t.ts);
      const px = parseFloat(t.px);
      const sz = parseFloat(t.sz);
      if (!Number.isFinite(ts) || !Number.isFinite(px) || !Number.isFinite(sz) || sz <= 0 || px <= 0) continue;
      seen.add(t.tradeId);
      if (ts < start || ts >= end) continue;
      inWindow.push({ ts, usd: sz * ctVal * px, buy: t.side === "buy" });
    }
  }
  if (inWindow.length === 0) return null;
  let buyUsd = 0;
  let sellUsd = 0;
  for (const t of inWindow) {
    if (t.buy) buyUsd += t.usd;
    else sellUsd += t.usd;
  }
  const total = buyUsd + sellUsd;
  const imbalance = total > 0 ? (buyUsd - sellUsd) / total : 0;
  return {
    imbalance: Math.round(imbalance * 1000) / 1000,
    buyUsd: Math.round(buyUsd),
    sellUsd: Math.round(sellUsd),
    n: inWindow.length,
    coverage: pageCoverage(pages, start, end, opts.lastFetchedAt),
  };
}

/**
 * Share of [start, end) covered by the union of the page spans. Each page from /market/trades is the latest N
 * trades, so its span is [oldest ts, newest ts]; a gap between consecutive page spans means trades were missed.
 * When the final page was fetched after the window closed (`lastFetchedAt >= end`), the tape between its newest
 * trade and `end` is known to be empty, so that page covers to `end`.
 */
export function pageCoverage(pages: OkxTrade[][], start: number, end: number, lastFetchedAt?: number): number {
  const spans: [number, number][] = [];
  pages.forEach((page, i) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of page) {
      const ts = Number(t?.ts);
      if (!Number.isFinite(ts)) continue;
      if (ts < lo) lo = ts;
      if (ts > hi) hi = ts;
    }
    if (lo === Infinity) return;
    if (i === pages.length - 1 && lastFetchedAt != null && lastFetchedAt >= end) hi = Math.max(hi, end);
    const a = Math.max(start, lo);
    const b = Math.min(end, hi);
    if (b > a) spans.push([a, b]);
  });
  if (spans.length === 0) return 0;
  spans.sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let curLo = spans[0][0];
  let curHi = spans[0][1];
  for (let i = 1; i < spans.length; i++) {
    const [lo, hi] = spans[i];
    if (lo <= curHi) curHi = Math.max(curHi, hi);
    else {
      covered += curHi - curLo;
      curLo = lo;
      curHi = hi;
    }
  }
  covered += curHi - curLo;
  const len = end - start;
  return len > 0 ? Math.round(Math.min(1, Math.max(0, covered / len)) * 1000) / 1000 : 0;
}

/** EMA over the last `n` readings (oldest first); seeds with the first reading. */
export function emaOfLast(values: number[], n = QH_EMA_N): number {
  const v = values.slice(-n);
  if (v.length === 0) return 0;
  const k = 2 / (n + 1);
  let e = v[0];
  for (let i = 1; i < v.length; i++) e = v[i] * k + e * (1 - k);
  return Math.round(e * 1000) / 1000;
}

// ── Store ────────────────────────────────────────────────────────────────────

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "signals")
  : join(process.cwd(), "data");
const FILE_PATH = join(DATA_DIR, "qh-imbalance.json");

type StoreFile = { version: 1; windows: Record<string, QhWindow[]> };

let mem: Map<string, QhWindow[]> | null = null;

function load(): Map<string, QhWindow[]> {
  if (mem) return mem;
  mem = new Map();
  try {
    if (existsSync(FILE_PATH)) {
      const parsed = JSON.parse(readFileSync(FILE_PATH, "utf-8")) as Partial<StoreFile>;
      for (const [sym, list] of Object.entries(parsed?.windows ?? {})) {
        if (Array.isArray(list)) mem.set(sym, list.filter((w) => w && typeof w.imbalance === "number" && typeof w.windowEnd === "string").slice(-QH_KEEP));
      }
    }
  } catch {
    /* corrupt file: start empty, keep the file for inspection */
  }
  return mem;
}

function save(): void {
  if (!mem) return;
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const out: StoreFile = { version: 1, windows: Object.fromEntries(mem) };
    const tmp = `${FILE_PATH}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(out), "utf-8");
    renameSync(tmp, FILE_PATH);
  } catch {
    /* disk problem: memory copy still serves */
  }
}

/** Record a completed window; replaces an existing entry with the same windowStart. */
export function recordQhWindow(symbol: string, w: QhWindow): void {
  const store = load();
  const list = (store.get(symbol) ?? []).filter((x) => x.windowStart !== w.windowStart);
  list.push(w);
  list.sort((a, b) => a.windowStart.localeCompare(b.windowStart));
  store.set(symbol, list.slice(-QH_KEEP));
  save();
}

/** Latest reading plus the EMA(4) feature value; null until a window exists for the symbol. */
export function getQhImbalance(symbol: string, now = Date.now()): QhImbalance | null {
  const list = load().get(symbol);
  if (!list || list.length === 0) return null;
  const last = list[list.length - 1];
  const ageMin = Math.max(0, Math.round((now - new Date(last.windowEnd).getTime()) / 60_000));
  return {
    imbalance: last.imbalance,
    ema4: emaOfLast(list.map((w) => w.imbalance)),
    windowEnd: last.windowEnd,
    n: last.n,
    ageMin,
    stale: ageMin > QH_STALE_MIN,
  };
}

/** Last `n` readings, oldest first (sparklines / the four bars on the F2.3 tile). */
export function getQhSeries(symbol: string, n = 12): QhReading[] {
  const list = load().get(symbol) ?? [];
  return list.slice(-n).map((w) => ({ imbalance: w.imbalance, windowEnd: w.windowEnd, n: w.n }));
}

/** Full stored windows for a symbol (diagnostics). */
export function getQhWindows(symbol: string): QhWindow[] {
  return [...(load().get(symbol) ?? [])];
}

/** Test hook: drop the in-memory copy so the next getter reloads from disk (or starts empty). */
export function _resetQhStore(): void {
  mem = null;
}

// ── Poller ───────────────────────────────────────────────────────────────────

const OKX = "https://www.okx.com";
const UA = { "User-Agent": "RNGcrypto/1.0 (qh-imbalance)" };

async function okxJson<T>(path: string, timeoutMs: number): Promise<T | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${OKX}${path}`, { signal: ctl.signal, cache: "no-store", headers: UA });
    if (!r.ok) return null;
    const j = (await r.json()) as { code?: string; data?: T };
    if (j.code !== "0" || !j.data) return null;
    return j.data;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const ctValCache = new Map<string, number>();
export async function okxContractValue(instId: string): Promise<number | null> {
  const hit = ctValCache.get(instId);
  if (hit) return hit;
  const data = await okxJson<{ instId: string; ctVal: string }[]>(`/api/v5/public/instruments?instType=SWAP&instId=${instId}`, 8000);
  const v = parseFloat(data?.[0]?.ctVal ?? "");
  if (!(v > 0)) return null;
  ctValCache.set(instId, v);
  return v;
}

export async function okxTradesPage(instId: string): Promise<OkxTrade[] | null> {
  return okxJson<OkxTrade[]>(`/api/v5/market/trades?instId=${instId}&limit=500`, 6000);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Sample one symbol's opening minute for the boundary `start`: a /market/trades page (latest 500) every
 * `stepMs` until just past the window end, then compute and store. 500 trades cover ~13s on ETH and ~18s on
 * BTC at normal activity and the opening minute is the busy one, so 2s steps leave headroom (11 symbols =
 * ~6 req/s against OKX's 100 req/2s limit); `coverage` records any gap. Resolves to the stored window
 * or null; never throws.
 */
export async function sampleQhWindow(
  symbol: string,
  instId: string,
  start: number,
  opts: { stepMs?: number; fetchPage?: (instId: string) => Promise<OkxTrade[] | null>; ctVal?: number | null; now?: () => number } = {},
): Promise<QhWindow | null> {
  const stepMs = opts.stepMs ?? 2000;
  const fetchPage = opts.fetchPage ?? okxTradesPage;
  const now = opts.now ?? Date.now;
  const end = start + QH_WINDOW_MS;
  try {
    const ctVal = opts.ctVal ?? (await okxContractValue(instId));
    if (!ctVal) return null;
    const pages: OkxTrade[][] = [];
    let lastFetchedAt = 0;
    // Keep polling until a page's newest trade is past the window end (or we are well past it).
    for (let i = 0; i < 20; i++) {
      const page = await fetchPage(instId);
      lastFetchedAt = now();
      if (page && page.length) pages.push(page);
      const newest = page?.length ? Number(page[0].ts) : 0;
      if (newest >= end || lastFetchedAt >= end + 2 * stepMs) break;
      await sleep(Math.max(500, Math.min(stepMs, end + 1000 - now())));
    }
    const r = computeImbalance(pages, start, end, ctVal, { lastFetchedAt });
    if (!r) return null;
    const w: QhWindow = { windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString(), ...r };
    recordQhWindow(symbol, w);
    return w;
  } catch {
    return null;
  }
}

/** Sample every symbol for the boundary `start` concurrently; errors are per symbol. */
export async function sampleAllQhWindows(symbols: { symbol: string; instId: string }[], start: number): Promise<number> {
  const results = await Promise.allSettled(symbols.map((s) => sampleQhWindow(s.symbol, s.instId, start)));
  return results.filter((r) => r.status === "fulfilled" && r.value).length;
}
