// Hyperliquid leaderboard: fetch (38 MB, ~47k rows), parse to numbers, candidate selection and an hourly disk
// cache so a restart never re-downloads inside the hour. Vault addresses come from the companion /vaults list
// and are excluded from the scan set (a vault's pnl is its depositors', not a copyable trader).

import { join } from "node:path";
import { fetchWithTimeout } from "@/lib/signals/features/fetch";
import { COPYTRADE_DIR, readJson, writeJsonAtomic } from "./store";
import { WINDOWS, type HlLeaderboardRow, type LeaderRow, type Window, type WindowPerf } from "./types";

export const LEADERBOARD_URL = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";
export const VAULTS_URL = "https://stats-data.hyperliquid.xyz/Mainnet/vaults";
export const LEADERBOARD_TTL_MS = 60 * 60_000;

const LB_FILE = join(COPYTRADE_DIR, "leaderboard.json");
const VAULTS_FILE = join(COPYTRADE_DIR, "vaults.json");

export interface CandidateCriteria {
  minEquity: number;
  maxEquity: number;
  minMonthVolume: number;
  minMonthRoi: number;
  /** exclusive: month roi must be > minMonthRoi */
  take: number;
}

export const DEFAULT_CRITERIA: CandidateCriteria = {
  minEquity: 25_000,
  maxEquity: 100_000_000,
  minMonthVolume: 2_000_000,
  minMonthRoi: 0,
  take: Number(process.env.COPYTRADE_SCAN_SET ?? 400),
};

const num = (s: unknown): number => {
  const n = typeof s === "number" ? s : Number(s);
  return Number.isFinite(n) ? n : 0;
};

export function parseRow(r: HlLeaderboardRow): LeaderRow | null {
  if (!r || typeof r.ethAddress !== "string" || !Array.isArray(r.windowPerformances)) return null;
  const windows = {} as Record<Window, WindowPerf>;
  for (const w of WINDOWS) windows[w] = { pnl: 0, roi: 0, volume: 0 };
  for (const entry of r.windowPerformances) {
    if (!Array.isArray(entry)) continue;
    const [name, perf] = entry;
    if ((WINDOWS as string[]).includes(name) && perf) {
      windows[name as Window] = { pnl: num(perf.pnl), roi: num(perf.roi) * 100, volume: num(perf.vlm) };
    }
  }
  return {
    address: r.ethAddress.toLowerCase(),
    displayName: typeof r.displayName === "string" && r.displayName.trim() ? r.displayName.trim() : null,
    equity: num(r.accountValue),
    windows,
  };
}

export function parseLeaderboard(json: unknown): LeaderRow[] {
  const rows = (json as { leaderboardRows?: unknown })?.leaderboardRows;
  if (!Array.isArray(rows)) return [];
  const out: LeaderRow[] = [];
  for (const r of rows) {
    const p = parseRow(r as HlLeaderboardRow);
    if (p) out.push(p);
  }
  return out;
}

/** Candidate filter + rank by month pnl. `vaults` is a lowercase address set. */
export function selectCandidates(rows: LeaderRow[], vaults: Set<string>, c: CandidateCriteria = DEFAULT_CRITERIA): LeaderRow[] {
  return rows
    .filter((r) => {
      if (vaults.has(r.address)) return false;
      if (r.equity < c.minEquity || r.equity > c.maxEquity) return false;
      const m = r.windows.month;
      if (!(m.volume > 0)) return false;
      if (m.volume < c.minMonthVolume) return false;
      if (!(m.roi > c.minMonthRoi)) return false;
      return true;
    })
    .sort((a, b) => b.windows.month.pnl - a.windows.month.pnl)
    .slice(0, c.take);
}

export function parseVaults(json: unknown): Set<string> {
  const set = new Set<string>();
  if (!Array.isArray(json)) return set;
  for (const v of json) {
    const addr = (v as { summary?: { vaultAddress?: unknown } })?.summary?.vaultAddress;
    if (typeof addr === "string" && addr.startsWith("0x")) set.add(addr.toLowerCase());
  }
  return set;
}

// ── Cache ────────────────────────────────────────────────────────────────────

interface LeaderboardCache {
  fetchedAt: number;
  /** Every row that passes the equity floor (kept so trader detail can resolve names/windows for non-candidates). */
  rows: LeaderRow[];
}

interface VaultsCache {
  fetchedAt: number;
  vaults: string[];
}

let lbMem: LeaderboardCache | null = null;
let vaultsMem: VaultsCache | null = null;
let inflight: Promise<LeaderboardCache | null> | null = null;

async function fetchLeaderboardRaw(): Promise<LeaderRow[] | null> {
  try {
    const r = await fetchWithTimeout(LEADERBOARD_URL, {}, 90_000);
    if (!r.ok) return null;
    const rows = parseLeaderboard(await r.json());
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

async function fetchVaultsRaw(): Promise<Set<string> | null> {
  try {
    const r = await fetchWithTimeout(VAULTS_URL, {}, 60_000);
    if (!r.ok) return null;
    const set = parseVaults(await r.json());
    return set.size ? set : null;
  } catch {
    return null;
  }
}

/**
 * Leaderboard rows, at most one download per hour (memory -> disk -> network). Keeps rows with equity >= 10k so
 * the cache stays a few MB instead of 38; trader detail for smaller accounts falls back to the portfolio call.
 */
export async function getLeaderboard(now = Date.now()): Promise<LeaderboardCache | null> {
  if (lbMem && now - lbMem.fetchedAt < LEADERBOARD_TTL_MS) return lbMem;
  if (!lbMem) {
    const disk = readJson<LeaderboardCache>(LB_FILE);
    if (disk && Array.isArray(disk.rows) && typeof disk.fetchedAt === "number") {
      lbMem = disk;
      if (now - disk.fetchedAt < LEADERBOARD_TTL_MS) return disk;
    }
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const rows = await fetchLeaderboardRaw();
      if (rows) {
        lbMem = { fetchedAt: now, rows: rows.filter((r) => r.equity >= 10_000) };
        writeJsonAtomic(LB_FILE, lbMem);
      }
      return lbMem;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function getVaults(now = Date.now()): Promise<Set<string>> {
  if (vaultsMem && now - vaultsMem.fetchedAt < LEADERBOARD_TTL_MS) return new Set(vaultsMem.vaults);
  if (!vaultsMem) {
    const disk = readJson<VaultsCache>(VAULTS_FILE);
    if (disk && Array.isArray(disk.vaults)) vaultsMem = disk;
    if (vaultsMem && now - vaultsMem.fetchedAt < LEADERBOARD_TTL_MS) return new Set(vaultsMem.vaults);
  }
  const set = await fetchVaultsRaw();
  if (set) {
    vaultsMem = { fetchedAt: now, vaults: [...set] };
    writeJsonAtomic(VAULTS_FILE, vaultsMem);
  }
  return new Set(vaultsMem?.vaults ?? []);
}

/** The ranked scan set (top `take` candidates by month pnl). Null when no leaderboard is available at all. */
export async function getCandidates(criteria: CandidateCriteria = DEFAULT_CRITERIA): Promise<{ fetchedAt: number; candidates: LeaderRow[] } | null> {
  const lb = await getLeaderboard();
  if (!lb) return null;
  const vaults = await getVaults();
  return { fetchedAt: lb.fetchedAt, candidates: selectCandidates(lb.rows, vaults, criteria) };
}

export async function findLeaderRow(address: string): Promise<LeaderRow | null> {
  const lb = await getLeaderboard();
  const a = address.toLowerCase();
  return lb?.rows.find((r) => r.address === a) ?? null;
}

export function leaderboardFetchedAt(): number | null {
  return lbMem?.fetchedAt ?? null;
}
