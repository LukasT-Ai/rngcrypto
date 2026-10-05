import type { MarketSnapshot, SnapshotKey } from "./types";
import { SNAPSHOT_KEYS } from "./types";

// Confirmation inputs. Yahoo for rates/dollar/vol/equities (no key), Strike for the three signal assets so the
// numbers match the rest of the dashboard.
const YAHOO: Record<Exclude<SnapshotKey, "btc" | "gold" | "wti">, string> = {
  dxy: "DX-Y.NYB",
  us2y: "2YY=F",
  us10y: "^TNX",
  spx: "^GSPC",
  ndx: "^IXIC",
  vix: "^VIX",
};
const STRIKE: Record<"btc" | "gold" | "wti", string> = { btc: "BTC-USD", gold: "XAU-USD", wti: "WTI-USD" };

interface Quote {
  price: number;
  prevClose: number | null;
  at: number;
  series?: { t: number; c: number }[];
}

const quoteCache = new Map<string, { q: Quote; fetchedAt: number }>();
let ttlMs = 30_000;

export function setMarketTtl(ms: number) {
  ttlMs = ms;
}

async function fetchJSON<T>(url: string, ms = 7000): Promise<T | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (RNGcrypto macro)" } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

interface YahooChart {
  chart?: { result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number; regularMarketTime?: number }; timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
}

async function yahooQuote(symbol: string): Promise<Quote | null> {
  const key = `y:${symbol}`;
  const hit = quoteCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < ttlMs) return hit.q;
  const data = await fetchJSON<YahooChart>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=5m`);
  const res = data?.chart?.result?.[0];
  const price = res?.meta?.regularMarketPrice;
  if (!res || !Number.isFinite(price)) return hit?.q ?? null;
  const ts = res.timestamp ?? [];
  const closes = res.indicators?.quote?.[0]?.close ?? [];
  const series = ts.map((t, i) => ({ t: t * 1000, c: closes[i] as number })).filter((p) => Number.isFinite(p.c));
  const q: Quote = { price: price as number, prevClose: res.meta?.chartPreviousClose ?? null, at: (res.meta?.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000, series };
  quoteCache.set(key, { q, fetchedAt: Date.now() });
  return q;
}

async function strikeQuote(symbol: string): Promise<Quote | null> {
  const key = `s:${symbol}`;
  const hit = quoteCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < Math.min(ttlMs, 15_000)) return hit.q;
  const [mark, kl] = await Promise.all([
    fetchJSON<{ p?: string }>(`https://api.strikefinance.org/price/v2/markPrice?symbol=${symbol}`),
    fetchJSON<unknown[]>(`https://api.strikefinance.org/price/v2/klines?symbol=${symbol}&interval=5m&limit=300&priceType=last`),
  ]);
  const price = parseFloat(mark?.p ?? "");
  const series = Array.isArray(kl)
    ? kl
        .map((k) => {
          const row = k as unknown[];
          const t = Number(row[0]);
          return { t: t < 1e12 ? t * 1000 : t, c: parseFloat(String(row[4])) };
        })
        .filter((p) => Number.isFinite(p.c))
    : [];
  if (!Number.isFinite(price)) {
    const last = series[series.length - 1];
    if (!last) return hit?.q ?? null;
    const q: Quote = { price: last.c, prevClose: null, at: last.t, series };
    quoteCache.set(key, { q, fetchedAt: Date.now() });
    return q;
  }
  const q: Quote = { price, prevClose: null, at: Date.now(), series };
  quoteCache.set(key, { q, fetchedAt: Date.now() });
  return q;
}

export async function getSnapshot(): Promise<MarketSnapshot> {
  const entries = await Promise.all(
    SNAPSHOT_KEYS.map(async (k) => {
      const q = k in STRIKE ? await strikeQuote(STRIKE[k as keyof typeof STRIKE]) : await yahooQuote(YAHOO[k as keyof typeof YAHOO]);
      return [k, q] as const;
    })
  );
  const prices = Object.fromEntries(entries.map(([k, q]) => [k, q?.price ?? null])) as Record<SnapshotKey, number | null>;
  // Data age = how old our newest fetch is (analysis freshness), not the venue's last trade time
  // (a futures contract on a Sunday would otherwise report days).
  const fetchedAges: number[] = [];
  for (const k of SNAPSHOT_KEYS) {
    const key = k in STRIKE ? `s:${STRIKE[k as keyof typeof STRIKE]}` : `y:${YAHOO[k as keyof typeof YAHOO]}`;
    const c = quoteCache.get(key);
    if (c) fetchedAges.push(Date.now() - c.fetchedAt);
  }
  return { at: new Date().toISOString(), prices, dataAgeMs: fetchedAges.length ? Math.max(...fetchedAges) : null };
}

// Price at or just before a timestamp, from the cached intraday series (5m granularity).
export async function priceAt(key: SnapshotKey, tsMs: number): Promise<number | null> {
  const q = key in STRIKE ? await strikeQuote(STRIKE[key as keyof typeof STRIKE]) : await yahooQuote(YAHOO[key as keyof typeof YAHOO]);
  const s = q?.series;
  if (!s || s.length === 0) return null;
  let best: { t: number; c: number } | null = null;
  for (const p of s) {
    if (p.t <= tsMs) best = p;
    else break;
  }
  return best?.c ?? s[0].c;
}

// 5-day changes for regime detection.
export async function fiveDayChanges(): Promise<Record<SnapshotKey, number | null>> {
  const out = {} as Record<SnapshotKey, number | null>;
  for (const k of SNAPSHOT_KEYS) {
    const q = k in STRIKE ? await strikeQuote(STRIKE[k as keyof typeof STRIKE]) : await yahooQuote(YAHOO[k as keyof typeof YAHOO]);
    const s = q?.series;
    if (!q || !s || s.length < 10) {
      out[k] = null;
      continue;
    }
    const first = s[0].c;
    // Yields are quoted in %, so report absolute change for rates and percent change for everything else.
    out[k] = k === "us2y" || k === "us10y" ? round(q.price - first, 3) : round(((q.price - first) / first) * 100, 2);
  }
  return out;
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
