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
  | "GENERAL";

export interface OilGeoResult {
  score: number;
  label: string;
  eventCount: number;
  events: OilGeoEvent[];
  lastUpdated: string;
  categoryBreakdown: { category: OilCatalystCategory; count: number; avgScore: number }[];
}

let geoCache: { data: OilGeoResult; timestamp: number } | null = null;
const CACHE_TTL = 3 * 60 * 1000;

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
    keywords: /\b(middle\s*east|strait\s*of\s*hormuz|red\s*sea|houthi|yemen|iran.{0,15}(attack|strike|threat|missile|drone)|iraq|libya|israel.{0,15}(iran|war|strike)|saudi.{0,15}(attack|drone|missile)|oil.{0,15}(attack|strike|target)|tanker.{0,15}(attack|seize|hijack)|pipeline.{0,15}(bomb|attack|sabotag))\b/i,
    bullishKeywords: /\b(attack|strike|bomb|missile|escalat|threaten|blockade|disrupt|destroy|seize|war|tension|military|deploy|retaliat)\b/i,
    bearishKeywords: /\b(ceasefire|peace|de.?escalat|diplomacy|negotiate|calm|resolve|withdraw|truce|agree)\b/i,
    baseImpact: "high",
  },
  {
    category: "PIPELINE",
    keywords: /\b(pipeline|nord\s*stream|keystone|druzhba|cpc\s*(terminal|pipeline)|lng\s*terminal|refiner|oil\s*(terminal|port|facility|infrastructure))\b/i,
    bullishKeywords: /\b(shut|halt|disrupt|explod|leak|damage|outage|malfunction|delay|cancel|block|suspend)\b/i,
    bearishKeywords: /\b(reopen|restart|resume|repair|complet|commission|expand|new\s*pipeline|approve|online)\b/i,
    baseImpact: "medium",
  },
  {
    category: "INVENTORY",
    keywords: /\b(crude\s*inventor|oil\s*inventor|stockpil|strategic\s*petroleum|spr|eia.{0,10}(report|data|inventor)|api.{0,10}(report|data|inventor)|oil\s*storage|cushing)\b/i,
    bullishKeywords: /\b(draw|decline|fall|drop|deplet|below\s*expect|lower.{0,10}than|surprise.{0,10}draw|tighten)\b/i,
    bearishKeywords: /\b(build|rise|increas|surge|above\s*expect|higher.{0,10}than|surprise.{0,10}build|glut|overflow)\b/i,
    baseImpact: "medium",
  },
  {
    category: "DEMAND",
    keywords: /\b(oil\s*demand|energy\s*demand|china.{0,15}(oil|crude|demand|refin)|india.{0,15}(oil|demand)|global.{0,15}(demand|growth|recession|slowdown)|iea.{0,15}(demand|forecast|outlook)|driving\s*season|travel\s*demand)\b/i,
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

const GENERAL_OIL_KEYWORDS = /\b(crude\s*oil|brent|wti|oil\s*price|petroleum|barrel|oil\s*market|energy\s*market|oil\s*rally|oil\s*crash|oil\s*surge|oil\s*plung|oil\s*spike|oil\s*slump|oil\s*drop|oil\s*jump|oil\s*tumbl|oil\s*soar)\b/i;

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
  socialimage?: string;
  language?: string;
}

interface GNewsArticle {
  title: string;
  description: string;
  url: string;
  source: { name: string; url: string };
  publishedAt: string;
}

async function fetchGDELT(): Promise<OilGeoEvent[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const queries = [
      "crude oil OPEC sanctions",
      "oil pipeline attack middle east",
      "oil production inventory demand",
    ];
    const allArticles: GDELTArticle[] = [];

    for (const q of queries) {
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=30&format=json&sort=datedesc&timespan=1440`;
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.articles) {
        allArticles.push(...data.articles);
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
    const queries = [
      "crude oil OPEC production",
      "oil sanctions conflict pipeline",
    ];
    const allArticles: GNewsArticle[] = [];

    for (const q of queries) {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=10&sortby=publishedAt&apikey=${apiKey}`;
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.articles) {
        allArticles.push(...data.articles);
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

export async function getOilGeopoliticalNews(): Promise<OilGeoResult> {
  if (geoCache && Date.now() - geoCache.timestamp < CACHE_TTL) {
    return geoCache.data;
  }

  const [gdeltEvents, gnewsEvents] = await Promise.all([
    fetchGDELT(),
    fetchGNews(),
  ]);

  const seen = new Set<string>();
  const merged: OilGeoEvent[] = [];

  for (const e of [...gnewsEvents, ...gdeltEvents]) {
    const key = e.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(e);
  }

  merged.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const scored = merged.filter((e) => e.score !== 0);
  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, e) => sum + e.score, 0) / scored.length)
      : 0;

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
    events: merged.slice(0, 20),
    lastUpdated: new Date().toISOString(),
    categoryBreakdown,
  };

  geoCache = { data: result, timestamp: Date.now() };
  return result;
}
