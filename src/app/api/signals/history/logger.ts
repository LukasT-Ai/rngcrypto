import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "signals")
  : join(process.cwd(), "data");
const FILE_PATH = join(DATA_DIR, "signal-history.json");
// Records beyond the live cap are moved here instead of dropped, so "All time" never shrinks.
const ARCHIVE_PATH = join(DATA_DIR, "signal-history-archive.json");
export const MAX_SIGNALS = 5000;

export function historyPaths(): { dir: string; live: string; archive: string } {
  return { dir: DATA_DIR, live: FILE_PATH, archive: ARCHIVE_PATH };
}

// Mirror of the hot scanner's symbol list (hot/route.ts keeps a private copy). The scheduler in
// instrumentation.ts walks this list every 15 minutes so logging is no longer traffic-driven.
export const SCAN_SYMBOLS = [
  "BTC", "ETH", "BNB", "ADA", "HYPE",
  "ZEC", "PUMP", "NIGHT", "SKHYNIX", "GOLD",
  "XRP", "SOL", "NEAR", "OIL", "SILVER",
  "TSLA", "NVDA", "GOOGL", "COIN", "MU",
  "SP500", "NAS100", "CRCL", "MINIMAX", "SPCX",
  "DRAM", "AAOI", "SNDK", "UNITREE", "ZHIPU", "CXMT",
];

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Everything the engine knew at call time (perf audit 3.1). Added 2026-10-13; records logged before carry
// no `inputs` and every consumer must treat each field as absent (null) for them.
export interface SignalInputs {
  /** Signed weighted factor score (-100..100); positive leans long. */
  weightedScore: number;
  /** 50 + |weightedScore| / 2 before the whipsaw, catalyst, pre-event and counter-trend haircuts. */
  confidenceRaw: number;
  /** Raw component score (-100..100) and the weight in play for it (0 when its feed was down). */
  components: Record<string, { score: number; weight: number }>;
  rr1: number | null;
  rr2: number | null;
  rr3: number | null;
  entryType: "market" | "limit";
  /** Trade ATR as a percent of price. */
  atrPct: number | null;
  /** Funding as a fraction per 8h (Strike hourly x8), null when the feed was down. */
  fundingRate: number | null;
  /** Minutes until the next high or critical scheduled release; null when none is known. */
  minutesToNextEvent: number | null;
  tuning: Record<string, unknown>;
  gateNotes: string[];
  engineVersion: string;
  calibrationVersion: string | null;
  /** Calibrated P(TP1) published with the call, null until the calibration gate opens (PR 17). */
  pTp1: number | null;
  regime: string | null;
  regimeGate: string | null;
  markAtSignal: number | null;
  lastAtSignal: number | null;
  /** Open time of the 15m bar the decision used. */
  candleCloseTime: number | null;
}

export interface SignalContext {
  factors: Record<string, string>;
  catalystScore: number;
  oilGeoScore: number | null;
  oilRegime: "calm" | "elevated" | "extreme" | "whipsaw" | null;
  atr: number;
  tradeType: string | null;
  timeframe: string | null;
  inputs?: SignalInputs;
}

// Declined calls logged for counterfactual measurement (perf audit 1.4). Never in a public number.
export type ShadowClass = "wait_lean" | "htf_blocked_short" | "regime_blocked" | "event_gated";

// A candle span the checker could not fetch while the record was filled and open; a TP or stop inside it
// would have been missed. The record keeps running but is flagged for the audit view.
export interface CoverageGap {
  from: number;
  to: number;
  detectedAt: number;
}

export interface TpHit {
  level: 1 | 2 | 3;
  at: number;
  price: number;
}

// "unfilled": the limit entry was never touched inside the fill window. "unverifiable": candles needed to
// verify the fill are no longer available. Both are excluded from every rate, R sum and equity curve.
export type ClosedReason = "stop_before_tp" | "stop_after_tp" | "tp3" | "horizon" | "unfilled" | "unverifiable";
export type FillStatus = "filled" | "pending" | "unfilled";

export interface SignalLog {
  id: string;
  symbol: string;
  timestamp: number;
  bias: "LONG" | "SHORT";
  confidence: number;
  grade: string;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  priceAtSignal: number;
  outcome: "pending" | "tp1" | "tp2" | "tp3" | "stopped" | "expired";
  outcomePrice: number | null;
  outcomeTimestamp: number | null;
  maxFavorable: number | null;
  maxAdverse: number | null;
  lastCheckedAt?: number;
  context?: SignalContext;
  // Ladder tracking (added 2026-10-05). Records without `status` were finalized by the old
  // first-touch checker and are treated as closed as-is.
  status?: "open" | "closed";
  tpHits?: TpHit[];
  stoppedAt?: number | null;
  stoppedAfterTp?: 0 | 1 | 2 | 3 | null;
  closedReason?: ClosedReason | null;
  realizedR?: number | null;
  mfeR?: number | null;
  maeR?: number | null;
  timeToTp1Min?: number | null;
  // Fill model (added 2026-10-06). A signal only starts earning TP/SL outcomes once a candle after the
  // signal actually trades through its entry. Records without these fields predate the fill model.
  fillStatus?: FillStatus;
  filledAt?: number | null;
  // Set when a legacy first-touch record was reset for re-verification; keeps the old outcome for audit.
  legacyOutcome?: string | null;
  engineVersion?: string;
  // Shadow records (added 2026-10-13): declined calls followed through the same fill model. Absent = real call.
  shadow?: boolean;
  shadowClass?: ShadowClass | null;
  // Set by the checker when candles it needed were no longer fetchable (perf audit 5.5). Absent = full coverage.
  coverageGap?: CoverageGap | null;
  // Cost model (added 2026-10-13). Market orders fill at the next candle open; `fillPrice` is that open (limit
  // orders fill at the entry). `realizedR` stays gross; `costR` is the round-trip fee + slippage + funding in R
  // and `realizedNetR` = realizedR - costR. Records closed before this carry none of the three.
  fillPrice?: number | null;
  costR?: number | null;
  realizedNetR?: number | null;
}

export interface CalibrationBucket {
  n: number;
  wins: number;
  losses: number;
  tp1Rate: number;
  winRate: number;
  avgR: number | null;
}

export interface SignalStats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  expired: number;
  winRate: number;
  avgConfidence: number;
  avgRR: number;
  profitFactor: number;
  bySymbol: Record<
    string,
    { total: number; wins: number; losses: number; winRate: number }
  >;
  byGradeSymbol: Record<string, Record<string, CalibrationBucket>>;
  oilByRegime: Record<string, CalibrationBucket>;
  // Long vs short performance side by side; the engine must earn its record on both sides.
  byBias: Record<"LONG" | "SHORT", CalibrationBucket & { total: number; pending: number }>;
}

let memoryCache: SignalLog[] | null = null;

function loadFromDisk(): SignalLog[] {
  if (memoryCache !== null) return memoryCache;
  try {
    if (existsSync(FILE_PATH)) {
      const raw = readFileSync(FILE_PATH, "utf-8");
      memoryCache = JSON.parse(raw) as SignalLog[];
      return memoryCache;
    }
  } catch {
    // corrupted file, start fresh
  }
  memoryCache = [];
  return memoryCache;
}

function writeAtomic(path: string, data: unknown): void {
  ensureDir();
  // Atomic replace: a crash mid-write must never leave a truncated ledger that loads as [] and is then
  // overwritten by the next pass.
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data), "utf-8");
  renameSync(tmp, path);
}

let archiveCache: SignalLog[] | null = null;

function loadArchive(): SignalLog[] {
  if (archiveCache !== null) return archiveCache;
  try {
    if (existsSync(ARCHIVE_PATH)) {
      const parsed = JSON.parse(readFileSync(ARCHIVE_PATH, "utf-8")) as unknown;
      archiveCache = Array.isArray(parsed) ? (parsed as SignalLog[]) : [];
      return archiveCache;
    }
  } catch {
    // corrupt archive: keep the live file authoritative, do not overwrite the archive
    archiveCache = [];
    return archiveCache;
  }
  archiveCache = [];
  return archiveCache;
}

// Archive roll-over: when the live ledger exceeds the cap, the oldest CLOSED records beyond it move to the
// archive file (newest first, like the live file) instead of being dropped. Open records are never archived,
// so the checker keeps seeing them. Returns the records that remain live.
export function rollover(signals: SignalLog[], cap = MAX_SIGNALS): { live: SignalLog[]; archived: SignalLog[] } {
  if (signals.length <= cap) return { live: signals, archived: [] };
  const live: SignalLog[] = [];
  const archived: SignalLog[] = [];
  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    if (i < cap || isOpenRecord(s)) live.push(s);
    else archived.push(s);
  }
  return { live, archived };
}

function saveToDisk(signals: SignalLog[]): void {
  const { live, archived } = rollover(signals);
  memoryCache = live;
  try {
    if (archived.length) {
      const existing = loadArchive();
      const ids = new Set(existing.map((s) => s.id));
      const merged = [...archived.filter((s) => !ids.has(s.id)), ...existing];
      // Archive first: if the process dies between the two writes the record exists twice, never zero times.
      writeAtomic(ARCHIVE_PATH, merged);
      archiveCache = merged;
    }
    writeAtomic(FILE_PATH, live);
  } catch {
    // disk may not be writable in all environments
  }
}

/** Test hook: forget both in-memory caches so the next read hits the disk. */
export function resetHistoryCache(): void {
  memoryCache = null;
  archiveCache = null;
}

export function getArchive(): SignalLog[] {
  return loadArchive();
}

// Live + archived, newest first, deduped by id. Use for "All time" stats; the live file alone is the last cap.
export function getAllHistory(): SignalLog[] {
  const live = loadFromDisk();
  const archive = loadArchive();
  if (!archive.length) return live;
  const ids = new Set(live.map((s) => s.id));
  return [...live, ...archive.filter((s) => !ids.has(s.id))];
}

export function findSignal(id: string): SignalLog | null {
  return loadFromDisk().find((s) => s.id === id) ?? loadArchive().find((s) => s.id === id) ?? null;
}

export async function appendSignal(entry: {
  symbol: string;
  timestamp: number;
  bias: "LONG" | "SHORT";
  confidence: number;
  grade: string;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  priceAtSignal: number;
  context?: SignalContext;
  engineVersion?: string;
  shadow?: boolean;
  shadowClass?: ShadowClass | null;
}): Promise<boolean> {
  const signals = loadFromDisk();
  const shadow = entry.shadow === true;
  if (!shouldAppend(signals, entry.symbol, entry.bias, entry.timestamp, shadow)) return false;
  const id = shadow ? `${entry.symbol}-${entry.timestamp}-shadow` : `${entry.symbol}-${entry.timestamp}`;
  if (signals.some((s) => s.id === id)) return false;

  const log: SignalLog = {
    id,
    symbol: entry.symbol,
    timestamp: entry.timestamp,
    bias: entry.bias,
    confidence: entry.confidence,
    grade: entry.grade,
    entry: entry.entry,
    stopLoss: entry.stopLoss,
    tp1: entry.tp1,
    tp2: entry.tp2,
    tp3: entry.tp3,
    priceAtSignal: entry.priceAtSignal,
    outcome: "pending",
    outcomePrice: null,
    outcomeTimestamp: null,
    maxFavorable: null,
    maxAdverse: null,
    lastCheckedAt: entry.timestamp,
    context: entry.context,
    status: "open",
    tpHits: [],
    stoppedAt: null,
    stoppedAfterTp: null,
    closedReason: null,
    realizedR: null,
    mfeR: null,
    maeR: null,
    timeToTp1Min: null,
    fillStatus: "pending",
    filledAt: null,
    engineVersion: entry.engineVersion ?? "unversioned",
    ...(shadow ? { shadow: true, shadowClass: entry.shadowClass ?? null } : {}),
  };

  signals.unshift(log);
  // The cap is enforced by saveToDisk via rollover(): the overflow is archived, never dropped.
  saveToDisk(signals);
  return true;
}

export function isOpenRecord(s: SignalLog): boolean {
  if (s.status) return s.status === "open";
  return s.outcome === "pending";
}

// Dedupe rule: one open record per symbol and bias. A new log is only appended when the symbol has no
// open record, or when the open record carries the opposite bias (a flip). Time since the last log is
// irrelevant, so the same call re-rendered every 15 minutes is logged once and followed to its close.
// Cooldown: after a symbol's last record closes, wait before logging the next call. In testing the engine
// re-fired on the very next bar after every close (~46 signals per symbol per day), which is churn, not edge.
export const COOLDOWN_MS = 60 * 60_000;

// Shadow records form their own pool: a declined call never blocks a real one and vice versa.
export function shouldAppend(signals: SignalLog[], symbol: string, bias: "LONG" | "SHORT", now = Date.now(), shadow = false): boolean {
  const pool = signals.filter((s) => (s.shadow === true) === shadow);
  if (pool.some((s) => s.symbol === symbol && s.bias === bias && isOpenRecord(s))) return false;
  const lastClosed = pool
    .filter((s) => s.symbol === symbol && !isOpenRecord(s))
    .map((s) => s.outcomeTimestamp ?? s.lastCheckedAt ?? s.timestamp)
    .reduce((a, b) => Math.max(a, b), 0);
  return now - lastClosed >= COOLDOWN_MS;
}

export const isExcluded = (s: SignalLog): boolean => s.closedReason === "unfilled" || s.closedReason === "unverifiable";

export function getHistory(): SignalLog[] {
  return loadFromDisk();
}

export function updateSignal(
  id: string,
  updates: Partial<SignalLog>
): void {
  const signals = loadFromDisk();
  const idx = signals.findIndex((s) => s.id === id);
  if (idx === -1) return;
  signals[idx] = { ...signals[idx], ...updates };
  saveToDisk(signals);
}

// One ledger write for a whole checker pass (perf audit 5.3). Unknown ids are ignored.
export function applyUpdates(patches: Map<string, Partial<SignalLog>>): number {
  if (patches.size === 0) return 0;
  const signals = loadFromDisk();
  let applied = 0;
  for (let i = 0; i < signals.length; i++) {
    const p = patches.get(signals[i].id);
    if (!p) continue;
    signals[i] = { ...signals[i], ...p };
    applied++;
  }
  if (applied) saveToDisk(signals);
  return applied;
}

export function replaceHistory(signals: SignalLog[]): void {
  saveToDisk(signals);
}

// R for a closed record: the checker's realizedR when present, otherwise derived from the outcome price.
export function signalR(s: SignalLog): number | null {
  if (typeof s.realizedR === "number") return s.realizedR;
  const risk = Math.abs(s.entry - s.stopLoss);
  if (risk <= 0 || s.outcomePrice == null) return null;
  const move = s.bias === "LONG" ? s.outcomePrice - s.entry : s.entry - s.outcomePrice;
  return move / risk;
}

