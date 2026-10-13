// Asset mix, 30d behaviour stats and the copyability score. Pure functions only.
//
// The score implements research/copytrade-scoring.md (analyst-copyscore, 2026-10-13) exactly: five sub-scores on
// fixed piecewise-linear anchors, a hard focus multiplier, multiplicative penalties, thin-data substitutions and
// grade gates. "Copyable" always means BTC/ADA/GOLD/WTI, the four groups Ascend can mirror.

import { ASSETS, COIN_TO_GROUP, DAY_MS, type AssetGroup, type AssetStats, type CompactFill, type CopyStats, type HlPortfolio, type Mix, type MixSlice, type OpenPosition, type Score, type Stats30d } from "./types";
import { isPerpCoin, openSide } from "./stats";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const num = (s: unknown): number => {
  const n = typeof s === "number" ? s : Number(s);
  return Number.isFinite(n) ? n : 0;
};

/** Piecewise-linear interpolation through `anchors` (x ascending), clamped to the end values. */
export function lin(x: number, anchors: [number, number][]): number {
  if (!Number.isFinite(x)) return anchors[0][1];
  if (x <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

// ── Mix ──────────────────────────────────────────────────────────────────────

export function computeMix(perCoin: Record<string, AssetStats>): Mix {
  const slice = (): MixSlice => ({ volumeUsd: 0, trades: 0, sharePct: 0 });
  const byAsset = { BTC: slice(), ADA: slice(), GOLD: slice(), WTI: slice(), OTHER: slice() } as Record<AssetGroup | "OTHER", MixSlice>;
  let totalVol = 0;
  let totalTrades = 0;
  const coins: { coin: string; vol: number }[] = [];
  for (const [coin, s] of Object.entries(perCoin)) {
    if (!isPerpCoin(coin)) continue;
    const g: AssetGroup | "OTHER" = COIN_TO_GROUP[coin] ?? "OTHER";
    byAsset[g].volumeUsd += s.volumeUsd;
    byAsset[g].trades += s.trades;
    totalVol += s.volumeUsd;
    totalTrades += s.trades;
    coins.push({ coin, vol: s.volumeUsd });
  }
  let copyVol = 0;
  let copyTrades = 0;
  for (const k of Object.keys(byAsset) as (AssetGroup | "OTHER")[]) {
    byAsset[k].volumeUsd = r2(byAsset[k].volumeUsd);
    byAsset[k].sharePct = totalVol > 0 ? r1((byAsset[k].volumeUsd / totalVol) * 100) : 0;
    if (k !== "OTHER") {
      copyVol += byAsset[k].volumeUsd;
      copyTrades += byAsset[k].trades;
    }
  }
  return {
    copyableSharePct: totalVol > 0 ? r1((copyVol / totalVol) * 100) : 0,
    copyableTradeSharePct: totalTrades > 0 ? r1((copyTrades / totalTrades) * 100) : 0,
    byAsset,
    topCoins: coins
      .sort((a, b) => b.vol - a.vol)
      .slice(0, 5)
      .map((c) => ({ coin: c.coin, sharePct: totalVol > 0 ? r1((c.vol / totalVol) * 100) : 0 })),
  };
}

// ── Hold time / leverage ─────────────────────────────────────────────────────

/**
 * Average minutes a position stayed open, from round trips reconstructed per coin: a fill that starts from flat
 * (or flips) opens, the fill that brings the position back to zero closes. Null without a completed round trip.
 */
export function averageHoldMinutes(fills: CompactFill[]): number | null {
  const byCoin = new Map<string, CompactFill[]>();
  for (const f of fills) {
    if (!isPerpCoin(f[1])) continue;
    const list = byCoin.get(f[1]) ?? [];
    list.push(f);
    byCoin.set(f[1], list);
  }
  let total = 0;
  let n = 0;
  for (const list of byCoin.values()) {
    list.sort((a, b) => a[0] - b[0] || a[10] - b[10]);
    let openedAt: number | null = null;
    for (const f of list) {
      const [time, , side, , sz, , , dir, start] = f;
      const end = start + (side === "B" ? sz : -sz);
      const flat = Math.abs(end) < 1e-9 || Math.abs(end) < Math.abs(start) * 1e-6;
      if (openedAt != null && flat) {
        total += time - openedAt;
        n++;
        openedAt = null;
      } else if (openedAt == null && (Math.abs(start) < 1e-9 || dir.includes(">")) && openSide(dir)) {
        openedAt = time;
      } else if (dir.includes(">")) {
        if (openedAt != null) {
          total += time - openedAt;
          n++;
        }
        openedAt = time;
      }
    }
  }
  return n ? r1(total / n / 60_000) : null;
}

export function medianLeverage(positions: OpenPosition[]): number | null {
  const levs = positions.map((p) => p.leverage).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!levs.length) return null;
  const mid = Math.floor(levs.length / 2);
  return levs.length % 2 ? levs[mid] : r1((levs[mid - 1] + levs[mid]) / 2);
}

// ── Portfolio-derived ────────────────────────────────────────────────────────

/** pnlHistory.month resampled to one point per UTC day (the last point of each day): [dayStartMs, cumPnl]. */
export function dailySeries(p: HlPortfolio | null): [number, number][] {
  if (!Array.isArray(p)) return [];
  const month = p.find((e) => Array.isArray(e) && e[0] === "month")?.[1];
  if (!month || !Array.isArray(month.pnlHistory)) return [];
  const byDay = new Map<number, number>();
  for (const [t, v] of month.pnlHistory) {
    const d = Math.floor(num(t) / DAY_MS);
    byDay.set(d, num(v)); // history is ascending, so the last write per day wins
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, v]) => [d * DAY_MS, r2(v)]);
}

export const equityStartOf = (equity: number, monthPnl: number) => Math.max(equity - monthPnl, 1000);

/** Max drawdown (%) of the equity curve equityStart + d_i; null under 7 daily points. */
export function maxDrawdownPct(daily: [number, number][], equityStart: number): number | null {
  if (daily.length < 7) return null;
  let peak = Number.NEGATIVE_INFINITY;
  let worst = 0;
  for (const [, d] of daily) {
    const e = equityStart + d;
    if (e > peak) peak = e;
    if (peak > 0) worst = Math.max(worst, (peak - e) / peak);
  }
  return r1(worst * 100);
}

/** Number of profitable weeks among the last 4 full 7-day blocks of the daily series; null under 14 points. */
export function profitableWeeks(daily: [number, number][]): { profitable: number; weeks: number } | null {
  if (daily.length < 14) return null;
  const last = daily[daily.length - 1][0];
  let profitable = 0;
  let weeks = 0;
  for (let w = 0; w < 4; w++) {
    const end = last - w * 7 * DAY_MS;
    const start = end - 7 * DAY_MS;
    const inWeek = daily.filter(([t]) => t > start && t <= end);
    const before = daily.filter(([t]) => t <= start);
    if (!inWeek.length) continue;
    const open = before.length ? before[before.length - 1][1] : inWeek[0][1];
    const close = inWeek[inWeek.length - 1][1];
    weeks++;
    if (close - open > 0) profitable++;
  }
  return { profitable, weeks };
}

/** Daily Sortino-style ratio mean(r)/downsideDev(r) on r_i = dPnl_i / equityStart; 0.30 when no negative day. */
export function sortinoDaily(daily: [number, number][], equityStart: number): number | null {
  if (daily.length < 14 || equityStart <= 0) return null;
  const r: number[] = [];
  for (let i = 1; i < daily.length; i++) r.push((daily[i][1] - daily[i - 1][1]) / equityStart);
  if (!r.length) return null;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const neg = r.filter((x) => x < 0);
  if (!neg.length) return 0.3;
  const dd = Math.sqrt(neg.reduce((s, x) => s + x * x, 0) / r.length);
  if (!(dd > 0)) return 0.3;
  return mean / dd;
}

// ── Stats30d ─────────────────────────────────────────────────────────────────

export function computeStats30d(perCoin: Record<string, AssetStats>, fills: CompactFill[], positions: OpenPosition[], daily: [number, number][], equityStart: number, windowDays = 30): Stats30d {
  let trades = 0;
  let pnlAll = 0;
  let pnlCopy = 0;
  for (const [coin, s] of Object.entries(perCoin)) {
    if (!isPerpCoin(coin)) continue;
    trades += s.trades;
    pnlAll += s.realizedPnl;
    if (COIN_TO_GROUP[coin]) pnlCopy += s.realizedPnl;
  }
  const pw = profitableWeeks(daily);
  return {
    tradesPerDay: r2(trades / windowDays),
    avgHoldMin: averageHoldMinutes(fills),
    medianLeverage: medianLeverage(positions),
    maxDrawdownPct: maxDrawdownPct(daily, equityStart),
    profitableWeeksPct: pw && pw.weeks > 0 ? r1((pw.profitable / pw.weeks) * 100) : null,
    pnlCopyable: r2(pnlCopy),
    pnlOther: r2(pnlAll - pnlCopy),
  };
}

// ── Score ────────────────────────────────────────────────────────────────────

export const COPYABLE_FOCUS_DEFAULT = 70;
export const MIN_COPYABLE_FILLS_FOR_POPULATION = 20;

export interface ScoreInput {
  mix: Mix;
  stats30d: Stats30d;
  copy: CopyStats;
  positions: OpenPosition[];
  equity: number;
  monthPnl: number;
  daily: [number, number][];
  /** Percentile (0..100) of copy.pnlNet within the population P; null when the wallet is outside P. */
  pnlPctl: number | null;
  now?: number;
}

/** Percentile ranks (0..100) within a set; ties share the mean rank. */
export function pnlRanks(values: number[]): number[] {
  const n = values.length;
  if (n <= 1) return values.map(() => 50);
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  let k = 0;
  while (k < n) {
    let j = k;
    while (j + 1 < n && order[j + 1].v === order[k].v) j++;
    const mean = (k + j) / 2;
    for (let m = k; m <= j; m++) ranks[order[m].i] = (mean / (n - 1)) * 100;
    k = j + 1;
  }
  return ranks;
}

const NOT_SCORED: Score = { copyability: 0, success: null, activity: null, focus: null, consistency: null, risk: null, grade: "D", thin: true, reasons: ["No copyable activity"] };

export function scoreTrader(inp: ScoreInput): Score {
  const now = inp.now ?? Date.now();
  const { mix, stats30d: st, copy, positions, equity, daily } = inp;
  if (copy.fills < 5) return { ...NOT_SCORED, reasons: [...NOT_SCORED.reasons] };

  const equityStart = equityStartOf(equity, inp.monthPnl);
  const winRate = copy.trades > 0 ? (copy.wins / copy.trades) * 100 : null;
  const pf = copy.grossLosses > 0 ? copy.grossWins / copy.grossLosses : copy.trades >= 20 ? 2.5 : null;

  // 1.1 Success
  let success: number | null = null;
  if (copy.trades >= 20) {
    const sPnl = inp.pnlPctl ?? 50;
    const sRoi = lin((100 * copy.pnlNet) / equityStart, [[-20, 0], [0, 50], [40, 100]]);
    const sPf = lin(pf ?? 2.5, [[0.8, 0], [1.0, 30], [1.5, 70], [2.5, 100]]);
    const sWr = lin(winRate ?? 0, [[35, 0], [60, 100], [90, 70]]);
    success = 0.4 * sPnl + 0.25 * sRoi + 0.25 * sPf + 0.1 * sWr;
    if (copy.pnlNet <= 0) success = Math.min(success, 25);
  }

  // 1.2 Activity
  const tpd = copy.fills / 30;
  const daysSince = copy.lastFillAt == null ? 30 : (now - copy.lastFillAt) / DAY_MS;
  const aFreq = lin(tpd, [[0, 0], [0.5, 40], [1, 70], [3, 100], [8, 100], [15, 70], [30, 50]]);
  const aRecent = lin(daysSince, [[1, 100], [3, 80], [7, 40], [14, 0]]);
  const aDays = (100 * copy.activeDays) / 30;
  const activity = 0.4 * aFreq + 0.35 * aRecent + 0.25 * aDays;

  // 1.3 Focus
  const focus = 0.6 * mix.copyableSharePct + 0.4 * mix.copyableTradeSharePct;

  // 1.4 Consistency
  let consistency: number | null = null;
  const pw = profitableWeeks(daily);
  if (daily.length >= 14 && copy.trades >= 20 && pw) {
    const cWeeks = lin(pw.profitable, [[0, 0], [1, 10], [2, 40], [3, 75], [4, 100]]);
    const cDays = lin(copy.profitableDaysPct ?? 0, [[40, 0], [55, 60], [65, 100]]);
    const cConc = copy.topTradeShare == null ? 0 : 100 - 100 * clamp((copy.topTradeShare - 0.15) / 0.45, 0, 1);
    const cSortino = lin(sortinoDaily(daily, equityStart) ?? 0, [[0, 0], [0.1, 50], [0.3, 100]]);
    consistency = 0.3 * cWeeks + 0.25 * cDays + 0.25 * cConc + 0.2 * cSortino;
  }

  // 1.5 Risk
  const dd = maxDrawdownPct(daily, equityStart);
  const medLev = st.medianLeverage ?? copy.medianNotionalLev;
  const maxOpen = positions.reduce((m, p) => Math.max(m, p.notionalUsd), 0);
  const concRatio = equity > 0 ? maxOpen / equity : 0;
  let minLiq: number | null = null;
  for (const p of positions) {
    if (p.liqPx == null || !(p.markPx > 0)) continue;
    const dist = (Math.abs(p.markPx - p.liqPx) / p.markPx) * 100;
    if (minLiq == null || dist < minLiq) minLiq = dist;
  }
  let risk: number | null = null;
  if (dd != null) {
    const rDd = lin(dd, [[5, 100], [10, 80], [20, 50], [35, 15], [50, 0]]);
    const rLev = medLev == null ? 60 : lin(medLev, [[3, 100], [5, 85], [10, 55], [20, 20], [40, 0]]);
    const rConc = positions.length ? lin(concRatio, [[1, 100], [2, 70], [5, 30], [10, 0]]) : 90;
    const rLiq = minLiq == null ? 85 : lin(minLiq, [[2, 0], [5, 25], [10, 60], [25, 100]]);
    risk = 0.4 * rDd + 0.25 * rLev + 0.2 * rConc + 0.15 * rLiq;
  }

  // 2. Blend
  const thinReasons: string[] = [];
  const sBase = success ?? (thinReasons.push("Not enough closed trades to judge success"), 40);
  const cBase = consistency ?? (thinReasons.push("Less than two weeks of history"), 40);
  const rBase = risk ?? (thinReasons.push("Drawdown unknown"), 50);
  const thin = thinReasons.length > 0;
  const base = 0.3 * sBase + 0.25 * cBase + 0.2 * rBase + 0.15 * activity + 0.1 * focus;
  const mFocus = focus >= 70 ? 1 : focus >= 50 ? 0.7 + (0.3 * (focus - 50)) / 20 : (0.35 * focus) / 50;

  const penalties: { factor: number; reason: string; kind: string }[] = [];
  if (dd != null && dd > 50) penalties.push({ factor: 0.4, reason: "Drawdown over 50% in the last 30 days", kind: "dd" });
  else if (dd != null && dd > 30) penalties.push({ factor: 0.7, reason: "Drawdown over 30% in the last 30 days", kind: "dd" });
  if (medLev != null && medLev > 25) penalties.push({ factor: 0.6, reason: "Median leverage above 25x", kind: "lev" });
  else if (medLev != null && medLev > 10) penalties.push({ factor: 0.8, reason: "Median leverage above 10x", kind: "lev" });
  if (concRatio > 3) penalties.push({ factor: 0.85, reason: "One position is over 3x account equity", kind: "conc" });
  if (daysSince > 14) penalties.push({ factor: 0.3, reason: "No copyable trade in over 14 days", kind: "inactive" });
  else if (daysSince > 7) penalties.push({ factor: 0.6, reason: "No copyable trade in over 7 days", kind: "inactive" });
  if (copy.trades < 20) penalties.push({ factor: 0.5, reason: "Fewer than 20 copyable trades in 30 days", kind: "trades" });
  if (copy.pnlNet <= 0 && inp.monthPnl > 0) penalties.push({ factor: 0.5, reason: "Profits come from markets Ascend cannot copy", kind: "negcopy" });
  if (equity < 5000) penalties.push({ factor: 0.8, reason: "Small account, results may not scale", kind: "small" });
  if (winRate != null && winRate >= 85 && pf != null && pf < 1.2) penalties.push({ factor: 0.7, reason: "High win rate with tiny average win (grid or martingale pattern)", kind: "grid" });
  const product = Math.max(0.1, penalties.reduce((p, x) => p * x.factor, 1));

  const copyability = Math.round(clamp(base * mFocus * product));

  // 3. Grade with gates (failing a gate drops exactly one letter)
  const letters: Score["grade"][] = ["A", "B", "C", "D"];
  let idx = copyability >= 75 ? 0 : copyability >= 60 ? 1 : copyability >= 40 ? 2 : 3;
  const gateReasons: string[] = [];
  if (idx === 0) {
    const fails: string[] = [];
    if (focus < 70) fails.push("Focus below 70% for grade A");
    if ((success ?? 0) < 60) fails.push("Success below 60 for grade A");
    if ((risk ?? 0) < 50) fails.push("Risk score below 50 for grade A");
    if (copy.trades < 40) fails.push("Fewer than 40 copyable trades for grade A");
    if (penalties.length) fails.push("A penalty applies, grade A withheld");
    if (thin) fails.push("Thin data, grade A withheld");
    if (fails.length) {
      idx = 1;
      gateReasons.push(fails[0]);
    }
  }
  if (idx === 1) {
    const fails: string[] = [];
    if (focus < 50) fails.push("Focus below 50% for grade B");
    if (penalties.some((p) => p.kind === "inactive" || p.kind === "negcopy")) fails.push("Inactivity or non-copyable profits, grade B withheld");
    if (thin) fails.push("Thin data, grade B withheld");
    if (fails.length && gateReasons.length === 0) {
      idx = 2;
      gateReasons.push(fails[0]);
    }
  }
  if (thin && idx < 2) idx = 2;
  const grade = letters[idx];

  // Reasons: gates, penalties (incl. thin substitutions), then up to 3 positives; cap 6.
  const positives: string[] = [];
  if (focus >= 70) positives.push(`Trades mostly BTC/ADA/GOLD/WTI (${Math.round(mix.copyableSharePct)}%)`);
  if (pw && pw.weeks === 4 && pw.profitable === 4) positives.push("Profitable every week this month");
  if (dd != null && dd <= 10) positives.push(`Max drawdown only ${Math.round(dd)}%`);
  if (pf != null && pf >= 1.5 && copy.trades >= 20) positives.push(`Profit factor ${pf.toFixed(1)} on ${copy.trades} trades`);
  if (copy.activeDays >= 25 && daysSince < 1) positives.push(`Active daily, last trade ${Math.max(1, Math.round(daysSince * 24))}h ago`);
  if (medLev != null && medLev <= 5) positives.push(`Leverage around ${Math.round(medLev)}x`);
  const negatives: string[] = [];
  if (copy.topTradeShare != null && copy.topTradeShare >= 0.5) negatives.push(`Top single trade is ${Math.round(copy.topTradeShare * 100)}% of all profit`);
  if (winRate != null && copy.trades >= 20 && winRate < 45) negatives.push(`Win rate below 45%`);
  if (copy.activeDays < 15 && copy.fills >= 5) negatives.push(`Only ${copy.activeDays} active days of 30`);
  if (focus < 70) negatives.push(`Only ${Math.round(mix.copyableSharePct)}% of volume is copyable`);
  const reasons = [...gateReasons, ...penalties.map((p) => p.reason), ...thinReasons, ...negatives, ...positives.slice(0, 3)].slice(0, 6);

  return {
    copyability,
    success: success == null ? null : r1(success),
    activity: r1(activity),
    focus: r1(focus),
    consistency: consistency == null ? null : r1(consistency),
    risk: risk == null ? null : r1(risk),
    grade,
    thin,
    reasons,
  };
}

/** Rubric section 4 tie-breakers for equal rounded copyability; returns <0 when a ranks above b. */
export function compareScored(a: { score: Score; stats30d: Stats30d; copy: CopyStats; address: string }, b: { score: Score; stats30d: Stats30d; copy: CopyStats; address: string }): number {
  return (
    b.score.copyability - a.score.copyability ||
    (b.score.consistency ?? -1) - (a.score.consistency ?? -1) ||
    (a.stats30d.maxDrawdownPct ?? 1e9) - (b.stats30d.maxDrawdownPct ?? 1e9) ||
    b.copy.pnlNet - a.copy.pnlNet ||
    b.copy.trades - a.copy.trades ||
    (b.score.focus ?? 0) - (a.score.focus ?? 0) ||
    (a.address < b.address ? -1 : a.address > b.address ? 1 : 0)
  );
}

export const ASSET_LIST: readonly AssetGroup[] = ASSETS;
