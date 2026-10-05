import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { readPushFile, freshness } from "@/lib/push-cache";
import {
  getOverallStats,
  getRecentTrades,
  getAssetBreakdown,
  getOpenPositions,
  getPnlTimeline,
  getHourlyTradeRate,
  getDailyStats,
  getStrategyBreakdown,
} from "@/lib/ascend-db";

const CACHE_NAME = "stats-cache.json";
const PUSH_MAX_AGE = 5 * 60_000; // treat push data as fresh for 5 minutes

type CacheEntry = { data: unknown; timestamp: number };
const memCache = new Map<string, CacheEntry>();
const MEM_TTL = 30_000;

function memCached<T>(key: string, fn: () => T): T {
  const entry = memCache.get(key);
  if (entry && Date.now() - entry.timestamp < MEM_TTL) {
    return entry.data as T;
  }
  const data = fn();
  memCache.set(key, { data, timestamp: Date.now() });
  return data;
}

interface PushCache {
  _pushedAt: number;
  overview?: unknown;
  trades?: unknown;
  timeline?: Record<string, unknown>;
  live?: unknown;
}

function readPushCache(allowStale = false): PushCache | null {
  const raw = readPushFile<PushCache>(CACHE_NAME);
  if (!raw) return null;
  if (!allowStale && Date.now() - raw._pushedAt > PUSH_MAX_AGE) return null;
  return raw;
}

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 60);
  if (blocked) return blocked;

  const view = req.nextUrl.searchParams.get("view") ?? "overview";
  const push = readPushCache();
  const last = push ?? readPushCache(true);
  // No push -> we are serving the committed SQLite snapshot; say so with the date of its last trade
  const lastTradeAt = last ? null : (getRecentTrades(1)[0]?.closedAt ?? null);
  const meta = freshness(last?._pushedAt ?? null, PUSH_MAX_AGE, lastTradeAt);

  try {
    let body: unknown;

    switch (view) {
      case "overview": {
        const ov = (push?.overview ??
          last?.overview ??
          memCached("overview", () => ({
            stats: getOverallStats(),
            assets: getAssetBreakdown(),
            strategyBreakdown: getStrategyBreakdown(),
            recentTrades: getRecentTrades(10),
            dailyStats: getDailyStats(14),
          }))) as Record<string, unknown>;
        body = { ...ov, _meta: meta };
        break;
      }

      case "trades": {
        const limit = Math.min(
          Math.max(
            parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50,
            1
          ),
          200
        );
        if (push?.trades) {
          const allTrades = (push.trades as { trades: unknown[] }).trades;
          body = { trades: allTrades.slice(0, limit) };
        } else {
          body = memCached(`trades-${limit}`, () => ({
            trades: getRecentTrades(limit),
          }));
        }
        break;
      }

      case "timeline": {
        const days = Math.min(
          Math.max(
            parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30,
            1
          ),
          365
        );
        const timelineKey = `d${days}`;
        if (push?.timeline?.[timelineKey]) {
          body = push.timeline[timelineKey];
        } else {
          body = memCached(`timeline-${days}`, () => ({
            timeline: getPnlTimeline(days),
            dailyStats: getDailyStats(days),
          }));
        }
        break;
      }

      case "live": {
        const lv = (push?.live ??
          last?.live ??
          memCached("live", () => ({
            openPositions: getOpenPositions(),
            recentTrades: getRecentTrades(5),
            hourlyRate: getHourlyTradeRate(),
          }))) as Record<string, unknown>;
        body = { ...lv, _meta: meta };
        break;
      }

      default:
        return NextResponse.json(
          {
            error: `Unknown view: ${view}`,
            validViews: ["overview", "trades", "timeline", "live"],
          },
          { status: 400 }
        );
    }

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
        "X-Data-Source": meta.source,
        "X-Pushed-At": meta.pushedAt ? String(meta.pushedAt) : "",
      },
    });
  } catch (err) {
    console.error("[ascend-api]", err);
    const stale = readPushCache(true);
    if (stale) {
      const fallback =
        view === "overview" ? stale.overview :
        view === "trades" ? stale.trades :
        view === "live" ? stale.live :
        view === "timeline" ? stale.timeline?.["d30"] : null;
      if (fallback) {
        return NextResponse.json(fallback, {
          headers: { "X-Data-Source": "push-stale" },
        });
      }
    }
    const message =
      err instanceof Error
        ? err.message
        : "Unknown error reading Ascend database";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
