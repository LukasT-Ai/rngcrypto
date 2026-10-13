# Copy Trade: wallet copyability scoring rubric

Author: analyst-copyscore, 2026-10-13. Implemented by be-copytrade (`score` and `stats30d` on TraderRow, CONTRACT.md amendment 2).
Goal: rank Hyperliquid wallets as candidates for mirroring through Ascend, which can only copy BTC, ADA, GOLD and WTI perps. A good candidate is successful, active, consistent, not reckless, AND trades predominantly those four. Everything below uses only data already on TraderRow / trader detail: leaderboard windows, 30 days of fills, open positions, pnlHistory, equity, `mix`.

## 0. Conventions and helpers

- Population P = every scanned wallet with >= 20 copyable fills in 30d (the discovery rule in amendment 2). Rank-based scaling is always against P, recomputed per scan.
- `pctl(x)` = percentile rank of x within P, 0..100 (ties get the mean rank). Robust to whales and to one wallet with +$5M.
- `lin(x, [(x0,y0),(x1,y1),...])` = piecewise-linear interpolation, clamped to the end values. All anchor tables below use this. Anchors are fixed (not data-relative) so a score of 80 means the same thing next month.
- "Copyable" = fills whose coin maps to the BTC/ADA/GOLD/WTI groups (`xyz:GOLD`, `km:GOLD`, `PAXG`, `xyz:CL`, `km:USOIL`, `xyz:BRENTOIL` included). "Closing fill" = `dir` starts with "Close" (or is a liquidation); each closing fill with closedPnl != 0 is one trade for win-rate and profit-factor purposes. Document in the UI that this counts partial closes separately.
- `pnlCopyableNet` = sum(closedPnl) - sum(fee) over copyable fills, 30d. `equityStart` = max(equity - windows.month.pnl, 1000).
- Daily series: `d_i` = pnlHistory.month resampled to one point per UTC day (last point of the day); `dPnl_i` = d_i - d_{i-1}; `r_i` = dPnl_i / equityStart. Equity curve `E_i` = equityStart + d_i. `maxDrawdownPct` = max over i of (peak(E_0..i) - E_i) / peak, in %.
- Every sub-score is 0..100. Null is allowed and handled in section 2.4. Round only at the end.

## 1. Sub-scores

### 1.1 Success (0..100) — did the copyable part of the book make money, and how
Minimum sample: >= 20 copyable closing trades in 30d, else `success = null`.
- S_pnl = pctl(pnlCopyableNet)
- S_roi = lin(roiC, [(-20,0),(0,50),(40,100)]) where roiC = 100 * pnlCopyableNet / equityStart
- S_pf = lin(PF, [(0.8,0),(1.0,30),(1.5,70),(2.5,100)]) where PF = grossWins / grossLosses over copyable closing trades (grossLosses = 0 -> PF = 2.5 if trades >= 20)
- S_wr = lin(winRate%, [(35,0),(60,100),(90,70)])  (win rates above ~80% with a low PF are the martingale/grid signature, so the curve bends down; KuCoin and Bitget guides both flag >80% as a red flag)
- success = 0.40*S_pnl + 0.25*S_roi + 0.25*S_pf + 0.10*S_wr
- Cap: if pnlCopyableNet <= 0 then success = min(success, 25).

### 1.2 Activity (0..100) — is there something to copy, and is it recent
- tpd = copyable fills / 30 (as in stats30d.tradesPerDay but copyable-only)
- A_freq = lin(tpd, [(0,0),(0.5,40),(1,70),(3,100),(8,100),(15,70),(30,50)])  (above ~15/day a scalper's edge does not survive a follower's latency; see section 7)
- A_recent = lin(daysSinceLastCopyableFill, [(1,100),(3,80),(7,40),(14,0)])
- A_days = 100 * activeDays / 30, activeDays = UTC days with >= 1 copyable fill
- activity = 0.40*A_freq + 0.35*A_recent + 0.25*A_days
Never null (zero fills gives 0).

### 1.3 Focus (0..100) — how much of the wallet can Ascend actually mirror
- focus = 0.60 * mix.copyableSharePct (volume) + 0.40 * mix.copyableTradeSharePct (count)
- Volume weighs more because the PnL follows the notional; count stops a wallet from gaming it with one giant BTC fill. Never null.

### 1.4 Consistency (0..100) — is the result repeatable or one lucky trade
Minimum sample: >= 14 daily points in pnlHistory.month AND >= 20 copyable trades, else `consistency = null`.
- C_weeks = lin(profitableWeeks of last 4 full weeks, [(0,0),(1,10),(2,40),(3,75),(4,100)]) using total daily pnl (pnlHistory is account-wide; there is no per-asset equity curve)
- C_days = lin(profitableDays% over days with any fill, [(40,0),(55,60),(65,100)])
- C_conc = 100 - 100*clamp((topTradeShare - 0.15)/0.45, 0, 1), topTradeShare = largest copyable closedPnl / grossWins  (one trade >= 60% of all profit scores 0)
- C_sortino = lin(sortinoD, [(0,0),(0.10,50),(0.30,100)]), sortinoD = mean(r_i) / downsideDev(r_i) on daily returns (downsideDev uses only r_i < 0; if no negative day and >= 14 points, sortinoD = 0.30)
- consistency = 0.30*C_weeks + 0.25*C_days + 0.25*C_conc + 0.20*C_sortino

### 1.5 Risk (0..100, higher = safer) — would a follower survive the ride
- R_dd = lin(maxDrawdownPct, [(5,100),(10,80),(20,50),(35,15),(50,0)])
- R_lev = lin(medianLeverage, [(3,100),(5,85),(10,55),(20,20),(40,0)]); medianLeverage = median over open positions' `leverage`, fallback median of (fill notional / equityStart) over copyable opening fills; null -> R_lev = 60 with reason "leverage unknown"
- R_conc = lin(maxOpenNotional / equity, [(1,100),(2,70),(5,30),(10,0)]); no open positions -> 90
- R_liq = lin(minLiqDistance%, [(2,0),(5,25),(10,60),(25,100)]), minLiqDistance = min over open positions of |markPx - liqPx| / markPx; no open positions or all liqPx null -> 85
- risk = 0.40*R_dd + 0.25*R_lev + 0.20*R_conc + 0.15*R_liq
Null only when maxDrawdownPct is null (< 7 daily points); then risk = null.

## 2. Copyability blend

### 2.1 Base
base = 0.30*success + 0.25*consistency + 0.20*risk + 0.15*activity + 0.10*focus
Weights follow the evidence: drawdown and consistency, not headline ROI, separate leaders who pay their followers from leaders who do not (Bybit's "lowest drawdown" board is the only one built on Sharpe/Sortino/volatility; the zero-skill simulation in the Thor piece puts 99.7% of top-10 seats with the highest-volatility cohort when ranked by raw return and 99.3% with the genuinely skilled cohort when ranked by return/volatility).

### 2.2 Focus multiplier (hard gate)
- focus >= 70: m_focus = 1.00
- 50 <= focus < 70: m_focus = 0.70 + 0.30*(focus - 50)/20
- focus < 50: m_focus = 0.35 * focus / 50   (a 25% focus wallet keeps 17.5% of its base; it can never grade above D)

### 2.3 Penalties (multiplicative, all that apply, product floored at 0.10)
| Trigger | Factor | Reason string |
|---|---|---|
| maxDrawdownPct > 30 | 0.70 | "Drawdown over 30% in the last 30 days" |
| maxDrawdownPct > 50 | 0.40 (replaces 0.70) | "Drawdown over 50% in the last 30 days" |
| medianLeverage > 10 | 0.80 | "Median leverage above 10x" |
| medianLeverage > 25 | 0.60 (replaces 0.80) | "Median leverage above 25x" |
| maxOpenNotional / equity > 3 | 0.85 | "One position is over 3x account equity" |
| daysSinceLastCopyableFill > 7 | 0.60 | "No copyable trade in over 7 days" |
| daysSinceLastCopyableFill > 14 | 0.30 (replaces 0.60) | "No copyable trade in over 14 days" |
| copyable closing trades in 30d < 20 | 0.50 | "Fewer than 20 copyable trades in 30 days" |
| pnlCopyableNet <= 0 AND windows.month.pnl > 0 | 0.50 | "Profits come from markets Ascend cannot copy" |
| equity < 5000 | 0.80 | "Small account, results may not scale" |
| winRate >= 85 AND PF < 1.2 | 0.70 | "High win rate with tiny average win (grid or martingale pattern)" |

copyability = round(clamp(base * m_focus * product(penalties), 0, 100))

### 2.4 Thin data
- success null -> use 40 in the base, add reason "Not enough closed trades to judge success". consistency null -> use 40, reason "Less than two weeks of history". risk null -> use 50, reason "Drawdown unknown". Any substitution caps the grade at C and sets `score.thin = true` so the UI can render the chip hollow and the bar hatched.
- If copyable fills < 5 the wallet is not scored: score = { copyability: 0, grade: "D", reasons: ["No copyable activity"] } and sub-scores null.

## 3. Grades and reasons
| Grade | copyability | Extra gates |
|---|---|---|
| A | >= 75 | focus >= 70, success >= 60, risk >= 50, >= 40 copyable trades, no penalty applied, not thin |
| B | 60..74 | focus >= 50, no inactivity or negative-copyable-pnl penalty, not thin |
| C | 40..59 | none |
| D | < 40 | any wallet that fails a gate drops exactly one letter from what the score alone would give, never more |

Positive reasons (shown first, max 3): "Trades mostly BTC/ADA/GOLD/WTI (87%)", "Profitable every week this month", "Max drawdown only 8%", "Profit factor 1.9 on 71 trades", "Active daily, last trade 2h ago", "Leverage around 4x". Negative reasons = the penalty strings above plus "Top single trade is 55% of all profit", "Win rate below 45%", "Only 14 active days of 30". The reasons array is ordered: gates failed, then penalties, then positives, capped at 6.

## 4. Tie-breakers (equal rounded copyability)
1. higher consistency, 2. lower maxDrawdownPct, 3. higher pnlCopyableNet, 4. more copyable trades, 5. higher focus, 6. address ascending (stable).

## 5. Worked example (three synthetic wallets, same scan)

| Input | A "steady BTC/GOLD" | B "alt hero" | C "new ADA scalper" |
|---|---|---|---|
| equity / month pnl | 120k / +19k | 40k / +60k | 8k / +2.4k |
| pnlCopyableNet, roiC | +18k, 15% | +4k, 10% | +2.4k, 30% |
| copyable trades, PF, winRate | 71, 1.9, 58% | 27, 1.3, 45% | 14, n/a, n/a |
| tpd, last fill, active days | 2.5, 0.5d, 26 | 0.9, 2d, 14 | 0.47, 0.2d, 9 |
| focus vol / count | 88 / 84 | 22 / 30 | 97 / 95 |
| prof weeks, prof days, topTradeShare, sortinoD | 4/4, 62%, 12%, 0.22 | 2/4, 50%, 55%, 0.05 | null (9 days) |
| maxDD, medLev, maxPos/eq, liqDist | 8%, 4x, 1.2, 30% | 38%, 25x, 6, 4% | 6%, 12x, 2.5, 7% |

Sub-scores (S_pnl percentiles assumed 82 / 45 / null):
- A: success = .4*82 + .25*68.75 + .25*82 + .1*92 = 79.7. activity = .4*92.5 + .35*100 + .25*86.7 = 93.7. focus = 86.4. consistency = .3*100 + .25*88 + .25*100 + .2*80 = 93. risk = .4*88 + .25*92.5 + .2*94 + .15*100 = 92.1. base = 24 + 23.25 + 18.4 + 14.1 + 8.6 = 88.4; m_focus 1, no penalties -> **88, A**.
- B: success = .4*45 + .25*62.5 + .25*54 + .1*40 = 51.1. activity = .4*64 + .35*90 + .25*46.7 = 68.8. focus = 25.2. consistency = .3*40 + .25*40 + .25*11 + .2*25 = 29.8. risk = .4*12 + .25*15 + .2*24 + .15*16.7 = 15.9. base = 15.3 + 7.4 + 3.2 + 10.3 + 2.5 = 38.8; m_focus = 0.35*25.2/50 = 0.176; penalties 0.70 (DD>30) * 0.80 (lev>10) * 0.85 (conc>3) = 0.476 -> 38.8*0.176*0.476 = **3, D**. Reasons: "Only 25% of volume is copyable", "Drawdown over 30%", "Median leverage above 10x", "One position is over 3x account equity", "Top single trade is 55% of all profit". A +$60k month wallet ranks at the bottom, which is the point.
- C: success null -> 40, consistency null -> 40 (thin). activity = .4*37.6 + .35*100 + .25*30 = 57.5. focus = 96.2. risk = .4*96 + .25*48 + .2*63.3 + .15*39 = 68.9. base = 12 + 10 + 13.8 + 8.6 + 9.6 = 54.0; m_focus 1; penalties 0.50 (trades<20) * 0.80 (lev>10) = 0.40 -> 21.6 -> **22, D (thin)**. Reasons: "Not enough closed trades to judge success", "Less than two weeks of history", "Fewer than 20 copyable trades in 30 days", "Median leverage above 10x", positive: "Trades mostly BTC/ADA/GOLD/WTI (96%)". UI hint: "Watchlist, re-check in 2 weeks".

## 6. Do not rank by
- Raw 30d or all-time PnL in USD (whale size, not skill; our own summary strip did this at first and should switch to copyability).
- ROI on short windows (7d ROI is what Bybit's "top traders by ROI" board sorts on; it is also the board that needs a 40% drawdown cap just to stay sane).
- Win rate alone (grid and martingale bots print 90%+ then blow up; pair it with profit factor).
- Account-wide PnL when the copyable share is low (wallet B).
- Follower count, AUM, vault TVL or social signals (unavailable on-chain anyway, and lagging).
- Unrealized PnL of open positions (it is not a result yet; it is shown, never scored).
- Equity size as a quality signal in either direction, beyond the < $5k penalty.
- Anything computed on fewer than 20 trades or 14 days.

## 7. Suggested follow-ups
1. Follower-slippage estimate: for each wallet, compare its median copyable fill notional with Ascend's top-of-book depth per market (needs an Ascend depth snapshot); show "mirror fit: fits / partial / too big" and later fold into risk as a fifth term. The Thor copier worked example found contract rounding cost a half-size follower about three times what latency slippage did, so size fit matters more than speed.
2. Leader age: pnlHistory.allTime gives first-activity date; add `ageDays` and a soft bonus (lin(ageDays, [(30,0),(180,10)]) points added to consistency) once we have confidence the series is clean of deposit/withdrawal flows (tradingstrategy.ai strips flows from vault PnL for this reason; we should net deposits via withdrawable deltas if the API exposes them).
3. Per-asset drawdown: rebuild an equity curve from copyable closing fills only so consistency and risk stop leaning on the account-wide pnlHistory.
4. Funding mismatch: Ascend funding differs from Hyperliquid; for wallets with avgHoldMin > 24h, show the leader's fundingPaid so the user can judge carry.
5. Latency fit: expose avgHoldMin and flag < 15 min as "scalper, hard to mirror".
6. Re-validate the anchors after 60 days of scans by checking whether grade A wallets' next-30d pnlCopyableNet beats grade B/C (the only test that matters).

## Sources
- Bybit help center, "How Can Master Traders Rank in The Different Categories": ROI board requires 30d max drawdown <= 40%, >= 4 followers, positive 7d and 90d ROI, sorted by 7d ROI; "lowest drawdown" board scores 30d ROI, 30d MDD, return volatility, Sharpe, Sortino, activity, balance. https://www.bybit.com/en/help-center/article/How-Can-Master-Traders-Rank-in-The-Different-Categories
- eToro Popular Investor standards: max daily risk score 7, max weekly drawdown 25%, profitable months >= 30%, max single position <= 50%. https://www.etoro.com/investing/popular-investor
- Bitget Academy, key copy trading metrics (ROI as TWR, max drawdown, win rate, P/L ratio). https://www.bitget.com/academy/key-spot-copy-trading-metrics
- OKX lead trader profile metrics (max drawdown, win rate, P/L ratio, days active, AUM). https://tradingfinder.com/exchanges/okx/copy-trading/
- KuCoin, "Is Crypto Copytrading Profitable in 2026" citing the YieldFund 2025 multi-exchange study: 97% of leaders profitable, 43.6% delivered profit to followers, blended follower profitability 48.5%; slippage, risk mismatch, concentration and fees as causes; suggested screens (6+ months, MDD < 20%, win rate 55-65%, PF > 1.5). Promotional source, study not independently verified. https://www.kucoin.com/blog/is-crypto-copytrading-profitable-in-2026
- Thor Trade Copier, "Copy trading leaderboards select the riskiest trader" (zero-skill simulation, survivorship numbers, return/volatility ranking fix). https://thortradecopier.com/blog/copy-trading-leaderboards-riskiest-trader
- Thor Trade Copier, "Copied accounts don't match master" (rounding vs slippage decomposition). https://thortradecopier.com/blog/copied-accounts-dont-match-master
- Apesteguia, Oechssler, Weidenholzer, "Copy Trading", Management Science 66(12), 2020: copy trading induces excessive risk taking. https://bse.eu/research/publications/copy-trading
- Buildix, Hyperliquid vaults analytics guide (Sharpe and drawdown over gross PnL; +40% gross with 60% drawdown example). https://www.buildix.trade/blog/hyperliquid-vaults-analytics-hlp-top-traders-guide-2026
- tradingstrategy.ai Hyperliquid vault pages (flow-cleaned PnL, rank instability between snapshots). https://tradingstrategy.ai/vaults/hyperdash-vault-1
- BitMEX Hyperliquid copy trading launch (cross-venue mirroring ranks by PnL, drawdown, win ratio, AUM; executes on BitMEX). https://thedefiant.io/news/cefi/bitmex-launches-hyperliquid-copy-trading
- Tradecopia docs, why follower fills differ from the leader. https://docs.tradecopia.com/en/articles/15515228-why-do-follower-orders-fill-at-a-different-price-than-the-leader
- Binance Square, Feraf Trades on choosing lead traders over 180/360d windows and the Oct 2025 drop. https://www.binance.com/en/square/profile/fg47
