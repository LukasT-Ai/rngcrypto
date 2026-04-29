import Database from "better-sqlite3";
import path from "path";

const DB_PATH =
  process.env.ASCEND_DB_PATH ??
  path.join(process.cwd(), "data", "ascend.db");

function openDb(): Database.Database {
  return new Database(DB_PATH, { readonly: true, fileMustExist: true });
}

function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = openDb();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Asset extraction from market_slug
// ---------------------------------------------------------------------------

function extractAsset(slug: string): string {
  const m = slug.match(/^will-(.+?)-go-up-down-/);
  if (m) return m[1].toUpperCase();
  if (slug.includes("crude_oil")) return "CRUDE OIL";
  return "EVENT";
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

export interface OverallStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  bestTrade: number;
  worstTrade: number;
}

export function getOverallStats(): OverallStats {
  return withDb((db) => {
    const row = db
      .prepare(
        `SELECT
           COUNT(*)                                    AS totalTrades,
           SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)  AS wins,
           SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) AS losses,
           ROUND(SUM(CASE WHEN pnl > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 2) AS winRate,
           ROUND(SUM(pnl), 2)                         AS totalPnl,
           ROUND(AVG(pnl), 2)                         AS avgPnl,
           ROUND(MAX(pnl), 2)                         AS bestTrade,
           ROUND(MIN(pnl), 2)                         AS worstTrade
         FROM positions
         WHERE status = 'closed'`
      )
      .get() as Record<string, number>;

    return {
      totalTrades: row.totalTrades,
      wins: row.wins,
      losses: row.losses,
      winRate: row.winRate,
      totalPnl: row.totalPnl,
      avgPnl: row.avgPnl,
      bestTrade: row.bestTrade,
      worstTrade: row.worstTrade,
    };
  });
}

export interface RecentTrade {
  id: number;
  positionId: string;
  asset: string;
  marketTitle: string;
  side: string;
  entryPrice: number;
  exitPrice: number | null;
  margin: number;
  leverage: number;
  pnl: number;
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
}

export function getRecentTrades(limit = 10): RecentTrade[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT id, position_id, market_slug, market_title, side,
                entry_price, exit_price, margin, leverage, pnl,
                close_reason, opened_at, closed_at
         FROM positions
         WHERE status = 'closed'
         ORDER BY closed_at DESC
         LIMIT ?`
      )
      .all(limit) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: r.id as number,
      positionId: r.position_id as string,
      asset: extractAsset(r.market_slug as string),
      marketTitle: r.market_title as string,
      side: r.side as string,
      entryPrice: r.entry_price as number,
      exitPrice: r.exit_price as number | null,
      margin: r.margin as number,
      leverage: r.leverage as number,
      pnl: r.pnl as number,
      closeReason: r.close_reason as string | null,
      openedAt: r.opened_at as string,
      closedAt: r.closed_at as string | null,
    }));
  });
}

export interface AssetStats {
  asset: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
}

export function getAssetBreakdown(): AssetStats[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT market_slug, pnl FROM positions WHERE status = 'closed'`
      )
      .all() as { market_slug: string; pnl: number }[];

    const map = new Map<
      string,
      { trades: number; wins: number; losses: number; totalPnl: number }
    >();

    for (const r of rows) {
      const asset = extractAsset(r.market_slug);
      const entry = map.get(asset) ?? {
        trades: 0,
        wins: 0,
        losses: 0,
        totalPnl: 0,
      };
      entry.trades++;
      if (r.pnl > 0) entry.wins++;
      else entry.losses++;
      entry.totalPnl += r.pnl;
      map.set(asset, entry);
    }

    return Array.from(map.entries())
      .map(([asset, s]) => ({
        asset,
        trades: s.trades,
        wins: s.wins,
        losses: s.losses,
        winRate: Math.round((s.wins / s.trades) * 10000) / 100,
        totalPnl: Math.round(s.totalPnl * 100) / 100,
        avgPnl: Math.round((s.totalPnl / s.trades) * 100) / 100,
      }))
      .sort((a, b) => b.trades - a.trades);
  });
}

export interface OpenPosition {
  id: number;
  positionId: string;
  asset: string;
  marketTitle: string;
  side: string;
  entryPrice: number;
  margin: number;
  leverage: number;
  tpPrice: number | null;
  slPrice: number | null;
  openedAt: string;
  priceSource: string | null;
}

export function getOpenPositions(): OpenPosition[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT id, position_id, market_slug, market_title, side,
                entry_price, margin, leverage, tp_price, sl_price,
                opened_at, price_source
         FROM positions
         WHERE status = 'open'
         ORDER BY opened_at DESC`
      )
      .all() as Record<string, unknown>[];

    return rows.map((r) => ({
      id: r.id as number,
      positionId: r.position_id as string,
      asset: extractAsset(r.market_slug as string),
      marketTitle: r.market_title as string,
      side: r.side as string,
      entryPrice: r.entry_price as number,
      margin: r.margin as number,
      leverage: r.leverage as number,
      tpPrice: r.tp_price as number | null,
      slPrice: r.sl_price as number | null,
      openedAt: r.opened_at as string,
      priceSource: r.price_source as string | null,
    }));
  });
}

export interface PnlPoint {
  timestamp: string;
  cumulativePnl: number;
  tradePnl: number;
}

export function getPnlTimeline(days = 30): PnlPoint[] {
  return withDb((db) => {
    const groupBy = days <= 3 ? "hour" : "day";
    const dateFormat =
      groupBy === "hour" ? "%Y-%m-%d %H:00:00" : "%Y-%m-%d";

    const rows = db
      .prepare(
        `SELECT
           strftime('${dateFormat}', closed_at) AS bucket,
           SUM(pnl)                             AS periodPnl
         FROM positions
         WHERE status = 'closed'
           AND closed_at >= datetime('now', '-${days} days')
         GROUP BY bucket
         ORDER BY bucket ASC`
      )
      .all() as { bucket: string; periodPnl: number }[];

    const baseline = db
      .prepare(
        `SELECT COALESCE(SUM(pnl), 0) AS base
         FROM positions
         WHERE status = 'closed'
           AND closed_at < datetime('now', '-${days} days')`
      )
      .get() as { base: number };

    let cumulative = baseline.base;
    return rows.map((r) => {
      cumulative += r.periodPnl;
      return {
        timestamp: r.bucket,
        cumulativePnl: Math.round(cumulative * 100) / 100,
        tradePnl: Math.round(r.periodPnl * 100) / 100,
      };
    });
  });
}

export interface HourlyRate {
  hour: string;
  trades: number;
}

export function getHourlyTradeRate(): HourlyRate[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT
           strftime('%Y-%m-%d %H:00:00', closed_at) AS hour,
           COUNT(*) AS trades
         FROM positions
         WHERE status = 'closed'
           AND closed_at >= datetime('now', '-24 hours')
         GROUP BY hour
         ORDER BY hour ASC`
      )
      .all() as { hour: string; trades: number }[];

    return rows;
  });
}

export interface DailyStat {
  date: string;
  trades: number;
  wins: number;
  winRate: number;
  pnl: number;
}

export function getDailyStats(days = 14): DailyStat[] {
  return withDb((db) => {
    const rows = db
      .prepare(
        `SELECT
           strftime('%Y-%m-%d', closed_at) AS date,
           COUNT(*)                                   AS trades,
           SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins,
           ROUND(SUM(CASE WHEN pnl > 0 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 2) AS winRate,
           ROUND(SUM(pnl), 2)                         AS pnl
         FROM positions
         WHERE status = 'closed'
           AND closed_at >= datetime('now', '-${days} days')
         GROUP BY date
         ORDER BY date ASC`
      )
      .all() as DailyStat[];

    return rows;
  });
}
