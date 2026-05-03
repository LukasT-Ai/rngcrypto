import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { existsSync } from "fs";

const WALLET = "0xedEDeb617112E8dA52294f12C1950A06CD5C2286";
const HL_API = "https://api.hyperliquid.xyz/info";

const BOT_DB_PATH = path.resolve("C:/Users/Lukas/crypto-bot/data/rng-daytrader.db");

interface TrackedPositionInfo {
  strategy: string;
  openedAt: number;
}

function getTrackedPositions(): Map<string, TrackedPositionInfo> {
  const map = new Map<string, TrackedPositionInfo>();
  if (!existsSync(BOT_DB_PATH)) return map;
  try {
    const db = new Database(BOT_DB_PATH, { readonly: true, fileMustExist: true });
    const row = db.prepare("SELECT value FROM bot_state WHERE key = ?").get("tracked_positions") as { value: string } | undefined;
    db.close();
    if (!row?.value) return map;
    const positions = JSON.parse(row.value) as Array<{ symbol?: string; strategy?: string; side?: string; openedAt?: number }>;
    for (const p of positions) {
      if (p.symbol && p.strategy) {
        const asset = p.symbol.replace(/\/USDC.*$/, "");
        map.set(`${asset}-${p.side}`, { strategy: p.strategy, openedAt: p.openedAt ?? 0 });
      }
    }
  } catch { /* db not available */ }
  return map;
}

// ---------------------------------------------------------------------------
// In-memory cache (30s TTL)
// ---------------------------------------------------------------------------
type CacheEntry = { data: unknown; timestamp: number };
const memCache = new Map<string, CacheEntry>();
const MEM_TTL = 30_000;

async function memCached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const entry = memCache.get(key);
  if (entry && Date.now() - entry.timestamp < MEM_TTL) {
    return entry.data as T;
  }
  const data = await fn();
  memCache.set(key, { data, timestamp: Date.now() });
  return data;
}

// ---------------------------------------------------------------------------
// Hyperliquid API helpers
// ---------------------------------------------------------------------------
async function hlPost<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(HL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Hyperliquid API ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// -- Types matching Hyperliquid responses --

interface HlPosition {
  position: {
    coin: string;
    szi: string;
    entryPx: string;
    leverage: { type: string; value: number };
    liquidationPx: string | null;
    unrealizedPnl: string;
    marginUsed: string;
    returnOnEquity: string;
    cumFunding: { allTime: string; sinceOpen: string; sinceChange: string };
  };
}

interface HlClearinghouseState {
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  withdrawable: string;
  assetPositions: HlPosition[];
}

interface HlFill {
  coin: string;
  side: string; // "A" = buy, "B" = sell
  px: string;
  sz: string;
  time: number;
  closedPnl: string;
  dir: string;
  oid: number;
  crossed: boolean;
  fee: string;
  startPosition: string;
  hash: string;
}

async function getClearinghouseState(): Promise<HlClearinghouseState> {
  return hlPost<HlClearinghouseState>({
    type: "clearinghouseState",
    user: WALLET,
  });
}

async function getUserFills(): Promise<HlFill[]> {
  return hlPost<HlFill[]>({ type: "userFills", user: WALLET });
}

// ---------------------------------------------------------------------------
// Data processing
// ---------------------------------------------------------------------------

interface ProcessedTrade {
  id: string;
  asset: string;
  side: string;
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  leverage: number | null;
  openedAt: string;
  closedAt: string;
  closeReason: string;
  fee: number;
}

function sideLabel(s: string): string {
  return s === "A" ? "long" : "short";
}

const TRADE_HISTORY_CUTOFF = new Date("2026-05-03T00:00:00Z").getTime();

function processFillsIntoTrades(fills: HlFill[]): ProcessedTrade[] {
  return fills
    .filter((f) => parseFloat(f.closedPnl) !== 0 && f.time >= TRADE_HISTORY_CUTOFF)
    .sort((a, b) => b.time - a.time)
    .map((f) => ({
      id: f.hash,
      asset: f.coin,
      side: sideLabel(f.side === "A" ? "B" : "A"), // closing side is opposite of position side
      entryPrice: 0, // not available per-fill; set 0
      exitPrice: parseFloat(f.px),
      size: parseFloat(f.sz),
      pnl: parseFloat(f.closedPnl),
      leverage: null,
      openedAt: new Date(f.time).toISOString(),
      closedAt: new Date(f.time).toISOString(),
      closeReason: "filled",
      fee: parseFloat(f.fee),
    }));
}

interface AssetStats {
  asset: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
}

function computeAssetBreakdown(trades: ProcessedTrade[]): AssetStats[] {
  const map = new Map<
    string,
    { trades: number; wins: number; losses: number; totalPnl: number }
  >();
  for (const t of trades) {
    const s = map.get(t.asset) ?? { trades: 0, wins: 0, losses: 0, totalPnl: 0 };
    s.trades++;
    if (t.pnl > 0) s.wins++;
    else s.losses++;
    s.totalPnl += t.pnl;
    map.set(t.asset, s);
  }
  return Array.from(map.entries())
    .map(([asset, s]) => ({
      asset,
      trades: s.trades,
      wins: s.wins,
      losses: s.losses,
      winRate: s.trades > 0 ? Math.round((s.wins / s.trades) * 10000) / 100 : 0,
      totalPnl: Math.round(s.totalPnl * 100) / 100,
      avgPnl: s.trades > 0 ? Math.round((s.totalPnl / s.trades) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.totalPnl - a.totalPnl);
}

interface DailyStat {
  date: string;
  trades: number;
  wins: number;
  winRate: number;
  pnl: number;
}

function computeDailyStats(trades: ProcessedTrade[], days: number): DailyStat[] {
  const cutoff = Date.now() - days * 86_400_000;
  const map = new Map<
    string,
    { trades: number; wins: number; pnl: number }
  >();
  for (const t of trades) {
    const ts = new Date(t.closedAt).getTime();
    if (ts < cutoff) continue;
    const date = t.closedAt.slice(0, 10);
    const s = map.get(date) ?? { trades: 0, wins: 0, pnl: 0 };
    s.trades++;
    if (t.pnl > 0) s.wins++;
    s.pnl += t.pnl;
    map.set(date, s);
  }
  return Array.from(map.entries())
    .map(([date, s]) => ({
      date,
      trades: s.trades,
      wins: s.wins,
      winRate: s.trades > 0 ? Math.round((s.wins / s.trades) * 10000) / 100 : 0,
      pnl: Math.round(s.pnl * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

interface TimelinePoint {
  timestamp: string;
  cumulativePnl: number;
  tradePnl: number;
}

function computeTimeline(trades: ProcessedTrade[], days: number): TimelinePoint[] {
  const cutoff = Date.now() - days * 86_400_000;
  const sorted = [...trades]
    .filter((t) => new Date(t.closedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime());

  let cum = 0;
  return sorted.map((t) => {
    cum += t.pnl;
    return {
      timestamp: t.closedAt,
      cumulativePnl: Math.round(cum * 100) / 100,
      tradePnl: Math.round(t.pnl * 100) / 100,
    };
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const view = req.nextUrl.searchParams.get("view") ?? "overview";

  try {
    let body: unknown;

    switch (view) {
      case "overview": {
        body = await memCached("overview", async () => {
          const [state, fills] = await Promise.all([
            getClearinghouseState(),
            getUserFills(),
          ]);
          const trades = processFillsIntoTrades(fills);
          const wins = trades.filter((t) => t.pnl > 0).length;
          const losses = trades.filter((t) => t.pnl <= 0).length;
          const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
          const pnls = trades.map((t) => t.pnl);

          return {
            stats: {
              totalTrades: trades.length,
              wins,
              losses,
              winRate:
                trades.length > 0
                  ? Math.round((wins / trades.length) * 10000) / 100
                  : 0,
              totalPnl: Math.round(totalPnl * 100) / 100,
              avgPnl:
                trades.length > 0
                  ? Math.round((totalPnl / trades.length) * 100) / 100
                  : 0,
              bestTrade: pnls.length > 0 ? Math.round(Math.max(...pnls) * 100) / 100 : 0,
              worstTrade: pnls.length > 0 ? Math.round(Math.min(...pnls) * 100) / 100 : 0,
              accountValue: parseFloat(state.marginSummary.accountValue),
              withdrawable: parseFloat(state.withdrawable),
            },
            assets: computeAssetBreakdown(trades),
            recentTrades: trades.slice(0, 10),
            dailyStats: computeDailyStats(trades, 14),
          };
        });
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
        body = await memCached(`trades-${limit}`, async () => {
          const fills = await getUserFills();
          const trades = processFillsIntoTrades(fills);
          return { trades: trades.slice(0, limit) };
        });
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
        body = await memCached(`timeline-${days}`, async () => {
          const fills = await getUserFills();
          const trades = processFillsIntoTrades(fills);
          return {
            timeline: computeTimeline(trades, days),
            dailyStats: computeDailyStats(trades, days),
          };
        });
        break;
      }

      case "live": {
        body = await memCached("live", async () => {
          const [state, fills] = await Promise.all([
            getClearinghouseState(),
            getUserFills(),
          ]);
          const trades = processFillsIntoTrades(fills);

          const trackedMap = getTrackedPositions();
          const openPositions = state.assetPositions
            .filter((p) => parseFloat(p.position.szi) !== 0)
            .map((p) => {
              const size = parseFloat(p.position.szi);
              const side = size > 0 ? "long" : "short";
              const asset = p.position.coin;
              const tracked = trackedMap.get(`${asset}-${side}`);
              const marginUsed = parseFloat(p.position.marginUsed);
              const unrealizedPnl = parseFloat(p.position.unrealizedPnl);
              const roe = parseFloat(p.position.returnOnEquity ?? "0") * 100;
              const entryPrice = parseFloat(p.position.entryPx);
              const absSize = Math.abs(size);
              const markPrice = absSize > 0
                ? (side === "long"
                    ? entryPrice + unrealizedPnl / absSize
                    : entryPrice - unrealizedPnl / absSize)
                : entryPrice;
              return {
                asset,
                side,
                entryPrice,
                markPrice,
                size: absSize,
                leverage: p.position.leverage.value,
                unrealizedPnl,
                marginUsed,
                liquidationPrice: p.position.liquidationPx
                  ? parseFloat(p.position.liquidationPx)
                  : null,
                strategy: tracked?.strategy ?? null,
                roe,
                fundingAccrued: parseFloat(p.position.cumFunding?.sinceOpen ?? "0"),
                openedAt: tracked?.openedAt ?? null,
              };
            });

          return {
            openPositions,
            accountValue: parseFloat(state.marginSummary.accountValue),
            withdrawable: parseFloat(state.withdrawable),
            recentTrades: trades.slice(0, 5),
          };
        });
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
        "X-Data-Source": "hyperliquid",
      },
    });
  } catch (err) {
    console.error("[hype-api]", err);
    const message =
      err instanceof Error
        ? err.message
        : "Unknown error fetching Hyperliquid data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
