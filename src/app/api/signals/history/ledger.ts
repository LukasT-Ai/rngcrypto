/**
 * Ledger integrity and export helpers (perf audit 6, design F4.3 "Ledger card"):
 *   computeLedgerHash()  SHA-256 of the live ledger file bytes, written to ledger-hash.json once a day
 *   readLedgerHash()     the last hash record (served as a header and on the performance page)
 *   ledgerCsv()          flat CSV export of the records
 *   readChangelog()      data/changelog.json from the repo (methodology changes, newest first)
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { historyPaths, type SignalLog } from "./logger";

export interface LedgerHash {
  sha256: string;
  hashedAt: string;
  /** UTC date the hash was taken (YYYY-MM-DD). */
  date: string;
  count: number;
  bytes: number;
  file: string;
}

const HASH_FILE = () => join(historyPaths().dir, "ledger-hash.json");

/** Hash the ledger file as stored. Returns null when the file does not exist (nothing logged yet). */
export function hashLedgerFile(): LedgerHash | null {
  const { live } = historyPaths();
  if (!existsSync(live)) return null;
  const buf = readFileSync(live);
  let count = 0;
  try {
    const parsed = JSON.parse(buf.toString("utf-8")) as unknown;
    count = Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    count = 0;
  }
  const now = new Date();
  return {
    sha256: createHash("sha256").update(buf).digest("hex"),
    hashedAt: now.toISOString(),
    date: now.toISOString().slice(0, 10),
    count,
    bytes: statSync(live).size,
    file: "signal-history.json",
  };
}

let hashCache: { rec: LedgerHash | null; at: number } | null = null;

/** Compute and persist today's hash. Idempotent per day unless `force`. */
export function computeLedgerHash(force = false): LedgerHash | null {
  const existing = readLedgerHash();
  const today = new Date().toISOString().slice(0, 10);
  if (!force && existing && existing.date === today) return existing;
  const rec = hashLedgerFile();
  if (!rec) return existing;
  try {
    const path = HASH_FILE();
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(rec, null, 2), "utf-8");
    renameSync(tmp, path);
  } catch {
    /* read-only filesystem: still served from memory */
  }
  hashCache = { rec, at: Date.now() };
  return rec;
}

export function readLedgerHash(): LedgerHash | null {
  if (hashCache && Date.now() - hashCache.at < 60_000) return hashCache.rec;
  let rec: LedgerHash | null = null;
  try {
    const path = HASH_FILE();
    if (existsSync(path)) rec = JSON.parse(readFileSync(path, "utf-8")) as LedgerHash;
  } catch {
    rec = null;
  }
  hashCache = { rec, at: Date.now() };
  return rec;
}

/** Test hook. */
export function resetLedgerHashCache(): void {
  hashCache = null;
}

// ── CSV export ───────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  "id", "symbol", "timestamp", "timestampIso", "bias", "confidence", "grade", "engineVersion", "shadow", "shadowClass",
  "entry", "stopLoss", "tp1", "tp2", "tp3", "priceAtSignal", "entryType",
  "status", "outcome", "closedReason", "fillStatus", "filledAt", "fillPrice", "outcomePrice", "outcomeTimestamp",
  "tpHits", "stoppedAfterTp", "realizedR", "costR", "realizedNetR", "mfeR", "maeR", "timeToTp1Min", "coverageGap",
  "tradeType", "weightedScore", "confidenceRaw", "rr1", "atrPct", "fundingRate", "minutesToNextEvent", "regime", "regimeGate", "pTp1", "calibrationVersion",
] as const;

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ledgerCsv(signals: SignalLog[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const s of signals) {
    const inp = s.context?.inputs;
    const row: Record<(typeof CSV_COLUMNS)[number], unknown> = {
      id: s.id,
      symbol: s.symbol,
      timestamp: s.timestamp,
      timestampIso: new Date(s.timestamp).toISOString(),
      bias: s.bias,
      confidence: s.confidence,
      grade: s.grade,
      engineVersion: s.engineVersion ?? "",
      shadow: s.shadow === true,
      shadowClass: s.shadowClass ?? "",
      entry: s.entry,
      stopLoss: s.stopLoss,
      tp1: s.tp1,
      tp2: s.tp2,
      tp3: s.tp3,
      priceAtSignal: s.priceAtSignal,
      entryType: inp?.entryType ?? "",
      status: s.status ?? "",
      outcome: s.outcome,
      closedReason: s.closedReason ?? "",
      fillStatus: s.fillStatus ?? "",
      filledAt: s.filledAt ?? "",
      fillPrice: s.fillPrice ?? "",
      outcomePrice: s.outcomePrice ?? "",
      outcomeTimestamp: s.outcomeTimestamp ?? "",
      tpHits: (s.tpHits ?? []).map((h) => `${h.level}@${h.at}:${h.price}`).join(";"),
      stoppedAfterTp: s.stoppedAfterTp ?? "",
      realizedR: s.realizedR ?? "",
      costR: s.costR ?? "",
      realizedNetR: s.realizedNetR ?? "",
      mfeR: s.mfeR ?? "",
      maeR: s.maeR ?? "",
      timeToTp1Min: s.timeToTp1Min ?? "",
      coverageGap: s.coverageGap ? `${s.coverageGap.from}-${s.coverageGap.to}` : "",
      tradeType: s.context?.tradeType ?? "",
      weightedScore: inp?.weightedScore ?? "",
      confidenceRaw: inp?.confidenceRaw ?? "",
      rr1: inp?.rr1 ?? "",
      atrPct: inp?.atrPct ?? "",
      fundingRate: inp?.fundingRate ?? "",
      minutesToNextEvent: inp?.minutesToNextEvent ?? "",
      regime: inp?.regime ?? "",
      regimeGate: inp?.regimeGate ?? "",
      pTp1: inp?.pTp1 ?? "",
      calibrationVersion: inp?.calibrationVersion ?? "",
    };
    lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

// ── Methodology changelog ────────────────────────────────────────────────────

export interface ChangelogEntry {
  at: string;
  commit: string;
  title: string;
  effect: string;
}

let changelogCache: { entries: ChangelogEntry[]; at: number } | null = null;

/** Static list shipped with the repo (data/changelog.json), newest first. */
export function readChangelog(): ChangelogEntry[] {
  if (changelogCache && Date.now() - changelogCache.at < 300_000) return changelogCache.entries;
  let entries: ChangelogEntry[] = [];
  try {
    const path = join(process.cwd(), "data", "changelog.json");
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
      if (Array.isArray(parsed)) entries = (parsed as ChangelogEntry[]).filter((e) => e && typeof e.at === "string" && typeof e.title === "string");
    }
  } catch {
    entries = [];
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));
  changelogCache = { entries, at: Date.now() };
  return entries;
}
