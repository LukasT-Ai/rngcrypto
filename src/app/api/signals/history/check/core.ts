import { getHistory, updateSignal, type SignalLog } from "../logger";

const STRIKE_MAP: Record<string, string> = {
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
const HORIZON_MS: Record<string, number> = {
  SCALP: 4 * HOUR,
  SWING: 48 * HOUR,
  POSITION: 168 * HOUR,
  ULTIMATE: 168 * HOUR,
};
const DEFAULT_HORIZON = 24 * HOUR;
const CANDLE_MS = 5 * 60e3;

interface Candle {
  time: number;
  high: number;
  low: number;
  close: number;
}

function horizonFor(sig: SignalLog): number {
  const t = sig.context?.tradeType?.toUpperCase() ?? "";
  return HORIZON_MS[t] ?? DEFAULT_HORIZON;
}

async function fetchCandles(strike: string, sinceMs: number): Promise<Candle[]> {
  const needed = Math.ceil((Date.now() - sinceMs) / CANDLE_MS) + 2;
  const limit = Math.max(3, Math.min(500, needed));
  try {
    const res = await fetch(
      `https://api.strikefinance.org/price/v2/klines?symbol=${strike}&interval=5m&limit=${limit}&priceType=last`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((k: unknown[]) => {
        const t = Number(k[0]);
        return {
          time: t < 1e12 ? t * 1000 : t,
          high: parseFloat(String(k[2])),
          low: parseFloat(String(k[3])),
          close: parseFloat(String(k[4])),
        };
      })
      .filter((c) => Number.isFinite(c.high) && Number.isFinite(c.low) && c.high > 0)
      .sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

// Walk 5m candles since the last check. SL before any TP = stopped; otherwise the
// highest TP touched wins. Both touched inside one candle resolves conservatively.
function evaluate(sig: SignalLog, candles: Candle[], now: number): Partial<SignalLog> | null {
  if (sig.outcome !== "pending") return null;
  const start = sig.lastCheckedAt ?? sig.timestamp;
  const window = candles.filter((c) => c.time + CANDLE_MS > start);
  const long = sig.bias === "LONG";

  let maxFav = sig.maxFavorable ?? 0;
  let maxAdv = sig.maxAdverse ?? 0;
  let best: 0 | 1 | 2 | 3 = 0;
  let stoppedAt: number | null = null;

  for (const c of window) {
    const fav = long ? c.high - sig.entry : sig.entry - c.low;
    const adv = long ? sig.entry - c.low : c.low > 0 ? c.high - sig.entry : 0;
    if (fav > maxFav) maxFav = fav;
    if (adv > maxAdv) maxAdv = adv;

    const hitSL = long ? c.low <= sig.stopLoss : c.high >= sig.stopLoss;
    const hitTP1 = long ? c.high >= sig.tp1 : c.low <= sig.tp1;
    const hitTP2 = long ? c.high >= sig.tp2 : c.low <= sig.tp2;
    const hitTP3 = long ? c.high >= sig.tp3 : c.low <= sig.tp3;

    if (best === 0 && hitSL) {
      stoppedAt = c.time;
      break;
    }
    if (hitTP3) best = 3;
    else if (hitTP2 && best < 2) best = 2;
    else if (hitTP1 && best < 1) best = 1;
  }

  const base = { maxFavorable: maxFav, maxAdverse: maxAdv, lastCheckedAt: now };

  if (stoppedAt != null) {
    return { ...base, outcome: "stopped", outcomePrice: sig.stopLoss, outcomeTimestamp: stoppedAt };
  }
  if (best > 0) {
    const price = best === 3 ? sig.tp3 : best === 2 ? sig.tp2 : sig.tp1;
    return { ...base, outcome: best === 3 ? "tp3" : best === 2 ? "tp2" : "tp1", outcomePrice: price, outcomeTimestamp: now };
  }
  if (now - sig.timestamp > horizonFor(sig)) {
    const last = window[window.length - 1]?.close ?? candles[candles.length - 1]?.close ?? null;
    return { ...base, outcome: "expired", outcomePrice: last, outcomeTimestamp: now };
  }
  return base;
}

export async function runOutcomeCheck(): Promise<{ checked: number; updated: number }> {
  const pending = getHistory().filter((s) => s.outcome === "pending");
  if (pending.length === 0) return { checked: 0, updated: 0 };

  const now = Date.now();
  const bySymbol = new Map<string, SignalLog[]>();
  for (const s of pending) {
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

  return { checked: pending.length, updated };
}
