import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getPredictionState } from "@/lib/prediction/service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 60);
  if (blocked) return blocked;
  const state = await getPredictionState();
  return NextResponse.json({ ...state, serverTime: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
