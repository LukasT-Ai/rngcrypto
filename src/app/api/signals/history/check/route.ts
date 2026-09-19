import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getHistory, updateSignal, type SignalLog } from "../logger";

export const dynamic = "force-dynamic";

const EXPIRY_MS = 24 * 60 * 60 * 1000;

async function fetchPrice(symbol: string): Promise<number | null> {
  const SYMBOL_MAP: Record<string, string> = {
    BTC: "BTC-USD", ETH: "ETH-USD", BNB: "BNB-USD", ADA: "ADA-USD",
    HYPE: "HYPE-USD", ZEC: "ZEC-USD", PUMP: "PUMP-USD", NIGHT: "NIGHT-USD",
    SKHYNIX: "SKHYNIX-USD", GOLD: "XAU-USD", XRP: "XRP-USD", SOL: "SOL-USD",
    NEAR: "NEAR-USD", OIL: "WTI-USD", SILVER: "XAG-USD", TSLA: "TSLA-USD",
    NVDA: "NVDA-USD", GOOGL: "GOOGL-USD", COIN: "COIN-USD", MU: "MU-USD",
  };
  const strike = SYMBOL_MAP[symbol];
  if (!strike) return null;
  try {
    const res = await fetch(
      `https://api.strikefinance.org/price/v2/markPrice?symbol=${strike}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return parseFloat(data.p);
  } catch {
    return null;
  }
}

function checkOutcome(sig: SignalLog, price: number): Partial<SignalLog> | null {
  if (sig.outcome !== "pending") return null;

  const now = Date.now();
  if (now - sig.timestamp > EXPIRY_MS) {
    return { outcome: "expired", outcomePrice: price, outcomeTimestamp: now };
  }

  const maxFav = sig.maxFavorable ?? 0;
  const maxAdv = sig.maxAdverse ?? 0;

  if (sig.bias === "LONG") {
    const newMaxFav = Math.max(maxFav, price - sig.entry);
    const newMaxAdv = Math.max(maxAdv, sig.entry - price);

    if (price >= sig.tp3) {
      return { outcome: "tp3", outcomePrice: price, outcomeTimestamp: now, maxFavorable: newMaxFav, maxAdverse: newMaxAdv };
    }
    if (price >= sig.tp2) {
      return { outcome: "tp2", outcomePrice: price, outcomeTimestamp: now, maxFavorable: newMaxFav, maxAdverse: newMaxAdv };
    }
    if (price >= sig.tp1) {
      return { outcome: "tp1", outcomePrice: price, outcomeTimestamp: now, maxFavorable: newMaxFav, maxAdverse: newMaxAdv };
    }
    if (price <= sig.stopLoss) {
      return { outcome: "stopped", outcomePrice: price, outcomeTimestamp: now, maxFavorable: newMaxFav, maxAdverse: newMaxAdv };
    }
    return { maxFavorable: newMaxFav, maxAdverse: newMaxAdv };
  } else {
    const newMaxFav = Math.max(maxFav, sig.entry - price);
    const newMaxAdv = Math.max(maxAdv, price - sig.entry);

    if (price <= sig.tp3) {
      return { outcome: "tp3", outcomePrice: price, outcomeTimestamp: now, maxFavorable: newMaxFav, maxAdverse: newMaxAdv };
    }
    if (price <= sig.tp2) {
      return { outcome: "tp2", outcomePrice: price, outcomeTimestamp: now, maxFavorable: newMaxFav, maxAdverse: newMaxAdv };
    }
    if (price <= sig.tp1) {
      return { outcome: "tp1", outcomePrice: price, outcomeTimestamp: now, maxFavorable: newMaxFav, maxAdverse: newMaxAdv };
    }
    if (price >= sig.stopLoss) {
      return { outcome: "stopped", outcomePrice: price, outcomeTimestamp: now, maxFavorable: newMaxFav, maxAdverse: newMaxAdv };
    }
    return { maxFavorable: newMaxFav, maxAdverse: newMaxAdv };
  }
}

export async function POST(req: NextRequest) {
  const blocked = rateLimit(req, 10);
  if (blocked) return blocked;

  const signals = getHistory();
  const pending = signals.filter((s) => s.outcome === "pending");
  if (pending.length === 0) {
    return NextResponse.json({ checked: 0, updated: 0 });
  }

  const symbols = [...new Set(pending.map((s) => s.symbol))];
  const prices = new Map<string, number>();

  await Promise.allSettled(
    symbols.map(async (sym) => {
      const p = await fetchPrice(sym);
      if (p != null) prices.set(sym, p);
    })
  );

  let updated = 0;
  for (const sig of pending) {
    const price = prices.get(sig.symbol);
    if (price == null) continue;
    const updates = checkOutcome(sig, price);
    if (updates) {
      updateSignal(sig.id, updates);
      updated++;
    }
  }

  return NextResponse.json({ checked: pending.length, updated });
}
