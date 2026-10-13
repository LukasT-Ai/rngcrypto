// Two module instances (the Next.js instrumentation bundle and a route bundle) share state only through the
// files under <dataDir>/copytrade/. This test writes from one fresh import and reads from another.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Scanner = typeof import("./scanner");
type Store = typeof import("./store");

let dir: string;
const prevVolume = process.env.RAILWAY_VOLUME_MOUNT_PATH;

async function freshScanner(): Promise<Scanner> {
  vi.resetModules();
  return import("./scanner");
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "copytrade-sync-"));
  process.env.RAILWAY_VOLUME_MOUNT_PATH = dir;
});

afterAll(() => {
  if (prevVolume === undefined) delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
  else process.env.RAILWAY_VOLUME_MOUNT_PATH = prevVolume;
  rmSync(dir, { recursive: true, force: true });
});

describe("scanner state across module instances", () => {
  it("a reader instance picks up scan.json and status.json written later, and again when they change", async () => {
    const reader = await freshScanner();
    // Nothing on disk yet: empty but well-formed.
    const s0 = reader.getScanStatus();
    expect(s0.candidates).toBe(0);
    expect(s0.nextScanAt).toBeNull();
    expect(reader.queryRows({ asset: "ALL", window: "month", sort: "copyability", minVolume: 0, limit: 10, minFocus: 0 })).toEqual([]);

    // A second instance (the writer) records nextScanAt and persists a scan with one record.
    const store = (await import("./store")) as Store;
    const writer = await freshScanner();
    writer.setNextScanAt(1_000_000);
    const leader = { address: "0xabc", displayName: "w", equity: 50_000, windows: { day: { pnl: 0, roi: 0, volume: 0 }, week: { pnl: 0, roi: 0, volume: 0 }, month: { pnl: 500, roi: 1, volume: 1e6 }, allTime: { pnl: 0, roi: 0, volume: 0 } } };
    const rec = writer.buildRecord(leader, [], [null, null, null], null, true, null, 10);
    const scanFile = join(store.COPYTRADE_DIR, "scan.json");
    store.writeJsonAtomic(scanFile, { version: 3, savedAt: 1, lastFullScanAt: 2, candidates: [leader], discovered: [], probed: {}, records: [rec] });

    // The reader notices both files without a restart.
    const s1 = reader.getScanStatus(10);
    expect(s1.nextScanAt).toBe(1_000_000);
    expect(s1.candidates).toBe(1);
    expect(s1.scanned).toBe(1);
    expect(s1.lastFullScanAt).toBe(2);
    expect(reader.getRecord("0xABC")?.displayName).toBe("w");
    const rows = reader.queryRows({ asset: "ALL", window: "month", sort: "copyability", minVolume: 0, limit: 10, minFocus: 0 });
    expect(rows.map((r) => r.address)).toEqual(["0xabc"]);

    // A later write with a different mtime replaces the reader's state (records are not merged, they are reloaded).
    const leader2 = { ...leader, address: "0xdef", displayName: "w2" };
    const rec2 = writer.buildRecord(leader2, [], [null, null, null], null, true, null, 11);
    writeFileSync(scanFile, JSON.stringify({ version: 3, savedAt: 3, lastFullScanAt: 4, candidates: [leader, leader2], discovered: [], probed: {}, records: [rec, rec2] }));
    const future = new Date(Date.now() + 5_000);
    utimesSync(scanFile, future, future);
    const s2 = reader.getScanStatus(10);
    expect(s2.candidates).toBe(2);
    expect(s2.scanned).toBe(2);
    expect(s2.lastFullScanAt).toBe(4);
    expect(reader.querySummary("month").COPYABLE.length).toBe(0); // neither wallet has copyable fills
    expect(reader.getScanDebug().writer).toBe(false);
    expect(writer.getScanDebug().writer).toBe(true);
  });
});
