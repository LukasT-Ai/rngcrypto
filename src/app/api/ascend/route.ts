import { NextRequest, NextResponse } from "next/server";
import {
  getOverallStats,
  getRecentTrades,
  getAssetBreakdown,
  getOpenPositions,
  getPnlTimeline,
  getHourlyTradeRate,
  getDailyStats,
} from "@/lib/ascend-db";

type CacheEntry = { data: unknown; timestamp: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30_000; // 30 seconds

function cached<T>(key: string, fn: () => T): T {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data as T;
  }
  const data = fn();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}

export async function GET(req: NextRequest) {
  const view = req.nextUrl.searchParams.get("view") ?? "overview";

  try {
    let body: unknown;

    switch (view) {
      case "overview": {
        body = cached("overview", () => ({
          stats: getOverallStats(),
          assets: getAssetBreakdown(),
          recentTrades: getRecentTrades(10),
          dailyStats: getDailyStats(14),
        }));
        break;
      }

      case "trades": {
        const limit = Math.min(
          Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50, 1),
          200
        );
        body = cached(`trades-${limit}`, () => ({
          trades: getRecentTrades(limit),
        }));
        break;
      }

      case "timeline": {
        const days = Math.min(
          Math.max(parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30, 1),
          365
        );
        body = cached(`timeline-${days}`, () => ({
          timeline: getPnlTimeline(days),
          dailyStats: getDailyStats(days),
        }));
        break;
      }

      case "live": {
        body = cached("live", () => ({
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
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("[ascend-api]", err);
    const message =
      err instanceof Error ? err.message : "Unknown error reading Ascend database";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
