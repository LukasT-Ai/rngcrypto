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
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_VERSION, scoreFromCandles, type Candle } from "../src/lib/signals/engine";

const BINANCE: Record<string, string> = { BTC: "BTCUSDT", ETH: "ETHUSDT", BNB: "BNBUSDT", ADA: "ADAUSDT", XRP: "XRPUSDT", SOL: "SOLUSDT", NEAR: "NEARUSDT", ZEC: "ZECUSDT" };
const M5 = 300e3, M15 = 900e3, H1 = 3600e3, H4 = 14400e3, D1 = 86400e3;
const WARMUP_15M = 240; // bars needed before the first decision (EMA200 on 15m, 1h/4h windows)
const HORIZON_MS = 24 * H1; // the verifier's default horizon when no trade type is known
const FILL_WINDOW = 96; // 5m candles a limit entry may wait (matches check/core.ts default)
const MARKET_TOL = 0.001;

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const DAYS = parseInt(arg("days", "30"), 10);
const SYMBOLS = arg("symbols", Object.keys(BINANCE).join(",")).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const SLIP = parseFloat(arg("slippage", "0.0005"));
const FEE = parseFloat(arg("fee", "0.0005"));
const OUT = arg("out", "data/backtests");

async function get(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { "User-Agent": "rngcrypto-backtest" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function klines(sym: string, interval: string, start: number, end: number): Promise<Candle[]> {
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
  closedAt: number | null;
  reason: "stop_before_tp" | "stop_after_tp" | "tp3" | "horizon" | "unfilled" | "open";
  highestTp: 0 | 1 | 2 | 3;
  grossR: number | null;
  netR: number | null;
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
  const horizonEnd = tr.t + HORIZON_MS;
  let hit: 0 | 1 | 2 | 3 = 0;
  const rOf = (p: number) => (long ? p - tr.entry : tr.entry - p) / risk;
  const cost = ((SLIP + FEE) * 2 * tr.entry) / risk; // round trip, in R
  const finish = (reason: Trade["reason"], exit: number, at: number) => {
    tr.reason = reason;
    tr.closedAt = at;
    tr.highestTp = hit;
    tr.grossR = Math.round(rOf(exit) * 1e4) / 1e4;
    tr.netR = Math.round((rOf(exit) - cost) * 1e4) / 1e4;
  };
  for (let j = fillIdx; j < c5.length; j++) {
    const c = c5[j];
    if (c.time >= horizonEnd) {
      finish("horizon", c5[j - 1]?.close ?? c.open, c.time);
      return;
    }
    const stopHit = long ? c.low <= tr.stop : c.high >= tr.stop;
    if (stopHit) {
      if (hit === 0) finish("stop_before_tp", tr.stop, c.time);
      else finish("stop_after_tp", tr.tp[hit - 1], c.time);
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
  const end = Date.now();
  const start = end - DAYS * D1 - WARMUP_15M * M15 - 2 * D1;
  console.log(`${symbol}: fetching ${DAYS}d of 5m candles…`);
  const c5 = await klines(b, "5m", start, end);
  const c1d = await klines(b, "1d", end - 420 * D1, end);
  const c15 = aggregate(c5, M15);
  const c1h = aggregate(c5, H1);
  const c4h = aggregate(c5, H4);
  console.log(`${symbol}: ${c5.length} x 5m, ${c15.length} x 15m, ${c1d.length} x 1d`);

  const trades: Trade[] = [];
  let open: Trade | null = null;
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
      if (open.reason !== "open") open = null;
    }
    if (open) continue;
    const win = (arr: Candle[], ms: number, n: number) => {
      // bars whose open < now (the engine drops the one still forming)
      let k = arr.length;
      while (k > 0 && arr[k - 1].time >= now) k--;
      return arr.slice(Math.max(0, k - n), k);
    };
    const r = scoreFromCandles({
      symbol,
      c5: win(c5, M5, 120),
      c15: win(c15, M15, 220),
      c1h: win(c1h, H1, 120),
      c4h: win(c4h, H4, 120),
      c1d: win(c1d, D1, 220),
      price: bar.close,
      now,
    });
    decisions++;
    if (!r || r.bias === "WAIT" || r.confidence < 55) continue;
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
      closedAt: null,
      reason: "open",
      highestTp: 0,
      grossR: null,
      netR: null,
    };
    simulate(tr, c5, i5);
    trades.push(tr);
    if (tr.reason === "open") open = tr;
  }
  console.log(`${symbol}: ${decisions} decisions, ${trades.length} signals`);
  return trades;
}

function pct(n: number, d: number) {
  return d ? Math.round((n / d) * 1000) / 10 : null;
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
  return {
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
    params: { days: DAYS, symbols: SYMBOLS, slippage: SLIP, fee: FEE, horizonHours: HORIZON_MS / H1, fillWindowCandles: FILL_WINDOW },
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
    trades: all,
  };
  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const file = join(OUT, `backtest-${stamp}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  const o = report.overall;
  console.log("\n=== OVERALL ===");
  console.log(JSON.stringify(o, null, 2));
  console.log("\n=== BY GRADE ===");
  for (const [k, v] of Object.entries(report.byGrade)) console.log(k.padEnd(9), `n=${v.closed}`.padEnd(7), `TP1 ${v.tp1Rate}%`.padEnd(10), `netR ${v.expectancyNetR}`.padEnd(14), `PF ${v.profitFactorNet}`);
  console.log("\n=== BY SYMBOL ===");
  for (const [k, v] of Object.entries(report.bySymbol)) console.log(k.padEnd(6), `n=${v.closed}`.padEnd(7), `unfilled ${v.unfilled}`.padEnd(13), `TP1 ${v.tp1Rate}%`.padEnd(10), `netR ${v.expectancyNetR}`.padEnd(14), `sum ${v.sumNetR}`);
  console.log("\n=== BY ENTRY TYPE ===");
  for (const [k, v] of Object.entries(report.byEntryType)) console.log(k.padEnd(7), `signals=${v.signals}`.padEnd(13), `unfilled ${v.unfilled}`.padEnd(13), `netR ${v.expectancyNetR}`);
  console.log(`\nwritten ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
