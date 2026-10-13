/**
 * Calibration maths and the Stage 0/1 calibrated probability (perf audit 2.3 and 3).
 *
 * Pure part (no I/O), used by performance.ts and the backtest:
 *   wilson()            95% interval for a binomial rate
 *   brierSet()          Brier score, Murphy decomposition and skill score for (p, y) pairs
 *   fitPlatt()          L2-regularised logistic fit P(y=1) = sigmoid(a * s + b) with a 2x2 covariance
 *   plattProbability()  point estimate and 95% interval from a fit
 *
 * Persistence part (PR 17): refreshCalibration() fits on decided, non-shadow signals of the current engine
 * version, writes data/calibration.json and decides whether the mapping is active. pTp1For() is what the
 * engine and the hot board call; it returns nulls until the gate (n >= 100 decided) opens or after a revert.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import type { SignalLog } from "../../app/api/signals/history/logger";

// ── Pure maths ───────────────────────────────────────────────────────────────

const Z95 = 1.959964;

/** Wilson score interval (95%) for k successes in n trials. [0, 0] for n = 0. Returned as fractions. */
export function wilson(k: number, n: number, z = Z95): [number, number] {
  if (!(n > 0)) return [0, 0];
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  const r12 = (v: number) => Math.round(v * 1e12) / 1e12;
  return [Math.max(0, r12(centre - half)), Math.min(1, r12(centre + half))];
}

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export interface BrierSet {
  n: number;
  brier: number | null;
  /** Brier of the constant base-rate forecast = o(1 - o); the "climatology" reference. */
  base: number | null;
  /** 1 - brier / base. <= 0 means the probability carries no information beyond the base rate. */
  bss: number | null;
  reliability: number | null;
  resolution: number | null;
  uncertainty: number | null;
}

/**
 * Brier score with the Murphy decomposition. Bins are supplied by the caller (a bin key per pair) so the
 * table rows and the decomposition use the same partition: reliability = sum n_k (f_k - o_k)^2 / N,
 * resolution = sum n_k (o_k - o)^2 / N, uncertainty = o (1 - o); Brier = rel - res + unc up to binning error.
 */
export function brierSet(pairs: { p: number; y: 0 | 1; bin: string }[]): BrierSet {
  const n = pairs.length;
  if (n === 0) return { n: 0, brier: null, base: null, bss: null, reliability: null, resolution: null, uncertainty: null };
  const brier = pairs.reduce((a, q) => a + (q.p - q.y) ** 2, 0) / n;
  const o = pairs.reduce((a, q) => a + q.y, 0) / n;
  const unc = o * (1 - o);
  const bins = new Map<string, { n: number; f: number; o: number }>();
  for (const q of pairs) {
    const b = bins.get(q.bin) ?? { n: 0, f: 0, o: 0 };
    b.n++;
    b.f += q.p;
    b.o += q.y;
    bins.set(q.bin, b);
  }
  let rel = 0;
  let res = 0;
  for (const b of bins.values()) {
    const fk = b.f / b.n;
    const ok = b.o / b.n;
    rel += b.n * (fk - ok) ** 2;
    res += b.n * (ok - o) ** 2;
  }
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    n,
    brier: r6(brier),
    base: r6(unc),
    bss: unc > 0 ? r6(1 - brier / unc) : null,
    reliability: r6(rel / n),
    resolution: r6(res / n),
    uncertainty: r6(unc),
  };
}

export interface PlattFit {
  a: number;
  b: number;
  n: number;
  /** Inverse Hessian at the optimum, in the ORIGINAL score units: [[var_a, cov], [cov, var_b]]. */
  cov: [[number, number], [number, number]];
  iterations: number;
  converged: boolean;
}

// The score is standardised by SCALE before fitting so the L2 penalty on the slope is in sensible units
// (weightedScore spans about -100..100). Results are mapped back to raw units.
const SCALE = 50;

/**
 * Logistic fit of y on s: P(y = 1) = sigmoid(a * s + b). Newton's method with an L2 penalty (lambda) on the
 * slope only, so a flat, uninformative score shrinks toward the base rate rather than toward 0.5.
 */
export function fitPlatt(points: { s: number; y: 0 | 1 }[], lambda = 1): PlattFit | null {
  const n = points.length;
  if (n < 10) return null;
  const xs = points.map((p) => p.s / SCALE);
  let a = 0;
  // Start at the base-rate logit so a degenerate sample converges in one step.
  const o = points.reduce((acc, p) => acc + p.y, 0) / n;
  let b = Math.log(Math.max(1e-6, o) / Math.max(1e-6, 1 - o));
  let converged = false;
  let iter = 0;
  let haa = 0, hab = 0, hbb = 0;
  for (; iter < 50; iter++) {
    let ga = lambda * a, gb = 0;
    haa = lambda; hab = 0; hbb = 0;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(a * xs[i] + b);
      const w = p * (1 - p);
      const d = p - points[i].y;
      ga += d * xs[i];
      gb += d;
      haa += w * xs[i] * xs[i];
      hab += w * xs[i];
      hbb += w;
    }
    const det = haa * hbb - hab * hab;
    if (!(Math.abs(det) > 1e-12)) break;
    const da = (hbb * ga - hab * gb) / det;
    const db = (haa * gb - hab * ga) / det;
    a -= da;
    b -= db;
    if (Math.abs(da) < 1e-8 && Math.abs(db) < 1e-8) {
      converged = true;
      break;
    }
  }
  const det = haa * hbb - hab * hab;
  if (!(Math.abs(det) > 1e-12) || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  // Inverse Hessian in standardised units, then rescale: a_raw = a / SCALE.
  const invAA = hbb / det;
  const invAB = -hab / det;
  const invBB = haa / det;
  return {
    a: a / SCALE,
    b,
    n,
    cov: [
      [invAA / (SCALE * SCALE), invAB / SCALE],
      [invAB / SCALE, invBB],
    ],
    iterations: iter + 1,
    converged,
  };
}

/** Point probability and 95% interval (delta method on the logit) for a raw score under a fit. */
export function plattProbability(fit: Pick<PlattFit, "a" | "b" | "cov">, s: number): { p: number; ci: [number, number] } {
  const logit = fit.a * s + fit.b;
  const v = fit.cov[0][0] * s * s + 2 * fit.cov[0][1] * s + fit.cov[1][1];
  const se = Math.sqrt(Math.max(0, v));
  const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
  return { p: r4(sigmoid(logit)), ci: [r4(sigmoid(logit - Z95 * se)), r4(sigmoid(logit + Z95 * se))] };
}

/** Signed score used as the Platt input: positive when the call direction agrees with the lean. */
export function signedScore(weightedScore: number, bias: "LONG" | "SHORT"): number {
  return bias === "LONG" ? weightedScore : -weightedScore;
}

// ── Persistence (PR 17) ──────────────────────────────────────────────────────

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "signals")
  : join(process.cwd(), "data");
const FILE_PATH = join(DATA_DIR, "calibration.json");

/** Decided, non-shadow signals on the current engine version needed before a probability is published. */
export const CALIBRATION_MIN_N = 100;
/** Rolling window (decided signals) for the auto-revert comparison. */
export const REVERT_WINDOW = 50;

export interface CalibrationFile {
  version: string;
  engineVersion: string;
  fitAt: string;
  /** Decided, non-shadow records of this engine version available at fit time. */
  n: number;
  gateN: number;
  platt: { a: number; b: number; n: number; cov: [[number, number], [number, number]]; holdoutN: number; holdoutBrier: number | null; holdoutBss: number | null; trainBrier: number | null } | null;
  /** True when pTp1 is published. False below the gate or after a revert. */
  active: boolean;
  reason: string;
  /** Last guard evaluation: calibrated vs raw-confidence Brier skill over the trailing window. */
  guard: { window: number; bssCalibrated: number | null; bssRaw: number | null; reverted: boolean; at: string } | null;
}

let cache: { file: CalibrationFile | null; at: number } | null = null;

export function calibrationPath(): string {
  return FILE_PATH;
}

export function readCalibration(): CalibrationFile | null {
  if (cache && Date.now() - cache.at < 60_000) return cache.file;
  let file: CalibrationFile | null = null;
  try {
    if (existsSync(FILE_PATH)) file = JSON.parse(readFileSync(FILE_PATH, "utf-8")) as CalibrationFile;
  } catch {
    file = null;
  }
  cache = { file, at: Date.now() };
  return file;
}

/** Test hook. */
export function resetCalibrationCache(): void {
  cache = null;
}

function writeCalibration(file: CalibrationFile): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE_PATH}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(file, null, 2), "utf-8");
    renameSync(tmp, FILE_PATH);
  } catch {
    /* read-only filesystem: the in-memory copy still serves this process */
  }
  cache = { file, at: Date.now() };
}

const isDecided = (s: SignalLog): boolean => {
  if (s.shadow) return false;
  const open = s.status ? s.status === "open" : s.outcome === "pending";
  if (open) return false;
  if (s.closedReason === "unfilled" || s.closedReason === "unverifiable") return false;
  const tp1 = (s.tpHits?.length ?? 0) >= 1 || s.outcome === "tp1" || s.outcome === "tp2" || s.outcome === "tp3";
  const stopped = s.stoppedAfterTp === 0 || (s.stoppedAfterTp == null && s.outcome === "stopped");
  return tp1 || stopped;
};
const yTp1 = (s: SignalLog): 0 | 1 => ((s.tpHits?.length ?? 0) >= 1 || s.outcome === "tp1" || s.outcome === "tp2" || s.outcome === "tp3" ? 1 : 0);

export interface CalibrationPoint {
  s: number;
  y: 0 | 1;
  confidence: number;
  t: number;
}

/** Decided, non-shadow records of `engineVersion` with a logged weighted score, oldest first. */
export function calibrationPoints(all: SignalLog[], engineVersion: string): CalibrationPoint[] {
  return all
    .filter((s) => isDecided(s) && s.engineVersion === engineVersion && typeof s.context?.inputs?.weightedScore === "number")
    .map((s) => ({ s: signedScore(s.context!.inputs!.weightedScore, s.bias), y: yTp1(s), confidence: s.confidence, t: s.outcomeTimestamp ?? s.timestamp }))
    .sort((a, b) => a.t - b.t);
}

/**
 * Fit (time-ordered 80/20 split for the hold-out figures, then refit on everything for the published
 * mapping), run the revert guard and persist. Pure given its inputs; `now` is injectable for tests.
 */
export function buildCalibration(all: SignalLog[], engineVersion: string, now = Date.now(), previous: CalibrationFile | null = null): CalibrationFile {
  const pts = calibrationPoints(all, engineVersion);
  const n = pts.length;
  const at = new Date(now).toISOString();
  const version = `platt-${engineVersion}-${at.slice(0, 10)}-n${n}`;
  const basis = { version, engineVersion, fitAt: at, n, gateN: CALIBRATION_MIN_N };
  if (n < CALIBRATION_MIN_N) {
    return { ...basis, platt: null, active: false, reason: `below gate: ${n} of ${CALIBRATION_MIN_N} decided on ${engineVersion}`, guard: null };
  }
  const split = Math.floor(n * 0.8);
  const train = pts.slice(0, split);
  const hold = pts.slice(split);
  const trainFit = fitPlatt(train);
  const full = fitPlatt(pts);
  if (!trainFit || !full) {
    return { ...basis, platt: null, active: false, reason: "fit failed (degenerate sample)", guard: null };
  }
  const holdPairs = hold.map((p) => ({ p: sigmoid(trainFit.a * p.s + trainFit.b), y: p.y, bin: bandOf(p.confidence) }));
  const holdStats = brierSet(holdPairs);
  const trainStats = brierSet(train.map((p) => ({ p: sigmoid(trainFit.a * p.s + trainFit.b), y: p.y, bin: bandOf(p.confidence) })));

  // Auto-revert guard: over the last REVERT_WINDOW decided, does the calibrated probability beat the raw
  // confidence as a probability? Uses the PREVIOUS published mapping when there is one (that is what traders
  // saw), else the fresh train fit. A tie or a loss switches publication off; a later refresh can switch it on.
  const win = pts.slice(-REVERT_WINDOW);
  const mapping = previous?.platt ?? trainFit;
  const calPairs = win.map((p) => ({ p: sigmoid(mapping.a * p.s + mapping.b), y: p.y, bin: bandOf(p.confidence) }));
  const rawPairs = win.map((p) => ({ p: Math.min(1, Math.max(0, p.confidence / 100)), y: p.y, bin: bandOf(p.confidence) }));
  const bssCal = brierSet(calPairs).bss;
  const bssRaw = brierSet(rawPairs).bss;
  const reverted = bssCal == null || bssRaw == null ? false : bssCal < bssRaw;
  const guard = { window: win.length, bssCalibrated: bssCal, bssRaw, reverted, at };
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    ...basis,
    platt: {
      a: r6(full.a),
      b: r6(full.b),
      n: full.n,
      cov: full.cov,
      holdoutN: hold.length,
      holdoutBrier: holdStats.brier,
      holdoutBss: holdStats.bss,
      trainBrier: trainStats.brier,
    },
    active: !reverted,
    reason: reverted ? `auto-revert: calibrated BSS ${bssCal} below raw-confidence BSS ${bssRaw} over the last ${win.length} decided` : `active: ${n} decided on ${engineVersion}`,
    guard,
  };
}

/** 5-point stated-confidence band key shared by the calibration table and the Brier bins. */
export function bandOf(confidence: number): string {
  if (confidence < 55) return "<55";
  if (confidence >= 100) return "100";
  const lo = Math.floor(confidence / 5) * 5;
  return `${lo}-${lo + 4}`;
}

export function refreshCalibration(all: SignalLog[], engineVersion: string, now = Date.now()): CalibrationFile {
  const file = buildCalibration(all, engineVersion, now, readCalibration());
  writeCalibration(file);
  return file;
}

export interface PTp1 {
  pTp1: number | null;
  pTp1Ci: [number, number] | null;
  calibrationVersion: string | null;
}

/** Calibrated P(TP1) for a call, or nulls when the mapping is not active for this engine version. */
export function pTp1For(weightedScore: number, bias: "LONG" | "SHORT" | "WAIT", engineVersion: string, file: CalibrationFile | null = readCalibration()): PTp1 {
  if (process.env.CALIBRATION === "off") return { pTp1: null, pTp1Ci: null, calibrationVersion: null };
  if (!file || !file.active || !file.platt || file.engineVersion !== engineVersion || bias === "WAIT") {
    return { pTp1: null, pTp1Ci: null, calibrationVersion: null };
  }
  const { p, ci } = plattProbability(file.platt, signedScore(weightedScore, bias));
  return { pTp1: p, pTp1Ci: ci, calibrationVersion: file.version };
}
