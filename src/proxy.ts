import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The signal engine's public data moved to cloveup.com (token gated). The route modules stay because the
// in-process scheduler (instrumentation.ts) and project-clove's vendoring depend on them; over HTTP they are gone.
const GONE = { ok: false, error: "Signals moved to cloveup.com. Hold CLOVE, prove it, enter the Patch.", url: "https://www.cloveup.com/patch" };

export function proxy(req: NextRequest) {
  // One door stays open for the owner: the ledger export, only with the export token (set on Railway), so the
  // track record can be carried over to cloveup.com. Everything else on these paths is gone.
  const token = process.env.EXPORT_TOKEN;
  if (token && req.nextUrl.pathname === "/api/signals/history/backup" && req.headers.get("x-export-token") === token) {
    return NextResponse.next();
  }
  if (req.method === "GET" || req.method === "HEAD" || req.method === "POST") {
    return NextResponse.json(GONE, { status: 410, headers: { "Cache-Control": "public, max-age=3600" } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/signals/:path*", "/api/macro/:path*", "/api/prediction/:path*", "/api/calendar/:path*", "/api/news/:path*"],
};
