/**
 * One-off check of the quarter-hour taker imbalance (PR 23) for one symbol.
 *
 *   npx tsx scripts/qh-imbalance-once.ts [--symbol BTC] [--live]
 *
 * Default: backfill the most recent completed boundary's opening minute from OKX /market/history-trades
 * (paged by tradeId) and run computeImbalance on it, without touching the store.
 * --live: wait for the next :00/:15/:30/:45 UTC boundary and run the real sampler (sampleQhWindow), which
 * polls /market/trades every 6s and writes the window to the data dir store.
 */
import { computeImbalance, qhBoundary, nextQhBoundary, sampleQhWindow, getQhImbalance, getQhSeries, QH_WINDOW_MS, okxContractValue, type OkxTrade } from "../src/lib/signals/features/qh-imbalance";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const symbol = (arg("--symbol") ?? "BTC").toUpperCase();
const instId = `${symbol}-USDT-SWAP`;
const live = process.argv.includes("--live");

async function okx<T>(path: string): Promise<T> {
  const r = await fetch(`https://www.okx.com${path}`, { cache: "no-store" });
  const j = (await r.json()) as { code: string; msg?: string; data: T };
  if (j.code !== "0") throw new Error(`okx ${j.code} ${j.msg ?? ""}`);
  return j.data;
}

async function backfill(start: number): Promise<OkxTrade[][]> {
  const end = start + QH_WINDOW_MS;
  const pages: OkxTrade[][] = [];
  // type=2 pages by timestamp: `after` returns records older than the given ms, so walk back from the window end.
  let after = String(end);
  for (let i = 0; i < 200; i++) {
    const page = await okx<OkxTrade[]>(`/api/v5/market/history-trades?instId=${instId}&limit=100&type=2&after=${after}`);
    if (!page.length) break;
    pages.push(page);
    const oldest = page[page.length - 1];
    if (Number(oldest.ts) < start) break;
    after = oldest.ts;
    await new Promise((r) => setTimeout(r, 120));
  }
  return pages;
}

async function main() {
  const ctVal = await okxContractValue(instId);
  if (!ctVal) throw new Error(`no ctVal for ${instId}`);
  console.log(`${instId} ctVal=${ctVal}`);

  if (live) {
    const start = nextQhBoundary();
    const wait = start + 1000 - Date.now();
    console.log(`waiting ${Math.round(wait / 1000)}s for boundary ${new Date(start).toISOString()}`);
    await new Promise((r) => setTimeout(r, Math.max(0, wait)));
    const t0 = Date.now();
    const w = await sampleQhWindow(symbol, instId, start);
    console.log(`sampled in ${Math.round((Date.now() - t0) / 1000)}s`, w);
    console.log("store:", getQhImbalance(symbol), getQhSeries(symbol, 4));
    return;
  }

  // Most recent boundary whose opening minute is complete.
  const now = Date.now();
  let start = qhBoundary(now);
  if (now < start + QH_WINDOW_MS + 5000) start -= 15 * 60_000;
  const end = start + QH_WINDOW_MS;
  console.log(`backfilling ${new Date(start).toISOString()} .. ${new Date(end).toISOString()}`);
  const pages = await backfill(start);
  const n = pages.reduce((s, p) => s + p.length, 0);
  console.log(`fetched ${pages.length} pages, ${n} trades, oldest ${pages.length ? new Date(Number(pages[pages.length - 1][pages[pages.length - 1].length - 1].ts)).toISOString() : "-"}`);
  const r = computeImbalance(pages, start, end, ctVal, { lastFetchedAt: now });
  console.log(`coverage note: pages walk back from the window end, so coverage < 1 means the 200-page cap was hit`);
  console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
