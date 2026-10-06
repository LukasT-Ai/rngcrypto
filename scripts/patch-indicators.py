p='src/app/api/signals/route.ts'
s=open(p,encoding='utf-8').read()
def rep(old,new,count=1):
    global s
    assert s.count(old)==count, (s.count(old), old[:80])
    s=s.replace(old,new)
rep('import { analyzeElliottMTF, type ElliottMTFResult } from "@/lib/ta/elliott";',
    'import { analyzeElliottMTF, type ElliottMTFResult } from "@/lib/ta/elliott";\nimport { scoreShortSideComposite, type CompositeResult } from "@/lib/ta/indicators";')

rep('''function computeMultiFactorCall(
  params: {''','''// ── Trend-system + exhaustion composite (lib/ta/indicators) across 15m / 4h / 1d ─────────────────────
// Trend tools (SMC structure, Ichimoku, squeeze, Chandelier, Donchian, PSAR, AVWAP, HA, MACD zero cross)
// and exhaustion tools (double top/bottom, H&S, wedges, liquidity sweeps, TD Sequential, climax, CCI, %R)
// are averaged separately. A reversal read (trend one way, exhaustion the other) only carries full weight
// once a STRUCTURAL confirmation exists (CHoCH, sweep, confirmed pattern); otherwise it is a "forming" note.
interface TaSystem {
  trendScore: number;
  exhaustionScore: number;
  score: number;
  setup: "continuation" | "reversal_confirmed" | "reversal_forming" | "none";
  direction: "bullish" | "bearish" | null;
  confirmedBy: string[];
  notes: string[];
  perTF: Record<string, { trend: number; exhaustion: number; score: number; top: { name: string; score: number; note: string }[] }>;
}

const STRUCTURAL = new Set(["marketStructure", "liquiditySweep", "doubleTopBottom", "headAndShouldersBoth", "wedge"]);

function computeTaSystem(series: Record<string, Candle[]>, tfWeights: Record<string, number>): TaSystem | null {
  const perTF: TaSystem["perTF"] = {};
  const comps: Record<string, CompositeResult> = {};
  let wsum = 0, trend = 0, exh = 0;
  for (const tf of Object.keys(series)) {
    const c = series[tf];
    if (!c || c.length < 60) continue;
    let r: CompositeResult;
    try {
      r = scoreShortSideComposite(c);
    } catch {
      continue;
    }
    comps[tf] = r;
    const w = tfWeights[tf] ?? 1;
    wsum += w;
    trend += w * r.trendScore;
    exh += w * r.exhaustionScore;
    perTF[tf] = {
      trend: r.trendScore,
      exhaustion: r.exhaustionScore,
      score: r.score,
      top: [...r.components].filter((k) => k.score !== 0).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 4).map((k) => ({ name: k.name, score: k.score, note: k.note })),
    };
  }
  if (wsum === 0) return null;
  const trendScore = Math.round((trend / wsum) * 10) / 10;
  const exhaustionScore = Math.round((exh / wsum) * 10) / 10;

  // Structural confirmations agreeing with the exhaustion direction, on any timeframe.
  const exhDir = exhaustionScore <= -25 ? -1 : exhaustionScore >= 25 ? 1 : 0;
  const confirmedBy: string[] = [];
  if (exhDir !== 0) {
    for (const tf of Object.keys(comps)) {
      for (const k of comps[tf].components) {
        if (STRUCTURAL.has(k.name) && Math.sign(k.score) === exhDir && Math.abs(k.score) >= 55) confirmedBy.push(`${tf} ${k.name}`);
      }
    }
  }

  let setup: TaSystem["setup"] = "none";
  let direction: TaSystem["direction"] = null;
  let score: number;
  const notes: string[] = [];
  const opposed = exhDir !== 0 && Math.sign(trendScore) === -exhDir && Math.abs(trendScore) >= 25;
  if (opposed) {
    direction = exhDir > 0 ? "bullish" : "bearish";
    if (confirmedBy.length > 0) {
      setup = "reversal_confirmed";
      // Confirmed reversal: exhaustion leads, the stale trend is discounted
      score = Math.round(0.7 * exhaustionScore + 0.3 * trendScore);
      notes.push(`${direction === "bearish" ? "Uptrend exhausting with structure broken" : "Downtrend exhausting with structure reclaimed"} — reversal ${direction === "bearish" ? "short" : "long"} confirmed by ${confirmedBy.slice(0, 2).join(", ")}`);
    } else {
      setup = "reversal_forming";
      // Not confirmed: trend still rules, exhaustion only trims it
      score = Math.round(0.75 * trendScore + 0.25 * exhaustionScore);
      notes.push(`${direction === "bearish" ? "Uptrend showing bearish exhaustion" : "Downtrend showing bullish exhaustion"} — ${direction === "bearish" ? "short" : "long"} setup forming, wait for a structure break`);
    }
  } else if (Math.abs(trendScore) >= 25) {
    setup = "continuation";
    direction = trendScore > 0 ? "bullish" : "bearish";
    score = Math.round(0.6 * trendScore + 0.4 * exhaustionScore);
    notes.push(`Trend system ${direction} (${trendScore > 0 ? "+" : ""}${trendScore}) with ${exhDir === 0 ? "no exhaustion against it" : "exhaustion aligned"} — ${direction === "bearish" ? "short" : "long"} continuation`);
  } else {
    score = Math.round(0.6 * trendScore + 0.4 * exhaustionScore);
    notes.push(`Trend system flat (${trendScore > 0 ? "+" : ""}${trendScore}); exhaustion ${exhaustionScore > 0 ? "+" : ""}${exhaustionScore}`);
  }
  return { trendScore, exhaustionScore, score: clamp(score, -100, 100), setup, direction, confirmedBy, notes, perTF };
}

function computeMultiFactorCall(
  params: {''')

rep('''    change24h: number;
    elliott: ElliottMTFResult | null;
  },
  dec: number
) {''','''    change24h: number;
    elliott: ElliottMTFResult | null;
    taSystem: TaSystem | null;
  },
  dec: number
) {''')
rep('''    change24h,
    elliott,
  } = params;''','''    change24h,
    elliott,
    taSystem,
  } = params;''')
rep('''    elliott: 0.08,
    macro: 0,''','''    elliott: 0.08,
    // Trend-system + exhaustion composite (SMC, Ichimoku, squeeze, Chandelier, TD Sequential, patterns, sweeps)
    taSystem: 0.12,
    macro: 0,''')
rep('''  // Normalize by the weights actually in play so non-crypto assets are not compressed toward 50.''','''  const taScore = taSystem ? taSystem.score : 0;
  if (!taSystem) weights.taSystem = 0;

  // Normalize by the weights actually in play so non-crypto assets are not compressed toward 50.''')
rep('''      ewScore * weights.elliott +''','''      ewScore * weights.elliott +
      taScore * weights.taSystem +''')
rep('''    {
      category: "Elliott Wave",''','''    {
      category: "Trend System",
      assessment:
        taScore > 40 ? "Strong Bullish" : taScore > 12 ? "Bullish" : taScore > -12 ? "Neutral" : taScore > -40 ? "Bearish" : "Strong Bearish",
      weight: Math.round(weights.taSystem * 100),
    },
    {
      category: "Elliott Wave",''')
rep('''  const reasoning = [
    ...ms.notes,
    ...mom.notes,
    ...ewNotes,''','''  const taNotes = taSystem ? taSystem.notes.slice(0, 1) : [];
  const reasoning = [
    ...ms.notes,
    ...mom.notes,
    ...taNotes,
    ...ewNotes,''')
rep('''  if (ewScore >= 20) bullCase.push("Elliott count: corrective wave completing — impulse up favoured");''','''  if (taSystem?.setup === "reversal_confirmed" && taSystem.direction === "bearish") bearCase.push(`Reversal short confirmed (${taSystem.confirmedBy[0]})`);
  if (taSystem?.setup === "reversal_confirmed" && taSystem.direction === "bullish") bullCase.push(`Reversal long confirmed (${taSystem.confirmedBy[0]})`);
  if (taSystem?.setup === "continuation" && taSystem.direction === "bearish") bearCase.push("Trend system: bearish continuation (structure, Ichimoku, Chandelier agree)");
  if (taSystem?.setup === "continuation" && taSystem.direction === "bullish") bullCase.push("Trend system: bullish continuation (structure, Ichimoku, Chandelier agree)");
  if (ewScore >= 20) bullCase.push("Elliott count: corrective wave completing — impulse up favoured");''')
rep('''  // ── Compute trade call ─────────────────────────────────────────────────────
  const call = computeMultiFactorCall(''','''  // ── Trend-system + exhaustion composite across 15m / 4h / 1d ───────────────
  const taSystem = computeTaSystem({ "15m": candles15m, "4h": candles4h, "1d": candlesDaily }, { "15m": 0.25, "4h": 0.4, "1d": 0.35 });

  // ── Compute trade call ─────────────────────────────────────────────────────
  const call = computeMultiFactorCall(''')
rep('''      change24h,
      elliott: elliottMTF,
    },
    dec
  );''','''      change24h,
      elliott: elliottMTF,
      taSystem,
    },
    dec
  );''')
rep('''    call,
    elliott: elliottMTF''','''    call,
    taSystem,
    elliott: elliottMTF''')
open(p,'w',encoding='utf-8').write(s)
print("ok")
