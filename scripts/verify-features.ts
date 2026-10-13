// Live check for the Phase 4 feature feeds: prints the `features` object the engine emits for a few symbols.
// Usage: npx tsx scripts/verify-features.ts [BTC GOLD OIL ETH]

import { computeSignal } from "@/lib/signals/engine";

async function main() {
  const symbols = process.argv.slice(2).length ? process.argv.slice(2) : ["BTC", "GOLD", "OIL"];
  for (const sym of symbols) {
    const t0 = Date.now();
    const r = await computeSignal(sym, { log: false });
    const body = r.body as { features?: unknown; error?: string };
    console.log(`\n=== ${sym} (status ${r.status}, ${Date.now() - t0} ms) ===`);
    if (r.status !== 200) {
      console.log(JSON.stringify(body, null, 2));
      continue;
    }
    console.log(JSON.stringify(body.features, null, 2));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
