import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SignalLog } from "../logger";

const scratch = mkdtempSync(join(tmpdir(), "rng-ledger-routes-"));
process.env.RAILWAY_VOLUME_MOUNT_PATH = scratch;
process.env.HISTORY_RESTORE_TOKEN = "test-token";
process.env.COST_VENUE = "STRIKE";

let logger: typeof import("../logger");
let ledger: typeof import("../ledger");
let backup: typeof import("../backup/route");
let audit: typeof import("../[id]/route");
let history: typeof import("../route");

beforeAll(async () => {
  vi.resetModules();
  logger = await import("../logger");
  ledger = await import("../ledger");
  backup = await import("../backup/route");
  audit = await import("../[id]/route");
  history = await import("../route");
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const T = Date.parse("2026-10-06T10:02:00.000Z");
const closed: SignalLog = {
  id: "BTC-1",
  symbol: "BTC",
  timestamp: T,
  bias: "LONG",
  confidence: 70,
  grade: "A",
  entry: 100,
  stopLoss: 99,
  tp1: 101,
  tp2: 102,
  tp3: 103,
  priceAtSignal: 100,
  outcome: "tp1",
  outcomePrice: 101,
  outcomeTimestamp: T + 2 * 3600e3,
  maxFavorable: 1.5,
  maxAdverse: 0.2,
  status: "closed",
  tpHits: [{ level: 1, at: T + 3600e3, price: 101 }],
  stoppedAt: T + 2 * 3600e3,
  stoppedAfterTp: 1,
  closedReason: "stop_after_tp",
  realizedR: 1,
  costR: 0.16,
  realizedNetR: 0.84,
  fillPrice: 100,
  mfeR: 1.5,
  maeR: 0.2,
  timeToTp1Min: 58,
  fillStatus: "filled",
  filledAt: T + 300e3,
  engineVersion: "2026.10.13-feeds-abc123",
  context: {
    factors: { "Cloud/200MA Regime": "Bullish" },
    catalystScore: 0,
    oilGeoScore: null,
    oilRegime: null,
    atr: 1,
    tradeType: "SWING",
    timeframe: "15m",
    inputs: { weightedScore: 42.5, confidenceRaw: 71, components: { momentum: { score: 30, weight: 0.11 } }, rr1: 1, rr2: 2, rr3: 3, entryType: "market", atrPct: 1, fundingRate: 0.0001, minutesToNextEvent: 95, tuning: { minPublishConfidence: 60 }, gateNotes: [], engineVersion: "2026.10.13-feeds-abc123", calibrationVersion: null, pTp1: null, regime: "Bull regime", regimeGate: "none", markAtSignal: 100, lastAtSignal: 100.1, candleCloseTime: T - 120e3 },
  },
};
// Each request gets its own client IP so the per-IP limiter (5/min on the backup route) never interferes.
let ipSeq = 0;
const req = (url: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set("x-forwarded-for", `10.0.0.${++ipSeq}`);
  return new NextRequest(new URL(url, "http://localhost"), { ...init, headers } as ConstructorParameters<typeof NextRequest>[1]);
};

describe("backup route", () => {
  it("rejects a restore without the operator token and accepts it with the token", async () => {
    logger.replaceHistory([closed]);
    const body = JSON.stringify({ signals: [{ ...closed, id: "ETH-9", symbol: "ETH" }] });
    const noToken = await backup.POST(req("/api/signals/history/backup", { method: "POST", body }));
    expect(noToken.status).toBe(401);
    const wrong = await backup.POST(req("/api/signals/history/backup", { method: "POST", body, headers: { "x-restore-token": "nope" } }));
    expect(wrong.status).toBe(401);
    expect(logger.getHistory()).toHaveLength(1);
    const ok = await backup.POST(req("/api/signals/history/backup", { method: "POST", body, headers: { authorization: "Bearer test-token" } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).added).toBe(1);
    expect(logger.getHistory()).toHaveLength(2);
  });

  it("serves CSV with one row per record and the ledger hash header", async () => {
    logger.replaceHistory([closed]);
    ledger.resetLedgerHashCache();
    const res = await backup.GET(req("/api/signals/history/backup?format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    const lines = text.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith("id,symbol,timestamp,timestampIso,bias,confidence")).toBe(true);
    expect(lines[1]).toContain("BTC-1,BTC");
    expect(lines[1]).toContain("1@" + (T + 3600e3) + ":101");
    expect(lines[1]).toContain("0.84");
    expect(res.headers.get("x-ledger-sha256")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes the exact bytes it serves as the raw download", async () => {
    logger.replaceHistory([closed]);
    const rec = ledger.computeLedgerHash(true)!;
    const raw = await backup.GET(req("/api/signals/history/backup?format=raw"));
    const bytes = Buffer.from(await raw.arrayBuffer());
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(rec.sha256);
    expect(raw.headers.get("x-ledger-sha256")).toBe(rec.sha256);
    expect(rec.count).toBe(1);
    expect(JSON.parse(readFileSync(join(scratch, "signals", "ledger-hash.json"), "utf-8")).sha256).toBe(rec.sha256);
    const hash = await backup.GET(req("/api/signals/history/backup?format=hash"));
    expect((await hash.json()).sha256).toBe(rec.sha256);
    // Idempotent per day unless forced.
    expect(ledger.computeLedgerHash()?.hashedAt).toBe(rec.hashedAt);
  });
});

describe("audit route", () => {
  it("returns inputs at call time and the resolution timeline, 404 for unknown ids", async () => {
    logger.replaceHistory([closed]);
    const miss = await audit.GET(req("/api/signals/history/nope"), { params: Promise.resolve({ id: "nope" }) });
    expect(miss.status).toBe(404);
    const res = await audit.GET(req("/api/signals/history/BTC-1"), { params: Promise.resolve({ id: "BTC-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signal.id).toBe("BTC-1");
    expect(body.inputs).toMatchObject({ weightedScore: 42.5, confidenceRaw: 71, rr1: 1, rr2: 2, entryType: "market", fundingRate: 0.0001, minutesToNextEvent: 95, regime: "Bull regime", engineVersion: "2026.10.13-feeds-abc123" });
    expect(body.inputs.components.momentum).toEqual({ score: 30, weight: 0.11 });
    expect(body.resolution).toMatchObject({ fillCandle: T + 300e3, fillPrice: 100, closedReason: "stop_after_tp", grossR: 1, netR: 0.84, costR: 0.16, costEstimated: false, coverageGap: null });
    expect(body.resolution.firstEligibleCandle).toBe(Date.parse("2026-10-06T10:05:00.000Z"));
    expect(body.resolution.horizonEnd).toBe(T + 48 * 3600e3);
    expect(body.resolution.tpTouches).toEqual([{ level: 1, at: T + 3600e3, price: 101 }]);
    expect(body.resolution.stopTouch).toEqual({ at: T + 2 * 3600e3, price: 99, afterTp: 1 });
    expect(body.resolution.reasonText).toContain("Reached TP1 at 101.00, then stopped");
    expect(body.resolution.reasonText).toContain("+1.00R (+0.84R net)");
  });

  it("serves the changelog and attaches ledger + changelog to the performance stats", async () => {
    const cl = await history.GET(req("/api/signals/history?view=changelog"));
    const entries = (await cl.json()).changelog as { at: string; commit: string; title: string }[];
    expect(entries.length).toBeGreaterThanOrEqual(5);
    expect(entries.some((e) => e.title.toLowerCase().includes("cost model"))).toBe(true);
    expect(entries.some((e) => e.title.toLowerCase().includes("horizon"))).toBe(true);
    // Newest first
    expect(entries[0].at >= entries[entries.length - 1].at).toBe(true);
    logger.replaceHistory([closed]);
    ledger.computeLedgerHash(true);
    const perf = await history.GET(req("/api/signals/history?view=performance&range=all"));
    const stats = (await perf.json()).stats;
    expect(stats.ledger.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stats.ledger.csvUrl).toBe("/api/signals/history/backup?format=csv");
    expect(stats.ledger.count).toBe(1);
    expect(stats.changelog.length).toBe(entries.length);
  });
});
