import { getHistory, updateSignal, type SignalLog, type TpHit } from "../logger";

export const STRIKE_MAP: Record<string, string> = {
  BTC: "BTC-USD", ETH: "ETH-USD", BNB: "BNB-USD", ADA: "ADA-USD", HYPE: "HYPE-USD",
  ZEC: "ZEC-USD", PUMP: "PUMP-USD", NIGHT: "NIGHT-USD", SKHYNIX: "SKHYNIX-USD",
  GOLD: "XAU-USD", XRP: "XRP-USD", SOL: "SOL-USD", NEAR: "NEAR-USD", OIL: "WTI-USD",
  SILVER: "XAG-USD", TSLA: "TSLA-USD", NVDA: "NVDA-USD", GOOGL: "GOOGL-USD",
  COIN: "COIN-USD", MU: "MU-USD", CRCL: "CRCL-USD", MINIMAX: "MINIMAX-USD",
  SPCX: "SPCX-USD", DRAM: "DRAM-USD", SP500: "SP500-USD", NAS100: "NAS100-USD",
  AAOI: "AAOI-USD", SNDK: "SNDK-USD", UNITREE: "UNITREE-USD", ZHIPU: "ZHIPU-USD",
  CXMT: "CXMT-USD",
};

const HOUR = 3600e3;
const HORIZON_MS: Record<string, number> = { SCALP: 4 * HOUR, SWING: 48 * HOUR, POSITION: 168 * HOUR, ULTIMATE: 168 * HOUR };
const DEFAULT_HORIZON = 24 * HOUR;
export const CANDLE_MS = 5 * 60e3;
// Strike's klines endpoint caps at 500 candles; anything older than that can no longer be verified.
const MAX_CANDLES = 500;
// Fill window: a limit entry that is not touched within this many candles is a non-trade.
const FILL_WINDOW_CANDLES: Record<string, number> = { SCALP: 24 };
const DEFAULT_FILL_WINDOW_CANDLES = 96;
// Entry within this fraction of the signal price is a market order, filled at the next candle open.
export const MARKET_ORDER_TOLERANCE = 0.001;
// Legacy first-touch records whose entry sat further than this from the signal price are re-verified.
export const LEGACY_REVERIFY_TOLERANCE = 0.003;

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function isOpen(sig: SignalLog): boolean {
  if (sig.status) return sig.status === "open";
  return sig.outcome === "pending";
}

function horizonFor(sig: SignalLog): number {
  const t = sig.context?.tradeType?.toUpperCase() ?? "";
  return HORIZON_MS[t] ?? DEFAULT_HORIZON;
}

export function fillWindowCandles(sig: SignalLog): number {
  const t = sig.context?.tradeType?.toUpperCase() ?? "";
  return FILL_WINDOW_CANDLES[t] ?? DEFAULT_FILL_WINDOW_CANDLES;
}

export function isMarketOrder(sig: SignalLog): boolean {
  if (!(sig.priceAtSignal > 0)) return false;
  return Math.abs(sig.entry - sig.priceAtSignal) / sig.priceAtSignal <= MARKET_ORDER_TOLERANCE;
}

// Open time of the first candle that may fill the signal: the candle containing the signal timestamp
// is excluded because the engine saw (part of) it when it produced the call.
export function firstEligibleCandleTime(sig: SignalLog): number {
  return Math.ceil(sig.timestamp / CANDLE_MS) * CANDLE_MS;
}

async function fetchCandles(strike: string, sinceMs: number): Promise<Candle[]> {
  const needed = Math.ceil((Date.now() - sinceMs) / CANDLE_MS) + 2;
  const limit = Math.max(3, Math.min(MAX_CANDLES, needed));
  try {
    const res = await fetch(`https://api.strikefinance.org/price/v2/klines?symbol=${strike}&interval=5m&limit=${limit}&priceType=last`, { cache: "no-store" });
    if (!res.ok) return [];
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((k: unknown[]) => {
        const t = Number(k[0]);
        return { time: t < 1e12 ? t * 1000 : t, open: parseFloat(String(k[1])), high: parseFloat(String(k[2])), low: parseFloat(String(k[3])), close: parseFloat(String(k[4])) };
      })
      .filter((c) => Number.isFinite(c.high) && Number.isFinite(c.low) && c.high > 0)
      .map((c) => ({ ...c, open: Number.isFinite(c.open) && c.open > 0 ? c.open : c.close }))
      .sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

// Realized R convention: exit at the last TP reached (stop after TP or TP3), at the stop if no TP was reached,
// or at the last close when the horizon runs out. Assumes fills at the exact touch on 5m candles; no slippage or fees.
export function realizedR(sig: SignalLog, exitPrice: number): number | null {
  const risk = Math.abs(sig.entry - sig.stopLoss);
  if (risk <= 0) return null;
  const move = sig.bias === "LONG" ? exitPrice - sig.entry : sig.entry - exitPrice;
  return r4(move / risk);
}

// Legacy records (no `status`) were finalized by the first-touch checker, which assumed the entry filled at
// the signal time. Where the entry was a resting limit well away from the market, that assumption is the
// whole result, so those records go back through the fill model.
export function needsLegacyReverify(sig: SignalLog): boolean {
  if (sig.status) return false;
  if (!(sig.priceAtSignal > 0)) return false;
  return Math.abs(sig.entry - sig.priceAtSignal) / sig.priceAtSignal > LEGACY_REVERIFY_TOLERANCE;
}

export function legacyResetPatch(sig: SignalLog): Partial<SignalLog> {
  return {
    status: "open",
    outcome: "pending",
    outcomePrice: null,
    outcomeTimestamp: null,
    maxFavorable: null,
    maxAdverse: null,
    tpHits: [],
    stoppedAt: null,
    stoppedAfterTp: null,
    closedReason: null,
    realizedR: null,
    mfeR: null,
    maeR: null,
    timeToTp1Min: null,
    fillStatus: "pending",
    filledAt: null,
    legacyOutcome: sig.legacyOutcome ?? sig.outcome,
    lastCheckedAt: sig.timestamp,
  };
}

function closeUnverified(now: number, reason: "unfilled" | "unverifiable", fillStatus: "unfilled" | "pending"): Partial<SignalLog> {
  return {
    status: "closed",
    outcome: "expired",
    outcomePrice: null,
    outcomeTimestamp: now,
    stoppedAt: null,
    stoppedAfterTp: null,
    closedReason: reason,
    realizedR: null,
    mfeR: null,
    maeR: null,
    maxFavorable: null,
    maxAdverse: null,
    tpHits: [],
    timeToTp1Min: null,
    fillStatus,
    filledAt: null,
    lastCheckedAt: now,
  };
}

const stillPending = (now: number): Partial<SignalLog> => ({ lastCheckedAt: now, fillStatus: "pending", status: "open", outcome: "pending" });

// Fill model: a signal is pending until a candle opened at or after the signal timestamp trades through
// its entry (low <= entry for longs, high >= entry for shorts). Entries within 0.1% of the signal price
// are market orders filled at the next candle open. After the fill the ladder walk runs: every TP is
// recorded when touched, a stop before TP1 is a loss, a stop after a TP exits at the last TP reached,
// same-candle SL + TP resolves as the stop. MFE/MAE run from the fill candle onward.
export function evaluate(sig: SignalLog, candles: Candle[], now: number): Partial<SignalLog> | null {
  if (!isOpen(sig)) return null;
  const long = sig.bias === "LONG";
  const risk = Math.abs(sig.entry - sig.stopLoss);
  const tps = [sig.tp1, sig.tp2, sig.tp3];
  const firstTime = firstEligibleCandleTime(sig);
  const market = isMarketOrder(sig);

  // Records older than the fill model carry no fillStatus; treat them as pending so the first pass
  // verifies the fill from the signal timestamp.
  let filledAt: number | null = sig.fillStatus === "filled" ? (sig.filledAt ?? null) : null;
  const tpHits: TpHit[] = filledAt != null ? [...(sig.tpHits ?? [])] : [];
  let maxFav = filledAt != null ? (sig.maxFavorable ?? 0) : 0;
  let maxAdv = filledAt != null ? (sig.maxAdverse ?? 0) : 0;

  if (filledAt == null) {
    const windowEnd = firstTime + fillWindowCandles(sig) * CANDLE_MS;
    const eligible = candles.filter((c) => c.time >= firstTime && c.time < windowEnd);
    const coverageLost = now - firstTime > MAX_CANDLES * CANDLE_MS;
    const earliest = candles[0]?.time ?? null;
    if (eligible.length === 0 || (earliest != null && earliest > firstTime)) {
      // Candles from the start of the fill window are missing. If they can never be fetched again the
      // record cannot be verified; otherwise wait for the next pass.
      if (coverageLost) return closeUnverified(now, "unverifiable", "pending");
      return stillPending(now);
    }
    for (const c of eligible) {
      const touched = market ? true : long ? c.low <= sig.entry : c.high >= sig.entry;
      if (touched) {
        filledAt = c.time;
        break;
      }
    }
    if (filledAt == null) {
      // Every candle of the window has closed without a fill once `now` is past the window end.
      if (now >= windowEnd + CANDLE_MS) return closeUnverified(now, "unfilled", "unfilled");
      return stillPending(now);
    }
  }

  // Walk candles from the fill candle (first pass) or from the last check (subsequent passes).
  const fillTime = filledAt;
  const resumeFrom = sig.fillStatus === "filled" && sig.lastCheckedAt != null ? Math.max(sig.lastCheckedAt, fillTime) : fillTime;
  const window = candles.filter((c) => c.time >= fillTime && c.time + CANDLE_MS > resumeFrom);
  let closed: Partial<SignalLog> | null = null;

  for (const c of window) {
    const fav = long ? c.high - sig.entry : sig.entry - c.low;
    const adv = long ? sig.entry - c.low : c.high - sig.entry;
    if (fav > maxFav) maxFav = fav;
    if (adv > maxAdv) maxAdv = adv;

    const hitSL = long ? c.low <= sig.stopLoss : c.high >= sig.stopLoss;
    if (hitSL) {
      if (tpHits.length === 0) {
        closed = { outcome: "stopped", outcomePrice: sig.stopLoss, outcomeTimestamp: c.time, stoppedAt: c.time, stoppedAfterTp: 0, closedReason: "stop_before_tp", realizedR: realizedR(sig, sig.stopLoss) };
      } else {
        const last = tpHits[tpHits.length - 1];
        closed = { outcome: `tp${last.level}` as SignalLog["outcome"], outcomePrice: last.price, outcomeTimestamp: c.time, stoppedAt: c.time, stoppedAfterTp: last.level, closedReason: "stop_after_tp", realizedR: realizedR(sig, last.price) };
      }
      break;
    }

    // A limit fill candle came from the far side of the entry, so its high/low cannot prove a TP touch
    // after the fill; targets count from the next candle. Market fills open at the entry, so they can.
    if (c.time === fillTime && !market) continue;

    let next = (tpHits.length + 1) as 1 | 2 | 3;
    while (next <= 3) {
      const lvl = tps[next - 1];
      const hit = long ? c.high >= lvl : c.low <= lvl;
      if (!hit) break;
      tpHits.push({ level: next, at: c.time, price: lvl });
      if (next === 3) {
        closed = { outcome: "tp3", outcomePrice: lvl, outcomeTimestamp: c.time, stoppedAt: null, stoppedAfterTp: null, closedReason: "tp3", realizedR: realizedR(sig, lvl) };
        break;
      }
      next = (next + 1) as 1 | 2 | 3;
    }
    if (closed) break;
  }

  const tp1 = tpHits.find((h) => h.level === 1) ?? null;
  const base: Partial<SignalLog> = {
    maxFavorable: maxFav,
    maxAdverse: maxAdv,
    mfeR: risk > 0 ? r4(maxFav / risk) : null,
    maeR: risk > 0 ? r4(maxAdv / risk) : null,
    tpHits,
    timeToTp1Min: tp1 ? Math.round((tp1.at - sig.timestamp) / 60e3) : null,
    lastCheckedAt: now,
    status: "open",
    fillStatus: "filled",
    filledAt: fillTime,
    outcome: tpHits.length ? (`tp${tpHits[tpHits.length - 1].level}` as SignalLog["outcome"]) : "pending",
  };

  if (closed) return { ...base, ...closed, status: "closed" };

  if (now - sig.timestamp > horizonFor(sig)) {
    // Horizon exit happens at the last traded close, whether or not a TP was reached earlier. Exiting
    // at the TP price would credit a touch the position never banked.
    const lastClose = window[window.length - 1]?.close ?? candles[candles.length - 1]?.close ?? null;
    const exitR = lastClose != null ? realizedR(sig, lastClose) : null;
    if (tpHits.length) {
      const last = tpHits[tpHits.length - 1];
      return { ...base, status: "closed", outcome: `tp${last.level}` as SignalLog["outcome"], outcomePrice: lastClose ?? last.price, outcomeTimestamp: now, closedReason: "horizon", stoppedAfterTp: null, realizedR: exitR ?? realizedR(sig, last.price) };
    }
    return { ...base, status: "closed", outcome: "expired", outcomePrice: lastClose, outcomeTimestamp: now, closedReason: "horizon", stoppedAfterTp: null, realizedR: exitR };
  }
  return base;
}

let legacyMigrated = false;
// One pass per process: legacy first-touch records with a resting limit entry are reset so the fill
// model re-runs them from the signal timestamp.
export function migrateLegacyRecords(): number {
  if (legacyMigrated) return 0;
  legacyMigrated = true;
  let reset = 0;
  for (const sig of getHistory()) {
    if (!needsLegacyReverify(sig)) continue;
    updateSignal(sig.id, legacyResetPatch(sig));
    reset++;
  }
  return reset;
}

export async function runOutcomeCheck(): Promise<{ checked: number; updated: number; legacyReset: number }> {
  const legacyReset = migrateLegacyRecords();
  const open = getHistory().filter(isOpen);
  if (open.length === 0) return { checked: 0, updated: 0, legacyReset };

  const now = Date.now();
  const bySymbol = new Map<string, SignalLog[]>();
  for (const s of open) {
    const arr = bySymbol.get(s.symbol) ?? [];
    arr.push(s);
    bySymbol.set(s.symbol, arr);
  }

  let updated = 0;
  await Promise.allSettled(
    [...bySymbol.entries()].map(async ([sym, sigs]) => {
      const strike = STRIKE_MAP[sym];
      if (!strike) return;
      // Unfilled signals walk from the signal timestamp every pass; filled ones resume at the last check.
      const oldest = Math.min(...sigs.map((s) => (s.fillStatus === "filled" ? (s.lastCheckedAt ?? s.timestamp) : s.timestamp)));
      const candles = await fetchCandles(strike, oldest);
      if (candles.length === 0) return;
      for (const sig of sigs) {
        const upd = evaluate(sig, candles, now);
        if (upd) {
          updateSignal(sig.id, upd);
          updated++;
        }
      }
    })
  );

  return { checked: open.length, updated, legacyReset };
}

export async function fetchMarks(symbols: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.allSettled(
    symbols.map(async (sym) => {
      const strike = STRIKE_MAP[sym];
      if (!strike) return;
      try {
        const r = await fetch(`https://api.strikefinance.org/price/v2/markPrice?symbol=${strike}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { p?: string };
        const p = parseFloat(j.p ?? "");
        if (Number.isFinite(p)) out[sym] = p;
      } catch {
        /* skip */
      }
    })
  );
  return out;
}
