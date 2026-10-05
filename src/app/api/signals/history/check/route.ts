import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { runOutcomeCheck } from "./core";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = rateLimit(req, 10);
  if (blocked) return blocked;
  const result = await runOutcomeCheck();
  return NextResponse.json(result);
}
