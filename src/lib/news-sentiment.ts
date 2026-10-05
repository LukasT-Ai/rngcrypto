import { fetchFeedList, gnq, PRICE_UP, PRICE_DOWN, type RawItem } from "./catalyst-news";

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

// CryptoPanic's free endpoint was retired; crypto headlines now come from the same RSS
// aggregation the catalyst engine uses, scored by vocabulary instead of votes.
const FEEDS = [
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", name: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", name: "Cointelegraph" },
  { url: "https://decrypt.co/feed", name: "Decrypt" },
  { url: "https://www.theblock.co/rss.xml", name: "The Block" },
  { url: gnq("(crypto OR bitcoin OR ethereum OR altcoin) when:1d"), name: "Google News" },
];

const BULL =
  /\b(inflow|approv|adopt|buy|bought|accumulat|partnership|launch|upgrade|record|bullish|breakout|green\s*light|clarity|integrat|treasury\s*purchase|institutional\s*demand|short\s*squeeze)\w*/i;
const BEAR =
  /\b(outflow|hack|exploit|lawsuit|ban|sell-?off|liquidat|bearish|crackdown|delay|bankrupt|insolven|depeg|probe|charge|fine|halt|freeze|dump|capitulat)\w*/i;

let itemCache: { items: RawItem[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

function count(re: RegExp, s: string): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (s.match(g) ?? []).length;
}

function scoreTitle(title: string): number {
  const bull = count(BULL, title) + count(PRICE_UP, title);
  const bear = count(BEAR, title) + count(PRICE_DOWN, title);
  const net = bull - bear;
  if (net === 0) return 0;
  return Math.max(-100, Math.min(100, net * 30));
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

async function loadItems(): Promise<RawItem[]> {
  if (itemCache && Date.now() - itemCache.timestamp < CACHE_TTL) return itemCache.items;
  const { items } = await fetchFeedList(FEEDS);
  const seen = new Set<string>();
  const cutoff = Date.now() - 48 * 3600e3;
  const deduped = items
    .filter((it) => {
      const k = it.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      const t = new Date(it.publishedAt).getTime();
      return !Number.isFinite(t) || t >= cutoff;
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  itemCache = { items: deduped, timestamp: Date.now() };
  return deduped;
}

const NAME: Record<string, RegExp> = {
  BTC: /bitcoin|\bbtc\b/i,
  ETH: /ethereum|\beth\b/i,
  SOL: /solana|\bsol\b/i,
  ADA: /cardano|\$ada\b/i,
  XRP: /\bxrp\b|ripple/i,
  BNB: /\bbnb\b|binance/i,
  NEAR: /\bnear\s*protocol|\bnear\b(?=.{0,30}(token|crypto|protocol))/i,
  HYPE: /hyperliquid|\bhype\b/i,
  ZEC: /zcash|\bzec\b/i,
  PUMP: /pump\.?fun|\bpump\b(?=.{0,20}token)/i,
  NIGHT: /midnight\s*network|\bnight\b(?=.{0,20}(token|midnight))/i,
  CRCL: /\bcircle\b|\bcrcl\b|usdc/i,
  COIN: /coinbase/i,
  MINIMAX: /minimax/i,
  SPCX: /spacex/i,
  DRAM: /\bdram\b/i,
};

function aggregate(items: RawItem[]): NewsSentimentResult {
  const scored = items.slice(0, 60).map((it) => {
    const s = scoreTitle(it.title);
    return { title: it.title, sentiment: headlineSentiment(s), source: it.source, url: it.url, publishedAt: it.publishedAt, score: s };
  });
  const nonZero = scored.filter((h) => h.score !== 0);
  const pool = nonZero.length > 0 ? nonZero : scored;
  const avg = pool.length > 0 ? Math.round(pool.reduce((s, h) => s + h.score, 0) / pool.length) : 0;
  return { score: Math.max(-100, Math.min(100, avg)), label: sentimentLabel(avg), headlines: scored.slice(0, 10) };
}

export async function getNewsSentiment(symbol?: string): Promise<NewsSentimentResult> {
  try {
    const items = await loadItems();
    if (!symbol) return aggregate(items);
    const re = NAME[symbol.toUpperCase()] ?? new RegExp(`\\b${symbol}\\b`, "i");
    const mine = items.filter((it) => re.test(it.title));
    if (mine.length < 2) return { ...aggregate(items), headlines: aggregate(items).headlines.slice(0, 5) };
    return aggregate(mine);
  } catch {
    return { score: 0, label: "Neutral", headlines: [] };
  }
}
