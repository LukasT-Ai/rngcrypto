import type { MacroAsset } from "../macro/types";
import type { PMAdapterResult, PMMarket, PMOutcome, PMTopic } from "./types";

// Kalshi prediction-market adapter. Public, unauthenticated API (no key needed).
// One request per series via /events?series_ticker=X&status=open&with_nested_markets=true, which returns every
// open event of the series together with its markets (full market objects, dollar-string prices).
// Pure normalization helpers are exported for unit tests; fetchKalshi() never throws.

const BASE = "https://api.elections.kalshi.com/trade-api/v2";
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;
const PRICE_HORIZON_DAYS = 45;
const MAX_PER_TOPIC = 6;
const MAX_LADDER_OUTCOMES = 15;
// Kalshi's public tier allows roughly 10 req/s; a 22-request burst gets 429s. Pool the requests and retry on 429.
const CONCURRENCY = 4;
const RETRY_DELAYS_MS = [400, 900, 1600];

// ---------- Raw Kalshi shapes (only the fields we read) ----------

export interface KalshiRawMarket {
  ticker: string;
  event_ticker: string;
  title?: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  status?: string;
  close_time?: string;
  expiration_time?: string;
  strike_type?: string; // "greater" | "less" | "between" | "custom" | ...
  floor_strike?: number;
  cap_strike?: number;
  custom_strike?: Record<string, string>;
  // Prices: newer responses carry dollar strings (0..1); older ones carry integer cents (0..100).
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  yes_bid?: number;
  yes_ask?: number;
  last_price?: number;
  volume_fp?: string;
  volume?: number;
  volume_24h_fp?: string;
  open_interest_fp?: string;
  open_interest?: number;
  liquidity_dollars?: string;
  liquidity?: number;
}

export interface KalshiRawEvent {
  event_ticker: string;
  series_ticker: string;
  title?: string;
  sub_title?: string;
  strike_date?: string;
  mutually_exclusive?: boolean;
  markets?: KalshiRawMarket[];
}

// ---------- Series mapping ----------

type SeriesKind =
  | "fed_decision" // mutually exclusive Hold/Hike/Cut buckets per meeting
  | "ladder" // one event = many above/below strikes (price ladders, CPI/NFP/U3 buckets, fed rate levels)
  | "binary" // one event = one yes/no market
  | "exclusive"; // mutually exclusive non-fed buckets (e.g. recession start quarter)

export interface SeriesSpec {
  series: string;
  // slug of the series title as used by kalshi.com URLs
  slug: string;
  topic: PMTopic;
  kind: SeriesKind;
  eventDefId: string | null;
  asset: MacroAsset | null;
  // "next": keep the next N events by date; "horizon": keep events closing within PRICE_HORIZON_DAYS
  select: "next" | "horizon";
  maxEvents: number;
  // how to derive `period`: date of strike/close (YYYY-MM-DD), month from event ticker (YYYY-MM), or year
  period: "date" | "month" | "year" | null;
  // multiplier applied to numeric strikes to produce outcome.value (fed levels: % -> bps)
  valueScale?: number;
}

export const SERIES_SPECS: SeriesSpec[] = [
  { series: "KXFEDDECISION", slug: "fed-meeting", topic: "fed_decision", kind: "fed_decision", eventDefId: "fed_funds", asset: null, select: "next", maxEvents: 2, period: "date" },
  { series: "KXFED", slug: "fed-funds-rate", topic: "fed_rate_level", kind: "ladder", eventDefId: "fed_funds", asset: null, select: "next", maxEvents: 2, period: "date", valueScale: 100 },
  { series: "KXFEDFUNDSYEAR", slug: "fed-funds-rate-at-year-end", topic: "fed_rate_level", kind: "ladder", eventDefId: "fed_funds", asset: null, select: "next", maxEvents: 1, period: "date", valueScale: 100 },
  { series: "KXRATECUT", slug: "fed-rate-cut", topic: "fed_cuts_year", kind: "binary", eventDefId: "fed_funds", asset: null, select: "next", maxEvents: 1, period: "year" },
  { series: "KXCPI", slug: "cpi", topic: "cpi", kind: "ladder", eventDefId: "cpi_mom", asset: null, select: "next", maxEvents: 2, period: "month" },
  { series: "KXCPIYOY", slug: "inflation", topic: "cpi", kind: "ladder", eventDefId: "cpi_yoy", asset: null, select: "next", maxEvents: 2, period: "month" },
  { series: "KXCPICORE", slug: "cpi-core", topic: "cpi", kind: "ladder", eventDefId: "core_cpi_mom", asset: null, select: "next", maxEvents: 1, period: "month" },
  { series: "KXCPICOREYOY", slug: "core-inflation", topic: "cpi", kind: "ladder", eventDefId: "core_cpi_yoy", asset: null, select: "next", maxEvents: 1, period: "month" },
  { series: "KXPAYROLLS", slug: "jobs-numbers", topic: "nfp", kind: "ladder", eventDefId: "nfp", asset: null, select: "next", maxEvents: 2, period: "month" },
  { series: "KXU3", slug: "unemployment", topic: "unemployment", kind: "ladder", eventDefId: "unemployment", asset: null, select: "next", maxEvents: 2, period: "month" },
  { series: "KXRECSSNBER", slug: "recession", topic: "recession", kind: "binary", eventDefId: "recession", asset: null, select: "next", maxEvents: 2, period: "year" },
  { series: "KXNBERRECESSQ", slug: "next-recession-start", topic: "recession", kind: "exclusive", eventDefId: "recession", asset: null, select: "next", maxEvents: 1, period: null },
  { series: "KXBTCD", slug: "bitcoin-price-abovebelow", topic: "btc_price", kind: "ladder", eventDefId: null, asset: "BTC", select: "horizon", maxEvents: 4, period: "date" },
  { series: "KXBTCMAXMON", slug: "bitcoin-monthly-one-touch", topic: "btc_price", kind: "ladder", eventDefId: null, asset: "BTC", select: "horizon", maxEvents: 1, period: "date" },
  { series: "KXBTCMINMON", slug: "btc-one-touch-minimum", topic: "btc_price", kind: "ladder", eventDefId: null, asset: "BTC", select: "horizon", maxEvents: 1, period: "date" },
  { series: "KXGOLDD", slug: "gold-daily", topic: "gold_price", kind: "ladder", eventDefId: null, asset: "GOLD", select: "horizon", maxEvents: 2, period: "date" },
  { series: "KXGOLDW", slug: "gold-weekly-price", topic: "gold_price", kind: "ladder", eventDefId: null, asset: "GOLD", select: "horizon", maxEvents: 2, period: "date" },
  { series: "KXGOLDMON", slug: "gold-monthly-price", topic: "gold_price", kind: "ladder", eventDefId: null, asset: "GOLD", select: "horizon", maxEvents: 2, period: "date" },
  { series: "KXWTI", slug: "wti-oil-on-day", topic: "oil_price", kind: "ladder", eventDefId: null, asset: "WTI", select: "horizon", maxEvents: 2, period: "date" },
  { series: "KXWTIW", slug: "wti-oil-weekly-range", topic: "oil_price", kind: "ladder", eventDefId: null, asset: "WTI", select: "horizon", maxEvents: 2, period: "date" },
  { series: "KXWTIMAX", slug: "wti-oil-high", topic: "oil_price", kind: "ladder", eventDefId: null, asset: "WTI", select: "horizon", maxEvents: 1, period: "date" },
  { series: "KXWTIMIN", slug: "wti-oil-low", topic: "oil_price", kind: "ladder", eventDefId: null, asset: "WTI", select: "horizon", maxEvents: 1, period: "date" },
];

// ---------- Pure helpers ----------

function parseDollarOrCents(dollars: string | undefined, cents: number | undefined): number | null {
  if (typeof dollars === "string" && dollars.trim() !== "") {
    const n = Number(dollars);
    if (Number.isFinite(n)) return n;
  }
  if (typeof cents === "number" && Number.isFinite(cents)) return cents / 100;
  return null;
}

function parseFp(fp: string | undefined, int: number | undefined): number | null {
  if (typeof fp === "string" && fp.trim() !== "") {
    const n = Number(fp);
    if (Number.isFinite(n)) return n;
  }
  if (typeof int === "number" && Number.isFinite(int)) return int;
  return null;
}

/** Implied Yes probability: mid of bid/ask when both > 0, else last trade price. Clamped to 0..1. */
export function impliedProb(m: KalshiRawMarket): number {
  const bid = parseDollarOrCents(m.yes_bid_dollars, m.yes_bid);
  const ask = parseDollarOrCents(m.yes_ask_dollars, m.yes_ask);
  let p: number | null = null;
  if (bid !== null && ask !== null && bid > 0 && ask > 0) p = (bid + ask) / 2;
  else p = parseDollarOrCents(m.last_price_dollars, m.last_price);
  if (p === null) p = 0;
  return Math.min(1, Math.max(0, Math.round(p * 10000) / 10000));
}

export function marketVolume(m: KalshiRawMarket): number | null {
  return parseFp(m.volume_fp, m.volume);
}

export function marketOpenInterest(m: KalshiRawMarket): number | null {
  return parseFp(m.open_interest_fp, m.open_interest);
}

/** Threshold of an above/below/between market (floor for "greater"/"between", cap for "less"). */
export function marketThreshold(m: KalshiRawMarket): number | null {
  if (m.strike_type === "less") return typeof m.cap_strike === "number" ? m.cap_strike : null;
  if (typeof m.floor_strike === "number") return m.floor_strike;
  if (typeof m.cap_strike === "number") return m.cap_strike;
  return null;
}

export function marketSide(m: KalshiRawMarket): "above" | "below" | null {
  if (m.strike_type === "greater") return "above";
  if (m.strike_type === "less") return "below";
  return null;
}

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/** "KXCPI-26OCT" -> "2026-10"; "KXCPI-26OCT-T0.3" -> "2026-10". Null when no YYMON token present. */
export function monthFromTicker(ticker: string): string | null {
  const mt = ticker.match(/-(\d{2})([A-Z]{3})(?:\d{0,4})?(?:-|$)/);
  if (!mt) return null;
  const mm = MONTHS[mt[2]];
  if (!mm) return null;
  return `20${mt[1]}-${mm}`;
}

/** "KXRECSSNBER-27" -> "2027"; "KXRATECUT-26DEC31" -> "2026". */
export function yearFromTicker(ticker: string): string | null {
  const mt = ticker.match(/-(\d{2})(?:[A-Z]{3}\d{0,4})?(?:-|$)/);
  return mt ? `20${mt[1]}` : null;
}

function isoDate(s: string | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function isOpenMarket(m: KalshiRawMarket): boolean {
  return !m.status || m.status === "open" || m.status === "active";
}

/** Date the event resolves on: strike_date if present, else earliest close_time among still-open markets. */
export function eventDate(ev: KalshiRawEvent): string | null {
  if (ev.strike_date) {
    const t = new Date(ev.strike_date).getTime();
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  const closes = (ev.markets ?? [])
    .filter(isOpenMarket)
    .map((m) => (m.close_time ? new Date(m.close_time).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));
  if (closes.length === 0) return null;
  return new Date(Math.min(...closes)).toISOString();
}

export function buildUrl(spec: SeriesSpec, eventTicker: string): string {
  return `https://kalshi.com/markets/${spec.series.toLowerCase()}/${spec.slug}/${eventTicker.toLowerCase()}`;
}

/** Fed decision buckets from custom_strike: {Hike:"0"} Hold, {Hike:"25"} +25, {Hike:">25"} +50, {Cut:"25"} -25, {Cut:">25"} -50. */
export function fedBucket(m: KalshiRawMarket): { label: string; value: number } | null {
  const cs = m.custom_strike ?? {};
  const t = m.ticker.toUpperCase();
  if ("Hike" in cs || /-H\d+$/.test(t)) {
    const raw = cs.Hike ?? t.slice(t.lastIndexOf("-H") + 2);
    if (raw === "0") return { label: "Hold", value: 0 };
    if (raw.startsWith(">")) return { label: "Hike 50bps+", value: 50 };
    const n = Number(raw);
    return Number.isFinite(n) ? { label: `Hike ${n}bps`, value: n } : null;
  }
  if ("Cut" in cs || /-C\d+$/.test(t)) {
    const raw = cs.Cut ?? t.slice(t.lastIndexOf("-C") + 2);
    if (raw.startsWith(">")) return { label: "Cut 50bps+", value: -50 };
    const n = Number(raw);
    return Number.isFinite(n) ? { label: `Cut ${n}bps`, value: -n } : null;
  }
  return null;
}

const FED_ORDER = (v: number) => -v; // Hike 50+, Hike 25, Hold, Cut 25, Cut 50+

function sumNullable(xs: (number | null)[]): number | null {
  const vals = xs.filter((x): x is number => x !== null);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100 : null;
}

/** Trim a long ladder to the informative middle: drop strikes with prob outside (0.01, 0.99) when there are many. */
export function trimLadder(outcomes: PMOutcome[], max = MAX_LADDER_OUTCOMES): PMOutcome[] {
  if (outcomes.length <= max) return outcomes;
  const informative = outcomes.filter((o) => o.prob > 0.01 && o.prob < 0.99);
  const pool = informative.length >= 2 ? informative : outcomes;
  if (pool.length <= max) return pool;
  // keep the `max` outcomes centered around the 50% crossing
  let pivot = pool.findIndex((o) => o.prob <= 0.5);
  if (pivot < 0) pivot = Math.floor(pool.length / 2);
  const start = Math.max(0, Math.min(pool.length - max, pivot - Math.floor(max / 2)));
  return pool.slice(start, start + max);
}

function periodFor(spec: SeriesSpec, ev: KalshiRawEvent, date: string | null): string | null {
  switch (spec.period) {
    case "date":
      return date ? date.slice(0, 10) : null;
    case "month":
      return monthFromTicker(ev.event_ticker);
    case "year":
      return yearFromTicker(ev.event_ticker);
    default:
      return null;
  }
}

/** Normalize one Kalshi event (with nested markets) into a PMMarket. Returns null when nothing usable. */
export function normalizeEvent(spec: SeriesSpec, ev: KalshiRawEvent, retrievedAt: string): PMMarket | null {
  const markets = (ev.markets ?? []).filter(isOpenMarket);
  if (markets.length === 0) return null;
  const date = eventDate(ev);
  const base = {
    venue: "kalshi" as const,
    id: ev.event_ticker,
    topic: spec.topic,
    title: ev.title?.trim() || markets[0].title || ev.event_ticker,
    url: buildUrl(spec, ev.event_ticker),
    closeTime: date,
    volume: sumNullable(markets.map(marketVolume)),
    liquidity: sumNullable(markets.map(marketOpenInterest)),
    eventDefId: spec.eventDefId,
    asset: spec.asset,
    strike: null as number | null,
    strikeSide: null as "above" | "below" | null,
    period: periodFor(spec, ev, date),
    retrievedAt,
  };

  if (spec.kind === "fed_decision") {
    const outcomes: PMOutcome[] = [];
    for (const m of markets) {
      const b = fedBucket(m);
      if (!b) continue;
      outcomes.push({ label: b.label, prob: impliedProb(m), value: b.value, marketId: m.ticker, volume: marketVolume(m) });
    }
    if (outcomes.length === 0) return null;
    outcomes.sort((a, b) => FED_ORDER(a.value ?? 0) - FED_ORDER(b.value ?? 0));
    return { ...base, outcomes };
  }

  if (spec.kind === "binary" || (spec.kind === "ladder" && markets.length === 1)) {
    const m = markets[0];
    const p = impliedProb(m);
    const thr = marketThreshold(m);
    const side = marketSide(m);
    const yesLabel = m.yes_sub_title && m.yes_sub_title !== "Yes" ? `Yes (${m.yes_sub_title})` : "Yes";
    return {
      ...base,
      id: spec.kind === "binary" ? m.ticker : ev.event_ticker,
      title: m.title || base.title,
      closeTime: m.close_time ? new Date(m.close_time).toISOString() : base.closeTime,
      strike: spec.asset && thr !== null ? thr : null,
      strikeSide: spec.asset && thr !== null ? side : null,
      outcomes: [
        { label: yesLabel, prob: p, value: thr, marketId: m.ticker, volume: marketVolume(m) },
        { label: "No", prob: Math.round((1 - p) * 10000) / 10000, value: thr, marketId: m.ticker, volume: marketVolume(m) },
      ],
    };
  }

  // ladder / exclusive: one outcome per market
  const scale = spec.valueScale ?? 1;
  let outcomes: PMOutcome[] = markets.map((m) => {
    const thr = marketThreshold(m);
    return {
      label: m.yes_sub_title?.trim() || m.subtitle?.trim() || m.title || m.ticker,
      prob: impliedProb(m),
      value: thr === null ? null : Math.round(thr * scale * 1e6) / 1e6,
      marketId: m.ticker,
      volume: marketVolume(m),
    };
  });
  if (spec.kind === "ladder") {
    const allBelow = markets.every((m) => m.strike_type === "less");
    outcomes.sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
    // "Above X" ladders have decreasing prob with value; "Below X" ladders increasing. Normalize so prob descends.
    if (allBelow) outcomes.reverse();
    outcomes = trimLadder(outcomes);
  }
  return { ...base, outcomes };
}

/** Pick which events of a series to keep (next N by date, or those within the price horizon), then normalize. */
export function normalizeSeries(spec: SeriesSpec, events: KalshiRawEvent[], now: Date, retrievedAt: string): PMMarket[] {
  const nowMs = now.getTime();
  const dated = events
    .map((ev) => ({ ev, t: new Date(eventDate(ev) ?? NaN).getTime() }))
    .filter((x) => !Number.isNaN(x.t) && x.t > nowMs)
    .sort((a, b) => a.t - b.t);

  let chosen = dated;
  if (spec.select === "horizon") {
    const limit = nowMs + PRICE_HORIZON_DAYS * 86_400_000;
    chosen = dated.filter((x) => x.t <= limit);
    // prefer higher-volume events when over the cap
    chosen = chosen
      .map((x) => ({ ...x, v: sumNullable((x.ev.markets ?? []).map(marketVolume)) ?? 0 }))
      .sort((a, b) => b.v - a.v)
      .slice(0, spec.maxEvents)
      .sort((a, b) => a.t - b.t);
  } else {
    chosen = dated.slice(0, spec.maxEvents);
  }
  const out: PMMarket[] = [];
  for (const { ev } of chosen) {
    const pm = normalizeEvent(spec, ev, retrievedAt);
    if (pm) out.push(pm);
  }
  return out;
}

/** Enforce the per-topic cap for price topics (prefer higher volume), keep macro topics as-is. */
export function capPerTopic(markets: PMMarket[], max = MAX_PER_TOPIC): PMMarket[] {
  const priceTopics = new Set<PMTopic>(["btc_price", "eth_price", "gold_price", "oil_price"]);
  const byTopic = new Map<PMTopic, PMMarket[]>();
  for (const m of markets) {
    const arr = byTopic.get(m.topic) ?? [];
    arr.push(m);
    byTopic.set(m.topic, arr);
  }
  const out: PMMarket[] = [];
  for (const [topic, arr] of byTopic) {
    if (!priceTopics.has(topic) || arr.length <= max) {
      out.push(...arr);
      continue;
    }
    out.push(
      ...arr
        .slice()
        .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
        .slice(0, max)
        .sort((a, b) => (a.closeTime ?? "").localeCompare(b.closeTime ?? "")),
    );
  }
  return out;
}

// ---------- Network ----------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchJson<T>(url: string): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1] + Math.random() * 200);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" }, cache: "no-store" });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      // aborts/network errors: retry too
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function fetchSeriesEvents(series: string): Promise<KalshiRawEvent[]> {
  const url = `${BASE}/events?series_ticker=${encodeURIComponent(series)}&status=open&with_nested_markets=true&limit=200`;
  const data = await fetchJson<{ events?: KalshiRawEvent[] }>(url);
  return Array.isArray(data.events) ? data.events : [];
}

/** Run tasks with bounded concurrency, preserving order of results. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

type SeriesOutcome =
  | { spec: SeriesSpec; ok: true; markets: PMMarket[] }
  | { spec: SeriesSpec; ok: false; error: string };

let cache: { at: number; result: PMAdapterResult } | null = null;
// Last successful normalization per series, so one 429 does not drop a whole topic from the response.
const lastGoodBySeries = new Map<string, PMMarket[]>();

export async function fetchKalshi(): Promise<PMAdapterResult> {
  const nowMs = Date.now();
  if (cache && nowMs - cache.at < CACHE_TTL_MS) return cache.result;

  const retrievedAt = new Date(nowMs).toISOString();
  const now = new Date(nowMs);
  try {
    const settled = await pool(SERIES_SPECS, CONCURRENCY, async (spec): Promise<SeriesOutcome> => {
      try {
        const events = await fetchSeriesEvents(spec.series);
        const markets = normalizeSeries(spec, events, now, retrievedAt);
        lastGoodBySeries.set(spec.series, markets);
        return { spec, ok: true, markets };
      } catch (err) {
        return { spec, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });
    const okCount = settled.filter((s) => s.ok).length;
    const failed = settled.filter((s) => !s.ok).map((s) => s.spec.series);
    const markets = capPerTopic(
      settled.flatMap((s) => (s.ok ? s.markets : (lastGoodBySeries.get(s.spec.series) ?? []))),
    );

    if (okCount === 0) {
      const note = `Kalshi: all ${SERIES_SPECS.length} series requests failed` + (cache ? "; serving cached list" : "");
      return {
        venue: "kalshi",
        ok: false,
        note,
        markets: cache?.result.markets ?? [],
        retrievedAt: cache?.result.retrievedAt ?? retrievedAt,
      };
    }
    const note =
      failed.length === 0
        ? `Kalshi: ${markets.length} markets from ${okCount} series`
        : `Kalshi: ${markets.length} markets from ${okCount}/${SERIES_SPECS.length} series (failed: ${failed.join(", ")})`;
    const result: PMAdapterResult = { venue: "kalshi", ok: true, note, markets, retrievedAt };
    cache = { at: nowMs, result };
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      venue: "kalshi",
      ok: false,
      note: `Kalshi adapter error: ${msg}` + (cache ? "; serving cached list" : ""),
      markets: cache?.result.markets ?? [],
      retrievedAt: cache?.result.retrievedAt ?? retrievedAt,
    };
  }
}

/** Test hook: clear module cache. */
export function __resetKalshiCache(): void {
  cache = null;
  lastGoodBySeries.clear();
}
