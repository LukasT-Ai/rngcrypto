import fs from "node:fs";
import path from "node:path";
import type { HistoricalStats, MacroAsset, MacroRegime, ReactionLabel, StoredRelease, SurpriseMagnitude } from "./types";

const DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "macro") : path.join(process.cwd(), "data", "macro");
const FILE = path.join(DIR, "releases.json");
const MAX = 5000;

let mem: StoredRelease[] | null = null;

function load(): StoredRelease[] {
  if (mem) return mem;
  try {
    if (fs.existsSync(FILE)) {
      mem = JSON.parse(fs.readFileSync(FILE, "utf-8")) as StoredRelease[];
      return mem;
    }
  } catch {
    /* corrupt file: start fresh but do not delete it */
  }
  mem = [];
  return mem;
}

function save(list: StoredRelease[]) {
  mem = list;
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(list), "utf-8");
  } catch {
    /* read-only fs */
  }
}

export function getStoredReleases(): StoredRelease[] {
  return load();
}

export function upsertRelease(rec: StoredRelease): void {
  const list = load();
  const i = list.findIndex((r) => r.id === rec.id);
  if (i >= 0) list[i] = rec;
  else list.unshift(rec);
  if (list.length > MAX) list.length = MAX;
  save(list);
}

export function findRelease(id: string): StoredRelease | null {
  return load().find((r) => r.id === id) ?? null;
}

// Rolling SD of (actual − forecast) once we have enough of our own observations; otherwise null (caller uses prior).
export function rollingSurpriseSD(defId: string, min = 6): number | null {
  const xs = load()
    .filter((r) => r.defId === defId && r.actual != null && r.forecast != null)
    .map((r) => (r.actual as number) - (r.forecast as number));
  if (xs.length < min) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v) || null;
}

const ASSET_KEY: Record<MacroAsset, "btc" | "gold" | "wti"> = { BTC: "btc", GOLD: "gold", WTI: "wti" };

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface Segment {
  surpriseSign?: "positive" | "negative";
  magnitude?: SurpriseMagnitude[];
  regime?: Partial<Pick<MacroRegime, "inflationFocus" | "policyBias" | "risk">>;
}

export function historicalStats(defId: string, seg: Segment): HistoricalStats {
  const rows = load().filter((r) => {
    if (r.defId !== defId || r.surpriseScore == null) return false;
    if (seg.surpriseSign === "positive" && r.surpriseScore <= 0) return false;
    if (seg.surpriseSign === "negative" && r.surpriseScore >= 0) return false;
    if (seg.magnitude && !seg.magnitude.includes(r.magnitude)) return false;
    if (seg.regime) {
      for (const [k, v] of Object.entries(seg.regime)) if (v && r.regime[k as keyof typeof r.regime] !== v) return false;
    }
    return true;
  });
  const medians = { BTC: {}, GOLD: {}, WTI: {} } as HistoricalStats["medians"];
  const labels: ReactionLabel[] = ["5m", "15m", "1h", "4h", "24h"];
  for (const asset of ["BTC", "GOLD", "WTI"] as MacroAsset[]) {
    for (const label of labels) {
      const xs = rows.map((r) => r.reactions.find((p) => p.label === label)?.changesPct[ASSET_KEY[asset]]).filter((x): x is number => x != null);
      const m = median(xs);
      if (m != null) medians[asset][label] = Math.round(m * 100) / 100;
    }
  }
  const segName = [
    seg.surpriseSign ? `${seg.surpriseSign} surprise` : null,
    seg.magnitude ? seg.magnitude.join("/") : null,
    seg.regime?.inflationFocus ? `${seg.regime.inflationFocus} inflation focus` : null,
    seg.regime?.policyBias ? seg.regime.policyBias : null,
    seg.regime?.risk ? `risk-${seg.regime.risk}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return { eventId: defId, segment: segName || "all releases", sampleSize: rows.length, medians };
}

// Best available segment: regime + sign if enough samples, else sign only, else all.
export function bestHistoricalStats(defId: string, surpriseScore: number | null, regime: MacroRegime): HistoricalStats | null {
  if (surpriseScore == null) return null;
  const sign = surpriseScore > 0 ? "positive" : "negative";
  const tiers: Segment[] = [
    { surpriseSign: sign, regime: { inflationFocus: regime.inflationFocus, policyBias: regime.policyBias } },
    { surpriseSign: sign, regime: { risk: regime.risk } },
    { surpriseSign: sign },
    {},
  ];
  for (const t of tiers) {
    const s = historicalStats(defId, t);
    if (s.sampleSize >= 5) return s;
  }
  const all = historicalStats(defId, {});
  return all.sampleSize > 0 ? all : null;
}
