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
const CANDLE_MS = 5 * 60e3;

interface Candle {
  time: number;
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

async function fetchCandles(strike: string, sinceMs: number): Promise<Candle[]> {
  const needed = Math.ceil((Date.now() - sinceMs) / CANDLE_MS) + 2;
  const limit = Math.max(3, Math.min(500, needed));
  try {
    const res = await fetch(`https://api.strikefinance.org/price/v2/klines?symbol=${strike}&interval=5m&limit=${limit}&priceType=last`, { cache: "no-store" });
    if (!res.ok) return [];
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((k: unknown[]) => {
        const t = Number(k[0]);
        return { time: t < 1e12 ? t * 1000 : t, high: parseFloat(String(k[2])), low: parseFloat(String(k[3])), close: parseFloat(String(k[4])) };
      })
      .filter((c) => Number.isFinite(c.high) && Number.isFinite(c.low) && c.high > 0)
      .sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

// Realized R convention: exit at the last TP reached (stop after TP or TP3), at the stop if no TP was reached,
// or at the horizon close. Assumes fills at the exact touch on 5m candles; no slippage or fees.
export function realizedR(sig: SignalLog, exitPrice: number): number | null {
  const risk = Math.abs(sig.entry - sig.stopLoss);
  if (risk <= 0) return null;
  const move = sig.bias === "LONG" ? exitPrice - sig.entry : sig.entry - exitPrice;
  return r4(move / risk);
}

// Walk 5m candles since the last check and keep walking after TP1 so TP2/TP3 and a stop-after-TP are captured.
// Same-candle SL + TP resolves as the stop (conservative).
export function evaluate(sig: SignalLog, candles: Candle[], now: number): Partial<SignalLog> | null {
  if (!isOpen(sig)) return null;
  const start = sig.lastCheckedAt ?? sig.timestamp;
  const window = candles.filter((c) => c.time + CANDLE_MS > start);
  const long = sig.bias === "LONG";
  const risk = Math.abs(sig.entry - sig.stopLoss);
  const tps = [sig.tp1, sig.tp2, sig.tp3];

  let maxFav = sig.maxFavorable ?? 0;
  let maxAdv = sig.maxAdverse ?? 0;
  const tpHits: TpHit[] = [...(sig.tpHits ?? [])];
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
    outcome: tpHits.length ? (`tp${tpHits[tpHits.length - 1].level}` as SignalLog["outcome"]) : "pending",
  };

  if (closed) return { ...base, ...closed, status: "closed" };

  if (now - sig.timestamp > horizonFor(sig)) {
    const lastClose = window[window.length - 1]?.close ?? candles[candles.length - 1]?.close ?? null;
    if (tpHits.length) {
      const last = tpHits[tpHits.length - 1];
      return { ...base, status: "closed", outcome: `tp${last.level}` as SignalLog["outcome"], outcomePrice: last.price, outcomeTimestamp: now, closedReason: "horizon", stoppedAfterTp: null, realizedR: realizedR(sig, last.price) };
    }
    return { ...base, status: "closed", outcome: "expired", outcomePrice: lastClose, outcomeTimestamp: now, closedReason: "horizon", stoppedAfterTp: null, realizedR: lastClose != null ? realizedR(sig, lastClose) : null };
  }
  return base;
}

export async function runOutcomeCheck(): Promise<{ checked: number; updated: number }> {
  const open = getHistory().filter(isOpen);
  if (open.length === 0) return { checked: 0, updated: 0 };

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
      const oldest = Math.min(...sigs.map((s) => s.lastCheckedAt ?? s.timestamp));
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

  return { checked: open.length, updated };
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
