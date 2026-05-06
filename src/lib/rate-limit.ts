import { NextRequest, NextResponse } from "next/server";

const ipHits = new Map<string, number[]>();
const CLEANUP_INTERVAL = 60_000;

setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [ip, hits] of ipHits) {
    const filtered = hits.filter((t) => t > cutoff);
    if (filtered.length === 0) ipHits.delete(ip);
    else ipHits.set(ip, filtered);
  }
}, CLEANUP_INTERVAL);

export function rateLimit(
  req: NextRequest,
  maxPerMinute = 60
): NextResponse | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const now = Date.now();
  const cutoff = now - 60_000;
  const hits = (ipHits.get(ip) ?? []).filter((t) => t > cutoff);
  hits.push(now);
  ipHits.set(ip, hits);

  if (hits.length > maxPerMinute) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": String(maxPerMinute),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  return null;
}
