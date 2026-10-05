import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getHistory, computeStats } from "./logger";
import { computePerformance } from "./performance";
import { fetchMarks } from "./check/core";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 20);
  if (blocked) return blocked;

  const sp = req.nextUrl.searchParams;
  const signals = getHistory();

  if (sp.get("view") === "performance") {
    const rangeRaw = sp.get("range") ?? "30d";
    const rangeDays = rangeRaw === "all" ? null : parseInt(rangeRaw, 10) || 30;
    const assets = sp.get("asset")?.split(",").filter(Boolean) ?? null;
    const grades = sp.get("grade")?.split(",").filter(Boolean) ?? null;
    const biasRaw = sp.get("bias");
    const bias = biasRaw === "LONG" || biasRaw === "SHORT" ? biasRaw : null;
    const dedupe = sp.get("dedupe") !== "0";
    const limit = Math.min(1000, parseInt(sp.get("limit") ?? "500", 10) || 500);

    const perf = computePerformance(signals, { rangeDays, assets, grades, bias, dedupe, limit });

    // Live distance-to-TP1 / distance-to-SL for open signals, in R.
    const marks = await fetchMarks([...new Set(perf.open.map((s) => s.symbol))]);
    const open = perf.open.map((s) => {
      const mark = marks[s.symbol] ?? null;
      const risk = Math.abs(s.entry - s.stopLoss);
      const dir = s.bias === "LONG" ? 1 : -1;
      const nextTp = s.highestTp >= 2 ? s.tp3 : s.highestTp === 1 ? s.tp2 : s.tp1;
      return {
        ...s,
        markPrice: mark,
        unrealizedR: mark != null && risk > 0 ? Math.round((((mark - s.entry) * dir) / risk) * 100) / 100 : null,
        distToNextTpR: mark != null && risk > 0 ? Math.round((((nextTp - mark) * dir) / risk) * 100) / 100 : null,
        distToSlR: mark != null && risk > 0 ? Math.round((((mark - s.stopLoss) * dir) / risk) * 100) / 100 : null,
        ageMin: Math.round((Date.now() - s.timestamp) / 60e3),
      };
    });

    return NextResponse.json(
      { signals: perf.signals, open, stats: perf.stats, meta: { ...perf.stats.meta, closedN: perf.stats.kpis.closedN, openN: open.length } },
      { headers: { "Cache-Control": "public, s-maxage=10" } }
    );
  }

  const recent = signals.slice(0, 100);
  const stats = computeStats(signals);
  return NextResponse.json({ signals: recent, stats }, { headers: { "Cache-Control": "public, s-maxage=10" } });
}
