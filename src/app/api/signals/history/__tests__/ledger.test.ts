import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SignalLog } from "../logger";

// The logger resolves its data dir at import time, so point it at a scratch volume before loading it.
const scratch = mkdtempSync(join(tmpdir(), "rng-ledger-"));
process.env.RAILWAY_VOLUME_MOUNT_PATH = scratch;

type Logger = typeof import("../logger");
let logger: Logger;

beforeAll(async () => {
  vi.resetModules();
  logger = await import("../logger");
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const NOW = Date.now();
function sig(i: number, over: Partial<SignalLog> = {}): SignalLog {
  return {
    id: `BTC-${i}`,
    symbol: "BTC",
    timestamp: NOW - i * 60e3,
    bias: "LONG",
    confidence: 70,
    grade: "A",
    entry: 100,
    stopLoss: 99,
    tp1: 101,
    tp2: 102,
    tp3: 103,
    priceAtSignal: 100,
    outcome: "stopped",
    outcomePrice: 99,
    outcomeTimestamp: NOW - i * 60e3 + 1000,
    maxFavorable: null,
    maxAdverse: null,
    status: "closed",
    closedReason: "stop_before_tp",
    realizedR: -1,
    fillStatus: "filled",
    filledAt: NOW - i * 60e3 + 300,
    ...over,
  };
}

describe("ledger archive roll-over", () => {
  it("moves the oldest closed records beyond the cap into the archive instead of dropping them", () => {
    const { rollover, MAX_SIGNALS } = logger;
    const rows = Array.from({ length: MAX_SIGNALS + 3 }, (_, i) => sig(i));
    // The very last (oldest) record is still open: it must stay live so the checker keeps seeing it.
    rows[rows.length - 1] = sig(rows.length - 1, { status: "open", outcome: "pending", closedReason: null, realizedR: null });
    const { live, archived } = rollover(rows);
    expect(live).toHaveLength(MAX_SIGNALS + 1);
    expect(archived).toHaveLength(2);
    expect(archived.map((s) => s.id)).toEqual([`BTC-${MAX_SIGNALS}`, `BTC-${MAX_SIGNALS + 1}`]);
    expect(live[live.length - 1].status).toBe("open");
  });

  it("writes the overflow to the archive file and getAllHistory() still returns every record", () => {
    const { replaceHistory, getHistory, getAllHistory, getArchive, findSignal, MAX_SIGNALS, historyPaths } = logger;
    const rows = Array.from({ length: MAX_SIGNALS + 5 }, (_, i) => sig(i));
    replaceHistory(rows);
    expect(getHistory()).toHaveLength(MAX_SIGNALS);
    expect(getArchive()).toHaveLength(5);
    expect(getAllHistory()).toHaveLength(MAX_SIGNALS + 5);
    expect(findSignal(`BTC-${MAX_SIGNALS + 4}`)?.id).toBe(`BTC-${MAX_SIGNALS + 4}`);
    const paths = historyPaths();
    expect(existsSync(paths.archive)).toBe(true);
    expect((JSON.parse(readFileSync(paths.archive, "utf-8")) as SignalLog[]).length).toBe(5);
    // A second roll-over appends without duplicating ids.
    replaceHistory([sig(-1), ...getHistory()]);
    expect(getArchive()).toHaveLength(6);
    expect(new Set(getArchive().map((s) => s.id)).size).toBe(6);
    expect(getAllHistory()).toHaveLength(MAX_SIGNALS + 6);
  });

  it("applies a batch of patches with one write and ignores unknown ids", () => {
    const { replaceHistory, applyUpdates, getHistory, resetHistoryCache, historyPaths } = logger;
    replaceHistory([sig(1, { status: "open", outcome: "pending" }), sig(2, { status: "open", outcome: "pending" })]);
    const patches = new Map<string, Partial<SignalLog>>([
      ["BTC-1", { lastCheckedAt: NOW, mfeR: 0.4 }],
      ["BTC-2", { status: "closed", outcome: "stopped", realizedR: -1 }],
      ["ETH-9", { status: "closed" }],
    ]);
    expect(applyUpdates(patches)).toBe(2);
    resetHistoryCache();
    const fromDisk = JSON.parse(readFileSync(historyPaths().live, "utf-8")) as SignalLog[];
    expect(fromDisk.find((s) => s.id === "BTC-1")?.mfeR).toBe(0.4);
    expect(fromDisk.find((s) => s.id === "BTC-2")?.status).toBe("closed");
    expect(getHistory()).toHaveLength(2);
  });

  it("keeps shadow records in their own dedupe pool", () => {
    const { shouldAppend } = logger;
    const realOpen = sig(1, { status: "open", outcome: "pending" });
    const shadowOpen = sig(2, { status: "open", outcome: "pending", shadow: true, shadowClass: "wait_lean" });
    expect(shouldAppend([realOpen], "BTC", "LONG", NOW, true)).toBe(true);
    expect(shouldAppend([shadowOpen], "BTC", "LONG", NOW, false)).toBe(true);
    expect(shouldAppend([shadowOpen], "BTC", "LONG", NOW, true)).toBe(false);
  });
});
