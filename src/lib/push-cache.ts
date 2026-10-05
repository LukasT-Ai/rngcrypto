import fs from "node:fs";
import path from "node:path";

// Bot stats pushed by PM2 jobs. Persist on the Railway volume so a redeploy does not zero the dashboards;
// fall back to the repo's data/ directory (committed snapshots) when nothing has been pushed.
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH;
const PRIMARY_DIR = VOLUME ? path.join(VOLUME, "push") : path.join(process.cwd(), "data");
const LEGACY_DIR = path.join(process.cwd(), "data");

export function pushCachePath(name: string): string {
  try {
    if (!fs.existsSync(PRIMARY_DIR)) fs.mkdirSync(PRIMARY_DIR, { recursive: true });
  } catch {
    /* read-only fs: writes will fail loudly in the sync route */
  }
  return path.join(PRIMARY_DIR, name);
}

export interface Pushed {
  _pushedAt: number;
}

export function readPushFile<T extends Pushed>(name: string): T | null {
  for (const dir of [PRIMARY_DIR, LEGACY_DIR]) {
    try {
      const p = path.join(dir, name);
      if (!fs.existsSync(p)) continue;
      const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as T;
      if (raw && typeof raw._pushedAt === "number") return raw;
    } catch {
      /* try next location */
    }
  }
  return null;
}

export interface FreshnessMeta {
  source: "push" | "push-stale" | "archive" | "none";
  pushedAt: number | null;
  ageSeconds: number | null;
  stale: boolean;
  label: string;
  asOf: string | null;
}

export function humanAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function freshness(pushedAt: number | null, maxAgeMs: number, archiveAsOf?: string | null): FreshnessMeta {
  if (pushedAt == null) {
    if (archiveAsOf) {
      return {
        source: "archive",
        pushedAt: null,
        ageSeconds: null,
        stale: true,
        label: `Archived · data as of ${archiveAsOf.slice(0, 10)}`,
        asOf: archiveAsOf,
      };
    }
    return { source: "none", pushedAt: null, ageSeconds: null, stale: true, label: "No live feed", asOf: null };
  }
  const ageSeconds = Math.max(0, Math.round((Date.now() - pushedAt) / 1000));
  const stale = Date.now() - pushedAt > maxAgeMs;
  return {
    source: stale ? "push-stale" : "push",
    pushedAt,
    ageSeconds,
    stale,
    label: stale ? `Stale · last update ${humanAge(ageSeconds)} ago` : `Live · updated ${humanAge(ageSeconds)} ago`,
    asOf: new Date(pushedAt).toISOString(),
  };
}
