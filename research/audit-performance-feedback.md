# Audit: signal performance tracking, scoring and the feedback loop

Date: 2026-10-13. Scope: `src/app/api/signals/history/*` (logger, outcome checker, performance stats, backup route), `src/app/signals/performance/PerformanceDashboard.tsx`, `src/lib/signals/setup-tracker.ts`, `src/lib/macro/{history,outcome,confirmation,alerts,surprise,impact,service}.ts`, `scripts/backtest.ts`, `src/instrumentation.ts`, and the logging call site in `src/lib/signals/engine.ts`. Read-only audit; line numbers refer to the working tree at HEAD `bcca7ce`. The history tests and the setup-tracker test were run (3 files, 22 passed) to confirm the rules described here are the rules that execute.

Posture: the pipeline is far more honest than most published "signal bots" (fill model, R-based P&L, provisional banner, excluded categories reported). The remaining problems concentrate in four places: (1) the candle walk ignores the horizon, (2) there is no cost model while the measured edge is +0.20R gross, (3) the ledger can be erased by a crash or rewritten by an unauthenticated POST, and (4) nothing learned from outcomes feeds back into the engine or the macro maps. Each is fixable in hours.

---

## 1. Outcome resolution

### 1.1 Rules as implemented

| Rule | Where | Behaviour |
|---|---|---|
| Logging gate | `engine.ts:4807` | Non-WAIT, confidence >= 55. WAIT already fires below `minPublishConfidence` (60) at `engine.ts:3711`, so the effective gate is 60. |
| Dedupe at log time | `logger.ts:217-226` | One open record per symbol and bias; 1h cooldown after the symbol's last close. A bias flip while the opposite side is open is allowed. |
| First eligible candle | `core.ts:58-60` | The 5m candle containing the signal timestamp is excluded. |
| Market vs limit | `core.ts:24, 51-54` | Entry within 0.1% of `priceAtSignal` = market, filled on the first eligible candle. Otherwise limit: filled when a candle's low (long) or high (short) touches the entry. |
| Fill window | `core.ts:21-22` | 24 candles (2h) for SCALP, 96 (8h) otherwise; no touch = `unfilled`, excluded. |
| Unverifiable | `core.ts:19, 173-178` | Strike klines cap at 500 x 5m = 41.7h; if the fill window start predates the fetchable range the record is `unverifiable`, excluded. |
| Ladder walk | `core.ts:201-235` | Per candle: MFE/MAE, stop check first (same-candle SL+TP = stop), then TP1..TP3 in order. Stop before TP1 = loss at the stop price. Stop after TPk = exit at TPk. TP3 closes at TP3. |
| Horizon | `core.ts:15-16, 254-264` | SCALP 4h, SWING 48h, POSITION/ULTIMATE 168h, else 24h (CONFLICTED and legacy). Measured from signal time, not fill time. Exit at the last close; without a TP it is `expired` (no verdict, counted in R since 7399b3f). |
| Realized R | `core.ts:87-92` | `(exit - entry) / abs(entry - stop)`, exact touch prices, no fees, no slippage. |
| Stats exclusions | `performance.ts:303, 316-318` | Unfilled, unverifiable and open never count. Expired-no-verdict counts in R, PF and equity, not in hit or stop rates. |

### 1.2 Defect: the horizon is not enforced inside the candle walk (HIGH)

`core.ts:198` builds the window as every candle from the fill time onward and `core.ts:201-235` walks all of them; the horizon is only consulted at `core.ts:254` after the walk ends without a close. If the checker evaluates late (restart, outage, a symbol whose candle fetch failed for a few passes, or the one-shot legacy migration at `core.ts:271-281`), any TP or stop touched after the horizon is credited as if it happened inside it.

Evidence in the local dev file `data/signal-history.json`: ADA LONG logged at 1791058538926 (2026-10-03 19:35 UTC), no `context`, so the 24h default horizon applies. It closed `tp3` with `outcomeTimestamp` 1791162600000 (28.9h after the signal) and `lastCheckedAt` 1791312830937 (70.6h after the signal). One late evaluation pass walked three days of candles and awarded TP1, TP2 and TP3 on the same candle for +4.05R with `mfeR` 12.2. Under the stated rules this record is a horizon exit at the 24h close, not a 4R win. The +8.6% single-candle MFE on the same record also suggests the candle series fetched that day was not clean 5m data; worth a spot check of what `fetchCandles` returned for ADA.

The backtest does it correctly: `backtest.ts:251-254` finishes at the horizon inside the loop. Live and backtest therefore disagree in exactly the direction that flatters live.

Proposed change (`core.ts:195-199`):

```ts
const horizonEnd = sig.timestamp + horizonFor(sig);
const window = candles.filter((c) => c.time >= fillTime && c.time + CANDLE_MS > resumeFrom && c.time < horizonEnd);
```

In the horizon branch at `core.ts:254` use `now >= horizonEnd` and take the exit price from the last candle with `time < horizonEnd`, not the last candle in the fetch. Add a test: a TP1 touch at horizon + 1 candle must yield `expired`. Measure: after deploy, count closed records with `outcomeTimestamp > timestamp + horizon`; must be zero. Re-run the legacy migration logic against a copy of the production file and report the sum-R delta.

### 1.3 Fill and slippage model

- Market orders fill at `sig.entry`, not at the next candle's open. `core.ts:182` sets `filledAt` but `realizedR` (`core.ts:87-92`) always uses `sig.entry`. The signal timestamp is at least 20s after the 15m close (`instrumentation.ts:159-160`) plus engine latency, and the containing candle is excluded (`core.ts:58-60`), so the modelled fill happens 5 to 10 minutes after the decision at the decision price. On a momentum entry that is systematically favourable. Fix: for market orders set `fillPrice = firstEligibleCandle.open`, keep SL and TP fixed, compute risk and R from `fillPrice`, store `fillPrice`. The backtest (`backtest.ts:221-222, 240`) has the same flaw and should take the same fix.
- Limit fills are credited on an exact touch (`core.ts:182`). A resting order at the candle low often does not fill (queue priority, wick on another venue). The conservative convention is trade-through: `c.low <= entry - tick` or `entry * (1 - 0.0003)`. Same for TP touches at `core.ts:225`. Stops at `core.ts:207` are market orders in practice and should carry slippage rather than fill at the stop price. All three assumptions bias R upward, and the TP side and the stop side are not symmetric in real execution.
- Fee model: none in live stats (`performance.ts:419` says so). The backtest charges a round trip of `(SLIP + FEE) * 2 * entry / risk` in R (`backtest.ts:241`). With 15m stops of 0.8 to 1.5 ATR (roughly 0.3% to 1.0% of price on majors) a 10 to 15 bps round trip costs 0.1R to 0.4R per trade. Against +0.20R gross expectancy this decides whether an edge exists. Venue parameters to configure (verify against current fee pages before shipping; treat these as placeholders): Hyperliquid base tier about 0.035% taker and 0.010% maker with hourly funding; Strike Finance perps fee and funding cadence must be read from their docs. Proposed: `COST_MODEL = { HL: { takerBps, makerBps, slipBps }, STRIKE: {...} }` in `check/core.ts`, store `costR` on each closed record, expose `expectancyNetR` and `profitFactorNet` beside gross in `performance.ts:387-390`, and make net the headline.
- Funding over the hold is ignored. At 24h to 168h horizons with elevated funding that is another 0.05R to 0.2R. The engine already fetches `fundingRate`; log it at call time and charge `fundingRate * holdHours / fundingIntervalHours` on notional.
- MFE/MAE for limit fills include the whole fill candle (`core.ts:201-205`), i.e. range before the fill. Minor, but MAE feeds the "losers near miss" copy.

### 1.4 Selection bias

- Unfilled exclusion is correct for a trade ledger but creates adverse selection: a limit at support fills when price comes down through it and misses when the call was right immediately. The published TP1 rate is P(TP1 | filled), which understates signal quality while the R per filled trade is dragged by fills on the way to the stop. Report both: fill rate per entry type, and a counterfactual column for unfilled records ("TP1 would have been reached without a fill: yes/no") computed from the candles `evaluate` already holds.
- Expired exclusion (7399b3f) makes the hit rate P(TP1 | decided). Correct as a verdict rate, but the expiry rate itself is a quality signal (targets too far for the horizon) and must sit beside it. `decidedN` and `provisional` are computed on the range-filtered set (`performance.ts:278, 318, 425`), so a 7-day view can say "provisional" while "All" does not.
- No counterfactual for the gates. WAIT leans at 55 to 59, shorts blocked by `shortNeedsHtfBear` (`engine.ts:3724-3727`) and regime-blocked calls (`engine.ts:3745-3748`) are never logged, so each gate's value can only be assessed in the backtest, which has none of the non-candle feeds. Proposed: log them as `shadow: true` records through the same fill model, excluded from every public number, visible on an internal tab. This is the cheapest way to learn whether the gates add or remove edge.
- The second dedupe layer in `performance.ts:223-228, 284-299` (same symbol, bias, entry to 4 s.f. within 30 min) is vestigial for post-9581570 data because the logger enforces one open record per symbol and bias. Keep it for legacy rows and assert in meta that `duplicatesMerged` is zero for records newer than 2026-10-05.
- Opposite-bias records can be open simultaneously (`logger.ts:220`). They are hedged noise in aggregates; flag them with `hedgedWith: id`.

### 1.5 Target and stop symmetry

Levels are built at `engine.ts:3838-3920`. Stop = nearest S/R plus 0.5 ATR buffer, floored at 0.8 ATR or a percent floor; TP1 = next S/R if at least `minDist` away, else 1.5 ATR. R:R to TP1 therefore ranges from about 0.6 to 3+ depending on where the nearest level sits. "TP1 hit rate" is not comparable across signals and not comparable to confidence. Log `rr1 = abs(tp1 - entry) / risk` (and rr2, rr3) at call time and bucket calibration by rr1 (section 2.3). The ladder walk itself treats longs and shorts symmetrically.

---

## 2. Metrics

### 2.1 Present (`performance.ts:375-427`)

TP1/TP2/TP3 rate on decided, ladder conditionals, stop before/after TP rates, expectancy (gross) and conservative expectancy, median R, profit factor, sum R, median time to TP1, equity curve by close order, daily curve, calibration by confidence band and grade (TP1 rate and mean R only), breakdowns by symbol, class, bias, trade type, UTC hour, weekday, OIL regime, Cloud/200MA regime, regime alignment, engine version, MFE/MAE medians, streaks.

A second, older stats function `computeStats` (`logger.ts:258-382`) still serves the default `/api/signals/history` view (`route.ts:52`) with different semantics: `avgRR` falls back to TP1 for the reward, `profitFactor` uses `signalR` which includes horizon exits, and `winRate` counts legacy rows. Two different "profit factor" numbers can be published from the same file. Delete `computeStats` or make it delegate to `computePerformance`.

### 2.2 Missing

- Max drawdown in R on the equity curve and longest time under water. Trivial from `equity`.
- R distribution: histogram, skew, share of trades beyond +2R, mean and SD of R with the standard error of the mean. At n = 100 the standard error of expectancy is about SD(R) / 10; print it.
- Wilson 95% intervals on every rate. A 55% TP1 rate at n = 20 is 34% to 74%; the colour thresholds at `PerformanceDashboard.tsx:106` (green above 55, red below 40) apply to point estimates regardless of n.
- Net-of-cost expectancy and PF (section 1.3).
- Fill rate per entry type (market vs limit), horizon-expiry rate, median hold time for winners and losers, give-back after TP (highest TP reached minus realized).
- By entry type: the backtest reports `byEntryType` (`backtest.ts:423`); live does not, though `isMarketOrder` is computable from the record.
- By rr1 bucket (<1, 1 to 1.5, 1.5 to 2, >2).
- By volatility: `context.atr` is logged (`engine.ts:4826`) but never used; bucket by ATR as a percent of price.
- By catalyst proximity: only `catalystScore` is logged. Add `minutesToNextHighImpactEvent` and the `preEventRisk` flag (computed at `engine.ts:3530`) to `SignalContext`.
- By timeframe: `context.timeframe` is the constant "15m" (`engine.ts:4828`). Log the setup's own timeframe or drop the field.
- By component: `context.factors` is logged and the comment at `performance.ts:36` promises factor attribution, but only `REGIME_FACTOR` is read (`performance.ts:242-252`). The data for a per-component reliability table already exists for every post-fill-model record.
- By engine version with date ranges. `byEngineVersion` mixes versions that ran in different market regimes; print first and last signal date per version.
- Calibration beyond TP1: the calibration table has only `tp1Rate` and `expectancyR`.

### 2.3 Calibration table and Brier score (proposed core feedback metric)

Define two binary targets per signal: `y_tp1` = TP1 reached before the stop (decided records only) and `y_pos` = realized R > 0 (all filled closed records, including expired). Define the predicted probability `p` as the calibrated mapping of confidence (section 3); until a mapping exists, report Brier for the naive `p = confidence / 100` so the overconfidence is visible.

Table rows: one per 5-point confidence band from 60 to 100, one per grade, one per rr1 bucket. Columns:

| Band | n decided | mean conf | TP1 rate | Wilson 95% | P(R>0) | mean R | mean net R | Brier naive | Brier calibrated |

Brier = mean((p - y)^2). Report its Murphy decomposition: reliability (calibration error, lower is better), resolution (how well bands separate outcomes), uncertainty (base-rate variance). Report the Brier skill score against climatology, BSS = 1 - Brier / Brier_base, where Brier_base uses the overall decided hit rate as the constant forecast. BSS at or below zero means the confidence number carries no information beyond the base rate; that is the honest headline for the "stated confidence" column until proven otherwise. The backtest should print the same table so live and backtest calibration can be overlaid.

Implementation: a pure `calibration(rows, mapping)` in `performance.ts` next to `bucketize`, exposed as `stats.calibration.brier`. About 60 lines plus tests.

---

## 3. Feedback loop: bounded online calibration

Current state: outcome data never touches the engine. Confidence is `50 + strength / 2` minus haircuts (`engine.ts:3526`), a conviction scale, not a probability. The intended minimum of about 20 decided signals per bucket before shrinking confidence was never wired, and that restraint was correct. The plan below leaves the engine's score alone, layers a calibrated probability on top, and routes weight changes only through the backtest harness.

### 3.1 Prerequisite: log the inputs

Extend `SignalContext` (`logger.ts:27-35`) and the call site (`engine.ts:4821-4829`) with `weightedScore`, `strength`, `confidenceRaw` (before pre-event, counter-trend and macro adjustments), `components: Record<name, { score, weight }>`, `rr1/rr2/rr3`, `entryType`, `atrPct`, `fundingRate`, `minutesToNextHighImpactEvent`, `tuning` (the `Tuning` object) and `gateNotes`. Roughly 1 KB per record, 5 MB at the 5000 cap; see 5.4 on archiving.

### 3.2 Stage 0: compute and display, do not apply

Nightly, or on each `computePerformance` call with a 10-minute cache, write `/data/signals/calibration.json` containing:

- `byBand`: the table from 2.3 keyed by engine major version.
- `platt`: logistic fit `P(y_tp1 = 1) = sigmoid(a * s + b)` with `s = weightedScore * (bias == LONG ? 1 : -1)`, L2 regularised (lambda about 1), fitted on decided records of the current engine version with a time-ordered 80/20 split. Store `a`, `b`, `n`, hold-out Brier and BSS, fit date.
- `byComponent`: for each component c, `agree_c = sign(component score) == sign(bias)`. Report P(win | agree), P(win | disagree or neutral), lift, Wilson CIs, n per side.
- `byPair`: decided n, TP1 rate shrunk toward the global rate with k = 20 pseudo-counts, `p_shrunk = (wins + k * p_global) / (n + k)`, and `m_pair = p_shrunk / p_global`.

Show all of it on an internal tab. Nothing changes in the engine.

### 3.3 Stage 1: apply with guardrails (after 100 decided on the current engine version)

- Displayed probability. Publish `pTp1 = platt(weightedScore)` beside confidence on the signal page and the hot board. Confidence stays as is. This fixes what traders see without touching the decision path.
- Per-pair reliability multiplier. `confAdj = confidence * clamp(m_pair, 0.85, 1.10)`, only for pairs with n >= 20 decided, applied to the publish gate only (a pair at 0.85 needs 70.6 raw to publish at 60). Asymmetric phase first: reductions only for the first month.
- Per-component shrinkage. Candidate weight `w_c' = w_c * clamp(1 + lift_c_shrunk, 0.7, 1.3)` where the lift is pulled toward zero with k = 40 and is non-zero only when its Wilson CI excludes zero and both sides have n >= 40. Never applied live directly: the candidate weight vector is written to `calibration.json` and must pass 3.4.
- Hard limits: no weight moves more than 10% per refit; refits weekly; the publish gate never moves more than 3 points per week; `CALIBRATION=off` kill switch; every logged signal carries `calibrationVersion`; auto-revert when the rolling 30-day BSS of the calibrated probability falls more than 0.02 below the naive one.

### 3.4 Validation via the backtest harness

`scripts/backtest.ts` accepts only `Tuning` overrides (`backtest.ts:130-138`). Add `--weights-json` calling a new `setWeights()` in the engine (the literal at `engine.ts:3350-3374` becomes the default) and `--calibration-json` so the harness prints Brier and BSS with the same mapping. Acceptance for any candidate from 3.3: fit on the first 60 days, test on the next 60; accept only if net expectancy, net PF and BSS all improve out of sample and the signal count moves by less than 25%. Record the run file in `calibration.json`. The harness caveats (`backtest.ts:413-417`: candles only, Binance.US spot, no feeds) mean lifts for sentiment, derivatives, ETF, liquidation and macro cannot be validated there; those components stay on display-only until live n is large.

### 3.5 What not to do

Do not shrink confidence per bucket from live data with n < 20, do not let calibration touch stop or target construction, and do not fold expired-no-verdict records into `y_tp1` (they belong to `y_pos` only).

---

## 4. Macro event outcome tracking

### 4.1 What the stored reactions are used for today

`persist()` (`service.ts:208-226`) stores forecast, previous, actual, surprise score, magnitude, regime, release snapshot, reaction points at 30s/1m/5m/15m/1h/4h/24h and the confirmation status. Consumers:

- `rollingSurpriseSD` (`history.ts:53-61`) feeds `computeSurprise` and `buildScenarios` (`service.ts:158, 190-192, 249-251, 403`). It replaces `def.typicalSurpriseSD` entirely once 6 observations exist.
- `bestHistoricalStats` (`history.ts:111-126`) produces median reactions per segment for display in `st.historical` (`service.ts:252`).

Not used: the transmission constants (`impact.ts:21-108`), the asset betas in `assetScores` (`impact.ts:155-165`), `relevance` per asset, the `directionOf` threshold, the `FLAT` thresholds (`confirmation.ts:5-15`), and `typicalSurpriseSD` in `taxonomy.ts`. The expected-direction map is static.

### 4.2 Problems with the SD update as written

- A sample SD with the sample mean subtracted at n = 6 has roughly 30% standard error and switches from prior to sample in one step. Surprises should be modelled as zero-mean (consensus is unbiased by construction); subtracting the mean spends a degree of freedom on noise.
- No blending, no cap. One revised-forecast row or one mis-parsed unit resets the scale for every scenario band.
- Rows whose forecast was a proxy (API crude using the EIA consensus, `expectations.ts:148-166`) enter the same pool as true consensus rows.

Proposed rule (`history.ts:53-61`):

```
sd_post^2 = (k * sd_prior^2 + sum(delta_i^2)) / (k + n),   k = 4, delta vs true consensus only
sd_post   = clamp(sd_post, 0.5 * sd_prior, 2.0 * sd_prior)
robust    : for n >= 8, use (1.4826 * MAD)^2 in place of sum(delta^2)/n when the two differ by more than 2x
```

This is conjugate-style shrinkage: at n = 0 it is the prior, at n = 12 the data carries 75% of the weight, and one outlier cannot more than double the band. Persist the posterior per `defId` with `n` and the last update time, and show "SD from 9 observations, prior 0.1" in the scenario guide.

### 4.3 Learning the direction map

Store at verification time, per asset: `expected.direction`, `expected.confidence`, `expected.score` (from `impactForSurprise`) next to the reactions. Then per `(defId, asset)`:

- Direction hit: for releases with `abs(surpriseScore) >= 20` and a 1h reaction beyond `FLAT`, `hit = sign(reaction_1h) == sign(expected)`. Maintain a Beta posterior starting at Beta(6, 2). With posterior mean `q`:
  - `q < 0.55` and n >= 8: downgrade `confidence` one notch for that pair in `impactForSurprise` (`impact.ts:170-195`) and print "historically unreliable for this asset (q, n)".
  - `q > 0.80` and n >= 8: let `confidence` stay "high" at `abs(score) >= 35` instead of 45.
- Reaction beta: ridge regression of the 1h reaction percent on `surpriseScore` per pair, n >= 12. If the slope sign contradicts the model at p < 0.05, do not auto-flip; raise an internal flag. Direction flips should stay human-gated.
- Macro Brier: with expected direction and confidence stored, compute Brier per `defId` with `p = {high: 0.8, medium: 0.65, low: 0.5}` and `y = hit`. This tells you which of the 140+ definitions in the taxonomy actually move BTC, gold and WTI.

### 4.4 Data quality observed in `data/macro/releases.json`

Four stored releases. The 30s and 1m reaction points are all zeros across every asset (the snapshot had not refreshed when sampled), and `us2y` is null in every snapshot, so the `fed_communication` synthetic surprise (`service.ts:283-305`) can never compute. Zero early samples do not reach `historicalStats` (labels 5m and later, `history.ts:90`) but they do reach `evaluateConfirmation` as the latest sample until 5m. Guard: skip a reaction sample when every asset change is exactly zero and `dataAgeMs` is null, and retry next tick.

---

## 5. Data integrity

### 5.1 A crash during a write can erase the whole ledger (HIGH)

`saveToDisk` (`logger.ts:134-142`) rewrites `signal-history.json` in place with `writeFileSync`. If the process dies mid-write the file is truncated; `loadFromDisk` (`logger.ts:119-132`) catches the parse error, sets `memoryCache = []`, and the next `appendSignal` or `updateSignal` writes `[]` over the corrupt file. The track record is gone and nothing logs it. The same pattern exists in `setup-tracker.ts:33-55` and `macro/history.ts:11-33`.

Fix: write to `signal-history.json.tmp` then `renameSync` (atomic on the same volume); on parse failure rename the bad file to `signal-history.corrupt-<ts>.json`, log loudly, and refuse writes until an operator restores. Add a daily copy to `/data/signals/backups/YYYY-MM-DD.json`, keep 14.

### 5.2 Anyone can inject records into the published track record (HIGH)

`POST /api/signals/history/backup` (`backup/route.ts:91-132`) merges any `signals` array with new ids into the ledger behind a 5/min rate limit and no authentication. A fabricated record with `status: "closed"`, `closedReason: "tp3"`, `realizedR: 4` passes straight into every public number. `POST /api/signals/history/check` is also unauthenticated (harmless, it only triggers a pass). Require `x-internal-scan` with `INTERNAL_SCAN_SECRET` (`rate-limit.ts:19-21` already reads it) or remove the POST; keep the GET export.

### 5.3 Write amplification

`runOutcomeCheck` calls `updateSignal` per open record (`core.ts:306-309`), each a full-file synchronous write. With 30 open records and a 5000-record file that is 30 multi-megabyte writes on the event loop every 60 seconds. Collect the patches and call `replaceHistory` once per pass.

### 5.4 Truncation at 5000 silently changes "All time"

`logger.ts:199-201` drops the oldest records. At about 31 symbols and a few logs per symbol per day the cap arrives in roughly two months, after which "All" quietly becomes "the last 5000". Archive to `/data/signals/archive-YYYY-MM.json` and keep an all-time summary.

### 5.5 Coverage gaps after restarts are not detected

For filled records the walk resumes at `lastCheckedAt` (`core.ts:197-198`), but when the checker was down longer than 41.7h the fetch cannot reach back (`core.ts:19, 63-64`) and the filter skips the missing span: a stop or TP inside the gap is lost and the record is judged on later candles. Detect `candles[0].time > resumeFrom + CANDLE_MS` and either backfill from 15m candles or mark the record `unverifiable` with a `coverageGap` field. Unfilled records already handle this (`core.ts:173-179`).

### 5.6 Price basis and clock

- `priceAtSignal` is the mark price when available (`engine.ts:4368`) while the checker reads klines with `priceType=last` (`core.ts:66`). On thin symbols (`THIN_SYMS`, `engine.ts:73`) mark and last can differ by more than the 0.1% market-order tolerance, so entry-type classification and touch tests run on a different series than the one the entry came from. Log `markAtSignal` and `lastAtSignal`; use `last` for the market-order test.
- Timestamp is `Date.now()` at the end of the engine run (`engine.ts:4810`), after all fetches. The scheduler fires 20s after the 15m close (`instrumentation.ts:159-160`) and the pool of 4 (`instrumentation.ts:161`) stamps late symbols minutes later. Store `candleCloseTime` (the 15m bar the decision used) and key the fill model off it.
- Timezone: epoch ms and ISO UTC throughout; hour and weekday buckets are UTC (`performance.ts:360-361, 406`). Fine.

### 5.7 Engine version drift

`ENGINE_VERSION` is a hand-edited string (`engine.ts:16`). Commits f203205, 3da75e9, 34f2d8d and 199c3c6 all changed scoring; whether each bumped the string is not verifiable from the record, and `setTuning` never changes it. Derive a suffix from a hash of `DEFAULT_TUNING`, the weight literal and the gate constants at module load, and log the `Tuning` snapshot into context (3.1). Show the date range per version in `byEngineVersion`.

### 5.8 Smaller items

- `legacyOutcome` is preserved on re-verified records (`core.ts:121`); the UI never shows it.
- The in-memory `fired` map for macro alerts (`alerts.ts:3-12`) resets on restart, so pre-event alerts can fire twice.
- `computePerformance` normalizes the whole file per request behind a 10s cache (`route.ts:47`). Fine at 5000 rows; revisit with archiving.

---

## 6. What a trader needs to trust the record (UI)

Today the page shows aggregate KPIs, the equity curve, the ladder, open signals with live R, a 40-row log with TP badges, calibration by confidence and grade, breakdown tabs and an assumptions footer. Row clicks go to the live signal page for the ticker (`PerformanceDashboard.tsx:288`), not to the historical call.

Missing for trust, in order:

1. Ledger download. The GET at `backup/route.ts:73-89` already produces the full JSON; link it as "Download full ledger" (JSON and CSV) and publish a daily SHA-256 of the file so anyone can check it was not edited retroactively.
2. Per-call audit drawer. Inputs at call time (every field from 3.1, factor assessments with weights, gate notes, raw vs adjusted confidence, trade type and horizon, entry type and rr1), then the resolution trail: first eligible candle, fill candle and fill price, each TP touch with timestamp, stop touch, horizon end, `closedReason`, gross and net R, engine and calibration version.
3. Plain-language invalidation reason per closed row: "Stopped at 0.2431 on Oct 8 14:35 UTC, 3h12m after fill, before TP1" or "Horizon reached Oct 9 19:35 UTC with no verdict; exited at the last close for +0.3R". `outcomeLabel` (`performance.ts:172-186`) is the seed; add time and price.
4. Confidence intervals on every rate and a sample-size rule for colour (no green or red below n = 30).
5. Net-of-cost toggle with the cost model shown.
6. Denominators explained inline: signal-level n, filled n, decided n, with the fill rate and expiry rate between them.
7. Unfilled counterfactual column so excluded records are visibly excluded honestly rather than conveniently.
8. Max drawdown, R histogram, per-version date ranges.
9. Open signals: show fill window remaining for pending fills and the candle time of the last check, so a stalled checker is visible.
10. A methodology changelog on the page listing 9581570, 68f1864, 7399b3f and any future rule change with its date, since each changed the published numbers.

---

## 7. Top 10 changes by expected accuracy gain per engineering hour

| # | Change | Where | Why | How to measure | Hours |
|---|---|---|---|---|---|
| 1 | Enforce the horizon inside the candle walk; exit at the last close before `horizonEnd` | `core.ts:195-199, 254-264`; test in `fill-model.test.ts` | Late evaluations credit TPs and stops that happened after the horizon; live is more flattering than the backtest | Zero records with `outcomeTimestamp > timestamp + horizon`; sum-R delta on a copy of production data | 1 |
| 2 | Authenticate or remove `POST /backup`; atomic tmp+rename writes; quarantine corrupt files; daily backup | `backup/route.ts:91`, `logger.ts:119-142`, `setup-tracker.ts:47-55`, `macro/history.ts:25-33` | The ledger can be fabricated by anyone or erased by a crash | Unauthenticated POST returns 401; kill during a write leaves a parseable file | 1.5 |
| 3 | Cost model (fees, slippage, funding); market fills at next open; net R as the headline | `core.ts:87-92, 182`, `performance.ts:387-392, 419`, mirror in `backtest.ts:221-248` | +0.20R gross sits inside the cost band; the published edge may not exist net | Gross minus net expectancy; sign of net expectancy per version | 3 |
| 4 | Log inputs at call time: weighted score, components with weights, raw confidence, rr1-3, entry type, ATR%, funding, minutes to next event, tuning snapshot | `logger.ts:27-35`, `engine.ts:4821-4829` | Every feedback mechanism in section 3 and half the missing breakdowns depend on it | Field presence on 100% of new records | 2 |
| 5 | Calibration table with Wilson CIs, Brier, decomposition and BSS; same table from the backtest | `performance.ts:396-399` (new fn), `backtest.ts:421` | Turns overconfidence into a number; the core feedback metric | BSS of naive confidence (expect at or below 0); track weekly | 3 |
| 6 | Shadow-log WAIT leans 55-59, HTF-blocked shorts and regime-blocked calls with `shadow: true`, excluded from public stats | `engine.ts:4807` (second branch), `performance.ts:303` | Gates were tuned on a candles-only backtest; live counterfactuals are the only way to know they help | TP1 rate and net R of each shadow class vs published | 2 |
| 7 | Max drawdown, R histogram, horizon-expiry rate, fill rate by entry type, hold-time stats, rr1 and ATR buckets | `performance.ts:375-412` | Cheap, all from existing fields; expiry and fill rate expose target and entry placement problems directly | Tiles populated; expiry rate by trade type | 2 |
| 8 | Per-component reliability table from `context.factors` (agree vs disagree hit rate with CIs); `--weights-json` in the backtest for validation | `performance.ts:242-252` (generalise), `backtest.ts:130-138`, `engine.ts:3350-3374` | First evidence of which of the 20 components earn their weight; the only safe route to weight changes | Components whose lift CI excludes zero; out-of-sample net R of candidate weights | 3 |
| 9 | Macro: blended, capped surprise-SD posterior; store expected direction per asset at release; direction hit-rate posterior per (defId, asset) that downgrades confidence; macro Brier | `history.ts:53-61`, `service.ts:208-226`, `impact.ts:170-195` | Reactions are stored but never refine the maps; SD jumps from prior to a 6-sample estimate | Macro BSS per defId; count of pairs flagged unreliable | 4 |
| 10 | Coverage-gap detection on resume; one write per pass; archive instead of truncate; version hash suffix with date ranges | `core.ts:197-198, 306-309`, `logger.ts:199-201`, `engine.ts:16` | Silent data loss after outages and after 5000 rows; version buckets confounded with time | `coverageGap` count; one write per pass; all-time n never decreases | 2 |

Stage 1 of the online calibration (3.3) is deliberately not in the table: it needs items 4, 5 and 8 first and about 100 decided signals on the current engine version, which at the current logging rate is weeks away. Items 1 through 3 should ship before any public claim about verified performance is repeated, because each one changes the headline number.

---

## Appendix: facts checked

- Tests: `npx vitest run src/app/api/signals/history src/lib/signals/__tests__/setup-tracker.test.ts` -> 3 files, 22 tests passed (2026-10-13).
- Local `data/signal-history.json`: 3 records, all legacy `tp3`, no `fillStatus`, no `engineVersion`; one exhibits the horizon defect (1.2).
- Local `data/macro/releases.json`: 4 releases, 2 with actual and reactions; `us2y` null everywhere; 30s and 1m reactions all zero.
- Engine weights literal at `engine.ts:3350-3374`; macro, event and confirmation weights are injected from `macroScores.weights` at `engine.ts:3420-3422`.
- `context.timeframe` is the constant "15m" (`engine.ts:4828`).
- No `src/middleware.ts`; the only request guard on the history routes is the per-IP rate limiter.
