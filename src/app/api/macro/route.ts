import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getMacroState, MACRO_WEIGHTS } from "@/lib/macro/service";
import { filterAlerts, type AlertFilter } from "@/lib/macro/alerts";
import type { MacroAsset } from "@/lib/macro/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 60);
  if (blocked) return blocked;

  const sp = req.nextUrl.searchParams;
  const assetParam = sp.get("asset");
  const asset: MacroAsset | null = assetParam === "BTC" || assetParam === "GOLD" || assetParam === "WTI" ? assetParam : null;
  const state = await getMacroState(asset);

  const f: AlertFilter = {};
  const assets = sp.get("assets");
  if (assets) f.assets = assets.split(",").filter((a): a is MacroAsset => ["BTC", "GOLD", "WTI"].includes(a));
  const kinds = sp.get("kinds");
  if (kinds) f.kinds = kinds.split(",") as AlertFilter["kinds"];
  const minImp = sp.get("minImportance");
  if (minImp) f.minImportance = minImp as AlertFilter["minImportance"];
  const dirs = sp.get("directions");
  if (dirs) f.directions = dirs.split(",") as AlertFilter["directions"];
  const minConf = sp.get("minConfidence");
  if (minConf) f.minConfidence = minConf as AlertFilter["minConfidence"];

  const body = {
    ...state,
    alerts: filterAlerts(state.alerts, f),
    weights: MACRO_WEIGHTS,
    serverTime: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store", "X-Data-Age-Ms": String(state.market.dataAgeMs ?? "") },
  });
}
