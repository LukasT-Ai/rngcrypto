# Macro and Event SHORT Regimes

Date: 2026-10-06. Scope: BTC, GOLD, WTI. Status: module implemented and tested, integration spec only (nothing under `src/lib/macro` or the signals route was changed, nothing committed).

Files created:

- `src/lib/ta/macro-regime.ts`
- `src/lib/ta/__tests__/macro-regime.test.ts`

## 1. Research summary, ranked by reliability

Ranked by evidence quality and tradeability, not popularity.

| Rank | Signal | Rule | Directional edge | Reliability and caveats |
|---|---|---|---|---|
| 1 | Real-yield surge vs BTC and gold | 10Y TIPS real yield rising sharply on a hot CPI, strong NFP or hawkish FOMC | Short gold first, BTC second | BTC vs 10Y TIPS 90-day correlation reached about -0.95 in 2022 ([CoinDesk](https://coindesk.com/markets/2022/09/19/goldmans-bullish-stance-on-real-bond-yield-spells-bad-news-for-cyrpto/)). Gold is more rate-sensitive than BTC in 2026 data, -0.41 vs -0.17 correlation to 10Y yield changes ([Crypto Briefing](https://cryptobriefing.com/bitcoin-zero-correlation-bond-yields/)). Strong NFP pushed real yields up and gold below $2,000 on the print ([FXCM](https://www.fxcm.com/uk/insights/nfp-data-pushed-up-real-yield-which-rippled-through-to-the-usdollar-and-gold/)). |
| 2 | Funding and open interest blow-off | Funding above 0.03% per 8h for 3+ days, OI within 10% of its peak, estimated leverage ratio above the 75th percentile | Short BTC with a tight stop, expect a cascade | Every major cascade since 2020 was preceded by these conditions; funding above 15% APR preceded corrections ([Axel Adler](https://axeladlerjr.com/bitcoin-liquidation-cascades-guide/), [Amberdata](https://blog.amberdata.io/leverage-liquidations-the-31b-deleveraging)). The Oct 10, 2025 cascade liquidated $2.3B in a day, 86% longs ([Coinchange](https://www.coinchange.io/blog/bitcoins-2-billion-reckoning-how-novembers-liquidations-cascade-exposed-cryptos-structural-fragilities)). Uses derivatives data the engine already fetches. |
| 3 | Surprise crude inventory build | EIA or API actual minus consensus at or above +1.5 SD (about +3.75 mb), Cushing build confirms | Short WTI on the print, intraday to 2 days | Consistent single-session reaction ([FXStreet Sep 2025](https://www.fxstreet.com/news/wti-declines-below-6300-as-weekly-eia-crude-inventories-unexpectedly-build-202509050234), [FXStreet Nov 2025](https://www.fxstreet.com/amp/news/wti-crude-oil-slides-below-60-after-eia-reports-surprise-inventory-build-202511051829)). A weak dollar can offset: a build with a falling DXY sometimes rebounds ([Benzinga](https://benzinga.com/news/22/08/28347022/oil-rebounds-on-thursday-morning-session-after-falling-to-multi-months-earlier-low-dragged-by-low-de)). |
| 4 | DXY breakout | DXY 5-day change above +1.5% or a close above the 20-day high | Short gold and BTC | Long-documented inverse relationship, confirmed through 2024 by NYDIG ([Ledger Mind](https://theledgermind.com/dollar-strength-impact-on-bitcoin/), [Cointelegraph](https://cointelegraph.com/markets/trading-bitcoin-can-be-tricky-here-s-3-key-macroeconomic-indicators-worth-following)). Correlation varies by regime, so use as confirmation, not a trigger. |
| 5 | Pi Cycle Top | 111 SMA crosses above 2 x 350 SMA | Cycle top within days; short BTC on a swing horizon | Called the 2013, 2017 and April 2021 tops within about 3 days ([LookIntoBitcoin](https://www.lookintobitcoin.com/charts/pi-cycle-top-indicator/)). Very rare, so high precision but tiny sample. Implemented as a cross event with a 45-day freshness window. |
| 6 | VIX spike, risk-off | VIX above 24 or S&P down 2.5% over 5 days | Short BTC and oil, gold mixed | BTC fell 33% from ATH as VIX crossed 27 with equities ([Block Scholes](https://www.blockscholes.com/premium-research/the-vix-bitcoin-atm-volatility-and-jgb-yields-all-spike-higher)). The regime classifier already encodes this threshold. Coincident rather than leading. |
| 7 | Weekly stochastic exhaustion | K falls back below 80 after 8+ weeks above, or K crosses below 20 after 8+ weeks above 20 | Short BTC, swing horizon | Mirror of the engine's own bullish 80-line cohort. Public evidence is thinner than for the bullish version. Overbought alone is not a sell: BTC spent 2020 to 2021 above weekly RSI 70 ([LCX](https://lcx.com/en/cryptonews/bitcoin-rsi-bullish-divergence-draws-2022-comparisons-as-analysis-weighs-new-pri), [Bitfinex](https://blog.bitfinex.com/products/chart-decoder-series-stochastic-oscillator-the-traders-radar-for-reversals/)). Only the loss of 80 after an extended stay scores. |
| 8 | MVRV Z-score and NUPL extremes | MVRV Z above 7, NUPL above 0.75 | Cycle-top warning: size down longs, allow shorts | 2013 top Z 9.3, 2017 Z 11.5, April 2021 only 6.3, Nov 2021 only 2.9, so the threshold drifts lower each cycle ([Babypips MVRV](https://www.babypips.com/crypto/learn/what-is-mvrv-z-score), [Babypips NUPL](https://www.babypips.com/crypto/learn/what-is-net-unrealized-profit-loss-nupl), [CryptoQuant](https://docs.cryptoquant.com/data-guide/utxo/net-unrealized-profit-and-loss-nupl)). Needs on-chain data not currently fetched. |
| 9 | ISM below 50, rising claims | ISM Manufacturing below 50 and falling; claims 4-week average up 10% or more | Short WTI and risk, gold neutral to long | ISM at 47.8 is read as a recession indicator ([Hellenic Shipping News](https://www.hellenicshippingnews.com/ism-reports-add-to-us-recession-fears/)), but ISM spent most of 2023 to 2024 below 50 without a recession ([Seeking Alpha](https://seekingalpha.com/article/4668586-ism-and-recession)). Regime-level input only. |
| 10 | Death cross (50 below 200 SMA) | 50 SMA crosses below 200 SMA | Weak as a short trigger | Lagging: the median death cross arrived 67 days after the top with price already down 27%; 7 of 12 saw a higher price 90 days later, median +29% ([TradeWize](https://tradewize.io/blog/bitcoin-golden-cross-death-cross), [Investing.com](https://www.investing.com/analysis/bitcoins-death-cross-signal-noise-or-opportunity-200670614), [BeInCrypto](https://beincrypto.com/bitcoin-death-cross-price-history-2025/)). Scored as regime confirmation with age decay, not as a trigger. |
| 11 | OPEC+ output hikes, contango, Cushing builds | Quota increase announcements; front month below second month; Cushing stocks rising | Short WTI, multi-week | Directionally reliable but usually priced on the leak, not the announcement. Headline matching exists in `oil-geopolitical-news.ts`. |

## 2. Module: `src/lib/ta/macro-regime.ts`

Pure functions over daily candles `{ time, open, high, low, close }`. No fetching, no caching.

### Exported API

```ts
computeMacroRegime(dailyCandles: DailyCandle[]): MacroRegimeResult
// {
//   score: number;            // -100..100, positive = bullish regime
//   bias: RegimeBias;         // "strong_bear" | "bear" | "lean_bear" | "neutral" | "lean_bull" | "bull" | "strong_bull"
//   signals: string[];        // one line per non-zero component, with its signed score
//   components: { name: string; score: number; note: string }[];
//   details: { cross, stochastic, ema21_377, weeklyEngulfing, structure, sma200SlopePct,
//              rangePosition, drawdownFromHigh, runupFromLow, piCycle };
// }
// bias thresholds: |score| >= 8 lean, >= 20 bull/bear, >= 40 strong

macroBonus(score: number, callBias: "LONG" | "SHORT" | "WAIT"): number
// aligned regime:  +min(round(|score| / 2), 20)        (score 40 = +20, same ceiling as legacy)
// opposing regime: -min(round(|score| / 4), 10) once |score| >= 15   (legacy was a flat -10 at >= 15)
// invariant: macroBonus(s, "LONG") === macroBonus(-s, "SHORT"); WAIT always 0

// also exported: ema, sma, buildWeeklyCandles, computeCross, computeWeeklyStochastic,
// computeEma21_377, computeWeeklyEngulfing, computeWeeklyStructure, computeSma200Slope,
// computeRangePosition, computePiCycle, biasFromScore, and all result types
```

### Components and symmetric weights

| Component | Bullish | Bearish |
|---|---|---|
| `weekly_stochastic` | +15 K crosses 80 after 8+ weeks below; +12 K reclaims 20 after 8+ weeks below (capitulation reset); +8 approach (K 70 to 80 after 8+ weeks below); +10 momentum (K >= 80), +6 once 12+ weeks extended | -15 K crosses 20 after 8+ weeks above; -12 K loses 80 after 8+ weeks above (exhaustion); -8 approach (K 20 to 30 after 8+ weeks above); -10 bear momentum (K <= 20), -6 once 12+ weeks extended |
| `sma50_200` | +10 golden cross, +5 shallow start (no 5.5% dip in first 10 days) | -10 death cross, -5 no relief bounce (no 5.5% rally in first 10 days) |
| | Age decay for both: full weight to day 45, 0.7 to day 120, 0.5 after. Faded to 40% when price has moved 10%+ against the cross. | |
| `ema21_377` | +8 EMA21 above EMA377, +3 price above both | -8 below, -3 price below both |
| `weekly_engulfing` | +5 | -5 |
| `weekly_structure` | +8 higher highs and higher lows (2-bar weekly pivots) | -8 lower highs and lower lows |
| `sma200_slope` | linear to +5 at +2% over 20 days | linear to -5 at -2% |
| `range_position` | linear to +6 at the top of the 365-day range | linear to -6 at the bottom; drawdown and run-up in the note |
| `pi_cycle` | +12 Pi Cycle Bottom cross (0.745 x 150 SMA below 471 SMA) within 45 days, +3 approach | -15 Pi Cycle Top cross (111 SMA above 2 x 350 SMA) within 45 days, -8 post-top regime, -8 within 5%, -4 within 10% |
| `confluence_double` / `confluence_triple` | +5 each when stochastic, cross, and EMA agree | -5 each |

Pi Cycle is scored as a cross event, not a level: the first implementation fired the bottom signal through the whole synthetic bear because the 150 SMA sits below the 471 SMA for most of a bear market. Fixed before delivery.

Data note: CoinGecko returns 365 daily closes. The 377 EMA, 350 SMA and 471 SMA need more history, so those components return zero on the live feed unless the fetch is widened (the legacy 377 EMA has the same limitation).

## 3. Test results

```
npx vitest run src/lib/ta/__tests__/macro-regime.test.ts
 Test Files  1 passed (1)
      Tests  20 passed (20)

npx tsc --noEmit -p .    -> no diagnostics in macro-regime files
```

`npx vitest run src/lib/ta/macro-regime` matches nothing because the test lives under `__tests__`; use the full path.

Coverage: bull series (+61 strong_bull: golden cross, bullish 21/377, HH/HL, rising 200 SMA, near range high, bullish triple confluence), bear series (-56 strong_bear: death cross with -45% since cross, LH/LL, bearish EMA, falling 200 SMA, bearish triple confluence), mirror symmetry (reflecting the bull series flips the sign of every component except Pi Cycle, stochastic K reflects to exactly 100 minus K, death cross day count equals golden cross day count), stochastic BEAR_TRIGGER / BEAR_EXHAUST / BULL_TRIGGER fixtures, macroBonus symmetry across eleven scores, bias thresholds, short and unordered inputs.

## 4. Symmetry audit and spec for the event layer

### What is already symmetric

`surprise.ts`: `score = round(100 * tanh(z / 1.8))` is odd in z. `impact.ts`: `transmission()` is linear in `score / 100` for every kind, and `assetScores()` is linear in (r, g, o). A +1.5 SD CPI therefore produces exactly the negative BTC and gold score of a -1.5 SD CPI. Regime modulation (`inflationFocus === "high"` multiplies r by 1.3, `policyBias` multiplies the matching sign by 1.2) is applied by sign, which is intentional and symmetric across opposite regimes. `directionOf()` uses +-15. `confidenceFor()` uses `Math.abs(score)`. No change needed in `impact.ts` or `surprise.ts` for symmetry.

### Where the asymmetry actually is

**A. `getMacroBonus` in `src/app/api/signals/route.ts` (~L1237)** rewards LONG only.

Current:

```ts
function getMacroBonus(macroState: MacroState | null, bias: "LONG" | "SHORT" | "WAIT", isCrypto: boolean): number {
  if (!macroState || !isCrypto) return 0;
  if (bias === "LONG") return Math.min(macroState.macroScore, 20);
  if (bias === "SHORT" && macroState.macroScore >= 15) return -10;
  return 0;
}
```

Spec: compute `const regime = computeMacroRegime(candles)` inside `fetchMacroSignals` next to the legacy computations, store `regime.score` and `regime.bias` on `MacroState` (replace `macroScore` and `bias`), and replace the function body with:

```ts
import { computeMacroRegime, macroBonus } from "@/lib/ta/macro-regime";

function getMacroBonus(macroState: MacroState | null, bias: "LONG" | "SHORT" | "WAIT", isCrypto: boolean): number {
  if (!macroState || !isCrypto) return 0;
  return macroBonus(macroState.macroScore, bias);
}
```

At ~L4016 the reasoning line is only pushed for `macroBonus > 0`; push it for any non-zero bonus with the sign shown, and extend the grade bump at L4019 to SHORT calls so a `strong_bear` regime can lift a SHORT to grade A the same way `strong_bull` lifts a LONG.

**B. `computeCatalystScore` in `src/lib/economic-calendar.ts` (~L293)** is clamped to `[-100, 0]`:

```ts
score = Math.max(-100, Math.min(0, score));
```

It is a pure volatility-risk penalty and is direction-neutral by design. The problem is that it is summed into the directional weighted composite in the route (~L2947, weight 0.02 to 0.04), where a negative number reads as bearish and nudges the composite toward SHORT regardless of context. Spec: leave the clamp, remove `catalyst.score * weights.catalyst` from `weightedScore`, and apply it as a confidence multiplier the way `preEventRisk` already is:

```ts
// after confidence is computed from weightedScore
if (catalyst.score < 0) confidence = Math.round(confidence * (1 + catalyst.score / 200)); // -40 => x0.8
```

**C. `scoresFor` in `src/lib/macro/service.ts` (~L216)** regime lean is lopsided for BTC: risk-on +10 but risk-off -20, inflation-high -5 with no bullish counterpart, no `inflationFocus === "low"` branch at all.

Current:

```ts
if (regime.policyBias === "easing") macro += asset === "WTI" ? 5 : 20;
if (regime.policyBias === "tightening") macro -= asset === "WTI" ? 5 : 20;
if (regime.risk === "off") macro += asset === "BTC" ? -20 : asset === "GOLD" ? 10 : -10;
if (regime.risk === "on") macro += asset === "BTC" ? 10 : 0;
if (regime.inflationFocus === "high") macro += asset === "GOLD" ? 10 : asset === "BTC" ? -5 : 5;
```

Spec (each state is the exact mirror of its opposite, gold keeps its safe-haven tilt):

```ts
const LEAN: Record<MacroAsset, { easing: number; riskOn: number; inflHigh: number }> = {
  BTC:  { easing: 20, riskOn: 15, inflHigh: -5 },
  GOLD: { easing: 20, riskOn: -5, inflHigh: 10 },
  WTI:  { easing: 5,  riskOn: 5,  inflHigh: 5 },
};
const l = LEAN[asset];
if (regime.policyBias === "easing") macro += l.easing;
if (regime.policyBias === "tightening") macro -= l.easing;
if (regime.risk === "on") macro += l.riskOn;
if (regime.risk === "off") macro -= l.riskOn;
if (regime.inflationFocus === "high") macro += l.inflHigh;
if (regime.inflationFocus === "low") macro -= l.inflHigh;
```

**D. `classifyRegime` in `src/lib/macro/regime.ts`** has no real-yield or DXY-breakout term, which is the top-ranked bearish signal. Spec: add `dxyChg5d` to the tightening and risk reads, mirrored:

```ts
if (policyBias === "hold" && i.dxyChg5d != null) {
  if (i.dxyChg5d >= 1.5) policyBias = "tightening";
  else if (i.dxyChg5d <= -1.5) policyBias = "easing";
}
```

When a 10Y TIPS series is added to `RegimeInputs` (`realYieldChg5d`), apply the same rule at +-0.15 percentage points. Both are additive, so the existing `us2yChg5d` logic keeps precedence.

**E. `fed_communication` in `impact.ts`** returns zero transmission and `confidenceFor` forces "low". Spec: derive r from the 5m 2Y reaction in `service.ts` before calling `impactForSurprise`, and pass it as a synthetic surprise score:

```ts
// in service.ts, after the 5m ReactionPoint exists for a fed_communication event
const us2y5m = reaction5m.changesPct.us2y; // bp change stored as pct-of-level; convert to bp
const syntheticScore = us2y5m == null ? null : Math.round(100 * Math.tanh(us2yBp / 8)); // +5bp => ~+55
st.postImpact = impactForSurprise(st.def, syntheticScore, magnitudeFromZ(us2yBp / 5), regime);
```

and in `confidenceFor` drop the forced "low" for `fed_communication` when a synthetic score is present. Hawkish FOMC then produces a bearish BTC and gold score of the same size that dovish produces bullish.

**F. Catalyst headline gating in the route (~L3169)** only lets a negative `oilGeoScore` flip a call to SHORT when `!htfOpposesShort`. The bullish flip at ~L3160s should use the same `htfOpposesLong` guard so neither direction is privileged. Verify both guards exist; if only the short one does, add the mirror.

## 5. Event-driven SHORT setups

All conditions use the existing `SurpriseResult` (`score`, `magnitude`, `zScore`), `MacroEventDef` (`kind`, `id`, `relevance`) and `MacroRegime` (`policyBias`, `risk`, `inflationFocus`, `inputs`) types. Confirmation uses the 5m and 15m `ReactionPoint` samples (`changesPct.us2y`, `changesPct.dxy`). Chart gate: `computeMacroRegime(candles).score`.

### 5.1 Hot CPI or core PCE: short BTC and gold

- Trigger: `def.kind === "inflation"` and `def.id` in `cpi_mom`, `core_cpi_mom`, `core_pce_mom`, `pce_mom`; `surprise.score >= 40` (about +1 SD); `surprise.magnitude` in `large`, `extreme`.
- Amplify: `regime.inflationFocus === "high"` or `regime.policyBias === "tightening"`.
- Confirm at 5m: `us2y` up and `dxy` up. Abort if either is down at 15m.
- Primary: GOLD (relevance 1.0). Secondary: BTC (0.9 to 1.0). Horizon: immediate and shortTerm; swing only when magnitude is `extreme`.

### 5.2 Hot PPI: short gold and BTC

- Trigger: `def.id` in `ppi_mom`, `core_ppi_mom`; `surprise.score >= 55` (wider typical SD and lower relevance, so demand a bigger surprise).
- Same confirmation and amplification as 5.1. Half size relative to 5.1.

### 5.3 Strong NFP or hot average hourly earnings: short gold, then BTC

- Trigger: `def.kind` in `labor_strength`, `wages`; `def.id` in `nfp`, `ahe_mom`, `adp`, `jolts`; `surprise.score >= 40`.
- Amplify: `regime.inflationFocus === "high"` (growth reads as hawkish, `transmission` already adds 0.3 g to r).
- Skip: `regime.risk === "off"` (growth relief dominates the rate path, `transmission` halves r).
- Confirm at 5m: `us2y` up at least 5bp-equivalent and `dxy` up.

### 5.4 Hawkish FOMC: short gold and BTC

- Trigger A: `def.kind === "policy_rate"` and `surprise.score > 0` (hike or smaller cut than consensus).
- Trigger B: `def.kind === "fed_communication"` with the synthetic score from spec E at or above 40 (2Y up 5bp or more at 5m, DXY up).
- Confirm at 15m before scoring the swing horizon. Amplify when `regime.policyBias === "tightening"` (1.2x already applied in `transmission`).

### 5.5 Firm labor via unemployment or claims: short gold

- Trigger: `def.kind === "labor_weakness"` and `surprise.score <= -40` (firmer labor than expected: lower unemployment rate or lower claims).
- Rate-channel short only, so GOLD, not BTC. Skip when `regime.risk === "off"`.

### 5.6 Big crude build: short WTI

- Trigger: `def.kind === "oil_inventory"` (`eia_crude`, `api_crude`); `surprise.score >= 40`; `surprise.magnitude` in `large`, `extreme`.
- Internals: require at least one of `components.cushing > 0.3`, `components.gasoline > 0.3`, `components.distillate > 0.3`, and no "contradict" note from `transmission` (headline build with two or more bullish internals is a no-trade).
- Confirm: `dxy` not down more than 0.5% at 5m (a weak dollar offsets builds).
- Horizon: immediate and shortTerm (intraday to 2 days).

### 5.7 OPEC+ output increase or sanctions relief: short WTI

- Trigger: `oil-geopolitical-news` category `OPEC` or `SANCTIONS` with a bearish regex hit and no opposing strong narrative in the same window (`oilGeoRegime !== "whipsaw"`).
- Gate: chart `weekly_structure` component is not `HH_HL`, and `computeMacroRegime` score for WTI is at or below 0.
- Horizon: shortTerm and swing.

### 5.8 Falling ISM or rising claims: short WTI and BTC

- Trigger: `def.kind === "growth"` (`ism_mfg`, `ism_svc`, `retail_mom`, `gdp_qq`) with `surprise.score <= -40`; or `def.kind === "labor_weakness"` (`claims`, `unemployment`) with `surprise.score >= 40`.
- Regime: `regime.risk !== "on"`. In risk-off, `transmission` boosts g by 1.2x so the growth channel dominates.
- Assets: WTI via demand downgrade, BTC via risk appetite. GOLD excluded because the dovish rate channel offsets.

### 5.9 DXY breakout: short gold and BTC

- Trigger: `regime.inputs.dxyChg5d >= 1.5` and `regime.policyBias === "tightening"`.
- Role: confidence multiplier (x1.25) on setups 5.1 to 5.5, not a stand-alone trigger. Mirror: `dxyChg5d <= -1.5` with `easing` multiplies LONG setups by the same factor.

### 5.10 Risk-off shock: short BTC

- Trigger: `regime.risk === "off"` entering from a prior `on` or `neutral` read (requires storing the previous regime), with `regime.inputs.vix >= 24` or `spxChg5d <= -2.5`.
- Gate: chart regime score at or below -20.
- GOLD neutral (safe-haven flows cut both ways). WTI short only when 5.8 also fires.

### Chart-regime gate for every setup

| `computeMacroRegime().score` | Event SHORT sizing |
|---|---|
| <= -8 | full size |
| -7 to +7 | half size |
| >= 8 (lean_bull or above) | skip, unless `surprise.magnitude === "extreme"` |

The same table mirrored (>= 8 full, <= -8 skip) applies to event LONG setups so the gate itself stays symmetric.
