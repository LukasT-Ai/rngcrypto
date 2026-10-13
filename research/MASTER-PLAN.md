# Signals optimization: consolidated master plan (2026-10-13)

Consolidates four analyst reports into one ordered build plan. Source reports in this folder:
`audit-signal-engine.md`, `audit-performance-feedback.md`, `research-predictive-features.md`,
`research-strategy-price-action-macro.md`. UX integration spec: `design-ux-ui.md` (Phase 2 section).

Ranking principle: expected gain in call accuracy or net R per engineering hour, with measurement
before structure, structure before new features, and nothing shipped that the backtest harness or
the calibration table cannot score.

## Phase 0: shipped tonight (2026-10-12/13)

| Commit | Change | Effect |
|---|---|---|
| 8b1e71e, fba3543, bcca7ce | Macro taxonomy 36 -> 141 defs, 9-country FXStreet, housing block, options expiries, foreign central banks | Every scheduled catalyst with a published consensus is now on the macro tab |
| 128f44b | Economic Calendar table (last 7d actuals, next 14d consensus) replaces the 24h name-only list | Expected / actual / impact visible per ticker |
| 7a98e24 | Engine 2026.10.13-feeds: OKX arrays newest-first, Strike hourly funding x8, idle macro weights out of the denominator | L/S and OI signs no longer inverted; derivatives and squeeze factors can fire; BTC/GOLD/OIL confidence no longer compressed ~20% |
| 8ec089e | Horizon enforced inside the candle walk; atomic tmp+rename writes; restore endpoint token-gated (HISTORY_RESTORE_TOKEN on Railway) | Live record no longer credits post-horizon touches; ledger cannot be erased by a crash or fabricated |

## Phase 1: measurement (about 15 hours). Nothing else is judgeable without this.

1. **Cost model and next-open fills** (perf #3, 3h). Fees, slippage, funding per venue; market orders fill at the next candle open. Net R becomes the headline, gross shown alongside. Mirror in `scripts/backtest.ts`.
2. **Log inputs at call time** (perf #4, 2h). Weighted score, every component score and weight, raw confidence, rr1-3, entry type, ATR%, funding, minutes to next event, tuning snapshot, regime. All later feedback depends on this.
3. **Calibration table + Brier** (perf #5, engine #5, 3h). Predicted confidence band vs realized TP1 rate with Wilson CIs, Brier, Murphy decomposition, Brier skill score vs base rate. Same table from the backtest.
4. **Shadow-log declined calls** (perf #6, 2h). WAIT leans 55-59, HTF-blocked shorts, regime-blocked calls stored with `shadow: true`, excluded from public stats. Turns every gate into a measurable claim.
5. **Missing track-record metrics** (perf #7, 2h). Max drawdown, R histogram, expiry rate, fill rate by entry type, hold time, rr1 and ATR buckets.
6. **Per-component reliability + `--weights-json`** (perf #8, 3h). Agree/disagree hit rate per factor from logged inputs; backtest accepts a weight override for out-of-sample validation.
7. **Version hash, gap detection, one write per pass, archive instead of truncate** (perf #10, 2h).

## Phase 2: structural strategy fixes (about 20 hours, each one a backtest flag first)

Both the engine audit and the strategy research found the same leak: trend votes and fade votes
cancel in the regime where the edge lives, and trend is counted about five times.

1. **Mean reversion only toward the regime** (strategy #1, 3h) `--mr-with-regime 1`. Largest expected gain, +0.05 to +0.10R.
2. **Breakeven stop after TP1** (strategy #2, 2h) `--breakeven-after-tp1 1`.
3. **Horizon by dominant timeframe** 12/36/96h (strategy #3, 3h) `--horizon-by-tf 1`.
4. **Report buckets + deflated sweep stats** (strategy #4, 4h) `--report-buckets --sweep-deflate 1`. The current best config sits barely above the luck benchmark.
5. **Symmetric HTF gate, drop the HTF vote** (strategy #5, 2h) `--htf-gate-both 1 --htf-vote 0`.
6. **SHORT only in Bear regime or confirmed reversal** (engine #4, 1h). SHORT PF 0.67 overall, -0.41R in Transition.
7. **Minimum reward-to-risk at TP2** (strategy #8, 1h) `--min-rr 1.5`.
8. **Weekend half size, 21-24 UTC gate, non-crypto weekend WAIT** (engine #9, research #12, 1h).
9. **Freeze the macro bonus at 0** until the calibration table can score it (engine, 0.5h).
10. **Collapse to orthogonal blocks** TREND / TIMING / FLOW with vote combination (engine #8, strategy #11, 12-16h). Do this after items 1-9 have numbers; it is the long-term architecture, not a quick win.

## Phase 3: macro integration done right (about 15 hours)

Evidence: BTC CPI information is spent inside one hour; EIA inside 10 to 30 minutes; the pre-window is
volatility, not direction; regime dependence is large (BTC/SPX correlation ~0.88 post-2021).

1. **Prediction-market conversions** (research #1, 4h). `fedExpectedChangeBp`, `printImpliedMean/Sd`, `printTailSkew`, odds shrink beyond 14 days. Use the Kalshi-implied mean as the surprise anchor when ladder liquidity > $50k. Data already fetched.
2. **Universal event gate + asset-class windows** (engine #7, strategy #6, research #2, 4h). WAIT within 30 min of a critical release for every symbol; half size in the 60-min pre-window; 1.3x stop T+10 to T+60; event directional window 45-min half-life, hard zero at 3h for BTC/Gold, 30 min for WTI inventories. First-5-minute confirmation gate (move > 0.7% held in 6/6, < 0.5% reversed in 9/19).
3. **Macro coupling multiplier** (research #9, 2h). Scale macro and event weights by rolling 30-day BTC/SPX correlation so macro features go quiet in decoupled months.
4. **Surprise SD refresh + gold asymmetry** (research #10, 1h). NFP SD to ~90k; misses move gold more than beats.
5. **Macro posteriors** (perf #9, 4h). Capped conjugate SD update (k=4, 0.5-2x prior), per-(event, asset) Beta posterior on direction hits with human-gated flips, macro Brier.
6. **Fix dead inputs**: set FRED_API_KEY and EIA_API_KEY on Railway (free); `us2y` is null in every snapshot so Fed-communication reads never compute. Replace synthetic CoinGecko daily candles with the Strike daily candles already fetched (engine #10).

## Phase 4: new predictive features (about 30 hours, keyless, ranked)

1. `fundingZ` + venue spread via OKX funding history and Hyperliquid `predictedFundings` (research #3, 4h). Funding as crowding gate and sizing, never direction.
2. Real CVD, OI series and book imbalance into the score (engine #6, 4h). The volume factor's biggest vote is candle colour today.
3. `dvolPct` from Deribit DVOL for expected move, stop width and confidence (research #5, 3h).
4. Basis and curve slope from Deribit dated futures; backwardation = stress gate (research #6, 3h).
5. `oiQuadrant` from OKX OI history (research #7, 3h).
6. Quarter-hour taker imbalance from OKX trades, boundary-timed poller (research #4, 8h). Best documented new 1h signal.
7. Real yield and DXY 5-day changes gated by rolling correlation, for Gold and BTC (research #8, 4h). Treasury XML is keyless.
8. Stablecoin supply 7d change and USDT mint 24h from DefiLlama (research #11, 3h).
9. Headline engine: exclude price-reporting GENERAL rule, weight by `confirms`, exponential decay (engine #10, 3h).
10. Drop the three dead Binance calls and the dead Coinglass call per symbol; parallelize the four cold-cache awaits (engine #12, 1h).

Deferred: 25-delta risk reversal (sign unconfirmed post-2024 ETFs), COT and Coinbase/Korea premium (weak, crowding only), ETF flows (no keyless source; try Kalshi ETF-flow markets), max pain (no pinning evidence).

## Phase 5: trust and presentation (designer Phase 2 owns the layout)

Ledger download with daily SHA-256, per-call audit drawer with inputs at call time and resolution trail, plain-language invalidation reason, confidence intervals on every rate, net-of-cost toggle, methodology changelog, calibration chart on the performance page, event-window state on the verdict card (pre-window, releasing, post-window with minutes left).

## Do-not list (evidence-backed)

- Do not raise weights on liquidity sweeps, order blocks or FVGs (no measurable edge, t < 1 on 547 events).
- Do not use funding as a direction vote (R^2 0.003 at 8h).
- Do not add an ATR trailing stop as the default exit; time stops rank worst.
- Do not add more trend proxies to the sum.
- Do not ship the in-sample best of a 36-config sweep without the deflated-Sharpe check.
- Do not trust Grade A/A+ on the live path until the macro bonus and catalyst override are calibrated.

## Validation protocol for every Phase 2-4 change

1. Implement behind a backtest flag; run 60d and 120d cached windows, one position per symbol.
2. Report net R, PF, TP1 rate, by regime, by bias, by hour, by month; deflated Sharpe vs the sweep count.
3. Accept only if net R improves in both windows or improves in one with no loss in the other, and the calibration table does not degrade.
4. Ship behind `ENGINE_VERSION` hash; the performance page separates versions automatically.
5. Re-check after 100 decided live signals before any public claim.
