import type { MacroCoupling } from "./types";

// Phase 3.3 macro coupling: rolling 30-day correlation of BTC and SPX daily returns, mapped to a multiplier for the
// macro and event weights on crypto. In decoupled months (corr near zero) macro features go quiet; in coupled
// months (corr ~0.8-0.9 post-2021) they run at full weight. Keyless: Strike daily klines for BTC, Yahoo ^GSPC for
// the equity proxy. Cached 6h; a failed fetch returns null and the engine behaves as if mult were 1.

export const COUPLING_WINDOW = 30;
export const COUPLING_MIN_MULT = 0.3;
export const COUPLING_MAX_MULT = 1.0;
const TTL = 6 * 3600e3;
const MIN_OVERLAP = 15;

export interface DailyClose {
  // UTC day key YYYY-MM-DD
  day: string;
  close: number;
}

export function couplingMult(corr: number): number {
  if (!Number.isFinite(corr)) return COUPLING_MAX_MULT;
  return Math.max(COUPLING_MIN_MULT, Math.min(COUPLING_MAX_MULT, corr));
}

function logReturns(series: DailyClose[]): Map<string, number> {
  const out = new Map<string, number>();
  const sorted = [...series].filter((p) => Number.isFinite(p.close) && p.close > 0).sort((a, b) => a.day.localeCompare(b.day));
  for (let i = 1; i < sorted.length; i++) out.set(sorted[i].day, Math.log(sorted[i].close / sorted[i - 1].close));
  return out;
}

// Pearson correlation of the last `window` overlapping trading days (SPX only trades weekdays, so BTC's weekend
// returns are dropped rather than smeared into Monday).
export function computeCoupling(btc: DailyClose[], spx: DailyClose[], window = COUPLING_WINDOW, asOf = new Date()): MacroCoupling | null {
  const rb = logReturns(btc);
  const rs = logReturns(spx);
  const days = [...rs.keys()].filter((d) => rb.has(d)).sort().slice(-window);
  if (days.length < MIN_OVERLAP) return null;
  const xs = days.map((d) => rb.get(d)!);
  const ys = days.map((d) => rs.get(d)!);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  const corr = Math.round((sxy / Math.sqrt(sxx * syy)) * 1000) / 1000;
  return { corr30d: corr, mult: Math.round(couplingMult(corr) * 1000) / 1000, n: days.length, asOf: asOf.toISOString() };
}

async function fetchJSON<T>(url: string, ms = 8000): Promise<T | null> {
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

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function fetchBtcDaily(): Promise<DailyClose[]> {
  const kl = await fetchJSON<unknown[]>("https://api.strikefinance.org/price/v2/klines?symbol=BTC-USD&interval=1d&limit=70&priceType=last");
  if (!Array.isArray(kl)) return [];
  return kl
    .map((k) => {
      const row = k as unknown[];
      const t = Number(row[0]);
      return { day: dayKey(t < 1e12 ? t * 1000 : t), close: parseFloat(String(row[4])) };
    })
    .filter((p) => Number.isFinite(p.close));
}

interface YahooChart {
  chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
}

async function fetchSpxDaily(): Promise<DailyClose[]> {
  const data = await fetchJSON<YahooChart>("https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=3mo&interval=1d");
  const res = data?.chart?.result?.[0];
  const ts = res?.timestamp ?? [];
  const closes = res?.indicators?.quote?.[0]?.close ?? [];
  return ts.map((t, i) => ({ day: dayKey(t * 1000), close: closes[i] as number })).filter((p) => Number.isFinite(p.close));
}

let cache: { value: MacroCoupling | null; at: number } | null = null;
let inflight: Promise<MacroCoupling | null> | null = null;

export async function getMacroCoupling(): Promise<MacroCoupling | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [btc, spx] = await Promise.all([fetchBtcDaily(), fetchSpxDaily()]);
      const value = computeCoupling(btc, spx);
      // Keep the last good value on a failed refresh rather than silencing macro for 6h.
      if (value || !cache) cache = { value, at: Date.now() };
      else cache = { value: cache.value, at: Date.now() };
      return cache.value;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
