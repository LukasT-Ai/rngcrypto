import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The signal engine's public data moved to cloveup.com (token gated). The route modules stay because the
// in-process scheduler (instrumentation.ts) and project-clove's vendoring depend on them; over HTTP they are gone.
const GONE = { ok: false, error: "Signals moved to cloveup.com. Hold CLOVE, prove it, enter the Patch.", url: "https://cloveup.com/patch" };

export function proxy(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "POST") {
    return NextResponse.json(GONE, { status: 410, headers: { "Cache-Control": "public, max-age=3600" } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/signals/:path*", "/api/macro/:path*", "/api/prediction/:path*", "/api/calendar/:path*", "/api/news/:path*"],
};
