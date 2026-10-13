/**
 * One-off copy-trade scan for live verification.
 *
 *   npx tsx scripts/copytrade-scan-once.ts [--take 40] [--pool 40] [--specialists 0] [--window month]
 *
 * Downloads the leaderboard (cached hourly under data/copytrade/), scans the top `take` candidates (30d fills +
 * clearinghouseState on main/xyz/km + portfolio, through the shared token bucket), probes the next `pool - take`
 * by month pnl plus the top `specialists` by month roi for copyable activity, and prints the per-asset wallet
 * counts, the top 10 per asset group (BTC, ADA, GOLD, WTI), the COPYABLE strip and the asset=ALL ranking. Writes the same files the background scanner writes, so a dev server started afterwards
 * serves this scan immediately.
 */
import { runScanCycle, queryRows, querySummary, getScanStatus, getScanDebug } from "../src/lib/hyperliquid/scanner";
import { hlBucket } from "../src/lib/hyperliquid/http";
import { DEFAULT_SPECIALISTS } from "../src/lib/hyperliquid/leaderboard";
import { ASSETS, type Window } from "../src/lib/hyperliquid/types";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const take = Number(arg("--take") ?? 40);
const pool = Number(arg("--pool") ?? take);
const specialists = Number(arg("--specialists") ?? 0);
const window = (arg("--window") ?? "month") as Window;

const usd = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(0));
const pct = (n: number | null) => (n == null ? "  -  " : `${(n * 100).toFixed(0).padStart(3)}%`);
const name = (a: string, d: string | null) => (d ? d.slice(0, 18) : `${a.slice(0, 6)}..${a.slice(-4)}`).padEnd(18);

async function main() {
  const t0 = Date.now();
  console.log(`scanning top ${take} candidates (bucket ${hlBucket.available().toFixed(0)} weight available)`);
  const res = await runScanCycle({
    take,
    poolSize: pool,
    specialists: specialists > 0 ? { ...DEFAULT_SPECIALISTS, take: specialists } : null,
    probeAll: true,
    onProgress: (done, total, address) => {
      if (done % 5 === 0 || done === total) console.log(`  ${done}/${total}  ${address}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    },
  });
  console.log(`scanned ${res.scanned}/${res.total} (failed ${res.failed}, probed ${res.probed}) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const status = getScanStatus();
  console.log("status", status);
  console.log("wallets per asset", status.perAsset, "pool", status.pool);
  console.log("info calls", getScanDebug().info);

  for (const asset of ASSETS) {
    const rows = queryRows({ asset, window, sort: "assetPnl", minVolume: 0, limit: 10, minFocus: 0 });
    console.log(`\n== top ${asset} traders by 30d realized pnl (${rows.length}) ==`);
    console.log("#  trader             equity    30d pnl   trades    vol      win   dir    focus score  open");
    for (const r of rows) {
      const a = r.asset!;
      const o = r.openForAsset;
      const open = o ? `${o.side} ${o.coin} ${usd(o.notionalUsd)} @${o.entryPx} ${o.leverage}x upnl ${usd(o.unrealizedPnl)}` : "-";
      console.log(`${String(r.rank).padStart(2)} ${name(r.address, r.displayName)} ${usd(r.equity).padStart(8)} ${usd(a.realizedPnl).padStart(9)} ${String(a.trades).padStart(6)} ${usd(a.volumeUsd).padStart(8)} ${pct(a.winRate)} ${(a.direction ?? "-").padEnd(6)} ${String(r.mix.copyableSharePct).padStart(5)} ${String(r.score.copyability).padStart(5)}${r.score.grade} ${open}`);
    }
  }
  const sum = querySummary(window);
  console.log(`\n== COPYABLE strip (focus >= 70, by copyability) ==`);
  for (const r of sum.COPYABLE) console.log(`${String(r.rank).padStart(2)} ${name(r.address, r.displayName)} score ${r.score.copyability} ${r.score.grade}  focus ${r.mix.copyableSharePct}%  pnlCopy ${usd(r.stats30d.pnlCopyable)}  tpd ${r.stats30d.tradesPerDay}  dd ${r.stats30d.maxDrawdownPct ?? "-"}%  | ${r.score.reasons.slice(0, 3).join("; ")}`);
  const all = queryRows({ asset: "ALL", window, sort: "assetPnl", minVolume: 0, limit: 10, minFocus: 0 });
  console.log(`\n== top 10 overall by ${window} pnl ==`);
  for (const r of all) console.log(`${String(r.rank).padStart(2)} ${name(r.address, r.displayName)} ${usd(r.equity).padStart(8)} pnl ${usd(r.window.pnl).padStart(9)} roi ${pct(r.window.roi)} open ${r.open.count} (${r.open.coins.slice(0, 5).join(",")}) focus ${r.mix.copyableSharePct}% score ${r.score.copyability}${r.score.grade}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
