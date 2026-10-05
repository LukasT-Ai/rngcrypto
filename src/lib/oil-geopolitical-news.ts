export interface OilGeoEvent {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  category: OilCatalystCategory;
  sentiment: "bullish" | "bearish" | "neutral";
  impact: "high" | "medium" | "low";
  score: number;
}

export type OilCatalystCategory =
  | "OPEC"
  | "SANCTIONS"
  | "CONFLICT"
  | "PIPELINE"
  | "INVENTORY"
  | "DEMAND"
  | "TRADE_POLICY"
  | "PRODUCTION"
  | "RESERVES"
  | "GENERAL";

export interface OilGeoResult {
  score: number;
  label: string;
  eventCount: number;
  events: OilGeoEvent[];
  lastUpdated: string;
  categoryBreakdown: { category: OilCatalystCategory; count: number; avgScore: number }[];
  priceContext: {
    current: number;
    change24h: number;
    changePct24h: number;
    weekHigh: number;
    weekLow: number;
  } | null;
}

let geoCache: { data: OilGeoResult; timestamp: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

const CATEGORY_RULES: {
  category: OilCatalystCategory;
  keywords: RegExp;
  bullishKeywords: RegExp;
  bearishKeywords: RegExp;
  baseImpact: "high" | "medium" | "low";
}[] = [
  {
    category: "OPEC",
    keywords: /\b(opec|opec\+|oil cartel|production\s*cut|output\s*cut|barrel.{0,20}(cut|reduce|slash)|oil\s*quota)\b/i,
    bullishKeywords: /\b(cut|reduce|slash|curb|tighten|extend.{0,10}cut|deeper.{0,10}cut|compliance|withhold)\b/i,
    bearishKeywords: /\b(increase|boost|ramp|ease|unwind|lift.{0,10}cut|abandon.{0,10}cut|exceed.{0,10}quota|pump more|over.?produce)\b/i,
    baseImpact: "high",
  },
  {
    category: "SANCTIONS",
    keywords: /\b(sanction|embargo|ban.{0,15}(oil|crude|petroleum|energy)|restrict.{0,15}(oil|crude|export)|oil.{0,15}sanction|iran.{0,20}(nuclear|deal|sanction)|russia.{0,20}(oil|crude|sanction)|venezuela.{0,20}(oil|sanction))\b/i,
    bullishKeywords: /\b(impose|tighten|expand|new.{0,10}sanction|escalat|restrict|ban|block|seize|penalize)\b/i,
    bearishKeywords: /\b(lift|ease|waiver|exempt|relax|suspend|remove.{0,10}sanction|deal|agree|comply|resume.{0,10}export)\b/i,
    baseImpact: "high",
  },
  {
    category: "CONFLICT",
    keywords: /\b(middle\s*east|strait\s*of\s*hormuz|red\s*sea|houthi|yemen|iran.{0,15}(attack|strike|threat|missile|drone|war|bomb|retaliat)|iraq|libya|israel.{0,15}(iran|war|strike)|saudi.{0,15}(attack|drone|missile)|oil.{0,15}(attack|strike|target)|tanker.{0,15}(attack|seize|hijack|struck|hit)|pipeline.{0,15}(bomb|attack|sabotag)|aramco.{0,15}(attack|strike|drone|missile|target)|kharg\s*island|gulf\s*(war|attack|tension|strike)|oman.{0,15}(tanker|ship|vessel)|camp\s*david.{0,10}iran|us.{0,10}iran.{0,10}war|iran.{0,10}us.{0,10}war|troops.{0,15}(deploy|middle\s*east)|bomber.{0,15}(deploy|launch|strike))\b/i,
    bullishKeywords: /\b(attack|strike|bomb|missile|escalat|threaten|blockade|disrupt|destroy|seize|war|tension|military|deploy|retaliat|struck|hit|target|damage|shoot|intercept|troops)\b/i,
    bearishKeywords: /\b(ceasefire|peace|de.?escalat|diplomacy|negotiate|calm|resolve|withdraw|truce|agree)\b/i,
    baseImpact: "high",
  },
  {
    category: "RESERVES",
    keywords: /\b(strategic\s*(petroleum|oil)\s*reserve|spr\s*(release|draw|sale|fill)|emergency\s*(oil|fuel|diesel)\s*(reserve|stock)|iea.{0,15}(reserve|release|emergency|stock)|g7.{0,15}(oil|reserve|barrel|release)|eu.{0,15}(reserve|diesel|stock|release)|europe.{0,15}(reserve|diesel|stock|release))\b/i,
    bullishKeywords: /\b(fill|refill|halt.{0,10}release|stop.{0,10}sale|rebuild|replenish|buy)\b/i,
    bearishKeywords: /\b(release|draw|sell|deplet|tap|unlock|flood|dump|coordinate.{0,10}release|100\s*million\s*barrel|massive)\b/i,
    baseImpact: "high",
  },
  {
    category: "PIPELINE",
    keywords: /\b(pipeline|nord\s*stream|keystone|druzhba|cpc\s*(terminal|pipeline)|lng\s*terminal|refiner|oil\s*(terminal|port|facility|infrastructure)|aramco\s*refinery)\b/i,
    bullishKeywords: /\b(shut|halt|disrupt|explod|leak|damage|outage|malfunction|delay|cancel|block|suspend|fire|attack)\b/i,
    bearishKeywords: /\b(reopen|restart|resume|repair|complet|commission|expand|new\s*pipeline|approve|online)\b/i,
    baseImpact: "medium",
  },
  {
    category: "INVENTORY",
    keywords: /\b(crude\s*inventor|oil\s*inventor|stockpil|eia.{0,10}(report|data|inventor)|api.{0,10}(report|data|inventor|weekly)|oil\s*storage|cushing|fuel\s*stockpil|diesel\s*stock|gasoline\s*inventor)\b/i,
    bullishKeywords: /\b(draw|decline|fall|drop|deplet|below\s*expect|lower.{0,10}than|surprise.{0,10}draw|tighten)\b/i,
    bearishKeywords: /\b(build|rise|increas|surge|above\s*expect|higher.{0,10}than|surprise.{0,10}build|glut|overflow)\b/i,
    baseImpact: "medium",
  },
  {
    category: "DEMAND",
    keywords: /\b(oil\s*demand|energy\s*demand|china.{0,15}(oil|crude|demand|refin)|india.{0,15}(oil|demand)|global.{0,15}(demand|growth|recession|slowdown)|iea.{0,15}(demand|forecast|outlook)|driving\s*season|travel\s*demand|refin.{0,10}(capacity|throughput|margin|crack))\b/i,
    bullishKeywords: /\b(strong|surge|record|boost|recover|revise\s*up|upgrade|above\s*expect|robust|accelerat)\b/i,
    bearishKeywords: /\b(weak|slow|contract|decline|revise\s*down|downgrade|below\s*expect|recession|slump|crash)\b/i,
    baseImpact: "medium",
  },
  {
    category: "TRADE_POLICY",
    keywords: /\b(tariff.{0,15}(oil|energy|crude)|trade\s*war.{0,15}(oil|energy)|oil.{0,15}tariff|energy.{0,15}tariff|import\s*duty.{0,15}(oil|crude)|export\s*ban.{0,15}(oil|fuel))\b/i,
    bullishKeywords: /\b(tariff|ban|restrict|limit|block|tax|duty|retali)\b/i,
    bearishKeywords: /\b(lift|remove|cut|reduce|exempt|free\s*trade|agree|deal)\b/i,
    baseImpact: "medium",
  },
  {
    category: "PRODUCTION",
    keywords: /\b(oil\s*production|crude\s*output|shale|permian|us\s*oil|rig\s*count|baker\s*hughes|drilling|fracking|oil\s*field|offshore\s*(drill|produc)|north\s*sea|gulf\s*of\s*mexico)\b/i,
    bullishKeywords: /\b(decline|drop|shut|halt|slow|cut|fall|curb|reduce|hurricane|storm|evacuate)\b/i,
    bearishKeywords: /\b(record|surge|increas|ramp|boost|new\s*well|expand|more\s*rig|resume)\b/i,
    baseImpact: "low",
  },
];

const GENERAL_OIL_KEYWORDS = /\b(crude\s*oil|brent|wti|oil\s*price|petroleum|barrel|oil\s*market|energy\s*market|oil\s*rally|oil\s*crash|oil\s*surge|oil\s*plung|oil\s*spike|oil\s*slump|oil\s*drop|oil\s*jump|oil\s*tumbl|oil\s*soar|oil\s*rise|oil\s*gain|oil\s*extend|oil\s*climb)\b/i;

function categorizeEvent(title: string): {
  category: OilCatalystCategory;
  sentiment: "bullish" | "bearish" | "neutral";
  impact: "high" | "medium" | "low";
  score: number;
} {
  for (const rule of CATEGORY_RULES) {
    if (!rule.keywords.test(title)) continue;

    const isBullish = rule.bullishKeywords.test(title);
    const isBearish = rule.bearishKeywords.test(title);

    let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
    let score = 0;
    const impactMultiplier = rule.baseImpact === "high" ? 1.5 : rule.baseImpact === "medium" ? 1.0 : 0.6;

    if (isBullish && !isBearish) {
      sentiment = "bullish";
      score = Math.round(35 * impactMultiplier);
    } else if (isBearish && !isBullish) {
      sentiment = "bearish";
      score = Math.round(-35 * impactMultiplier);
    } else if (isBullish && isBearish) {
      sentiment = "neutral";
      score = 0;
    }

    return { category: rule.category, sentiment, impact: rule.baseImpact, score };
  }

  return { category: "GENERAL", sentiment: "neutral", impact: "low", score: 0 };
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

interface GDELTArticle {
  title: string;
  url: string;
  domain: string;
  seendate: string;
}

interface GNewsArticle {
  title: string;
  description: string;
  url: string;
  source: { name: string; url: string };
  publishedAt: string;
}

interface CurrentsArticle {
  title: string;
  description: string;
  url: string;
  author: string;
  published: string;
  category: string[];
}

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

function parseRSSItems(xml: string, sourceName: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] ?? "";
    const link = block.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1] ?? "";
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
    if (title) {
      items.push({ title: title.trim(), link: link.trim(), pubDate, source: sourceName });
    }
  }
  return items;
}

async function fetchRSSFeeds(): Promise<OilGeoEvent[]> {
  const feeds = [
    { url: "https://oilprice.com/rss/main", name: "OilPrice.com" },
    { url: "https://news.google.com/rss/search?q=crude+oil+geopolitical+when:3d&hl=en-US&gl=US&ceid=US:en", name: "Google News" },
    { url: "https://news.google.com/rss/search?q=OPEC+oil+sanctions+attack+when:3d&hl=en-US&gl=US&ceid=US:en", name: "Google News" },
    { url: "https://news.google.com/rss/search?q=oil+reserves+release+OR+tanker+attack+OR+aramco+when:3d&hl=en-US&gl=US&ceid=US:en", name: "Google News" },
  ];

  const events: OilGeoEvent[] = [];

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(feed.url, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRSSItems(xml, feed.name);
      } catch {
        return [];
      } finally {
        clearTimeout(timeout);
      }
    })
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value) {
      const isOilRelated =
        GENERAL_OIL_KEYWORDS.test(item.title) ||
        CATEGORY_RULES.some((r) => r.keywords.test(item.title));
      if (!isOilRelated) continue;

      const { category, sentiment, impact, score } = categorizeEvent(item.title);
      events.push({
        title: item.title,
        url: item.link,
        source: item.source,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        category,
        sentiment,
        impact,
        score,
      });
    }
  }

  return events;
}

async function fetchGDELT(): Promise<OilGeoEvent[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const query = '(crude oil OR OPEC OR "oil sanctions" OR "oil pipeline" OR brent OR WTI OR "strait of hormuz" OR "oil reserves" OR aramco OR kharg OR tanker attack OR "oil price" OR houthi OR "middle east" oil OR "strategic petroleum" OR diesel reserves OR G7 oil) sourcelang:eng';
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=75&format=json&sort=datedesc&timespan=4320`;
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });

    let allArticles: GDELTArticle[] = [];
    if (res.ok) {
      const data = await res.json();
      if (data.articles) {
        allArticles = data.articles;
      }
    }

    const seen = new Set<string>();
    const events: OilGeoEvent[] = [];

    for (const article of allArticles) {
      if (!article.title || seen.has(article.title)) continue;
      seen.add(article.title);

      const isOilRelated =
        GENERAL_OIL_KEYWORDS.test(article.title) ||
        CATEGORY_RULES.some((r) => r.keywords.test(article.title));

      if (!isOilRelated) continue;

      const { category, sentiment, impact, score } = categorizeEvent(article.title);

      events.push({
        title: article.title,
        url: article.url,
        source: article.domain ?? "GDELT",
        publishedAt: article.seendate
          ? new Date(
              article.seendate.replace(
                /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
                "$1-$2-$3T$4:$5:$6Z"
              )
            ).toISOString()
          : new Date().toISOString(),
        category,
        sentiment,
        impact,
        score,
      });
    }

    return events;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGNews(): Promise<OilGeoEvent[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const query = "crude oil OR OPEC OR oil sanctions OR oil attack OR oil reserves OR tanker attack OR aramco";
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=10&sortby=publishedAt&apikey=${apiKey}`;
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });

    let allArticles: GNewsArticle[] = [];
    if (res.ok) {
      const data = await res.json();
      if (data.articles) {
        allArticles = data.articles;
      }
    }

    const seen = new Set<string>();
    const events: OilGeoEvent[] = [];

    for (const article of allArticles) {
      const text = `${article.title} ${article.description ?? ""}`;
      if (seen.has(article.title)) continue;
      seen.add(article.title);

      const isOilRelated =
        GENERAL_OIL_KEYWORDS.test(text) ||
        CATEGORY_RULES.some((r) => r.keywords.test(text));

      if (!isOilRelated) continue;

      const { category, sentiment, impact, score } = categorizeEvent(text);

      events.push({
        title: article.title,
        url: article.url,
        source: article.source?.name ?? "GNews",
        publishedAt: article.publishedAt ?? new Date().toISOString(),
        category,
        sentiment,
        impact,
        score,
      });
    }

    return events;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCurrentsAPI(): Promise<OilGeoEvent[]> {
  const apiKey = process.env.CURRENTS_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const url = `https://api.currentsapi.services/v1/search?keywords=crude oil OPEC sanctions attack reserves&language=en&apiKey=${apiKey}`;
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });

    if (!res.ok) return [];
    const data = await res.json();
    const articles: CurrentsArticle[] = data.news ?? [];

    const events: OilGeoEvent[] = [];
    for (const article of articles.slice(0, 15)) {
      const text = `${article.title} ${article.description ?? ""}`;
      const isOilRelated =
        GENERAL_OIL_KEYWORDS.test(text) ||
        CATEGORY_RULES.some((r) => r.keywords.test(text));
      if (!isOilRelated) continue;

      const { category, sentiment, impact, score } = categorizeEvent(text);
      events.push({
        title: article.title,
        url: article.url,
        source: "Currents",
        publishedAt: article.published ? new Date(article.published).toISOString() : new Date().toISOString(),
        category,
        sentiment,
        impact,
        score,
      });
    }

    return events;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOilPriceContext(): Promise<OilGeoResult["priceContext"]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const [markRes, dailyRes] = await Promise.all([
      fetch("https://api.strikefinance.org/price?slug=WTI-USD", { signal: controller.signal, cache: "no-store" }),
      fetch("https://api.strikefinance.org/klines?slug=WTI-USD&resolution=1D&limit=7", { signal: controller.signal, cache: "no-store" }),
    ]);
    clearTimeout(timeout);

    let current = 0;
    if (markRes.ok) {
      const data = await markRes.json();
      current = parseFloat(data.p) || 0;
    }

    let change24h = 0;
    let changePct24h = 0;
    let weekHigh = 0;
    let weekLow = Infinity;
    if (dailyRes.ok) {
      const candles = await dailyRes.json();
      if (Array.isArray(candles) && candles.length >= 2) {
        const prevClose = parseFloat(String(candles[candles.length - 2]?.[4])) || 0;
        if (prevClose > 0 && current > 0) {
          change24h = Math.round((current - prevClose) * 100) / 100;
          changePct24h = Math.round(((current - prevClose) / prevClose) * 10000) / 100;
        }
        for (const c of candles) {
          const high = parseFloat(String(c[2])) || 0;
          const low = parseFloat(String(c[3])) || 0;
          if (high > weekHigh) weekHigh = high;
          if (low < weekLow && low > 0) weekLow = low;
        }
      }
    }

    if (current === 0) return null;
    return {
      current: Math.round(current * 100) / 100,
      change24h,
      changePct24h,
      weekHigh: Math.round(weekHigh * 100) / 100,
      weekLow: weekLow === Infinity ? 0 : Math.round(weekLow * 100) / 100,
    };
  } catch {
    return null;
  }
}

export async function getOilGeopoliticalNews(): Promise<OilGeoResult> {
  if (geoCache && Date.now() - geoCache.timestamp < CACHE_TTL) {
    return geoCache.data;
  }

  const [rssEvents, gdeltEvents, gnewsEvents, currentsEvents, priceContext] = await Promise.all([
    fetchRSSFeeds(),
    fetchGDELT(),
    fetchGNews(),
    fetchCurrentsAPI(),
    fetchOilPriceContext(),
  ]);

  const seen = new Set<string>();
  const merged: OilGeoEvent[] = [];

  for (const e of [...rssEvents, ...gnewsEvents, ...currentsEvents, ...gdeltEvents]) {
    const key = e.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(e);
  }

  merged.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const scored = merged.filter((e) => e.score !== 0);
  const recentHighImpact = scored.filter(
    (e) => e.impact === "high" && Date.now() - new Date(e.publishedAt).getTime() < 12 * 60 * 60 * 1000
  );

  let avgScore = 0;
  if (scored.length > 0) {
    const recentWeight = 2.0;
    const normalWeight = 1.0;
    let totalWeight = 0;
    let weightedSum = 0;
    for (const e of scored) {
      const age = Date.now() - new Date(e.publishedAt).getTime();
      const isRecent = age < 6 * 60 * 60 * 1000;
      const w = isRecent ? recentWeight : normalWeight;
      weightedSum += e.score * w;
      totalWeight += w;
    }
    avgScore = Math.round(weightedSum / totalWeight);
  }

  if (recentHighImpact.length >= 3) {
    const hiAvg = Math.round(
      recentHighImpact.reduce((s, e) => s + e.score, 0) / recentHighImpact.length
    );
    avgScore = Math.round(avgScore * 0.4 + hiAvg * 0.6);
  }

  const catMap = new Map<OilCatalystCategory, { count: number; totalScore: number }>();
  for (const e of merged) {
    const existing = catMap.get(e.category) ?? { count: 0, totalScore: 0 };
    existing.count++;
    existing.totalScore += e.score;
    catMap.set(e.category, existing);
  }

  const categoryBreakdown = Array.from(catMap.entries())
    .map(([category, { count, totalScore }]) => ({
      category,
      count,
      avgScore: Math.round(totalScore / count),
    }))
    .sort((a, b) => b.count - a.count);

  const result: OilGeoResult = {
    score: Math.max(-100, Math.min(100, avgScore)),
    label: sentimentLabel(avgScore),
    eventCount: merged.length,
    events: merged.slice(0, 25),
    lastUpdated: new Date().toISOString(),
    categoryBreakdown,
    priceContext,
  };

  geoCache = { data: result, timestamp: Date.now() };
  return result;
}
