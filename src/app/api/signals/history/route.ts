import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getHistory, computeStats } from "./logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 20);
  if (blocked) return blocked;

  const signals = getHistory();
  const recent = signals.slice(0, 100);
  const stats = computeStats(signals);

  return NextResponse.json(
    { signals: recent, stats },
    { headers: { "Cache-Control": "public, s-maxage=10" } }
  );
}
