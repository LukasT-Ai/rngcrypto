// Live check for CalendarRow v2: prints the market / fed / zAnchor fields for upcoming CPI, NFP, unemployment and
// FOMC rows on the BTC lens, plus the coupling and the event-gate inputs. Usage: npx tsx scripts/verify-calendar-v2.ts [BTC|GOLD|WTI]
import { getEventGateInputs, getMacroState } from "../src/lib/macro/service";
import type { MacroAsset } from "../src/lib/macro/types";

async function main() {
  const lens = (process.argv[2] as MacroAsset) || "BTC";
  const t0 = Date.now();
  const s = await getMacroState(lens);
  const ms = Date.now() - t0;
  console.log(`lens ${lens} · asOf ${s.asOf} · ${s.calendar.length} rows · ${ms}ms`);
  console.log("coupling:", s.macroCoupling);
  const interesting = s.calendar.filter((r) => /cpi|payroll|unemployment|fomc|federal funds/i.test(r.title) || r.market || r.fed);
  for (const r of interesting) {
    console.log(
      [
        r.time.slice(0, 16),
        r.title.padEnd(34),
        `imp=${r.importance}`,
        `rel=${r.lensRelevance}`,
        `live=${r.isLive}`,
        `actual=${r.actualRaw ?? "-"}`,
        `fc=${r.forecastRaw ?? "-"}`,
        `z=${r.zScore ?? "-"}@${r.zAnchor ?? "-"}`,
        `dir=${r.assetDirection ?? "-"}/${r.assetDirectionBasis ?? "-"}`,
        `gate=${r.firstMoveGate ?? "-"}`,
        r.market ? `market={mean ${r.market.mean}, sd ${r.market.sd}, skew ${r.market.tailSkew}, ${r.market.venue}, $${Math.round((r.market.volumeUsd ?? 0) / 1000)}k${r.market.shrunk ? ", shrunk" : ""}}` : "market=null",
        r.fed ? `fed={E ${r.fed.expectedChangeBp}bp, sd ${r.fed.surpriseSdBp}bp, ${r.fed.modalLabel} ${r.fed.modalProb}}` : "fed=null",
        r.reaction ? `reaction={${r.reaction.label} ${r.reaction.lensMovePct}% ${r.reaction.confirmation ?? "-"}}` : "reaction=null",
      ].join(" · ")
    );
  }
  const withMarket = s.calendar.filter((r) => r.market).length;
  const withFed = s.calendar.filter((r) => r.fed).length;
  console.log(`rows with market: ${withMarket} · rows with fed: ${withFed}`);
  const gate = await getEventGateInputs(lens);
  console.log("gate inputs:", gate.events.map((e) => `${e.title} @${new Date(e.time).toISOString().slice(0, 16)} ${e.importance} rel=${e.relevance} dir=${e.surpriseDir} conf=${e.confirmation}`));
  console.log("scores:", s.scores[lens]);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
