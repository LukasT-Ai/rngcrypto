# Wave 2 strategy validation (PR 15), 2026-10-13

Harness: `scripts/backtest.ts` (walk-forward, every closed 15m bar, one position per symbol, 60-minute cooldown, cost model ON, Strike fees, next-open market fills). Eight Binance.US-listed symbols (BTC, ETH, BNB, ADA, XRP, SOL, NEAR, ZEC). Window end pinned with `--asof 1791835200000` (2026-10-12 20:00 UTC) so every run shares the same candle cache. Baseline and the seven single changes ran on the pre-merge engine (master e6fc09f + the PR 15 knobs, all OFF); the confirmation (`final60` / `final120`) ran on the merged engine (master 8cead21 + PR 15) with the decided defaults. Report JSONs and logs sit in `data/backtests/wave2/` (gitignored); every number below is copied from them.

Decision rule (MASTER-PLAN validation protocol): a knob goes ON by default only if net R per trade improves on both windows, or on one with no loss on the other, and the calibration table (stated confidence vs realised TP1, Brier / BSS) does not degrade. Deflated Sharpe assumes the original 36-configuration sweep (trial Sharpe spread 0.08, SR0 = 0.172); any bucket under 40 trades is descriptive only.

## Commands

```
# baseline
npx tsx scripts/backtest.ts --days 60  --asof 1791835200000 --report-buckets --sweep-deflate 1 --trials 36 --label base60  --out data/backtests/wave2
npx tsx scripts/backtest.ts --days 120 --asof 1791835200000 --report-buckets --sweep-deflate 1 --trials 36 --label base120 --out data/backtests/wave2
# single changes (same prefix, --days 60 and 120)
... --mr-with-regime 1               --label mr{60,120}
... --breakeven-after-tp1 1          --label be{60,120}
... --htf-gate-both 1 --htf-vote 0   --label htf{60,120}
... --short-regime 1                 --label short{60,120}
... --min-rr 1.5                     --label minrr{60,120}
... --session-rules 1                --label session{60,120}
... --horizon-by-tf 1                --label hz{60,120}
# combinations
... --short-regime 1 --min-rr 1.5 --session-rules 1                     --label comboA{60,120}
... --short-regime 1 --min-rr 1.5 --session-rules 1 --horizon-by-tf 1   --label comboB{60,120}
# confirmation of the shipped defaults on the merged engine (no flags = DEFAULT_TUNING)
npx tsx scripts/backtest.ts --days 60  --asof 1791835200000 --report-buckets --sweep-deflate 1 --trials 36 --label final60  --out data/backtests/wave2
npx tsx scripts/backtest.ts --days 120 --asof 1791835200000 --report-buckets --sweep-deflate 1 --trials 36 --label final120 --write-hold-buckets 1 --out data/backtests/wave2
```

## Verdict

| Change | Flag / knob | net R 60d | net R 120d | Calibration | Default |
|---|---|---|---|---|---|
| Baseline | | 0.260 | 0.095 | BSS -0.123 / -0.159 | |
| SHORT only in Bear regime or confirmed bearish reversal | `--short-regime 1` / `shortNeedsBearRegime` | **0.337** | **0.134** | improves (-0.096 / -0.144) | **ON** |
| Session rules (crypto weekend half size, 21-24 UTC WAIT unless trend+flow agree, non-crypto weekend WAIT) | `--session-rules 1` / `sessionRules` | **0.280** | **0.112** | unchanged (-0.124 / -0.156) | **ON** |
| Minimum R:R 1.5 at TP2 | `--min-rr 1.5` / `minRr` | 0.314 | 0.153 | degrades: TP1 rate in the 60-64 bin 44.5% -> 34.7% (60d), 42.2% -> 32.3% (120d); BSS -0.298 / -0.379 | OFF |
| Horizon by dominant timeframe (12/36/96h) | `--horizon-by-tf 1` / `horizonByTf` | 0.255 (-0.005) | 0.155 | neutral (-0.138 / -0.155) | OFF (60d flat; comboB vs comboA: +0.018 on 120d, -0.015 on 60d) |
| Symmetric HTF gate, HTF vote removed | `--htf-gate-both 1 --htf-vote 0` / `htfGateBoth`, `htfVote` | 0.161 | 0.119 | slightly better | OFF (fails 60d) |
| Mean reversion only toward the regime | `--mr-with-regime 1` / `mrWithRegime` | 0.206 | 0.089 | degrades (-0.151 / -0.162) | OFF (fails both) |
| Breakeven stop after TP1 | `--breakeven-after-tp1 1` / `breakevenAfterTp1` | -0.051 | -0.161 | degrades | OFF (fails hard) |
| Macro bonus frozen at 0 | `macroBonusScale: 0` | n/a (live path only; the candles-only harness never has a macro state) | | | ON (frozen) |

Shipped defaults: `shortNeedsBearRegime: true`, `sessionRules: true`, `macroBonusScale: 0`; everything else OFF. `ENGINE_VERSION_BASE` = `2026.10.13-wave2`.

Confirmation on the merged engine with exactly those defaults: 60d net **+0.362R** (PF 1.59, TP1 45.1%, n 381, PSR(SR0) 0.52) and 120d net **+0.150R** (PF 1.23, TP1 40.7%, n 707, PSR(SR0) 0.004). Against the single-change runs this is the expected sum of the two gates (0.337 + 0.280 - 0.260 = 0.357 on 60d; 0.134 + 0.112 - 0.095 = 0.151 on 120d); the merged engine (OKX taker column fix, dead calls removed) does not change the candles-only path, so there is no material deviation. The calibration table of the shipped set matches the short-regime run (BSS -0.095 / -0.142, better than the baseline).

### Reading the numbers honestly

- The 120d window still contains the Jun-Aug 2026 stretch where every configuration is near zero (2026-07 is -0.12R on the baseline and -0.02R at best). The gates add about +0.05R there and about +0.10R on the 60d window; they do not create an edge in July.
- The short-regime rule removes about 90% of shorts (111 -> 12 on 60d, 340 -> 121 on 120d). The survivors are still negative (-0.30R / -0.16R, n 12 / 121). The engine is now a long-biased trend system with shorts only in a Bear regime; the public copy should say so.
- Min R:R 1.5 raises net R on both windows by filtering clustered-level ladders (TP3 payoff 2.8R -> 4.2R) but it lowers the TP1 hit rate by 10 points at unchanged stated confidence, which breaks the calibration table. Revisit once P(TP1) is published per rr1 bucket (the `byRr1` calibration slice exists) so confidence can absorb the farther TP1.
- Horizon by timeframe: the dominant-TF bucket shows where it pays (120d, base -> hz): 4h-dominant 0.164 -> 0.304R (n 316 / 309), 1d-dominant 0.057 -> 0.173R (n 255 / 235), 15m-dominant 0.043 -> -0.026R (n 342 / 331). The flat 24h cuts 4h/1d setups short, as the research predicted, but the 12h clock hurts 15m setups by about as much. A better rule is 24h for 15m and 96h for 4h/1d; untested, left OFF.
- Breakeven after TP1 is a disaster under the ledger's exit convention (a stop after a TP exits at the last TP, +1.5R average): moving the stop to the fill turns those exits into 0R and the stop_after_tp bucket from +1.55R (n 44) to -0.11R (n 106) on 60d. The flag only makes sense together with a partial-exit model; it stays a flag.
- Deflated Sharpe: with the original 36-trial sweep as the benchmark, no 120d configuration clears PSR(SR0) 0.90 (best 0.043). On 60d the shipped set reaches 0.52, comboA 0.66. Every configuration is "positive but not distinguishable from selection luck"; MinTRL against zero is 69 trades (60d) / 386 trades (120d) for the shipped defaults.

## Single changes, 60d window

| config | signals | unfilled | closed | TP1 % | gross R | net R | PF | sum net R | SR/trade | t | PSR(SR0) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| base60 | 622 | 136 | 484 | 42.4 | 0.375 | 0.26 | 1.41 | 125.91 | 0.128 | 2.819 | 0.140 |
| short60 | 497 | 111 | 386 | 45.1 | 0.451 | 0.337 | 1.55 | 130.01 | 0.164 | 3.215 | 0.429 |
| minrr60 | 616 | 173 | 441 | 34.7 | 0.443 | 0.314 | 1.43 | 138.39 | 0.14 | 2.946 | 0.228 |
| session60 | 616 | 137 | 477 | 42.3 | 0.395 | 0.28 | 1.44 | 133.58 | 0.137 | 2.986 | 0.195 |
| hz60 | 594 | 131 | 461 | 41 | 0.368 | 0.255 | 1.41 | 117.62 | 0.127 | 2.731 | 0.141 |
| htf60 | 513 | 112 | 399 | 43.4 | 0.269 | 0.161 | 1.26 | 64.36 | 0.089 | 1.777 | 0.038 |
| mr60 | 648 | 149 | 497 | 40.6 | 0.321 | 0.206 | 1.32 | 102.32 | 0.101 | 2.261 | 0.041 |
| be60 | 677 | 156 | 519 | 40.8 | 0.065 | -0.051 | 0.92 | -26.23 | -0.027 | -0.61 | 0.000 |

By regime (n / net R / PF)

| bucket | base60 | short60 | minrr60 | session60 | hz60 | htf60 | mr60 | be60 |
|---|---|---|---|---|---|---|---|---|
| Bear regime | 10 / -0.168 / 0.64 | 12 / -0.314 / 0.45 | 7 / -0.1 / 0.86 | 10 / -0.149 / 0.67 | 5 / -0.185 / 0.64 | 7 / 0.01 / 1.05 | 10 / -0.309 / 0.48 | 12 / -0.431 / 0.09 |
| Bull regime | 241 / 0.235 / 1.37 | 240 / 0.241 / 1.38 | 225 / 0.346 / 1.5 | 241 / 0.257 / 1.41 | 234 / 0.216 / 1.34 | 212 / 0.171 / 1.27 | 253 / 0.14 / 1.21 | 260 / -0.201 / 0.71 |
| Mixed | 112 / 0.429 / 1.66 | 70 / 0.517 / 1.79 | 101 / 0.512 / 1.71 | 110 / 0.47 / 1.73 | 106 / 0.46 / 1.74 | 92 / 0.364 / 1.6 | 113 / 0.414 / 1.63 | 115 / 0.298 / 1.47 |
| Transition | 121 / 0.191 / 1.31 | 64 / 0.623 / 2.25 | 108 / 0.087 / 1.11 | 116 / 0.185 / 1.29 | 116 / 0.165 / 1.27 | 88 / -0.062 / 0.9 | 121 / 0.191 / 1.31 | 132 / -0.023 / 0.96 |

By bias (n / net R / PF)

| bucket | base60 | short60 | minrr60 | session60 | hz60 | htf60 | mr60 | be60 |
|---|---|---|---|---|---|---|---|---|
| LONG | 373 / 0.375 / 1.61 | 374 / 0.358 / 1.58 | 344 / 0.442 / 1.64 | 368 / 0.401 / 1.66 | 356 / 0.369 / 1.61 | 287 / 0.224 / 1.37 | 386 / 0.305 / 1.48 | 401 / 0.012 / 1.02 |
| SHORT | 111 / -0.127 / 0.82 | 12 / -0.314 / 0.45 | 97 / -0.139 / 0.83 | 109 / -0.129 / 0.82 | 105 / -0.131 / 0.81 | 112 / 0 / 1 | 111 / -0.14 / 0.81 | 118 / -0.264 / 0.63 |

By hour block (UTC) (n / net R / PF)

| bucket | base60 | short60 | minrr60 | session60 | hz60 | htf60 | mr60 | be60 |
|---|---|---|---|---|---|---|---|---|
| 00-08 | 141 / 0.437 / 1.68 | 116 / 0.369 / 1.55 | 137 / 0.483 / 1.67 | 155 / 0.384 / 1.59 | 143 / 0.467 / 1.76 | 118 / 0.294 / 1.46 | 156 / 0.512 / 1.81 | 149 / -0.016 / 0.98 |
| 08-13 | 102 / 0.177 / 1.27 | 79 / 0.343 / 1.55 | 92 / 0.274 / 1.38 | 100 / 0.216 / 1.34 | 98 / 0.342 / 1.53 | 82 / 0.135 / 1.24 | 104 / 0.078 / 1.12 | 110 / -0.102 / 0.85 |
| 13-17 | 102 / 0.356 / 1.63 | 80 / 0.545 / 2.07 | 85 / 0.4 / 1.58 | 103 / 0.441 / 1.8 | 94 / 0.229 / 1.41 | 85 / 0.323 / 1.55 | 101 / 0.343 / 1.6 | 109 / 0.079 / 1.13 |
| 17-21 | 80 / 0.067 / 1.1 | 65 / 0.075 / 1.11 | 81 / 0.174 / 1.25 | 82 / 0.063 / 1.1 | 78 / -0.032 / 0.95 | 66 / 0.075 / 1.12 | 79 / -0.141 / 0.8 | 86 / -0.219 / 0.68 |
| 21-24 | 59 / 0.078 / 1.12 | 46 / 0.252 / 1.44 | 46 / -0.025 / 0.97 | 37 / 0.047 / 1.07 | 48 / -0.033 / 0.95 | 48 / -0.287 / 0.61 | 57 / -0.161 / 0.78 | 65 / -0.036 / 0.95 |

By weekend (n / net R / PF)

| bucket | base60 | short60 | minrr60 | session60 | hz60 | htf60 | mr60 | be60 |
|---|---|---|---|---|---|---|---|---|
| weekday | 348 / 0.306 / 1.49 | 272 / 0.362 / 1.6 | 319 / 0.406 / 1.58 | 341 / 0.315 / 1.51 | 334 / 0.287 / 1.46 | 281 / 0.219 / 1.38 | 361 / 0.266 / 1.42 | 372 / 0.032 / 1.05 |
| weekend | 136 / 0.144 / 1.22 | 114 / 0.277 / 1.44 | 122 / 0.072 / 1.09 | 136 / 0.192 / 1.29 | 127 / 0.17 / 1.27 | 118 / 0.024 / 1.03 | 136 / 0.047 / 1.07 | 147 / -0.259 / 0.64 |

By month (n / net R / PF)

| bucket | base60 | short60 | minrr60 | session60 | hz60 | htf60 | mr60 | be60 |
|---|---|---|---|---|---|---|---|---|
| 2026-08 | 143 / 0.402 / 1.85 | 117 / 0.483 / 2.06 | 121 / 0.475 / 1.73 | 144 / 0.408 / 1.83 | 135 / 0.381 / 1.76 | 124 / 0.149 / 1.28 | 146 / 0.243 / 1.46 | 155 / -0.085 / 0.84 |
| 2026-09 | 250 / 0.23 / 1.34 | 207 / 0.369 / 1.57 | 238 / 0.303 / 1.42 | 244 / 0.269 / 1.41 | 237 / 0.27 / 1.42 | 200 / 0.226 / 1.36 | 260 / 0.22 / 1.33 | 274 / 0.009 / 1.01 |
| 2026-10 | 91 / 0.119 / 1.15 | 62 / -0.046 / 0.94 | 82 / 0.107 / 1.13 | 89 / 0.103 / 1.13 | 89 / 0.024 / 1.03 | 75 / 0.008 / 1.01 | 91 / 0.105 / 1.14 | 90 / -0.172 / 0.78 |

By exit reason (n / net R / PF)

| bucket | base60 | short60 | minrr60 | session60 | hz60 | htf60 | mr60 | be60 |
|---|---|---|---|---|---|---|---|---|
| horizon | 69 / 0.66 / 4.81 | 52 / 0.673 / 4.63 | 38 / 1.58 / 50.21 | 68 / 0.656 / 4.68 | 51 / 0.714 / 7.05 | 63 / 0.579 / 5.08 | 69 / 0.634 / 4.52 | 32 / 1.07 / 7.24 |
| stop_after_tp | 44 / 1.548 / None | 39 / 1.582 / None | 51 / 1.89 / None | 43 / 1.588 / None | 56 / 1.549 / None | 38 / 1.568 / None | 44 / 1.498 / None | 106 / -0.109 / 0 |
| stop_before_tp | 261 / -1.128 / 0 | 201 / -1.131 / 0 | 281 / -1.132 / 0 | 256 / -1.129 / 0 | 251 / -1.126 / 0 | 212 / -1.118 / 0 | 276 / -1.128 / 0 | 289 / -1.127 / 0 |
| tp3 | 110 / 2.787 / None | 94 / 2.772 / None | 71 / 4.225 / None | 110 / 2.815 / None | 103 / 2.689 / None | 86 / 2.387 / None | 108 / 2.814 / None | 92 / 3.009 / None |

By dominant TF (n / net R / PF)

| bucket | base60 | short60 | minrr60 | session60 | hz60 | htf60 | mr60 | be60 |
|---|---|---|---|---|---|---|---|---|
| 15m | 171 / 0.249 / 1.39 | 124 / 0.47 / 1.8 | 144 / 0.175 / 1.23 | 170 / 0.269 / 1.43 | 167 / 0.155 / 1.26 | 129 / 0.073 / 1.11 | 179 / 0.22 / 1.34 | 183 / -0.012 / 0.98 |
| 1d | 163 / 0.254 / 1.38 | 150 / 0.351 / 1.55 | 151 / 0.408 / 1.58 | 161 / 0.276 / 1.42 | 150 / 0.296 / 1.43 | 134 / 0.231 / 1.37 | 168 / 0.044 / 1.06 | 170 / -0.098 / 0.85 |
| 1h | 9 / 0.465 / 1.92 | 8 / 0.343 / 1.57 | 11 / 0.097 / 1.15 | 8 / 0.66 / 2.53 | 8 / 1.022 / 4.63 | 4 / -0.25 / 0.71 | 13 / 1.286 / 3.99 | 10 / -0.046 / 0.91 |
| 4h | 141 / 0.267 / 1.44 | 104 / 0.157 / 1.25 | 135 / 0.375 / 1.52 | 138 / 0.276 / 1.45 | 136 / 0.288 / 1.46 | 132 / 0.189 / 1.33 | 137 / 0.284 / 1.47 | 156 / -0.045 / 0.93 |

By mode (n / net R / PF)

| bucket | base60 | short60 | minrr60 | session60 | hz60 | htf60 | mr60 | be60 |
|---|---|---|---|---|---|---|---|---|
| reversion | 249 / 0.271 / 1.42 | 150 / 0.483 / 1.79 | 225 / 0.255 / 1.34 | 243 / 0.272 / 1.41 | 237 / 0.281 / 1.45 | 200 / 0.047 / 1.07 | 251 / 0.259 / 1.4 | 268 / 0.041 / 1.06 |
| trend | 235 / 0.249 / 1.41 | 236 / 0.244 / 1.4 | 216 / 0.375 / 1.55 | 234 / 0.288 / 1.48 | 224 / 0.228 / 1.37 | 199 / 0.276 / 1.48 | 246 / 0.151 / 1.23 | 251 / -0.148 / 0.77 |

Calibration (stated confidence vs realised TP1; n / TP1 % / Brier naive; BSS per config)

| bin | base60 | short60 | minrr60 | session60 | hz60 | htf60 | mr60 | be60 |
|---|---|---|---|---|---|---|---|---|
| 60-64 | 436 / 44.5 / 0.274 | 346 / 47.1 / 0.269 | 406 / 34.7 / 0.296 | 428 / 44.6 / 0.274 | 408 / 43.6 / 0.276 | 372 / 45.2 / 0.273 | 388 / 40.5 / 0.282 | 473 / 42.5 / 0.279 |
| 65-69 | 30 / 36.7 / 0.316 | 29 / 37.9 / 0.312 | 28 / 42.9 / 0.299 | 30 / 36.7 / 0.319 | 32 / 34.4 / 0.323 | 12 / 33.3 / 0.328 | 85 / 48.2 / 0.280 | 28 / 39.3 / 0.307 |
| 70-74 | - | - | - | - | - | 1 / 100 / 0.090 | 5 / 80 / 0.172 | - |
| BSS | BSS -0.123 (naive 0.277, base 0.246) | BSS -0.096 (naive 0.273, base 0.249) | BSS -0.298 (naive 0.296, base 0.228) | BSS -0.124 (naive 0.277, base 0.247) | BSS -0.138 (naive 0.279, base 0.245) | BSS -0.107 (naive 0.274, base 0.247) | BSS -0.151 (naive 0.281, base 0.244) | BSS -0.147 (naive 0.280, base 0.244) |

Deflated Sharpe (N=36 trials assumed, the size of the original sweep)

- base60: SR 0.128 (T=484, skew 1.752, kurt 6.595), SR0 0.172, PSR(0) 0.999, PSR(SR0) 0.14, MinTRL vs 0 at 95% 133 trades
- short60: SR 0.164 (T=386, skew 1.682, kurt 6.548), SR0 0.172, PSR(0) 1, PSR(SR0) 0.429, MinTRL vs 0 at 95% 78 trades
- minrr60: SR 0.14 (T=441, skew 1.498, kurt 5.014), SR0 0.172, PSR(0) 0.999, PSR(SR0) 0.228, MinTRL vs 0 at 95% 113 trades
- session60: SR 0.137 (T=477, skew 1.72, kurt 6.421), SR0 0.172, PSR(0) 1, PSR(SR0) 0.195, MinTRL vs 0 at 95% 115 trades
- hz60: SR 0.127 (T=461, skew 1.704, kurt 5.861), SR0 0.172, PSR(0) 0.999, PSR(SR0) 0.141, MinTRL vs 0 at 95% 136 trades
- htf60: SR 0.089 (T=399, skew 1.604, kurt 5.533), SR0 0.172, PSR(0) 0.972, PSR(SR0) 0.038, MinTRL vs 0 at 95% 297 trades
- mr60: SR 0.101 (T=497, skew 1.857, kurt 6.927), SR0 0.172, PSR(0) 0.993, PSR(SR0) 0.041, MinTRL vs 0 at 95% 221 trades
- be60: SR -0.027 (T=519, skew 2.528, kurt 10.449), SR0 0.172, PSR(0) 0.276, PSR(SR0) 0.0, MinTRL vs 0 at 95% None trades

## Single changes, 120d window

| config | signals | unfilled | closed | TP1 % | gross R | net R | PF | sum net R | SR/trade | t | PSR(SR0) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| base120 | 1169 | 238 | 929 | 39.4 | 0.214 | 0.095 | 1.15 | 88.65 | 0.051 | 1.551 | 0.000 |
| short120 | 906 | 186 | 720 | 40.7 | 0.253 | 0.134 | 1.21 | 96.39 | 0.07 | 1.884 | 0.002 |
| minrr120 | 1166 | 314 | 850 | 31.8 | 0.291 | 0.153 | 1.2 | 130.45 | 0.072 | 2.098 | 0.001 |
| session120 | 1149 | 238 | 909 | 39.5 | 0.23 | 0.112 | 1.17 | 102.23 | 0.059 | 1.791 | 0.000 |
| hz120 | 1119 | 230 | 887 | 39 | 0.27 | 0.155 | 1.24 | 137.14 | 0.082 | 2.436 | 0.002 |
| htf120 | 980 | 198 | 780 | 40.9 | 0.238 | 0.119 | 1.19 | 92.54 | 0.065 | 1.821 | 0.001 |
| mr120 | 1199 | 253 | 944 | 39.3 | 0.208 | 0.089 | 1.14 | 84.4 | 0.047 | 1.456 | 0.000 |
| be120 | 1263 | 262 | 999 | 38 | -0.042 | -0.161 | 0.76 | -160.9 | -0.094 | -2.959 | 0.000 |

By regime (n / net R / PF)

| bucket | base120 | short120 | minrr120 | session120 | hz120 | htf120 | mr120 | be120 |
|---|---|---|---|---|---|---|---|---|
| Bear regime | 114 / -0.014 / 0.98 | 126 / -0.13 / 0.8 | 97 / 0.101 / 1.13 | 110 / -0.037 / 0.94 | 110 / 0.014 / 1.02 | 86 / 0.15 / 1.27 | 117 / 0.114 / 1.2 | 126 / -0.219 / 0.64 |
| Bull regime | 256 / 0.236 / 1.37 | 255 / 0.241 / 1.38 | 242 / 0.315 / 1.45 | 256 / 0.256 / 1.41 | 250 / 0.233 / 1.37 | 228 / 0.171 / 1.28 | 268 / 0.154 / 1.24 | 276 / -0.189 / 0.72 |
| Mixed | 302 / 0.081 / 1.12 | 201 / 0.076 / 1.11 | 278 / 0.162 / 1.21 | 290 / 0.121 / 1.18 | 284 / 0.149 / 1.23 | 261 / 0.22 / 1.35 | 302 / 0.081 / 1.12 | 318 / -0.126 / 0.82 |
| Transition | 257 / 0.021 / 1.03 | 138 / 0.26 / 1.41 | 233 / -0.002 / 1 | 253 / 0.022 / 1.03 | 243 / 0.144 / 1.22 | 205 / -0.082 / 0.89 | 257 / 0.021 / 1.03 | 279 / -0.147 / 0.79 |

By bias (n / net R / PF)

| bucket | base120 | short120 | minrr120 | session120 | hz120 | htf120 | mr120 | be120 |
|---|---|---|---|---|---|---|---|---|
| LONG | 589 / 0.199 / 1.3 | 594 / 0.19 / 1.29 | 561 / 0.248 / 1.34 | 580 / 0.226 / 1.35 | 553 / 0.253 / 1.4 | 473 / 0.163 / 1.26 | 602 / 0.161 / 1.24 | 633 / -0.12 / 0.82 |
| SHORT | 340 / -0.083 / 0.87 | 126 / -0.13 / 0.8 | 289 / -0.03 / 0.96 | 329 / -0.089 / 0.87 | 334 / -0.007 / 0.99 | 307 / 0.05 / 1.08 | 342 / -0.036 / 0.94 | 366 / -0.232 / 0.66 |

By hour block (UTC) (n / net R / PF)

| bucket | base120 | short120 | minrr120 | session120 | hz120 | htf120 | mr120 | be120 |
|---|---|---|---|---|---|---|---|---|
| 00-08 | 252 / 0.09 / 1.13 | 203 / 0.059 / 1.08 | 260 / 0.18 / 1.23 | 277 / 0.067 / 1.09 | 255 / 0.179 / 1.26 | 207 / 0.145 / 1.22 | 267 / 0.145 / 1.21 | 281 / -0.224 / 0.69 |
| 08-13 | 190 / 0.231 / 1.37 | 144 / 0.275 / 1.45 | 165 / 0.39 / 1.55 | 187 / 0.259 / 1.42 | 186 / 0.328 / 1.53 | 148 / 0.234 / 1.42 | 192 / 0.201 / 1.32 | 203 / -0.036 / 0.94 |
| 13-17 | 210 / 0.141 / 1.23 | 160 / 0.191 / 1.32 | 177 / 0.1 / 1.13 | 211 / 0.184 / 1.31 | 197 / 0.174 / 1.3 | 192 / 0.149 / 1.24 | 213 / 0.191 / 1.32 | 221 / -0.037 / 0.94 |
| 17-21 | 164 / 0.063 / 1.1 | 130 / 0.1 / 1.15 | 160 / 0.14 / 1.19 | 165 / 0.068 / 1.11 | 156 / 0.022 / 1.03 | 140 / 0.206 / 1.34 | 162 / -0.021 / 0.97 | 175 / -0.235 / 0.65 |
| 21-24 | 113 / -0.159 / 0.78 | 83 / 0.013 / 1.02 | 88 / -0.235 / 0.72 | 69 / -0.215 / 0.7 | 93 / -0.078 / 0.88 | 93 / -0.319 / 0.57 | 110 / -0.276 / 0.63 | 119 / -0.347 / 0.54 |

By weekend (n / net R / PF)

| bucket | base120 | short120 | minrr120 | session120 | hz120 | htf120 | mr120 | be120 |
|---|---|---|---|---|---|---|---|---|
| weekday | 683 / 0.16 / 1.25 | 519 / 0.176 / 1.27 | 630 / 0.23 / 1.31 | 668 / 0.166 / 1.26 | 667 / 0.16 / 1.25 | 560 / 0.197 / 1.32 | 699 / 0.159 / 1.25 | 737 / -0.09 / 0.86 |
| weekend | 246 / -0.084 / 0.88 | 201 / 0.025 / 1.04 | 220 / -0.066 / 0.92 | 241 / -0.036 / 0.95 | 220 / 0.138 / 1.22 | 220 / -0.08 / 0.89 | 245 / -0.11 / 0.85 | 262 / -0.362 / 0.51 |

By month (n / net R / PF)

| bucket | base120 | short120 | minrr120 | session120 | hz120 | htf120 | mr120 | be120 |
|---|---|---|---|---|---|---|---|---|
| 2026-06 | 126 / 0.189 / 1.3 | 93 / 0.104 / 1.16 | 115 / 0.271 / 1.35 | 120 / 0.163 / 1.26 | 126 / 0.278 / 1.49 | 107 / 0.303 / 1.48 | 125 / 0.327 / 1.56 | 139 / -0.009 / 0.99 |
| 2026-07 | 230 / -0.122 / 0.82 | 172 / -0.124 / 0.83 | 215 / -0.024 / 0.97 | 224 / -0.086 / 0.88 | 220 / -0.01 / 0.99 | 192 / 0.029 / 1.04 | 233 / -0.111 / 0.84 | 247 / -0.31 / 0.57 |
| 2026-08 | 232 / 0.106 / 1.19 | 186 / 0.186 / 1.34 | 200 / 0.118 / 1.16 | 232 / 0.117 / 1.2 | 215 / 0.177 / 1.31 | 206 / 0.042 / 1.07 | 235 / 0.011 / 1.02 | 249 / -0.281 / 0.54 |
| 2026-09 | 250 / 0.23 / 1.34 | 207 / 0.369 / 1.57 | 238 / 0.303 / 1.42 | 244 / 0.269 / 1.41 | 237 / 0.27 / 1.42 | 200 / 0.226 / 1.36 | 260 / 0.22 / 1.33 | 274 / 0.009 / 1.01 |
| 2026-10 | 91 / 0.119 / 1.15 | 62 / -0.046 / 0.94 | 82 / 0.107 / 1.13 | 89 / 0.103 / 1.13 | 89 / 0.024 / 1.03 | 75 / 0.008 / 1.01 | 91 / 0.105 / 1.14 | 90 / -0.172 / 0.78 |

By exit reason (n / net R / PF)

| bucket | base120 | short120 | minrr120 | session120 | hz120 | htf120 | mr120 | be120 |
|---|---|---|---|---|---|---|---|---|
| horizon | 153 / 0.396 / 2.91 | 112 / 0.434 / 3.03 | 77 / 1.22 / 21.66 | 151 / 0.391 / 2.84 | 119 / 0.533 / 4.45 | 133 / 0.369 / 2.91 | 154 / 0.416 / 3.11 | 83 / 0.627 / 4.2 |
| stop_after_tp | 81 / 1.421 / None | 70 / 1.457 / None | 90 / 1.837 / None | 80 / 1.464 / None | 106 / 1.396 / None | 73 / 1.54 / None | 84 / 1.369 / None | 190 / -0.111 / 0 |
| stop_before_tp | 511 / -1.132 / 0 | 393 / -1.133 / 0 | 562 / -1.139 / 0 | 497 / -1.132 / 0 | 481 / -1.13 / 0 | 417 / -1.13 / 0 | 522 / -1.133 / 0 | 566 / -1.132 / 0 |
| tp3 | 184 / 2.671 / None | 145 / 2.698 / None | 121 / 4.224 / None | 181 / 2.701 / None | 181 / 2.591 / None | 157 / 2.563 / None | 184 / 2.7 / None | 160 / 2.804 / None |

By dominant TF (n / net R / PF)

| bucket | base120 | short120 | minrr120 | session120 | hz120 | htf120 | mr120 | be120 |
|---|---|---|---|---|---|---|---|---|
| 15m | 342 / 0.043 / 1.06 | 260 / 0.094 / 1.14 | 284 / -0.031 / 0.96 | 339 / 0.068 / 1.1 | 331 / -0.026 / 0.96 | 276 / -0.009 / 0.99 | 357 / 0.07 / 1.1 | 359 / -0.179 / 0.74 |
| 1d | 255 / 0.057 / 1.08 | 225 / 0.117 / 1.17 | 250 / 0.117 / 1.15 | 249 / 0.086 / 1.12 | 235 / 0.173 / 1.24 | 212 / 0.2 / 1.31 | 262 / -0.069 / 0.9 | 282 / -0.224 / 0.68 |
| 1h | 16 / 0.47 / 1.95 | 13 / 0.517 / 1.82 | 19 / 0.456 / 1.75 | 15 / 0.575 / 2.27 | 12 / 0.936 / 3.53 | 9 / 0.343 / 1.54 | 20 / 0.947 / 3.11 | 17 / 0.013 / 1.02 |
| 4h | 316 / 0.164 / 1.26 | 222 / 0.175 / 1.28 | 297 / 0.341 / 1.47 | 306 / 0.16 / 1.26 | 309 / 0.304 / 1.51 | 283 / 0.175 / 1.3 | 305 / 0.192 / 1.32 | 341 / -0.098 / 0.85 |

By mode (n / net R / PF)

| bucket | base120 | short120 | minrr120 | session120 | hz120 | htf120 | mr120 | be120 |
|---|---|---|---|---|---|---|---|---|
| reversion | 599 / 0.041 / 1.06 | 387 / 0.11 / 1.16 | 547 / 0.097 / 1.12 | 583 / 0.055 / 1.08 | 566 / 0.146 / 1.23 | 505 / 0.07 / 1.1 | 594 / 0.043 / 1.06 | 644 / -0.155 / 0.78 |
| trend | 330 / 0.195 / 1.32 | 333 / 0.162 / 1.26 | 303 / 0.256 / 1.36 | 326 / 0.216 / 1.36 | 321 / 0.17 / 1.28 | 275 / 0.209 / 1.36 | 350 / 0.168 / 1.27 | 355 / -0.171 / 0.73 |

Calibration (stated confidence vs realised TP1; n / TP1 % / Brier naive; BSS per config)

| bin | base120 | short120 | minrr120 | session120 | hz120 | htf120 | mr120 | be120 |
|---|---|---|---|---|---|---|---|---|
| 60-64 | 832 / 42.2 / 0.279 | 644 / 42.9 / 0.278 | 786 / 32.3 / 0.301 | 812 / 42.5 / 0.279 | 779 / 42.1 / 0.279 | 714 / 43.7 / 0.276 | 764 / 39.9 / 0.284 | 902 / 40.2 / 0.284 |
| 65-69 | 45 / 33.3 / 0.327 | 42 / 40.5 / 0.305 | 46 / 34.8 / 0.323 | 44 / 31.8 / 0.333 | 48 / 37.5 / 0.313 | 21 / 28.6 / 0.343 | 121 / 50.4 / 0.274 | 44 / 38.6 / 0.308 |
| 70-74 | - | - | - | - | - | 1 / 100 / 0.090 | 8 / 62.5 / 0.241 | - |
| BSS | BSS -0.159 (naive 0.282, base 0.243) | BSS -0.144 (naive 0.280, base 0.245) | BSS -0.379 (naive 0.302, base 0.219) | BSS -0.156 (naive 0.282, base 0.244) | BSS -0.155 (naive 0.281, base 0.243) | BSS -0.129 (naive 0.277, base 0.246) | BSS -0.162 (naive 0.282, base 0.243) | BSS -0.185 (naive 0.285, base 0.240) |

Deflated Sharpe (N=36 trials assumed, the size of the original sweep)

- base120: SR 0.051 (T=929, skew 1.901, kurt 7.177), SR0 0.172, PSR(0) 0.949, PSR(SR0) 0.0, MinTRL vs 0 at 95% 945 trades
- short120: SR 0.07 (T=720, skew 1.877, kurt 7.26), SR0 0.172, PSR(0) 0.978, PSR(SR0) 0.002, MinTRL vs 0 at 95% 485 trades
- minrr120: SR 0.072 (T=850, skew 1.653, kurt 5.411), SR0 0.172, PSR(0) 0.987, PSR(SR0) 0.001, MinTRL vs 0 at 95% 464 trades
- session120: SR 0.059 (T=909, skew 1.88, kurt 7.048), SR0 0.172, PSR(0) 0.97, PSR(SR0) 0.0, MinTRL vs 0 at 95% 697 trades
- hz120: SR 0.082 (T=887, skew 1.774, kurt 6.201), SR0 0.172, PSR(0) 0.996, PSR(SR0) 0.002, MinTRL vs 0 at 95% 349 trades
- htf120: SR 0.065 (T=780, skew 1.64, kurt 5.378), SR0 0.172, PSR(0) 0.972, PSR(SR0) 0.001, MinTRL vs 0 at 95% 577 trades
- mr120: SR 0.047 (T=944, skew 1.933, kurt 7.248), SR0 0.172, PSR(0) 0.935, PSR(SR0) 0.0, MinTRL vs 0 at 95% 1119 trades
- be120: SR -0.094 (T=999, skew 2.634, kurt 11.207), SR0 0.172, PSR(0) 0.004, PSR(SR0) 0.0, MinTRL vs 0 at 95% None trades

## Combinations and the shipped confirmation, 60d

| config | signals | unfilled | closed | TP1 % | gross R | net R | PF | sum net R | SR/trade | t | PSR(SR0) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| base60 | 622 | 136 | 484 | 42.4 | 0.375 | 0.26 | 1.41 | 125.91 | 0.128 | 2.819 | 0.140 |
| short60 | 497 | 111 | 386 | 45.1 | 0.451 | 0.337 | 1.55 | 130.01 | 0.164 | 3.215 | 0.429 |
| session60 | 616 | 137 | 477 | 42.3 | 0.395 | 0.28 | 1.44 | 133.58 | 0.137 | 2.986 | 0.195 |
| comboA60 | 494 | 146 | 348 | 37.9 | 0.565 | 0.437 | 1.63 | 152.07 | 0.192 | 3.586 | 0.664 |
| comboB60 | 498 | 149 | 349 | 36.1 | 0.551 | 0.422 | 1.6 | 147.29 | 0.184 | 3.437 | 0.600 |
| final60 | 493 | 112 | 381 | 45.1 | 0.477 | 0.362 | 1.59 | 137.85 | 0.174 | 3.401 | 0.518 |

By regime (n / net R / PF)

| bucket | base60 | short60 | session60 | comboA60 | comboB60 | final60 |
|---|---|---|---|---|---|---|
| Bear regime | 10 / -0.168 / 0.64 | 12 / -0.314 / 0.45 | 10 / -0.149 / 0.67 | 8 / -0.23 / 0.7 | 7 / -0.213 / 0.75 | 12 / -0.298 / 0.46 |
| Bull regime | 241 / 0.235 / 1.37 | 240 / 0.241 / 1.38 | 241 / 0.257 / 1.41 | 223 / 0.369 / 1.53 | 224 / 0.338 / 1.48 | 240 / 0.263 / 1.42 |
| Mixed | 112 / 0.429 / 1.66 | 70 / 0.517 / 1.79 | 110 / 0.47 / 1.73 | 64 / 0.656 / 1.93 | 63 / 0.636 / 1.94 | 68 / 0.587 / 1.92 |
| Transition | 121 / 0.191 / 1.31 | 64 / 0.623 / 2.25 | 116 / 0.185 / 1.29 | 53 / 0.559 / 1.87 | 55 / 0.601 / 1.92 | 61 / 0.631 / 2.21 |

By bias (n / net R / PF)

| bucket | base60 | short60 | session60 | comboA60 | comboB60 | final60 |
|---|---|---|---|---|---|---|
| LONG | 373 / 0.375 / 1.61 | 374 / 0.358 / 1.58 | 368 / 0.401 / 1.66 | 340 / 0.453 / 1.66 | 342 / 0.435 / 1.63 | 369 / 0.383 / 1.62 |
| SHORT | 111 / -0.127 / 0.82 | 12 / -0.314 / 0.45 | 109 / -0.129 / 0.82 | 8 / -0.23 / 0.7 | 7 / -0.213 / 0.75 | 12 / -0.298 / 0.46 |

By hour block (UTC) (n / net R / PF)

| bucket | base60 | short60 | session60 | comboA60 | comboB60 | final60 |
|---|---|---|---|---|---|---|
| 00-08 | 141 / 0.437 / 1.68 | 116 / 0.369 / 1.55 | 155 / 0.384 / 1.59 | 123 / 0.369 / 1.5 | 132 / 0.342 / 1.47 | 130 / 0.314 / 1.46 |
| 08-13 | 102 / 0.177 / 1.27 | 79 / 0.343 / 1.55 | 100 / 0.216 / 1.34 | 69 / 0.597 / 1.91 | 69 / 0.659 / 1.99 | 77 / 0.398 / 1.66 |
| 13-17 | 102 / 0.356 / 1.63 | 80 / 0.545 / 2.07 | 103 / 0.441 / 1.8 | 67 / 0.676 / 2.12 | 61 / 0.459 / 1.74 | 81 / 0.651 / 2.33 |
| 17-21 | 80 / 0.067 / 1.1 | 65 / 0.075 / 1.11 | 82 / 0.063 / 1.1 | 69 / 0.174 / 1.24 | 68 / 0.165 / 1.23 | 67 / 0.07 / 1.11 |
| 21-24 | 59 / 0.078 / 1.12 | 46 / 0.252 / 1.44 | 37 / 0.047 / 1.07 | 20 / 0.41 / 1.54 | 19 / 0.916 / 2.26 | 26 / 0.343 / 1.61 |

By weekend (n / net R / PF)

| bucket | base60 | short60 | session60 | comboA60 | comboB60 | final60 |
|---|---|---|---|---|---|---|
| weekday | 348 / 0.306 / 1.49 | 272 / 0.362 / 1.6 | 341 / 0.315 / 1.51 | 242 / 0.493 / 1.73 | 244 / 0.419 / 1.6 | 266 / 0.37 / 1.61 |
| weekend | 136 / 0.144 / 1.22 | 114 / 0.277 / 1.44 | 136 / 0.192 / 1.29 | 106 / 0.31 / 1.43 | 105 / 0.43 / 1.63 | 115 / 0.343 / 1.56 |

By month (n / net R / PF)

| bucket | base60 | short60 | session60 | comboA60 | comboB60 | final60 |
|---|---|---|---|---|---|---|
| 2026-08 | 143 / 0.402 / 1.85 | 117 / 0.483 / 2.06 | 144 / 0.408 / 1.83 | 101 / 0.57 / 1.92 | 98 / 0.559 / 1.86 | 119 / 0.496 / 2.05 |
| 2026-09 | 250 / 0.23 / 1.34 | 207 / 0.369 / 1.57 | 244 / 0.269 / 1.41 | 193 / 0.5 / 1.73 | 198 / 0.49 / 1.72 | 202 / 0.412 / 1.65 |
| 2026-10 | 91 / 0.119 / 1.15 | 62 / -0.046 / 0.94 | 89 / 0.103 / 1.13 | 54 / -0.039 / 0.95 | 53 / -0.087 / 0.9 | 60 / -0.074 / 0.91 |

By exit reason (n / net R / PF)

| bucket | base60 | short60 | session60 | comboA60 | comboB60 | final60 |
|---|---|---|---|---|---|---|
| horizon | 69 / 0.66 / 4.81 | 52 / 0.673 / 4.63 | 68 / 0.656 / 4.68 | 30 / 1.557 / 35.73 | 26 / 1.462 / 41.55 | 51 / 0.669 / 4.47 |
| stop_after_tp | 44 / 1.548 / None | 39 / 1.582 / None | 43 / 1.588 / None | 47 / 1.925 / None | 52 / 2.043 / None | 38 / 1.628 / None |
| stop_before_tp | 261 / -1.128 / 0 | 201 / -1.131 / 0 | 256 / -1.129 / 0 | 211 / -1.132 / 0 | 214 / -1.133 / 0 | 197 / -1.132 / 0 |
| tp3 | 110 / 2.787 / None | 94 / 2.772 / None | 110 / 2.815 / None | 60 / 4.228 / None | 57 / 4.309 / None | 95 / 2.789 / None |

By dominant TF (n / net R / PF)

| bucket | base60 | short60 | session60 | comboA60 | comboB60 | final60 |
|---|---|---|---|---|---|---|
| 15m | 171 / 0.249 / 1.39 | 124 / 0.47 / 1.8 | 170 / 0.269 / 1.43 | 106 / 0.422 / 1.61 | 113 / 0.298 / 1.44 | 125 / 0.492 / 1.85 |
| 1d | 163 / 0.254 / 1.38 | 150 / 0.351 / 1.55 | 161 / 0.276 / 1.42 | 137 / 0.522 / 1.78 | 132 / 0.529 / 1.75 | 148 / 0.377 / 1.6 |
| 1h | 9 / 0.465 / 1.92 | 8 / 0.343 / 1.57 | 8 / 0.66 / 2.53 | 9 / 0.164 / 1.24 | 8 / 0.428 / 1.7 | 7 / 0.549 / 2.04 |
| 4h | 141 / 0.267 / 1.44 | 104 / 0.157 / 1.25 | 138 / 0.276 / 1.45 | 96 / 0.357 / 1.5 | 96 / 0.42 / 1.58 | 101 / 0.165 / 1.26 |

By mode (n / net R / PF)

| bucket | base60 | short60 | session60 | comboA60 | comboB60 | final60 |
|---|---|---|---|---|---|---|
| reversion | 249 / 0.271 / 1.42 | 150 / 0.483 / 1.79 | 243 / 0.272 / 1.41 | 134 / 0.482 / 1.68 | 138 / 0.463 / 1.65 | 146 / 0.489 / 1.78 |
| trend | 235 / 0.249 / 1.41 | 236 / 0.244 / 1.4 | 234 / 0.288 / 1.48 | 214 / 0.409 / 1.6 | 211 / 0.395 / 1.57 | 235 / 0.283 / 1.47 |

Calibration (stated confidence vs realised TP1; n / TP1 % / Brier naive; BSS per config)

| bin | base60 | short60 | session60 | comboA60 | comboB60 | final60 |
|---|---|---|---|---|---|---|
| 60-64 | 436 / 44.5 / 0.274 | 346 / 47.1 / 0.269 | 428 / 44.6 / 0.274 | 313 / 38 / 0.289 | 310 / 36.8 / 0.292 | 340 / 47.4 / 0.269 |
| 65-69 | 30 / 36.7 / 0.316 | 29 / 37.9 / 0.312 | 30 / 36.7 / 0.319 | 30 / 43.3 / 0.298 | 30 / 40 / 0.310 | 29 / 37.9 / 0.315 |
| BSS | BSS -0.123 (naive 0.277, base 0.246) | BSS -0.096 (naive 0.273, base 0.249) | BSS -0.124 (naive 0.277, base 0.247) | BSS -0.226 (naive 0.290, base 0.237) | BSS -0.259 (naive 0.294, base 0.233) | BSS -0.095 (naive 0.273, base 0.249) |

Deflated Sharpe (N=36 trials assumed, the size of the original sweep)

- base60: SR 0.128 (T=484, skew 1.752, kurt 6.595), SR0 0.172, PSR(0) 0.999, PSR(SR0) 0.14, MinTRL vs 0 at 95% 133 trades
- short60: SR 0.164 (T=386, skew 1.682, kurt 6.548), SR0 0.172, PSR(0) 1, PSR(SR0) 0.429, MinTRL vs 0 at 95% 78 trades
- session60: SR 0.137 (T=477, skew 1.72, kurt 6.421), SR0 0.172, PSR(0) 1, PSR(SR0) 0.195, MinTRL vs 0 at 95% 115 trades
- comboA60: SR 0.192 (T=348, skew 1.386, kurt 4.851), SR0 0.172, PSR(0) 1, PSR(SR0) 0.664, MinTRL vs 0 at 95% 58 trades
- comboB60: SR 0.184 (T=349, skew 1.347, kurt 4.091), SR0 0.172, PSR(0) 1, PSR(SR0) 0.6, MinTRL vs 0 at 95% 64 trades
- final60: SR 0.174 (T=381, skew 1.644, kurt 6.356), SR0 0.172, PSR(0) 1, PSR(SR0) 0.518, MinTRL vs 0 at 95% 69 trades

## Combinations and the shipped confirmation, 120d

| config | signals | unfilled | closed | TP1 % | gross R | net R | PF | sum net R | SR/trade | t | PSR(SR0) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| base120 | 1169 | 238 | 929 | 39.4 | 0.214 | 0.095 | 1.15 | 88.65 | 0.051 | 1.551 | 0.000 |
| short120 | 906 | 186 | 720 | 40.7 | 0.253 | 0.134 | 1.21 | 96.39 | 0.07 | 1.884 | 0.002 |
| session120 | 1149 | 238 | 909 | 39.5 | 0.23 | 0.112 | 1.17 | 102.23 | 0.059 | 1.791 | 0.000 |
| comboA120 | 913 | 246 | 667 | 33.4 | 0.366 | 0.229 | 1.31 | 152.44 | 0.105 | 2.716 | 0.030 |
| comboB120 | 918 | 247 | 671 | 31.7 | 0.385 | 0.247 | 1.33 | 165.47 | 0.111 | 2.884 | 0.043 |
| final120 | 893 | 186 | 707 | 40.7 | 0.269 | 0.15 | 1.23 | 106.33 | 0.078 | 2.078 | 0.004 |

By regime (n / net R / PF)

| bucket | base120 | short120 | session120 | comboA120 | comboB120 | final120 |
|---|---|---|---|---|---|---|
| Bear regime | 114 / -0.014 / 0.98 | 126 / -0.13 / 0.8 | 110 / -0.037 / 0.94 | 112 / 0.066 / 1.08 | 116 / 0.154 / 1.2 | 121 / -0.159 / 0.75 |
| Bull regime | 256 / 0.236 / 1.37 | 255 / 0.241 / 1.38 | 256 / 0.256 / 1.41 | 240 / 0.335 / 1.48 | 242 / 0.322 / 1.45 | 255 / 0.262 / 1.42 |
| Mixed | 302 / 0.081 / 1.12 | 201 / 0.076 / 1.11 | 290 / 0.121 / 1.18 | 187 / 0.216 / 1.29 | 183 / 0.153 / 1.2 | 194 / 0.122 / 1.17 |
| Transition | 257 / 0.021 / 1.03 | 138 / 0.26 / 1.41 | 253 / 0.022 / 1.03 | 128 / 0.189 / 1.25 | 130 / 0.32 / 1.43 | 137 / 0.257 / 1.39 |

By bias (n / net R / PF)

| bucket | base120 | short120 | session120 | comboA120 | comboB120 | final120 |
|---|---|---|---|---|---|---|
| LONG | 589 / 0.199 / 1.3 | 594 / 0.19 / 1.29 | 580 / 0.226 / 1.35 | 555 / 0.261 / 1.36 | 555 / 0.266 / 1.36 | 586 / 0.214 / 1.33 |
| SHORT | 340 / -0.083 / 0.87 | 126 / -0.13 / 0.8 | 329 / -0.089 / 0.87 | 112 / 0.066 / 1.08 | 116 / 0.154 / 1.2 | 121 / -0.159 / 0.75 |

By hour block (UTC) (n / net R / PF)

| bucket | base120 | short120 | session120 | comboA120 | comboB120 | final120 |
|---|---|---|---|---|---|---|
| 00-08 | 252 / 0.09 / 1.13 | 203 / 0.059 / 1.08 | 277 / 0.067 / 1.09 | 237 / 0.152 / 1.2 | 250 / 0.15 / 1.19 | 226 / 0.038 / 1.05 |
| 08-13 | 190 / 0.231 / 1.37 | 144 / 0.275 / 1.45 | 187 / 0.259 / 1.42 | 126 / 0.627 / 1.97 | 127 / 0.683 / 2.02 | 141 / 0.313 / 1.53 |
| 13-17 | 210 / 0.141 / 1.23 | 160 / 0.191 / 1.32 | 211 / 0.184 / 1.31 | 135 / 0.18 / 1.24 | 127 / 0.127 / 1.17 | 161 / 0.247 / 1.42 |
| 17-21 | 164 / 0.063 / 1.1 | 130 / 0.1 / 1.15 | 165 / 0.068 / 1.11 | 133 / 0.087 / 1.12 | 132 / 0.097 / 1.13 | 131 / 0.106 / 1.16 |
| 21-24 | 113 / -0.159 / 0.78 | 83 / 0.013 / 1.02 | 69 / -0.215 / 0.7 | 36 / 0.041 / 1.05 | 35 / 0.354 / 1.45 | 48 / -0.002 / 1 |

By weekend (n / net R / PF)

| bucket | base120 | short120 | session120 | comboA120 | comboB120 | final120 |
|---|---|---|---|---|---|---|
| weekday | 683 / 0.16 / 1.25 | 519 / 0.176 / 1.27 | 668 / 0.166 / 1.26 | 487 / 0.273 / 1.37 | 492 / 0.219 / 1.29 | 509 / 0.176 / 1.27 |
| weekend | 246 / -0.084 / 0.88 | 201 / 0.025 / 1.04 | 241 / -0.036 / 0.95 | 180 / 0.107 / 1.14 | 179 / 0.323 / 1.45 | 198 / 0.084 / 1.13 |

By month (n / net R / PF)

| bucket | base120 | short120 | session120 | comboA120 | comboB120 | final120 |
|---|---|---|---|---|---|---|
| 2026-06 | 126 / 0.189 / 1.3 | 93 / 0.104 / 1.16 | 120 / 0.163 / 1.26 | 86 / 0.299 / 1.39 | 87 / 0.424 / 1.55 | 88 / 0.077 / 1.12 |
| 2026-07 | 230 / -0.122 / 0.82 | 172 / -0.124 / 0.83 | 224 / -0.086 / 0.88 | 167 / 0.036 / 1.05 | 167 / 0.069 / 1.09 | 169 / -0.096 / 0.87 |
| 2026-08 | 232 / 0.106 / 1.19 | 186 / 0.186 / 1.34 | 232 / 0.117 / 1.2 | 167 / 0.157 / 1.21 | 166 / 0.148 / 1.2 | 188 / 0.196 / 1.35 |
| 2026-09 | 250 / 0.23 / 1.34 | 207 / 0.369 / 1.57 | 244 / 0.269 / 1.41 | 193 / 0.5 / 1.73 | 198 / 0.49 / 1.72 | 202 / 0.412 / 1.65 |
| 2026-10 | 91 / 0.119 / 1.15 | 62 / -0.046 / 0.94 | 89 / 0.103 / 1.13 | 54 / -0.039 / 0.95 | 53 / -0.087 / 0.9 | 60 / -0.074 / 0.91 |

By exit reason (n / net R / PF)

| bucket | base120 | short120 | session120 | comboA120 | comboB120 | final120 |
|---|---|---|---|---|---|---|
| horizon | 153 / 0.396 / 2.91 | 112 / 0.434 / 3.03 | 151 / 0.391 / 2.84 | 58 / 1.275 / 21.77 | 56 / 1.242 / 21.39 | 110 / 0.429 / 2.94 |
| stop_after_tp | 81 / 1.421 / None | 70 / 1.457 / None | 80 / 1.464 / None | 79 / 1.922 / None | 85 / 2.146 / None | 70 / 1.503 / None |
| stop_before_tp | 511 / -1.132 / 0 | 393 / -1.133 / 0 | 497 / -1.132 / 0 | 431 / -1.138 / 0 | 434 / -1.141 / 0 | 384 / -1.135 / 0 |
| tp3 | 184 / 2.671 / None | 145 / 2.698 / None | 181 / 2.701 / None | 99 / 4.215 / None | 96 / 4.257 / None | 143 / 2.726 / None |

By dominant TF (n / net R / PF)

| bucket | base120 | short120 | session120 | comboA120 | comboB120 | final120 |
|---|---|---|---|---|---|---|
| 15m | 342 / 0.043 / 1.06 | 260 / 0.094 / 1.14 | 339 / 0.068 / 1.1 | 219 / 0.065 / 1.09 | 227 / -0.021 / 0.97 | 259 / 0.128 / 1.2 |
| 1d | 255 / 0.057 / 1.08 | 225 / 0.117 / 1.17 | 249 / 0.086 / 1.12 | 220 / 0.195 / 1.26 | 217 / 0.251 / 1.33 | 220 / 0.139 / 1.21 |
| 1h | 16 / 0.47 / 1.95 | 13 / 0.517 / 1.82 | 15 / 0.575 / 2.27 | 17 / 0.652 / 2.04 | 16 / 0.914 / 2.55 | 12 / 0.651 / 2.1 |
| 4h | 316 / 0.164 / 1.26 | 222 / 0.175 / 1.28 | 306 / 0.16 / 1.26 | 211 / 0.399 / 1.56 | 211 / 0.479 / 1.65 | 216 / 0.162 / 1.25 |

By mode (n / net R / PF)

| bucket | base120 | short120 | session120 | comboA120 | comboB120 | final120 |
|---|---|---|---|---|---|---|
| reversion | 599 / 0.041 / 1.06 | 387 / 0.11 / 1.16 | 583 / 0.055 / 1.08 | 360 / 0.18 / 1.23 | 362 / 0.191 / 1.25 | 379 / 0.123 / 1.18 |
| trend | 330 / 0.195 / 1.32 | 333 / 0.162 / 1.26 | 326 / 0.216 / 1.36 | 307 / 0.286 / 1.4 | 309 / 0.312 / 1.44 | 328 / 0.182 / 1.3 |

Calibration (stated confidence vs realised TP1; n / TP1 % / Brier naive; BSS per config)

| bin | base120 | short120 | session120 | comboA120 | comboB120 | final120 |
|---|---|---|---|---|---|---|
| 60-64 | 832 / 42.2 / 0.279 | 644 / 42.9 / 0.278 | 812 / 42.5 / 0.279 | 607 / 33.8 / 0.298 | 598 / 32.8 / 0.300 | 631 / 43.1 / 0.278 |
| 65-69 | 45 / 33.3 / 0.327 | 42 / 40.5 / 0.305 | 44 / 31.8 / 0.333 | 47 / 38.3 / 0.314 | 49 / 34.7 / 0.326 | 41 / 39 / 0.311 |
| BSS | BSS -0.159 (naive 0.282, base 0.243) | BSS -0.144 (naive 0.280, base 0.245) | BSS -0.156 (naive 0.282, base 0.244) | BSS -0.331 (naive 0.299, base 0.225) | BSS -0.368 (naive 0.302, base 0.221) | BSS -0.142 (naive 0.280, base 0.245) |

Deflated Sharpe (N=36 trials assumed, the size of the original sweep)

- base120: SR 0.051 (T=929, skew 1.901, kurt 7.177), SR0 0.172, PSR(0) 0.949, PSR(SR0) 0.0, MinTRL vs 0 at 95% 945 trades
- short120: SR 0.07 (T=720, skew 1.877, kurt 7.26), SR0 0.172, PSR(0) 0.978, PSR(SR0) 0.002, MinTRL vs 0 at 95% 485 trades
- session120: SR 0.059 (T=909, skew 1.88, kurt 7.048), SR0 0.172, PSR(0) 0.97, PSR(SR0) 0.0, MinTRL vs 0 at 95% 697 trades
- comboA120: SR 0.105 (T=667, skew 1.589, kurt 5.329), SR0 0.172, PSR(0) 0.998, PSR(SR0) 0.03, MinTRL vs 0 at 95% 209 trades
- comboB120: SR 0.111 (T=671, skew 1.532, kurt 4.661), SR0 0.172, PSR(0) 0.999, PSR(SR0) 0.043, MinTRL vs 0 at 95% 186 trades
- final120: SR 0.078 (T=707, skew 1.854, kurt 7.122), SR0 0.172, PSR(0) 0.987, PSR(SR0) 0.004, MinTRL vs 0 at 95% 386 trades

## Other deliverables in this PR

- Call fields (design F1.1) on every engine call: `mode` / `modeReason`, `dominantTf`, `horizonMin`, `expectedHold` (from `data/hold-buckets.json`, written by `final120` with `--write-hold-buckets 1`: 707 samples, 55 keys, plus the live ledger once a bucket has 20 decided records), `invalidation`, `flips`, `stopAnchor`, `blocks` (TREND / TIMING / FLOW first cut), `setup`. Shapes in `CONTRACT.md`.
- Checker (`check/core.ts`): breakeven and horizon are read from the record (`inputs.tuning.breakevenAfterTp1`, `inputs.horizonMin`), so each record follows the rules it was issued under.
- Harness: `--report-buckets` (month, hour, hour block, weekday, weekend, bias, setup, mode, dominant TF, exit reason, each with a t-stat), `--sweep-deflate 1 --trials N [--trial-sd 0.08|scan]`, `--asof`, `--horizon-hours`, `--write-hold-buckets`; `scripts/backtest-stats.ts` holds the Sharpe / PSR / MinTRL maths.

## Not done

- Mode-select (R1.1), squeeze release (R1.3), structural-weight ablation (R1.4), AVWAP location (R1.6), six-block composite (R2.3-2.5), stop anchor by setup type (R4.3), tp-mode (R4.4), walk-forward / CPCV (R5.3-5.4): outside PR 15; the flags above are the ones the plan listed.
- The 21-24 UTC rule in the harness uses the candles-only flow block (volume factor only); live, the flow block also carries derivatives and positioning, so the live gate is somewhat stricter than what was validated.
