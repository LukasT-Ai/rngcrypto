import type { CalibrationBucket, SignalLog, SignalStats } from "./logger";
import { activeCostVenue, costInR } from "./check/core";
import { bandOf, brierSet, sigmoid, wilson as wilsonFrac, type CalibrationFile } from "@/lib/signals/calibration";

export interface PerformanceOptions {
  rangeDays?: number | null;
  assets?: string[] | null;
  grades?: string[] | null;
  bias?: "LONG" | "SHORT" | null;
  dedupe?: boolean;
  limit?: number;
  /** Current engine version (for meta and the provisional banner); the route passes ENGINE_VERSION. */
  engineVersion?: string | null;
  /** Current calibration file (PR 17); null = no mapping, calibrated columns stay null. */
  calibration?: CalibrationFile | null;
  /** Ledger hash record and changelog (PR 13); passed through untouched. */
  ledger?: PerformanceStats["ledger"] | null;
  changelog?: PerformanceStats["changelog"] | null;
}

/** Wilson 95% interval as percentages with one decimal; [null, null] for n = 0. */
export function wilson(k: number, n: number): [number | null, number | null] {
  if (!(n > 0)) return [null, null];
  const [lo, hi] = wilsonFrac(k, n);
  return [Math.round(lo * 1000) / 10, Math.round(hi * 1000) / 10];
}

export interface Bucket {
  key: string;
  n: number;
  tp1Rate: number | null;
  expectancyR: number | null;
  wins: number;
  losses: number;
}

export interface NormalizedSignal {
  id: string;
  symbol: string;
  assetClass: string;
  bias: "LONG" | "SHORT";
  timestamp: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  confidence: number;
  grade: string;
  tradeType: string | null;
  oilRegime: string | null;
  // Factor assessments logged with the call (category -> assessment), used for factor attribution.
  factors: Record<string, string>;
  open: boolean;
  tpLevels: { level: 1 | 2 | 3; at: number | null; price: number }[];
  highestTp: 0 | 1 | 2 | 3;
  stoppedAfterTp: 0 | 1 | 2 | 3 | null;
  closedReason: string | null;
  closedAt: number | null;
  realizedR: number | null;
  mfeR: number | null;
  maeR: number | null;
  timeToTp1Min: number | null;
  outcomeLabel: string;
  duplicatesMerged: number;
  // Fill model. Legacy records without fillStatus are assumed filled (their entry sat at the market).
  fillStatus: "filled" | "pending" | "unfilled";
  filledAt: number | null;
  // Unfilled / unverifiable records are shown in the log but never enter a rate, R sum or equity curve.
  excluded: boolean;
  // Half the position out at TP1, stop to breakeven on the rest; see conservativeR().
  conservativeR: number | null;
  engineVersion: string;
  // Cost model (2026-10-13). `realizedR` is gross; `realizedNetR` = gross - costR. Records closed before the
  // model carry no costR, so one is estimated from entry type and hold time (no funding) and flagged.
  entryType: "market" | "limit" | null;
  fillPrice: number | null;
  costR: number | null;
  costEstimated: boolean;
  realizedNetR: number | null;
  shadow: boolean;
  shadowClass: string | null;
  coverageGap: boolean;
  // Inputs at call time (PR 03); null on records logged before 2026-10-13.
  weightedScore: number | null;
  confidenceRaw: number | null;
  rr1: number | null;
  atrPct: number | null;
  pTp1: number | null;
  calibrationVersion: string | null;
  components: Record<string, { score: number; weight: number }> | null;
  minutesToNextEvent: number | null;
}

export interface CalBucket extends Bucket {
  meanConf: number | null;
  wilsonLo: number | null;
  wilsonHi: number | null;
  /** Share of closed rows in the band with gross R > 0 (expired horizon exits included). */
  pPos: number | null;
  meanNetR: number | null;
  brierNaive: number | null;
  brierCal: number | null;
}

// Minimal row the calibration table needs, so the backtest can feed its trades through the same function.
export interface CalRow {
  confidence: number;
  grade: string;
  rr1: number | null;
  pTp1: number | null;
  /** TP1 or the stop was reached (a verdict exists). */
  decided: boolean;
  tp1: boolean;
  grossR: number | null;
  netR: number | null;
  /** weightedScore signed toward the call (positive = agrees with the lean); null when not logged. */
  signedScore: number | null;
}

export interface CalibrationStats {
  byConfidence: CalBucket[];
  byGrade: CalBucket[];
  byRr1: CalBucket[];
  byPTp1: CalBucket[];
  brier: { naive: number | null; calibrated: number | null; base: number | null; bss: number | null; bssCalibrated: number | null; reliability: number | null; resolution: number | null; uncertainty: number | null; n: number };
  platt: { a: number; b: number; n: number; holdoutBrier: number | null; fitAt: string; version: string } | null;
}

export interface PerformanceStats {
  kpis: {
    closedN: number;
    // Closed signals that reached a verdict (TP1 or stop). Expired-without-touch signals are excluded from every rate.
    decidedN: number;
    expiredN: number;
    openN: number;
    tp1Rate: number | null;
    tp2Rate: number | null;
    tp3Rate: number | null;
    ladder: { tp2GivenTp1: number | null; tp3GivenTp2: number | null; n1: number; n2: number };
    stopBeforeTpRate: number | null;
    stopAfterTpRate: number | null;
    expectancyR: number | null;
    expectancyConservativeR: number | null;
    medianR: number | null;
    profitFactor: number | null;
    medianTimeToTp1Min: number | null;
    sumR: number | null;
    // Net of the cost model (F4.1). Null below 20 closed like the gross figures; sumNetR null when no closed row has a cost.
    expectancyNetR: number | null;
    profitFactorNet: number | null;
    sumNetR: number | null;
    costModel: { venue: string; takerBps: number; makerBps: number; slipBps: number; fundingApplied: boolean };
    // Gross profit / gross loss in R over every closed row (no sample threshold); the legacy stats derive PF from them.
    grossProfitR: number;
    grossLossR: number;
    // Track-record metrics (F4.1, perf audit 2.2). Null when the sample cannot support them.
    maxDrawdownR: number | null;
    maxDrawdownNetR: number | null;
    longestUnderwaterDays: number | null;
    /** SD(R) / sqrt(n) over closed rows; null below 2. */
    seExpectancyR: number | null;
    /** Verified fills over (fills + unfilled) per entry type, in percent. */
    fillRate: { market: number | null; limit: number | null; nMarket: number; nLimit: number };
    /** Filled closes that hit the horizon with no verdict, as a percent of closed. */
    expiryRate: number | null;
    /** Fill-to-close minutes: winners = TP1 or better, losers = stopped before TP1. */
    medianHoldMin: { winners: number | null; losers: number | null };
    holdMin: { all: HoldStats; winners: HoldStats; losers: HoldStats };
    /** Share of closed rows with gross R >= 2, in percent. */
    shareAbove2R: number | null;
  };
  equity: { i: number; t: number; cumR: number; cumNetR: number | null; symbol: string }[];
  daily: { day: string; r: number; cumR: number; netR: number | null; cumNetR: number | null; n: number }[];
  /** Gross (n) and net (netN) R counts per 0.5R bin from -3 to +5; the end bins absorb the overflow. */
  rHistogram: { bin: string; n: number; netN: number }[];
  calibration: CalibrationStats;
  breakdowns: {
    bySymbol: Bucket[];
    byClass: Bucket[];
    byBias: Bucket[];
    byTradeType: Bucket[];
    byHourUtc: Bucket[];
    byWeekday: Bucket[];
    byOilRegime: Bucket[];
    byRegime: Bucket[];
    byRegimeAlignment: Bucket[];
    byEngineVersion: Bucket[];
    byEntryType: Bucket[];
    byRr1: Bucket[];
    byAtrPct: Bucket[];
  };
  /** Engine versions seen in the closed sample, newest last-signal first. */
  versions: { version: string; firstAt: number; lastAt: number; n: number; netR: number | null }[];
  /** Ledger download card (PR 13); null until the daily hash has run. */
  ledger: { url: string; csvUrl: string; sha256: string; hashedAt: string; bytes: number; count: number } | null;
  changelog: { at: string; commit: string; title: string; effect: string }[];
  excursion: { medianMfeR: number | null; medianMaeR: number | null; winnersOvershootR: number | null; losersNearMissR: number | null; n: number };
  streaks: { current: { type: "win" | "loss" | null; length: number }; maxWin: number; maxLoss: number };
  meta: {
    duplicatesMerged: number;
    totalRaw: number;
    sampleNote: string;
    generatedAt: string;
    assumptions: string;
    // Closed signals whose entry was verified as filled (the only ones that count).
    filledN: number;
    unfilledN: number;
    unverifiableN: number;
    pendingFillN: number;
    // Filled signals that hit the horizon with neither TP1 nor the stop touched: real P&L (counted in R), no verdict (not in rates).
    expiredN: number;
    // True until 100 filled closed signals exist; every rate above is a preview until then.
    provisional: boolean;
    provisionalTarget: number;
    /** Current engine version and how many decided, non-shadow records it has (the calibration gate counter). */
    engineVersion: string | null;
    decidedNCurrentVersion: number;
    /** Shadow records seen in the range (never in any number above). */
    shadowN: number;
  };
}

export interface HoldStats {
  n: number;
  p25: number | null;
  median: number | null;
  p75: number | null;
}

export const PROVISIONAL_TARGET = 100;

const INDEX = new Set(["SP500", "NAS100"]);
const COMMODITY = new Set(["OIL", "GOLD", "SILVER"]);
const STOCK = new Set(["TSLA", "NVDA", "GOOGL", "COIN", "MU", "SKHYNIX", "AAOI", "SNDK", "UNITREE", "ZHIPU", "CXMT"]);
export function assetClassOf(symbol: string): string {
  if (INDEX.has(symbol)) return "Indices";
  if (COMMODITY.has(symbol)) return "Commodities";
  if (STOCK.has(symbol)) return "Stocks";
  return "Crypto";
}

const isOpenSig = (s: SignalLog) => (s.status ? s.status === "open" : s.outcome === "pending");

function legacyRealizedR(s: SignalLog): number | null {
  const risk = Math.abs(s.entry - s.stopLoss);
  if (risk <= 0) return null;
  const exit = s.outcome === "tp1" ? s.tp1 : s.outcome === "tp2" ? s.tp2 : s.outcome === "tp3" ? s.tp3 : s.outcome === "stopped" ? s.stopLoss : s.outcomePrice;
  if (exit == null) return null;
  const move = s.bias === "LONG" ? exit - s.entry : s.entry - exit;
  return Math.round((move / risk) * 10000) / 10000;
}

// Conservative execution model: half the position exits at TP1 and the stop moves to breakeven.
// If the signal never reached TP1 it is the full realized R (a stop or a horizon exit). After TP1 the
// remaining half earns 0 when stopped (breakeven) and the highest TP reached otherwise.
export function conservativeR(s: { bias: "LONG" | "SHORT"; entry: number; stopLoss: number; tp1: number; tp2: number; tp3: number; highestTp: 0 | 1 | 2 | 3; stoppedAfterTp: 0 | 1 | 2 | 3 | null; realizedR: number | null }): number | null {
  const risk = Math.abs(s.entry - s.stopLoss);
  if (risk <= 0) return null;
  if (s.highestTp === 0) return s.realizedR;
  const dir = s.bias === "LONG" ? 1 : -1;
  const rOf = (p: number) => ((p - s.entry) * dir) / risk;
  const first = 0.5 * rOf(s.tp1);
  const highest = s.highestTp === 3 ? s.tp3 : s.highestTp === 2 ? s.tp2 : s.tp1;
  const rest = (s.stoppedAfterTp ?? 0) >= 1 ? 0 : 0.5 * rOf(highest);
  return Math.round((first + rest) * 10000) / 10000;
}

export function normalize(s: SignalLog): NormalizedSignal {
  const open = isOpenSig(s);
  const risk = Math.abs(s.entry - s.stopLoss);
  const inputs = s.context?.inputs ?? null;
  const excluded = s.closedReason === "unfilled" || s.closedReason === "unverifiable";
  const fillStatus: NormalizedSignal["fillStatus"] = s.fillStatus ?? (s.closedReason === "unfilled" ? "unfilled" : "filled");
  let tpLevels: NormalizedSignal["tpLevels"] = [];
  let highest: 0 | 1 | 2 | 3 = 0;
  if (s.tpHits && s.tpHits.length) {
    tpLevels = s.tpHits.map((h) => ({ level: h.level, at: h.at, price: h.price }));
    highest = s.tpHits[s.tpHits.length - 1].level;
  } else if (s.outcome === "tp1" || s.outcome === "tp2" || s.outcome === "tp3") {
    // Legacy first-touch record: we know the level reached but not the intermediate times.
    highest = s.outcome === "tp3" ? 3 : s.outcome === "tp2" ? 2 : 1;
    tpLevels = ([1, 2, 3] as const).filter((l) => l <= highest).map((l) => ({ level: l, at: l === highest ? s.outcomeTimestamp : null, price: l === 1 ? s.tp1 : l === 2 ? s.tp2 : s.tp3 }));
  }
  const stoppedAfterTp = s.stoppedAfterTp ?? (s.outcome === "stopped" ? 0 : null);
  const closedReason = s.closedReason ?? (open ? null : s.outcome === "stopped" ? "stop_before_tp" : s.outcome === "expired" ? "horizon" : s.outcome === "tp3" ? "tp3" : "legacy_first_touch");
  const realized = open || excluded ? null : (s.realizedR ?? legacyRealizedR(s));
  const entryType: NormalizedSignal["entryType"] = s.context?.inputs?.entryType ?? (s.priceAtSignal > 0 ? (Math.abs(s.entry - s.priceAtSignal) / s.priceAtSignal <= 0.001 ? "market" : "limit") : null);
  let costR: number | null = s.costR ?? null;
  let costEstimated = false;
  if (costR == null && realized != null && entryType) {
    const closedAt = s.outcomeTimestamp ?? null;
    const filledAt = s.filledAt ?? s.timestamp;
    const est = costInR({ bias: s.bias, fillPrice: s.fillPrice ?? s.entry, stopLoss: s.stopLoss, entryType, holdHours: closedAt != null ? Math.max(0, (closedAt - filledAt) / 3600e3) : 0, fundingRate8h: null });
    if (est) {
      costR = est.costR;
      costEstimated = true;
    }
  }
  const realizedNet = realized == null ? null : s.realizedNetR ?? (costR != null ? Math.round((realized - costR) * 10000) / 10000 : null);
  const label = open
    ? highest > 0
      ? `TP${highest} hit · open`
      : fillStatus === "pending"
        ? "Pending fill"
        : "Pending"
    : s.closedReason === "unfilled"
      ? "Unfilled"
      : s.closedReason === "unverifiable"
        ? "Unverifiable"
    : stoppedAfterTp === 0
      ? "Stopped out"
      : highest > 0
        ? `TP${highest} hit${stoppedAfterTp ? " · then stopped" : closedReason === "horizon" ? " · expired" : ""}`
        : "Expired";
  return {
    id: s.id,
    symbol: s.symbol,
    assetClass: assetClassOf(s.symbol),
    bias: s.bias,
    timestamp: s.timestamp,
    entry: s.entry,
    stopLoss: s.stopLoss,
    tp1: s.tp1,
    tp2: s.tp2,
    tp3: s.tp3,
    confidence: s.confidence,
    grade: s.grade,
    tradeType: s.context?.tradeType ?? null,
    oilRegime: s.symbol === "OIL" ? (s.context?.oilRegime ?? null) : null,
    factors: s.context?.factors ?? {},
    open,
    tpLevels,
    highestTp: highest,
    stoppedAfterTp,
    closedReason,
    closedAt: open ? null : (s.outcomeTimestamp ?? null),
    realizedR: realized,
    mfeR: s.mfeR ?? (risk > 0 && s.maxFavorable != null ? Math.round((s.maxFavorable / risk) * 100) / 100 : null),
    maeR: s.maeR ?? (risk > 0 && s.maxAdverse != null ? Math.round((s.maxAdverse / risk) * 100) / 100 : null),
    timeToTp1Min: s.timeToTp1Min ?? null,
    outcomeLabel: label,
    duplicatesMerged: 0,
    fillStatus,
    filledAt: s.filledAt ?? null,
    excluded,
    conservativeR: open || excluded ? null : conservativeR({ bias: s.bias, entry: s.entry, stopLoss: s.stopLoss, tp1: s.tp1, tp2: s.tp2, tp3: s.tp3, highestTp: highest, stoppedAfterTp, realizedR: realized }),
    engineVersion: s.engineVersion ?? "unversioned",
    entryType,
    fillPrice: s.fillPrice ?? null,
    costR,
    costEstimated,
    realizedNetR: realizedNet,
    shadow: s.shadow === true,
    shadowClass: s.shadow === true ? (s.shadowClass ?? null) : null,
    coverageGap: s.coverageGap != null,
    weightedScore: inputs?.weightedScore ?? null,
    confidenceRaw: inputs?.confidenceRaw ?? null,
    rr1: inputs?.rr1 ?? (risk > 0 ? Math.round((Math.abs(s.tp1 - s.entry) / risk) * 100) / 100 : null),
    atrPct: inputs?.atrPct ?? (s.context?.atr != null && s.priceAtSignal > 0 && s.context.atr > 0 ? Math.round((s.context.atr / s.priceAtSignal) * 10000) / 100 : null),
    pTp1: inputs?.pTp1 ?? null,
    calibrationVersion: inputs?.calibrationVersion ?? null,
    components: inputs?.components ?? null,
    minutesToNextEvent: inputs?.minutesToNextEvent ?? null,
  };
}

// Same symbol, bias and entry (4 significant figures) logged again within 30 minutes of the kept record.
function dedupeKey(s: NormalizedSignal): string {
  const sig = s.entry === 0 ? "0" : s.entry.toPrecision(4);
  return `${s.symbol}|${s.bias}|${sig}`;
}
const DEDUPE_WINDOW_MS = 30 * 60e3;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);

// Cloud/200MA regime factor (src/lib/signals/factors.ts FACTOR.REGIME); string literal so this module stays
// free of engine imports.
const REGIME_FACTOR = "Cloud/200MA Regime";

// Was the call with or against the cloud/200MA regime logged at the time?
function regimeAlignment(s: NormalizedSignal): string {
  const a = s.factors[REGIME_FACTOR];
  if (!a) return "n/a";
  const bull = a.includes("Bullish");
  const bear = a.includes("Bearish");
  if (!bull && !bear) return "neutral";
  return (s.bias === "LONG" && bull) || (s.bias === "SHORT" && bear) ? "aligned" : "counter";
}

function bucketize(rows: NormalizedSignal[], keyOf: (s: NormalizedSignal) => string | null, order?: string[]): Bucket[] {
  const map = new Map<string, NormalizedSignal[]>();
  for (const s of rows) {
    const k = keyOf(s);
    if (k == null) continue;
    const arr = map.get(k) ?? [];
    arr.push(s);
    map.set(k, arr);
  }
  const out: Bucket[] = [...map.entries()].map(([key, list]) => {
    const wins = list.filter((s) => s.highestTp >= 1).length;
    const losses = list.filter((s) => s.stoppedAfterTp === 0).length;
    // Win rate is over decided signals only; an expired signal that touched neither TP1 nor the stop is not a loss.
    return { key, n: list.length, tp1Rate: wins + losses > 0 ? pct(wins, wins + losses) : null, expectancyR: r2(mean(list.map((s) => s.realizedR).filter((x): x is number => x != null))), wins, losses };
  });
  if (order) out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  else out.sort((a, b) => b.n - a.n);
  return out;
}

const quantile = (sorted: number[], q: number): number | null => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
function holdStats(mins: number[]): HoldStats {
  const a = [...mins].sort((x, y) => x - y);
  const r = (v: number | null) => (v == null ? null : Math.round(v));
  return { n: a.length, p25: r(quantile(a, 0.25)), median: r(quantile(a, 0.5)), p75: r(quantile(a, 0.75)) };
}

// Max drawdown in R on a cumulative series and the longest stretch below a previous peak, in days.
function drawdown(points: { t: number; cum: number }[]): { maxDd: number | null; longestDays: number | null } {
  if (!points.length) return { maxDd: null, longestDays: null };
  let peak = 0;
  let peakT = points[0].t;
  let maxDd = 0;
  let longest = 0;
  for (const p of points) {
    if (p.cum >= peak) {
      longest = Math.max(longest, p.t - peakT);
      peak = p.cum;
      peakT = p.t;
    } else {
      maxDd = Math.max(maxDd, peak - p.cum);
    }
  }
  const last = points[points.length - 1];
  if (last.cum < peak) longest = Math.max(longest, last.t - peakT);
  return { maxDd: -Math.round(maxDd * 100) / 100, longestDays: Math.round((longest / 86400e3) * 10) / 10 };
}

const HIST_MIN = -3;
const HIST_MAX = 5;
const HIST_STEP = 0.5;
export function rHistogram(gross: number[], net: number[]): PerformanceStats["rHistogram"] {
  const bins: { bin: string; lo: number; n: number; netN: number }[] = [];
  for (let lo = HIST_MIN; lo < HIST_MAX; lo += HIST_STEP) bins.push({ bin: lo.toFixed(1), lo, n: 0, netN: 0 });
  bins.unshift({ bin: `<${HIST_MIN}`, lo: -Infinity, n: 0, netN: 0 });
  bins.push({ bin: `${HIST_MAX}+`, lo: HIST_MAX, n: 0, netN: 0 });
  const idx = (r: number) => {
    if (r < HIST_MIN) return 0;
    if (r >= HIST_MAX) return bins.length - 1;
    return 1 + Math.floor((r - HIST_MIN) / HIST_STEP);
  };
  for (const r of gross) bins[idx(r)].n++;
  for (const r of net) bins[idx(r)].netN++;
  return bins.map(({ bin, n, netN }) => ({ bin, n, netN }));
}

export const rr1BucketOf = (rr: number | null): string | null => (rr == null ? null : rr < 1 ? "<1" : rr < 1.5 ? "1-1.5" : rr < 2 ? "1.5-2" : ">2");
export const RR1_ORDER = ["<1", "1-1.5", "1.5-2", ">2"];
const atrBucketOf = (a: number | null): string | null => (a == null ? null : a < 0.5 ? "<0.5%" : a < 1 ? "0.5-1%" : a < 2 ? "1-2%" : ">2%");
const ATR_ORDER = ["<0.5%", "0.5-1%", "1-2%", ">2%"];
const pTp1BucketOf = (p: number | null): string | null => {
  if (p == null) return null;
  const lo = Math.min(90, Math.floor(p * 10) * 10);
  return `${lo}-${lo + 10}%`;
};
const CONF_ORDER = ["<55", "55-59", "60-64", "65-69", "70-74", "75-79", "80-84", "85-89", "90-94", "95-99", "100"];

/**
 * Calibration table (perf audit 2.3): one row per stated-confidence band, grade, rr1 bucket and (once a
 * calibrated probability exists) pTp1 band. n counts DECIDED rows; expectancy and pPos use every closed row in
 * the band. Brier uses p = confidence / 100 (naive) and, when a Platt mapping is supplied, sigmoid(a s + b).
 */
export function calibration(rows: CalRow[], mapping: { a: number; b: number } | null, platt: CalibrationStats["platt"] = null): CalibrationStats {
  const pCal = (r: CalRow): number | null => (mapping && r.signedScore != null ? sigmoid(mapping.a * r.signedScore + mapping.b) : null);
  const bucketOf = (key: string, list: CalRow[]): CalBucket => {
    const decided = list.filter((r) => r.decided);
    const wins = decided.filter((r) => r.tp1).length;
    const losses = decided.length - wins;
    const [lo, hi] = wilson(wins, decided.length);
    const gross = list.map((r) => r.grossR).filter((x): x is number => x != null);
    const nets = list.map((r) => r.netR).filter((x): x is number => x != null);
    const cal = decided.map((r) => ({ p: pCal(r), y: r.tp1 ? 1 : 0 })).filter((q): q is { p: number; y: number } => q.p != null);
    return {
      key,
      n: decided.length,
      tp1Rate: decided.length ? pct(wins, decided.length) : null,
      expectancyR: r2(mean(gross)),
      wins,
      losses,
      meanConf: list.length ? Math.round((list.reduce((a, r) => a + r.confidence, 0) / list.length) * 10) / 10 : null,
      wilsonLo: lo,
      wilsonHi: hi,
      pPos: gross.length ? pct(gross.filter((x) => x > 0).length, gross.length) : null,
      meanNetR: r2(mean(nets)),
      brierNaive: decided.length ? Math.round((decided.reduce((a, r) => a + (r.confidence / 100 - (r.tp1 ? 1 : 0)) ** 2, 0) / decided.length) * 1e4) / 1e4 : null,
      brierCal: cal.length ? Math.round((cal.reduce((a, q) => a + (q.p - q.y) ** 2, 0) / cal.length) * 1e4) / 1e4 : null,
    };
  };
  const group = (keyOf: (r: CalRow) => string | null, order?: string[]): CalBucket[] => {
    const map = new Map<string, CalRow[]>();
    for (const r of rows) {
      const k = keyOf(r);
      if (k == null) continue;
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    const out = [...map.entries()].map(([k, list]) => bucketOf(k, list));
    if (order) out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    else out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  };
  const decided = rows.filter((r) => r.decided);
  const naive = brierSet(decided.map((r) => ({ p: Math.min(1, Math.max(0, r.confidence / 100)), y: (r.tp1 ? 1 : 0) as 0 | 1, bin: bandOf(r.confidence) })));
  const calPairs = decided.map((r) => ({ p: pCal(r), y: (r.tp1 ? 1 : 0) as 0 | 1, bin: bandOf(r.confidence) })).filter((q): q is { p: number; y: 0 | 1; bin: string } => q.p != null);
  const cal = calPairs.length ? brierSet(calPairs) : null;
  return {
    byConfidence: group((r) => bandOf(r.confidence), CONF_ORDER),
    byGrade: group((r) => r.grade, ["A+", "A", "B", "C"]),
    byRr1: group((r) => rr1BucketOf(r.rr1), RR1_ORDER),
    byPTp1: group((r) => pTp1BucketOf(r.pTp1)),
    brier: {
      naive: naive.brier,
      calibrated: cal?.brier ?? null,
      base: naive.base,
      bss: naive.bss,
      bssCalibrated: cal?.bss ?? null,
      reliability: naive.reliability,
      resolution: naive.resolution,
      uncertainty: naive.uncertainty,
      n: naive.n,
    },
    platt,
  };
}

export function toCalRow(s: NormalizedSignal): CalRow {
  const decided = !s.open && !s.excluded && (s.highestTp >= 1 || s.stoppedAfterTp === 0);
  return {
    confidence: s.confidence,
    grade: s.grade,
    rr1: s.rr1,
    pTp1: s.pTp1,
    decided,
    tp1: s.highestTp >= 1,
    grossR: s.realizedR,
    netR: s.realizedNetR,
    signedScore: s.weightedScore == null ? null : s.bias === "LONG" ? s.weightedScore : -s.weightedScore,
  };
}

export function computePerformance(all: SignalLog[], opts: PerformanceOptions = {}): { signals: NormalizedSignal[]; open: NormalizedSignal[]; stats: PerformanceStats } {
  const now = Date.now();
  let rows = all.map(normalize);
  const totalRaw = rows.length;
  // Shadow records (declined calls, PR 12) never enter a public number; they get their own block below.
  const shadowRows = rows.filter((s) => s.shadow);
  rows = rows.filter((s) => !s.shadow);
  if (opts.rangeDays) rows = rows.filter((s) => now - s.timestamp <= opts.rangeDays! * 86400e3);
  if (opts.assets && opts.assets.length) rows = rows.filter((s) => opts.assets!.includes(s.symbol));
  if (opts.grades && opts.grades.length) rows = rows.filter((s) => opts.grades!.includes(s.grade));
  if (opts.bias) rows = rows.filter((s) => s.bias === opts.bias);

  let duplicatesMerged = 0;
  if (opts.dedupe !== false) {
    const lastKept = new Map<string, NormalizedSignal>();
    const kept: NormalizedSignal[] = [];
    for (const s of [...rows].sort((a, b) => a.timestamp - b.timestamp)) {
      const k = dedupeKey(s);
      const prev = lastKept.get(k);
      if (prev && s.timestamp - prev.timestamp <= DEDUPE_WINDOW_MS) {
        prev.duplicatesMerged++;
        duplicatesMerged++;
        continue;
      }
      lastKept.set(k, s);
      kept.push(s);
    }
    rows = kept;
  }
  rows.sort((a, b) => b.timestamp - a.timestamp);

  // Only verified fills count. Unfilled and unverifiable records stay in the log for transparency.
  const closed = rows.filter((s) => !s.open && !s.excluded);
  const open = rows.filter((s) => s.open);
  const unfilledN = rows.filter((s) => s.closedReason === "unfilled").length;
  const unverifiableN = rows.filter((s) => s.closedReason === "unverifiable").length;
  const pendingFillN = open.filter((s) => s.fillStatus === "pending").length;
  const closedN = closed.length;
  const crs = closed.map((s) => s.conservativeR).filter((x): x is number => x != null);
  const tp1 = closed.filter((s) => s.highestTp >= 1);
  const tp2 = closed.filter((s) => s.highestTp >= 2);
  const tp3 = closed.filter((s) => s.highestTp >= 3);
  const stopBefore = closed.filter((s) => s.stoppedAfterTp === 0);
  // Expired = filled, horizon reached, neither TP1 nor stop touched. Real money (in R), but no verdict:
  // excluded from every hit/stop rate so it cannot drag the win rate down or up.
  const expired = closed.filter((s) => s.highestTp === 0 && s.stoppedAfterTp !== 0);
  const expiredN = expired.length;
  const decidedN = closedN - expiredN;
  const stopAfter = closed.filter((s) => (s.stoppedAfterTp ?? 0) >= 1);
  const rs = closed.map((s) => s.realizedR).filter((x): x is number => x != null);
  const pos = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const neg = Math.abs(rs.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  const nets = closed.map((s) => s.realizedNetR).filter((x): x is number => x != null);
  const posNet = nets.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const negNet = Math.abs(nets.filter((r) => r < 0).reduce((a, b) => a + b, 0));

  const byClose = [...closed].filter((s) => s.realizedR != null).sort((a, b) => (a.closedAt ?? a.timestamp) - (b.closedAt ?? b.timestamp));
  let cum = 0;
  let cumNet = 0;
  let anyNet = false;
  const equity = byClose.map((s, i) => {
    cum += s.realizedR as number;
    if (s.realizedNetR != null) {
      cumNet += s.realizedNetR;
      anyNet = true;
    }
    return { i: i + 1, t: s.closedAt ?? s.timestamp, cumR: Math.round(cum * 100) / 100, cumNetR: anyNet ? Math.round(cumNet * 100) / 100 : null, symbol: s.symbol };
  });
  const dayMap = new Map<string, { r: number; net: number; anyNet: boolean; n: number }>();
  for (const s of byClose) {
    const day = new Date(s.closedAt ?? s.timestamp).toISOString().slice(0, 10);
    const d = dayMap.get(day) ?? { r: 0, net: 0, anyNet: false, n: 0 };
    d.r += s.realizedR as number;
    if (s.realizedNetR != null) {
      d.net += s.realizedNetR;
      d.anyNet = true;
    }
    d.n++;
    dayMap.set(day, d);
  }
  let dcum = 0;
  let dcumNet = 0;
  let dAnyNet = false;
  const daily = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, d]) => {
    dcum += d.r;
    dcumNet += d.net;
    dAnyNet = dAnyNet || d.anyNet;
    return { day, r: Math.round(d.r * 100) / 100, cumR: Math.round(dcum * 100) / 100, netR: d.anyNet ? Math.round(d.net * 100) / 100 : null, cumNetR: dAnyNet ? Math.round(dcumNet * 100) / 100 : null, n: d.n };
  });
  const venue = activeCostVenue();

  // Track-record metrics (perf audit 2.2).
  const ddGross = drawdown(equity.map((e) => ({ t: e.t, cum: e.cumR })));
  const ddNet = drawdown(equity.filter((e) => e.cumNetR != null).map((e) => ({ t: e.t, cum: e.cumNetR as number })));
  const sd = rs.length >= 2 ? Math.sqrt(rs.reduce((a, r) => a + (r - (mean(rs) as number)) ** 2, 0) / (rs.length - 1)) : null;
  const holdOf = (s: NormalizedSignal): number | null => (s.closedAt != null && s.filledAt != null ? Math.max(0, Math.round((s.closedAt - s.filledAt) / 60e3)) : null);
  const holdAll = closed.map(holdOf).filter((x): x is number => x != null);
  const holdWin = tp1.map(holdOf).filter((x): x is number => x != null);
  const holdLoss = stopBefore.map(holdOf).filter((x): x is number => x != null);
  // Fill rate per entry type: verified fills (closed or still running) over fills + unfilled; pending and
  // unverifiable rows are undecided and left out.
  const fillRows = rows.filter((s) => s.entryType && (s.fillStatus === "filled" || s.fillStatus === "unfilled") && s.closedReason !== "unverifiable");
  const fillRate = (type: "market" | "limit") => {
    const list = fillRows.filter((s) => s.entryType === type);
    return { rate: list.length ? pct(list.filter((s) => s.fillStatus === "filled").length, list.length) : null, n: list.length };
  };
  const fm = fillRate("market");
  const fl = fillRate("limit");
  const versionMap = new Map<string, { firstAt: number; lastAt: number; n: number; net: number; anyNet: boolean }>();
  for (const s of closed) {
    const v = versionMap.get(s.engineVersion) ?? { firstAt: s.timestamp, lastAt: s.timestamp, n: 0, net: 0, anyNet: false };
    v.firstAt = Math.min(v.firstAt, s.timestamp);
    v.lastAt = Math.max(v.lastAt, s.timestamp);
    v.n++;
    if (s.realizedNetR != null) {
      v.net += s.realizedNetR;
      v.anyNet = true;
    }
    versionMap.set(s.engineVersion, v);
  }
  const versions = [...versionMap.entries()].map(([version, v]) => ({ version, firstAt: v.firstAt, lastAt: v.lastAt, n: v.n, netR: v.anyNet ? Math.round(v.net * 100) / 100 : null })).sort((a, b) => b.lastAt - a.lastAt);
  const currentVersion = opts.engineVersion ?? null;
  const decidedNCurrentVersion = currentVersion ? all.filter((s) => !s.shadow && s.engineVersion === currentVersion).map(normalize).filter((s) => !s.open && !s.excluded && (s.highestTp >= 1 || s.stoppedAfterTp === 0)).length : 0;
  const calFile = opts.calibration ?? null;
  const mapping = calFile?.platt && calFile.active ? { a: calFile.platt.a, b: calFile.platt.b } : null;
  const plattMeta: CalibrationStats["platt"] = calFile?.platt ? { a: calFile.platt.a, b: calFile.platt.b, n: calFile.platt.n, holdoutBrier: calFile.platt.holdoutBrier, fitAt: calFile.fitAt, version: calFile.version } : null;

  // Streaks by close order (win = TP1 or better, loss = stop before TP; horizon-without-TP is neither).
  let cur: { type: "win" | "loss" | null; length: number } = { type: null, length: 0 };
  let maxWin = 0;
  let maxLoss = 0;
  let run: { type: "win" | "loss" | null; length: number } = { type: null, length: 0 };
  for (const s of byClose) {
    const t: "win" | "loss" | null = s.highestTp >= 1 ? "win" : s.stoppedAfterTp === 0 ? "loss" : null;
    if (!t) continue;
    if (run.type === t) run.length++;
    else run = { type: t, length: 1 };
    if (t === "win") maxWin = Math.max(maxWin, run.length);
    else maxLoss = Math.max(maxLoss, run.length);
    cur = { ...run };
  }

  const hourKey = (s: NormalizedSignal) => `${String(new Date(s.timestamp).getUTCHours()).padStart(2, "0")}:00`;
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const mfe = closed.map((s) => s.mfeR).filter((x): x is number => x != null);
  const mae = closed.map((s) => s.maeR).filter((x): x is number => x != null);
  const overshoot = tp1.map((s) => s.mfeR).filter((x): x is number => x != null).map((x) => x - 1);
  const nearMiss = stopBefore.map((s) => s.mfeR).filter((x): x is number => x != null);

  const sampleNote =
    closedN < 20
      ? `Early sample — ${closedN} closed signal${closedN === 1 ? "" : "s"}. Rates carry wide uncertainty; expectancy and profit factor are hidden until 20 closed.`
      : closedN < 50
        ? `${closedN} closed signals — directionally useful, still a small sample.`
        : `${closedN} closed signals.`;

  const stats: PerformanceStats = {
    kpis: {
      closedN,
      decidedN,
      expiredN,
      openN: open.length,
      tp1Rate: decidedN >= 1 ? pct(tp1.length, decidedN) : null,
      tp2Rate: decidedN >= 1 ? pct(tp2.length, decidedN) : null,
      tp3Rate: decidedN >= 1 ? pct(tp3.length, decidedN) : null,
      ladder: { tp2GivenTp1: pct(tp2.length, tp1.length), tp3GivenTp2: pct(tp3.length, tp2.length), n1: tp1.length, n2: tp2.length },
      stopBeforeTpRate: decidedN >= 1 ? pct(stopBefore.length, decidedN) : null,
      stopAfterTpRate: tp1.length >= 1 ? pct(stopAfter.length, tp1.length) : null,
      expectancyR: closedN >= 20 ? r2(mean(rs)) : null,
      expectancyConservativeR: closedN >= 20 ? r2(mean(crs)) : null,
      medianR: closedN >= 10 ? r2(median(rs)) : null,
      profitFactor: closedN >= 20 ? (neg > 0 ? Math.round((pos / neg) * 100) / 100 : pos > 0 ? null : 0) : null,
      medianTimeToTp1Min: tp1.length >= 5 ? median(tp1.map((s) => s.timeToTp1Min).filter((x): x is number => x != null)) : null,
      sumR: rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) * 100) / 100 : null,
      expectancyNetR: closedN >= 20 && nets.length ? r2(mean(nets)) : null,
      profitFactorNet: closedN >= 20 && nets.length ? (negNet > 0 ? Math.round((posNet / negNet) * 100) / 100 : posNet > 0 ? null : 0) : null,
      sumNetR: nets.length ? Math.round(nets.reduce((a, b) => a + b, 0) * 100) / 100 : null,
      costModel: { venue: venue.venue, takerBps: venue.takerBps, makerBps: venue.makerBps, slipBps: venue.slipBps, fundingApplied: venue.fundingApplied },
      grossProfitR: Math.round(pos * 10000) / 10000,
      grossLossR: Math.round(neg * 10000) / 10000,
      maxDrawdownR: ddGross.maxDd,
      maxDrawdownNetR: ddNet.maxDd,
      longestUnderwaterDays: ddGross.longestDays,
      seExpectancyR: sd != null ? Math.round((sd / Math.sqrt(rs.length)) * 1000) / 1000 : null,
      fillRate: { market: fm.rate, limit: fl.rate, nMarket: fm.n, nLimit: fl.n },
      expiryRate: closedN ? pct(expiredN, closedN) : null,
      medianHoldMin: { winners: holdWin.length ? Math.round(median(holdWin) as number) : null, losers: holdLoss.length ? Math.round(median(holdLoss) as number) : null },
      holdMin: { all: holdStats(holdAll), winners: holdStats(holdWin), losers: holdStats(holdLoss) },
      shareAbove2R: rs.length ? pct(rs.filter((r) => r >= 2).length, rs.length) : null,
    },
    equity,
    daily,
    rHistogram: rHistogram(rs, nets),
    calibration: calibration(closed.map(toCalRow), mapping, plattMeta),
    versions,
    ledger: opts.ledger ?? null,
    changelog: opts.changelog ?? [],
    breakdowns: {
      byEntryType: bucketize(closed, (s) => s.entryType, ["market", "limit"]),
      byRr1: bucketize(closed, (s) => rr1BucketOf(s.rr1), RR1_ORDER),
      byAtrPct: bucketize(closed, (s) => atrBucketOf(s.atrPct), ATR_ORDER),
      bySymbol: bucketize(closed, (s) => s.symbol),
      byClass: bucketize(closed, (s) => s.assetClass, ["Crypto", "Commodities", "Stocks", "Indices"]),
      byBias: bucketize(closed, (s) => s.bias, ["LONG", "SHORT"]),
      byTradeType: bucketize(closed, (s) => s.tradeType, ["SCALP", "SWING", "POSITION", "ULTIMATE", "CONFLICTED"]),
      byHourUtc: bucketize(closed, hourKey, Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`)),
      byWeekday: bucketize(closed, (s) => WD[new Date(s.timestamp).getUTCDay()], WD),
      byOilRegime: bucketize(closed, (s) => s.oilRegime, ["calm", "elevated", "extreme", "whipsaw"]),
      byRegime: bucketize(closed, (s) => s.factors[REGIME_FACTOR] ?? "n/a", ["Strong Bullish", "Bullish", "Neutral", "Bearish", "Strong Bearish", "n/a"]),
      byRegimeAlignment: bucketize(closed, regimeAlignment, ["aligned", "neutral", "counter", "n/a"]),
      byEngineVersion: bucketize(closed, (s) => s.engineVersion),
    },
    excursion: { medianMfeR: r2(median(mfe)), medianMaeR: r2(median(mae)), winnersOvershootR: r2(median(overshoot)), losersNearMissR: r2(median(nearMiss)), n: mfe.length },
    streaks: { current: cur, maxWin, maxLoss },
    meta: {
      duplicatesMerged,
      totalRaw,
      sampleNote,
      generatedAt: new Date(now).toISOString(),
      assumptions: `A signal counts only after a 5-minute candle opened after the call trades through its entry. Entries within 0.1% of the signal price are market orders filled at the NEXT candle open (risk and R measured from that fill); limit entries fill at the entry on an exact touch. Gross R assumes exits at the exact TP/SL touch; a stop after TP exits at the last TP reached; a horizon exit uses the last close before the horizon; same-candle SL+TP resolves as the stop. Net R subtracts the ${venue.venue} cost model (taker ${venue.takerBps}bp, maker ${venue.makerBps}bp, slippage ${venue.slipBps}bp per market leg, funding over the hold${venue.fundingApplied ? "" : " not"} applied); records closed before the cost model carry an estimated cost without funding. Unfilled, unverifiable, open and shadow signals never count toward anything. A filled signal that expires at the horizon without touching TP1 or the stop counts in expectancy and profit factor (its horizon exit is real P&L) but not in hit or stop rates, since it reached no verdict.`,
      filledN: closedN,
      unfilledN,
      unverifiableN,
      pendingFillN,
      expiredN,
      provisional: closedN < PROVISIONAL_TARGET,
      provisionalTarget: PROVISIONAL_TARGET,
      engineVersion: currentVersion,
      decidedNCurrentVersion,
      shadowN: shadowRows.length,
    },
  };

  const limit = opts.limit ?? 500;
  return { signals: rows.slice(0, limit), open, stats };
}

// ── Legacy stats object ──────────────────────────────────────────────────────
// `computeStats` used to live in logger.ts with its own rules (first-touch wins, raw-price R:R, horizon exits
// in the profit factor). It now derives everything from computePerformance so the two views can never publish
// two different profit factors from the same file (perf audit 2.1). Shape kept for the default history view.
export function computeStats(input: SignalLog[]): SignalStats {
  const perf = computePerformance(input, { rangeDays: null, dedupe: false, limit: Number.MAX_SAFE_INTEGER });
  const rows = perf.signals.filter((s) => !s.excluded);
  const closed = rows.filter((s) => !s.open);
  const isWin = (s: NormalizedSignal) => s.highestTp >= 1;
  const isLoss = (s: NormalizedSignal) => s.stoppedAfterTp === 0;
  const wins = closed.filter(isWin);
  const losses = closed.filter(isLoss);
  const pending = rows.filter((s) => s.open);
  const expired = closed.filter((s) => !isWin(s) && !isLoss(s));
  const decided = wins.length + losses.length;
  const k = perf.stats.kpis;
  const winRs = wins.map((s) => s.realizedR).filter((x): x is number => x != null);
  const bucketOf = (list: NormalizedSignal[]): CalibrationBucket => {
    const w = list.filter(isWin).length;
    const l = list.filter(isLoss).length;
    const rsL = list.map((s) => s.realizedR).filter((x): x is number => x != null);
    return {
      n: list.length,
      wins: w,
      losses: l,
      tp1Rate: list.length ? Math.round((w / list.length) * 1000) / 10 : 0,
      winRate: w + l ? Math.round((w / (w + l)) * 1000) / 10 : 0,
      avgR: rsL.length ? Math.round((rsL.reduce((a, b) => a + b, 0) / rsL.length) * 100) / 100 : null,
    };
  };
  const bySymbol: SignalStats["bySymbol"] = {};
  const byGradeSymbol: SignalStats["byGradeSymbol"] = {};
  for (const s of rows) {
    const b = (bySymbol[s.symbol] ??= { total: 0, wins: 0, losses: 0, winRate: 0 });
    b.total++;
    if (!s.open && isWin(s)) b.wins++;
    else if (!s.open && isLoss(s)) b.losses++;
  }
  for (const sym of Object.keys(bySymbol)) {
    const d = bySymbol[sym].wins + bySymbol[sym].losses;
    bySymbol[sym].winRate = d ? Math.round((bySymbol[sym].wins / d) * 1000) / 10 : 0;
  }
  for (const s of closed) {
    (byGradeSymbol[s.symbol] ??= {})[s.grade] = bucketOf(closed.filter((x) => x.symbol === s.symbol && x.grade === s.grade));
  }
  const oilByRegime: SignalStats["oilByRegime"] = {};
  for (const s of closed.filter((x) => x.symbol === "OIL")) {
    const key = s.oilRegime ?? "unknown";
    oilByRegime[key] = bucketOf(closed.filter((x) => x.symbol === "OIL" && (x.oilRegime ?? "unknown") === key));
  }
  const sideOf = (b: "LONG" | "SHORT") => ({ ...bucketOf(closed.filter((s) => s.bias === b)), total: rows.filter((s) => s.bias === b).length, pending: pending.filter((s) => s.bias === b).length });
  return {
    total: rows.length,
    wins: wins.length,
    losses: losses.length,
    pending: pending.length,
    expired: expired.length,
    winRate: decided ? Math.round((wins.length / decided) * 1000) / 10 : 0,
    avgConfidence: rows.length ? Math.round((rows.reduce((a, s) => a + s.confidence, 0) / rows.length) * 10) / 10 : 0,
    // Mean realized R of winners (was reward-over-risk from the outcome price; same number for TP exits).
    avgRR: winRs.length ? Math.round((winRs.reduce((a, b) => a + b, 0) / winRs.length) * 100) / 100 : 0,
    profitFactor: k.grossLossR > 0 ? Math.round((k.grossProfitR / k.grossLossR) * 100) / 100 : k.grossProfitR > 0 ? 999 : 0,
    bySymbol,
    byGradeSymbol,
    oilByRegime,
    byBias: { LONG: sideOf("LONG"), SHORT: sideOf("SHORT") },
  };
}
