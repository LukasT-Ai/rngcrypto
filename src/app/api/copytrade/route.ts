import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getScanStatus, queryRows, querySummary, SORT_KEYS, type RowQuery, type SortKey } from "@/lib/hyperliquid/scanner";
import { COPYABLE_FOCUS_DEFAULT } from "@/lib/hyperliquid/score";
import { ASSETS, WINDOWS, isAssetGroup, type CopyTradeResponse, type CopyTradeSummary, type Window } from "@/lib/hyperliquid/types";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 200;
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" };

export function parseQuery(sp: URLSearchParams): (RowQuery & { view: "rows" | "summary" }) | { error: string } {
  const view = (sp.get("view") ?? "rows").toLowerCase();
  if (view !== "rows" && view !== "summary") return { error: "view must be rows or summary" };
  const assetRaw = (sp.get("asset") ?? "BTC").toUpperCase();
  if (assetRaw !== "ALL" && !isAssetGroup(assetRaw)) return { error: `asset must be one of ${[...ASSETS, "ALL"].join(", ")}` };
  const asset = assetRaw as RowQuery["asset"];
  const window = (sp.get("window") ?? "month") as Window;
  if (!WINDOWS.includes(window)) return { error: `window must be one of ${WINDOWS.join(", ")}` };
  const sort = (sp.get("sort") ?? "copyability") as SortKey;
  if (!SORT_KEYS.includes(sort)) return { error: `sort must be one of ${SORT_KEYS.join(", ")}` };
  const minVolume = Number(sp.get("minVolume") ?? 0);
  if (!Number.isFinite(minVolume) || minVolume < 0) return { error: "minVolume must be a non-negative number" };
  const limitRaw = Number(sp.get("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limitRaw))) : 50;
  const copyableOnly = ["1", "true", "yes"].includes((sp.get("copyableOnly") ?? "").toLowerCase());
  const minFocusRaw = sp.get("minFocus");
  let minFocus = copyableOnly ? COPYABLE_FOCUS_DEFAULT : 0;
  if (minFocusRaw != null && minFocusRaw !== "") {
    const n = Number(minFocusRaw);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { error: "minFocus must be a percentage 0..100" };
    minFocus = n;
  }
  return { view, asset, window, sort, minVolume, limit, minFocus };
}

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 60);
  if (blocked) return blocked;

  const q = parseQuery(req.nextUrl.searchParams);
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 400 });

  if (q.view === "summary") {
    const body: CopyTradeSummary = { asOf: Date.now(), scan: getScanStatus(), assets: [...ASSETS], top: querySummary(q.window) };
    return NextResponse.json(body, { headers: CACHE_HEADERS });
  }
  const body: CopyTradeResponse = { asOf: Date.now(), scan: getScanStatus(), assets: [...ASSETS], traders: queryRows(q) };
  return NextResponse.json(body, { headers: CACHE_HEADERS });
}
