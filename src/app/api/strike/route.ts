import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { readPushFile, freshness } from "@/lib/push-cache";

const CACHE_NAME = "strike-stats-cache.json";
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

// Empty defaults for when no data is available
function emptyOverview() {
  return {
    stats: {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0,
      totalPnl: 0, avgPnl: 0, bestTrade: 0, worstTrade: 0,
    },
    accountValue: 0,
    accountEquity: 0,
    marginUsage: 0,
    assets: [],
    strategyBreakdown: [],
    recentTrades: [],
    dailyStats: [],
  };
}

function emptyTimeline() {
  return { timeline: [], dailyStats: [] };
}

function emptyLive() {
  return { openPositions: [], recentTrades: [], hourlyRate: [] };
}

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 60);
  if (blocked) return blocked;

  const view = req.nextUrl.searchParams.get("view") ?? "overview";
  const push = readPushCache();
  const last = push ?? readPushCache(true);
  const meta = freshness(last?._pushedAt ?? null, PUSH_MAX_AGE);

  try {
    let body: unknown;

    switch (view) {
      case "overview": {
        const ov = (push?.overview ?? last?.overview ?? memCached("strike-overview", emptyOverview)) as Record<string, unknown>;
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
          body = memCached("strike-trades", () => ({ trades: [] }));
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
          body = memCached(`strike-timeline-${days}`, emptyTimeline);
        }
        break;
      }

      case "live": {
        const lv = (push?.live ?? last?.live ?? memCached("strike-live", emptyLive)) as Record<string, unknown>;
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
    console.error("[strike-api]", err);
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
        : "Unknown error reading Strike data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
