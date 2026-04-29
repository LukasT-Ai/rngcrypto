import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const SYNC_TOKEN = process.env.ASCEND_SYNC_TOKEN;
const CACHE_PATH = path.join(process.cwd(), "data", "stats-cache.json");
const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB
const MIN_INTERVAL_MS = 30_000; // 30s minimum between pushes

let lastPushAt = 0;

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

  const now = Date.now();
  if (now - lastPushAt < MIN_INTERVAL_MS) {
    return NextResponse.json(
      { error: "Rate limited", retryAfter: Math.ceil((MIN_INTERVAL_MS - (now - lastPushAt)) / 1000) },
      { status: 429 }
    );
  }

  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_PAYLOAD_SIZE) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  try {
    const payload = await req.json();
    payload._pushedAt = now;
    lastPushAt = now;
    fs.writeFileSync(CACHE_PATH, JSON.stringify(payload), "utf-8");
    return NextResponse.json({ ok: true, timestamp: now });
  } catch (err) {
    console.error("[sync-stats]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bad payload" },
      { status: 400 }
    );
  }
}
