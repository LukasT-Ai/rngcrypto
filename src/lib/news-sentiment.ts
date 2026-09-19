interface CryptoPanicPost {
  title: string;
  url: string;
  source: { title: string };
  published_at: string;
  votes: {
    positive: number;
    negative: number;
    important: number;
    toxic: number;
    liked: number;
    disliked: number;
  };
  currencies?: { code: string }[];
}

interface Headline {
  title: string;
  sentiment: string;
  source: string;
  url: string;
  publishedAt: string;
  score: number;
}

export interface NewsSentimentResult {
  score: number;
  label: string;
  headlines: Headline[];
}

let sentimentCache: { data: NewsSentimentResult; timestamp: number } | null =
  null;
const CACHE_TTL = 5 * 60 * 1000;

function scorePost(post: CryptoPanicPost): number {
  const v = post.votes;
  const bullish = (v.positive ?? 0) + (v.liked ?? 0) + (v.important ?? 0) * 0.3;
  const bearish = (v.negative ?? 0) + (v.disliked ?? 0) + (v.toxic ?? 0) * 0.5;
  const total = bullish + bearish;
  if (total === 0) return 0;
  return Math.round(((bullish - bearish) / total) * 100);
}

function sentimentLabel(score: number): string {
  if (score >= 50) return "Very Bullish";
  if (score >= 20) return "Bullish";
  if (score >= 5) return "Slightly Bullish";
  if (score > -5) return "Neutral";
  if (score > -20) return "Slightly Bearish";
  if (score > -50) return "Bearish";
  return "Very Bearish";
}

function headlineSentiment(score: number): string {
  if (score >= 20) return "bullish";
  if (score > -20) return "neutral";
  return "bearish";
}

async function fetchCryptoPanic(): Promise<NewsSentimentResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      "https://cryptopanic.com/api/free/v1/posts/?public=true",
      { signal: controller.signal, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`CryptoPanic ${res.status}`);
    const data = (await res.json()) as { results?: CryptoPanicPost[] };

    const posts = data.results ?? [];
    if (posts.length === 0) {
      return { score: 0, label: "Neutral", headlines: [] };
    }

    const scored = posts.slice(0, 30).map((p) => {
      const s = scorePost(p);
      return {
        title: p.title,
        sentiment: headlineSentiment(s),
        source: p.source?.title ?? "Unknown",
        url: p.url,
        publishedAt: p.published_at,
        score: s,
        currencies: p.currencies?.map((c) => c.code.toUpperCase()) ?? [],
      };
    });

    const withVotes = scored.filter(
      (h) => h.sentiment !== "neutral" || h.score !== 0
    );
    const aggregatePool = withVotes.length > 0 ? withVotes : scored;
    const avgScore =
      aggregatePool.length > 0
        ? Math.round(
            aggregatePool.reduce((sum, h) => sum + h.score, 0) /
              aggregatePool.length
          )
        : 0;

    return {
      score: Math.max(-100, Math.min(100, avgScore)),
      label: sentimentLabel(avgScore),
      headlines: scored.slice(0, 10).map(({ currencies: _, ...h }) => h),
    };
  } catch {
    return { score: 0, label: "Neutral", headlines: [] };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getNewsSentiment(
  symbol?: string
): Promise<NewsSentimentResult> {
  if (sentimentCache && Date.now() - sentimentCache.timestamp < CACHE_TTL) {
    return filterBySymbol(sentimentCache.data, symbol);
  }

  const result = await fetchCryptoPanic();
  sentimentCache = { data: result, timestamp: Date.now() };
  return filterBySymbol(result, symbol);
}

function filterBySymbol(
  data: NewsSentimentResult,
  symbol?: string
): NewsSentimentResult {
  if (!symbol) return data;

  const sym = symbol.toUpperCase();
  const filtered = data.headlines.filter(
    (h) =>
      h.title.toUpperCase().includes(sym) ||
      h.title.toUpperCase().includes(symbolToName(sym))
  );

  if (filtered.length === 0) return data;

  const avgScore =
    filtered.length > 0
      ? Math.round(
          filtered.reduce((sum, h) => sum + h.score, 0) / filtered.length
        )
      : data.score;

  return {
    score: Math.max(-100, Math.min(100, avgScore)),
    label: sentimentLabel(avgScore),
    headlines: filtered,
  };
}

function symbolToName(sym: string): string {
  const map: Record<string, string> = {
    BTC: "BITCOIN",
    ETH: "ETHEREUM",
    SOL: "SOLANA",
    ADA: "CARDANO",
    XRP: "XRP",
    BNB: "BNB",
    NEAR: "NEAR",
    HYPE: "HYPERLIQUID",
    ZEC: "ZCASH",
    TSLA: "TESLA",
    NVDA: "NVIDIA",
    GOOGL: "GOOGLE",
    GOLD: "GOLD",
    OIL: "OIL",
    SILVER: "SILVER",
    COIN: "COINBASE",
    MU: "MICRON",
  };
  return map[sym] ?? sym;
}
