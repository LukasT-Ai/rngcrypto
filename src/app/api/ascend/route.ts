import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
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

const CACHE_PATH = path.join(process.cwd(), "data", "stats-cache.json");
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
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as PushCache;
    if (!allowStale && Date.now() - raw._pushedAt > PUSH_MAX_AGE) return null;
    return raw;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const view = req.nextUrl.searchParams.get("view") ?? "overview";
  const push = readPushCache();

  try {
    let body: unknown;

    switch (view) {
      case "overview": {
        body =
          push?.overview ??
          memCached("overview", () => ({
            stats: getOverallStats(),
            assets: getAssetBreakdown(),
            strategyBreakdown: getStrategyBreakdown(),
            recentTrades: getRecentTrades(10),
            dailyStats: getDailyStats(14),
          }));
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
        body =
          push?.live ??
          memCached("live", () => ({
            openPositions: getOpenPositions(),
            recentTrades: getRecentTrades(5),
            hourlyRate: getHourlyTradeRate(),
          }));
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
        "X-Data-Source": push ? "push" : "sqlite",
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
