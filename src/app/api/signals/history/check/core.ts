import { applyUpdates, getHistory, type CoverageGap, type SignalLog, type TpHit } from "../logger";

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

export function horizonFor(sig: SignalLog): number {
  // PR 15: the engine's own horizon (12/36/96h by dominant timeframe when the knob is on, 24h otherwise) wins when
  // the record carries it; older records keep the tradeType mapping.
  const hm = sig.context?.inputs?.horizonMin;
  if (typeof hm === "number" && Number.isFinite(hm) && hm > 0) return hm * 60e3;
  const t = sig.context?.tradeType?.toUpperCase() ?? "";
  return HORIZON_MS[t] ?? DEFAULT_HORIZON;
}

/** PR 15 breakeven rule: read from the tuning logged with the record so each record follows the rules it was issued under. */
export function breakevenAfterTp1For(sig: SignalLog): boolean {
  const t = sig.context?.inputs?.tuning as Record<string, unknown> | undefined;
  return t?.breakevenAfterTp1 === true;
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

// ── Cost model (perf audit 1.3) ──────────────────────────────────────────────
// Fees and slippage in basis points of notional per leg; funding charged over the hold. Fee figures verified
// 2026-10-13 against the venue docs: Strike (docs.strikefinance.org/perpetuals/trading-fees) taker 5 bp at
// tier 0 (2.8 bp at $200M+ 30d volume), maker rebate -0.5 bp, fees on filled notional, funding hourly at one
// eighth of the 8h rate (capped +/-4% per 8h); Hyperliquid base tier taker 4.5 bp, maker 1.5 bp. Slippage is
// an assumption (3 bp per market leg), not a venue figure. A market-in, market-out Strike signal therefore
// pays 10 bp before slippage and funding.
export interface CostVenue {
  venue: string;
  takerBps: number;
  makerBps: number;
  slipBps: number;
  fundingIntervalHours: number;
  fundingApplied: boolean;
}
export const COST_MODEL: Record<"HYPERLIQUID" | "STRIKE", CostVenue> = {
  HYPERLIQUID: { venue: "Hyperliquid", takerBps: 4.5, makerBps: 1.5, slipBps: 3, fundingIntervalHours: 1, fundingApplied: true },
  STRIKE: { venue: "Strike", takerBps: 5, makerBps: -0.5, slipBps: 3, fundingIntervalHours: 1, fundingApplied: true },
};
export function activeCostVenue(): CostVenue {
  const key = (process.env.COST_VENUE ?? "STRIKE").toUpperCase();
  return key === "HYPERLIQUID" ? COST_MODEL.HYPERLIQUID : COST_MODEL.STRIKE;
}

export interface CostBreakdown {
  costR: number;
  feeR: number;
  slipR: number;
  fundingR: number;
}

// Round-trip cost in R. Entry leg: market = taker + slippage, limit = maker (resting, no slippage; a negative
// maker figure is a rebate and reduces the cost). Exit leg:
// always taker + slippage (stops and horizon exits are market orders; a TP exit is charged the same so the
// model never flatters a touch). Funding: `fundingRate8h` is a fraction per 8h (the engine's unit); longs pay
// when it is positive, shorts collect. Everything is expressed per unit of notional and divided by the risk.
export function costInR(p: {
  bias: "LONG" | "SHORT";
  fillPrice: number;
  stopLoss: number;
  entryType: "market" | "limit";
  holdHours: number;
  fundingRate8h: number | null;
  venue?: CostVenue;
}): CostBreakdown | null {
  const v = p.venue ?? activeCostVenue();
  const risk = Math.abs(p.fillPrice - p.stopLoss);
  if (!(risk > 0) || !(p.fillPrice > 0)) return null;
  const perR = p.fillPrice / risk; // 1.0 of notional expressed in R
  const entryFee = p.entryType === "market" ? v.takerBps : v.makerBps;
  const entrySlip = p.entryType === "market" ? v.slipBps : 0;
  const feeR = ((entryFee + v.takerBps) / 1e4) * perR;
  const slipR = ((entrySlip + v.slipBps) / 1e4) * perR;
  let fundingR = 0;
  if (v.fundingApplied && p.fundingRate8h != null && Number.isFinite(p.fundingRate8h) && p.holdHours > 0) {
    const paid = p.fundingRate8h * (p.holdHours / 8) * (p.bias === "LONG" ? 1 : -1);
    fundingR = paid * perR;
  }
  return { costR: r4(feeR + slipR + fundingR), feeR: r4(feeR), slipR: r4(slipR), fundingR: r4(fundingR) };
}

// Realized R convention: exit at the last TP reached (stop after TP or TP3), at the stop if no TP was reached,
// or at the last close when the horizon runs out. Gross: fills at the exact touch (limit) or the next candle
// open (market); fees, slippage and funding are applied separately by costInR().
// Risk is measured from the fill price; if a gap opened through the stop (risk <= 0) the signal entry is used.
export function realizedR(sig: SignalLog, exitPrice: number, fillPrice: number = sig.entry): number | null {
  const base = Math.abs(fillPrice - sig.stopLoss) > 0 ? fillPrice : sig.entry;
  const risk = Math.abs(base - sig.stopLoss);
  if (risk <= 0) return null;
  const move = sig.bias === "LONG" ? exitPrice - base : base - exitPrice;
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
  // Fill price: market orders fill at the next candle OPEN (not the decision price); limit orders at the entry.
  // Records filled before the cost model carry no fillPrice and keep the entry (their old convention).
  let fillPrice: number = sig.fillStatus === "filled" ? (sig.fillPrice ?? sig.entry) : sig.entry;
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
        fillPrice = market && c.open > 0 ? c.open : sig.entry;
        break;
      }
    }
    if (filledAt == null) {
      // Every candle of the window has closed without a fill once `now` is past the window end.
      if (now >= windowEnd + CANDLE_MS) return closeUnverified(now, "unfilled", "unfilled");
      return stillPending(now);
    }
  }

  // Risk from the fill price (falls back to the entry if a gap opened through the stop).
  const fillRisk = Math.abs(fillPrice - sig.stopLoss) > 0 ? Math.abs(fillPrice - sig.stopLoss) : risk;
  const grossR = (exit: number) => realizedR(sig, exit, fillPrice);

  // Walk candles from the fill candle (first pass) or from the last check (subsequent passes).
  const fillTime = filledAt;
  const resumeFrom = sig.fillStatus === "filled" && sig.lastCheckedAt != null ? Math.max(sig.lastCheckedAt, fillTime) : fillTime;
  // Candles that open after the horizon can never count: a TP or stop touched there is a trade the
  // position was no longer in. Late evaluations (restarts, backlog) used to credit them.
  const horizonEnd = sig.timestamp + horizonFor(sig);
  const window = candles.filter((c) => c.time >= fillTime && c.time + CANDLE_MS > resumeFrom && c.time < horizonEnd);
  let closed: Partial<SignalLog> | null = null;

  // Coverage gap (perf audit 5.5): on resume the first fetchable candle opens after the point we stopped at,
  // so a stop or TP inside the span could not be seen. The record keeps running on the candles we have, but
  // the gap is recorded so the audit view and the open-signal card can say so. First gap wins.
  let coverageGap: CoverageGap | null = sig.coverageGap ?? null;
  const earliestFetched = candles[0]?.time ?? null;
  if (coverageGap == null && sig.fillStatus === "filled" && earliestFetched != null && resumeFrom < horizonEnd && earliestFetched > resumeFrom + CANDLE_MS) {
    coverageGap = { from: resumeFrom, to: Math.min(earliestFetched, horizonEnd), detectedAt: now };
  }

  const breakeven = breakevenAfterTp1For(sig);
  for (const c of window) {
    const fav = long ? c.high - fillPrice : fillPrice - c.low;
    const adv = long ? fillPrice - c.low : c.high - fillPrice;
    if (fav > maxFav) maxFav = fav;
    if (adv > maxAdv) maxAdv = adv;

    // Breakeven after TP1 (PR 15): once TP1 has printed the stop sits at the fill price, and a touch exits there
    // (0R gross) instead of crediting the last TP. Off: the original stop and the last-TP convention.
    const activeStop = breakeven && tpHits.length > 0 ? fillPrice : sig.stopLoss;
    const hitSL = long ? c.low <= activeStop : c.high >= activeStop;
    if (hitSL) {
      if (tpHits.length === 0) {
        closed = { outcome: "stopped", outcomePrice: sig.stopLoss, outcomeTimestamp: c.time, stoppedAt: c.time, stoppedAfterTp: 0, closedReason: "stop_before_tp", realizedR: grossR(sig.stopLoss) };
      } else {
        const last = tpHits[tpHits.length - 1];
        const exitPrice = breakeven ? fillPrice : last.price;
        closed = { outcome: `tp${last.level}` as SignalLog["outcome"], outcomePrice: exitPrice, outcomeTimestamp: c.time, stoppedAt: c.time, stoppedAfterTp: last.level, closedReason: "stop_after_tp", realizedR: grossR(exitPrice) };
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
        closed = { outcome: "tp3", outcomePrice: lvl, outcomeTimestamp: c.time, stoppedAt: null, stoppedAfterTp: null, closedReason: "tp3", realizedR: grossR(lvl) };
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
    mfeR: fillRisk > 0 ? r4(maxFav / fillRisk) : null,
    maeR: fillRisk > 0 ? r4(maxAdv / fillRisk) : null,
    tpHits,
    timeToTp1Min: tp1 ? Math.round((tp1.at - sig.timestamp) / 60e3) : null,
    lastCheckedAt: now,
    status: "open",
    fillStatus: "filled",
    filledAt: fillTime,
    fillPrice,
    outcome: tpHits.length ? (`tp${tpHits[tpHits.length - 1].level}` as SignalLog["outcome"]) : "pending",
    ...(coverageGap ? { coverageGap } : {}),
  };

  // Cost model applied once, at resolution: round-trip fees + slippage + funding over the hold, in R.
  const withCost = (patch: Partial<SignalLog>, closedAt: number): Partial<SignalLog> => {
    const gross = patch.realizedR ?? null;
    const cost = costInR({
      bias: sig.bias,
      fillPrice,
      stopLoss: sig.stopLoss,
      entryType: market ? "market" : "limit",
      holdHours: Math.max(0, (closedAt - fillTime) / HOUR),
      fundingRate8h: sig.context?.inputs?.fundingRate ?? null,
    });
    return { ...patch, costR: cost?.costR ?? null, realizedNetR: gross != null && cost ? r4(gross - cost.costR) : null };
  };

  if (closed) return { ...base, ...withCost(closed, closed.outcomeTimestamp ?? now), status: "closed" };

  if (now > horizonEnd) {
    // Horizon exit happens at the last traded close BEFORE the horizon, whether or not a TP was reached
    // earlier. Exiting at the TP price would credit a touch the position never banked.
    const lastClose = window[window.length - 1]?.close ?? candles.filter((c) => c.time < horizonEnd).at(-1)?.close ?? null;
    const exitR = lastClose != null ? grossR(lastClose) : null;
    if (tpHits.length) {
      const last = tpHits[tpHits.length - 1];
      return { ...base, status: "closed", ...withCost({ outcome: `tp${last.level}` as SignalLog["outcome"], outcomePrice: lastClose ?? last.price, outcomeTimestamp: now, closedReason: "horizon", stoppedAfterTp: null, realizedR: exitR ?? grossR(last.price) }, horizonEnd) };
    }
    return { ...base, status: "closed", ...withCost({ outcome: "expired", outcomePrice: lastClose, outcomeTimestamp: now, closedReason: "horizon", stoppedAfterTp: null, realizedR: exitR }, horizonEnd) };
  }
  return base;
}
let legacyMigrated = false;
// One pass per process: legacy first-touch records with a resting limit entry are reset so the fill
// model re-runs them from the signal timestamp.
export function migrateLegacyRecords(): number {
  if (legacyMigrated) return 0;
  legacyMigrated = true;
  const patches = new Map<string, Partial<SignalLog>>();
  for (const sig of getHistory()) {
    if (!needsLegacyReverify(sig)) continue;
    patches.set(sig.id, legacyResetPatch(sig));
  }
  return applyUpdates(patches);
}

export async function runOutcomeCheck(): Promise<{ checked: number; updated: number; legacyReset: number; writes: number }> {
  const legacyReset = migrateLegacyRecords();
  const open = getHistory().filter(isOpen);
  if (open.length === 0) return { checked: 0, updated: 0, legacyReset, writes: 0 };

  const now = Date.now();
  const bySymbol = new Map<string, SignalLog[]>();
  for (const s of open) {
    const arr = bySymbol.get(s.symbol) ?? [];
    arr.push(s);
    bySymbol.set(s.symbol, arr);
  }

  // Every evaluation lands in one map and the ledger is written once per pass (perf audit 5.3).
  const patches = new Map<string, Partial<SignalLog>>();
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
        if (upd) patches.set(sig.id, upd);
      }
    })
  );
  const updated = applyUpdates(patches);

  return { checked: open.length, updated, legacyReset, writes: updated > 0 ? 1 : 0 };
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
