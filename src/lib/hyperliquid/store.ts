// Disk persistence for the copy-trade scanner: <dataDir>/copytrade/ where dataDir is the Railway volume in
// production and the repo's data/ directory locally (same resolution as push-cache.ts and the signals ledger).
// Writes are atomic (tmp + rename) so a crash mid-write never leaves a half file behind.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";

const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH;
export const COPYTRADE_DIR = VOLUME ? join(VOLUME, "copytrade") : join(process.cwd(), "data", "copytrade");
export const TRADERS_DIR = join(COPYTRADE_DIR, "traders");

export function ensureDirs() {
  try {
    if (!existsSync(TRADERS_DIR)) mkdirSync(TRADERS_DIR, { recursive: true });
  } catch {
    /* read-only fs: writes fail silently and the scanner serves from memory */
  }
}

export function readJson<T>(file: string): T | null {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** mtime in ms, or 0 when the file does not exist. */
export function fileMtime(file: string): number {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

export function writeJsonAtomic(file: string, value: unknown): boolean {
  try {
    ensureDirs();
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(value), "utf-8");
    renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

export const traderFile = (address: string) => join(TRADERS_DIR, `${address.toLowerCase()}.json`);

export function listTraderFiles(): string[] {
  try {
    return readdirSync(TRADERS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => join(TRADERS_DIR, f));
  } catch {
    return [];
  }
}

export function removeFile(file: string) {
  try {
    unlinkSync(file);
  } catch {
    /* already gone */
  }
}
