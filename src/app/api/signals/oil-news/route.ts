import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getOilGeopoliticalNews } from "@/lib/oil-geopolitical-news";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 40);
  if (blocked) return blocked;

  const data = await getOilGeopoliticalNews();

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=30" },
  });
}
