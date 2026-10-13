import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { findSignal } from "../logger";
import { auditRecord } from "../audit";

export const dynamic = "force-dynamic";

// Per-call audit (design F4.1): everything the engine knew at call time plus the resolution timeline.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = rateLimit(req, 60);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  const sig = findSignal(decodeURIComponent(id));
  if (!sig) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(auditRecord(sig), { headers: { "Cache-Control": "public, s-maxage=10" } });
}
