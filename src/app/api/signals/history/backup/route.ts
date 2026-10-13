import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getHistory, replaceHistory, type SignalLog } from "../logger";
import { computeStats } from "../performance";

export const dynamic = "force-dynamic";

// Restoring history rewrites the public track record, so it needs the operator token. With no token
// configured the endpoint is closed, never open.
const RESTORE_TOKEN = process.env.HISTORY_RESTORE_TOKEN;

export async function GET(req: NextRequest) {
  const blocked = rateLimit(req, 5);
  if (blocked) return blocked;

  const signals = getHistory();
  const stats = computeStats(signals);

  return NextResponse.json(
    { signals, stats, exportedAt: Date.now() },
    {
      headers: {
        "Content-Disposition": "attachment; filename=signal-history.json",
        "Cache-Control": "no-store",
      },
    }
  );
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
