import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { computeSignal } from "@/lib/signals/engine";

export const dynamic = "force-dynamic";

// Thin HTTP wrapper: the engine lives in src/lib/signals/engine.ts so the hot scanner, the scheduled logger
// and backtests call it in-process instead of over HTTP loopback.
export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 90);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? "BTC";
  const result = await computeSignal(symbol, { log: searchParams.get("log") !== "0" });

  if (result.status !== 200) {
    return NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(result.body, {
    headers: { "X-Cache": result.cached ? "HIT" : "MISS", "Cache-Control": "public, s-maxage=25" },
  });
}
