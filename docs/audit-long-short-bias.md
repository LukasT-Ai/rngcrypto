# Audit: structural LONG bias in the signal engine

Date: 2026-10-06. Scope: `src/app/api/signals/route.ts` (engine), `src/app/api/signals/history/*` (logging, outcomes, performance), `src/app/signals/*` (UI). Read-only audit; line numbers refer to the files as of this date.

Observed symptom: 39 live logged signals, 100% LONG. Local `data/signal-history.json` shows the same: 3 signals, all LONG, including ADA LONG confidence 74 grade C (an impossible pair unless confidence was raised after grading, see Fix 2).

---

## 1. Root cause: confidence is signed, so SHORT can never clear the logging gate

`route.ts:2955`

```ts
let confidence = clamp(Math.round(50 + weightedScore / 2 + whipsawPenalty), 0, 100);
```

Confidence rises with a bullish score and falls with a bearish score. Every downstream threshold therefore only admits bullish setups.

| Check | Location | Effect on SHORT |
|---|---|---|
| WAIT gate `confidence < 45` | `route.ts:3128` | weightedScore < -10 becomes WAIT. SHORT only possible for weightedScore in [-10, 0], i.e. confidence 45 to 50 |
| Logging gate `confidence >= 55` | `route.ts:4146` | Max SHORT confidence is 50. SHORT is unloggable except via the catalyst override at `route.ts:3169-3172` which forces 55 |
| Grade ladder | `route.ts:3180-3185` | SHORT can only be grade C |
| Hot scanner `confidence >= 75` | `hot/route.ts:126` | Never surfaces a SHORT |
| Recommendation copy `confidence < 45` | `recommendation.ts:350` | Every strong bearish board is described as "signals mixed, no edge" |
| Macro SHORT penalty | `route.ts:1240` | A SHORT that survived (confidence 45 to 50) is pushed to 35 to 40 while keeping bias SHORT |

A board with weightedScore -40 (strongly bearish) yields confidence 30 and bias WAIT. The mirror board (+40) yields confidence 70, LONG, grade B, logged.

---

## 2. Ranked fixes

### Fix 1. Magnitude-based confidence and symmetric WAIT gate

`route.ts:2955`, `route.ts:3127-3139`, `route.ts:3180-3185`

```ts
// 2955
const strength = Math.abs(weightedScore);
let confidence = clamp(Math.round(50 + strength / 2 + whipsawPenalty), 0, 100);

// 3127
const isWait =
  strength < 10 ||                                  // was: confidence < 45
  (squeeze === "volatility_compression" && adx < 20) ||
  (trend1h !== trend4h && adx < 20);
let bias: "LONG" | "SHORT" | "WAIT" = isWait ? "WAIT" : weightedScore > 0 ? "LONG" : "SHORT";

// 3180  (a directional call now always has confidence >= 55, so re-band C)
if (confidence >= 85 && strongCategories >= 3) grade = "A+";
else if (confidence >= 75) grade = "A";
else if (confidence >= 60) grade = "B";
else if (confidence >= 55) grade = "C";
else grade = "NO TRADE";
```

Companion edits:

- `recommendation.ts:350`: replace `call.confidence < 45` with `call.bias === "WAIT"`.
- `route.ts:2960` preEventRisk cap (`* 0.85`, max 69) is direction-neutral and stays.
- `route.ts:3369` uses `weightedScore >= 0` for WAIT confirms/invalidates text; unchanged.
- Grep `src/app/signals` for other `< 45` / `>= 45` confidence comparisons on the map signal and 5m card.
- `dashboard.tsx:4057` copy already says "confidence >= 55"; stays correct.

### Fix 2. Symmetric macro bonus, applied before grading

`route.ts:1237-1242`, `route.ts:4016-4025`

Current behaviour: LONG gets `+min(macroScore, 20)`; SHORT gets -10 when macroScore >= 15; the grade upgrade at `:4019` fires only on a positive bonus; bonus is applied after the grade ladder ran inside `computeMultiFactorCall`. `macroScore` is non-negative by construction (Fix 3), so SHORT can only ever be penalised.

```ts
function getMacroBonus(m: MacroState | null, bias: "LONG" | "SHORT" | "WAIT", isCrypto: boolean): number {
  if (!m || !isCrypto || bias === "WAIT") return 0;
  const aligned = bias === "LONG" ? m.macroScore : -m.macroScore;   // macroScore is signed after Fix 3
  if (aligned > 0) return Math.min(aligned, 20);
  if (aligned <= -15) return -10;
  return 0;
}
```

At `route.ts:4016-4025`:

```ts
const macroBonus = getMacroBonus(macroState, call.bias, isCrypto);
if (macroBonus !== 0) {
  call.confidence = clamp(call.confidence + macroBonus, 0, 100);
  call.grade = gradeFor(call.confidence, call.strongCategories);   // extract ladder from :3180 into gradeFor(); return strongCategories from the call
  call.reasoning.unshift(`Macro ${macroState!.bias.replace("_", " ")} (${macroBonus > 0 ? "+" : ""}${macroBonus})`);
}
```

Evidence: ADA LONG 74 / grade C in local history = base confidence 54 (+20 macro). Many logged LONGs likely only crossed 55 because of the bonus.

### Fix 3. Give fetchMacroSignals a bearish side

`route.ts:1093-1235`

All inputs are bullish patterns (weekly stoch K >= 80, golden cross, 21 > 377 EMA, weekly bullish engulfing, bullish confluences). `macroScore` is only ever added to, and the label at `:1217` spans neutral to strong_bull only. Make `macroScore` signed and add the mirrors listed in section 3. New label:

```ts
const bias =
  macroScore >= 20 ? "strong_bull" : macroScore >= 10 ? "bull" : macroScore >= 5 ? "lean_bull"
  : macroScore <= -20 ? "strong_bear" : macroScore <= -10 ? "bear" : macroScore <= -5 ? "lean_bear"
  : "neutral";
```

Update the `MacroState["bias"]` union at `route.ts:835` and any dashboard macro panel that switches on the label. Also neutralise the golden cross contribution at `:1182-1191` when `currentPrice < sma200` (it currently pays +10 indefinitely).

### Fix 4. scoreMomentum: sign bug and missing short momentum entry

`route.ts:1343-1368`

- `:1344` `isTrendingBear = trendDir === "bear" && macroBias === "neutral"`. macroBias can never be bearish today and is null for non-crypto, so this almost never fires. After Fix 3 it should mirror `:1343`.
- `:1353-1355` gives `+5` (bullish) for RSI < 30 in a bear regime. Should be `-5`, with a `-15` cross mirror of `:1349-1352`.

```ts
const isTrendingBull = trendDir === "bull" && (macroBias === "strong_bull" || macroBias === "bull");
const isTrendingBear = trendDir === "bear" && (macroBias === "strong_bear" || macroBias === "bear");

if (isTrendingBull && rsi > 70) {
  score += 5;
  notes.push(`RSI momentum (${rsi.toFixed(0)}) — trending bull regime`);
  if (prevRsi != null && prevRsi <= 70) {
    score += 15;
    notes.push("RSI momentum cross above 70 — bullish entry signal");
  }
} else if (isTrendingBear && rsi < 30) {
  score -= 5;
  notes.push(`RSI momentum (${rsi.toFixed(0)}) — trending bear regime`);
  if (prevRsi != null && prevRsi >= 30) {
    score -= 15;
    notes.push("RSI momentum cross below 30 — bearish entry signal");
  }
} else if (rsi < 30) { ... unchanged mean-reversion ladder ... }
```

### Fix 5. Make volume scoring directional

`route.ts:1419-1444`

Spike `+15/+10`, `volTrend === "increasing"` `+15`, DRY `-15`, `volRatio < 0.5` `-10` are quality signals encoded with a bullish sign. A high-volume breakdown scores spike +15, trend +15, CVD -30 = 0; the same rally scores +60.

```ts
const dir = cvd >= 0 ? 1 : -1;   // or sign of last-candle close minus open
if (spikeLabel === "EXTREME SPIKE") score += 15 * dir;
else if (spikeLabel === "HIGH SPIKE") score += 10 * dir;
if (volTrend === "increasing") score += 15 * dir;
else if (volTrend === "decreasing") score -= 15 * dir;
if (cvd > 0) score += 30; else score -= 30;
// conviction haircut, direction-neutral
if (spikeLabel === "DRY" || volRatio < 0.5) score = Math.round(score * 0.6);
```

### Fix 6. scoreMarketData: BTC dominance sign is wrong for alts and asymmetric

`route.ts:1697-1708`

`> 55 → +15`, `< 40 → -10`. Applied to every `isCrypto` symbol. High BTC dominance is bearish for ADA/ETH/SOL. Pass `symbol`, invert for non-BTC, and use ±15 both ways.

```ts
function scoreMarketData(btcDominance: number | null, isCrypto: boolean, symbol: string) {
  if (!isCrypto || btcDominance == null) return { score: 0, notes: [] };
  const sign = symbol === "BTC" ? 1 : -1;
  if (btcDominance > 55) return { score: 15 * sign, notes: [`High BTC dominance (${btcDominance.toFixed(1)}%)`] };
  if (btcDominance < 40) return { score: -15 * sign, notes: [`Low BTC dominance (${btcDominance.toFixed(1)}%) — alt season`] };
  return { score: 0, notes: [] };
}
```

### Fix 7. Funding thresholds

`route.ts:1476-1488`

Any negative funding gets `+10` (`:1485`), but positive funding needs `> 0.02` for `-10` (`:1482`). Mirror with `fundingRate > 0.01 → -10` or require `fundingRate < -0.005` for the +10.

### Fix 8. Candlestick patterns: 4 bullish vs 3 bearish, no hanging man

`route.ts:734-800`, `route.ts:1722-1728`

`:752` hammer requires `c.close < p.close`. The identical shape after an up move (hanging man, bearish) returns null. Add:

```ts
if (lowerWick > body * 2 && upperWick < body * 0.5 && c.close > p.close) return "hanging_man";
// dark cloud cover: prev green, current opens above prev high, closes below prev midpoint
if (p.close > p.open && c.open > p.high && c.close < (p.open + p.close) / 2 && c.close > p.open) return "dark_cloud_cover";
```

and append both to the bearish list at `:1728`.

### Fix 9. Divergence priority

`route.ts:674-682`

Bullish branches return first. If both a bullish and a bearish divergence exist in the lookback, bullish wins. Pick the one whose second pivot index is more recent, or return null on conflict.

### Fix 10. OI change is signed bullish regardless of price direction

`route.ts:1837-1845`

`oiChange > 15 → +10` ("new money entering") even in a selloff where it means shorts building. Pass a price-change sign and multiply: `score += 10 * Math.sign(priceChange24h)` when `oiChange > 15`; `-10 * Math.sign(priceChange24h)` when `oiChange < -15`.

### Fix 11. Direction-neutral penalties encoded as bearish score

`route.ts:1776-1780` (extreme funding, -20 inside catalyst score, weight 0.02) and `route.ts:2954` (whipsaw -8 on confidence). Once Fix 1 lands, whipsaw already reduces confidence symmetrically. Move the extreme-funding penalty to a confidence haircut as well.

### Fix 12. WAIT plan is long-shaped

`route.ts:3260-3269`

Stop below and TPs above price even when weightedScore < 0. Branch on `weightedScore >= 0` to produce a bearish-shaped WAIT plan, consistent with `:3369`.

### Fix 13. Hot scanner threshold

`hot/route.ts:126` `confidence >= 75` is fine after Fix 1 but should be verified to surface SHORT rows; add a `bias` column to the hot payload test.

---

## 3. New bearish inputs to mirror existing bullish ones

For `fetchMacroSignals` (BTC daily/weekly from CoinGecko, `route.ts:1093`):

| Bullish input (current) | Bearish mirror to add | Suggested score |
|---|---|---|
| Weekly stoch K crosses 80 after >= 8w below (`:1169-1172`, +15) | K crosses below 20 after >= 8w above 20 | -15 |
| K approaching 80 (`:1173-1175`, +8) | K in 20 to 30 falling | -8 |
| K >= 80 momentum regime (`:1176-1178`, +10) | K < 20 regime | -10 |
| (none) | K crosses back below 80 after MOMENTUM regime | -8 |
| Golden cross active (`:1182-1186`, +10) | Death cross active (SMA50 < SMA200) | -10 |
| Shallow start (`:1187-1190`, +5) | Weak bounce: first 10 days after death cross rallied < 5.5% | -5 |
| Weekly bullish engulfing (`:1162`, +5) | Weekly bearish engulfing: `prev.close > prev.open && curr.close < curr.open && curr.close < prev.open && curr.open >= prev.close` | -5 |
| 21 > 377 EMA (`:1198-1200`, +8) | 21 < 377 EMA | -8 |
| Price above both EMAs (`:1201-1204`, +3) | Price below both EMAs | -3 |
| Double / triple bullish confluence (`:1207-1215`, +5/+5) | Stoch breakdown + death cross, plus 21 < 377 | -5 / -5 |

Implementation notes: `computeWeeklyStochastic` (`:908-987`) only counts `weeksBelow80`; add `weeksAbove20` and `justCrossed20`. `computeGoldenCross` (`:989-1034`) returns nulls when `!isGolden` (`:1005-1007`); return cross metadata for the bearish cross as well.

For the multi-factor scorers:

- RSI cross below 30 in a bear regime as short momentum entry (Fix 4).
- Lower-high / lower-low swing structure on 15m and 1h inside `scoreMarketStructure` (`:1278`), which is EMA and supertrend only today. The BOS/CHoCH detector at `:2053-2100` already computes `isDowntrend`; feed it into the weighted score (±15).
- Distribution volume: high volume on down closes (Fix 5 covers the simplest form).
- Hanging man, dark cloud cover, three black crows (Fix 8).
- OI rising while price falls = shorts building (Fix 10).
- Alt-specific BTC dominance inversion (Fix 6).

---

## 4. Symmetry audit of every factor

| Factor | Location | Symmetric? | Note |
|---|---|---|---|
| scoreMarketStructure | `:1278-1328` | Yes | ±40 EMA stack, ±25 supertrend, ±10 price vs EMA9, ±15 support/resistance proximity |
| scoreMomentum | `:1330-1400` | No | Bear branch has wrong sign and impossible gate; no short momentum cross (Fix 4) |
| scoreVolume | `:1402-1466` | No | Spike, trend, DRY, low-ratio are direction-neutral but signed bullish (Fix 5) |
| scoreDerivatives | `:1468-1506` | Mostly | Funding threshold asymmetry (Fix 7); put/call symmetric |
| scoreHTF | `:1508-1550` | Yes | |
| scoreBollinger | `:1552-1586` | Yes | |
| scoreDivergences | `:1588-1624` | Yes in scoring | Detector priority favours bullish (Fix 9) |
| scoreSentiment | `:1626-1686` | Yes | |
| scoreMarketData | `:1688-1712` | No | +15 vs -10, sign wrong for alts (Fix 6) |
| scorePatterns | `:1714-1741` | No | 4 bullish vs 3 bearish patterns, no hanging man (Fix 8) |
| scoreETFFlows | `:1743-1766` | Yes | |
| applyCatalystScore | `:1768-1783` | No | Direction-neutral penalty signed bearish (Fix 11) |
| scoreLiquidation | `:1785-1874` | Mostly | OI change signed bullish regardless of price (Fix 10) |
| lib/macro scores | `lib/macro/service.ts:244` | Yes | Uses `imp.direction` sign |
| Confidence | `:2955` | No | Signed (Fix 1) |
| isWait | `:3127-3130` | No | Via signed confidence (Fix 1) |
| Grade | `:3180-3185` | No | Via signed confidence (Fix 1) |
| Catalyst / geo override | `:3141-3178` | Yes | LONG and SHORT branches mirror, HTF-oppose checks mirror |
| Entry / stop / TP | `:3187-3301` | Yes | SHORT branch mirrors LONG; same R:R math; WAIT branch long-shaped (Fix 12) |
| getMacroBonus | `:1237-1242` | No | LONG-only bonus, SHORT-only penalty (Fix 2) |
| analyzeSingleTimeframe | `:2512-2531` | Yes | score > 15 LONG, < -15 SHORT, confidence = abs(score) |
| computeTimeframeOutlook consensus | `:2588-2626` | Yes | |
| computeAnticipatorySignals | `:1878-2401` | Yes | Retest, BOS/CHoCH, sweep, CVD divergence all mirrored |

---

## 5. Outcome checker and performance: SHORT correctness

`src/app/api/signals/history/check/core.ts`

- `realizedR` (`:61-66`): `move = bias === "LONG" ? exit - entry : entry - exit`. Correct.
- `evaluate` (`:70-99`): favorable = `entry - low`, adverse = `high - entry`, stop hit = `high >= stopLoss`, TP hit = `low <= lvl` for SHORT. Correct. Same-candle SL+TP resolves as the stop for both sides.
- Horizon expiry (`:124-132`) uses `realizedR` with last close; sign-correct.

`src/app/api/signals/history/performance.ts`

- `legacyRealizedR` (`:96-103`): sign-correct for SHORT.
- `normalize` (`:105-162`): `mfeR`/`maeR` derive from stored `maxFavorable`/`maxAdverse`, which the checker already signs by direction. Correct.
- `byBias` bucket exists at `:302`, ordered `["LONG", "SHORT"]`.

`src/app/api/signals/history/route.ts:26-37`: `dir = bias === "LONG" ? 1 : -1`; `unrealizedR`, `distToNextTpR`, `distToSlR` are sign-correct for SHORT.

`logger.ts computeStats` (`:224-321`): `avgRR` and `profitFactor` use absolute price distances, direction-agnostic. `realizedR` inside `bucketOf` (`:270-275`) is sign-correct.

No SHORT-handling bugs on the outcome side. Once SHORTs are logged, performance tracking will work without changes.

---

## 6. UI findings

- **Main dashboard track record** (`src/app/signals/dashboard.tsx:4048-4216`): win-rate ring, totals, profit factor, recent-signals table (bias shown per row), per-symbol win rate. No long/short split.
- **Data source**: `dashboard.tsx:999` fetches plain `/api/signals/history`. `history/route.ts:51-53` returns `{ signals, stats }` from legacy `computeStats`, which has no `byBias`. The `performance` key is absent (reads as null/undefined) because `computePerformance` only runs when `?view=performance` is passed (`history/route.ts:16`).
- **Where byBias is shown today**: the separate `/signals/performance` page. `PerformanceDashboard.tsx:113` lists `byBias` among breakdown tabs; `:124-132` has a LONG/SHORT filter that sets `?bias=`; `:176-177` renders the toggle.
- **To show the split on the main dashboard**: either add `byBias: Record<"LONG"|"SHORT", {total,wins,losses,winRate}>` to `computeStats` in `logger.ts:224` and `HistoryResponse` at `dashboard.tsx:521`, or fetch `/api/signals/history?view=performance&range=all` and render `stats.breakdowns.byBias` next to the win-rate ring at `dashboard.tsx:4066`.

---

## 7. Bugs found

1. **Signed confidence** `route.ts:2955`. Bearish boards lose confidence instead of gaining it. Root cause of 100% LONG history.
2. **Positive score for bearish RSI** `route.ts:1353-1355`. `+5` where `-5` is intended.
3. **isTrendingBear gated on an impossible label** `route.ts:1344`. Requires `macroBias === "neutral"`; never bearish, null for non-crypto.
4. **Macro bonus applied after grading** `route.ts:4016-4025` vs `:3180-3185`. Produces confidence 74 with grade C (seen in local history). Grade upgrade only for positive bonus.
5. **Macro SHORT penalty after bias decision** `route.ts:1240` + `:4018`. A SHORT can end with confidence 35 to 40 while bias stays SHORT and grade C.
6. **BTC dominance sign wrong for alts** `route.ts:1697-1708`. Also +15 vs -10 asymmetry.
7. **Hammer vs hanging man collision** `route.ts:752`. Bearish hanging man undetectable.
8. **OI change signed bullish regardless of price** `route.ts:1838`.
9. **Direction-neutral volume quality signals encoded as bullish** `route.ts:1427-1444`.
10. **Divergence detector bullish-first return** `route.ts:674-682`.
11. **Funding threshold asymmetry** `route.ts:1482-1488`.
12. **Golden cross never expires** `route.ts:1182-1191`.
13. **WAIT plan always long-shaped** `route.ts:3260-3269`.
14. **Hot scanner cannot show SHORT** `hot/route.ts:126` (consequence of bug 1).
15. **Recommendation "mixed" text fires on strong bearish boards** `recommendation.ts:350` (consequence of bug 1).
