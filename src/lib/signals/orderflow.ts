// Order flow: realized liquidations and resting order-book walls.
//
// Source is OKX public endpoints (no key, reachable from Railway; Binance is geo-blocked and Coinglass needs a
// paid key). OKX is one venue, so the numbers are a sample of the market, not the whole market. Every figure
// carries the window it actually covers so the UI never claims "24h" when the feed only reached 9h back.
//
// Pure helpers (summarizeLiquidations, findWalls) are exported for tests; fetchers wrap them with caching.

export type LiqSide = "long" | "short";

export interface LiqEvent {
  ts: number;
  side: LiqSide; // position side that was liquidated
  price: number;
  usd: number;
}

export interface LiqBucket {
  longUsd: number;
  shortUsd: number;
  longN: number;
  shortN: number;
}

export interface LiqCluster {
  price: number; // bucket mid
  usd: number;
  side: LiqSide; // dominant side in the bucket
  longUsd: number;
  shortUsd: number;
  distancePct: number; // from mark; negative = below
}

export interface LiquidationSummary {
  venue: "OKX";
  windowHours: number; // hours actually covered by the sample
  truncated: boolean; // true if we hit the page cap before reaching 24h
  h1: LiqBucket;
  h4: LiqBucket;
  window: LiqBucket; // everything we have (<= 24h)
  largest: LiqEvent | null;
  clusters: LiqCluster[]; // top price zones where positions were flushed
  tape: LiqEvent[]; // most recent events
  dominant: LiqSide | null; // side taking >= 65% of window USD
  longPct: number | null; // share of window USD that was longs
  read: string; // one plain-English paragraph
}

export interface Wall {
  price: number;
  usd: number;
  distancePct: number; // negative below mid (bids), positive above (asks)
  share: number; // fraction of that side's depth within the scan band
  strength: number; // multiple of the median bucket
}

export interface OrderBookSummary {
  venue: "OKX" | "Hyperliquid";
  mid: number;
  spreadPct: number;
  coveragePct: number; // how far from mid the book sample reaches (min of both sides), in %
  depth: { band: number; bidUsd: number; askUsd: number; imbalance: number }[]; // imbalance = (bid-ask)/(bid+ask)
  bidWalls: Wall[];
  askWalls: Wall[];
  read: string;
}

const PAGE_LIMIT = 100;
const MAX_PAGES = 6;
const DAY = 24 * 3600e3;

// ── Pure: liquidations ──────────────────────────────────────────────────────

function emptyBucket(): LiqBucket {
  return { longUsd: 0, shortUsd: 0, longN: 0, shortN: 0 };
}

function add(b: LiqBucket, e: LiqEvent) {
  if (e.side === "long") {
    b.longUsd += e.usd;
    b.longN++;
  } else {
    b.shortUsd += e.usd;
    b.shortN++;
  }
}

const round = (n: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const fmtUsd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`);

export function summarizeLiquidations(events: LiqEvent[], mark: number, now = Date.now(), truncated = false): LiquidationSummary | null {
  const evs = events.filter((e) => Number.isFinite(e.usd) && e.usd > 0 && now - e.ts <= DAY).sort((a, b) => b.ts - a.ts);
  if (evs.length === 0) return null;

  const h1 = emptyBucket();
  const h4 = emptyBucket();
  const window = emptyBucket();
  let largest: LiqEvent | null = null;
  for (const e of evs) {
    const age = now - e.ts;
    if (age <= 3600e3) add(h1, e);
    if (age <= 4 * 3600e3) add(h4, e);
    add(window, e);
    if (!largest || e.usd > largest.usd) largest = e;
  }
  const oldest = evs[evs.length - 1].ts;
  const windowHours = Math.max(0.1, round((now - oldest) / 3600e3, 1));

  // Clusters: 0.25% price buckets, ranked by USD.
  const step = mark * 0.0025;
  const buckets = new Map<number, { price: number; longUsd: number; shortUsd: number }>();
  for (const e of evs) {
    const k = Math.round(e.price / step);
    let c = buckets.get(k);
    if (!c) {
      c = { price: k * step, longUsd: 0, shortUsd: 0 };
      buckets.set(k, c);
    }
    if (e.side === "long") c.longUsd += e.usd;
    else c.shortUsd += e.usd;
  }
  const clusters: LiqCluster[] = [...buckets.values()]
    .map((c) => ({
      price: round(c.price, mark >= 100 ? 1 : 6),
      usd: round(c.longUsd + c.shortUsd),
      side: (c.longUsd >= c.shortUsd ? "long" : "short") as LiqSide,
      longUsd: round(c.longUsd),
      shortUsd: round(c.shortUsd),
      distancePct: round(((c.price - mark) / mark) * 100, 2),
    }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 4);

  const total = window.longUsd + window.shortUsd;
  const longPct = total > 0 ? window.longUsd / total : null;
  const dominant: LiqSide | null = longPct == null ? null : longPct >= 0.65 ? "long" : longPct <= 0.35 ? "short" : null;

  const h = windowHours >= 23 ? "24h" : `${windowHours}h`;
  let read: string;
  if (dominant === "long") {
    read = `Longs took ${Math.round((longPct ?? 0) * 100)}% of ${fmtUsd(total)} liquidated in the last ${h}: leveraged buyers are being flushed. That removes fuel for a further drop and can set up a bounce once the flush slows.`;
  } else if (dominant === "short") {
    read = `Shorts took ${Math.round((1 - (longPct ?? 0)) * 100)}% of ${fmtUsd(total)} liquidated in the last ${h}: a short squeeze is under way. Chasing it is late; wait for the squeeze to stall before shorting or for a pullback before buying.`;
  } else {
    read = `${fmtUsd(total)} liquidated in the last ${h}, split between both sides. No one-sided flush, so liquidations are not driving price right now.`;
  }

  return {
    venue: "OKX",
    windowHours,
    truncated,
    h1: roundBucket(h1),
    h4: roundBucket(h4),
    window: roundBucket(window),
    largest: largest ? { ...largest, usd: round(largest.usd) } : null,
    clusters,
    tape: evs.slice(0, 8).map((e) => ({ ...e, usd: round(e.usd) })),
    dominant,
    longPct: longPct == null ? null : round(longPct, 3),
    read,
  };
}

function roundBucket(b: LiqBucket): LiqBucket {
  return { longUsd: round(b.longUsd), shortUsd: round(b.shortUsd), longN: b.longN, shortN: b.shortN };
}

// ── Pure: order book walls ──────────────────────────────────────────────────

export type BookLevel = { price: number; usd: number };

const BANDS = [0.01, 0.02, 0.05];

export function findWalls(bids: BookLevel[], asks: BookLevel[], mark: number, venue: OrderBookSummary["venue"] = "OKX"): OrderBookSummary | null {
  if (!bids.length || !asks.length || !(mark > 0)) return null;
  const bestBid = Math.max(...bids.map((b) => b.price));
  const bestAsk = Math.min(...asks.map((a) => a.price));
  const mid = (bestBid + bestAsk) / 2;
  const spreadPct = ((bestAsk - bestBid) / mid) * 100;

  // The feed returns a fixed number of levels, so a thick book (BTC) may only reach +/-0.9% while a thin one
  // reaches 5%+. Only scan what the sample actually covers and tell the reader how far that is.
  const bidReach = (mid - Math.min(...bids.map((b) => b.price))) / mid;
  const askReach = (Math.max(...asks.map((a) => a.price)) - mid) / mid;
  const coverage = Math.max(0.001, Math.min(bidReach, askReach, 0.05));

  const depth = BANDS.filter((band, i) => i === 0 || band <= coverage * 1.05).map((band) => {
    const bidUsd = bids.filter((b) => b.price >= mid * (1 - band)).reduce((s, b) => s + b.usd, 0);
    const askUsd = asks.filter((a) => a.price <= mid * (1 + band)).reduce((s, a) => s + a.usd, 0);
    const tot = bidUsd + askUsd;
    return { band, bidUsd: round(bidUsd), askUsd: round(askUsd), imbalance: tot > 0 ? round((bidUsd - askUsd) / tot, 3) : 0 };
  });

  // Walls: bucket by 0.1% of mid within +/-5%; a wall is >= 3x the median non-empty bucket and >= 4% of its side's band depth.
  const scan = coverage;
  const step = mid * 0.001;
  const side = (levels: BookLevel[], isBid: boolean): Wall[] => {
    const inBand = levels.filter((l) => (isBid ? l.price >= mid * (1 - scan) && l.price <= mid : l.price <= mid * (1 + scan) && l.price >= mid));
    if (inBand.length === 0) return [];
    const buckets = new Map<number, { usd: number; pxSum: number }>();
    for (const l of inBand) {
      const k = Math.round(l.price / step);
      const b = buckets.get(k) ?? { usd: 0, pxSum: 0 };
      b.usd += l.usd;
      b.pxSum += l.price * l.usd;
      buckets.set(k, b);
    }
    const vals = [...buckets.values()].map((b) => b.usd).sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length / 2)] || 0;
    const sideTotal = vals.reduce((s, v) => s + v, 0);
    if (!(median > 0) || !(sideTotal > 0)) return [];
    return [...buckets.values()]
      .map((b) => {
        const price = b.pxSum / b.usd;
        return {
          price: round(price, mid >= 100 ? 1 : 6),
          usd: round(b.usd),
          distancePct: round(((price - mid) / mid) * 100, 2),
          share: round(b.usd / sideTotal, 3),
          strength: round(b.usd / median, 1),
        };
      })
      .filter((w) => w.strength >= 3 && w.share >= 0.04)
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 3)
      .sort((a, b) => (isBid ? b.price - a.price : a.price - b.price)); // nearest first
  };
  const bidWalls = side(bids, true);
  const askWalls = side(asks, false);

  const d2 = depth[depth.length - 1];
  const lean = d2.imbalance >= 0.2 ? "bid-heavy" : d2.imbalance <= -0.2 ? "ask-heavy" : "balanced";
  const nb = bidWalls[0];
  const na = askWalls[0];
  const parts: string[] = [];
  const reachTxt = `${round(coverage * 100, coverage < 0.01 ? 2 : 1)}%`;
  parts.push(`Book within ${round(d2.band * 100, d2.band < 0.01 ? 2 : 1)}% is ${lean} (${fmtUsd(d2.bidUsd)} bids vs ${fmtUsd(d2.askUsd)} asks).`);
  if (nb) parts.push(`Nearest buy wall ${fmtUsd(nb.usd)} at ${nb.price.toLocaleString("en-US")} (${nb.distancePct}%): a likely bounce point and a sensible place to hide a stop just below.`);
  if (na) parts.push(`Nearest sell wall ${fmtUsd(na.usd)} at ${na.price.toLocaleString("en-US")} (+${na.distancePct}%): expect price to stall there; take partial profit in front of it rather than through it.`);
  if (!nb && !na) parts.push(`No outsized resting orders within ${reachTxt} of price: nothing on the book to lean on, so levels come from price structure instead.`);
  parts.push("Walls can be pulled; treat them as intent, not a promise.");

  return { venue, mid: round(mid, mid >= 100 ? 1 : 6), spreadPct: round(spreadPct, 4), coveragePct: round(coverage * 100, 2), depth, bidWalls, askWalls, read: parts.join(" ") };
}

// ── Fetchers (OKX) ──────────────────────────────────────────────────────────

async function okx<T>(path: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://www.okx.com${path}`, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`okx ${res.status}`);
    const j = (await res.json()) as { code: string; data: T };
    if (j.code !== "0") throw new Error(`okx code ${j.code}`);
    return j.data;
  } finally {
    clearTimeout(id);
  }
}

const ctValCache = new Map<string, number>();
async function contractValue(instId: string): Promise<number> {
  const hit = ctValCache.get(instId);
  if (hit) return hit;
  const data = await okx<{ instId: string; ctVal: string }[]>(`/api/v5/public/instruments?instType=SWAP&instId=${instId}`);
  const v = parseFloat(data?.[0]?.ctVal ?? "");
  if (!(v > 0)) throw new Error(`no ctVal for ${instId}`);
  ctValCache.set(instId, v);
  return v;
}

type OkxLiqPage = { details: { bkPx: string; posSide: "long" | "short"; sz: string; ts: string }[] }[];

/** Raw liquidation events for an OKX underlying (e.g. "BTC"), newest first, up to 24h / MAX_PAGES. */
export async function fetchLiquidationEvents(ccy: string, now = Date.now()): Promise<{ events: LiqEvent[]; truncated: boolean }> {
  const instId = `${ccy}-USDT-SWAP`;
  const ctVal = await contractValue(instId);
  const events: LiqEvent[] = [];
  let after: string | null = null;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q: string = `/api/v5/public/liquidation-orders?instType=SWAP&uly=${ccy}-USDT&state=filled&limit=${PAGE_LIMIT}${after ? `&after=${after}` : ""}`;
    const data: OkxLiqPage = await okx<OkxLiqPage>(q);
    const details: OkxLiqPage[number]["details"] = data?.[0]?.details ?? [];
    if (details.length === 0) break;
    let reachedDay = false;
    for (const d of details) {
      const ts = Number(d.ts);
      const px = parseFloat(d.bkPx);
      const sz = parseFloat(d.sz);
      if (!Number.isFinite(ts) || !(px > 0) || !(sz > 0)) continue;
      if (now - ts > DAY) {
        reachedDay = true;
        break;
      }
      events.push({ ts, side: d.posSide === "long" ? "long" : "short", price: px, usd: sz * ctVal * px });
    }
    if (reachedDay || details.length < PAGE_LIMIT) break;
    after = details[details.length - 1].ts;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  return { events, truncated };
}

type OkxBook = { bids: [string, string, string, string][]; asks: [string, string, string, string][] }[];

export async function fetchOrderBookLevels(ccy: string): Promise<{ bids: BookLevel[]; asks: BookLevel[] }> {
  const instId = `${ccy}-USDT-SWAP`;
  const [ctVal, book] = await Promise.all([contractValue(instId), okx<OkxBook>(`/api/v5/market/books-full?instId=${instId}&sz=5000`, 10000)]);
  const conv = (rows: [string, string, string, string][]): BookLevel[] =>
    rows
      .map(([p, s]) => {
        const price = parseFloat(p);
        const sz = parseFloat(s);
        return { price, usd: sz * ctVal * price };
      })
      .filter((l) => l.price > 0 && l.usd > 0);
  return { bids: conv(book?.[0]?.bids ?? []), asks: conv(book?.[0]?.asks ?? []) };
}

// Hyperliquid fallback for the book only (coin-denominated sizes, 20 levels per side).
async function fetchHyperliquidBook(coin: string): Promise<{ bids: BookLevel[]; asks: BookLevel[] }> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "l2Book", coin, nSigFigs: 5 }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`hl ${res.status}`);
    const j = (await res.json()) as { levels: [{ px: string; sz: string }[], { px: string; sz: string }[]] };
    const conv = (rows: { px: string; sz: string }[]): BookLevel[] =>
      rows.map((r) => ({ price: parseFloat(r.px), usd: parseFloat(r.px) * parseFloat(r.sz) })).filter((l) => l.price > 0 && l.usd > 0);
    return { bids: conv(j.levels[0]), asks: conv(j.levels[1]) };
  } finally {
    clearTimeout(id);
  }
}

// ── Cached, engine-facing API ───────────────────────────────────────────────
//
// Fetching needs no mark price, so the engine can run it inside its parallel batch; summarizing needs the
// mark, so it runs once the batch settles. Raw samples are cached for TTL per underlying.

const TTL = 45_000;
const liqCache = new Map<string, { at: number; events: LiqEvent[]; truncated: boolean }>();
const bookCache = new Map<string, { at: number; venue: OrderBookSummary["venue"]; bids: BookLevel[]; asks: BookLevel[] }>();

export interface OrderFlowRaw {
  liq: { events: LiqEvent[]; truncated: boolean } | null;
  book: { venue: OrderBookSummary["venue"]; bids: BookLevel[]; asks: BookLevel[] } | null;
}

export interface OrderFlowResult {
  liquidations: LiquidationSummary | null;
  orderBook: OrderBookSummary | null;
}

/** Raw liquidation tape + order book for one OKX underlying. Never throws; a feed that fails comes back null. */
export async function fetchOrderFlowRaw(ccy: string | undefined): Promise<OrderFlowRaw> {
  if (!ccy) return { liq: null, book: null };
  const now = Date.now();

  const liqP = (async () => {
    let c = liqCache.get(ccy) ?? null;
    if (!c || now - c.at > TTL) {
      try {
        const { events, truncated } = await fetchLiquidationEvents(ccy, now);
        c = { at: now, events, truncated };
        liqCache.set(ccy, c);
      } catch {
        /* keep the stale sample if we have one */
      }
    }
    return c ? { events: c.events, truncated: c.truncated } : null;
  })();

  const bookP = (async () => {
    let c = bookCache.get(ccy) ?? null;
    if (!c || now - c.at > TTL) {
      try {
        const { bids, asks } = await fetchOrderBookLevels(ccy);
        c = { at: now, venue: "OKX", bids, asks };
        bookCache.set(ccy, c);
      } catch {
        try {
          const { bids, asks } = await fetchHyperliquidBook(ccy);
          c = { at: now, venue: "Hyperliquid", bids, asks };
          bookCache.set(ccy, c);
        } catch {
          /* keep stale */
        }
      }
    }
    return c ? { venue: c.venue, bids: c.bids, asks: c.asks } : null;
  })();

  const [liq, book] = await Promise.all([liqP, bookP]);
  return { liq, book };
}

export function summarizeOrderFlow(raw: OrderFlowRaw | null | undefined, mark: number, now = Date.now()): OrderFlowResult {
  if (!raw || !(mark > 0)) return { liquidations: null, orderBook: null };
  return {
    liquidations: raw.liq ? summarizeLiquidations(raw.liq.events, mark, now, raw.liq.truncated) : null,
    orderBook: raw.book ? findWalls(raw.book.bids, raw.book.asks, mark, raw.book.venue) : null,
  };
}

/** Convenience for scripts: fetch and summarize in one go. */
export async function fetchOrderFlow(ccy: string | undefined, mark: number): Promise<OrderFlowResult> {
  return summarizeOrderFlow(await fetchOrderFlowRaw(ccy), mark);
}
