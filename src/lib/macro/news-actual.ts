import type { RawItem } from "../catalyst-news";
import { fetchFeedList, gnq } from "../catalyst-news";

// Headline-derived actual for releases that no calendar carries quickly. Today: the API weekly crude number,
// which Reuters/OilPrice/Investing report within minutes ("API: US crude stocks fell 3.2 million barrels").
// Sign convention matches EIA: negative = draw, positive = build, in million barrels.

export interface NewsActual {
  value: number;
  raw: string;
  headline: string;
  url: string;
  source: string;
  publishedAt: string;
}

const DRAW = /\b(fell|fall|falls|dropped|drop|drops|declined|decline|declines|decrease[sd]?|draw(?:down)?|drew|down|shrank|slid|slipped)\b/i;
const BUILD = /\b(rose|rise|rises|increased|increase[sd]?|build|built|climbed|climb|climbs|gained|gain|gains|grew|jumped|jump|up)\b/i;
const NUM = /(-?\d+(?:\.\d+)?)\s*(?:million|mln|mn|m\b|mb\b)/i;
const API_CRUDE = /\bAPI\b[^.]{0,80}\b(crude|oil)\b[^.]{0,80}\b(inventor|stock|supplies|supply)/i;

export function parseApiCrudeHeadline(title: string, description = ""): number | null {
  // Normalise before matching: "U.S." has periods that would break the sentence/relevance patterns, and wires
  // often spell out the institute instead of the acronym.
  const text = `${title}. ${description}`
    .replace(/\s+/g, " ")
    .replace(/\bU\.S\.(?=\s|$)/g, "US")
    .replace(/\bAmerican Petroleum Institute\b/gi, "API");
  if (!API_CRUDE.test(text)) return null;
  // Work on the sentence that mentions API to avoid picking up the EIA forecast in the same article.
  // Split on sentence ends followed by a capital so "U.S. crude" does not split.
  const sentence = text.split(/(?<=[.!?])\s+(?=[A-Z])/).find((s) => /\bAPI\b/.test(s)) ?? text;
  const n = sentence.match(NUM);
  if (!n) return null;
  let v = Math.abs(parseFloat(n[1]));
  if (!Number.isFinite(v) || v > 30) return null;
  const sign = DRAW.test(sentence) ? -1 : BUILD.test(sentence) ? 1 : 0;
  if (sign === 0) return null;
  v = Math.round(v * sign * 100) / 100;
  return v;
}

const cache = new Map<string, { at: number; items: RawItem[] }>();

async function headlines(key: string, feeds: { url: string; name: string }[], maxAgeMs: number): Promise<RawItem[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.items;
  const { items } = await fetchFeedList(feeds);
  cache.set(key, { at: Date.now(), items });
  return items;
}

export async function newsApiCrudeActual(eventTimeIso: string, maxAgeMs = 20_000): Promise<NewsActual | null> {
  const t0 = new Date(eventTimeIso).getTime();
  const items = await headlines(
    "api_crude",
    [
      { url: gnq('API "crude" (inventories OR stocks OR stockpiles) when:1d'), name: "Google News" },
      { url: gnq('"American Petroleum Institute" crude when:1d'), name: "Google News" },
      { url: "https://oilprice.com/rss/main", name: "OilPrice.com" },
    ],
    maxAgeMs
  );
  const candidates: NewsActual[] = [];
  for (const it of items) {
    const pub = new Date(it.publishedAt).getTime();
    if (!Number.isFinite(pub) || pub < t0 - 30 * 60e3 || pub > t0 + 12 * 3600e3) continue;
    const v = parseApiCrudeHeadline(it.title, it.description);
    if (v == null) continue;
    candidates.push({ value: v, raw: `${v >= 0 ? "+" : ""}${v.toFixed(1)}M bbl`, headline: it.title, url: it.url, source: it.source, publishedAt: it.publishedAt });
  }
  if (candidates.length === 0) return null;
  // Majority by rounded value, then the earliest report of that value.
  const buckets = new Map<number, NewsActual[]>();
  for (const c of candidates) {
    const k = Math.round(c.value * 10) / 10;
    buckets.set(k, [...(buckets.get(k) ?? []), c]);
  }
  const best = [...buckets.values()].sort((a, b) => b.length - a.length || new Date(a[0].publishedAt).getTime() - new Date(b[0].publishedAt).getTime())[0];
  return best.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())[0];
}
