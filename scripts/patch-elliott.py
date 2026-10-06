p='src/app/api/signals/route.ts'
s=open(p,encoding='utf-8').read()
def rep(old,new,count=1):
    global s
    assert s.count(old)==count, (s.count(old), old[:80])
    s=s.replace(old,new)
rep('import { computeMacroRegime, macroBonus as regimeBonus, type MacroRegimeResult } from "@/lib/ta/macro-regime";',
    'import { computeMacroRegime, macroBonus as regimeBonus, type MacroRegimeResult } from "@/lib/ta/macro-regime";\nimport { analyzeElliottMTF, type ElliottMTFResult } from "@/lib/ta/elliott";')
# params
rep('''    symbol: string;
    change24h: number;
  },
  dec: number
) {''','''    symbol: string;
    change24h: number;
    elliott: ElliottMTFResult | null;
  },
  dec: number
) {''')
rep('''    symbol,
    change24h,
  } = params;''','''    symbol,
    change24h,
    elliott,
  } = params;''')
# weight
rep('''    liquidation: 0.05,
    macro: 0,
    event: 0,
    confirmation: 0,
  };''','''    liquidation: 0.05,
    // Elliott Wave position (impulse 1-5 / corrective ABC across 15m, 1h, 4h). Wave 5 and wave B tops
    // argue for shorts; wave 2, 4 and C bottoms argue for longs. Weight scales with count confidence.
    elliott: 0.08,
    macro: 0,
    event: 0,
    confirmation: 0,
  };''')
# score
rep('''  // Normalize by the weights actually in play so non-crypto assets are not compressed toward 50.''','''  // Elliott: scale weight by how confident the count is; a weak or absent count carries little weight.
  const ewScore = elliott ? clamp(Math.round(elliott.consensus.score), -100, 100) : 0;
  weights.elliott = elliott ? weights.elliott * (0.25 + 0.75 * clamp(elliott.consensus.confidence, 0, 100) / 100) : 0;

  // Normalize by the weights actually in play so non-crypto assets are not compressed toward 50.''')
rep('''      etfScore.score * weights.etf +
      liq.score * weights.liquidation +''','''      etfScore.score * weights.etf +
      liq.score * weights.liquidation +
      ewScore * weights.elliott +''')
# factor label after Divergences entry
rep('''    {
      category: "Divergences",
      assessment:
        divs.score > 10
          ? "Bullish"
          : divs.score > -10
            ? "Neutral"
            : "Bearish",
      weight: Math.round(weights.divergences * 100),
    },
  ];''','''    {
      category: "Divergences",
      assessment:
        divs.score > 10
          ? "Bullish"
          : divs.score > -10
            ? "Neutral"
            : "Bearish",
      weight: Math.round(weights.divergences * 100),
    },
    {
      category: "Elliott Wave",
      assessment:
        ewScore > 40 ? "Strong Bullish" : ewScore > 10 ? "Bullish" : ewScore > -10 ? "Neutral" : ewScore > -40 ? "Bearish" : "Strong Bearish",
      weight: Math.round(weights.elliott * 100),
    },
  ];''')
# reasoning + bull/bear cases
rep('''  const reasoning = [
    ...ms.notes,
    ...mom.notes,''','''  const ewNotes = elliott && elliott.consensus.direction && Math.abs(ewScore) >= 10 ? elliott.consensus.notes.slice(0, 2).map((n) => `Elliott ${n}`) : [];
  const reasoning = [
    ...ms.notes,
    ...mom.notes,
    ...ewNotes,''')
rep('''  if (ms.score > 0)
    bullCase.push("Bullish market structure with EMA alignment");''','''  if (ewScore >= 20) bullCase.push("Elliott count: corrective wave completing — impulse up favoured");
  if (ewScore <= -20) bearCase.push("Elliott count: terminal wave (5 or B) — reversal down favoured");
  if (ms.score > 0)
    bullCase.push("Bullish market structure with EMA alignment");''')
# GET: compute MTF elliott before the call
rep('''  // ── Compute trade call ─────────────────────────────────────────────────────
  const call = computeMultiFactorCall(''','''  // ── Elliott Wave count across timeframes (pure, local) ───────────────────
  let elliottMTF: ElliottMTFResult | null = null;
  try {
    elliottMTF = analyzeElliottMTF({ "15m": candles15m, "1h": candles1h, "4h": candles4h });
  } catch {
    elliottMTF = null;
  }

  // ── Compute trade call ─────────────────────────────────────────────────────
  const call = computeMultiFactorCall(''')
rep('''      symbol,
      change24h,
    },
    dec
  );''','''      symbol,
      change24h,
      elliott: elliottMTF,
    },
    dec
  );''')
# response block
rep('''    call,
    anticipatory,
    activeSetups: [''','''    call,
    elliott: elliottMTF
      ? {
          consensus: elliottMTF.consensus,
          perTF: Object.fromEntries(
            Object.entries(elliottMTF.perTF).map(([tf, r]) => [
              tf,
              { pattern: r.pattern, direction: r.direction, currentWave: r.currentWave, confidence: r.confidence, score: Math.round(r.score), targets: r.targets, notes: r.notes.slice(0, 3), waves: r.waves },
            ])
          ),
        }
      : null,
    anticipatory,
    activeSetups: [''')
open(p,'w',encoding='utf-8').write(s)
print("ok")
