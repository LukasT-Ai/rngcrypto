import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getAllHistory, getHistory, historyPaths, replaceHistory, type SignalLog } from "../logger";
import { computeStats } from "../performance";
import { computeLedgerHash, ledgerCsv, readLedgerHash } from "../ledger";

export const dynamic = "force-dynamic";

// Restoring history rewrites the public track record, so it needs the operator token. With no token
// configured the endpoint is closed, never open.
const RESTORE_TOKEN = process.env.HISTORY_RESTORE_TOKEN;

function hashHeaders(): Record<string, string> {
  const h = readLedgerHash() ?? computeLedgerHash();
  return h ? { "X-Ledger-SHA256": h.sha256, "X-Ledger-Hashed-At": h.hashedAt, "X-Ledger-Count": String(h.count) } : {};
}

/**
 * GET ?format=json (default)  { signals, stats, exportedAt } — live + archive
 *     ?format=csv             flat CSV, one row per record
 *     ?format=raw             the live ledger file bytes verbatim (what X-Ledger-SHA256 hashes)
 *     ?format=hash            the daily hash record { sha256, hashedAt, date, count, bytes }
 * Every variant carries X-Ledger-SHA256 so the number on the page can be checked against the download.
 */
export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 5);
  if (blocked) return blocked;
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const headers = { ...hashHeaders(), "Cache-Control": "no-store" };

  if (format === "hash") {
    const h = readLedgerHash() ?? computeLedgerHash();
    return NextResponse.json(h ?? { error: "no ledger yet" }, { status: h ? 200 : 404, headers });
  }
  if (format === "raw") {
    try {
      const buf = readFileSync(historyPaths().live);
      return new NextResponse(new Uint8Array(buf), { headers: { ...headers, "Content-Type": "application/json", "Content-Disposition": "attachment; filename=signal-history.json" } });
    } catch {
      return NextResponse.json({ error: "no ledger yet" }, { status: 404, headers });
    }
  }
  const signals = getAllHistory();
  if (format === "csv") {
    return new NextResponse(ledgerCsv(signals), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=signal-history.csv" } });
  }
  const stats = computeStats(signals);
  return NextResponse.json({ signals, stats, exportedAt: Date.now() }, { headers: { ...headers, "Content-Disposition": "attachment; filename=signal-history-export.json" } });
}

export async function POST(req: NextRequest) {
  const blocked = rateLimit(req, 5);
  if (blocked) return blocked;
  const provided = req.headers.get("x-restore-token") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!RESTORE_TOKEN || provided !== RESTORE_TOKEN) {
    return NextResponse.json({ error: RESTORE_TOKEN ? "unauthorized" : "restore disabled: HISTORY_RESTORE_TOKEN not set" }, { status: RESTORE_TOKEN ? 401 : 503 });
  }

  try {
    const body = await req.json();
    const incoming = body.signals as SignalLog[];

    if (!Array.isArray(incoming)) {
      return NextResponse.json(
        { error: "Body must contain a signals array" },
        { status: 400 }
      );
    }

    const existing = getHistory();
    const existingIds = new Set(existing.map((s) => s.id));
    const merged = [...existing];

    for (const sig of incoming) {
      if (!sig.id || !sig.symbol || !sig.timestamp) continue;
      if (!existingIds.has(sig.id)) {
        merged.push(sig);
        existingIds.add(sig.id);
      }
    }

    merged.sort((a, b) => b.timestamp - a.timestamp);
    replaceHistory(merged);
    computeLedgerHash(true);

    return NextResponse.json({
      merged: merged.length,
      added: merged.length - existing.length,
      existing: existing.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }
}
