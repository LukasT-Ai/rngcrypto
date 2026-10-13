// Background scanner over the ranked leaderboard candidates.
//
// Cycle (every 15 min, driven from instrumentation.ts): refresh the candidate set (the leaderboard itself is
// re-downloaded at most hourly, which is how new candidates get discovered), then for every trader in the scan set
// fetch the fills since the last scan (30 days on first sight, paged through userFillsByTime), merge them into the
// per-trader fill file, recompute per-coin stats / mix / 30d stats, refresh clearinghouseState (main + each
// builder dex) and, every PORTFOLIO_TTL, the portfolio history for drawdown and weekly consistency.
//
// Scan set = CORE (top `take` candidates by month pnl) + DISCOVERED (anyone from the wider POOL, top `poolSize`
// by month pnl, with >= MIN_COPYABLE_FILLS fills in BTC/ADA/GOLD/WTI). Pool members are probed once (then again
// after PROBE_TTL) with the same scan as a core trader; the ones that qualify stay, the others are dropped.
//
// The top 60 per asset get their positions refreshed every 2 minutes by refreshHotPositions(). Everything is
// persisted under <dataDir>/copytrade/ so a restart serves the previous scan immediately. Nothing here throws.

import { join } from "node:path";
import { getCandidates, DEFAULT_CRITERIA, type CandidateCriteria } from "./leaderboard";
import { info, WEIGHT, infoStats } from "./http";
import { COPYTRADE_DIR, listTraderFiles, readJson, removeFile, traderFile, writeJsonAtomic } from "./store";
import { allGroupStats, compactFill, copyStats, countCopyableFills, emptyStats, mapPositions, mergeFills, perCoinStats, positionForGroup, recentTrades, summarizeOpen, totalEquity } from "./stats";
import { compareScored, computeMix, computeStats30d, dailySeries, equityStartOf, pnlRanks, scoreTrader, COPYABLE_FOCUS_DEFAULT, MIN_COPYABLE_FILLS_FOR_POPULATION } from "./score";
import { ASSETS, FILL_WINDOW_MS, PERP_DEXES, isAssetGroup, type AssetGroup, type AssetStats, type CompactFill, type HlClearinghouseState, type HlFill, type HlPortfolio, type LeaderRow, type ScanStatus, type Score, type TraderRecord, type TraderRow, type Window } from "./types";

export const SCAN_INTERVAL_MS = 15 * 60_000;
export const HOT_INTERVAL_MS = 2 * 60_000;
export const HOT_PER_ASSET = 60;
export const MIN_COPYABLE_FILLS = 20;
const STALE_AFTER_MS = 3 * SCAN_INTERVAL_MS;
const PORTFOLIO_TTL_MS = 6 * 60 * 60_000;
const PROBE_TTL_MS = 7 * 24 * 60 * 60_000;
const PAGE_SIZE = 2000;
const MAX_PAGES_PER_CYCLE = 6;
const WORKERS = 2;
const PERSIST_EVERY = 25;
const POOL_SIZE = Number(process.env.COPYTRADE_POOL ?? 1500);

const SCAN_FILE = join(COPYTRADE_DIR, "scan.json");
const SCAN_VERSION = 3;

// ── Per-trader fill file ─────────────────────────────────────────────────────

export interface TraderFills {
  address: string;
  /** Oldest time the fill window has been fetched from. */
  since: number;
  /** Where the next incremental fetch starts (the newest fill held while backfilling, else the last scan time). */
  lastFillTime: number;
  /** False while a page cap stopped the backfill before reaching "now". */
  complete: boolean;
  updatedAt: number;
  fills: CompactFill[];
}

export function readTraderFills(address: string): TraderFills | null {
  const t = readJson<TraderFills>(traderFile(address));
  return t && Array.isArray(t.fills) ? t : null;
}

/**
 * Page userFillsByTime forward from startTime (ascending, 2000 per page). Returns what was fetched plus whether
 * the end was reached; ok is false when a request failed (partial data is still returned).
 */
export async function fetchFillsSince(address: string, startTime: number, maxPages = MAX_PAGES_PER_CYCLE, endTime = Date.now()): Promise<{ fills: CompactFill[]; complete: boolean; ok: boolean; pages: number }> {
  const out: CompactFill[] = [];
  let from = Math.max(0, Math.floor(startTime));
  let pages = 0;
  while (pages < maxPages) {
    const page = await info<HlFill[]>({ type: "userFillsByTime", user: address, startTime: from, endTime }, WEIGHT.userFillsByTime);
    pages++;
    if (!Array.isArray(page)) return { fills: out, complete: false, ok: false, pages };
    for (const f of page) out.push(compactFill(f));
    if (page.length < PAGE_SIZE) return { fills: out, complete: true, ok: true, pages };
    const last = page[page.length - 1].time;
    // Same-millisecond page boundary: the dedupe by tid in mergeFills absorbs the overlap.
    if (last <= from) return { fills: out, complete: false, ok: true, pages };
    from = last;
  }
  return { fills: out, complete: false, ok: true, pages };
}

/** clearinghouseState for the main book and every builder dex (2 weight each). */
export async function fetchAllStates(address: string): Promise<(HlClearinghouseState | null)[]> {
  return Promise.all([
    info<HlClearinghouseState>({ type: "clearinghouseState", user: address }, WEIGHT.clearinghouseState),
    ...PERP_DEXES.map((dex) => info<HlClearinghouseState>({ type: "clearinghouseState", user: address, dex }, WEIGHT.clearinghouseState)),
  ]);
}

// ── State ────────────────────────────────────────────────────────────────────

interface ScanFile {
  version: number;
  savedAt: number;
  lastFullScanAt: number | null;
  candidates: LeaderRow[];
  discovered: LeaderRow[];
  probed: Record<string, number>;
  records: TraderRecord[];
}

const records = new Map<string, TraderRecord>();
let candidates: LeaderRow[] = []; // core set, ranked by month pnl
let discovered: LeaderRow[] = []; // pool members that qualified
let probed: Record<string, number> = {}; // pool address -> last probe time
let candidatesAt: number | null = null;
let lastFullScanAt: number | null = null;
let nextScanAt: number | null = null;
let scanning = false;
let hotBusy = false;
let loaded = false;
let lastCycle: { startedAt: number; finishedAt: number | null; scanned: number; failed: number; probed: number } | null = null;

function loadFromDisk() {
  if (loaded) return;
  loaded = true;
  const f = readJson<ScanFile>(SCAN_FILE);
  if (!f || f.version !== SCAN_VERSION) return;
  if (Array.isArray(f.candidates)) candidates = f.candidates;
  if (Array.isArray(f.discovered)) discovered = f.discovered;
  if (f.probed && typeof f.probed === "object") probed = f.probed;
  if (Array.isArray(f.records)) for (const r of f.records) if (r && typeof r.address === "string") records.set(r.address, r);
  lastFullScanAt = typeof f.lastFullScanAt === "number" ? f.lastFullScanAt : null;
  candidatesAt = f.savedAt ?? null;
}

function persist() {
  writeJsonAtomic(SCAN_FILE, { version: SCAN_VERSION, savedAt: Date.now(), lastFullScanAt, candidates, discovered, probed, records: [...records.values()] } satisfies ScanFile);
}

export function setNextScanAt(t: number | null) {
  nextScanAt = t;
}

export function getRecord(address: string): TraderRecord | null {
  loadFromDisk();
  return records.get(address.toLowerCase()) ?? null;
}

/** The current scan set: core candidates followed by discovered pool traders (deduped). */
export function getScanSet(): LeaderRow[] {
  loadFromDisk();
  const seen = new Set<string>();
  const out: LeaderRow[] = [];
  for (const r of [...candidates, ...discovered]) {
    if (seen.has(r.address)) continue;
    seen.add(r.address);
    out.push(r);
  }
  return out;
}

export function getScanStatus(now = Date.now()): ScanStatus {
  const set = getScanSet();
  const scanned = set.filter((c) => records.has(c.address)).length;
  return {
    candidates: set.length,
    scanned,
    lastFullScanAt,
    nextScanAt,
    stale: lastFullScanAt == null || now - lastFullScanAt > STALE_AFTER_MS,
  };
}

export function getScanDebug() {
  return { scanning, hotBusy, lastCycle, candidatesAt, core: candidates.length, discovered: discovered.length, probed: Object.keys(probed).length, info: { ...infoStats }, records: records.size };
}

// ── Scanning one trader ──────────────────────────────────────────────────────

export function buildRecord(leader: LeaderRow, fills: CompactFill[], states: (HlClearinghouseState | null)[], prev: TraderRecord | null, fillsComplete: boolean, portfolio: TraderRecord["portfolio"], now = Date.now()): TraderRecord {
  const anyState = states.some((s) => !!s);
  const positions = anyState ? mapPositions(states, fills) : (prev?.positions ?? []);
  const equity = totalEquity(states) || leader.equity;
  const perCoin = perCoinStats(fills);
  const equityStart = equityStartOf(equity, leader.windows.month?.pnl ?? 0);
  const daily = portfolio?.daily ?? [];
  return {
    address: leader.address,
    displayName: leader.displayName,
    equity,
    windows: leader.windows,
    perCoin,
    mix: computeMix(perCoin),
    stats30d: computeStats30d(perCoin, fills, positions, daily, equityStart),
    copy: copyStats(fills, equityStart),
    copyableFills: countCopyableFills(fills),
    open: summarizeOpen(positions),
    positions,
    recent: recentTrades(fills, 100),
    scannedAt: now,
    positionsAt: anyState ? now : (prev?.positionsAt ?? 0),
    fillsComplete,
    portfolio,
  };
}

/** Fetch + merge fills, refresh states/portfolio, and store the record. Returns the record or null on failure. */
async function scanTrader(leader: LeaderRow, now: number): Promise<TraderRecord | null> {
  const address = leader.address;
  const since = now - FILL_WINDOW_MS;
  const existing = readTraderFills(address);
  const startTime = existing ? Math.max(existing.lastFillTime, since) : since;
  const fetched = await fetchFillsSince(address, startTime, MAX_PAGES_PER_CYCLE, now);
  if (!fetched.ok && fetched.fills.length === 0 && !existing) return null;
  const fills = mergeFills(existing?.fills ?? [], fetched.fills, since);
  const newest = fills.length ? Math.max(startTime, fills[0][0]) : startTime;
  const complete = fetched.ok && fetched.complete;
  writeJsonAtomic(traderFile(address), {
    address,
    since: existing ? Math.min(existing.since, since) : since,
    lastFillTime: complete ? now : newest,
    complete,
    updatedAt: now,
    fills,
  } satisfies TraderFills);
  const prev = records.get(address) ?? null;
  const states = await fetchAllStates(address);
  let portfolio = prev?.portfolio ?? null;
  if (!portfolio || now - portfolio.at > PORTFOLIO_TTL_MS) {
    const p = await info<HlPortfolio>({ type: "portfolio", user: address }, WEIGHT.portfolio);
    if (p) portfolio = { at: now, daily: dailySeries(p) };
  }
  const rec = buildRecord(leader, fills, states, prev, complete, portfolio, now);
  records.set(address, rec);
  return rec;
}

// ── Cycle ────────────────────────────────────────────────────────────────────

/**
 * One full scan: the core set first (so the top rows refresh early), then pool traders that have never been
 * probed or whose probe is older than PROBE_TTL. opts.take / opts.poolSize limit the sets (the one-off script);
 * opts.onProgress is called after each trader. Never throws.
 */
export async function runScanCycle(opts: { take?: number; poolSize?: number; criteria?: CandidateCriteria; onProgress?: (done: number, total: number, address: string) => void } = {}): Promise<{ scanned: number; failed: number; probed: number; total: number }> {
  loadFromDisk();
  if (scanning) return { scanned: 0, failed: 0, probed: 0, total: 0 };
  scanning = true;
  const startedAt = Date.now();
  lastCycle = { startedAt, finishedAt: null, scanned: 0, failed: 0, probed: 0 };
  let scanned = 0;
  let failed = 0;
  let probedNow = 0;
  let total = 0;
  try {
    const take = opts.take ?? (opts.criteria ?? DEFAULT_CRITERIA).take;
    const poolSize = Math.max(take, opts.poolSize ?? POOL_SIZE);
    const c = await getCandidates({ ...(opts.criteria ?? DEFAULT_CRITERIA), take: poolSize });
    let pool: LeaderRow[] = [];
    if (c) {
      candidates = c.candidates.slice(0, take);
      pool = c.candidates.slice(take);
      candidatesAt = c.fetchedAt;
      // Discovered traders that are no longer in the pool at all (fell off the leaderboard filter) are dropped.
      const inPool = new Set(pool.map((p) => p.address));
      discovered = discovered.filter((d) => inPool.has(d.address)).map((d) => pool.find((p) => p.address === d.address) ?? d);
    }
    const core = new Set(candidates.map((x) => x.address));
    const known = new Set(discovered.map((d) => d.address));
    const toProbe = pool.filter((p) => !core.has(p.address) && !known.has(p.address) && !(probed[p.address] && startedAt - probed[p.address] < PROBE_TTL_MS));
    const queue: { leader: LeaderRow; kind: "core" | "discovered" | "probe" }[] = [
      ...candidates.map((leader) => ({ leader, kind: "core" as const })),
      ...discovered.filter((d) => !core.has(d.address)).map((leader) => ({ leader, kind: "discovered" as const })),
      ...toProbe.map((leader) => ({ leader, kind: "probe" as const })),
    ];
    total = queue.length;
    await Promise.all(
      Array.from({ length: WORKERS }, async () => {
        while (queue.length) {
          const item = queue.shift();
          if (!item) break;
          const { leader, kind } = item;
          try {
            const rec = await scanTrader(leader, Date.now());
            if (!rec) failed++;
            else if (kind === "probe") {
              probedNow++;
              probed[leader.address] = Date.now();
              if (rec.copyableFills >= MIN_COPYABLE_FILLS) {
                discovered.push(leader);
                scanned++;
              } else {
                records.delete(leader.address);
                removeFile(traderFile(leader.address));
              }
            } else if (kind === "discovered" && rec.copyableFills < MIN_COPYABLE_FILLS) {
              // Went quiet in the four groups: back to the pool, re-probed after PROBE_TTL.
              discovered = discovered.filter((d) => d.address !== leader.address);
              probed[leader.address] = Date.now();
              records.delete(leader.address);
              removeFile(traderFile(leader.address));
            } else scanned++;
          } catch {
            failed++;
          }
          lastCycle = { startedAt, finishedAt: null, scanned, failed, probed: probedNow };
          opts.onProgress?.(scanned + failed + probedNow, total, leader.address);
          if ((scanned + failed + probedNow) % PERSIST_EVERY === 0) persist();
        }
      })
    );
    // Drop traders outside the scan set so the ranking only ever shows the current set; forget stale probes.
    const keep = new Set(getScanSet().map((x) => x.address));
    for (const a of [...records.keys()]) if (!keep.has(a)) records.delete(a);
    for (const f of listTraderFiles()) {
      const addr = f.replace(/\\/g, "/").split("/").pop()?.replace(/\.json$/, "") ?? "";
      if (addr && !keep.has(addr)) removeFile(f);
    }
    for (const [a, t] of Object.entries(probed)) if (Date.now() - t > 2 * PROBE_TTL_MS) delete probed[a];
    if (total > 0 && scanned > 0) lastFullScanAt = Date.now();
    persist();
  } catch {
    /* next cycle */
  } finally {
    scanning = false;
    lastCycle = { startedAt, finishedAt: Date.now(), scanned, failed, probed: probedNow };
  }
  return { scanned, failed, probed: probedNow, total };
}

/** Addresses in the top n per asset group by realized 30d pnl in that group (plus anyone currently positioned). */
export function hotAddresses(n = HOT_PER_ASSET): string[] {
  loadFromDisk();
  const set = new Set<string>();
  for (const group of ASSETS) {
    const ranked = [...records.values()]
      .map((r) => ({ r, s: allGroupStats(r.perCoin)[group], pos: positionForGroup(r.positions, group) }))
      .filter((x) => x.s || x.pos)
      .sort((a, b) => (b.s?.realizedPnl ?? 0) - (a.s?.realizedPnl ?? 0))
      .slice(0, n);
    for (const x of ranked) set.add(x.r.address);
  }
  return [...set];
}

/** Refresh positions for the hot set (6 weight each across main + dexes). In-memory only; the cycle persists. */
export async function refreshHotPositions(n = HOT_PER_ASSET): Promise<number> {
  if (hotBusy) return 0;
  hotBusy = true;
  let done = 0;
  try {
    const queue = hotAddresses(n);
    await Promise.all(
      Array.from({ length: WORKERS }, async () => {
        while (queue.length) {
          const address = queue.shift();
          if (!address) break;
          try {
            const rec = records.get(address);
            if (!rec) continue;
            const states = await fetchAllStates(address);
            if (!states.some((s) => !!s)) continue;
            const fills = readTraderFills(address)?.fills ?? [];
            const positions = mapPositions(states, fills);
            rec.positions = positions;
            rec.open = summarizeOpen(positions);
            rec.equity = totalEquity(states) || rec.equity;
            rec.stats30d = { ...rec.stats30d, medianLeverage: computeStats30d(rec.perCoin, [], positions, rec.portfolio?.daily ?? [], equityStartOf(rec.equity, rec.windows.month?.pnl ?? 0)).medianLeverage };
            rec.positionsAt = Date.now();
            done++;
          } catch {
            /* skip */
          }
        }
      })
    );
  } finally {
    hotBusy = false;
  }
  return done;
}

// ── Query (pure over the record list) ────────────────────────────────────────

export type SortKey = "copyability" | "assetPnl" | "roi" | "winRate" | "volume" | "equity" | "focus" | "activity";
export const SORT_KEYS: SortKey[] = ["copyability", "assetPnl", "roi", "winRate", "volume", "equity", "focus", "activity"];

export interface RowQuery {
  asset: AssetGroup | "ALL";
  window: Window;
  sort: SortKey;
  minVolume: number;
  limit: number;
  /** Minimum copyableSharePct; 0 = off. copyableOnly=1 maps to COPYABLE_FOCUS_DEFAULT unless minFocus is given. */
  minFocus: number;
}

/**
 * Scores for a record set. The success component ranks copyable net pnl within the population P (wallets with
 * >= 20 copyable fills), so it needs the whole set; wallets outside P get no percentile.
 */
export function scoreAll(recs: TraderRecord[], now = Date.now()): Map<string, Score> {
  const pop = recs.filter((r) => r.copy.fills >= MIN_COPYABLE_FILLS_FOR_POPULATION);
  const ranks = pnlRanks(pop.map((r) => r.copy.pnlNet));
  const pctl = new Map<string, number>();
  pop.forEach((r, i) => pctl.set(r.address, ranks[i]));
  const out = new Map<string, Score>();
  for (const r of recs) {
    out.set(r.address, scoreTrader({ mix: r.mix, stats30d: r.stats30d, copy: r.copy, positions: r.positions, equity: r.equity, monthPnl: r.windows.month?.pnl ?? 0, daily: r.portfolio?.daily ?? [], pnlPctl: pctl.get(r.address) ?? null, now }));
  }
  return out;
}

export function toRow(r: TraderRecord, asset: AssetGroup | "ALL", window: Window, score: Score): TraderRow | null {
  const pos = asset === "ALL" ? null : positionForGroup(r.positions, asset);
  let stats: AssetStats | null = null;
  if (asset !== "ALL") {
    stats = allGroupStats(r.perCoin)[asset] ?? (pos ? emptyStats(asset) : null);
    if (!stats) return null;
  }
  return {
    address: r.address,
    displayName: r.displayName,
    rank: 0,
    equity: r.equity,
    window: r.windows[window] ?? { pnl: 0, roi: 0, volume: 0 },
    asset: stats,
    open: r.open,
    openForAsset: pos,
    mix: r.mix,
    stats30d: r.stats30d,
    score,
  };
}

function sortKey(sort: SortKey) {
  return (row: TraderRow): number => {
    switch (sort) {
      case "roi":
        return row.window.roi;
      case "winRate":
        return row.asset?.winRate ?? -1e18; // nulls last (finite so the comparator never sees NaN)
      case "volume":
        return row.asset ? row.asset.volumeUsd : row.window.volume;
      case "equity":
        return row.equity;
      case "focus":
        return row.score.focus ?? -1;
      case "activity":
        return row.score.activity ?? -1;
      case "assetPnl":
        return row.asset ? row.asset.realizedPnl : row.window.pnl;
      case "copyability":
      default:
        return row.score.copyability;
    }
  };
}

export function buildRows(recs: TraderRecord[], q: RowQuery, scores = scoreAll(recs)): TraderRow[] {
  type Item = { row: TraderRow; rec: TraderRecord };
  const rows: Item[] = [];
  for (const r of recs) {
    const row = toRow(r, q.asset, q.window, scores.get(r.address)!);
    if (!row) continue;
    const vol = row.asset ? row.asset.volumeUsd : row.window.volume;
    if (vol < q.minVolume) continue;
    if (q.minFocus > 0 && row.mix.copyableSharePct < q.minFocus) continue;
    rows.push({ row, rec: r });
  }
  const key = sortKey(q.sort);
  const tie = (a: Item, b: Item) => compareScored({ score: a.row.score, stats30d: a.rec.stats30d, copy: a.rec.copy, address: a.rec.address }, { score: b.row.score, stats30d: b.rec.stats30d, copy: b.rec.copy, address: b.rec.address });
  rows.sort((a, b) => key(b.row) - key(a.row) || tie(a, b));
  const out = rows.slice(0, q.limit).map((x) => x.row);
  out.forEach((row, i) => (row.rank = i + 1));
  return out;
}

/** Summary strip: top n per asset group by copyability, plus the best copyable wallets overall. */
export function buildSummary(recs: TraderRecord[], window: Window, n = 5, nCopyable = 10, minFocus = COPYABLE_FOCUS_DEFAULT): Record<AssetGroup | "COPYABLE", TraderRow[]> {
  const scores = scoreAll(recs);
  const out = {} as Record<AssetGroup | "COPYABLE", TraderRow[]>;
  for (const asset of ASSETS) {
    out[asset] = buildRows(recs, { asset, window, sort: "copyability", minVolume: 0, limit: n, minFocus: 0 }, scores);
  }
  out.COPYABLE = buildRows(recs, { asset: "ALL", window, sort: "copyability", minVolume: 0, limit: nCopyable, minFocus }, scores);
  return out;
}

function currentRecords(): TraderRecord[] {
  loadFromDisk();
  const set = getScanSet();
  return set.length ? set.map((c) => records.get(c.address)).filter((r): r is TraderRecord => !!r) : [...records.values()];
}

export function queryRows(q: RowQuery): TraderRow[] {
  return buildRows(currentRecords(), q);
}

export function querySummary(window: Window): Record<AssetGroup | "COPYABLE", TraderRow[]> {
  return buildSummary(currentRecords(), window);
}

export { isAssetGroup };
