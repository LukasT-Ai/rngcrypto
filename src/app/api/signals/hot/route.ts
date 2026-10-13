import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { computeSignal, getTuning } from "@/lib/signals/engine";

export const dynamic = "force-dynamic";

const SYMBOLS = [
  "BTC", "ETH", "BNB", "ADA", "HYPE",
  "ZEC", "PUMP", "NIGHT", "SKHYNIX", "GOLD",
  "XRP", "SOL", "NEAR", "OIL", "SILVER",
  "TSLA", "NVDA", "GOOGL", "COIN", "MU",
  "SP500", "NAS100", "CRCL", "MINIMAX", "SPCX",
  "DRAM", "AAOI", "SNDK", "UNITREE", "ZHIPU", "CXMT",
];

const TICKER_META: Record<string, { label: string; color: string }> = {
  BTC: { label: "Bitcoin", color: "#F7931A" },
  ETH: { label: "Ethereum", color: "#627EEA" },
  BNB: { label: "BNB", color: "#F3BA2F" },
  ADA: { label: "Cardano", color: "#0033AD" },
  HYPE: { label: "Hyperliquid", color: "#7BEBC2" },
  ZEC: { label: "Zcash", color: "#ECB244" },
  PUMP: { label: "PumpFun", color: "#FF6B6B" },
  NIGHT: { label: "Night", color: "#8B5CF6" },
  SKHYNIX: { label: "SK Hynix", color: "#E8622C" },
  GOLD: { label: "Gold", color: "#FFD700" },
  XRP: { label: "XRP", color: "#23292F" },
  SOL: { label: "Solana", color: "#9945FF" },
  NEAR: { label: "NEAR", color: "#00C08B" },
  OIL: { label: "WTI Oil", color: "#8B6914" },
  SILVER: { label: "Silver", color: "#C0C0C0" },
  TSLA: { label: "Tesla", color: "#CC0000" },
  NVDA: { label: "Nvidia", color: "#76B900" },
  GOOGL: { label: "Google", color: "#4285F4" },
  COIN: { label: "Coinbase", color: "#0052FF" },
  MU: { label: "Micron", color: "#1A1AFF" },
  SP500: { label: "S&P 500", color: "#E63946" },
  NAS100: { label: "Nasdaq 100", color: "#457B9D" },
  CRCL: { label: "Circle", color: "#00D395" },
  MINIMAX: { label: "MiniMax", color: "#FF8C42" },
  SPCX: { label: "SpaceX", color: "#005288" },
  DRAM: { label: "DRAM", color: "#0EA5E9" },
  AAOI: { label: "AAOI", color: "#DC2626" },
  SNDK: { label: "SanDisk", color: "#E11D48" },
  UNITREE: { label: "Unitree", color: "#059669" },
  ZHIPU: { label: "Zhipu AI", color: "#7C3AED" },
  CXMT: { label: "CXMT", color: "#0284C7" },
};

let hotCache: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 60_000;

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 40);
  if (blocked) return blocked;

  if (hotCache && Date.now() - hotCache.timestamp < CACHE_TTL) {
    return NextResponse.json(hotCache.data, {
      headers: { "X-Cache": "HIT", "Cache-Control": "public, s-maxage=60" },
    });
  }

  // Bounded concurrency: 31 simultaneous engine runs raced upstream rate limits
  const POOL = 4;
  const queue = [...SYMBOLS];
  const settled: PromiseSettledResult<Awaited<ReturnType<typeof scanOne>> | null>[] = [];

  async function scanOne(sym: string) {
    try {
      // Scanner runs never log; the 15-minute scheduler in instrumentation.ts owns history.
      const r = await computeSignal(sym, { log: false });
      if (r.status !== 200) return null;
      const data = r.body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      return {
        symbol: sym,
        label: TICKER_META[sym]?.label ?? sym,
        color: TICKER_META[sym]?.color ?? "#F59E0B",
        price: data.price?.mark ?? 0,
        change24h: data.price?.change24h ?? 0,
        bias: data.call?.bias ?? "WAIT",
        confidence: data.call?.confidence ?? 0,
        grade: data.call?.grade ?? "NO TRADE",
        entry: data.call?.entry ?? 0,
        stopLoss: data.call?.stopLoss ?? 0,
        tp1: data.call?.tp1 ?? 0,
        riskReward: data.call?.riskReward ?? 0,
        // Calibrated P(TP1) with its interval; null until the calibration gate (100 decided on this engine
        // version) opens. The board shows confidence with the "evidence" label until then.
        pTp1: typeof data.call?.pTp1 === "number" ? data.call.pTp1 : null,
        pTp1Ci: Array.isArray(data.call?.pTp1Ci) ? (data.call.pTp1Ci as [number, number]) : null,
        calibrationVersion: typeof data.call?.calibrationVersion === "string" ? data.call.calibrationVersion : null,
        regime: data.call?.regime ?? "unknown",
        reasoning: (data.call?.reasoning ?? []).slice(0, 3),
        volSpikeRatio: data.volume?.spikeRatio ?? null,
        volSpikeLabel: data.volume?.spikeLabel ?? null,
        entryType: data.entryType ?? null,
        // Cloud / 200MA / ADX regime (null-safe: pre-regime engine responses carry no block)
        regimeLabel: data.regime?.label ?? null,
        regimeScore: data.regime?.score ?? null,
        trendStrength: data.regime?.trendStrength ?? null,
        cloud1d: data.regime?.perTF?.["1d"]?.cloud ?? null,
        ma200Side1d: data.regime?.perTF?.["1d"]?.ma200Side ?? null,
        adx15m: data.regime?.perTF?.["15m"]?.adx ?? data.indicators?.adx ?? null,
      };
    } catch {
      return null;
    }
  }

  await Promise.all(
    Array.from({ length: POOL }, async () => {
      while (queue.length > 0) {
        const sym = queue.shift()!;
        try {
          settled.push({ status: "fulfilled", value: await scanOne(sym) });
        } catch (reason) {
          settled.push({ status: "rejected", reason });
        }
      }
    })
  );
  const results = settled;

  const all = results
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // "Hot" = every published call. The engine already gates on minPublishConfidence (60 after the Oct 2026 sweep);
  // a hard-coded 75 here left the board empty for days at a time.
  const minConf = getTuning().minPublishConfidence;
  const hot = all
    .filter((r) => r.confidence >= minConf && r.bias !== "WAIT")
    .sort((a, b) => b.confidence - a.confidence);

  const response = {
    timestamp: Date.now(),
    hot,
    all: all.sort((a, b) => b.confidence - a.confidence),
  };

  hotCache = { data: response, timestamp: Date.now() };

  return NextResponse.json(response, {
    headers: { "X-Cache": "MISS", "Cache-Control": "public, s-maxage=60" },
  });
}
