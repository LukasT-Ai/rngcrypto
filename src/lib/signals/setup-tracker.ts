/**
 * Active-setup age tracker. The engine rebuilds its horizon setups (SCALP / SWING / POSITION) from scratch on
 * every run, so the entry/stop/targets drift with price and nothing says how long a call has been standing.
 * This module remembers, per symbol and horizon, when the current direction was first published and stamps
 * it onto each setup as `calledAt`. The stamp resets when the direction flips or the horizon goes quiet
 * (no setup on a run), so "called 3h ago" always refers to the current uninterrupted call.
 *
 * Persisted next to signal-history.json so a redeploy does not zero every age.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "signals")
  : join(process.cwd(), "data");
const FILE_PATH = join(DATA_DIR, "active-setups.json");

export type SetupBias = "LONG" | "SHORT" | "NEUTRAL";

export interface TrackedSetup {
  bias: SetupBias;
  /** First run on which this direction appeared for the horizon. */
  calledAt: number;
  /** Entry price on the run that first published the call. */
  calledEntry: number;
  lastSeenAt: number;
}

type Store = Record<string, Record<string, TrackedSetup>>;

let memory: Store | null = null;

function load(): Store {
  if (memory) return memory;
  try {
    if (existsSync(FILE_PATH)) {
      memory = JSON.parse(readFileSync(FILE_PATH, "utf-8")) as Store;
      return memory;
    }
  } catch {
    /* corrupt file: start fresh */
  }
  memory = {};
  return memory;
}

function save(store: Store): void {
  memory = store;
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE_PATH, JSON.stringify(store), "utf-8");
  } catch {
    /* read-only filesystem: ages survive in memory for this process only */
  }
}

/** Test hook: drop the in-memory store so each test starts clean. */
export function resetSetupTracker(): void {
  memory = null;
}

/**
 * Reconcile the setups an engine run produced with what was tracked and return the same setups with
 * `calledAt` / `calledEntry` attached. Horizons missing from `setups` are forgotten.
 */
export function stampActiveSetups<T extends { horizonLabel: string; bias: SetupBias; entry: number }>(
  symbol: string,
  setups: T[],
  now = Date.now(),
): Array<T & { calledAt: number; calledEntry: number }> {
  const store = load();
  const prev = store[symbol] ?? {};
  const next: Record<string, TrackedSetup> = {};

  const stamped = setups.map((s) => {
    const was = prev[s.horizonLabel];
    const rec: TrackedSetup =
      was && was.bias === s.bias
        ? { ...was, lastSeenAt: now }
        : { bias: s.bias, calledAt: now, calledEntry: s.entry, lastSeenAt: now };
    next[s.horizonLabel] = rec;
    return { ...s, calledAt: rec.calledAt, calledEntry: rec.calledEntry };
  });

  if (Object.keys(next).length === 0) delete store[symbol];
  else store[symbol] = next;
  save(store);
  return stamped;
}
