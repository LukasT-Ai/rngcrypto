export type OilCatalystCategory =
  | "OPEC"
  | "SANCTIONS"
  | "CONFLICT"
  | "RESERVES"
  | "PIPELINE"
  | "INVENTORY"
  | "DEMAND"
  | "TRADE_POLICY"
  | "PRODUCTION"
  | "GENERAL";

export type Sentiment = "bullish" | "bearish" | "neutral";
export type Impact = "high" | "medium" | "low";

export interface OilGeoEvent {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  category: OilCatalystCategory;
  sentiment: Sentiment;
  impact: Impact;
  score: number;
  priceReaction: {
    eventPrice: number;
    sinceEventPct: number;
    confirms: boolean | null;
  } | null;
}

export interface CatalystForce {
  category: OilCatalystCategory;
  count: number;
  avgScore: number;
  avgReactionPct: number | null;
  topHeadline: string;
}

export interface OilGeoVerdict {
  bullForce: CatalystForce | null;
  bearForce: CatalystForce | null;
  netLean: Sentiment;
  priceFollowing: OilCatalystCategory | null;
  summary: string;
  flipCondition: string;
}

export interface OilGeoResult {
  score: number;
  label: string;
  eventCount: number;
  events: OilGeoEvent[];
  lastUpdated: string;
  categoryBreakdown: {
    category: OilCatalystCategory;
    count: number;
    avgScore: number;
    avgReactionPct: number | null;
  }[];
  priceContext: {
    current: number;
    change24h: number;
    changePct24h: number;
    weekHigh: number;
    weekLow: number;
  } | null;
  verdict: OilGeoVerdict | null;
  sourcesUsed: string[];
}

let geoCache: { data: OilGeoResult; timestamp: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;
const UA = { "User-Agent": "RNGcrypto/1.0 (Oil Signal Engine)" };

// ── Classification rules ────────────────────────────────────────────────────

interface CategoryRule {
  category: OilCatalystCategory;
  keywords: RegExp;
  bullish: RegExp;
  bearish: RegExp;
  baseImpact: Impact;
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "CONFLICT",
    keywords:
      /\b(middle\s*east|strait\s*of\s*hormuz|hormuz|red\s*sea|houthi|yemen|iran|iraq|libya|israel|kharg|aramco|south\s*pars|riyadh|saudi|tanker|warship|(u\.?s\.?|us)[\s-]+iran|iran[\s-]+(u\.?s\.?|us)|camp\s*david|gulf\s*(war|attack|tension|strike|waters)|oman.{0,20}(tanker|ship|vessel)|troops?.{0,20}(deploy|middle\s*east|gulf)|bomber)\b/i,
    bullish:
      /\b(attack|strike|struck|hit|bomb|missile|drone|escalat|threat|blockad|clos(e|ed|ure|ing)|shut|disrupt|destroy|seiz|war|tension|military|deploy|retaliat|target|damage|shoot|intercept|explod|fire|vow|demand|ultimatum)\w*/i,
    bearish:
      /\b(ceasefire|truce|peace|de-?escalat|diplomac|negotiat|talks?|calm|resolv|withdraw|reopen|resum|recover|restor|eas(e|ing)|lift|agree|deal|losing\s*leverage)\w*/i,
    baseImpact: "high",
  },
  {
    category: "RESERVES",
    keywords:
      /\b(strategic\s*(petroleum|oil)\s*reserve|\bspr\b|emergency\s*(oil|fuel|diesel|crude)?\s*(reserve|stock|release)|(reserve|stock|stockpile|diesel|crude|oil)\s*release|release.{0,25}(reserve|stockpile|barrel)|iea.{0,25}(reserve|release|emergency|stock)|g7.{0,25}(oil|reserve|barrel|release|diesel)|(eu|europe|european|brussels).{0,25}(reserve|diesel|stock|release)|100\s*million\s*barrel|million[\s-]*barrel\s*release)\b/i,
    bullish:
      /\b(fill|refill|halt|pause|stop|rebuild|replenish|buy|woes|shortage|squeeze|crunch|tight|cannot\s*guarantee|buy\s*time|not\s*enough|insufficient)\w*/i,
    bearish:
      /\b(releas|draw|sell|deplet|tap|unlock|flood|dump|coordinat|agree|approve|pressur|massive|100\s*million)\w*/i,
    baseImpact: "high",
  },
  {
    category: "OPEC",
    keywords: /\b(opec\+?|oil\s*cartel|production\s*(cut|quota|target)|output\s*(cut|quota|target)|oil\s*quota|jmmc|saudi.{0,20}(output|production|cut))\b/i,
    bullish: /\b(cut|reduc|slash|curb|tighten|extend|deeper|compli|withhold|shortfall|deficit|under-?suppl|under-?produc|miss)\w*/i,
    bearish: /\b(increas|boost|ramp|hike|raise|eas(e|ing)|unwind|lift|abandon|exceed|pump\s*more|over-?produc|add\s*barrel|surplus|glut)\w*/i,
    baseImpact: "high",
  },
  {
    category: "SANCTIONS",
    keywords: /\b(sanction|embargo|ban.{0,20}(oil|crude|petroleum|energy|import|export)|restrict.{0,20}(oil|crude|export)|price\s*cap|(russia|venezuela|iran).{0,25}(oil|crude|export|barrel))\b/i,
    bullish: /\b(impos|tighten|expand|new|escalat|restrict|ban|block|seiz|penal|enforc|secondary)\w*/i,
    bearish: /\b(lift|eas(e|ing)|waiver|exempt|relax|suspend|remov|deal|agree|compl|resum|loophole|evad|circumvent)\w*/i,
    baseImpact: "high",
  },
  {
    category: "PIPELINE",
    keywords: /\b(pipeline|nord\s*stream|keystone|druzhba|cpc|lng\s*terminal|refiner(y|ies)|oil\s*(terminal|port|facility|infrastructure|hub)|export\s*terminal)\b/i,
    bullish: /\b(shut|halt|disrupt|explod|leak|damag|outage|malfunction|delay|cancel|block|suspend|fire|attack|strike|sabotag)\w*/i,
    bearish: /\b(reopen|restart|resum|repair|complet|commission|expand|new|approv|online|back\s*online)\w*/i,
    baseImpact: "medium",
  },
  {
    category: "INVENTORY",
    keywords: /\b(crude\s*(inventor|stock)|oil\s*(inventor|stock)|stockpil|eia.{0,20}(report|data|inventor|weekly)|api.{0,20}(report|data|inventor|weekly)|oil\s*storage|cushing|fuel\s*stock|diesel\s*(stock|inventor)|gasoline\s*(inventor|stock)|distillate)\b/i,
    bullish: /\b(draw|declin|fall|drop|deplet|below|lower|tighten|shortage|squeeze|lowest)\w*/i,
    bearish: /\b(build|rise|increas|surge|above|higher|glut|overflow|highest|surplus)\w*/i,
    baseImpact: "medium",
  },
  {
    category: "DEMAND",
    keywords: /\b(oil\s*demand|crude\s*demand|energy\s*demand|fuel\s*demand|(china|india|chinese|indian).{0,25}(oil|crude|demand|import|refin)|global.{0,20}(demand|growth|recession|slowdown)|iea.{0,25}(demand|forecast|outlook)|driving\s*season|travel\s*demand|refin.{0,15}(capacity|throughput|margin|run)|crack\s*spread|consumption)\b/i,
    bullish: /\b(strong|surge|record|boost|recover|revis\w*\s*up|upgrade|above|robust|accelerat|high|jump|increas)\w*/i,
    bearish: /\b(weak|slow|contract|declin|revis\w*\s*down|downgrade|below|recession|slump|crash|fall|drop|cut)\w*/i,
    baseImpact: "medium",
  },
  {
    category: "TRADE_POLICY",
    keywords: /\b(tariff|trade\s*war|import\s*duty|export\s*ban|export\s*curb|trade\s*deal)\b.{0,40}\b(oil|energy|crude|fuel|petroleum)|\b(oil|energy|crude|fuel).{0,40}\b(tariff|trade\s*war|duty|export\s*ban)\b/i,
    bullish: /\b(impos|ban|restrict|limit|block|tax|duty|retaliat|escalat)\w*/i,
    bearish: /\b(lift|remov|cut|reduc|exempt|free\s*trade|agree|deal|truce)\w*/i,
    baseImpact: "medium",
  },
  {
    category: "PRODUCTION",
    keywords: /\b(oil\s*production|crude\s*(output|production)|shale|permian|rig\s*count|baker\s*hughes|drilling|fracking|oil\s*field|gas\s*field|offshore|north\s*sea|gulf\s*of\s*mexico|hurricane|output\s*(rose|fell|hit))\b/i,
    bullish: /\b(declin|drop|shut|halt|slow|cut|fall|curb|reduc|hurricane|storm|evacuat|outage|lowest)\w*/i,
    bearish: /\b(record|surge|increas|ramp|boost|new\s*well|expand|more\s*rig|resum|highest|rose)\w*/i,
    baseImpact: "low",
  },
  {
    category: "GENERAL",
    keywords: /\b(crude\s*oil|brent|wti|oil\s*price|oil\s*futures|petroleum|oil\s*market|energy\s*market|oil\s*(rally|crash|surge|plung|spike|slump|drop|jump|tumbl|soar|rise|gain|extend|climb|retreat|slide|fall|rebound))\b/i,
    bullish: /\b(jump|surge|soar|rall(y|ies)|climb|ris(e|es|ing)|gain|extend|firm|higher|rebound|spike|six-week\s*high|multi-\w+\s*high)\w*/i,
    bearish: /\b(fall|drop|plung|tumbl|slump|retreat|slide|lower|eas(e|es|ing)|pressur|dip|sink|weak)\w*/i,
    baseImpact: "low",
  },
];

const MAGNITUDE_WORDS =
  /\b(clos(ed|ure)|shut\s*down|halt|100\s*million|million\s*barrel|record|major|massive|largest|unprecedented|emergency|blockade|war|explosion|destroy|crisis|shock|collapse|severe)\b/gi;

const HIGH_CRED_SOURCES =
  /reuters|bloomberg|oilprice|energynow|financial\s*times|\bft\b|wall\s*street|wsj|cnbc|s&p\s*global|platts|argus|rigzone|eia\.gov|iea\.org|business\s*standard|al\s*jazeera|associated\s*press|\bap\b|the\s*guardian|nikkei/i;
const LOW_CRED_SOURCES =
  /daily\s*mail|inkl|newswav|biggo|urbanacres|business\s*upturn|ticker\s*news|psuindia|quantum\s*commodity|invezz|fxempire|briefs\.co/i;

const IMPACT_MULT: Record<Impact, number> = { high: 1.5, medium: 1.0, low: 0.6 };
const IMPACT_RANK: Record<Impact, number> = { high: 3, medium: 2, low: 1 };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function countMatches(re: RegExp, text: string): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (text.match(g) ?? []).length;
}

interface Classification {
  category: OilCatalystCategory;
  sentiment: Sentiment;
  impact: Impact;
  score: number;
  strength: number;
}

function scoreAgainstRules(text: string): Classification[] {
  const out: Classification[] = [];
  const mag = Math.min(countMatches(MAGNITUDE_WORDS, text), 3);
  for (const rule of CATEGORY_RULES) {
    if (!rule.keywords.test(text)) continue;
    const bull = countMatches(rule.bullish, text);
    const bear = countMatches(rule.bearish, text);
    const net = bull - bear;
    let raw = 0;
    if (net > 0) raw = 25 + 10 * Math.min(net, 3) + 5 * mag;
    else if (net < 0) raw = -(25 + 10 * Math.min(-net, 3) + 5 * mag);
    const score = clamp(Math.round(raw * IMPACT_MULT[rule.baseImpact]), -75, 75);
    const sentiment: Sentiment = score >= 10 ? "bullish" : score <= -10 ? "bearish" : "neutral";
    out.push({
      category: rule.category,
      sentiment,
      impact: rule.baseImpact,
      score,
      strength: Math.abs(score) * 10 + IMPACT_RANK[rule.baseImpact],
    });
  }
  return out;
}

function pickBest(cands: Classification[]): Classification | null {
  if (cands.length === 0) return null;
  const sorted = [...cands].sort((a, b) => b.strength - a.strength);
  const best = sorted[0];
  const second = sorted[1];
  // Two strong, opposing forces in one headline => genuinely mixed
  if (
    second &&
    best.score !== 0 &&
    second.score !== 0 &&
    Math.sign(best.score) !== Math.sign(second.score) &&
    Math.abs(Math.abs(best.score) - Math.abs(second.score)) <= 15
  ) {
    return { ...best, score: 0, sentiment: "neutral" };
  }
  return best;
}

function classify(title: string, description: string): Classification | null {
  const fromTitle = pickBest(scoreAgainstRules(title));
  if (fromTitle) return fromTitle;
  if (!description) return null;
  const fromDesc = pickBest(scoreAgainstRules(description));
  if (!fromDesc || fromDesc.score === 0) return null;
  const downgraded: Impact = fromDesc.impact === "high" ? "medium" : "low";
  const score = Math.round(fromDesc.score * 0.5);
  return {
    ...fromDesc,
    impact: downgraded,
    score,
    sentiment: score >= 10 ? "bullish" : score <= -10 ? "bearish" : "neutral",
  };
}

function credibilityMult(source: string): number {
  if (HIGH_CRED_SOURCES.test(source)) return 1.15;
  if (LOW_CRED_SOURCES.test(source)) return 0.8;
  return 1.0;
}

function sentimentLabel(score: number): string {
  if (score >= 40) return "Very Bullish";
  if (score >= 15) return "Bullish";
  if (score >= 5) return "Slightly Bullish";
  if (score > -5) return "Neutral";
  if (score > -15) return "Slightly Bearish";
  if (score > -40) return "Bearish";
  return "Very Bearish";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&nbsp;/g, " ");
}

// Google News titles end in " - Publisher"; pull it out as the real source.
function splitPublisher(title: string, fallback: string): { title: string; source: string } {
  const m = title.match(/^(.*?)\s+[-–—]\s+([^-–—]{2,60})$/);
  if (m) return { title: m[1].trim(), source: m[2].trim() };
  return { title: title.trim(), source: fallback };
}

function dedupKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
}

interface RawItem {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
}

function toEvent(item: RawItem): OilGeoEvent | null {
  const c = classify(item.title, item.description);
  if (!c) return null;
  const score = clamp(Math.round(c.score * credibilityMult(item.source)), -80, 80);
  return {
    title: item.title,
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt,
    category: c.category,
    sentiment: score >= 10 ? "bullish" : score <= -10 ? "bearish" : "neutral",
    impact: c.impact,
    score,
    priceReaction: null,
  };
}

// ── Sources ─────────────────────────────────────────────────────────────────

function parseRSS(xml: string, feedName: string): RawItem[] {
  const items: RawItem[] = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const b = m[1];
    const rawTitle = b.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? "";
    const link = b.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() ?? "";
    const pub = b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    const rawDesc = b.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] ?? "";
    const titleDecoded = decodeEntities(rawTitle).trim();
    if (!titleDecoded) continue;
    const { title, source } = feedName === "Google News" ? splitPublisher(titleDecoded, feedName) : { title: titleDecoded, source: feedName };
    const d = new Date(pub);
    items.push({
      title,
      description: decodeEntities(rawDesc.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 600),
      url: link,
      source,
      publishedAt: isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(),
    });
  }
  return items;
}

async function fetchText(url: string, ms: number): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store", headers: UA });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchJSON<T>(url: string, ms: number): Promise<T | null> {
  const txt = await fetchText(url, ms);
  if (!txt) return null;
  try {
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

const gnq = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const RSS_FEEDS = [
  { url: "https://oilprice.com/rss/main", name: "OilPrice.com" },
  { url: gnq("WTI OR \"crude oil\" when:2d"), name: "Google News" },
  { url: gnq("(OPEC OR OPEC+) oil when:3d"), name: "Google News" },
  { url: gnq("(Hormuz OR tanker OR Aramco OR Houthi OR Iran) oil when:2d"), name: "Google News" },
  { url: gnq("(\"strategic reserve\" OR SPR OR G7 OR IEA) oil release when:3d"), name: "Google News" },
  { url: gnq("(sanctions OR embargo) (oil OR crude) when:3d"), name: "Google News" },
  { url: gnq("(EIA OR \"crude inventories\" OR \"rig count\") when:3d"), name: "Google News" },
];

async function fetchRSS(): Promise<{ items: RawItem[]; ok: string[] }> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (f) => {
      const xml = await fetchText(f.url, 8000);
      return xml ? { name: f.name, items: parseRSS(xml, f.name) } : { name: f.name, items: [] as RawItem[] };
    })
  );
  const items: RawItem[] = [];
  const ok = new Set<string>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    if (r.value.items.length > 0) ok.add(r.value.name);
    items.push(...r.value.items);
  }
  return { items, ok: [...ok] };
}

interface GDELTArticle {
  title: string;
  url: string;
  domain: string;
  seendate: string;
}

async function fetchGDELT(): Promise<RawItem[]> {
  const query =
    '(crude oil OR OPEC OR brent OR WTI OR "strait of hormuz" OR "oil reserves" OR aramco OR kharg OR "tanker attack" OR "oil price" OR houthi OR "strategic petroleum" OR "diesel release" OR "G7 oil") sourcelang:eng';
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=75&format=json&sort=datedesc&timespan=4320`;
  const data = await fetchJSON<{ articles?: GDELTArticle[] }>(url, 12000);
  const out: RawItem[] = [];
  for (const a of data?.articles ?? []) {
    if (!a.title) continue;
    const iso = a.seendate
      ? a.seendate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z")
      : new Date().toISOString();
    out.push({
      title: decodeEntities(a.title).trim(),
      description: "",
      url: a.url,
      source: a.domain ?? "GDELT",
      publishedAt: iso,
    });
  }
  return out;
}

interface GNewsArticle {
  title: string;
  description: string;
  url: string;
  source: { name: string };
  publishedAt: string;
}

async function fetchGNews(): Promise<RawItem[]> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const q = "crude oil OR OPEC OR oil sanctions OR Hormuz OR oil reserves OR tanker attack OR Aramco";
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=10&sortby=publishedAt&apikey=${key}`;
  const data = await fetchJSON<{ articles?: GNewsArticle[] }>(url, 8000);
  return (data?.articles ?? []).map((a) => ({
    title: a.title,
    description: a.description ?? "",
    url: a.url,
    source: a.source?.name ?? "GNews",
    publishedAt: a.publishedAt ?? new Date().toISOString(),
  }));
}

interface CurrentsArticle {
  title: string;
  description: string;
  url: string;
  published: string;
  author: string;
}

async function fetchCurrents(): Promise<RawItem[]> {
  const key = process.env.CURRENTS_API_KEY;
  if (!key) return [];
  const url = `https://api.currentsapi.services/v1/search?keywords=${encodeURIComponent("crude oil OPEC Hormuz sanctions reserves")}&language=en&apiKey=${key}`;
  const data = await fetchJSON<{ news?: CurrentsArticle[] }>(url, 8000);
  return (data?.news ?? []).slice(0, 15).map((a) => ({
    title: a.title,
    description: a.description ?? "",
    url: a.url,
    source: "Currents",
    publishedAt: a.published ? new Date(a.published).toISOString() : new Date().toISOString(),
  }));
}

// ── Price context & reactions (Strike WTI-USD) ──────────────────────────────

const STRIKE = "https://api.strikefinance.org/price/v2";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function parseCandles(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((k: unknown[]) => {
      const t = Number(k[0]);
      return {
        time: t < 1e12 ? t * 1000 : t,
        open: parseFloat(String(k[1])),
        high: parseFloat(String(k[2])),
        low: parseFloat(String(k[3])),
        close: parseFloat(String(k[4])),
      };
    })
    .filter((c) => Number.isFinite(c.close) && c.close > 0);
}

async function fetchPrice(): Promise<{ context: OilGeoResult["priceContext"]; intraday: Candle[] }> {
  const [mark, daily, intradayRaw] = await Promise.all([
    fetchJSON<{ p?: string }>(`${STRIKE}/markPrice?symbol=WTI-USD`, 6000),
    fetchJSON<unknown>(`${STRIKE}/klines?symbol=WTI-USD&interval=1d&limit=8&priceType=last`, 6000),
    fetchJSON<unknown>(`${STRIKE}/klines?symbol=WTI-USD&interval=15m&limit=288&priceType=last`, 6000),
  ]);

  const dailyC = parseCandles(daily);
  const intraday = parseCandles(intradayRaw);
  const current = parseFloat(mark?.p ?? "") || intraday[intraday.length - 1]?.close || dailyC[dailyC.length - 1]?.close || 0;
  if (!current) return { context: null, intraday };

  const prevClose = dailyC.length >= 2 ? dailyC[dailyC.length - 2].close : 0;
  const change24h = prevClose ? Math.round((current - prevClose) * 100) / 100 : 0;
  const changePct24h = prevClose ? Math.round(((current - prevClose) / prevClose) * 10000) / 100 : 0;
  const week = dailyC.slice(-7);
  const weekHigh = week.length ? Math.max(...week.map((c) => c.high)) : current;
  const weekLow = week.length ? Math.min(...week.map((c) => c.low)) : current;

  return {
    context: {
      current: Math.round(current * 100) / 100,
      change24h,
      changePct24h,
      weekHigh: Math.round(weekHigh * 100) / 100,
      weekLow: Math.round(weekLow * 100) / 100,
    },
    intraday,
  };
}

function priceAt(candles: Candle[], tsMs: number): number | null {
  if (candles.length === 0) return null;
  if (tsMs < candles[0].time) return null;
  // candles ascending; find first candle whose time >= event time, else use last
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time < tsMs) lo = mid + 1;
    else hi = mid;
  }
  const c = candles[lo];
  return c.time >= tsMs ? c.open : c.close;
}

function attachReactions(events: OilGeoEvent[], intraday: Candle[], current: number | null): void {
  if (!current || intraday.length === 0) return;
  for (const e of events) {
    const ts = new Date(e.publishedAt).getTime();
    const p = priceAt(intraday, ts);
    if (!p) continue;
    const pct = Math.round(((current - p) / p) * 10000) / 100;
    const confirms =
      e.sentiment === "neutral" || Math.abs(pct) < 0.15
        ? null
        : (e.sentiment === "bullish" && pct > 0) || (e.sentiment === "bearish" && pct < 0);
    e.priceReaction = { eventPrice: Math.round(p * 100) / 100, sinceEventPct: pct, confirms };
  }
}

// ── Verdict ─────────────────────────────────────────────────────────────────

const FLIP_TEMPLATES: Record<OilCatalystCategory, { bull: string; bear: string }> = {
  CONFLICT: {
    bull: "Ceasefire, Hormuz reopening, or confirmed de-escalation headlines would strip the risk premium.",
    bear: "Fresh strikes on tankers, Aramco, or Hormuz traffic would re-price supply risk higher.",
  },
  RESERVES: {
    bull: "A larger or accelerated SPR/IEA release landing in physical markets would cap upside.",
    bear: "Release delays, smaller volumes, or reserves proving insufficient would flip bullish.",
  },
  OPEC: {
    bull: "OPEC+ unwinding cuts or members exceeding quotas would turn bearish.",
    bear: "Surprise cuts or compliance tightening would turn bullish.",
  },
  SANCTIONS: {
    bull: "Sanctions waivers or an Iran/Russia deal would release barrels and turn bearish.",
    bear: "New secondary sanctions or enforcement would tighten supply.",
  },
  PIPELINE: { bull: "Restart of disrupted infrastructure.", bear: "Further outages or attacks on infrastructure." },
  INVENTORY: { bull: "A surprise inventory build on EIA Wednesday.", bear: "A surprise inventory draw on EIA Wednesday." },
  DEMAND: { bull: "Weak China/India import data or recession signals.", bear: "Upward demand revisions from IEA/OPEC." },
  TRADE_POLICY: { bull: "Tariff rollback or trade deal.", bear: "New energy tariffs or export bans." },
  PRODUCTION: { bull: "Rising rig counts or record US output.", bear: "Hurricane shut-ins or output declines." },
  GENERAL: { bull: "Sustained selling pressure.", bear: "Sustained buying pressure." },
};

function buildVerdict(
  events: OilGeoEvent[],
  breakdown: OilGeoResult["categoryBreakdown"],
  netScore: number
): OilGeoVerdict | null {
  const scoredCats = breakdown.filter((b) => b.category !== "GENERAL" && Math.abs(b.avgScore) >= 10);
  if (scoredCats.length === 0) return null;

  const topHeadlineFor = (cat: OilCatalystCategory, sign: 1 | -1): string =>
    events
      .filter((e) => e.category === cat && Math.sign(e.score) === sign && e.impact === "high")
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))[0]?.title ??
    events.filter((e) => e.category === cat).sort((a, b) => Math.abs(b.score) - Math.abs(a.score))[0]?.title ??
    "";

  const bulls = scoredCats.filter((b) => b.avgScore > 0).sort((a, b) => b.avgScore * b.count - a.avgScore * a.count);
  const bears = scoredCats.filter((b) => b.avgScore < 0).sort((a, b) => a.avgScore * a.count - b.avgScore * b.count);

  const toForce = (b: OilGeoResult["categoryBreakdown"][number] | undefined, sign: 1 | -1): CatalystForce | null =>
    b
      ? {
          category: b.category,
          count: b.count,
          avgScore: b.avgScore,
          avgReactionPct: b.avgReactionPct,
          topHeadline: topHeadlineFor(b.category, sign),
        }
      : null;

  const bullForce = toForce(bulls[0], 1);
  const bearForce = toForce(bears[0], -1);

  const netLean: Sentiment = netScore >= 10 ? "bullish" : netScore <= -10 ? "bearish" : "neutral";

  // Which narrative is price actually following? Compare average reactions.
  let priceFollowing: OilCatalystCategory | null = null;
  if (bullForce?.avgReactionPct != null && bearForce?.avgReactionPct != null) {
    const bullAligned = bullForce.avgReactionPct > 0.15;
    const bearAligned = bearForce.avgReactionPct < -0.15;
    if (bullAligned && !bearAligned) priceFollowing = bullForce.category;
    else if (bearAligned && !bullAligned) priceFollowing = bearForce.category;
    else if (bullAligned && bearAligned) priceFollowing = Math.abs(bullForce.avgReactionPct) >= Math.abs(bearForce.avgReactionPct) ? bullForce.category : bearForce.category;
  } else if (bullForce?.avgReactionPct != null && bullForce.avgReactionPct > 0.15) priceFollowing = bullForce.category;
  else if (bearForce?.avgReactionPct != null && bearForce.avgReactionPct < -0.15) priceFollowing = bearForce.category;

  const fmtPct = (p: number | null) => (p == null ? "n/a" : `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`);
  const label = (c: OilCatalystCategory) => c.replace("_", " ");

  let summary: string;
  if (bullForce && bearForce) {
    summary =
      `${label(bullForce.category)} (${bullForce.count} headlines, avg +${bullForce.avgScore}) vs ` +
      `${label(bearForce.category)} (${bearForce.count}, avg ${bearForce.avgScore}). ` +
      `Net lean ${netLean}. WTI since ${label(bullForce.category).toLowerCase()} headlines ${fmtPct(bullForce.avgReactionPct)}, ` +
      `since ${label(bearForce.category).toLowerCase()} headlines ${fmtPct(bearForce.avgReactionPct)}` +
      (priceFollowing ? ` — price is following ${label(priceFollowing)}.` : " — price undecided.");
  } else if (bullForce) {
    summary = `${label(bullForce.category)} dominates (${bullForce.count} headlines, avg +${bullForce.avgScore}); no meaningful bearish counterforce. WTI since those headlines ${fmtPct(bullForce.avgReactionPct)}.`;
  } else if (bearForce) {
    summary = `${label(bearForce.category)} dominates (${bearForce.count} headlines, avg ${bearForce.avgScore}); no meaningful bullish counterforce. WTI since those headlines ${fmtPct(bearForce.avgReactionPct)}.`;
  } else {
    summary = "No dominant catalyst.";
  }

  const dominant = netLean === "bearish" ? bearForce ?? bullForce : bullForce ?? bearForce;
  const flipCondition = dominant
    ? netLean === "bearish"
      ? FLIP_TEMPLATES[dominant.category].bear
      : FLIP_TEMPLATES[dominant.category].bull
    : "";

  return { bullForce, bearForce, netLean, priceFollowing, summary, flipCondition };
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function getOilGeopoliticalNews(): Promise<OilGeoResult> {
  if (geoCache && Date.now() - geoCache.timestamp < CACHE_TTL) return geoCache.data;

  const [rss, gdelt, gnews, currents, price] = await Promise.all([
    fetchRSS(),
    fetchGDELT(),
    fetchGNews(),
    fetchCurrents(),
    fetchPrice(),
  ]);

  const sourcesUsed = new Set<string>(rss.ok);
  if (gdelt.length) sourcesUsed.add("GDELT");
  if (gnews.length) sourcesUsed.add("GNews");
  if (currents.length) sourcesUsed.add("Currents");

  const seen = new Set<string>();
  const events: OilGeoEvent[] = [];
  const cutoff = Date.now() - 72 * 60 * 60 * 1000;

  for (const raw of [...rss.items, ...gnews, ...currents, ...gdelt]) {
    const key = dedupKey(raw.title);
    if (!key || seen.has(key)) continue;
    const ts = new Date(raw.publishedAt).getTime();
    if (Number.isFinite(ts) && ts < cutoff) continue;
    const ev = toEvent(raw);
    if (!ev) continue;
    seen.add(key);
    events.push(ev);
  }

  events.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  attachReactions(events, price.intraday, price.context?.current ?? null);

  // Weighted net score: recency 2x (<6h), high-impact clusters dominate
  const now = Date.now();
  const scored = events.filter((e) => e.score !== 0);
  let netScore = 0;
  if (scored.length > 0) {
    let ws = 0;
    let wt = 0;
    for (const e of scored) {
      const age = now - new Date(e.publishedAt).getTime();
      const w = age < 6 * 3600e3 ? 2 : age < 24 * 3600e3 ? 1.25 : 1;
      ws += e.score * w;
      wt += w;
    }
    netScore = Math.round(ws / wt);
    const recentHi = scored.filter((e) => e.impact === "high" && now - new Date(e.publishedAt).getTime() < 12 * 3600e3);
    if (recentHi.length >= 3) {
      const hiAvg = Math.round(recentHi.reduce((s, e) => s + e.score, 0) / recentHi.length);
      netScore = Math.round(netScore * 0.4 + hiAvg * 0.6);
    }
  }

  const catMap = new Map<OilCatalystCategory, { count: number; total: number; rSum: number; rN: number }>();
  for (const e of events) {
    const c = catMap.get(e.category) ?? { count: 0, total: 0, rSum: 0, rN: 0 };
    c.count++;
    c.total += e.score;
    if (e.priceReaction) {
      c.rSum += e.priceReaction.sinceEventPct;
      c.rN++;
    }
    catMap.set(e.category, c);
  }
  const categoryBreakdown = [...catMap.entries()]
    .map(([category, c]) => ({
      category,
      count: c.count,
      avgScore: Math.round(c.total / c.count),
      avgReactionPct: c.rN > 0 ? Math.round((c.rSum / c.rN) * 100) / 100 : null,
    }))
    .sort((a, b) => b.count - a.count);

  const verdict = buildVerdict(events, categoryBreakdown, netScore);

  const result: OilGeoResult = {
    score: clamp(netScore, -100, 100),
    label: sentimentLabel(netScore),
    eventCount: events.length,
    events: events.slice(0, 30),
    lastUpdated: new Date().toISOString(),
    categoryBreakdown,
    priceContext: price.context,
    verdict,
    sourcesUsed: [...sourcesUsed],
  };

  geoCache = { data: result, timestamp: Date.now() };
  return result;
}
