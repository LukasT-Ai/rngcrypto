import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const SYNC_TOKEN = process.env.ASCEND_SYNC_TOKEN;
const CACHE_PATH = path.join(process.cwd(), "data", "stats-cache.json");

export async function POST(req: NextRequest) {
  if (!SYNC_TOKEN) {
    return NextResponse.json(
      { error: "Sync not configured" },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${SYNC_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await req.json();
    payload._pushedAt = Date.now();
    fs.writeFileSync(CACHE_PATH, JSON.stringify(payload), "utf-8");
    return NextResponse.json({ ok: true, timestamp: payload._pushedAt });
  } catch (err) {
    console.error("[sync-stats]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bad payload" },
      { status: 400 }
    );
  }
}
