import sys
p='src/app/api/signals/route.ts'
s=open(p,encoding='utf-8').read()
def rep(old,new,count=1):
    global s
    assert s.count(old)==count, (s.count(old), old[:80])
    s=s.replace(old,new)

# ---- Fix 9: divergence recency
rep('''  if (iLow1 != null && iLow2 != null) {
    if (priceLow2 < priceLow1 && iLow2 > iLow1) return "bullish";
    if (priceLow2 > priceLow1 && iLow2 < iLow1) return "hidden_bullish";
  }

  if (iHigh1 != null && iHigh2 != null) {
    if (priceHigh2 > priceHigh1 && iHigh2 < iHigh1) return "bearish";
    if (priceHigh2 < priceHigh1 && iHigh2 > iHigh1) return "hidden_bearish";
  }

  return null;
}''','''  let bull: string | null = null;
  let bear: string | null = null;
  if (iLow1 != null && iLow2 != null) {
    if (priceLow2 < priceLow1 && iLow2 > iLow1) bull = "bullish";
    else if (priceLow2 > priceLow1 && iLow2 < iLow1) bull = "hidden_bullish";
  }
  if (iHigh1 != null && iHigh2 != null) {
    if (priceHigh2 > priceHigh1 && iHigh2 < iHigh1) bear = "bearish";
    else if (priceHigh2 < priceHigh1 && iHigh2 > iHigh1) bear = "hidden_bearish";
  }
  // Both sides present: the more recent pivot wins; a dead heat is no signal (no bullish-first priority).
  if (bull && bear) {
    if (indLow2Idx === indHigh2Idx) return null;
    return indLow2Idx > indHigh2Idx ? bull : bear;
  }
  return bull ?? bear;
}''')

# ---- Fix 8: hanging man, dark cloud cover, piercing line
rep('''  if (lowerWick > body * 2 && upperWick < body * 0.5 && c.close < p.close) {
    return "hammer";
  }
''','''  if (lowerWick > body * 2 && upperWick < body * 0.5 && c.close < p.close) {
    return "hammer";
  }

  // Same shape as a hammer but after an up move: hanging man (bearish)
  if (lowerWick > body * 2 && upperWick < body * 0.5 && c.close > p.close) {
    return "hanging_man";
  }
''')
rep('''  const ppBody = Math.abs(pp.close - pp.open);
  if (
    pp.close < pp.open &&''','''  // Dark cloud cover: prior green, opens above prior high, closes below prior midpoint
  if (p.close > p.open && c.close < c.open && c.open > p.high && c.close < (p.open + p.close) / 2 && c.close > p.open) {
    return "dark_cloud_cover";
  }
  // Piercing line: prior red, opens below prior low, closes above prior midpoint
  if (p.close < p.open && c.close > c.open && c.open < p.low && c.close > (p.open + p.close) / 2 && c.close < p.open) {
    return "piercing_line";
  }

  const ppBody = Math.abs(pp.close - pp.open);
  if (
    pp.close < pp.open &&''')
rep('''  const bullish = [
    "hammer",
    "inverted_hammer",
    "bullish_engulfing",
    "morning_star",
  ];
  const bearish = ["shooting_star", "bearish_engulfing", "evening_star"];''','''  const bullish = ["hammer", "inverted_hammer", "bullish_engulfing", "morning_star", "piercing_line"];
  const bearish = ["shooting_star", "hanging_man", "bearish_engulfing", "evening_star", "dark_cloud_cover"];''')

# ---- Fix 2: symmetric macro bonus + shared grade ladder
rep('''function getMacroBonus(macroState: MacroState | null, bias: "LONG" | "SHORT" | "WAIT", isCrypto: boolean): number {
  if (!macroState || !isCrypto) return 0;
  if (bias === "LONG") return Math.min(macroState.macroScore, 20);
  if (bias === "SHORT" && macroState.macroScore >= 15) return -10;
  return 0;
}''','''// Symmetric: a regime aligned with the call adds up to +20; a regime opposed by 15+ points costs 10.
function getMacroBonus(macroState: MacroState | null, bias: "LONG" | "SHORT" | "WAIT", isCrypto: boolean): number {
  if (!macroState || !isCrypto || bias === "WAIT") return 0;
  const aligned = bias === "LONG" ? macroState.macroScore : -macroState.macroScore;
  if (aligned > 0) return Math.min(aligned, 20);
  if (aligned <= -15) return -10;
  return 0;
}

// Grade ladder shared by the call and the post-macro re-grade so confidence and grade never disagree.
function gradeFor(confidence: number, strongCategories: number): string {
  if (confidence >= 85 && strongCategories >= 3) return "A+";
  if (confidence >= 75) return "A";
  if (confidence >= 60) return "B";
  if (confidence >= 55) return "C";
  return "NO TRADE";
}''')

# ---- Fix 4: momentum bear branch
rep('''  const isTrendingBull = trendDir === "bull" && (macroBias === "strong_bull" || macroBias === "bull");
  const isTrendingBear = trendDir === "bear" && (macroBias === "neutral");

  if (isTrendingBull && rsi > 70) {
    score += 5;
    notes.push(`RSI momentum (${rsi.toFixed(0)}) — trending bull regime`);
    if (prevRsi != null && prevRsi <= 70 && rsi > 70) {
      score += 15;
      notes.push("RSI momentum cross above 70 — bullish entry signal");
    }
  } else if (isTrendingBear && rsi < 30) {
    score += 5;
    notes.push(`RSI momentum (${rsi.toFixed(0)}) — trending bear regime`);
  } else if (rsi < 30) {''','''  const isTrendingBull = trendDir === "bull" && (macroBias === "strong_bull" || macroBias === "bull");
  const isTrendingBear = trendDir === "bear" && (macroBias === "strong_bear" || macroBias === "bear");

  if (isTrendingBull && rsi > 70) {
    score += 5;
    notes.push(`RSI momentum (${rsi.toFixed(0)}) — trending bull regime`);
    if (prevRsi != null && prevRsi <= 70) {
      score += 15;
      notes.push("RSI momentum cross above 70 — bullish entry signal");
    }
  } else if (isTrendingBear && rsi < 30) {
    // Mirror of the bull momentum entry: in a confirmed bear regime, RSI breaking 30 is continuation, not a dip to buy
    score -= 5;
    notes.push(`RSI momentum (${rsi.toFixed(0)}) — trending bear regime`);
    if (prevRsi != null && prevRsi >= 30) {
      score -= 15;
      notes.push("RSI momentum cross below 30 — bearish entry signal");
    }
  } else if (rsi < 30) {''')

# ---- Fix 5: directional volume
rep('''  if (volRatio > 1.5) {
    notes.push(`Volume ${volRatio.toFixed(1)}x above average`);
  } else if (volRatio < 0.5) {
    score -= 10;
    notes.push("Volume below average");
  }

  // 20 EMA spike scoring — best as confirmation, DRY filter is strongest edge
  if (spikeLabel === "EXTREME SPIKE") {
    score += 15;
    notes.push(`Vol spike ${spikeRatio.toFixed(1)}x above 20 EMA — real breakout`);
  } else if (spikeLabel === "HIGH SPIKE") {
    score += 10;
    notes.push(`Vol spike ${spikeRatio.toFixed(1)}x above 20 EMA — conviction move`);
  } else if (spikeLabel === "DRY") {
    score -= 15;
    notes.push(`Vol dry (${spikeRatio.toFixed(1)}x EMA) — low conviction, fakeout risk`);
  }

  if (volTrend === "increasing") {
    score += 15;
    notes.push("Volume trend increasing");
  } else if (volTrend === "decreasing") {
    score -= 15;
    notes.push("Volume trend decreasing");
  }

  if (cvd > 0) {
    score += 30;
    notes.push("Positive CVD — net buying pressure");
  } else {
    score -= 30;
    notes.push("Negative CVD — net selling pressure");
  }
''','''  // Volume has no direction of its own: spikes and rising participation CONFIRM whichever side CVD says is in
  // control. A high-volume breakdown must score as negative as a high-volume breakout scores positive.
  const dir = cvd >= 0 ? 1 : -1;
  const side = dir > 0 ? "buyers" : "sellers";

  if (volRatio > 1.5) notes.push(`Volume ${volRatio.toFixed(1)}x above average`);

  if (spikeLabel === "EXTREME SPIKE") {
    score += 15 * dir;
    notes.push(`Vol spike ${spikeRatio.toFixed(1)}x above 20 EMA — real ${dir > 0 ? "breakout" : "breakdown"}`);
  } else if (spikeLabel === "HIGH SPIKE") {
    score += 10 * dir;
    notes.push(`Vol spike ${spikeRatio.toFixed(1)}x above 20 EMA — conviction move by ${side}`);
  }

  if (volTrend === "increasing") {
    score += 15 * dir;
    notes.push(`Volume trend increasing behind ${side}`);
  } else if (volTrend === "decreasing") {
    score -= 15 * dir;
    notes.push(`Volume trend decreasing — ${side} losing participation`);
  }

  if (cvd > 0) {
    score += 30;
    notes.push("Positive CVD — net buying pressure");
  } else {
    score -= 30;
    notes.push("Negative CVD — net selling pressure");
  }

  // Low participation is a conviction haircut for either side, not a bearish vote
  if (spikeLabel === "DRY" || volRatio < 0.5) {
    score = Math.round(score * 0.6);
    notes.push(spikeLabel === "DRY" ? `Vol dry (${spikeRatio.toFixed(1)}x EMA) — low conviction, fakeout risk` : "Volume below average — low conviction");
  }
''')

# ---- Fix 7: funding symmetry
rep('''    } else if (fundingRate > 0.02) {
      score -= 10;
      notes.push("Elevated positive funding");
    } else if (fundingRate < 0) {
      score += 10;
      notes.push("Slightly negative funding");
    }''','''    } else if (fundingRate > 0.01) {
      score -= 10;
      notes.push("Elevated positive funding");
    } else if (fundingRate < -0.005) {
      score += 10;
      notes.push("Slightly negative funding");
    }''')

# ---- Fix 6: BTC dominance alt-aware + symmetric
rep('''function scoreMarketData(
  btcDominance: number | null,
  isCrypto: boolean
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (!isCrypto) return { score: 0, notes: [] };

  if (btcDominance != null) {
    if (btcDominance > 55) {
      score += 15;
      notes.push(
        `High BTC dominance (${btcDominance.toFixed(1)}%) — capital flowing to BTC`
      );
    } else if (btcDominance < 40) {
      score -= 10;
      notes.push(
        `Low BTC dominance (${btcDominance.toFixed(1)}%) — alt season`
      );
    }
  }

  return { score: clamp(score, -100, 100), notes };
}''','''function scoreMarketData(
  btcDominance: number | null,
  isCrypto: boolean,
  symbol: string
): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  if (!isCrypto || btcDominance == null) return { score: 0, notes: [] };

  // Capital rotating into BTC is bullish for BTC and bearish for alts; the inverse for alt season.
  const sign = symbol === "BTC" ? 1 : -1;
  if (btcDominance > 55) {
    score += 15 * sign;
    notes.push(`High BTC dominance (${btcDominance.toFixed(1)}%) — capital flowing to BTC${sign < 0 ? ", headwind for alts" : ""}`);
  } else if (btcDominance < 40) {
    score -= 15 * sign;
    notes.push(`Low BTC dominance (${btcDominance.toFixed(1)}%) — alt season${sign < 0 ? ", tailwind for alts" : ""}`);
  }

  return { score: clamp(score, -100, 100), notes };
}''')
rep('  const mktData = scoreMarketData(btcDominance, isCrypto);','  const mktData = scoreMarketData(btcDominance, isCrypto, symbol);')

# ---- Fix 11: extreme funding is a risk note, not a bearish vote
rep('''  if (fundingRate != null && Math.abs(fundingRate) > 0.05) {
    score -= 20;
    note =
      (note ? note + "; " : "") + "Extreme funding rate, squeeze risk";
  }''','''  // Extreme funding in either direction is squeeze risk for whoever is crowded: flag it, do not vote bearish
  if (fundingRate != null && Math.abs(fundingRate) > 0.05) {
    note =
      (note ? note + "; " : "") + "Extreme funding rate, squeeze risk";
  }''')

# ---- Fix 10: OI change signed by price direction
rep('''  oiChange: number | null,
  takerBuySellRatio: number | null
): { score: number; notes: string[]; squeezeRisk: string | null } {''','''  oiChange: number | null,
  takerBuySellRatio: number | null,
  priceChange24h: number | null
): { score: number; notes: string[]; squeezeRisk: string | null } {''')
rep('''  if (oiChange != null) {
    if (oiChange > 15) {
      score += 10;
      notes.push(`OI surging +${oiChange.toFixed(1)}% — new money entering`);
    } else if (oiChange < -15) {
      score -= 10;
      notes.push(`OI dropping ${oiChange.toFixed(1)}% — positions unwinding`);
    }
  }''','''  if (oiChange != null) {
    // Rising OI confirms the prevailing move (longs building on a rally, shorts building in a selloff);
    // falling OI means that move is unwinding.
    const px = priceChange24h ?? 0;
    const pxDir = px > 0.25 ? 1 : px < -0.25 ? -1 : 0;
    if (oiChange > 15) {
      score += 10 * pxDir;
      notes.push(`OI surging +${oiChange.toFixed(1)}% — ${pxDir > 0 ? "longs building on the rally" : pxDir < 0 ? "shorts building into the selloff" : "new money entering, direction unclear"}`);
    } else if (oiChange < -15) {
      score -= 10 * pxDir;
      notes.push(`OI dropping ${oiChange.toFixed(1)}% — ${pxDir > 0 ? "short covering, rally may stall" : pxDir < 0 ? "long liquidation, selloff may exhaust" : "positions unwinding"}`);
    }
  }''')
rep('''    fundingRate,
    oiChange,
    takerBuySellRatio
  );

  // Normalize by the weights actually in play''','''    fundingRate,
    oiChange,
    takerBuySellRatio,
    change24h
  );

  // Normalize by the weights actually in play''')

# ---- params: symbol + change24h
rep('''    prevRsi: number | null;
    macroBias: string | null;
  },
  dec: number
) {''','''    prevRsi: number | null;
    macroBias: string | null;
    symbol: string;
    change24h: number;
  },
  dec: number
) {''')
rep('''      prevRsi: prevRsi15m,
      macroBias: macroState?.bias ?? null,
    },
    dec
  );''','''      prevRsi: prevRsi15m,
      macroBias: macroState?.bias ?? null,
      symbol,
      change24h,
    },
    dec
  );''')
rep('''    prevRsi,
    macroBias,
  } = params;''','''    prevRsi,
    macroBias,
    symbol,
    change24h,
  } = params;''')

# ---- Fix 1: magnitude-based confidence, symmetric WAIT, grade via gradeFor
rep('''  let confidence = clamp(Math.round(50 + weightedScore / 2 + whipsawPenalty), 0, 100);''',
'''  // Conviction is the MAGNITUDE of the evidence. A strongly bearish board is a high-confidence SHORT, not a
  // low-confidence LONG; the sign only picks the side below.
  const strength = Math.abs(weightedScore);
  let confidence = clamp(Math.round(50 + strength / 2 + whipsawPenalty), 0, 100);''')
rep('''  const isWait =
    confidence < 45 ||
    (squeeze === "volatility_compression" && adx < 20) ||
    (trend1h !== trend4h && adx < 20);''','''  const isWait =
    strength < 10 ||
    (squeeze === "volatility_compression" && adx < 20) ||
    (trend1h !== trend4h && adx < 20);''')
rep('''  let grade: string;
  if (confidence >= 85 && strongCategories >= 3) grade = "A+";
  else if (confidence >= 75) grade = "A";
  else if (confidence >= 60) grade = "B";
  else if (confidence >= 45) grade = "C";
  else grade = "NO TRADE";''','''  let grade = gradeFor(confidence, strongCategories);''')

# ---- Fix 12: WAIT plan shaped by the lean
rep('''  } else {
    entry = price;
    secondaryEntry = null;
    secondaryStopLoss = null;
    stopLoss = price - 1.5 * ta;
    tp1 = price + 1.5 * ta;
    tp2 = price + 2.5 * ta;
    tp3 = price + 4 * ta;
    extendedTarget = null;
  }''','''  } else {
    // WAIT: shape the provisional plan by the lean so the bear case is not drawn as a long
    const lean = weightedScore >= 0 ? 1 : -1;
    entry = price;
    secondaryEntry = null;
    secondaryStopLoss = null;
    stopLoss = price - 1.5 * ta * lean;
    tp1 = price + 1.5 * ta * lean;
    tp2 = price + 2.5 * ta * lean;
    tp3 = price + 4 * ta * lean;
    extendedTarget = null;
  }''')

# ---- return strongCategories + weightedScore
rep('''    signalFactors,
    geoOverride,
    sizeMultiplier,
    stopMultiplier: stopMult,
  };
}''','''    signalFactors,
    geoOverride,
    sizeMultiplier,
    stopMultiplier: stopMult,
    strongCategories,
    weightedScore: Math.round(weightedScore * 10) / 10,
  };
}''')

# ---- Fix 2b: apply macro bonus then re-grade, both directions
rep('''  const macroBonus = getMacroBonus(macroState, call.bias, isCrypto);
  if (macroBonus !== 0) {
    call.confidence = clamp(call.confidence + macroBonus, 0, 100);
    if (macroBonus > 0 && call.confidence >= 75 && call.grade !== "A+" && call.grade !== "A") {
      call.grade = "A";
    }
    if (macroBonus > 0) {
      call.reasoning.unshift(`Macro ${macroState!.bias.replace("_", " ")} (+${macroBonus})`);
    }
  }''','''  const macroBonus = getMacroBonus(macroState, call.bias, isCrypto);
  if (macroBonus !== 0) {
    call.confidence = clamp(call.confidence + macroBonus, 0, 100);
    call.grade = gradeFor(call.confidence, call.strongCategories);
    call.reasoning.unshift(`Macro regime ${macroState!.bias.replace(/_/g, " ")} ${macroBonus > 0 ? "supports" : "opposes"} the ${call.bias.toLowerCase()} (${macroBonus > 0 ? "+" : ""}${macroBonus})`);
  }''')
open(p,'w',encoding='utf-8').write(s)

p='src/app/signals/recommendation.ts'
s=open(p,encoding='utf-8').read()
rep('''      : call.confidence < 45
        ? `Signals are mixed (${bull} bullish vs ${bear} bearish factors, confidence ${call.confidence}%) — there is no edge right now.`''',
'''      : Math.abs(bull - bear) <= 1
        ? `Signals are mixed (${bull} bullish vs ${bear} bearish factors, confidence ${call.confidence}%) — there is no edge right now.`''')
open(p,'w',encoding='utf-8').write(s)
print("patched OK")
