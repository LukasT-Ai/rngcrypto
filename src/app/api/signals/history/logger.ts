import { readFileSync, writeFileSync, existsSync } from "fs";

const FILE_PATH = "/tmp/signal-history.json";
const DEDUP_WINDOW_MS = 15 * 60 * 1000;
const MAX_SIGNALS = 500;

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

function saveToDisk(signals: SignalLog[]): void {
  memoryCache = signals;
  try {
    writeFileSync(FILE_PATH, JSON.stringify(signals), "utf-8");
  } catch {
    // /tmp may not be writable in all environments
  }
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
}): Promise<void> {
  const signals = loadFromDisk();

  const lastForSymbol = signals.find((s) => s.symbol === entry.symbol);
  if (
    lastForSymbol &&
    entry.timestamp - lastForSymbol.timestamp < DEDUP_WINDOW_MS
  ) {
    return;
  }

  const log: SignalLog = {
    id: `${entry.symbol}-${entry.timestamp}`,
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
  };

  signals.unshift(log);

  if (signals.length > MAX_SIGNALS) {
    signals.length = MAX_SIGNALS;
  }

  saveToDisk(signals);
}

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

export function computeStats(signals: SignalLog[]): SignalStats {
  const wins = signals.filter(
    (s) => s.outcome === "tp1" || s.outcome === "tp2" || s.outcome === "tp3"
  );
  const losses = signals.filter((s) => s.outcome === "stopped");
  const pending = signals.filter((s) => s.outcome === "pending");
  const expired = signals.filter((s) => s.outcome === "expired");

  const decided = wins.length + losses.length;
  const winRate = decided > 0 ? Math.round((wins.length / decided) * 1000) / 10 : 0;

  const avgConfidence =
    signals.length > 0
      ? Math.round(
          (signals.reduce((s, v) => s + v.confidence, 0) / signals.length) * 10
        ) / 10
      : 0;

  let totalWinR = 0;
  for (const w of wins) {
    const risk = Math.abs(w.entry - w.stopLoss);
    const reward = Math.abs((w.outcomePrice ?? w.tp1) - w.entry);
    if (risk > 0) totalWinR += reward / risk;
  }
  const avgRR = wins.length > 0 ? Math.round((totalWinR / wins.length) * 100) / 100 : 0;

  let sumWins = 0;
  let sumLosses = 0;
  for (const w of wins) {
    sumWins += Math.abs((w.outcomePrice ?? w.tp1) - w.entry);
  }
  for (const l of losses) {
    sumLosses += Math.abs((l.outcomePrice ?? l.stopLoss) - l.entry);
  }
  const profitFactor =
    sumLosses > 0 ? Math.round((sumWins / sumLosses) * 100) / 100 : sumWins > 0 ? 999 : 0;

  const bySymbol: SignalStats["bySymbol"] = {};
  for (const s of signals) {
    if (!bySymbol[s.symbol]) {
      bySymbol[s.symbol] = { total: 0, wins: 0, losses: 0, winRate: 0 };
    }
    bySymbol[s.symbol].total++;
    if (s.outcome === "tp1" || s.outcome === "tp2" || s.outcome === "tp3") {
      bySymbol[s.symbol].wins++;
    } else if (s.outcome === "stopped") {
      bySymbol[s.symbol].losses++;
    }
  }
  for (const sym of Object.keys(bySymbol)) {
    const d = bySymbol[sym].wins + bySymbol[sym].losses;
    bySymbol[sym].winRate = d > 0 ? Math.round((bySymbol[sym].wins / d) * 1000) / 10 : 0;
  }

  return {
    total: signals.length,
    wins: wins.length,
    losses: losses.length,
    pending: pending.length,
    expired: expired.length,
    winRate,
    avgConfidence,
    avgRR,
    profitFactor,
    bySymbol,
  };
}
