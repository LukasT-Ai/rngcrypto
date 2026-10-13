# PR 26: TREND / TIMING / FLOW blocks, validation (2026-10-13)

Harness: `scripts/backtest.ts` as in research/backtest-wave2.md (walk-forward, every closed 15m bar, one position per
symbol, 60-minute cooldown, cost model ON, Strike fees, next-open market fills), eight Binance.US symbols (BTC, ETH,
BNB, ADA, XRP, SOL, NEAR, ZEC), window end pinned with `--asof 1791835200000` (2026-10-12 20:00 UTC) so every run
reuses the wave 2 candle cache. The engine is master f7bcd94 (wave 1 + wave 2 + PR 15 defaults) plus the PR 26 blocks.
Report JSONs and logs are in `data/backtests/blocks/` (gitignored); every number below is copied from them.

Decision rule (MASTER-PLAN validation protocol, as practised in PR 15): `blockMode` goes ON by default only if net R per
trade improves on both windows, or on one with no loss beyond 0.01R on the other, AND the calibration table does not
degrade (TP1 rate per stated-confidence band monotone or better, BSS not worse). Deflated Sharpe assumes the original
36-configuration sweep (trial Sharpe spread 0.08, SR0 = 0.172); any bucket under 40 trades is descriptive only.

## What was built (src/lib/signals/blocks.ts, engine.ts, scripts/backtest.ts)

Three blocks, each -100..100 with a vote in {-1, 0, +1} (cast at |score| >= 25 unless gated) and a magnitude:

- **TREND**, one vote per idea: 15m EMA 9/21/50 stack once (weight 0.20), Cloud/200MA/ADX regime score (0.40, already
  15m/4h/1d), market structure BOS/CHoCH from the trend system's `marketStructure` component TF-weighted (0.25, new
  `taSystem.structureScore`), Supertrend (0.15). The 4h EMA trend is a **gate**, not a vote: an opposing 4h trend
  withholds the vote and halves the score; a mixed 4h with the 1h against trims the score by 25%.
- **TIMING**: one momentum rank (0.4 RSI level, 0.3 Stoch RSI level + K/D cross, 0.3 MACD histogram in ATR units)
  and Bollinger %B as the mean-reversion member (equal weight); the band read counts only toward a trending regime
  (Bull/Bear with blended ADX >= 20, re-enabled by a confirmed reversal), as the team-lead asked. Divergences, the
  candle pattern and the liquidity sweep (new `taSystem.sweepScore`) are **confirmation only**: they add up to 15 /
  10 / 10 points of magnitude when they agree and are ignored when they disagree. A volatility squeeze trims the
  read by 30%. A TIMING vote against the TREND vote is withheld unless `taSystem.setup === "reversal_confirmed"` in
  that direction (the PR 15 reversal gate).
- **FLOW** from `features.*` (null = that member abstains): CVD as taker ratio 1h + 15m taker imbalance (0.35),
  OI quadrant (0.20: new longs +60, short cover +30, new shorts -60, long flush -30), book imbalance (0.20),
  liquidation skew (0.15, longs flushed = contrarian bullish as in the liquidation factor), quarter-hour boundary
  imbalance (0.10). Funding crowding (`features.funding.crowded`, or |rate| > FUNDING.HIGH without the feature) is a
  **haircut** of 40% on the crowded side, never a direction. Without a taker feed (the candles-only harness) the
  candle volume factor stands in for the CVD member so the block still votes on something; it is dropped when real
  CVD exists.
- **Combiner** (`--combine vote`): direction = sign of the weighted vote (TREND 0.45, TIMING 0.30, FLOW 0.25);
  agreement = weights voting with the direction minus weights voting against (-1..1); composite = agreement x the
  weighted mean magnitude of the agreeing blocks. Confidence = 50 + |composite| / 2 as before, so the publish
  threshold, logging, flips and calibration all keep working. `--combine sum` = weighted mean of the block scores.
  `--block-agg median` replaces the intra-block weighted mean with median(sign) x strongest magnitude (R2.5).
  Grade: strongCategories = agreeing votes (A+ needs all three). Macro / event / headlines stay gates and size
  multipliers; sentiment, BTC dominance, ETF flows, Elliott and the 5m RSI are not in any block.
- Emitted in every mode: `call.blocks` (real scores), `call.blockVotes {trend, timing, flow, agreement}`,
  `call.blockDetail` (members, notes, gates, composite). `blockMode: "off"` keeps the 18-factor weighted sum as the
  decision; the PR 15 late-session rule keeps reading the first-cut blocks it was validated on in that mode.

## Commands

```
# baseline (shipped defaults, blockMode off)
npx tsx scripts/backtest.ts --days 60  --asof 1791835200000 --report-buckets --sweep-deflate 1 --trials 36 --label base60  --out data/backtests/blocks
npx tsx scripts/backtest.ts --days 120 --asof 1791835200000 --report-buckets --sweep-deflate 1 --trials 36 --label base120 --out data/backtests/blocks
# blocks (same prefix, --days 60 and 120)
... --blocks 1 --combine vote                          --label vote{60,120}
... --blocks 1 --combine sum                           --label sum{60,120}
... --blocks 1 --combine vote --block-agg median       --label median{60,120}
# ablation: drop one block in turn (vote mode)
... --blocks 1 --combine vote --drop-block trend       --label notrend{60,120}
... --blocks 1 --combine vote --drop-block timing      --label notiming{60,120}
... --blocks 1 --combine vote --drop-block flow        --label noflow{60,120}
```

## Verdict: blockMode stays OFF by default

| Config | net R 60d | net R 120d | vs shipped (60d / 120d) | Calibration | Default |
|---|---|---|---|---|---|
| Shipped defaults (18-factor sum, PR 15 gates) | **0.362** (PF 1.59, n 381) | **0.150** (PF 1.23, n 707) | | BSS -0.095 / -0.142 | ON (unchanged) |
| `--blocks 1 --combine vote` | 0.330 (PF 1.56, n 428) | 0.209 (PF 1.35, n 793) | -0.032 / +0.059 | 60d not monotone (75-79 band 50% TP1, -0.05R; grade A 0.097R n 64); BSS -0.144 / -0.130 | OFF: fails 60d beyond the 0.01R tolerance |
| `--blocks 1 --combine sum` | 0.368 (PF 1.63, n 467) | 0.210 (PF 1.35, n 874) | +0.006 / +0.060 | bands near monotone (43.8 / 41.8 / 48.4 / 57.7 / 73.9 on 60d; 43.6 / 43.1 / 46.5 / 63.5 / 65.4 on 120d) but BSS -0.135 / -0.136 vs -0.095 / -0.142: worse on 60d | OFF: net R passes both windows, the calibration leg fails on 60d |
| `--blocks 1 --combine vote --block-agg median` | 0.331 (PF 1.59, n 484) | 0.173 (PF 1.29, n 908) | -0.031 / +0.023 | 80+ band 52.8% TP1 at -0.02R on 120d; BSS -0.265 on 120d (much worse) | OFF |
| ablation `--drop-block trend` (vote) | 0.247 (n 192) | 0.164 (n 344) | | | |
| ablation `--drop-block timing` (vote) | 0.313 (n 403) | 0.190 (n 748) | | | |
| ablation `--drop-block flow` (vote) | 0.340 (n 395) | 0.198 (n 714) | | | |

Reading the numbers honestly:

- **Vote mode fails the protocol.** On the 60d window it loses 0.032R per trade against the shipped engine (0.330 vs
  0.362), three times the 0.01R tolerance, and its confidence spread (60 to 84) is not monotone in realised TP1: the
  75-79 band hits TP1 50% of the time with -0.05R mean net R while the 65-69 band hits 53% at +0.74R. Grade A calls
  (confidence >= 75, n 64 / 86) net 0.097R / 0.054R: the most "agreed" boards are the worst trades, the opposite of
  what the vote model promises. On 120d it gains 0.059R (0.209 vs 0.150, PF 1.35 vs 1.23) with 12% more trades, so
  it is not worse everywhere, but one window out of two is not the rule.
- **Sum mode is the strongest candidate and is also left OFF.** It passes the net R leg on both windows (0.368 vs
  0.362 on 60d, 0.210 vs 0.150 on 120d, sum net R +172 vs +138 and +184 vs +106) and its bands are close to monotone
  (one 2-point dip at 65-69 on 60d, a 0.5-point dip on 120d; the 80+ band reaches 74% / 65% TP1). The calibration leg
  still fails: Brier skill on 60d is -0.135 against -0.095, because the wider confidence spread is read as a probability
  by the naive conf/100 mapping and the extra confidence is not matched by the TP1 rate (a stated 75 pays 58% TP1).
  120d BSS is marginally better (-0.136 vs -0.142). This is a confidence-mapping problem, not a direction problem; it
  belongs to the calibrated pTp1 layer (PR 17), which is still gated on 100 decided live calls.
- **Ablation: TREND carries the edge.** Dropping TREND halves the trade count (192 / 344) and cuts net R to 0.247 /
  0.164; its calibration looks best (BSS -0.063 on 120d) only because almost everything collapses into the 60-64
  band. Dropping TIMING costs 0.017 / 0.019R, so the momentum-plus-location read adds a little on both windows.
  Dropping FLOW *improves* 60d (0.340 vs 0.330) and costs 0.011R on 120d: in the candles-only harness FLOW is the
  candle volume / colour proxy, which the engine audit (4.4) already called "not CVD". The block has not been tested
  with the inputs it was designed for (taker CVD, OI quadrant, book imbalance, quarter-hour imbalance), because none of
  them exist in the harness.
- **Deflated Sharpe:** no block configuration clears PSR(SR0) 0.90 on either window (best 0.417 on 60d for sum, 0.024
  on 120d for vote); the shipped set stays at 0.52 / 0.004. Everything here remains "positive but not distinguishable
  from selection luck" against the original 36-trial sweep. Median aggregation (R2.5) does not generalize better than
  the weighted mean on this sample.
- **Regime slices:** every block configuration keeps the PR 15 shape (longs only outside a Bear regime; shorts n 12-14
  on 60d and still negative). Bull-regime longs are flat to slightly worse under vote (0.228 vs 0.263 on 60d),
  Mixed / Transition slightly better; nothing in the slices overturns the overall numbers.

What ships: the flag (`blockMode: "off"` in DEFAULT_TUNING, logged per record), the backtest flags, and the emitted
fields `call.blocks` (real block scores in every mode), `call.blockVotes`, `call.blockDetail`, plus `blocks` /
`blockVotes` on every logged record so the live ledger accumulates block votes for the next test. No engine
version bump (no default changed); the DEFAULT_TUNING hash suffix of ENGINE_VERSION changes because the knob is new.

Suggested follow-up, in order:

1. Re-run this matrix once the live ledger has block votes alongside real FLOW history (quarter-hour imbalance, OI
   quadrant, taker CVD, book), i.e. a FLOW block fed by what it was designed for. Until then FLOW is a volume proxy.
2. Re-test sum mode against the calibrated pTp1 table (PR 17) instead of conf/100: if the wider spread is monotone
   and pTp1 absorbs the overstatement, the calibration leg passes and sum mode becomes the default candidate.
3. Add the TIMING "turn" read (Stoch cross / RSI change) and a Keltner-inside-Bollinger squeeze-release state as
   members, then ablate; the present TIMING block is level-only and adds ~0.02R.

## 60d window, all configurations

| config | signals | unfilled | closed | TP1 % | gross R | net R | PF | sum net R | SR/trade | t | PSR(SR0) | long % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base60 | 493 | 112 | 381 | 45.1 | 0.477 | 0.362 | 1.59 | 137.85 | 0.174 | 3.401 | 0.52 | 97.6 |
| vote60 | 557 | 129 | 428 | 44.4 | 0.435 | 0.33 | 1.56 | 141.37 | 0.161 | 3.324 | 0.398 | 97.3 |
| sum60 | 607 | 140 | 467 | 44.8 | 0.48 | 0.368 | 1.63 | 171.66 | 0.164 | 3.543 | 0.417 | 97.5 |
| median60 | 627 | 143 | 484 | 46.3 | 0.438 | 0.331 | 1.59 | 160.21 | 0.175 | 3.854 | 0.532 | 97.4 |
| notrend60 | 254 | 61 | 192 | 48.4 | 0.344 | 0.247 | 1.44 | 47.48 | 0.139 | 1.922 | 0.31 | 96.9 |
| notiming60 | 530 | 127 | 403 | 43.9 | 0.422 | 0.313 | 1.51 | 126.2 | 0.151 | 3.037 | 0.316 | 97.2 |
| noflow60 | 525 | 130 | 395 | 46.8 | 0.446 | 0.34 | 1.58 | 134.31 | 0.173 | 3.431 | 0.511 | 97.1 |

By regime (n / net R / PF)

| bucket | base60 | vote60 | sum60 | median60 | notrend60 | notiming60 | noflow60 |
|---|---|---|---|---|---|---|---|
| Bear regime | 12 / -0.298 / 0.46 | 14 / -0.322 / 0.48 | 14 / -0.339 / 0.46 | 15 / -0.221 / 0.56 | 8 / -0.318 / 0.28 | 14 / -0.384 / 0.39 | 14 / -0.32 / 0.48 |
| Bull regime | 240 / 0.263 / 1.42 | 273 / 0.228 / 1.37 | 282 / 0.289 / 1.5 | 291 / 0.349 / 1.59 | 154 / 0.314 / 1.56 | 247 / 0.226 / 1.36 | 267 / 0.393 / 1.69 |
| Mixed | 68 / 0.587 / 1.92 | 77 / 0.613 / 2.06 | 88 / 0.425 / 1.69 | 99 / 0.279 / 1.51 | 16 / -0.049 / 0.92 | 79 / 0.502 / 1.83 | 68 / 0.279 / 1.41 |
| Transition | 61 / 0.631 / 2.21 | 64 / 0.57 / 2.14 | 83 / 0.693 / 2.22 | 79 / 0.434 / 1.87 | 14 / 0.171 / 1.29 | 63 / 0.573 / 2.09 | 46 / 0.324 / 1.61 |

By bias (n / net R / PF)

| bucket | base60 | vote60 | sum60 | median60 | notrend60 | notiming60 | noflow60 |
|---|---|---|---|---|---|---|---|
| LONG | 369 / 0.383 / 1.62 | 414 / 0.352 / 1.6 | 453 / 0.389 / 1.66 | 469 / 0.349 / 1.62 | 184 / 0.272 / 1.47 | 389 / 0.338 / 1.56 | 381 / 0.364 / 1.62 |
| SHORT | 12 / -0.298 / 0.46 | 14 / -0.322 / 0.48 | 14 / -0.339 / 0.46 | 15 / -0.221 / 0.56 | 8 / -0.318 / 0.28 | 14 / -0.384 / 0.39 | 14 / -0.32 / 0.48 |

By grade (n / net R / PF)

| bucket | base60 | vote60 | sum60 | median60 | notrend60 | notiming60 | noflow60 |
|---|---|---|---|---|---|---|---|
| A | - | 64 / 0.097 / 1.19 | 79 / 0.214 / 1.5 | 213 / 0.41 / 1.83 | - | 19 / 0.11 / 1.24 | 27 / 0.228 / 1.59 |
| A+ | - | - | 1 / 0.824 / n/a | 21 / 0.323 / 1.64 | - | - | - |
| B | 381 / 0.362 / 1.59 | 364 / 0.371 / 1.62 | 387 / 0.398 / 1.64 | 250 / 0.264 / 1.43 | 192 / 0.247 / 1.44 | 384 / 0.323 / 1.52 | 368 / 0.348 / 1.58 |

By confidence band (n / net R / PF)

| bucket | base60 | vote60 | sum60 | median60 | notrend60 | notiming60 | noflow60 |
|---|---|---|---|---|---|---|---|
| 60-69 | 381 / 0.362 / 1.59 | 292 / 0.374 / 1.6 | 320 / 0.358 / 1.57 | 123 / 0.213 / 1.37 | 192 / 0.247 / 1.44 | 301 / 0.333 / 1.52 | 310 / 0.347 / 1.57 |
| 70-79 | - | 115 / 0.207 / 1.39 | 121 / 0.345 / 1.64 | 280 / 0.427 / 1.75 | - | 102 / 0.254 / 1.47 | 85 / 0.314 / 1.63 |
| 80+ | - | 21 / 0.39 / 1.98 | 26 / 0.593 / 2.84 | 81 / 0.178 / 1.35 | - | - | - |

By hour block (UTC) (n / net R / PF)

| bucket | base60 | vote60 | sum60 | median60 | notrend60 | notiming60 | noflow60 |
|---|---|---|---|---|---|---|---|
| 00-08 | 130 / 0.314 / 1.46 | 152 / 0.274 / 1.44 | 158 / 0.427 / 1.71 | 175 / 0.24 / 1.38 | 65 / 0.202 / 1.35 | 138 / 0.191 / 1.28 | 165 / 0.359 / 1.6 |
| 08-13 | 77 / 0.398 / 1.66 | 96 / 0.299 / 1.52 | 101 / 0.431 / 1.81 | 106 / 0.241 / 1.44 | 48 / 0.302 / 1.52 | 102 / 0.369 / 1.65 | 94 / 0.29 / 1.53 |
| 13-17 | 81 / 0.651 / 2.33 | 80 / 0.452 / 1.84 | 100 / 0.206 / 1.33 | 96 / 0.418 / 1.78 | 50 / 0.145 / 1.24 | 72 / 0.321 / 1.6 | 81 / 0.455 / 1.78 |
| 17-21 | 67 / 0.07 / 1.11 | 68 / 0.124 / 1.2 | 80 / 0.278 / 1.47 | 81 / 0.448 / 1.88 | 29 / 0.433 / 1.92 | 61 / 0.159 / 1.24 | 55 / 0.198 / 1.33 |
| 21-24 | 26 / 0.343 / 1.61 | 32 / 0.827 / 2.77 | 28 / 0.635 / 2.12 | 26 / 0.626 / 2.41 | - | 30 / 0.983 / 2.86 | - |

By weekend (n / net R / PF)

| bucket | base60 | vote60 | sum60 | median60 | notrend60 | notiming60 | noflow60 |
|---|---|---|---|---|---|---|---|
| weekday | 266 / 0.37 / 1.61 | 315 / 0.335 / 1.56 | 333 / 0.401 / 1.68 | 356 / 0.307 / 1.54 | 148 / 0.275 / 1.48 | 299 / 0.343 / 1.56 | 288 / 0.396 / 1.68 |
| weekend | 115 / 0.343 / 1.56 | 113 / 0.316 / 1.56 | 134 / 0.284 / 1.49 | 128 / 0.398 / 1.73 | 44 / 0.153 / 1.27 | 104 / 0.227 / 1.37 | 107 / 0.19 / 1.32 |

By month (n / net R / PF)

| bucket | base60 | vote60 | sum60 | median60 | notrend60 | notiming60 | noflow60 |
|---|---|---|---|---|---|---|---|
| 2026-08 | 119 / 0.496 / 2.05 | 141 / 0.486 / 2.08 | 148 / 0.35 / 1.71 | 159 / 0.413 / 1.87 | 60 / 0.492 / 2.12 | 134 / 0.46 / 1.97 | 124 / 0.491 / 2.08 |
| 2026-09 | 202 / 0.412 / 1.65 | 224 / 0.305 / 1.49 | 248 / 0.485 / 1.81 | 252 / 0.328 / 1.56 | 105 / 0.311 / 1.54 | 212 / 0.251 / 1.38 | 215 / 0.409 / 1.68 |
| 2026-10 | 60 / -0.074 / 0.91 | 63 / 0.074 / 1.1 | 71 / -0.008 / 0.99 | 73 / 0.165 / 1.25 | 27 / -0.542 / 0.36 | 57 / 0.2 / 1.27 | 56 / -0.257 / 0.69 |

By mode (n / net R / PF)

| bucket | base60 | vote60 | sum60 | median60 | notrend60 | notiming60 | noflow60 |
|---|---|---|---|---|---|---|---|
| reversion | 146 / 0.489 / 1.78 | 162 / 0.46 / 1.78 | 192 / 0.441 / 1.71 | 197 / 0.265 / 1.48 | 33 / -0.054 / 0.92 | 164 / 0.397 / 1.65 | 131 / 0.217 / 1.34 |
| trend | 235 / 0.283 / 1.47 | 266 / 0.252 / 1.43 | 275 / 0.316 / 1.56 | 287 / 0.376 / 1.67 | 159 / 0.31 / 1.57 | 239 / 0.255 / 1.42 | 264 / 0.401 / 1.72 |

By dominant TF (n / net R / PF)

| bucket | base60 | vote60 | sum60 | median60 | notrend60 | notiming60 | noflow60 |
|---|---|---|---|---|---|---|---|
| 15m | 125 / 0.492 / 1.85 | 127 / 0.301 / 1.51 | 140 / 0.2 / 1.33 | 134 / 0.405 / 1.78 | 75 / 0.183 / 1.32 | 125 / 0.021 / 1.03 | 127 / 0.252 / 1.41 |
| 1d | 148 / 0.377 / 1.6 | 155 / 0.348 / 1.56 | 161 / 0.445 / 1.75 | 187 / 0.45 / 1.76 | 62 / 0.538 / 1.96 | 139 / 0.473 / 1.77 | 153 / 0.503 / 1.85 |
| 1h | 7 / 0.549 / 2.04 | 36 / 0.578 / 1.89 | 43 / 0.838 / 2.35 | 43 / 0.272 / 1.43 | 7 / -0.39 / 0.6 | 32 / 0.75 / 2.1 | 23 / 0.327 / 1.53 |
| 4h | 101 / 0.165 / 1.26 | 110 / 0.257 / 1.5 | 123 / 0.293 / 1.54 | 120 / 0.084 / 1.16 | 48 / 0.066 / 1.13 | 107 / 0.317 / 1.62 | 92 / 0.195 / 1.38 |

By exit reason (n / net R / PF)

| bucket | base60 | vote60 | sum60 | median60 | notrend60 | notiming60 | noflow60 |
|---|---|---|---|---|---|---|---|
| horizon | 51 / 0.669 / 4.47 | 67 / 0.497 / 3.75 | 74 / 0.563 / 4.03 | 78 / 0.387 / 3.24 | 34 / 0.265 / 2.54 | 51 / 0.486 / 3.59 | 58 / 0.283 / 2.24 |
| open | - | - | - | - | 0 / n/a / 0 | - | - |
| stop_after_tp | 38 / 1.628 / n/a | 42 / 1.633 / n/a | 48 / 1.635 / n/a | 59 / 1.512 / 1305.21 | 16 / 1.837 / n/a | 40 / 1.657 / n/a | 49 / 1.611 / n/a |
| stop_before_tp | 197 / -1.132 / 0 | 214 / -1.117 / 0 | 232 / -1.123 / 0 | 231 / -1.117 / 0 | 93 / -1.109 / 0 | 211 / -1.12 / 0 | 194 / -1.122 / 0 |
| tp3 | 95 / 2.789 / n/a | 105 / 2.652 / n/a | 113 / 2.762 / n/a | 116 / 2.576 / n/a | 49 / 2.291 / n/a | 101 / 2.687 / n/a | 94 / 2.73 / n/a |
| unfilled | 0 / n/a / 0 | 0 / n/a / 0 | 0 / n/a / 0 | 0 / n/a / 0 | 0 / n/a / 0 | 0 / n/a / 0 | 0 / n/a / 0 |

Calibration (stated confidence vs realised TP1; n / TP1 % [Wilson] / mean net R)

| band | base60 | vote60 | sum60 | median60 | notrend60 | notiming60 | noflow60 |
|---|---|---|---|---|---|---|---|
| 60-64 | 340 / 47.4% [42.1-52.7] / 0.38 | 171 / 37.4% [30.5-44.9] / 0.16 | 210 / 43.8% [37.3-50.6] / 0.46 | 75 / 48% [37.1-59.1] / 0.3 | 177 / 50.3% [43-57.6] / 0.28 | 162 / 41.4% [34.1-49.1] / 0.32 | 193 / 42% [35.2-49] / 0.24 |
| 65-69 | 29 / 37.9% [22.7-56] / 0.18 | 105 / 53.3% [43.8-62.6] / 0.74 | 91 / 41.8% [32.2-52] / 0.11 | 38 / 42.1% [27.9-57.8] / 0.06 | 9 / 44.4% [18.9-73.3] / -0.36 | 131 / 45.8% [37.5-54.3] / 0.35 | 103 / 55.3% [45.7-64.6] / 0.54 |
| 70-74 | - | 68 / 54.4% [42.7-65.7] / 0.36 | 64 / 48.4% [36.6-60.4] / 0.59 | 121 / 41.3% [32.9-50.2] / 0.31 | - | 79 / 50.6% [39.8-61.4] / 0.29 | 57 / 52.6% [39.9-65] / 0.35 |
| 75-79 | - | 42 / 50% [35.5-64.5] / -0.05 | 52 / 57.7% [44.2-70.1] / 0.04 | 143 / 55.9% [47.8-63.8] / 0.52 | - | 16 / 62.5% [38.6-81.5] / 0.11 | 26 / 65.4% [46.2-80.6] / 0.23 |
| 80-84 | - | 18 / 66.7% [43.7-83.7] / 0.39 | 23 / 73.9% [53.5-87.5] / 0.58 | 58 / 53.4% [40.8-65.7] / 0.13 | - | - | - |
| 85-89 | - | - | 1 / 100% [20.7-100] / 0.82 | 20 / 55% [34.2-74.2] / 0.32 | - | - | - |
| Brier / BSS | 0.27254 / -0.095189 | 0.285107 / -0.144468 | 0.282886 / -0.134631 | 0.308376 / -0.233795 | 0.264002 / -0.056009 | 0.287196 / -0.157672 | 0.274525 / -0.098721 |

Sweep deflation (36 trials, trial SD 0.08)

- base60: SR 0.174 (T=381, skew 1.644, kurt 6.356), SR0 0.172, PSR(0) 1, PSR(SR0) 0.52, MinTRL vs 0 at 95% 69 trades
- vote60: SR 0.161 (T=428, skew 1.879, kurt 7.433), SR0 0.172, PSR(0) 1, PSR(SR0) 0.398, MinTRL vs 0 at 95% 79 trades
- sum60: SR 0.164 (T=467, skew 2.783, kurt 17.005), SR0 0.172, PSR(0) 1, PSR(SR0) 0.417, MinTRL vs 0 at 95% 67 trades
- median60: SR 0.175 (T=484, skew 1.417, kurt 4.696), SR0 0.172, PSR(0) 1, PSR(SR0) 0.532, MinTRL vs 0 at 95% 70 trades
- notrend60: SR 0.139 (T=192, skew 1.291, kurt 3.716), SR0 0.172, PSR(0) 0.982, PSR(SR0) 0.31, MinTRL vs 0 at 95% 118 trades
- notiming60: SR 0.151 (T=403, skew 1.836, kurt 7.232), SR0 0.172, PSR(0) 1, PSR(SR0) 0.316, MinTRL vs 0 at 95% 91 trades
- noflow60: SR 0.173 (T=395, skew 1.642, kurt 6.717), SR0 0.172, PSR(0) 1, PSR(SR0) 0.511, MinTRL vs 0 at 95% 70 trades

## 120d window, all configurations

| config | signals | unfilled | closed | TP1 % | gross R | net R | PF | sum net R | SR/trade | t | PSR(SR0) | long % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base120 | 893 | 186 | 707 | 40.7 | 0.269 | 0.15 | 1.23 | 106.33 | 0.078 | 2.078 | 0.004 | 83.2 |
| vote120 | 1023 | 230 | 793 | 44.5 | 0.319 | 0.209 | 1.35 | 165.43 | 0.109 | 3.073 | 0.024 | 83.7 |
| sum120 | 1119 | 245 | 874 | 43.2 | 0.326 | 0.21 | 1.35 | 183.78 | 0.105 | 3.092 | 0.012 | 84.4 |
| median120 | 1182 | 274 | 908 | 43.9 | 0.287 | 0.173 | 1.29 | 156.65 | 0.098 | 2.945 | 0.008 | 84.3 |
| notrend120 | 436 | 91 | 344 | 45.9 | 0.267 | 0.164 | 1.29 | 56.46 | 0.093 | 1.73 | 0.056 | 81.2 |
| notiming120 | 963 | 215 | 748 | 44.1 | 0.303 | 0.19 | 1.32 | 142.02 | 0.1 | 2.731 | 0.015 | 83.7 |
| noflow120 | 934 | 220 | 714 | 44 | 0.31 | 0.198 | 1.33 | 141.5 | 0.107 | 2.852 | 0.029 | 81.6 |

By regime (n / net R / PF)

| bucket | base120 | vote120 | sum120 | median120 | notrend120 | notiming120 | noflow120 |
|---|---|---|---|---|---|---|---|
| Bear regime | 121 / -0.159 / 0.75 | 130 / 0.024 / 1.04 | 138 / 0.016 / 1.03 | 135 / -0.166 / 0.73 | 70 / -0.035 / 0.93 | 125 / -0.023 / 0.96 | 136 / 0.006 / 1.01 |
| Bull regime | 255 / 0.262 / 1.42 | 290 / 0.216 / 1.36 | 301 / 0.285 / 1.49 | 312 / 0.32 / 1.54 | 165 / 0.34 / 1.62 | 263 / 0.23 / 1.37 | 286 / 0.359 / 1.63 |
| Mixed | 194 / 0.122 / 1.17 | 222 / 0.227 / 1.39 | 245 / 0.13 / 1.21 | 263 / 0.126 / 1.21 | 59 / -0.069 / 0.9 | 216 / 0.197 / 1.33 | 182 / 0.145 / 1.22 |
| Transition | 137 / 0.257 / 1.39 | 151 / 0.328 / 1.58 | 190 / 0.337 / 1.54 | 198 / 0.233 / 1.41 | 50 / 0.137 / 1.22 | 144 / 0.29 / 1.5 | 110 / 0.107 / 1.19 |

By bias (n / net R / PF)

| bucket | base120 | vote120 | sum120 | median120 | notrend120 | notiming120 | noflow120 |
|---|---|---|---|---|---|---|---|
| LONG | 586 / 0.214 / 1.33 | 663 / 0.245 / 1.41 | 736 / 0.247 / 1.41 | 773 / 0.232 / 1.39 | 274 / 0.215 / 1.37 | 623 / 0.233 / 1.38 | 578 / 0.243 / 1.4 |
| SHORT | 121 / -0.159 / 0.75 | 130 / 0.024 / 1.04 | 138 / 0.016 / 1.03 | 135 / -0.166 / 0.73 | 70 / -0.035 / 0.93 | 125 / -0.023 / 0.96 | 136 / 0.006 / 1.01 |

By grade (n / net R / PF)

| bucket | base120 | vote120 | sum120 | median120 | notrend120 | notiming120 | noflow120 |
|---|---|---|---|---|---|---|---|
| A | - | 86 / 0.054 / 1.11 | 107 / 0.143 / 1.34 | 377 / 0.199 / 1.37 | - | 24 / -0.01 / 0.98 | 31 / 0.112 / 1.25 |
| A+ | - | 1 / -1.026 / 0 | 2 / -0.101 / 0.8 | 27 / 0.185 / 1.33 | - | - | - |
| B | 707 / 0.15 / 1.23 | 706 / 0.229 / 1.38 | 765 / 0.22 / 1.35 | 504 / 0.152 / 1.24 | 344 / 0.164 / 1.29 | 724 / 0.196 / 1.33 | 683 / 0.202 / 1.33 |

By confidence band (n / net R / PF)

| bucket | base120 | vote120 | sum120 | median120 | notrend120 | notiming120 | noflow120 |
|---|---|---|---|---|---|---|---|
| 60-69 | 707 / 0.15 / 1.23 | 593 / 0.224 / 1.36 | 669 / 0.201 / 1.32 | 242 / 0.129 / 1.2 | 344 / 0.164 / 1.29 | 592 / 0.188 / 1.3 | 592 / 0.191 / 1.31 |
| 70-79 | - | 176 / 0.157 / 1.32 | 175 / 0.219 / 1.43 | 544 / 0.225 / 1.38 | - | 156 / 0.195 / 1.39 | 122 / 0.232 / 1.46 |
| 80+ | - | 24 / 0.211 / 1.44 | 30 / 0.375 / 1.89 | 122 / 0.026 / 1.05 | - | - | - |

By hour block (UTC) (n / net R / PF)

| bucket | base120 | vote120 | sum120 | median120 | notrend120 | notiming120 | noflow120 |
|---|---|---|---|---|---|---|---|
| 00-08 | 226 / 0.038 / 1.05 | 253 / 0.154 / 1.24 | 268 / 0.164 / 1.25 | 305 / 0.095 / 1.15 | 108 / 0.244 / 1.44 | 233 / 0.07 / 1.1 | 263 / 0.224 / 1.36 |
| 08-13 | 141 / 0.313 / 1.53 | 167 / 0.243 / 1.41 | 167 / 0.398 / 1.71 | 183 / 0.21 / 1.38 | 69 / 0.328 / 1.57 | 172 / 0.351 / 1.62 | 160 / 0.289 / 1.51 |
| 13-17 | 161 / 0.247 / 1.42 | 187 / 0.162 / 1.29 | 227 / 0.17 / 1.3 | 212 / 0.212 / 1.36 | 98 / 0.047 / 1.08 | 171 / 0.025 / 1.04 | 177 / 0.127 / 1.21 |
| 17-21 | 131 / 0.106 / 1.16 | 133 / 0.212 / 1.37 | 156 / 0.107 / 1.17 | 162 / 0.173 / 1.29 | 69 / 0.043 / 1.07 | 119 / 0.282 / 1.5 | 114 / 0.122 / 1.2 |
| 21-24 | 48 / -0.002 / 1 | 53 / 0.514 / 2.19 | 56 / 0.322 / 1.6 | 46 / 0.357 / 1.76 | - | 53 / 0.522 / 2.05 | - |

By weekend (n / net R / PF)

| bucket | base120 | vote120 | sum120 | median120 | notrend120 | notiming120 | noflow120 |
|---|---|---|---|---|---|---|---|
| weekday | 509 / 0.176 / 1.27 | 596 / 0.203 / 1.34 | 640 / 0.226 / 1.37 | 686 / 0.125 / 1.2 | 272 / 0.179 / 1.31 | 562 / 0.225 / 1.37 | 544 / 0.227 / 1.38 |
| weekend | 198 / 0.084 / 1.13 | 197 / 0.224 / 1.42 | 234 / 0.167 / 1.29 | 222 / 0.32 / 1.6 | 72 / 0.109 / 1.19 | 186 / 0.083 / 1.14 | 170 / 0.106 / 1.18 |

By month (n / net R / PF)

| bucket | base120 | vote120 | sum120 | median120 | notrend120 | notiming120 | noflow120 |
|---|---|---|---|---|---|---|---|
| 2026-06 | 88 / 0.077 / 1.12 | 97 / 0.241 / 1.45 | 111 / 0.325 / 1.66 | 118 / 0.08 / 1.14 | 52 / 0.119 / 1.21 | 94 / 0.167 / 1.3 | 90 / 0.246 / 1.43 |
| 2026-07 | 169 / -0.096 / 0.87 | 188 / 0.083 / 1.14 | 208 / -0.02 / 0.97 | 218 / 0.057 / 1.09 | 67 / -0.073 / 0.89 | 180 / 0.062 / 1.1 | 166 / -0.079 / 0.88 |
| 2026-08 | 188 / 0.196 / 1.35 | 221 / 0.242 / 1.48 | 236 / 0.136 / 1.24 | 247 / 0.163 / 1.3 | 93 / 0.4 / 1.92 | 205 / 0.247 / 1.48 | 187 / 0.316 / 1.64 |
| 2026-09 | 202 / 0.412 / 1.65 | 224 / 0.305 / 1.49 | 248 / 0.485 / 1.81 | 252 / 0.328 / 1.56 | 105 / 0.311 / 1.54 | 212 / 0.251 / 1.38 | 215 / 0.409 / 1.68 |
| 2026-10 | 60 / -0.074 / 0.91 | 63 / 0.074 / 1.1 | 71 / -0.008 / 0.99 | 73 / 0.165 / 1.25 | 27 / -0.542 / 0.36 | 57 / 0.2 / 1.27 | 56 / -0.257 / 0.69 |

By mode (n / net R / PF)

| bucket | base120 | vote120 | sum120 | median120 | notrend120 | notiming120 | noflow120 |
|---|---|---|---|---|---|---|---|
| reversion | 379 / 0.123 / 1.18 | 415 / 0.211 / 1.36 | 476 / 0.192 / 1.31 | 506 / 0.115 / 1.19 | 115 / 0.011 / 1.02 | 408 / 0.165 / 1.27 | 336 / 0.106 / 1.17 |
| trend | 328 / 0.182 / 1.3 | 378 / 0.206 / 1.35 | 398 / 0.233 / 1.41 | 402 / 0.245 / 1.42 | 229 / 0.241 / 1.45 | 340 / 0.22 / 1.37 | 378 / 0.28 / 1.49 |

By dominant TF (n / net R / PF)

| bucket | base120 | vote120 | sum120 | median120 | notrend120 | notiming120 | noflow120 |
|---|---|---|---|---|---|---|---|
| 15m | 259 / 0.128 / 1.2 | 282 / 0.076 / 1.13 | 310 / 0.104 / 1.17 | 298 / 0.125 / 1.21 | 143 / 0.12 / 1.22 | 287 / -0.1 / 0.85 | 278 / 0.004 / 1.01 |
| 1d | 220 / 0.139 / 1.21 | 236 / 0.231 / 1.38 | 249 / 0.268 / 1.45 | 280 / 0.295 / 1.48 | 92 / 0.234 / 1.38 | 208 / 0.353 / 1.59 | 219 / 0.41 / 1.7 |
| 1h | 12 / 0.651 / 2.1 | 47 / 0.578 / 1.9 | 64 / 0.548 / 1.84 | 76 / 0.108 / 1.17 | 15 / 0.657 / 1.97 | 42 / 0.596 / 1.92 | 30 / 0.269 / 1.47 |
| 4h | 216 / 0.162 / 1.25 | 228 / 0.273 / 1.51 | 251 / 0.198 / 1.34 | 254 / 0.113 / 1.2 | 94 / 0.084 / 1.14 | 211 / 0.342 / 1.67 | 187 / 0.227 / 1.43 |

By exit reason (n / net R / PF)

| bucket | base120 | vote120 | sum120 | median120 | notrend120 | notiming120 | noflow120 |
|---|---|---|---|---|---|---|---|
| horizon | 110 / 0.429 / 2.94 | 139 / 0.435 / 3.43 | 157 / 0.443 / 3.49 | 166 / 0.419 / 3.15 | 73 / 0.566 / 4.08 | 119 / 0.273 / 2.36 | 115 / 0.263 / 2.32 |
| open | - | - | - | - | 0 / n/a / 0 | - | - |
| stop_after_tp | 70 / 1.503 / n/a | 81 / 1.379 / n/a | 87 / 1.364 / n/a | 103 / 1.436 / 2162.99 | 29 / 1.818 / n/a | 75 / 1.361 / n/a | 82 / 1.37 / n/a |
| stop_before_tp | 384 / -1.135 / 0 | 392 / -1.126 / 0 | 438 / -1.13 / 0 | 450 / -1.128 / 0 | 165 / -1.117 / 0 | 378 / -1.127 / 0 | 361 / -1.128 / 0 |
| tp3 | 143 / 2.726 / n/a | 181 / 2.401 / n/a | 192 / 2.556 / n/a | 189 / 2.364 / n/a | 77 / 1.907 / n/a | 176 / 2.464 / n/a | 156 / 2.603 / n/a |
| unfilled | 0 / n/a / 0 | 0 / n/a / 0 | 0 / n/a / 0 | 0 / n/a / 0 | 0 / n/a / 0 | 0 / n/a / 0 | 0 / n/a / 0 |

Calibration (stated confidence vs realised TP1; n / TP1 % [Wilson] / mean net R)

| band | base120 | vote120 | sum120 | median120 | notrend120 | notiming120 | noflow120 |
|---|---|---|---|---|---|---|---|
| 60-64 | 631 / 43.1% [39.3-47] / 0.16 | 368 / 41% [36.1-46.1] / 0.14 | 461 / 43.6% [39.1-48.2] / 0.25 | 161 / 45.3% [37.8-53.1] / 0.19 | 307 / 49.2% [43.6-54.8] / 0.2 | 340 / 44.1% [38.9-49.4] / 0.24 | 380 / 42.6% [37.8-47.7] / 0.16 |
| 65-69 | 41 / 39% [25.7-54.3] / 0 | 195 / 51.3% [44.3-58.2] / 0.38 | 167 / 43.1% [35.8-50.7] / 0.07 | 64 / 34.4% [23.9-46.6] / -0.01 | 16 / 43.8% [23.1-66.8] / -0.34 | 225 / 44.4% [38.1-51] / 0.11 | 178 / 48.3% [41.1-55.6] / 0.27 |
| 70-74 | - | 101 / 54.5% [44.8-63.8] / 0.26 | 86 / 46.5% [36.3-57] / 0.36 | 248 / 43.5% [37.5-49.8] / 0.17 | - | 122 / 55.7% [46.9-64.2] / 0.23 | 87 / 55.2% [44.7-65.2] / 0.27 |
| 75-79 | - | 60 / 58.3% [45.7-69.9] / -0.02 | 74 / 63.5% [52.1-73.6] / 0.05 | 261 / 52.1% [46.1-58.1] / 0.27 | - | 21 / 57.1% [36.5-75.5] / -0.01 | 30 / 60% [42.3-75.4] / 0.11 |
| 80-84 | - | 20 / 60% [38.7-78.1] / 0.26 | 26 / 65.4% [46.2-80.6] / 0.41 | 89 / 52.8% [42.5-62.8] / -0.02 | - | - | - |
| 85-89 | - | 1 / 0% [0-79.3] / -1.03 | 2 / 50% [9.5-90.5] / -0.1 | 26 / 50% [32.1-67.9] / 0.19 | - | - | - |
| Brier / BSS | 0.279771 / -0.142398 | 0.281819 / -0.130374 | 0.282553 / -0.136356 | 0.315144 / -0.26514 | 0.265743 / -0.063472 | 0.283039 / -0.137382 | 0.280403 / -0.127078 |

Sweep deflation (36 trials, trial SD 0.08)

- base120: SR 0.078 (T=707, skew 1.854, kurt 7.122), SR0 0.172, PSR(0) 0.987, PSR(SR0) 0.004, MinTRL vs 0 at 95% 386 trades
- vote120: SR 0.109 (T=793, skew 2.02, kurt 8.191), SR0 0.172, PSR(0) 1, PSR(SR0) 0.024, MinTRL vs 0 at 95% 184 trades
- sum120: SR 0.105 (T=874, skew 2.685, kurt 16.319), SR0 0.172, PSR(0) 1, PSR(SR0) 0.012, MinTRL vs 0 at 95% 188 trades
- median120: SR 0.098 (T=908, skew 1.514, kurt 5.01), SR0 0.172, PSR(0) 0.999, PSR(SR0) 0.008, MinTRL vs 0 at 95% 244 trades
- notrend120: SR 0.093 (T=344, skew 1.788, kurt 6.802), SR0 0.172, PSR(0) 0.969, PSR(SR0) 0.056, MinTRL vs 0 at 95% 266 trades
- notiming120: SR 0.1 (T=748, skew 1.962, kurt 7.874), SR0 0.172, PSR(0) 0.999, PSR(SR0) 0.015, MinTRL vs 0 at 95% 224 trades
- noflow120: SR 0.107 (T=714, skew 1.772, kurt 7.07), SR0 0.172, PSR(0) 0.999, PSR(SR0) 0.029, MinTRL vs 0 at 95% 197 trades
