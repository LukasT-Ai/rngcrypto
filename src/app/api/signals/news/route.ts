import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getNewsSentiment } from "@/lib/news-sentiment";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 20);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? undefined;

  const data = await getNewsSentiment(symbol);

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=60" },
  });
}
