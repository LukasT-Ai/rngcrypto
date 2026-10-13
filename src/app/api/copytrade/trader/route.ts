import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { isAddress } from "@/lib/hyperliquid/http";
import { getTraderDetail } from "@/lib/hyperliquid/trader";
import { ASSETS, isAssetGroup } from "@/lib/hyperliquid/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 60);
  if (blocked) return blocked;

  const sp = req.nextUrl.searchParams;
  const address = sp.get("address")?.trim() ?? "";
  if (!isAddress(address)) return NextResponse.json({ error: "address must be a 0x-prefixed 40-hex-digit address" }, { status: 400 });
  const assetRaw = (sp.get("asset") ?? "ALL").toUpperCase();
  if (assetRaw !== "ALL" && !isAssetGroup(assetRaw)) return NextResponse.json({ error: `asset must be one of ${[...ASSETS, "ALL"].join(", ")}` }, { status: 400 });

  const detail = await getTraderDetail(address.toLowerCase(), assetRaw as "ALL" | (typeof ASSETS)[number]);
  if (!detail) return NextResponse.json({ error: "Hyperliquid upstream unavailable" }, { status: 503, headers: { "Retry-After": "30" } });
  return NextResponse.json(detail, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
}
