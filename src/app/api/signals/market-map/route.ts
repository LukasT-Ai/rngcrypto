import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { buildMarketMap, type MarketMapResult } from "@/lib/market-map";

export const dynamic = "force-dynamic";

const SYMBOL_MAP: Record<string, { strike: string }> = {
  BTC: { strike: "BTC-USD" },
  ETH: { strike: "ETH-USD" },
  BNB: { strike: "BNB-USD" },
  ADA: { strike: "ADA-USD" },
  HYPE: { strike: "HYPE-USD" },
  ZEC: { strike: "ZEC-USD" },
  PUMP: { strike: "PUMP-USD" },
  NIGHT: { strike: "NIGHT-USD" },
  SKHYNIX: { strike: "SKHYNIX-USD" },
  GOLD: { strike: "XAU-USD" },
  XRP: { strike: "XRP-USD" },
  SOL: { strike: "SOL-USD" },
  NEAR: { strike: "NEAR-USD" },
  OIL: { strike: "WTI-USD" },
  SILVER: { strike: "XAG-USD" },
  TSLA: { strike: "TSLA-USD" },
  NVDA: { strike: "NVDA-USD" },
  GOOGL: { strike: "GOOGL-USD" },
  COIN: { strike: "COIN-USD" },
  MU: { strike: "MU-USD" },
  CRCL: { strike: "CRCL-USD" },
  MINIMAX: { strike: "MINIMAX-USD" },
  SPCX: { strike: "SPCX-USD" },
  DRAM: { strike: "DRAM-USD" },
  SP500: { strike: "SP500-USD" },
  NAS100: { strike: "NAS100-USD" },
  AAOI: { strike: "AAOI-USD" },
  SNDK: { strike: "SNDK-USD" },
  UNITREE: { strike: "UNITREE-USD" },
  ZHIPU: { strike: "ZHIPU-USD" },
  CXMT: { strike: "CXMT-USD" },
};

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const cache = new Map<string, { data: MarketMapResult; timestamp: number }>();
const CACHE_TTL = 120_000; // 2 minutes — daily data doesn't change fast

function parseKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((k: number[]) => ({
    time: k[0],
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
  }));
}

async function fetchJSON(url: string, timeoutMs = 10000): Promise<unknown> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 20);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") ?? "BTC").toUpperCase();

  const config = SYMBOL_MAP[symbol];
  if (!config) {
    return NextResponse.json({ error: "Unknown symbol" }, { status: 400 });
  }

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=120" },
    });
  }

  const STRIKE = "https://api.strikefinance.org/price";
  const s = config.strike;

  const [dailyRes, hourlyRes, fourHRes] = await Promise.allSettled([
    fetchJSON(`${STRIKE}/v2/klines?symbol=${s}&interval=1d&limit=190&priceType=last`),
    fetchJSON(`${STRIKE}/v2/klines?symbol=${s}&interval=1h&limit=100&priceType=last`),
    fetchJSON(`${STRIKE}/v2/klines?symbol=${s}&interval=4h&limit=100&priceType=last`),
  ]);

  const dailyCandles = parseKlines(dailyRes.status === "fulfilled" ? dailyRes.value : null);
  const candles1h = parseKlines(hourlyRes.status === "fulfilled" ? hourlyRes.value : null);
  const candles4h = parseKlines(fourHRes.status === "fulfilled" ? fourHRes.value : null);

  if (dailyCandles.length < 20) {
    return NextResponse.json({ error: "Insufficient data" }, { status: 503 });
  }

  const result = buildMarketMap(dailyCandles, candles1h, candles4h);

  cache.set(symbol, { data: result, timestamp: Date.now() });

  return NextResponse.json(result, {
    headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=120" },
  });
}
