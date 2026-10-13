# Signal engine audit: call accuracy

Date: 2026-10-13. Scope: `src/lib/signals/engine.ts` (5222 lines, ENGINE_VERSION `2026.10.12-regime`), `orderflow.ts`, `factors.ts`, `setup-tracker.ts`, `src/lib/ta/*`, `src/lib/macro/{service,impact,regime,surprise,confirmation}.ts`, `src/lib/catalyst-news.ts`, `src/lib/news-sentiment.ts`, `src/lib/economic-calendar.ts`, `src/app/signals/{recommendation.ts,VerdictCard.tsx,dashboard.tsx}`, `src/app/api/signals/route.ts`, `src/instrumentation.ts`, `scripts/backtest.ts`, the four 2026-10-12 backtest JSONs, and two live probes (OKX, Strike). Read-only; nothing in `src/` was changed.

Line numbers refer to the files as of this date.

## 0. Headline

The engine is a 17-factor weighted average of mostly overlapping technical votes. Confidence is `50 + |weightedScore| / 2`, and because the factors disagree with each other by construction (mean-reversion votes against trend votes inside the same average) the magnitude is compressed: **every one of the 611 closed backtest signals landed in confidence 60 to 67 and grade B**. Confidence carries no outcome information in the harness (conf 60: +0.02R net, conf 61: +0.57R, conf 63 to 65: negative). The thin edge the backtest shows (+0.15R, PF 1.22) is entirely LONG (+0.30R, PF 1.43); SHORT is -0.25R, PF 0.67 even with the HTF-bear gate, and the single worst bucket is SHORT in a "Transition" regime (-0.41R, n=62).

Two live bugs were confirmed by probing the feeds, not just by reading code:

1. **OKX stat arrays are newest-first; the engine reads them oldest-first.** `engine.ts:4545-4573` treats `data[data.length-1]` as the latest row, so the long/short ratio and open interest fed to the score are the OLDEST sample in the response, and both `longShortChange` and `okxOIChange` have their **sign inverted**. These feed `scoreLiquidation` (`:1990-2003`) and the anticipatory OI divergence. Fix is three lines.
2. **Strike funding is per hour, not per 8h.** The live mark payload returns `r = -0.0000178` with next funding `T` 56 minutes away (OKX same moment: 0.0000413 per 8h). `FUNDING` thresholds at `:929-933` are documented as per-8h, so ELEVATED (0.0003) is really 0.24% per 8h and HIGH is 0.64% per 8h. The derivatives factor and the squeeze detector effectively never fire.

Beyond bugs, the single largest structural issue is that **nothing in the live call has ever been validated by the harness except the candle factors**: the macro bonus (up to +20 confidence, asymmetric), the macro-event weights (0.28 of the denominator for BTC/GOLD/OIL even with no event), headline sentiment (14% BTC, 22% OIL, half of it built on price-reporting headlines) and every grade above B exist only in production.

---

## 1. Scoring model

### 1.1 Factor inventory (crypto defaults, `engine.ts:3350-3375`)

| Factor | Weight | Inputs | Range logic | Overlaps with |
|---|---|---|---|---|
| marketStructure `:1427` | 0.13 | 15m EMA 9/21/50 stack ±40, Supertrend ±25, price vs EMA9 ±10, S/R proximity ±15 | clamp ±100 | HTF (same EMA stack on 1h/4h/1d), taSystem.marketStructure, regime 200MA, momentum trendDir15m, timeframeOutlook |
| momentum `:1479` | 0.11 | RSI14 ±35/±15, MACD hist ±20, StochRSI K ±20 and K>D ±10, 5m RSI ±8, RSI 70-cross +15 in bull regime | clamp ±100 | StochRSI is a function of the same RSI series; MACD hist reappears in divergences, analyzeSingleTimeframe, taSystem.macdZeroCross; RSI reappears in HTF (1h/4h ±10), Bollinger (±10 lean), divergences, confluence |
| volume `:1556` | 0.10 | candle-colour "CVD" ±30, spike ±15/10 signed by CVD, vol trend ±15, DRY haircut ×0.6 | clamp ±100 | taSystem.volumeClimax; the "CVD" is not CVD (see 4.4) |
| derivatives `:1624` | 0.08 | funding ±30/±10, put/call ±25 (BTC only) | zeroed when both null | liquidation squeeze flags; dead in practice (unit bug) |
| htf `:1665` | 0.08 | EMA stack 1h/4h/1d ±20 each, alignment ±15, RSI 1h/4h ±10 | clamp ±100 | marketStructure, regime, timeframeOutlook |
| bollinger `:1709` | 0.07 | price at band ±35, else RSI lean ±10, squeeze+funding ±20 | | momentum (RSI again), derivatives (funding again) |
| divergences `:1748` | 0.07 | RSI 15m 20, RSI 1h 30, MACD 25, volume 20 (hidden ×0.7) | clamp ±100 | momentum inputs |
| sentiment `:1786` | 0.03 (0.14 with catalyst engine, 0.22 OIL) | F&G ±40, news ±40, headline score ±100 | blended | headline score partly a lagged price read (3.3) |
| marketData `:1848` | 0.05 | BTC dominance ±15, sign flipped for alts | | |
| patterns `:1871` | 0.05 | single-candle pattern ±40 | | taSystem (engulfing/sweeps), 15m only, one bar |
| etf `:1895` | 0.05 | Coinglass net flow | always null: endpoint needs a key (`:4310-4314`) | dead weight removed from denominator correctly |
| liquidation `:1937` | 0.05 | L/S ratio ±30/15, L/S change ±15, top traders ±10, OI×price ±10, taker ±15, liq split ±20 | sign-inverted inputs (bug 1) | |
| elliott | 0.08 × (0.25..1) × (1 or 0.5) | `analyzeElliottMTF` consensus | heuristic, 1203 lines, no harness evidence it helps | taSystem exhaustion patterns |
| taSystem `:2870` | 0.09 | 19 indicators in 2 groups across 15m/4h/1d | reversal logic | Ichimoku (0.3) also in regime (0.4 pillar); Supertrend/Chandelier/PSAR/Keltner/Donchian are five ATR-trailing trend followers |
| regime `:3129` | 0.05 (×1.2 non-crypto) | Ichimoku 0.40, 200MA 0.35, ADX/DI 0.25 per TF, 15m 0.2 / 4h 0.4 / 1d 0.4 | sign-symmetric | taSystem.ichimoku, HTF, marketStructure |
| macro / event / confirmation | 0.08 / 0.12 (×2 for 30 min after a print) / 0.08 | `macro/service.ts:326-375` | BTC, GOLD, OIL only | constant denominators (3.1) |
| catalyst | 0.02 (excluded from weightSum `:3499`) | calendar proximity, weekend | confidence haircut only, max -10 | |

Effective denominator for BTC with F&G and news live, no event: 0.13+0.11+0.10+0.08+0.08+0.07+0.07+0.14+0.05+0.05+0.05+0.08·k+0.09+0.05+0.08+0.12+0.08 ≈ 1.31. For ETH the same board sums to ≈ 1.03. The macro block adds 0.28 to BTC's denominator whether or not a release exists (`service.ts:371` always returns `macroBase`/`eventBase`/`confirmationBase`), so **identical technical evidence scores ~21% lower confidence on BTC, GOLD and OIL than on any other symbol**.

### 1.2 Double counting, concretely

- **One EMA stack, five votes.** 15m EMA9>21>50 is +40 in marketStructure, sets `trendDir15m` for momentum's regime switch (`:3347`), is the HTF rule on 1h/4h/1d (`:544-554`, `:1673-1677`), is the `trend` in `analyzeSingleTimeframe` (`:2630-2635`), and SMC structure inside taSystem. A trending 15m chart therefore pushes ~0.13+0.08+0.09 of the weight the same way before any independent evidence is read.
- **One RSI series, six votes.** RSI (`:1510-1522`), StochRSI of that RSI (`:1532-1541`), 5m RSI (`:1543`), RSI 1h/4h in HTF (`:1687-1697`), RSI lean inside Bollinger (`:1728-1732`), RSI divergence 15m and 1h (`:1775-1776`), plus CCI and Williams %R in the exhaustion group, which are RSI-shaped oscillators.
- **Ichimoku twice** (taSystem weight 0.3 at `:4617`; regime pillar 0.40 at `:3058-3078`), **200MA twice** (regime pillar; deathGoldenCross inside taSystem is zeroed at `:4617`, good), **ADX three times** (`isWait` gate `:3710-3713`, regime pillar, regime damping `:3168`), **funding twice** (derivatives, squeeze inside Bollinger).
- **Opposed philosophies in one average.** RSI<30 is +35 (buy the dip, `:1510`), lower band is +35 (`:1716`), but in the same bar the EMA stack, Supertrend, HTF, taSystem and regime say bear. The average lands near zero. That is why the magnitude distribution is so narrow and why "confidence" ends up meaning "how few factors disagreed", not "how likely is TP1".

### 1.3 Look-ahead and repaint

- Closed-candle discipline is correct: `closedCandles` (`:66-71`) drops the forming bar on every TF in both live (`:4360-4365`) and `scoreFromCandles` (`:5115-5119`). `currentPrice` uses the mark (`:4368`) which is fine.
- `detectCandlestickPattern` (`:826`), `liquiditySweep`, `detectDivergence` and the order-block scan operate on the last closed bar, so they do not repaint intrabar, but they **flip every 15 minutes**. There is no persistence: a hammer at bar t is +40 at t and 0 at t+1 with no decay. Patterns are therefore mostly noise in a 15-minute re-scoring loop. Proposal: score the pattern with a 3-bar exponential decay (40, 24, 14) and require the next close to hold the pattern's extreme.
- HTF alignment has a subtle leak: 1h klines are fetched with `limit=100` (`:4263`), so EMA50 on 1h is seeded on bars that are themselves inside the sample; combined with the SMA-seeded `ema()` this is fine for direction but `classifyTrend` on 100 bars is noisier than on 4h (400 bars). Not look-ahead, but inconsistent warm-up.
- The backtest aggregates Binance.US spot 5m into 15m/1h/4h (`backtest.ts:98-116`) while live uses Strike perp candles. Daily candles come from Binance.US 1d directly. Wicks and volumes differ; this is disclosed in the report caveats and is acceptable.
- No look-ahead in the fill model; `simulate()` (`backtest.ts:139-205`) matches `check/core.ts` conventions. One asymmetry: same-candle stop and TP resolves as the stop (conservative), and a limit fill candle never counts towards targets. Good.

### 1.4 Direction, confidence, grade

- `weightedScore` sign picks the side (`:3717-3730`); `confidence = 50 + |ws|/2 + whipsaw + catalystHaircut` (`:3526`); preEventRisk caps at 69 (`:3530-3533`); counter-regime soft gate ×0.85 (`:3743`); macro bonus ±(20/10) (`:3797-3806`); grade from `gradeFor(confidence, strongCategories)` (`:1409-1415`, `:3815`).
- `strongCategories` counts factors whose label agrees with the side, where "Bullish" from momentum needs score > 20 but "Bullish" from sentiment needs > 10 and "Slightly Bullish" from marketStructure counts as 0 (`ASSESSMENT_DIR` has no entry for "Slightly"). A+ therefore depends on which bucket labels happened to cross arbitrary per-factor thresholds (`:3548-3700`).
- Grade A requires confidence ≥ 75, i.e. |ws| ≥ 50 before bonuses. In 611 candle-only decisions it never happened. Live A grades come from the macro bonus (+20) and from the catalyst override forcing 55. **No A or A+ has ever been produced by the validated path.**
- Publish threshold 60 (`:3711`), logging threshold 55 (`:4807`): the gap is dead code since `isWait` already forces WAIT below 60. Logging at 55 cannot happen.

### 1.5 Arbitrary thresholds that matter

`:1510-1522` RSI 30/40/60/70; `:1536` StochRSI 20/80; `:1575-1580` spike labels; `:1627-1639` funding (wrong unit); `:1960-1972` L/S 0.5/0.7/1.5/2.0 (OKX account ratio sits 1.3 to 2.0 for BTC most of the time, so "crowded longs" is the default state); `:2018-2027` liquidation split 70/30; `:3536` ADX 20/25; `:3710-3713` the WAIT gate's `trend1h !== trend4h && adx < 20`. None of these were swept. The only swept parameters are the five in `Tuning` (`:29-47`).

### 1.6 Proposed scheme

Replace the 17-way average with three orthogonal blocks and one gate layer. Direction comes from one block; the others only modulate size and timing.

```
// engine.ts, replacing computeMultiFactorCall's weights/weightedScore block (:3350-3521)
TREND  = 0.35*htfStack(4h,1d)  + 0.35*regime.score + 0.30*taSystem.trendScore        // one vote per idea; drop 15m EMA stack, Supertrend, marketStructure
TIMING = 0.40*bbPercentB15m    + 0.30*rsi15mZ       + 0.30*distanceToLevelAtr         // mean-reversion/location only; signed toward the TREND side
FLOW   = 0.35*cvdSlope(OKX)    + 0.25*oiDeltaSigned + 0.20*fundingZ + 0.20*bookImbalance
score  = sign(TREND) * ( 0.55*|TREND| + 0.25*max(0, TIMING·sign(TREND)) + 0.20*max(0, FLOW·sign(TREND)) )
```

Rules: a counter-TREND call requires `taSystem.setup === "reversal_confirmed"` (keep `:3732-3752`). Patterns, divergences, Elliott, F&G, BTC dominance move to the "but watch" list unless an ablation proves otherwise (1.7). Headlines and macro become multipliers on size and a gate (section 3), not votes.

### 1.7 Calibration method that fits the harness

The harness already walks every closed 15m bar and simulates outcomes. Add a decision dump and a calibrator:

1. `scripts/backtest.ts`: after `scoreFromCandles` (`:273-283`) push every decision (not only published signals) into `decisions[]` with `{t, symbol, weightedScore, factors: r.factors (score per factor, not label), regimeLabel, adx, hourUtc, weekend}`. Run `simulate()` on a synthetic trade for both sides using the engine's own stop/TP ladder so each decision gets a label `y = 1 if TP1 before stop within 24h for the engine's side`. Write `decisions-<stamp>.json`.
2. `scripts/calibrate.ts` (new, ~120 lines, no deps): fit a logistic regression by gradient descent on the first 60% of decisions by time, features = per-factor scores (continuous, not labels) + regime one-hot + hour block; evaluate on the last 40%: Brier score, log-loss, reliability table in 5-point bins, and AUC. Baseline to beat: the current `50 + |ws|/2` mapped to probability via `p = conf/100`.
3. Report `confidence = round(100 * p_calibrated)` and publish only when `p ≥ 0.55` **and** expected R at the engine's ladder is positive. This replaces `minPublishConfidence` with a measurable quantity.
4. Ablation: re-run with each factor's weight set to 0 (`setTuning` already exists; extend `Tuning` with `factorOverrides: Partial<Record<string, number>>`). Keep a factor only if removing it worsens out-of-sample log-loss. Expect Elliott, patterns, 5m RSI and marketData to fail this test.

Cost: one engineering day; runs in the existing cache (`data/backtests/cache`), no new data.

---

## 2. Regime handling

Evidence from the 2026-10-12 60-day run (regimeWeight 0, gate off, 470 closed trades; slices computed from `trades[]`):

| Slice | n | net R | PF | TP1 |
|---|---|---|---|---|
| LONG / Bull regime | 216 | +0.23 | 1.33 | 44% |
| LONG / Transition | 62 | +0.55 | 1.93 | 52% |
| SHORT / Transition | 62 | **-0.41** | 0.51 | 32% |
| SHORT / Mixed | 47 | -0.09 | 0.87 | 34% |
| SHORT / Bear regime | 10 | -0.37 | 0.34 | 50% |
| Weekday | 342 | +0.20 | 1.30 | 44% |
| Weekend | 128 | **+0.02** | 1.03 | 37% |
| 00-08 UTC | 149 | +0.32 | 1.47 | 44% |
| 13-16 UTC | 64 | +0.37 | 1.56 | 45% |
| 21-24 UTC | 61 | **-0.10** | 0.87 | 39% |
| First 30 days | 235 | +0.25 | 1.40 | 47% |
| Last 30 days | 235 | +0.06 | 1.08 | 38% |
| limit entry | 283 | +0.20 | 1.23 | 35% |
| market entry | 187 | +0.09 | 1.18 | 54% |

Where signals should be suppressed or flipped:

1. **SHORT outside a Bear regime.** `shortNeedsHtfBear` (`:3724`) uses the 1h/4h EMA stack, which says "bear" inside Transition regimes constantly. Replace with `regimeInfo.label === "Bear regime" || taSystem.setup === "reversal_confirmed"`. Expected effect from the slices above: removes ~109 shorts at -0.26R average, +28R on the 60-day sum.
2. **Chop filter.** `isWait` already blocks `volatility_compression && adx < 20` and 1h/4h disagreement under ADX 20 (`:3710-3713`), and `computeRegime` damps ×0.6 under ADX 20 on both 15m and 4h (`:3168-3171`). What is missing is a *range-position* rule: in "Mixed" with ADX<20, only allow entries within 0.5 ATR of a swing level on the TIMING block (section 1.6). Today a mid-range Mixed call is published at 60.
3. **Pre-event windows.** Three mechanisms exist and none gates: (a) `getEventBlackout` (`:1203-1216`) is a hard-coded 2026 FOMC/CPI/NFP list, ±30 min, crypto only, and only `unshift`s a reasoning line (`:4689-4691`); (b) `preEventRisk` (`service.ts:458-459`) caps confidence at 69 for BTC/GOLD/OIL inside 15 min of a high-importance release; (c) `computeCatalystScore` (`economic-calendar.ts:276-296`) at most -40 score → -4 confidence (`:3525`). Proposal: one gate in `computeMultiFactorCall` for every symbol: `if (nextHighImpactMinutes <= 30) bias = "WAIT"` and `if (<= 120) sizeMultiplier = min(size, 0.5)`; source the time from `getUpcomingEvents` (already called) and delete the hard-coded list.
4. **Funding extremes.** With the unit fixed (4.2), block same-side entries: `fundingRate > FUNDING.HIGH` blocks LONG, `< -FUNDING.HIGH` blocks SHORT, instead of a -30 vote that gets averaged away. Keep the vote for the softer ELEVATED band.
5. **Liquidation cascades.** `scoreLiquidation` (`:2018-2027`) gives +20 when ≥70% of liquidations were longs ("reversal potential"), which argues for buying into a cascade. `recommendation.ts:396-404` already warns "entering mid-cascade is late". Make the engine consistent: if `liq.h1` is one-sided (≥65%) and `h1` USD ≥ 25% of the 24h window, WAIT for one closed 15m bar that does not make a new extreme; then allow the fade. Needs `liqSummary.h1` passed into the call (it is already computed, `orderflow.ts:109-115`).
6. **Hours.** Weekend edge is zero and 21-24 UTC is negative. Cheapest change: `sizeMultiplier *= 0.5` on weekends for crypto and WAIT in 21-24 UTC unless TREND and FLOW agree. Non-crypto already gets -30 catalyst score on weekends (`economic-calendar.ts:266`), but that is only a -3 confidence haircut; markets are closed, it should be WAIT.
7. **Decay.** The second 30 days were +0.06R. The engine has no notion of its own recent hit rate. Add a per-symbol rolling 20-signal realized-R from `signal-history.json` (`computeStats` already exists) and halve size when it is ≤ 0. It is a guardrail, not alpha.

---

## 3. Macro and catalyst integration

### 3.1 How the pieces feed the call today

- `surprise.ts:17-20`: z = (actual − consensus)/typicalSD, score = 100·tanh(z/1.8). Sound.
- `impact.ts:20-140`: surprise → (r, g, o) shocks with regime modulation → `assetScores` (`:142-151`) → ×relevance. Sound and documented.
- `service.ts:337-363`: verified releases in the last 6h, weighted by importance × 2^(−age/120min); `decayWeight` (`:317-324`) doubles the event weight for 30 min then decays linearly to base at 240 min. Confirmation score = (pct−50)·2·sign, ×0.3 if fading, forced negative if reversing.
- Engine: three extra votes with weights 0.08/0.12/0.08 (`:3419-3423`), always in the denominator. Pre-event cap at `:3530`.

Issues:

1. **Dilution.** Covered in 1.1. Fix in `scoresFor` (`service.ts:371`): return `event: 0, weights.event: 0` when `eventW === 0`; `confirmation: 0, weights.confirmation: 0` when `confW === 0`; `weights.macro: 0` when `regime.confidence === "low"` or `macro === 0`. The engine already drops zero weights from the denominator.
2. **Half-life vs boost double counting.** A fresh print gets both the 2× weight boost and full half-life weight; a 3-hour-old print gets 0.35× from the half-life and ~1.2× from the boost curve. The two curves are redundant; keep the half-life (it is per-event) and drop the boost (it is per-asset and only looks at the youngest print).
3. **Event score with no confirmation is treated the same as a confirmed one** in the weighted sum. Multiply the event vote by `0.5 + 0.5·max(0, confirmationPct/100)` once reactions exist; the UI already distinguishes these states (`recommendation.ts:251-266`).
4. **Prediction-market odds should feed `policyBias`, but as a change, not a level.** `regime.ts:21-33` reads policy from the 2Y 5-day change, 2s10s and DXY. Kalshi/Polymarket cut probabilities for the next meeting are a cleaner, keyless read of the same thing, and the level is already priced. Proposal in `regime.ts`: add `cutProbChg5d` to `RegimeInputs`; `easing` if `cutProbChg5d >= +0.15`, `tightening` if `<= -0.15`, with the 2Y rule keeping precedence; persist a daily snapshot of `fed[0].cutProb` in `macro/history.ts` to get the 5-day delta. Do not put odds in the engine as a vote: a 90% priced cut is not bullish information.
5. **Headline engine is partly a lagged price indicator.** Every asset config carries a GENERAL rule whose bullish/bearish vocab is `PRICE_UP`/`PRICE_DOWN` (`catalyst-news.ts:186-192, 295, 402, 512`), so "Bitcoin surges to record high" scores +25..+55 at impact low and lands in the 72-hour recency-weighted mean (`:971-990`). `attachReactions` (`:856-866`) computes `confirms` per headline but nothing uses it. Proposals: (a) exclude GENERAL from `netScore` (keep it for the panel); (b) weight each headline by `confirms === false ? 0.3 : 1` so narratives the market already rejected stop voting; (c) replace the 2/1.25/1 recency steps with the same 2^(−age/half-life) decay as macro (half-life 6h for OIL, 12h for BTC), otherwise a 70-hour-old headline still carries full unit weight.
6. **Catalyst override** (`:3771-3789`): |headline score| ≥ 50 flips the bias and sets confidence to at least 55, which is below the publish threshold, so the override produces a call that `isWait` would have rejected. Either raise to `minPublishConfidence` or drop the override and let the size multiplier do the work.

### 3.2 Gaps, with keyless source and exact feature

| Gap | Keyless source | Feature to compute | Where it goes |
|---|---|---|---|
| Implied vol | Deribit `public/get_volatility_index_data?currency=BTC&resolution=3600` (DVOL) | DVOL 30-day percentile and 24h change | Stop multiplier `stopMult *= 1 + 0.3·(pctile−0.5)`; size ×0.5 when 24h change > +15% |
| Options expiry / max pain | Already fetched: `get_book_summary_by_currency` (`:4297`) has OI per strike | Max-pain strike = argmin Σ OI·|S−K|; hours to nearest Friday 08:00 UTC expiry | Gate: within 6h of a monthly/quarterly expiry, cap targets at max pain and halve size |
| ETF flows | Coinglass call is dead (`:4310`). Keyless alternative: Farside daily table (HTML, scrape) | 5-day net flow z-score | Replace `scoreETFFlows`, or delete the factor and the request |
| Stablecoin supply | DefiLlama `https://stablecoins.llama.fi/stablecoins?includePrices=true` | 7-day % change of USDT+USDC circulating | Macro block input, slow (daily cache) |
| Funding history / z-score | OKX `/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=100` | funding z vs 30-day mean | Replaces fixed thresholds in `scoreDerivatives` |
| OI / price divergence | Already fetched (`:4305-4307`), just parsed in the wrong order | 24 × 1H OI series: OI Δ% vs price Δ% over 4h and 24h | `scoreLiquidation` after the order fix |
| CVD (real) | OKX `rubik/stat/taker-volume-contract` already fetched with `limit=5` (`:4308`); raise to 24 and add `period=5m` call | Taker buy−sell cumulative over 4h, slope over last hour | Replaces the candle-colour CVD at `:658-661` |
| Basis | OKX `/api/v5/market/ticker?instId=BTC-USDT-SWAP` vs `BTC-USDT`, and the dated future `BTC-USDT-<yymmdd>` | perp basis bp; annualized quarterly basis percentile | Flow block; extreme positive basis blocks LONG adds |
| Order-book imbalance | Already computed (`orderflow.ts:160-170`), only used in UI copy | `depth[last].imbalance` within 2% | Flow block, weight 0.2 |

All of these are one HTTP call each, 45-60s cached, and fit the existing `fetches[]` batch (`:4255-4342`).

---

## 4. Data quality

1. **OKX ordering bug (confirmed live).** `engine.ts:4545-4573`. Fix:
   ```ts
   const asc = (rows: string[][]) => [...rows].sort((a, b) => Number(a[0]) - Number(b[0]));
   // then use asc(okxLSRaw.data) / asc(okxOIRaw.data) and keep data[length-1] as latest
   ```
   The taker-volume sum (`:4576-4585`) is order-independent and unaffected. Add a unit test in `__tests__/engine.test.ts` with a descending fixture.
2. **Funding unit (confirmed live).** Strike's `T` advances hourly and `r` is ~8× smaller than OKX's 8h rate at the same moment. Either multiply `strikeFunding` by 8 at `:4372` with a comment, or redefine `FUNDING` per hour. The dashboard prints `r·100` as a percentage; label it "/h".
3. **Synthetic daily OHLC for the macro layer.** `fetchMacroSignals` (`:1228-1241`) builds daily candles from CoinGecko close-only prices and fabricates high/low as close ± 0.5·|Δclose| and open = close. The weekly stochastic (`:1053-1120`), weekly engulfing (`:1317-1322`) and `computeMacroRegime` structure all run on invented wicks. Strike's own `1d` klines are already fetched with 400 bars (`:4270`) and have real OHLC; for BTC pass `candlesDaily` instead. For alts the macro state is BTC's anyway (`:4587`), so cache one BTC series.
4. **"CVD" is candle colour.** `:658-661` sums volume signed by close ≥ open. That is not order flow; it is a volume-weighted momentum proxy, and it is the single largest vote inside the volume factor (±30). Replace with the OKX taker series (3.2).
5. **Sequential awaits after the parallel batch.** `:4587`, `:4594`, `:4596`, `:4597-4606` run one after another (macro signals, calendar, macro scores, next oil event). Each is cached but a cold cache costs up to four round trips. Move them into `fetches[]`.
6. **Binance requests on every crypto run.** `:4316-4322` fire three calls that return a 200 with `code: 0, msg: "Service unavailable from a restricted location"` (confirmed). They parse to null but cost three sockets per symbol per run across 15 crypto symbols every 15 min. Remove them or guard with an env flag.
7. **Dead ETF fetch.** `:4310-4314` Coinglass v3 without a key; always null.
8. **Error swallowing that zeros a component silently.** `computeTaSystem` (`:2877-2882`) and `computeRegime` (`:3148-3153`) `try/catch` and `continue`, so a thrown indicator removes a whole timeframe from the blend with no note; `analyzeElliottMTF` (`:4610-4615`) likewise. `getMacroScores(...).catch(() => null)` (`:4596`) drops the 0.28 weight silently, which, given 3.1, *raises* BTC confidence when the macro service is down. Log a `degraded: string[]` array on the response and show it in the verdict.
9. **Stale-cache semantics.** `fetchMacroSignals` returns the stale copy forever on error (`:1356-1358`); `orderflow.ts:360-392` keeps stale samples with no age stamp exposed to the engine. Add `asOf` and treat anything older than 3× TTL as null.
10. **Timezone.** Calendar math is UTC throughout (`economic-calendar.ts:261-262`, `MACRO_EVENTS_2026` with hand-adjusted DST hours `:1163-1197`). Hand-maintained DST is brittle; the macro calendar in `lib/macro/calendar.ts` already has these events with correct times, so the duplicate list should go.
11. **Rate limits.** 31 symbols × ~20 external calls every 15 minutes plus page traffic at 25s cache. CoinGecko `/global` (`:4306`) is called per symbol and is rate-limited at ~30/min on the free tier; cache it process-wide for 5 minutes. `api.alternative.me` F&G likewise.
12. **Candle time units.** `closedCandles` (`:66-71`) tolerates seconds or ms, `parseKlines` (`:142-153`) does not normalize, and `check/core.ts:74` does. Normalize once in `parseKlines`.
13. **Logger dedupe allows one open LONG and one open SHORT per symbol** (`logger.ts:216-223`), so the history can hold two live, contradictory calls for the same symbol. Treat an opposite-bias open record as a flip that closes the prior one at the current price.

---

## 5. UI auditability of calls

What works: `VerdictCard.tsx` shows direction, grade, confidence bar, plan, three "why" reasons with jump links, one "wrong if", next catalyst, track record (`:95-205`); `recommendation.ts` tallies factor votes and ranks reasons by weight. `RegimeStrip` surfaces cloud/200MA/ADX. `setup-tracker.ts` stamps `calledAt` on horizon setups.

What is missing for a reader to audit a call:

1. **The numbers behind the verdict are hidden.** Factor rows carry a label and an integer weight (`:3548-3700`) but not the score. Export `score` per factor and show a signed bar per factor (weight × score / weightSum) so the reader sees which three factors produced the sign. This is the "what drove it" view and it is a 20-line change in `signalFactors` plus one component.
2. **"What flips it" is not computed.** Add `flipDistance`: for each factor, the score change that would flip `sign(weightedScore)`; show the two smallest. The data is all present in `computeMultiFactorCall`.
3. **Invalidation is generic.** `invalidates` (`:4020-4060`) is "loss of support X", "MACD cross", "funding spike". It never cites the *stop* or the regime condition that gated the call. Make the first invalidation the stop level with the structural reason (`nearestSupport - buf`), the second the counter-regime condition if `regimeInfo.gate !== "none"`.
4. **Expected hold time is a guess.** `expectedDuration` (`:2823-2826`) is `primaryTF × 10 bars`; `recommendation.ts:443-453` maps trade type to "hours / 1-3 days". The backtest has real `timeToTp1` per trade (`closedAt − filledAt`); publish the median by symbol × bias × regime from the latest backtest JSON and show "median time to T1: 3h 40m (n=52)".
5. **Confidence is shown as "confidence that this direction plays out"** (`VerdictCard.tsx:110`). It is not that until section 1.7 lands. Until then label it "evidence strength" and show the track-record bucket next to it; the data (`stats.byGradeSymbol`) already reaches the card.
6. **Degraded feeds are invisible.** Section 4.8: show a small "feeds down: macro, order flow" line on the card.
7. **Engine version and decision inputs are not retrievable.** `appendSignal` stores factor labels only (`:4821`). Store the per-factor scores and `weightedScore`; that is what makes a logged call reproducible.

---

## 6. Top 10 changes, ranked by expected accuracy gain per engineering hour

| # | Change | Where | Why (evidence) | How to measure | Hours |
|---|---|---|---|---|---|
| 1 | Sort OKX stat arrays ascending before reading `latest` / `older` | `engine.ts:4545-4573` | Confirmed newest-first; L/S and OI change signs inverted, L/S ratio stale | Unit test with descending fixture; compare live `positioning.openInterestChange` sign against OKX UI | 0.5 |
| 2 | Fix funding unit (×8 or per-hour thresholds) | `engine.ts:929-933, 4372` | Confirmed hourly `T` cadence; derivatives and squeeze factors never fire | Count of non-zero `deriv.score` over a day before/after | 0.5 |
| 3 | Drop macro/event/confirmation weights from the denominator when their scores are zero | `macro/service.ts:371` | BTC/GOLD/OIL confidence compressed ~21% vs peers with identical technicals | Confidence histogram per symbol before/after | 0.5 |
| 4 | SHORT only in Bear regime or with confirmed reversal | `engine.ts:3724` | SHORT/Transition -0.41R n=62, SHORT/Mixed -0.09R n=47, SHORT overall PF 0.67 | `npm run backtest -- --days 60` byBias and byRegime | 1 |
| 5 | Decision dump + logistic calibration + ablation | `scripts/backtest.ts:273-283`, new `scripts/calibrate.ts` | All 611 signals were conf 60-67 grade B; conf has no monotonic relation to R | Out-of-sample Brier / log-loss vs `conf/100` baseline | 8 |
| 6 | Real CVD and OI series from OKX; book imbalance into the score | `engine.ts:658-661, 4305-4308`, `orderflow.ts:160-170` | Volume factor's ±30 vote is candle colour; order flow already fetched and unused | Ablation in #5; live: correlation of CVD slope with next-4h return | 4 |
| 7 | Event gate for every symbol (WAIT ≤30 min, half size ≤2h); delete hard-coded 2026 list | `engine.ts:1163-1216, 3525, 4689` | Three mechanisms, none gates; max effect today is -4 confidence | Backtest with calendar replay (calendar.ts has history) | 3 |
| 8 | Collapse overlapping factors into TREND / TIMING / FLOW blocks | `engine.ts:3350-3521` | EMA stack votes 5×, RSI 6×, Ichimoku 2×; opposed philosophies average to zero | Backtest net R and confidence spread; #5 log-loss | 12 |
| 9 | Weekend half size, 21-24 UTC gate, non-crypto weekend WAIT | `engine.ts` after `:3792`; `economic-calendar.ts:266` | Weekend +0.02R n=128; 21-24 UTC -0.10R n=61 | byHour / byWeekend slices (add to `backtest.ts` summary) | 1 |
| 10 | Headline engine: exclude GENERAL price-reporting rule from net, weight by `confirms`, exponential decay | `catalyst-news.ts:186-192, 856-866, 971-990` | 14-22% weight partly tracking price itself; rejected narratives keep voting | Log headline score vs next-24h return for OIL/BTC over 30 days (already stored in `context.oilGeoScore`) | 3 |

Latency and cost notes: #1, #2, #3, #4, #9 are free at runtime. #6 adds one OKX call (5m taker volume) per crypto symbol; drop the three dead Binance calls and the dead Coinglass call (4.6, 4.7) and the batch gets smaller, not larger. #7 removes a duplicated calendar. #8 reduces per-run CPU (fewer indicator passes) and makes `computeMultiFactorCall` testable. The macro bonus (`:3797-3806`, up to +20 confidence, -10 against, crypto only, driven by BTC's synthetic daily candles) should be frozen at 0 until #5 can score it; it currently inflates grades on the unvalidated path.

## Appendix: backtest facts used above

Source `data/backtests/backtest-2026-10-12-20-39-34.json` (60d, 8 symbols, conf 60, short gate on, cooldown 60m, regimeWeight 0, gate off). Overall 611 signals, 137 unfilled, 470 closed, TP1 42.3%, net +0.154R, PF 1.22, long share 73.6%. Exit reasons: stop_before_tp 251 (-1.27R avg), tp3 102 (+2.70R), stop_after_tp 52 (+1.48R), horizon 65 (+0.62R). Regime weight 0.05 run (`...20-42-33`): net +0.154R, PF 1.22; weight 0.10 (`...20-41-00`): +0.073R, PF 1.10. Local `data/signal-history.json` holds 3 legacy records (all LONG, grade C, unversioned) and is not usable as live evidence.
