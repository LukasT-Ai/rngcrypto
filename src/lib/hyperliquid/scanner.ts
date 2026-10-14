// Background scanner over the ranked leaderboard candidates.
//
// Two loops, both driven from instrumentation.ts and sharing the Hyperliquid token bucket:
//
// 1. runScanCycle (every 15 min): refresh the candidate sets (the leaderboard itself is re-downloaded at most
//    hourly), then re-scan the SCAN SET = CORE (top `take` by month pnl) + DISCOVERED (pool wallets that qualified).
//    Per trader: fills since the last scan (30 days on first sight, paged through userFillsByTime), merged into the
//    per-trader fill file; per-coin stats / mix / 30d stats; clearinghouseState on main + every builder dex; the
//    portfolio history every PORTFOLIO_TTL.
// 2. probeBatch (continuous): the discovery POOL = top `poolSize` by month pnl beyond the core, plus the
//    SPECIALIST pool (25k..5M equity, month roi > 15%, volume > 300k, ranked by roi). Unprobed addresses go
//    first; a probe is the same scan as a core trader, and the wallet stays (DISCOVERED) when it has
//    >= MIN_COPYABLE_FILLS fills in BTC/ADA/GOLD/WTI, otherwise it is dropped and re-probed after PROBE_TTL.
//
// The top 60 per asset get their positions refreshed every 2 minutes by refreshHotPositions(). Everything is
// persisted under <dataDir>/copytrade/ so a restart serves the previous scan immediately. Nothing here throws.
//
// Bundling: Next.js compiles instrumentation.ts and the API routes into separate bundles, so this module exists
// once per bundle with its own memory. Only the instance that runs the jobs (the WRITER) owns the state; every
// other instance (READERS, i.e. the routes) re-reads scan.json / status.json whenever their mtime changes. Status
// is written at cycle start, every PERSIST_EVERY records and at the end, so the page fills during the first cycle.

import { join } from "node:path";
import { getCandidates, getSpecialists, DEFAULT_CRITERIA, DEFAULT_SPECIALISTS, type CandidateCriteria, type SpecialistCriteria } from "./leaderboard";
import { info, WEIGHT, infoStats } from "./http";
import { outcomeLabel, refreshOutcomes } from "./outcomes";
import { COPYTRADE_DIR, fileMtime, listTraderFiles, readJson, removeFile, traderFile, writeJsonAtomic } from "./store";
import { allGroupStats, compactFill, copyStats, countCopyableFills, emptyStats, mapPositions, mergeFills, perCoinStats, positionForGroup, recentTrades, summarizeOpen, totalEquity } from "./stats";
import { compareScored, computeMix, computeStats30d, dailySeries, equityStartOf, monthStartEquity, pnlRanks, scoreTrader, COPYABLE_FOCUS_DEFAULT, MIN_COPYABLE_FILLS_FOR_POPULATION } from "./score";
import { ASSETS, FILL_WINDOW_MS, PERP_DEXES, isAssetGroup, type AssetGroup, type AssetStats, type CompactFill, type HlClearinghouseState, type HlFill, type HlPortfolio, type LeaderRow, type ScanStatus, type Score, type TraderRecord, type TraderRow, type Window } from "./types";

export const SCAN_INTERVAL_MS = 15 * 60_000;
export const HOT_INTERVAL_MS = 2 * 60_000;
export const PROBE_IDLE_MS = 5 * 60_000;
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
const STATUS_FILE = join(COPYTRADE_DIR, "status.json");
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

/** Small, frequently written status shared with reader instances (see the bundling note above). */
interface StatusFile {
  version: number;
  savedAt: number;
  nextScanAt: number | null;
  lastFullScanAt: number | null;
  cycle: { startedAt: number; finishedAt: number | null; scanned: number; failed: number; total: number } | null;
  pool: ScanStatus["pool"];
  perAsset: ScanStatus["perAsset"];
  candidates: number;
  scanned: number;
}

const records = new Map<string, TraderRecord>();
let candidates: LeaderRow[] = []; // core set, ranked by month pnl
let discovered: LeaderRow[] = []; // pool members that qualified
let pool: LeaderRow[] = []; // discovery pool (pnl pool + specialists), excluding the core
let probed: Record<string, number> = {}; // pool address -> last probe time
let candidatesAt: number | null = null;
let lastFullScanAt: number | null = null;
let nextScanAt: number | null = null;
let scanning = false;
let probing = false;
let hotBusy = false;
let writer = false; // true once this instance runs a job; writers never reload over their own state
let scanMtime = -1;
let statusMtime = -1;
let status: StatusFile | null = null; // the last status read (readers) or written (writer)
let lastCycle: { startedAt: number; finishedAt: number | null; scanned: number; failed: number; total: number } | null = null;
const probeStats = { probed: 0, kept: 0, failed: 0, lastAt: null as number | null };

function readScanFile(): boolean {
  const f = readJson<ScanFile>(SCAN_FILE);
  if (!f || f.version !== SCAN_VERSION) return false;
  records.clear();
  candidates = Array.isArray(f.candidates) ? f.candidates : [];
  discovered = Array.isArray(f.discovered) ? f.discovered : [];
  probed = f.probed && typeof f.probed === "object" ? f.probed : {};
  if (Array.isArray(f.records)) for (const r of f.records) if (r && typeof r.address === "string") records.set(r.address, r);
  lastFullScanAt = typeof f.lastFullScanAt === "number" ? f.lastFullScanAt : null;
  candidatesAt = f.savedAt ?? null;
  return true;
}

/**
 * Bring this instance up to date with the files. The writer loads once at startup (before its first job) and
 * then trusts its memory; readers re-read whenever a file's mtime moved. statSync on two files per request.
 */
function syncFromDisk() {
  const sm = fileMtime(SCAN_FILE);
  const tm = fileMtime(STATUS_FILE);
  if (writer && scanMtime >= 0) return;
  if (sm !== scanMtime) {
    scanMtime = sm;
    if (sm > 0) readScanFile();
  }
  if (tm !== statusMtime) {
    statusMtime = tm;
    status = tm > 0 ? readJson<StatusFile>(STATUS_FILE) : null;
    if (status && status.version !== SCAN_VERSION) status = null;
    if (status) {
      nextScanAt = status.nextScanAt;
      if (status.lastFullScanAt != null) lastFullScanAt = status.lastFullScanAt;
      lastCycle = status.cycle;
    }
  }
}

/** Called by the job runners: load the previous state once, then own it. */
function becomeWriter() {
  if (writer) return;
  syncFromDisk();
  writer = true;
}

function currentStatus(now = Date.now()): StatusFile {
  const set = getScanSet();
  const recs = set.map((c) => records.get(c.address)).filter((r): r is TraderRecord => !!r);
  const known = new Set(discovered.map((d) => d.address));
  const remaining = pool.filter((p) => !known.has(p.address) && isProbeDue(p.address, now)).length;
  return {
    version: SCAN_VERSION,
    savedAt: now,
    nextScanAt,
    lastFullScanAt,
    cycle: lastCycle,
    pool: { size: pool.length, probed: pool.length - remaining, remaining, discovered: discovered.length },
    perAsset: perAssetCounts(recs),
    candidates: set.length,
    scanned: recs.length,
  };
}

function persistStatus() {
  status = currentStatus();
  if (writeJsonAtomic(STATUS_FILE, status)) statusMtime = fileMtime(STATUS_FILE);
}

function persist() {
  if (writeJsonAtomic(SCAN_FILE, { version: SCAN_VERSION, savedAt: Date.now(), lastFullScanAt, candidates, discovered, probed, records: [...records.values()] } satisfies ScanFile)) scanMtime = fileMtime(SCAN_FILE);
  persistStatus();
}

export function setNextScanAt(t: number | null) {
  becomeWriter();
  nextScanAt = t;
  persistStatus();
}

export function getRecord(address: string): TraderRecord | null {
  syncFromDisk();
  return records.get(address.toLowerCase()) ?? null;
}

/** The current scan set: core candidates followed by discovered pool traders (deduped). */
export function getScanSet(): LeaderRow[] {
  syncFromDisk();
  const seen = new Set<string>();
  const out: LeaderRow[] = [];
  for (const r of [...candidates, ...discovered]) {
    if (seen.has(r.address)) continue;
    seen.add(r.address);
    out.push(r);
  }
  return out;
}

/** Wallets with fills or an open position per asset group (pure, for status and tests). */
export function perAssetCounts(recs: Iterable<TraderRecord>): Record<AssetGroup, number> {
  const out = { BTC: 0, ADA: 0, GOLD: 0, WTI: 0 } as Record<AssetGroup, number>;
  for (const r of recs) {
    const groups = allGroupStats(r.perCoin);
    for (const g of ASSETS) if (groups[g] || positionForGroup(r.positions, g)) out[g]++;
  }
  return out;
}

const isProbeDue = (address: string, now: number) => !(probed[address] && now - probed[address] < PROBE_TTL_MS);

export function getScanStatus(now = Date.now()): ScanStatus {
  syncFromDisk();
  // Readers take pool/progress numbers from status.json (the pool itself lives only in the writer's memory).
  const s = writer ? currentStatus(now) : (status ?? currentStatus(now));
  const set = getScanSet();
  const recs = set.map((c) => records.get(c.address)).filter((r): r is TraderRecord => !!r);
  return {
    candidates: Math.max(set.length, s.candidates),
    scanned: Math.max(recs.length, s.scanned),
    lastFullScanAt,
    nextScanAt,
    stale: lastFullScanAt == null || now - lastFullScanAt > STALE_AFTER_MS,
    perAsset: recs.length ? perAssetCounts(recs) : s.perAsset,
    pool: s.pool,
  };
}

export function getScanDebug() {
  syncFromDisk();
  return { writer, scanning, probing, hotBusy, lastCycle, probeStats, candidatesAt, core: candidates.length, discovered: discovered.length, pool: pool.length, probed: Object.keys(probed).length, info: { ...infoStats }, records: records.size, status };
}

// ── Scanning one trader ──────────────────────────────────────────────────────

export function buildRecord(leader: LeaderRow, fills: CompactFill[], states: (HlClearinghouseState | null)[], prev: TraderRecord | null, fillsComplete: boolean, portfolio: TraderRecord["portfolio"], now = Date.now()): TraderRecord {
  const anyState = states.some((s) => !!s);
  const positions = anyState ? mapPositions(states, fills) : (prev?.positions ?? []);
  const equity = totalEquity(states) || leader.equity;
  const perCoin = perCoinStats(fills);
  const equityStart = equityStartOf(equity, leader.windows.month?.pnl ?? 0, portfolio?.equityStart ?? null);
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
    if (p) portfolio = { at: now, daily: dailySeries(p), equityStart: monthStartEquity(p) };
  }
  const rec = buildRecord(leader, fills, states, prev, complete, portfolio, now);
  records.set(address, rec);
  return rec;
}

function dropTrader(address: string) {
  records.delete(address);
  removeFile(traderFile(address));
}

// ── Candidate sets ───────────────────────────────────────────────────────────

/** Refresh core, pool (pnl pool + specialists) and prune discovered wallets that left every pool. */
async function refreshSets(opts: { take?: number; poolSize?: number; criteria?: CandidateCriteria; specialists?: SpecialistCriteria | null }) {
  const take = opts.take ?? (opts.criteria ?? DEFAULT_CRITERIA).take;
  const poolSize = Math.max(take, opts.poolSize ?? POOL_SIZE);
  const c = await getCandidates({ ...(opts.criteria ?? DEFAULT_CRITERIA), take: poolSize });
  if (!c) return;
  candidates = c.candidates.slice(0, take);
  candidatesAt = c.fetchedAt;
  const core = new Set(candidates.map((x) => x.address));
  const merged = new Map<string, LeaderRow>();
  for (const p of c.candidates.slice(take)) merged.set(p.address, p);
  if (opts.specialists !== null) for (const s of await getSpecialists(opts.specialists ?? DEFAULT_SPECIALISTS)) if (!core.has(s.address) && !merged.has(s.address)) merged.set(s.address, s);
  pool = [...merged.values()];
  // Discovered traders that are no longer in any pool (fell off the leaderboard filters) are dropped; the rest
  // pick up their fresh leaderboard numbers.
  discovered = discovered.filter((d) => merged.has(d.address) || core.has(d.address)).map((d) => merged.get(d.address) ?? d);
}

// ── Cycle (core + discovered) ────────────────────────────────────────────────

/**
 * One full re-scan of the scan set (core first so the top rows refresh early). opts.take / opts.poolSize limit
 * the sets (the one-off script); opts.probeAll also drains the discovery pool inside this call. Never throws.
 */
export async function runScanCycle(opts: { take?: number; poolSize?: number; criteria?: CandidateCriteria; specialists?: SpecialistCriteria | null; probeAll?: boolean; onProgress?: (done: number, total: number, address: string) => void } = {}): Promise<{ scanned: number; failed: number; probed: number; total: number }> {
  becomeWriter();
  if (scanning) return { scanned: 0, failed: 0, probed: 0, total: 0 };
  scanning = true;
  const startedAt = Date.now();
  lastCycle = { startedAt, finishedAt: null, scanned: 0, failed: 0, total: 0 };
  let scanned = 0;
  let failed = 0;
  let probedNow = 0;
  let total = 0;
  try {
    await refreshSets(opts);
    void refreshOutcomes();
    const core = new Set(candidates.map((x) => x.address));
    const queue: LeaderRow[] = [...candidates, ...discovered.filter((d) => !core.has(d.address))];
    total = queue.length;
    lastCycle = { startedAt, finishedAt: null, scanned, failed, total };
    persistStatus();
    await Promise.all(
      Array.from({ length: WORKERS }, async () => {
        while (queue.length) {
          const leader = queue.shift();
          if (!leader) break;
          try {
            const rec = await scanTrader(leader, Date.now());
            if (!rec) failed++;
            else if (!core.has(leader.address) && rec.copyableFills < MIN_COPYABLE_FILLS) {
              // Went quiet in the four groups: back to the pool, re-probed after PROBE_TTL.
              discovered = discovered.filter((d) => d.address !== leader.address);
              probed[leader.address] = Date.now();
              dropTrader(leader.address);
            } else scanned++;
          } catch {
            failed++;
          }
          lastCycle = { startedAt, finishedAt: null, scanned, failed, total };
          opts.onProgress?.(scanned + failed, total, leader.address);
          if ((scanned + failed) % PERSIST_EVERY === 0) persist();
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
    lastCycle = { startedAt, finishedAt: Date.now(), scanned, failed, total };
    persistStatus();
  }
  if (opts.probeAll) {
    let n: number;
    do {
      n = await probeBatch(WORKERS * 5, opts.onProgress ? (a) => opts.onProgress?.(scanned + failed + ++probedNow, total + pool.length, a) : undefined);
    } while (n > 0);
  }
  return { scanned, failed, probed: probedNow, total };
}

// ── Discovery (continuous) ───────────────────────────────────────────────────

/**
 * Probe up to `max` pool addresses that were never probed (or whose probe expired): scan them, keep the ones with
 * >= MIN_COPYABLE_FILLS copyable fills as DISCOVERED, drop the rest. Returns the number probed (0 = pool
 * exhausted, caller idles). Never throws; never runs concurrently with itself.
 */
export async function probeBatch(max = 10, onEach?: (address: string) => void): Promise<number> {
  becomeWriter();
  if (probing) return 0;
  probing = true;
  let done = 0;
  try {
    const now = Date.now();
    const known = new Set([...candidates, ...discovered].map((x) => x.address));
    const queue = pool.filter((p) => !known.has(p.address) && isProbeDue(p.address, now)).slice(0, max);
    if (!queue.length) return 0;
    await Promise.all(
      Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
        while (queue.length) {
          const leader = queue.shift();
          if (!leader) break;
          probed[leader.address] = Date.now();
          try {
            const rec = await scanTrader(leader, Date.now());
            if (!rec) probeStats.failed++;
            else if (rec.copyableFills >= MIN_COPYABLE_FILLS) {
              discovered.push(leader);
              probeStats.kept++;
            } else dropTrader(leader.address);
          } catch {
            probeStats.failed++;
          }
          done++;
          probeStats.probed++;
          probeStats.lastAt = Date.now();
          onEach?.(leader.address);
        }
      })
    );
    persist();
  } catch {
    /* next batch */
  } finally {
    probing = false;
  }
  return done;
}

/** Addresses in the top n per asset group by realized 30d pnl in that group (plus anyone currently positioned). */
export function hotAddresses(n = HOT_PER_ASSET): string[] {
  becomeWriter();
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
            rec.stats30d = { ...rec.stats30d, medianLeverage: computeStats30d(rec.perCoin, [], positions, rec.portfolio?.daily ?? [], equityStartOf(rec.equity, rec.windows.month?.pnl ?? 0, rec.portfolio?.equityStart ?? null)).medianLeverage };
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
    out.set(r.address, scoreTrader({ mix: r.mix, stats30d: r.stats30d, copy: r.copy, positions: r.positions, equity: r.equity, monthPnl: r.windows.month?.pnl ?? 0, equityStart: r.portfolio?.equityStart ?? null, daily: r.portfolio?.daily ?? [], pnlPctl: pctl.get(r.address) ?? null, now }));
  }
  return out;
}

/** Attach readable labels to markets whose coin is not self-describing (outcome markets). */
export function labelMix(mix: TraderRecord["mix"]): TraderRecord["mix"] {
  if (!mix.topCoins.some((c) => c.coin.startsWith("#"))) return mix;
  return { ...mix, topCoins: mix.topCoins.map((c) => (c.coin.startsWith("#") ? { ...c, label: outcomeLabel(c.coin) ?? "Outcome market" } : c)) };
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
    mix: labelMix(r.mix),
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

/** Summary strip: top n per asset group by copyability (fewer when fewer qualify), plus the best copyable wallets. */
export function buildSummary(recs: TraderRecord[], window: Window, n = 5, nCopyable = 10, minFocus = COPYABLE_FOCUS_DEFAULT): Record<AssetGroup | "COPYABLE", TraderRow[]> {
  const scores = scoreAll(recs);
  const out = { BTC: [], ADA: [], GOLD: [], WTI: [], COPYABLE: [] } as Record<AssetGroup | "COPYABLE", TraderRow[]>;
  for (const asset of ASSETS) {
    out[asset] = buildRows(recs, { asset, window, sort: "copyability", minVolume: 0, limit: n, minFocus: 0 }, scores);
  }
  out.COPYABLE = buildRows(recs, { asset: "ALL", window, sort: "copyability", minVolume: 0, limit: nCopyable, minFocus }, scores);
  return out;
}

function currentRecords(): TraderRecord[] {
  syncFromDisk();
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
