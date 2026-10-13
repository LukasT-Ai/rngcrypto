/**
 * Walk-forward backtest of the live scoring path.
 *
 *   npx tsx scripts/backtest.ts --days 30 --symbols BTC,ETH,ADA,SOL [--slippage 0.0005] [--fee 0.0005] [--out data/backtests]
 *
 * For every closed 15-minute bar the engine's scoreFromCandles() is called with exactly the candles that were
 * closed at that moment (no non-candle feeds, which is how the engine already treats a feed that is down).
 * A LONG/SHORT call with confidence >= 55 opens a simulated signal when the symbol has no open one (the same
 * dedupe rule as the live logger). Outcomes follow the site's verifier: a market entry (within 0.1% of price)
 * fills at the next 5m open, a limit entry must trade within the fill window or is a non-trade, TP ladder and
 * stop are checked on 5m highs/lows with same-candle stop+TP resolved as the stop, a stop after a TP exits at the
 * last TP, and the horizon exit uses the last close. Realized R is reported gross and net of fees + slippage.
 *
 * Candles come from Binance.US (public, no key): 5m bars for the window plus a warm-up, aggregated locally to
 * 15m / 1h / 4h; daily bars fetched separately. Only symbols with a Binance.US market are testable.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_TUNING, ENGINE_VERSION, getTuning, getWeights, scoreFromCandles, setTuning, setWeights, type Candle, type FactorWeights, type Tuning } from "../src/lib/signals/engine";
import { DEFAULT_BLOCK_OPTIONS, getBlockOptions, setBlockOptions, type BlockName } from "../src/lib/signals/blocks";
import { COST_MODEL, costInR, type CostVenue } from "../src/app/api/signals/history/check/core";
import { calibration, type CalRow } from "../src/app/api/signals/history/performance";
import { buildHoldBuckets, type HoldBucketFile } from "../src/lib/signals/setup-tracker";
import { deflatedSharpe, sharpeStats } from "./backtest-stats";

const BINANCE: Record<string, string> = { BTC: "BTCUSDT", ETH: "ETHUSDT", BNB: "BNBUSDT", ADA: "ADAUSDT", XRP: "XRPUSDT", SOL: "SOLUSDT", NEAR: "NEARUSDT", ZEC: "ZECUSDT" };
const M5 = 300e3, M15 = 900e3, H1 = 3600e3, H4 = 14400e3, D1 = 86400e3;
const WARMUP_15M = 420; // bars needed before the first decision (SMA200 + slope + cross lookback on 15m)
const WINDOW_4H = 420; // 4h bars the regime factor needs (SMA200 on 4h); aggregated from 5m, so the fetch starts earlier
const HORIZON_MS = 24 * H1; // the verifier's default horizon when no trade type is known
const FILL_WINDOW = 96; // 5m candles a limit entry may wait (matches check/core.ts default)
const MARKET_TOL = 0.001;

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
// Boolean flag: present without a value or with anything other than "0" means on.
function flag(name: string, def = false): boolean {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return !(v === "0" || v === "false");
}
const DAYS = parseInt(arg("days", "30"), 10);
const SYMBOLS = arg("symbols", Object.keys(BINANCE).join(",")).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const SLIP = parseFloat(arg("slippage", "0.0005"));
const FEE = parseFloat(arg("fee", "0.0005"));
const OUT = arg("out", "data/backtests");
const LABEL = arg("label", "");
// Cost model + next-open fills (perf audit 1.3), on by default so the harness matches the live checker:
// market orders fill at the next 5m open with risk measured from that fill, and net R subtracts the venue's
// taker/maker fee, slippage per market leg and (when the harness has a funding series; it does not) funding.
// `--cost-model 0` restores the old flat `(slippage + fee) * 2` round trip on the decision price.
const COST_MODEL_ON = arg("cost-model", "1") !== "0";
const VENUE: CostVenue = (arg("venue", "STRIKE").toUpperCase() === "HYPERLIQUID" ? COST_MODEL.HYPERLIQUID : COST_MODEL.STRIKE);
// Strategy knobs (defaults = the live engine). Baseline before tuning:
//   --min-conf 55 --short-gate 0 --stop-buffer 0.5 --min-stop-atr 0.8 --stop-floor-scale 1 --cooldown-min 0
setTuning({
  minPublishConfidence: parseFloat(arg("min-conf", String(DEFAULT_TUNING.minPublishConfidence))),
  shortNeedsHtfBear: arg("short-gate", DEFAULT_TUNING.shortNeedsHtfBear ? "1" : "0") !== "0",
  stopBufferAtr: parseFloat(arg("stop-buffer", String(DEFAULT_TUNING.stopBufferAtr))),
  minStopAtr: parseFloat(arg("min-stop-atr", String(DEFAULT_TUNING.minStopAtr))),
  stopFloorScale: parseFloat(arg("stop-floor-scale", String(DEFAULT_TUNING.stopFloorScale))),
  regimeWeight: parseFloat(arg("regime-weight", String(DEFAULT_TUNING.regimeWeight))),
  regimeGate: arg("regime-gate", DEFAULT_TUNING.regimeGate) as Tuning["regimeGate"],
  // Wave 2 (PR 15) structural knobs, each a flag here first (research/backtest-wave2.md records the runs):
  //   --mr-with-regime 1 --breakeven-after-tp1 1 --horizon-by-tf 1 --htf-gate-both 1 --htf-vote 0 --short-regime 1
  //   --min-rr 1.5 --session-rules 1
  mrWithRegime: flag("mr-with-regime", DEFAULT_TUNING.mrWithRegime),
  breakevenAfterTp1: flag("breakeven-after-tp1", DEFAULT_TUNING.breakevenAfterTp1),
  horizonByTf: flag("horizon-by-tf", DEFAULT_TUNING.horizonByTf),
  htfGateBoth: flag("htf-gate-both", DEFAULT_TUNING.htfGateBoth),
  htfVote: flag("htf-vote", DEFAULT_TUNING.htfVote),
  shortNeedsBearRegime: flag("short-regime", DEFAULT_TUNING.shortNeedsBearRegime),
  minRr: parseFloat(arg("min-rr", String(DEFAULT_TUNING.minRr))),
  sessionRules: flag("session-rules", DEFAULT_TUNING.sessionRules),
  // PR 26 blocks: --blocks 1 --combine vote|sum (research R2.3 / R2.4); research/backtest-blocks.md records the runs.
  blockMode: process.argv.includes("--blocks") ? (flag("blocks") ? (arg("combine", "vote") === "sum" ? "sum" : "vote") : "off") : DEFAULT_TUNING.blockMode,
});
// Block options (PR 26): --block-agg mean|median (R2.5), --drop-block trend,timing,flow (ablation),
// --block-weights 0.45,0.30,0.25 (trend,timing,flow), --vote-threshold 25.
{
  const agg = arg("block-agg", DEFAULT_BLOCK_OPTIONS.agg) === "median" ? "median" : "mean";
  const drop = arg("drop-block", "").split(",").map((s) => s.trim()).filter((s): s is BlockName => s === "trend" || s === "timing" || s === "flow");
  const bw = arg("block-weights", "").split(",").map((s) => parseFloat(s));
  const weights = bw.length === 3 && bw.every((v) => Number.isFinite(v) && v >= 0) ? { trend: bw[0], timing: bw[1], flow: bw[2] } : undefined;
  const voteThreshold = parseFloat(arg("vote-threshold", String(DEFAULT_BLOCK_OPTIONS.voteThreshold)));
  setBlockOptions({ agg, drop, ...(weights ? { weights } : {}), voteThreshold: Number.isFinite(voteThreshold) ? voteThreshold : DEFAULT_BLOCK_OPTIONS.voteThreshold });
}
// Flat horizon override in hours (R4.2); ignored per trade when --horizon-by-tf is on (the engine's call.horizonMin wins).
const HORIZON_HOURS = parseFloat(arg("horizon-hours", String(HORIZON_MS / H1)));
// --report-buckets: month / hour / weekday / setup / mode / dominant-TF summaries with per-bucket t-stats (R5.1).
const REPORT_BUCKETS = flag("report-buckets");
// --sweep-deflate 1 [--trials N]: deflated Sharpe / PSR / MinTRL against the number of configurations tried (R5.2).
// N defaults to the number of backtest reports already in --out (every report is one trial of the sweep).
const SWEEP_DEFLATE = flag("sweep-deflate");
const TRIALS_ARG = parseInt(arg("trials", "0"), 10);
// Spread of the trials' per-trade Sharpes. Default 0.08 (the observed spread of the 2026-10-07 36-config sweep,
// research section 5.1) so every run is deflated against the same benchmark; "scan" measures it from the reports in --out.
const TRIAL_SD_ARG = arg("trial-sd", "0.08");
// --asof <ms|ISO>: pin the window end (rounded down to the hour) so a run reuses the candle cache of an earlier run.
const ASOF_RAW = arg("asof", "");
const ASOF = ASOF_RAW ? (Number.isFinite(Number(ASOF_RAW)) ? Number(ASOF_RAW) : Date.parse(ASOF_RAW)) : NaN;
// --write-hold-buckets <file|1>: hold-time buckets (symbol x bias x regime) for call.expectedHold ("1" = data/hold-buckets.json).
const HOLD_OUT = arg("write-hold-buckets", "");
const COOLDOWN_MS = parseFloat(arg("cooldown-min", "60")) * 60e3;
const MIN_CONF = getTuning().minPublishConfidence;
// --weights-json <file>: override the factor weights (keys of DEFAULT_WEIGHTS) for out-of-sample validation
// of a candidate weight vector (perf audit 3.4). The report records the weights actually used.
const WEIGHTS_JSON = arg("weights-json", "");
let weightsApplied: Partial<FactorWeights> | null = null;
if (WEIGHTS_JSON) {
  const override = JSON.parse(readFileSync(WEIGHTS_JSON, "utf-8")) as Partial<FactorWeights>;
  setWeights(override);
  weightsApplied = override;
  console.log(`weights override applied from ${WEIGHTS_JSON}: ${JSON.stringify(getWeights())}`);
}

async function get(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { "User-Agent": "rngcrypto-backtest" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function klines(sym: string, interval: string, start: number, end: number): Promise<Candle[]> {
  // Cache per symbol/interval/day so a parameter sweep does not refetch the same candles.
  const cacheDir = join("data", "backtests", "cache");
  mkdirSync(cacheDir, { recursive: true });
  const key = join(cacheDir, `${sym}-${interval}-${Math.floor(start / D1)}-${Math.floor(end / 3600e3)}.json`);
  if (existsSync(key)) return JSON.parse(readFileSync(key, "utf-8")) as Candle[];
  const fetched = await klinesFetch(sym, interval, start, end);
  writeFileSync(key, JSON.stringify(fetched));
  return fetched;
}

async function klinesFetch(sym: string, interval: string, start: number, end: number): Promise<Candle[]> {
  const out: Candle[] = [];
  let cur = start;
  while (cur < end) {
    const raw = (await get(`https://api.binance.us/api/v3/klines?symbol=${sym}&interval=${interval}&startTime=${cur}&endTime=${end}&limit=1000`)) as unknown[][];
    if (!Array.isArray(raw) || raw.length === 0) break;
    for (const k of raw) out.push({ time: Number(k[0]), open: +k[1]!, high: +k[2]!, low: +k[3]!, close: +k[4]!, volume: +k[5]! });
    cur = Number(raw[raw.length - 1][0]) + 1;
    if (raw.length < 1000) break;
  }
  return out;
}

// Aggregate closed 5m bars into a coarser interval aligned to the epoch. The last bucket may be partial; the
// engine drops it when it is still forming at decision time.
function aggregate(c5: Candle[], ms: number): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const c of c5) {
    const bucket = Math.floor(c.time / ms) * ms;
    if (!cur || cur.time !== bucket) {
      if (cur) out.push(cur);
      cur = { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

interface Trade {
  symbol: string;
  t: number;
  bias: "LONG" | "SHORT";
  confidence: number;
  grade: string;
  entry: number;
  stop: number;
  tp: [number, number, number];
  entryType: "market" | "limit";
  filledAt: number | null;
  fillPrice: number | null;
  costR: number | null;
  closedAt: number | null;
  reason: "stop_before_tp" | "stop_after_tp" | "tp3" | "horizon" | "unfilled" | "open";
  highestTp: 0 | 1 | 2 | 3;
  grossR: number | null;
  netR: number | null;
  regimeLabel: string | null;
  alignment: "aligned" | "counter" | "n/a";
  weightedScore: number | null;
  // Wave 2 per-trade context (report buckets + horizon rule).
  horizonMs: number;
  mode: string | null;
  dominantTf: string | null;
  setup: string | null;
  sizeMultiplier: number;
  /** Stop in force at the close (the fill price after TP1 when breakeven is on). */
  activeStop: number | null;
}

function simulate(tr: Trade, c5: Candle[], from: number): void {
  const long = tr.bias === "LONG";
  const risk = Math.abs(tr.entry - tr.stop);
  // Fill
  const firstTime = Math.ceil(tr.t / M5) * M5;
  let i = from;
  while (i < c5.length && c5[i].time < firstTime) i++;
  let fillIdx = -1;
  if (tr.entryType === "market") {
    if (i < c5.length) fillIdx = i;
  } else {
    for (let j = i; j < Math.min(c5.length, i + FILL_WINDOW); j++) {
      const c = c5[j];
      if (long ? c.low <= tr.entry : c.high >= tr.entry) {
        fillIdx = j;
        break;
      }
    }
  }
  if (fillIdx < 0) {
    tr.reason = "unfilled";
    tr.closedAt = c5[Math.min(c5.length - 1, i + FILL_WINDOW)]?.time ?? null;
    return;
  }
  tr.filledAt = c5[fillIdx].time;
  // Next-open fill for market orders (the live checker's convention); limit orders fill at the entry.
  const fillPrice = COST_MODEL_ON && tr.entryType === "market" && c5[fillIdx].open > 0 ? c5[fillIdx].open : tr.entry;
  tr.fillPrice = fillPrice;
  const fillRisk = Math.abs(fillPrice - tr.stop) > 0 ? Math.abs(fillPrice - tr.stop) : risk;
  const horizonEnd = tr.t + tr.horizonMs;
  const breakeven = getTuning().breakevenAfterTp1;
  let hit: 0 | 1 | 2 | 3 = 0;
  const rOf = (p: number) => (long ? p - fillPrice : fillPrice - p) / fillRisk;
  const legacyCost = ((SLIP + FEE) * 2 * tr.entry) / risk; // old flat round trip, in R
  const finish = (reason: Trade["reason"], exit: number, at: number) => {
    tr.reason = reason;
    tr.closedAt = at;
    tr.highestTp = hit;
    const cost = COST_MODEL_ON
      ? (costInR({ bias: tr.bias, fillPrice, stopLoss: tr.stop, entryType: tr.entryType, holdHours: Math.max(0, (at - (tr.filledAt ?? at)) / H1), fundingRate8h: null, venue: VENUE })?.costR ?? 0)
      : legacyCost;
    tr.costR = Math.round(cost * 1e4) / 1e4;
    tr.grossR = Math.round(rOf(exit) * 1e4) / 1e4;
    tr.netR = Math.round((rOf(exit) - cost) * 1e4) / 1e4;
  };
  for (let j = fillIdx; j < c5.length; j++) {
    const c = c5[j];
    if (c.time >= horizonEnd) {
      finish("horizon", c5[j - 1]?.close ?? c.open, c.time);
      return;
    }
    // Breakeven after TP1 (R4.1): the stop moves to the fill price once TP1 printed; a touch exits at breakeven
    // (0R gross) instead of crediting the last TP. Off: original stop, exit at the last TP (the live convention).
    const activeStop = breakeven && hit > 0 ? fillPrice : tr.stop;
    tr.activeStop = activeStop;
    const stopHit = long ? c.low <= activeStop : c.high >= activeStop;
    if (stopHit) {
      if (hit === 0) finish("stop_before_tp", tr.stop, c.time);
      else finish("stop_after_tp", breakeven ? fillPrice : tr.tp[hit - 1], c.time);
      return;
    }
    // Limit fill candle came from the far side of the entry: targets count from the next candle.
    if (j === fillIdx && tr.entryType === "limit") continue;
    while (hit < 3) {
      const lvl = tr.tp[hit as 0 | 1 | 2];
      if (!(long ? c.high >= lvl : c.low <= lvl)) break;
      hit = (hit + 1) as 1 | 2 | 3;
    }
    if (hit === 3) {
      finish("tp3", tr.tp[2], c.time);
      return;
    }
  }
  tr.reason = "open";
  tr.highestTp = hit;
}

async function runSymbol(symbol: string): Promise<Trade[]> {
  const b = BINANCE[symbol];
  if (!b) {
    console.log(`${symbol}: no Binance.US market, skipped`);
    return [];
  }
  const end = Math.floor((Number.isFinite(ASOF) ? ASOF : Date.now()) / 3600e3) * 3600e3;
  const start = end - DAYS * D1 - WARMUP_15M * M15 - WINDOW_4H * H4 - 2 * D1;
  console.log(`${symbol}: fetching ${DAYS}d of 5m candles…`);
  const c5 = await klines(b, "5m", start, end);
  const c1d = await klines(b, "1d", end - 420 * D1, end);
  const c15 = aggregate(c5, M15);
  const c1h = aggregate(c5, H1);
  const c4h = aggregate(c5, H4);
  console.log(`${symbol}: ${c5.length} x 5m, ${c15.length} x 15m, ${c1d.length} x 1d`);

  const trades: Trade[] = [];
  let open: Trade | null = null;
  let lastClosedAt = 0;
  let i5 = 0;
  const testStart = end - DAYS * D1;
  let decisions = 0;
  for (let i = WARMUP_15M; i < c15.length; i++) {
    const bar = c15[i];
    const now = bar.time + M15; // decision at the bar close
    if (now < testStart) continue;
    while (i5 < c5.length && c5[i5].time + M5 <= now) i5++;
    if (open && open.reason === "open") {
      // Re-run the walk cheaply: simulate() is deterministic from the signal time; recompute on each pass only
      // when the trade is still open. (Cost is bounded by the horizon.)
      simulate(open, c5, Math.max(0, i5 - Math.ceil((now - open.t) / M5) - 2));
      if (open.reason !== "open") {
        lastClosedAt = open.closedAt ?? now;
        open = null;
      }
    }
    if (open) continue;
    if (now - lastClosedAt < COOLDOWN_MS) continue;
    const win = (arr: Candle[], ms: number, n: number) => {
      // bars whose open < now (the engine drops the one still forming)
      let k = arr.length;
      while (k > 0 && arr[k - 1].time >= now) k--;
      return arr.slice(Math.max(0, k - n), k);
    };
    const r = scoreFromCandles({
      symbol,
      c5: win(c5, M5, 120),
      c15: win(c15, M15, 420),
      c1h: win(c1h, H1, 120),
      c4h: win(c4h, H4, WINDOW_4H),
      c1d: win(c1d, D1, 420),
      price: bar.close,
      now,
    });
    decisions++;
    if (!r || r.bias === "WAIT" || r.confidence < MIN_CONF) continue;
    const entryType: "market" | "limit" = Math.abs(r.entry - bar.close) / bar.close > MARKET_TOL ? "limit" : "market";
    const tr: Trade = {
      symbol,
      t: now,
      bias: r.bias,
      confidence: r.confidence,
      grade: r.grade,
      entry: r.entry,
      stop: r.stopLoss,
      tp: [r.tp1, r.tp2, r.tp3],
      entryType,
      filledAt: null,
      fillPrice: null,
      costR: null,
      closedAt: null,
      reason: "open",
      highestTp: 0,
      grossR: null,
      netR: null,
      regimeLabel: r.regimeLabel ?? null,
      weightedScore: typeof r.weightedScore === "number" ? r.weightedScore : null,
      horizonMs: getTuning().horizonByTf && r.horizonMin > 0 ? r.horizonMin * 60e3 : HORIZON_HOURS * H1,
      mode: r.mode ?? null,
      dominantTf: r.dominantTf ?? null,
      setup: r.setup ?? null,
      sizeMultiplier: r.sizeMultiplier ?? 1,
      activeStop: null,
      alignment:
        r.regimeLabel === "Bull regime" || r.regimeLabel === "Bear regime"
          ? (r.bias === "LONG") === (r.regimeLabel === "Bull regime")
            ? "aligned"
            : "counter"
          : "n/a",
    };
    simulate(tr, c5, i5);
    trades.push(tr);
    if (tr.reason === "open") open = tr;
    else lastClosedAt = tr.closedAt ?? now;
  }
  console.log(`${symbol}: ${decisions} decisions, ${trades.length} signals`);
  return trades;
}

function pct(n: number, d: number) {
  return d ? Math.round((n / d) * 1000) / 10 : null;
}
function toCalRow(t: Trade): CalRow {
  const risk = Math.abs((t.fillPrice ?? t.entry) - t.stop);
  return {
    confidence: t.confidence,
    grade: t.grade,
    rr1: risk > 0 ? Math.round((Math.abs(t.tp[0] - (t.fillPrice ?? t.entry)) / risk) * 100) / 100 : null,
    pTp1: null,
    decided: t.highestTp >= 1 || t.reason === "stop_before_tp",
    tp1: t.highestTp >= 1,
    grossR: t.grossR,
    netR: t.netR,
    signedScore: t.weightedScore == null ? null : t.bias === "LONG" ? t.weightedScore : -t.weightedScore,
  };
}
function mean(xs: number[]) {
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null;
}
function summarize(list: Trade[]) {
  const closed = list.filter((t) => t.grossR != null);
  const g = closed.map((t) => t.grossR!);
  const n = closed.map((t) => t.netR!);
  const pos = n.filter((x) => x > 0).reduce((a, b) => a + b, 0);
  const neg = -n.filter((x) => x < 0).reduce((a, b) => a + b, 0);
  const st = sharpeStats(n);
  return {
    // Per-trade Sharpe (mean / sd of net R) and its t-stat: the inputs the deflated-Sharpe check needs (R5.2).
    sharpePerTrade: st.sharpe,
    tStat: st.tStat,
    sdNetR: st.sd,
    signals: list.length,
    unfilled: list.filter((t) => t.reason === "unfilled").length,
    open: list.filter((t) => t.reason === "open").length,
    closed: closed.length,
    tp1Rate: pct(closed.filter((t) => t.highestTp >= 1).length, closed.length),
    tp3Rate: pct(closed.filter((t) => t.highestTp >= 3).length, closed.length),
    stopBeforeTp: pct(closed.filter((t) => t.reason === "stop_before_tp").length, closed.length),
    expectancyGrossR: mean(g),
    expectancyNetR: mean(n),
    sumNetR: Math.round(n.reduce((a, b) => a + b, 0) * 100) / 100,
    profitFactorNet: neg > 0 ? Math.round((pos / neg) * 100) / 100 : pos > 0 ? null : 0,
    longShare: pct(list.filter((t) => t.bias === "LONG").length, list.length),
  };
}

// R5.2: deflated Sharpe against the sweep. Every backtest report in --out is one trial; their per-trade Sharpes
// give the variance of the trials. Reports older than this field recompute the Sharpe from their trades[].
function sweepDeflation(all: Trade[]) {
  const net = all.filter((t) => t.netR != null).map((t) => t.netR!);
  const trialSharpes: number[] = [];
  let trialsSource = "--trials";
  try {
    for (const f of readdirSync(OUT)) {
      if (!f.startsWith("backtest-") || !f.endsWith(".json")) continue;
      try {
        const j = JSON.parse(readFileSync(join(OUT, f), "utf-8")) as { overall?: { sharpePerTrade?: number | null }; trades?: { netR: number | null }[] };
        const sr = j.overall?.sharpePerTrade ?? sharpeStats((j.trades ?? []).filter((t) => t.netR != null).map((t) => t.netR!)).sharpe;
        if (sr != null && Number.isFinite(sr)) trialSharpes.push(sr);
      } catch {
        /* skip unreadable report */
      }
    }
  } catch {
    /* no reports dir yet */
  }
  const own = sharpeStats(net);
  if (own.sharpe != null) trialSharpes.push(own.sharpe);
  let trials = TRIALS_ARG > 0 ? TRIALS_ARG : trialSharpes.length;
  if (!(TRIALS_ARG > 0)) trialsSource = `${trialSharpes.length} reports in ${OUT} incl. this run`;
  if (trials < 2) trials = 2;
  const fixedSd = TRIAL_SD_ARG === "scan" ? null : parseFloat(TRIAL_SD_ARG);
  return { trials, trialsSource, trialSdSource: fixedSd != null ? `--trial-sd ${fixedSd}` : "scan of reports", ...deflatedSharpe(net, trialSharpes, trials, fixedSd) };
}

async function main() {
  const all: Trade[] = [];
  for (const s of SYMBOLS) {
    try {
      all.push(...(await runSymbol(s)));
    } catch (e) {
      console.log(`${s}: failed: ${(e as Error).message}`);
    }
  }
  const by = <K extends string>(key: (t: Trade) => K) => {
    const m = new Map<K, Trade[]>();
    for (const t of all) m.set(key(t), [...(m.get(key(t)) ?? []), t]);
    return Object.fromEntries([...m.entries()].sort().map(([k, v]) => [k, summarize(v)]));
  };
  const report = {
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    params: { days: DAYS, symbols: SYMBOLS, slippage: SLIP, fee: FEE, horizonHours: HORIZON_HOURS, asOf: Number.isFinite(ASOF) ? new Date(Math.floor(ASOF / 3600e3) * 3600e3).toISOString() : null, label: LABEL || null, fillWindowCandles: FILL_WINDOW, cooldownMin: COOLDOWN_MS / 60e3, tuning: getTuning(), weights: getWeights(), weightsOverride: weightsApplied, blockOptions: getBlockOptions(), costModel: COST_MODEL_ON ? { ...VENUE, nextOpenFill: true, fundingApplied: false } : { legacy: true, roundTrip: (SLIP + FEE) * 2 } },
    caveats: [
      "Candles only: funding, open interest, sentiment, news, catalysts, ETF flows, liquidations and the macro regime are null, exactly as the live engine treats a feed that is down.",
      "Binance.US spot candles stand in for Strike's perp feed; wicks differ slightly.",
      "One open signal per symbol; no position sizing, no correlation between symbols.",
    ],
    overall: summarize(all),
    bySymbol: by((t) => t.symbol),
    byGrade: by((t) => t.grade),
    byConfidence: by((t) => (t.confidence >= 80 ? "80+" : t.confidence >= 70 ? "70-79" : t.confidence >= 60 ? "60-69" : "55-59")),
    byBias: by((t) => t.bias),
    byEntryType: by((t) => t.entryType),
    byRegime: by((t) => t.regimeLabel ?? "none"),
    byAlignment: by((t) => t.alignment),
    // R5.1 report buckets (always written; printed with --report-buckets). Any bucket under 40 trades is descriptive only.
    byMonth: by((t) => new Date(t.t).toISOString().slice(0, 7)),
    byHour: by((t) => `h${String(new Date(t.t).getUTCHours()).padStart(2, "0")}`),
    byHourBlock: by((t) => {
      const h = new Date(t.t).getUTCHours();
      return h < 8 ? "00-08" : h < 13 ? "08-13" : h < 17 ? "13-17" : h < 21 ? "17-21" : "21-24";
    }),
    byWeekday: by((t) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(t.t).getUTCDay()]),
    byWeekend: by((t) => {
      const d = new Date(t.t).getUTCDay();
      return d === 0 || d === 6 ? "weekend" : "weekday";
    }),
    bySetup: by((t) => t.setup ?? "none"),
    byMode: by((t) => t.mode ?? "none"),
    byDominantTf: by((t) => t.dominantTf ?? "none"),
    byReason: by((t) => t.reason),
    sweep: SWEEP_DEFLATE ? sweepDeflation(all) : null,
    // Same calibration table as the live performance page (stated confidence vs realised TP1, Wilson, Brier/BSS),
    // so live and backtest calibration can be overlaid. No Platt mapping in the harness (yet).
    calibration: calibration(all.filter((t) => t.grossR != null).map(toCalRow), null),
    trades: all,
  };
  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const file = join(OUT, `backtest-${stamp}${LABEL ? `-${LABEL.replace(/[^a-z0-9_-]/gi, "_")}` : ""}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  if (HOLD_OUT) {
    const holdFile = HOLD_OUT === "1" ? join("data", "hold-buckets.json") : HOLD_OUT;
    const samples = all
      .filter((t) => t.filledAt != null && t.closedAt != null && t.grossR != null)
      .map((t) => ({ symbol: t.symbol, bias: t.bias, regime: t.regimeLabel, holdMin: Math.max(0, Math.round((t.closedAt! - t.filledAt!) / 60e3)) }));
    const out: HoldBucketFile = { generatedAt: new Date().toISOString(), source: `${file} (${DAYS}d, ${ENGINE_VERSION})`, buckets: buildHoldBuckets(samples) };
    writeFileSync(holdFile, JSON.stringify(out, null, 2));
    console.log(`hold buckets (${samples.length} samples, ${Object.keys(out.buckets).length} keys) written ${holdFile}`);
  }
  const o = report.overall;
  console.log("\n=== OVERALL ===");
  console.log(JSON.stringify(o, null, 2));
  console.log("\n=== BY GRADE ===");
  for (const [k, v] of Object.entries(report.byGrade)) console.log(k.padEnd(9), `n=${v.closed}`.padEnd(7), `TP1 ${v.tp1Rate}%`.padEnd(10), `netR ${v.expectancyNetR}`.padEnd(14), `PF ${v.profitFactorNet}`);
  console.log("\n=== BY SYMBOL ===");
  for (const [k, v] of Object.entries(report.bySymbol)) console.log(k.padEnd(6), `n=${v.closed}`.padEnd(7), `unfilled ${v.unfilled}`.padEnd(13), `TP1 ${v.tp1Rate}%`.padEnd(10), `netR ${v.expectancyNetR}`.padEnd(14), `sum ${v.sumNetR}`);
  console.log("\n=== BY ENTRY TYPE ===");
  for (const [k, v] of Object.entries(report.byEntryType)) console.log(k.padEnd(7), `signals=${v.signals}`.padEnd(13), `unfilled ${v.unfilled}`.padEnd(13), `netR ${v.expectancyNetR}`);
  console.log("\n=== BY REGIME ===");
  for (const [k, v] of Object.entries(report.byRegime)) console.log(k.padEnd(13), `n=${v.closed}`.padEnd(7), `TP1 ${v.tp1Rate}%`.padEnd(10), `netR ${v.expectancyNetR}`.padEnd(14), `PF ${v.profitFactorNet}`.padEnd(10), `sum ${v.sumNetR}`);
  console.log("\n=== BY ALIGNMENT (call vs regime) ===");
  for (const [k, v] of Object.entries(report.byAlignment)) console.log(k.padEnd(9), `n=${v.closed}`.padEnd(7), `TP1 ${v.tp1Rate}%`.padEnd(10), `netR ${v.expectancyNetR}`.padEnd(14), `PF ${v.profitFactorNet}`.padEnd(10), `sum ${v.sumNetR}`);
  const bucketLine = (k: string, v: ReturnType<typeof summarize>) =>
    console.log(k.padEnd(14), `n=${v.closed}`.padEnd(7), `TP1 ${v.tp1Rate}%`.padEnd(10), `netR ${v.expectancyNetR}`.padEnd(14), `PF ${v.profitFactorNet}`.padEnd(10), `sum ${v.sumNetR}`.padEnd(12), `t ${v.tStat}`);
  if (REPORT_BUCKETS) {
    const groups: [string, Record<string, ReturnType<typeof summarize>>][] = [
      ["BY MONTH", report.byMonth],
      ["BY HOUR BLOCK (UTC)", report.byHourBlock],
      ["BY HOUR (UTC)", report.byHour],
      ["BY WEEKDAY", report.byWeekday],
      ["BY WEEKEND", report.byWeekend],
      ["BY BIAS", report.byBias],
      ["BY SETUP", report.bySetup],
      ["BY MODE", report.byMode],
      ["BY DOMINANT TF", report.byDominantTf],
      ["BY EXIT REASON", report.byReason],
    ];
    for (const [title, group] of groups) {
      console.log(`\n=== ${title} ===`);
      for (const [k, v] of Object.entries(group)) bucketLine(k, v);
    }
  }
  if (report.sweep) {
    const d = report.sweep;
    console.log("\n=== SWEEP DEFLATION (Bailey & Lopez de Prado) ===");
    console.log(`trials N=${d.trials} (${d.trialsSource}) . per-trade SR ${d.sharpe} (T=${d.n}, skew ${d.skew}, kurt ${d.kurtosis}) . sd of trial SRs ${d.trialSd} . SR0 (expected max of N) ${d.sr0} . PSR(0) ${d.psr0} . PSR(SR0) ${d.psrDeflated} . MinTRL vs 0 at 95% ${d.minTrl0} trades . MinTRL vs SR0 ${d.minTrlDeflated} trades`);
    console.log(d.verdict);
  }
  console.log("\n=== CALIBRATION (stated confidence vs realised TP1) ===");
  for (const b of report.calibration.byConfidence) console.log(b.key.padEnd(7), `n=${b.n}`.padEnd(7), `TP1 ${b.tp1Rate}% [${b.wilsonLo}-${b.wilsonHi}]`.padEnd(26), `P(R>0) ${b.pPos}%`.padEnd(14), `netR ${b.meanNetR}`.padEnd(13), `Brier ${b.brierNaive}`);
  const br = report.calibration.brier;
  console.log(`Brier naive ${br.naive} . base ${br.base} . BSS ${br.bss} . rel ${br.reliability} . res ${br.resolution} . unc ${br.uncertainty} . n ${br.n}`);
  console.log(`\nwritten ${file}`);
  const t = getTuning();
  console.log(`SUMMARY ${LABEL || "run"} | days=${DAYS} conf>=${t.minPublishConfidence} shortGate=${t.shortNeedsHtfBear ? 1 : 0} stopBuf=${t.stopBufferAtr} minStopAtr=${t.minStopAtr} floorX=${t.stopFloorScale} regimeW=${t.regimeWeight} regimeGate=${t.regimeGate} cooldown=${COOLDOWN_MS / 60e3}m | mr=${t.mrWithRegime ? 1 : 0} be=${t.breakevenAfterTp1 ? 1 : 0} hTf=${t.horizonByTf ? 1 : 0} hH=${HORIZON_HOURS} htfBoth=${t.htfGateBoth ? 1 : 0} htfVote=${t.htfVote ? 1 : 0} shortRegime=${t.shortNeedsBearRegime ? 1 : 0} minRr=${t.minRr} session=${t.sessionRules ? 1 : 0} blocks=${t.blockMode}${t.blockMode !== "off" ? `(${getBlockOptions().agg}${getBlockOptions().drop.length ? " drop:" + getBlockOptions().drop.join("+") : ""})` : ""} | signals=${o.signals} unfilled=${o.unfilled} closed=${o.closed} TP1=${o.tp1Rate}% gross=${o.expectancyGrossR} net=${o.expectancyNetR} PF=${o.profitFactorNet} sum=${o.sumNetR} SR=${o.sharpePerTrade} t=${o.tStat} long=${o.longShare}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
