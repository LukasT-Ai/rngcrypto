import type { MacroAsset } from "../macro/types";
import type { PMAdapterResult, PMMarket, PMOutcome, PMTopic } from "./types";

// Polymarket adapter. Public Gamma API, no key required. Pulls a handful of tag/search listings in parallel,
// classifies each event into a PMTopic by slug/title, and normalizes the event's binary sub-markets into one
// PMMarket with multiple outcomes (Yes price of each sub-market = probability of that bucket).
// Never throws: on failure it returns the last cached list (or []).

const GAMMA = "https://gamma-api.polymarket.com";
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;
const DAY_MS = 86_400_000;
const DEFAULT_HORIZON_DAYS = 45;
const MAX_PER_TOPIC = 6;
const MAX_FED_MEETINGS = 2;

// ---------- Raw Gamma shapes (only the fields we read) ----------

export interface GammaMarket {
  id?: string | number;
  conditionId?: string;
  question?: string;
  groupItemTitle?: string;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  bestBid?: number | string | null;
  bestAsk?: number | string | null;
  volume?: number | string | null;
  liquidity?: number | string | null;
  endDate?: string | null;
  closed?: boolean;
  active?: boolean;
}

export interface GammaEvent {
  id?: string | number;
  slug?: string;
  title?: string;
  endDate?: string | null;
  volume?: number | string | null;
  liquidity?: number | string | null;
  closed?: boolean;
  active?: boolean;
  markets?: GammaMarket[];
}

// ---------- Pure helpers (exported for unit tests) ----------

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Gamma returns `outcomes` / `outcomePrices` as JSON-encoded string arrays ('["Yes","No"]'); tolerate real arrays too.
export function parseJsonArray(v: string | string[] | undefined | null): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// Implied probability of the Yes outcome: mid of bestBid/bestAsk when both are present (and Yes is the first
// outcome, which is what the book refers to), else the Yes entry of outcomePrices. Null when nothing is parseable.
export function yesProbability(m: GammaMarket): number | null {
  const outcomes = parseJsonArray(m.outcomes);
  const prices = parseJsonArray(m.outcomePrices).map((p) => toNum(p));
  let yesIdx = outcomes.findIndex((o) => o.trim().toLowerCase() === "yes");
  if (yesIdx < 0) yesIdx = 0;

  const bid = toNum(m.bestBid);
  const ask = toNum(m.bestAsk);
  if (yesIdx === 0 && bid !== null && ask !== null && bid > 0 && ask > 0 && ask >= bid) {
    return clamp01((bid + ask) / 2);
  }
  const p = prices[yesIdx];
  if (p === null || p === undefined) return null;
  return clamp01(p);
}

function clamp01(x: number): number {
  return Math.round(Math.min(1, Math.max(0, x)) * 10_000) / 10_000;
}

// "$150,000" -> 150000, "150k" -> 150000, "$4,000" -> 4000, "$70" -> 70, "↑ 92,500" -> 92500, "$1.5k" -> 1500.
// Returns null when no money-like number is present (so "October 7" or "by December 31, 2026" yield null).
export function parseStrike(text: string | undefined | null): number | null {
  if (!text) return null;
  const s = String(text);
  const dollar = s.match(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\b/);
  const kSuffix = s.match(/(?<![\d.])(\d[\d,]*(?:\.\d+)?)\s*([kK])\b/);
  const comma = s.match(/(?<![\d.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?)(?![\d,])/);
  const m = dollar ?? kSuffix ?? comma;
  if (!m) return null;
  const base = toNum(m[1]);
  if (base === null) return null;
  const suffix = (m[2] ?? "").toLowerCase();
  const mult = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1;
  return base * mult;
}

// Direction of the Yes outcome relative to the strike. "hit"/"reach"/"above" -> above; "dip"/"below"/"(LOW)" -> below.
export function parseStrikeSide(text: string | undefined | null): "above" | "below" | null {
  if (!text) return null;
  const s = String(text).toLowerCase();
  if (/\(low\)|\bdip\b|\bbelow\b|\bunder\b|\bor lower\b|\bless than\b|↓/.test(s)) return "below";
  if (/\(high\)|\babove\b|\breach\b|\bhit\b|\bover\b|\bexceed\b|\bor higher\b|\bmore than\b|↑/.test(s)) return "above";
  return null;
}

// "≤0.0%" -> 0, "0.6%+" -> 0.6, "3.5%" -> 3.5, "≥ 4.5%" -> 4.5, "↑ 5.0%" -> 5, "1.25" -> 1.25
export function parsePercent(text: string | undefined | null): number | null {
  if (!text) return null;
  const m = String(text).match(/(-?\d+(?:\.\d+)?)\s*%?/);
  return m ? toNum(m[1]) : null;
}

// Jobs buckets: "<-25k" -> -25000, "-25k to 0" -> -25000, "0 to 25k" -> 0, "100k+" -> 100000 (lower edge of bucket).
export function parseJobsBucket(text: string | undefined | null): number | null {
  if (!text) return null;
  const m = String(text).match(/(-?\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!m) return null;
  const base = toNum(m[1]);
  if (base === null) return null;
  const suffix = (m[2] ?? "").toLowerCase();
  return base * (suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1);
}

// FOMC meeting buckets. "25 bps decrease" -> Cut 25bps (-25), "No change" -> Hold (0), "50+ bps increase" -> Hike 50+bps (+50).
export function fedBucket(groupItemTitle: string | undefined | null, question?: string | null): { label: string; value: number | null } {
  const raw = (groupItemTitle && groupItemTitle.trim()) || question || "";
  const s = raw.toLowerCase();
  if (/no change|unchanged|hold/.test(s)) return { label: "Hold", value: 0 };
  const bps = s.match(/(\d+)\s*(\+)?\s*bps/);
  const n = bps ? Number(bps[1]) : null;
  const plus = bps && bps[2] ? "+" : "";
  if (/decrease|cut|lower/.test(s)) return { label: n !== null ? `Cut ${n}${plus}bps` : "Cut", value: n !== null ? -n : null };
  if (/increase|hike|raise/.test(s)) return { label: n !== null ? `Hike ${n}${plus}bps` : "Hike", value: n };
  return { label: raw.trim() || "Unknown", value: n };
}

// "How many Fed rate cuts" buckets: "0 (0 bps)" -> 0 cuts / 0, "1 (25 bps)" -> 1 cut / 25, "12+ (300+ bps)" -> 12+ cuts / 300.
export function fedCutsBucket(groupItemTitle: string | undefined | null, question?: string | null): { label: string; value: number | null } {
  const raw = (groupItemTitle && groupItemTitle.trim()) || question || "";
  const count = raw.match(/(\d+)\s*(\+)?/);
  const n = count ? Number(count[1]) : null;
  const plus = count && count[2] ? "+" : "";
  const bps = raw.match(/(\d+)\s*\+?\s*bps/i);
  const value = bps ? Number(bps[1]) : n !== null ? n * 25 : null;
  if (n === null) return { label: raw || "Unknown", value };
  return { label: `${n}${plus} ${n === 1 && !plus ? "cut" : "cuts"}`, value };
}

// Fed rate level buckets ("↑ 5.0%", "↓ 2.0%", "≥ 4.5%", "4.25%", "≤1.0%") -> label + basis points.
export function fedLevelBucket(groupItemTitle: string | undefined | null, question?: string | null): { label: string; value: number | null } {
  const raw = (groupItemTitle && groupItemTitle.trim()) || question || "";
  const pct = parsePercent(raw);
  const value = pct === null ? null : Math.round(pct * 100);
  const pctLabel = pct === null ? raw : `${pct.toFixed(2)}%`;
  if (/↑|≥|>=|or higher/.test(raw)) return { label: `≥ ${pctLabel}`, value };
  if (/↓|≤|<=|or lower/.test(raw)) return { label: `≤ ${pctLabel}`, value };
  return { label: pctLabel, value };
}

// Gamma endDate is the UTC instant the market closes; Polymarket dates these at ~midnight US Eastern. Shift by -5h so
// "2026-10-29T03:59:00Z" (Oct 28 23:59 ET) reports the calendar day the market is really about: 2026-10-28.
export function periodFromEndDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const h = d.getUTCHours();
  // 03:59Z..05:00Z = Polymarket "midnight Eastern"; shift 6h to land on the previous calendar day. Other times (00:00Z, 16:00Z, ...) are already the intended day.
  const shifted = h >= 3 && h <= 5 ? new Date(t - 6 * 3_600_000) : d;
  return shifted.toISOString().slice(0, 10);
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// "Core CPI MoM - September 2026" -> "2026-09"; "September Inflation US - Annual" (ending 2026-10-15) -> "2026-09".
export function parseMonthPeriod(text: string | undefined | null, endDateIso?: string | null): string | null {
  if (!text) return null;
  const s = String(text).toLowerCase();
  const idx = MONTHS.findIndex((m) => new RegExp(`\\b${m}\\b`).test(s));
  if (idx < 0) return null;
  const explicitYear = s.match(/\b(20\d{2})\b/);
  let year: number | null = explicitYear ? Number(explicitYear[1]) : null;
  if (year === null && endDateIso) {
    const end = new Date(Date.parse(endDateIso));
    if (Number.isFinite(end.getTime())) {
      year = end.getUTCFullYear();
      if (idx > end.getUTCMonth()) year -= 1; // a December print resolving in January
    }
  }
  if (year === null) return null;
  return `${year}-${String(idx + 1).padStart(2, "0")}`;
}

const NON_US = /\b(japan|uk|u\.k\.|china|eurozone|euro area|brazil|india|mexico|argentina|south africa|south korea|canada|australia|germany|france|italy|spain|turkey|russia|ecb|bank of england|boj|rba|boc)\b/i;

export type PriceTopic = Extract<PMTopic, "btc_price" | "eth_price" | "gold_price" | "oil_price">;

const PRICE_EXCLUDE = /up or down|all[- ]time high|\bvs\.?\b|volatility|dominance|best month|outperform|satoshi|eth\/btc|ethbtc|when will|market cap|\bfirst\b|unban|etf|strategy|microstrategy|bitmine|robinhood|opec|natural gas|production|reserve|treasury/i;

export function detectPriceTopic(title: string): PriceTopic | null {
  const t = title.toLowerCase().replace(/_+/g, " "); // "hit__ by end of December" -> "hit by end of December"
  if (PRICE_EXCLUDE.test(t)) return null;
  if (!/\b(hit|above|reach|close|closes|dip|below)\b/.test(t)) return null;
  if (/\bbitcoin\b|\bbtc\b/.test(t)) return "btc_price";
  if (/\bethereum\b|\beth\b/.test(t)) return "eth_price";
  if (/\bgold\b|xauusd/.test(t)) return "gold_price";
  if (/\bwti\b|crude oil/.test(t)) return "oil_price";
  return null;
}

export function classifyEvent(slug: string | undefined, title: string | undefined): PMTopic | null {
  const s = (slug ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  if (/^fed-decision-in-/.test(s)) return "fed_decision";
  if (/^how-many-fed-rate-cuts-in-/.test(s)) return "fed_cuts_year";
  if (/^what-will-fed-rate-hit-before-|^what-will-the-fed-rate-be-at-the-end-of-/.test(s)) return "fed_rate_level";
  if (/^us-recession-/.test(s) || /^us recession/.test(t)) return "recession";
  if (NON_US.test(t)) return null;
  if (/^core-cpi-(mom|yoy)-/.test(s) || /-inflation-us-(annual|monthly)$/.test(s) || /\bcpi\b/.test(t)) return "cpi";
  if (/jobs-added/.test(s) || /jobs added|nonfarm|payroll/.test(t)) return "nfp";
  if (/^[a-z]+-unemployment-rate-\d{4}/.test(s) || /^[a-z]+ unemployment rate$/.test(t)) return "unemployment";
  return detectPriceTopic(title ?? "");
}

const PRICE_ASSET: Record<PriceTopic, MacroAsset | null> = {
  btc_price: "BTC",
  eth_price: null, // ETH is not a MacroAsset in this app
  gold_price: "GOLD",
  oil_price: "WTI",
};

function fmtUsd(n: number): string {
  if (n >= 1_000 && Number.isInteger(n)) return `$${n.toLocaleString("en-US")}`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

// Open, priced sub-markets de-duplicated by bucket label (Polymarket sometimes re-lists a bucket; keep the highest-volume open one).
export function openMarkets(ev: GammaEvent): GammaMarket[] {
  const byKey = new Map<string, GammaMarket>();
  for (const m of ev.markets ?? []) {
    if (m.closed) continue;
    if (yesProbability(m) === null) continue;
    const key = (m.groupItemTitle && m.groupItemTitle.trim()) || m.question || String(m.id ?? "");
    const prev = byKey.get(key);
    if (!prev || (toNum(m.volume) ?? 0) > (toNum(prev.volume) ?? 0)) byKey.set(key, m);
  }
  return [...byKey.values()];
}

function baseMarket(ev: GammaEvent, topic: PMTopic, retrievedAt: string): Omit<PMMarket, "outcomes" | "eventDefId" | "asset" | "strike" | "strikeSide" | "period"> {
  const slug = ev.slug ?? String(ev.id ?? "");
  return {
    venue: "polymarket",
    id: slug,
    topic,
    title: (ev.title ?? slug).trim(),
    url: `https://polymarket.com/event/${slug}`,
    closeTime: ev.endDate ?? null,
    volume: toNum(ev.volume),
    liquidity: toNum(ev.liquidity),
    retrievedAt,
  };
}

function bucketOutcomes(ms: GammaMarket[], toBucket: (git: string | undefined, q: string | undefined) => { label: string; value: number | null }): PMOutcome[] {
  const out: PMOutcome[] = [];
  for (const m of ms) {
    const prob = yesProbability(m);
    if (prob === null) continue;
    const { label, value } = toBucket(m.groupItemTitle, m.question);
    out.push({ label, prob, value, marketId: m.conditionId ?? String(m.id ?? ""), volume: toNum(m.volume) });
  }
  return sortByValue(out);
}

function sortByValue(out: PMOutcome[]): PMOutcome[] {
  return out.sort((a, b) => {
    const av = a.value ?? Number.POSITIVE_INFINITY;
    const bv = b.value ?? Number.POSITIVE_INFINITY;
    return av - bv;
  });
}

// Normalize one Gamma event into a PMMarket (or null if it is not something we track / has no open markets).
export function normalizeEvent(ev: GammaEvent, retrievedAt: string): PMMarket | null {
  const topic = classifyEvent(ev.slug, ev.title);
  if (!topic) return null;
  const ms = openMarkets(ev);
  if (ms.length === 0) return null;
  const base = baseMarket(ev, topic, retrievedAt);
  const slug = (ev.slug ?? "").toLowerCase();
  const title = ev.title ?? "";

  switch (topic) {
    case "fed_decision": {
      const outcomes = bucketOutcomes(ms, fedBucket);
      if (!outcomes.length) return null;
      return { ...base, outcomes, eventDefId: "fed_funds", asset: null, strike: null, strikeSide: null, period: periodFromEndDate(ev.endDate) };
    }
    case "fed_cuts_year": {
      const outcomes = bucketOutcomes(ms, fedCutsBucket);
      if (!outcomes.length) return null;
      const year = slug.match(/(20\d{2})/)?.[1] ?? periodFromEndDate(ev.endDate)?.slice(0, 4) ?? null;
      return { ...base, outcomes, eventDefId: "fed_funds", asset: null, strike: null, strikeSide: null, period: year ? `${year}-12` : null };
    }
    case "fed_rate_level": {
      const outcomes = bucketOutcomes(ms, fedLevelBucket);
      if (!outcomes.length) return null;
      return { ...base, outcomes, eventDefId: "fed_funds", asset: null, strike: null, strikeSide: null, period: periodFromEndDate(ev.endDate) };
    }
    case "recession": {
      const m = ms[0];
      const p = yesProbability(m) ?? 0;
      return {
        ...base,
        outcomes: [
          { label: "Yes", prob: p, marketId: m.conditionId ?? String(m.id ?? ""), volume: toNum(m.volume) },
          { label: "No", prob: clamp01(1 - p), marketId: m.conditionId ?? String(m.id ?? ""), volume: toNum(m.volume) },
        ],
        eventDefId: null,
        asset: null,
        strike: null,
        strikeSide: null,
        period: periodFromEndDate(ev.endDate),
      };
    }
    case "cpi": {
      const outcomes = bucketOutcomes(ms, (git, q) => ({ label: (git && git.trim()) || q || "?", value: parsePercent(git || q) }));
      if (!outcomes.length) return null;
      const isMom = /mom|monthly/.test(slug) || /\bmom\b|monthly/i.test(title);
      return { ...base, outcomes, eventDefId: isMom ? "cpi_mom" : "cpi_yoy", asset: null, strike: null, strikeSide: null, period: parseMonthPeriod(title, ev.endDate) ?? parseMonthPeriod(slug, ev.endDate) };
    }
    case "nfp": {
      const outcomes = bucketOutcomes(ms, (git, q) => ({ label: (git && git.trim()) || q || "?", value: parseJobsBucket(git || q) }));
      if (!outcomes.length) return null;
      return { ...base, outcomes, eventDefId: "nfp", asset: null, strike: null, strikeSide: null, period: parseMonthPeriod(title, ev.endDate) ?? parseMonthPeriod(slug, ev.endDate) };
    }
    case "unemployment": {
      const outcomes = bucketOutcomes(ms, (git, q) => ({ label: (git && git.trim()) || q || "?", value: parsePercent(git || q) }));
      if (!outcomes.length) return null;
      return { ...base, outcomes, eventDefId: "unemployment", asset: null, strike: null, strikeSide: null, period: parseMonthPeriod(title, ev.endDate) ?? parseMonthPeriod(slug, ev.endDate) };
    }
    case "btc_price":
    case "eth_price":
    case "gold_price":
    case "oil_price":
      return normalizePriceEvent(ev, ms, topic, base);
    default:
      return null;
  }
}

function normalizePriceEvent(ev: GammaEvent, ms: GammaMarket[], topic: PriceTopic, base: ReturnType<typeof baseMarket>): PMMarket | null {
  const isHitLadder = /\b(hit|reach|dip)\b/i.test((ev.title ?? "").replace(/_+/g, " "));
  const rows: { m: GammaMarket; strike: number; side: "above" | "below"; prob: number }[] = [];
  for (const m of ms) {
    const strike = parseStrike(m.groupItemTitle) ?? parseStrike(m.question);
    const prob = yesProbability(m);
    if (strike === null || prob === null) continue;
    const side = parseStrikeSide(m.groupItemTitle) ?? parseStrikeSide(m.question) ?? "above";
    rows.push({ m, strike, side, prob });
  }
  if (!rows.length) return null;

  const labelFor = (side: "above" | "below", strike: number) =>
    isHitLadder ? `${side === "above" ? "Hit" : "Dip to"} ${fmtUsd(strike)}` : `${side === "above" ? "Above" : "Below"} ${fmtUsd(strike)}`;

  const common = { eventDefId: null, asset: PRICE_ASSET[topic], period: periodFromEndDate(ev.endDate) };

  if (rows.length === 1) {
    const r = rows[0];
    const mid = r.m.conditionId ?? String(r.m.id ?? "");
    return {
      ...base,
      ...common,
      outcomes: [
        { label: "Yes", prob: r.prob, value: r.strike, marketId: mid, volume: toNum(r.m.volume) },
        { label: "No", prob: clamp01(1 - r.prob), value: r.strike, marketId: mid, volume: toNum(r.m.volume) },
      ],
      strike: r.strike,
      strikeSide: r.side,
    };
  }

  const outcomes = sortByValue(
    rows.map((r) => ({
      label: labelFor(r.side, r.strike),
      prob: r.prob,
      value: r.strike,
      marketId: r.m.conditionId ?? String(r.m.id ?? ""),
      volume: toNum(r.m.volume),
    })),
  );
  const sides = new Set(rows.map((r) => r.side));
  return { ...base, ...common, outcomes, strike: null, strikeSide: sides.size === 1 ? rows[0].side : null };
}

// ---------- Selection (which events to keep per topic) ----------

const PRICE_TOPICS: ReadonlySet<PMTopic> = new Set(["btc_price", "eth_price", "gold_price", "oil_price"]);

function endOfYearMs(now: Date): number {
  return Date.UTC(now.getUTCFullYear() + 1, 0, 2); // Jan 2 of next year (Polymarket "by Dec 31" markets close Jan 1 ~05:00Z)
}

export function selectMarkets(all: PMMarket[], now: Date = new Date()): PMMarket[] {
  const nowMs = now.getTime();
  const horizonMs = nowMs + DEFAULT_HORIZON_DAYS * DAY_MS;
  const eoyMs = endOfYearMs(now);

  const byTopic = new Map<PMTopic, PMMarket[]>();
  const seen = new Set<string>();
  for (const m of all) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const end = m.closeTime ? Date.parse(m.closeTime) : NaN;
    if (Number.isFinite(end)) {
      if (end < nowMs) continue;
      const allowLong = m.topic === "fed_cuts_year" || m.topic === "fed_rate_level" || m.topic === "recession" || (PRICE_TOPICS.has(m.topic) && /\b(hit|reach)\b/i.test(m.title.replace(/_+/g, " ")));
      const limit = m.topic === "fed_decision" ? Number.POSITIVE_INFINITY : allowLong ? eoyMs : horizonMs;
      if (end > limit) continue;
    }
    const list = byTopic.get(m.topic) ?? [];
    list.push(m);
    byTopic.set(m.topic, list);
  }

  const out: PMMarket[] = [];
  for (const [topic, list] of byTopic) {
    if (topic === "fed_decision") {
      list.sort((a, b) => Date.parse(a.closeTime ?? "") - Date.parse(b.closeTime ?? ""));
      out.push(...list.slice(0, MAX_FED_MEETINGS));
    } else {
      list.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
      out.push(...list.slice(0, MAX_PER_TOPIC));
    }
  }

  const order: PMTopic[] = ["fed_decision", "fed_cuts_year", "fed_rate_level", "cpi", "nfp", "unemployment", "recession", "btc_price", "eth_price", "gold_price", "oil_price", "other"];
  return out.sort((a, b) => order.indexOf(a.topic) - order.indexOf(b.topic) || (b.volume ?? 0) - (a.volume ?? 0));
}

// ---------- Network ----------

type Source = { kind: "tag"; tag: string; limit: number } | { kind: "search"; q: string };

// Tags/queries that cover every topic. Discovered against the live Gamma API (Oct 2026):
//   fed-rates      -> fed-decision-in-*, how-many-fed-rate-cuts-in-*, what-will-fed-rate-hit-before-*, what-will-the-fed-rate-be-at-the-end-of-*
//   cpi            -> core-cpi-mom-*, core-cpi-yoy-*, *-inflation-us-annual/monthly (non-US filtered out)
//   jobs-report    -> how-many-jobs-added-in-*, *-unemployment-rate-*
//   hit-price      -> what-price-will-bitcoin/ethereum-hit-in-*, what-price-will-wti/xauusd-hit-in-*
//   multi-strikes  -> bitcoin/ethereum-above-on-<date>
//   commodities    -> what-will-gold-gc-hit-by-end-of-*, wti-closes-above-on-*, will-xauusd/wti-hit-week-of-*
//   search         -> us-recession-by-end-of-*, fed-decision-in-* (backup)
const SOURCES: Source[] = [
  { kind: "tag", tag: "fed-rates", limit: 25 },
  { kind: "tag", tag: "cpi", limit: 30 },
  { kind: "tag", tag: "jobs-report", limit: 15 },
  { kind: "tag", tag: "hit-price", limit: 40 },
  { kind: "tag", tag: "multi-strikes", limit: 30 },
  { kind: "tag", tag: "commodities", limit: 30 },
  { kind: "search", q: "US recession" },
  { kind: "search", q: "Fed decision" },
];

function sourceUrl(s: Source): string {
  if (s.kind === "tag") {
    return `${GAMMA}/events?active=true&closed=false&limit=${s.limit}&tag_slug=${encodeURIComponent(s.tag)}&order=volume&ascending=false`;
  }
  return `${GAMMA}/public-search?q=${encodeURIComponent(s.q)}&events_status=active&limit_per_type=20`;
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractEvents(payload: unknown): GammaEvent[] {
  if (Array.isArray(payload)) return payload as GammaEvent[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { events?: unknown }).events)) {
    return (payload as { events: GammaEvent[] }).events;
  }
  return [];
}

let cache: { at: number; markets: PMMarket[] } | null = null;

export async function fetchPolymarket(): Promise<PMAdapterResult> {
  const retrievedAt = new Date().toISOString();
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return { venue: "polymarket", ok: true, note: "cached", markets: cache.markets, retrievedAt };
  }

  try {
    const settled = await Promise.allSettled(SOURCES.map((s) => fetchJson(sourceUrl(s))));
    const events: GammaEvent[] = [];
    const failures: string[] = [];
    settled.forEach((r, i) => {
      const s = SOURCES[i];
      const name = s.kind === "tag" ? `tag:${s.tag}` : `search:${s.q}`;
      if (r.status === "fulfilled") events.push(...extractEvents(r.value).filter((e) => !e.closed));
      else failures.push(`${name} (${r.reason instanceof Error ? r.reason.message : String(r.reason)})`);
    });

    if (events.length === 0) {
      const note = `Polymarket: no events fetched${failures.length ? `; failed: ${failures.join(", ")}` : ""}`;
      return { venue: "polymarket", ok: false, note, markets: cache?.markets ?? [], retrievedAt };
    }

    const normalized: PMMarket[] = [];
    for (const ev of events) {
      try {
        const m = normalizeEvent(ev, retrievedAt);
        if (m) normalized.push(m);
      } catch {
        // skip malformed event
      }
    }
    const markets = selectMarkets(normalized, new Date(now));
    cache = { at: now, markets };
    const note = failures.length
      ? `Polymarket: ${markets.length} markets from ${events.length} events; partial failures: ${failures.join(", ")}`
      : `Polymarket: ${markets.length} markets from ${events.length} events`;
    return { venue: "polymarket", ok: true, note, markets, retrievedAt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { venue: "polymarket", ok: false, note: `Polymarket fetch failed: ${msg}`, markets: cache?.markets ?? [], retrievedAt };
  }
}
