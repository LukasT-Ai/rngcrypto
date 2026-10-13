# Predictive features for 1h to 3d directional calls: BTC, ETH, majors, Gold, WTI

Date: 2026-10-13. Scope: features with published or well-documented predictive power at the 1 hour to 3 day horizon, for the RNGcrypto signal engine (Next.js on Railway, keyless or free sources preferred). Every endpoint marked **verified** was called live from this machine on 2026-10-13 and returned data.

Evidence legend: **Strong** = peer-reviewed or large-sample out-of-sample test; **Moderate** = working paper, dissertation, or large practitioner dataset with stated statistics; **Weak** = commentary, anecdote, or a handful of episodes.

## 0. What already exists (do not rebuild)

From `src/lib/signals/engine.ts`, `orderflow.ts`, `src/lib/macro/*`, `src/lib/prediction/*`, `catalyst-news.ts`:

| Area | Built today | Gap |
|---|---|---|
| Order flow | OKX liquidation tape (24h, clustered), OKX full book walls + band imbalance (1/2/5 %), Hyperliquid l2Book fallback | No trade-level taker imbalance, no clock-phase (quarter-hour) feature |
| Positioning | OKX rubik long/short account ratio, OI+volume (1H), taker-volume-contract (1H); Binance OI/ratios (dead, geo-blocked) | No funding history or z-score, no OI-change-vs-price quadrant, no cross-venue funding |
| Funding | Static thresholds (`FUNDING.ELEVATED/HIGH/EXTREME`), `fundingInflection` flag | Thresholds not normalized to the asset's own distribution |
| Options | Deribit BTC-PERPETUAL ticker + option book summary (BTC only) | DVOL, 25d risk reversal, futures basis / term structure not computed |
| Sentiment | Alternative.me F&G, news RSS/GDELT, CoinGecko global, blockchain.info | No stablecoin supply, no Coinbase or Korea premium |
| ETF | Coinglass flow-total (dead for months) | No working keyless ETF flow source |
| Macro | 140+ event defs with `typicalSurpriseSD` priors, FXStreet/ForexFactory calendar, BLS/FRED/EIA release fetch, regime from Yahoo (2y/10y/DXY/VIX/SPX), event weight decaying over 4h, confirmation layer | No real yields (TIPS), surprise SDs are hand priors, no first-minutes reaction gate |
| Prediction markets | Kalshi + Polymarket Fed buckets and CPI ladders, display-only | Not converted into expected values or surprise priors |
| Seasonality | None | No session / weekend / clock-phase handling |

---

## 1. Crypto perps features (1h to 3d)

### 1.1 Funding rate extremes and funding/OI divergence

Evidence: **Weak-to-moderate for direction, moderate for conditioning.**
- Single-asset lagged funding has near-zero predictive power for BTC: 8h-ahead regression R² = 0.003 ([Fulgur Ventures](https://medium.com/@fulgur.ventures/bitcoin-funding-rates-and-price-predictability-27ce95535af1)). Presto Labs finds 7-day *contemporaneous* R² = 12.5 % but lagged R² ≈ 0 for one asset, with cross-sectional (rank across assets) use more promising ([Presto Labs](https://www.prestolabs.io/research/can-funding-rate-predict-price-change)).
- Funding itself is forecastable one period ahead from its own history ([Inan 2025, SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5576424)), so the *level* is mostly already-known carry, not news.
- Structural bias: funding is positive 92 % of the time because of the +0.01 % interest component ([BitMEX Q3 2025](https://www.bitmex.com/blog/2025q3-derivatives-report)). Any threshold must be asymmetric and normalized to the asset's own distribution; the engine's fixed fractions are the wrong unit for alts whose funding runs hotter.
- Practitioner consensus (untested in a paper) is that funding matters only combined with OI: rising OI + rising funding + flat price = crowded long; falling price with OI building = shorts pressing. Treat as a conditioning / squeeze-risk feature, which is what the engine already does qualitatively.

Encoding:
- `fundingZ = (funding_8h - mean_30d) / sd_30d` per instrument; |z| > 2 = crowded. Use the sign as *contrarian* only when `oiChange24h > +5 %` (crowding confirmed), else neutral.
- `fundingOiDiv`: funding z rising while OI falling = positions closing, fade; funding z rising with OI rising = squeeze candidate.
- Cross-venue: Hyperliquid `predictedFundings` returns Binance, Bybit, and Hyperliquid predicted funding for every coin in one call, which restores Binance funding despite the geo-block. Disagreement across venues > 2x is itself a crowding flag.

Sources (keyless, **verified**):
- `GET https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=100` (8h realized rate, 100 per page)
- `POST https://api.hyperliquid.xyz/info {"type":"predictedFundings"}` (hourly HL plus 4h/8h Binance and Bybit)
- `POST https://api.hyperliquid.xyz/info {"type":"metaAndAssetCtxs"}` (funding, openInterest, premium, oraclePx per coin)
- Deribit `get_book_summary_by_currency?currency=BTC&kind=future` fields `current_funding`, `funding_8h`

### 1.2 Open interest change with price

Evidence: **Weak** (no peer-reviewed return-prediction test found). The academic literature covers OI accounting in perps ([Giagkiozis & Said, Ledger 2024](https://ledger.pitt.edu/ojs/ledger/article/download/325/265?inline=1)), not forecasting. Practitioner "divergence resolves in 7 to 21 days" claims ([example](https://sites.google.com/view/decentralised-news/home/crypto-open-interest-explained-the-traders-guide-to-market-structure)) are unsourced.

Encoding (four-quadrant read, positioning modifier, weight ≤ 5 %):
- price up, OI up = new longs, continuation
- price up, OI down = short covering, weak rally (fade bias)
- price down, OI up = new shorts, continuation
- price down, OI down = long liquidation flush (reversal bias after a cluster)
Normalize `oiChange24h` by its 30-day SD; only act beyond ±1 SD.

Source (**verified**): `GET https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=BTC-USDT-SWAP&period=1H&limit=720` returns `[ts, oi, oiCcy, oiUsd]`.

### 1.3 Liquidation clusters

Evidence: **Weak.** No rigorous study with forward returns after liquidation spikes. Case reconstructions of the Oct 10 and Nov 21 2025 cascades ([BeInCrypto](https://beincrypto.com/liquidation-cascade-onchain-technical-analysis/), [Coinchange](https://www.coinchange.io/blog/bitcoins-2-billion-reckoning-how-novembers-liquidations-cascade-exposed-cryptos-structural-fragilities)) list warning signs (record OI, extended price) but say no single one was decisive. Already built on OKX; keep as is. Only change: a one-sided flush (> 80 % one side, > 3x the 7-day hourly median) is a short-horizon mean-reversion flag, not a trend signal.

### 1.4 CVD, taker imbalance, and the quarter-hour effect

Evidence: **Moderate, and the strongest new short-horizon finding in this review.**
- [Kim & Hansen 2026, "The Quarter-Hour Effect"](https://arxiv.org/abs/2607.09426) (Binance, six perps): bursts of volume and volatility at 1, 5, and 15-minute clock marks are driven by periodic algorithmic trading; **order imbalance measured at the quarter-hour opening predicts returns over 4 to 12 hours out of sample**, with much weaker effects at finer frequencies. Baseline level-1 book imbalance at one-minute openings has little predictive content.
- [Silantyev 2019, Digital Finance](https://ideas.repec.org/a/spr/digfin/v1y2019i1d10.1007_s42521-019-00007-w.html): trade flow imbalance (signed taker volume) explains contemporaneous price changes better than book order-flow imbalance on BitMEX; a 2024 replication reports OFI's power declining while TFI stays robust (weak source).
- Pure book OFI decays fast: R² 0.094 at 1 s, 0.019 at 10 s ([arXiv 2308.14235](https://arxiv.org/pdf/2308.14235)).
- Generic CVD guides ([Coinglass](https://www.coinglass.com/fr/learn/what-is-cumulative-volume-delta-cvd), [bgeometrics](https://charts.bgeometrics.com/orderflow.html)) offer no statistics; "absorption" and spot-vs-perp CVD divergence are untested heuristics.

Encoding:
- `qhImbalance`: in the 60 s after each :00/:15/:30/:45 UTC boundary, `(takerBuyUsd - takerSellUsd) / (takerBuyUsd + takerSellUsd)` from the trade tape; keep the last 4 readings; feature = EMA of the last 4, sign = direction, hold 4 to 12 h. Requires minute-level trades, not the 1H rubik bucket.
- `takerRatio1h` (already fetched) stays as confirmation only.
- Spot-vs-perp taker divergence: OKX spot `BTC-USDT` trades vs swap trades; perp buying with spot selling = leveraged, fade-prone.

Sources (keyless): `GET https://www.okx.com/api/v5/market/trades?instId=BTC-USDT-SWAP&limit=500` (side, sz, px, ts; poll at boundaries); `GET /api/v5/market/history-trades` for backfill; Hyperliquid `{"type":"recentTrades","coin":"BTC"}`.

### 1.5 Order-book imbalance

Evidence: **Moderate at seconds, weak at hours.** See 1.4. A Binance futures thesis ([CUNI](https://dspace.cuni.cz/handle/20.500.11956/200516)) and the Kim-Hansen result both say L1 imbalance has little hour-scale value. The existing 1 / 2 / 5 % band imbalance is fine as a *wall* locator (where price stalls), not a direction predictor. Keep weight low; do not add more book features.

### 1.6 Basis and term structure

Evidence: **Weak for direction, moderate as a stress regime flag.** No peer-reviewed return test. CF Benchmarks shows basis tracks momentum and sentiment with carry as the structural driver ([CF Benchmarks](https://www.cfbenchmarks.com/blog/revisiting-the-bitcoin-basis-how-momentum-sentiment-impact-the-structural-drivers-of-basis-activity)); contango roughly 58 % of the time ([Sharpe.ai](https://www.sharpe.ai/futures/term-structure)); backwardation reads as event risk or funding stress. Jump-risk premia inferred from options predict the futures cost of carry ([arXiv 2510.21297](https://arxiv.org/html/2510.21297v1)).

Encoding: annualized basis `b = (F_mark / index - 1) * 365 / daysToExpiry` for the nearest quarterly (> 30 d); `basisZ` vs 90-day history. `b < 0` = backwardation stress flag (haircut confidence, lean mean-reversion); `basisZ > 2` = euphoric carry, crowding flag; `curveSlope = b(6m) - b(3m)`.

Source (**verified**): Deribit `GET /api/v2/public/get_book_summary_by_currency?currency=BTC&kind=future` (mark_price, estimated_delivery_price = index, per dated future; same for ETH). Live sample 2026-10-13: index 83,286; BTC-25DEC26 84,158 (about +5.2 % annualized); BTC-24SEP27 87,521.

### 1.7 Deribit implied vol (DVOL) and 25-delta skew

Evidence: **Moderate, with decay after 2024.**
- [Neo (SMU PhD, 2026), "Bitcoin options risk-reversal predictability"](https://ink.library.smu.edu.sg/etd_coll/887): daily Deribit data Apr 2021 to Dec 2025 (n = 1,723); the 25-delta 90-day risk reversal predicts BTC returns, t = 3.73 in the full baseline (1.91 univariate), significant in most delta/tenor configurations concentrated in the 30 to 180-day band; the butterfly also predicts; **the signal deteriorated after the Jan 2024 spot ETF approval** (adaptive-markets interpretation). The sign of the coefficient is not stated in the abstract; verify in the PDF before fixing the sign in code.
- Variance risk premium is large and regime-dependent, higher in low-vol states ([Almeida et al. 2024](https://arxiv.org/html/2410.15195v2); [Alexander & Imeraj](https://sro.sussex.ac.uk/id/eprint/91094/)); not a directional test.
- K33 anecdote: 6-month 25d skew flipping from negative to positive preceded the May and Dec 2021 crashes, but in May price kept falling for two months after the flip ([K33](https://k33.com/research/archive/articles/medium-term-far-out-the-money-option-flows-foreshadowing-bitcoin-sell-offs)). Weak.
- OTM option flow carries directional private information per the Deribit microstructure paper ([arXiv 2109.02776](https://arxiv.org/abs/2109.02776)).

Encoding:
- `dvolPct`: 1-year percentile of DVOL. Use for *sizing and gating* (expected 24h move = DVOL/√365 × price), not direction. DVOL > 80th pct = widen stops, cut confidence; DVOL < 20th pct with funding z > 2 = squeeze setup.
- `rr25_30d`, `rr25_90d`: IV(25d call) − IV(25d put). Approximate the 25d strikes by moneyness `K = S·exp(±0.675·σ·√T)` using mark_iv from the book summary, interpolate. Feature = z-score vs 180 days. Weight small (≤ 4 %) and only on 1d to 3d horizons; sign to be confirmed from the dissertation.

Sources (**verified**): `GET https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=BTC&start_timestamp=..&end_timestamp=..&resolution=3600` (OHLC of DVOL; also ETH); `get_book_summary_by_currency?currency=BTC&kind=option` returns `mark_iv`, `underlying_price`, `open_interest` per instrument, no auth.

### 1.8 Max pain and expiry effects

Evidence: **Weak.** Deribit itself says recent quarterlies have not shown consistent pinning; max pain is skewed by unreachable strikes ([Cointelegraph](https://cointelegraph.com/magazine/bitcoin-price-stalls-in-april-but-4-2b-options-expiry-may-revive-run), [Decrypt](https://decrypt.co/376752/billion-bitcoin-options-expire-what-it-means)). Keep `btc_opex` as a volatility-event flag (Friday 08:00 UTC; last Friday of month and quarter) that raises expected move and lowers confidence for the 4 h around it. Do not build a max-pain direction feature.

### 1.9 Stablecoin supply changes

Evidence: **Moderate (event study), slow-moving.** [Ante, Fiedler & Strehle 2021](https://www.blockchainresearchlab.org/wp-content/uploads/2020/05/The_Influence_of_Stablecoin_Issuances_on_Cryptocurrency_Markets_BRL_Working_Paper_No_11.pdf) (565 issuances ≥ $1M, 2019 to 2020): positive abnormal returns for majors within 24 h of issuance, weak market *before* issuance (issuance follows downturns), size not significant. Later commentary (Glassnode SSR, Bernstein) is descriptive only. Treat as a 1d to 3d liquidity tailwind, not an intraday signal.

Encoding: `stableSupply7dChg = supply_t / supply_{t-7} - 1` for peggedUSD total; z-score vs 1 year; > +1 SD = tailwind, < −1 SD = headwind. Also `usdtMint24h = circulating - circulatingPrevDay` (USDT, USDC); a single-day mint > $500M = 24 h positive flag.

Source (**verified**): `GET https://stablecoins.llama.fi/stablecoincharts/all` (daily since 2017; 3,241 points; `totalCirculatingUSD.peggedUSD` was $311.05B on 2026-10-12); `GET https://stablecoins.llama.fi/stablecoins?includePrices=false` (per coin with `circulatingPrevDay/Week/Month`).

### 1.10 Spot ETF net flows

Evidence: **Moderate for streaks, weak for single days.** Single-day flows have "very limited" next-day power; runs of ≥ 5 consecutive inflow days signal sustained demand ([HashKey via Decrypt](https://decrypt.co/376683/); [Ecoinometrics](https://ecoinometrics.substack.com/p/for-bitcoin-returns-flow-streaks)). Flows are reported T+1 and mostly reflect the prior day's trading ([NYDIG](https://www.nydig.com/research/predicting-bitcoin-etf-fund-flows)). Academic: net flows strongly predict price *levels*, and most price change occurs outside ETF hours ([Mazur & Polyzos 2025](https://zuscholars.zu.ac.ae/works/7267)).

Encoding: `etfStreak` = signed count of consecutive same-sign days (cap ±10); active only when |streak| ≥ 3; `etfFlow5dUsd` z-scored vs 1 year. Weight ≤ 5 % on the 1d to 3d horizon only.

Source: **no keyless JSON found.** Farside returns HTTP 403 to a plain curl (Cloudflare); it may accept full browser headers but scraping terms are unverified. SoSoValue and Coinglass need keys. Pragmatic fallback: Kalshi lists daily "Bitcoin ETF flows" markets, so the market-implied probability of net inflow is a free proxy; the existing Kalshi client can filter `series_ticker` for the ETF-flow series. Medium effort.

### 1.11 Exchange netflows

No keyless source (CryptoQuant, Glassnode are paid). Skip.

### 1.12 Coinbase premium and Korea premium

Evidence: **Weak** (commentary with a handful of episodes). CryptoQuant-based claim: Korea premium > 3 % together with a negative Coinbase premium has preceded short-term corrections ([CryptoPotato](https://cryptopotato.com/korean-kimchi-and-coinbase-premiums-indicate-possible-bitcoin-correction/)); joint 30-day-smoothed spikes preceded declines in Mar 2024 and Feb 2025 ([BeInCrypto](https://www.tradingview.com/news/beincrypto:723715f5e094b:0-coinbase-kimchi-signal-just-flashed-again-what-it-means-for-bitcoin)). Coinbase premium magnitudes are tiny (≈ 0.08 % highs), so it needs smoothing.

Encoding: `cbPremium = coinbaseUsd / okxUsdt - 1` (USDT/USD drift of ±0.1 % contaminates it; subtract USDT price from DefiLlama); 24 h EMA, z-score vs 30 d. `krPremium = upbitKrw / (usdKrw × globalUsd) - 1`; > 3 % = retail froth flag (bearish), < 0 % = weak Asian demand. Modifier only (±3 %).

Sources (**verified**): `GET https://api.exchange.coinbase.com/products/BTC-USD/ticker`; `GET https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT`; `GET https://api.upbit.com/v1/ticker?markets=KRW-BTC`; USD/KRW `GET https://open.er-api.com/v6/latest/USD` (daily, keyless). frankfurter.app now redirects (use `api.frankfurter.dev` if needed).

### 1.13 DXY and real yields

Evidence: **Moderate but unstable.** Crypto prices macro news like US equities: a 1 SD upside CPI surprise moves BTC about −30 bp and ETH about −45 bp within 15 to 30 minutes, with crypto/SPX response correlation ≈ 0.88 post-2021 ([Kroner, Mohammed & Vega, Fed Board, Mar 2026, "How Do Cryptocurrencies Price Economic News?"](https://rwatimes.substack.com/p/how-do-cryptocurrencies-price-economic); [TokenPost summary](https://www.tokenpost.com/news/insights/19578)). Earlier NY Fed work found BTC orthogonal to macro ([Benigno & Rosa 2023](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr1052.pdf?sc_lang=en)), so the relationship is regime-dependent. Rolling 30-day BTC/DXY correlation was reported anywhere from −0.36 to −0.90 on the same April 2026 date depending on provider ([AhaSignals](https://ahasignals.com/cross-correlation/btc-dxy/), [KuCoin](https://www.kucoin.com/news/insight/BTC/6a99ad704532b3000715813d)); two-year baseline near −0.04. BTC vs 10y real yield about −0.38 in late 2025 ([CryptoSlate](https://cryptoslate.com/does-a-weaker-dollar-drive-bitcoin-price-now/)).

Encoding: use *changes*, gated by the rolling correlation. `realYield10y_5dChg` (bp) and `dxy_5dChg` (%) each as z-scores; multiply by `−corr30d` when |corr30d| > 0.3, else zero. The feature self-silences in decoupled regimes.

Sources: Treasury real yield curve XML (**verified**, keyless, daily): `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_real_yield_curve&field_tdr_date_value_month=YYYYMM` with fields `TC_5YEAR, TC_7YEAR, TC_10YEAR, TC_20YEAR, TC_30YEAR` (2026-10-09: 10y real = 2.91). DXY: Yahoo `DX-Y.NYB` (**verified**, already used). FRED `DFII10` is the same series with a free key once set.

### 1.14 Time-of-day, day-of-week, weekend

Evidence: **Strong that volume and volatility cluster; weak-to-none for direction.**
- Baur, Cahill, Godfrey & Liu (SSRN 3088472, > 15M observations, 7 exchanges): time-varying effects with no consistent return pattern; lower weekend volume, slightly higher Monday returns, activity peaks in US equity hours ([Quantpedia summary](https://quantpedia.com/are-there-any-simple-calendar-effects-in-bitcoin-market/)).
- NYDIG 2021: Friday and early-week outperformance ([NYDIG](https://nydig.com/wp-content/uploads/2021/03/NYDIG-The-Temporalities-of-Bitcoin-Returns.pdf)); Quantpedia hourly backtest: 22:00 to 23:00 UTC best, 03:00 to 04:00 worst (in-sample).
- Kaiko 2024: US hours = 46 % of volume (record), weekend share down to 13 % (from ~25 % in 2018 to 2021), volatility concentrated in the US open ([The Block](https://www.theblock.co/post/279353/bitcoin-weekend-trading), [BNN](https://ampvideo.bnnbloomberg.ca/share-of-bitcoin-volume-during-us-market-hours-surges-to-record-1.2075578)).
- Quarter-hour clock effects: see 1.4. Funding settlement (00/08/16 UTC): no study found.

Encoding: no directional feature. Add `sessionVolScale` (expected-move multiplier: US 13:30 to 20:00 UTC = 1.3, Asia 00:00 to 07:00 = 0.8, weekend = 0.7) and a weekend confidence haircut (−10 %) plus wider stops; expire 1h-horizon signals generated between 21:00 Friday and 23:00 Sunday UTC faster. Funding timestamps: at most a 5-minute no-entry window.

### Concrete feature spec: crypto perps

| Name | Source | Update | Transformation | Expected contribution | Cost / latency |
|---|---|---|---|---|---|
| `fundingZ` | OKX funding-rate-history; HL predictedFundings | 8h (HL 1h) | (f − μ30d)/σ30d per instrument | Replaces fixed thresholds; squeeze gating; contrarian only with OI confirm | 1 call, < 300 ms |
| `fundingVenueSpread` | HL predictedFundings | 1h | max/min across Binance, Bybit, HL | Crowding flag; restores Binance view | same call |
| `oiQuadrant` | OKX rubik open-interest-history 1H | 1h | sign(Δprice24h) × sign(ΔOI24h), each ≥ 1 SD | Continuation vs fade modifier, ±5 % | 1 call |
| `qhImbalance` | OKX market/trades (or HL recentTrades) polled at :00/:15/:30/:45 | 15 min | taker imbalance in first 60 s, EMA(4) | Direction over 4 to 12 h; best-evidenced new feature | cron at boundaries, 4 calls/h |
| `spotPerpTakerDiv` | OKX spot + swap trades | 15 min | perp imbalance − spot imbalance | Leverage-led move flag (fade) | shares calls above |
| `basisAnn`, `basisZ`, `curveSlope` | Deribit book summary kind=future | 5 min | (F/index − 1)·365/T; z vs 90 d | Backwardation stress gate; euphoric carry flag | 1 call |
| `dvolPct` | Deribit get_volatility_index_data | 1h | 1-year percentile; expected move = DVOL/√365 | Sizing, stop width, confidence; not direction | 1 call |
| `rr25_90d` | Deribit book summary kind=option (mark_iv) | 1h | IV(25d call) − IV(25d put), z vs 180 d | Small 1d to 3d directional tilt; verify sign | 1 call, compute-heavy |
| `stableSupply7dChg`, `usdtMint24h` | DefiLlama stablecoins | daily | 7d % change z-scored; daily mint USD | 1d to 3d liquidity tailwind/headwind | 1 call, cache 6h |
| `etfStreak` | Kalshi ETF-flow markets (proxy) or Farside scrape | daily | signed consecutive-day count | Demand persistence on 1d to 3d | medium (source work) |
| `cbPremiumZ`, `krPremium` | Coinbase, OKX spot, Upbit, er-api | 5 min / daily FX | premium − USDT drift; EMA 24h; z 30d | Froth / US-demand modifier ±3 % | 3 calls |
| `realYield5dChg`, `dxy5dChg` (gated) | Treasury XML, Yahoo | daily | z-score × (−corr30d), silenced if abs(corr) < 0.3 | Macro tilt in coupled regimes | 2 calls |
| `sessionVolScale`, weekend haircut | clock | continuous | lookup | Better calibration, fewer weekend false positives | zero |

---

## 2. Macro event reaction research

### 2.1 Which US releases move BTC (ranked)

1. **CPI / core CPI** (and sub-components; "numbers beneath the headline move crypto more"): 1 SD upside surprise ≈ −30 bp BTC, −45 bp ETH, −19 bp SPX within minutes ([Kroner, Mohammed & Vega 2026](https://rwatimes.substack.com/p/how-do-cryptocurrencies-price-economic)). Volmex (BVIV) finds CPI and Fed decisions have the largest magnitude on BTC vol, with implied vol falling after the print ([Babaoğlu & Pfeifer 2024](https://volmex.finance/papers/Macroeconomic%20Announcements%20Fuel%20Volatility%20An%20In-Depth%20Analysis.pdf)).
2. **FOMC decision + statement + presser**: fed-funds-futures tightening surprises push BTC ≈ −0.25 % on the day ([Ma et al. 2022 via KSE thesis](https://kse.ua/wp-content/uploads/2026/05/illia-nazaruk_268722_assignsubmission_file_nazaruk_final_thesis.pdf)); volatility rises significantly on FOMC days ([SCIRP high-frequency study](https://www.scirp.org/journal/paperinformation?paperid=136168)).
3. **Nonfarm payrolls**: biggest single-release 5-minute jolt in a 25-release practitioner sample (worst 2.1 %, average 1 h move 0.79 % vs 0.32 % for inflation releases) ([Dugar](https://chetandugar.substack.com/p/why-and-which-economic-events-move)). Sign flipped around 2020: strong jobs = bad for BTC (same as equities).
4. PCE, PPI, retail sales, GDP advance, ISM: second tier; a 29-item intraday study found BTC vol reacted to only 6 items, and CPI/NFP were not among them in that older sample ([ScienceDirect 2025](https://www.sciencedirect.com/science/article/pii/S1059056025006720)), so weight these below the top three.

Reaction window: information absorbed in **15 to 30 minutes** post-release (Treasury-like speed); spreads widen at the release instant; volatility and volume elevated for the hour. The engine's 4-hour event-weight decay is reasonable; the *direction* should be locked by minute 30.

Direction-hold rule (small sample, n = 25, weak): when the first-5-minute move was < 0.5 %, direction reversed within an hour in 9 of 19 cases; when > 0.7 %, it held in 6 of 6 ([Dugar](https://chetandugar.substack.com/p/why-and-which-economic-events-move)). Use as a confirmation gate: promote an event-driven call only when |5-min move| > 0.6 % *and* the sign agrees with the surprise.

Asymmetry and regime: pre-2020 reactions statistically weak; post-2021 strong; BTC/SPX reaction correlation ≈ 0.88. Expect sensitivity to shrink again when crypto decouples from equities (Q1 2026 "false decoupling" episodes). Encode via the rolling BTC/SPX 30-day correlation as a multiplier on `relevance.BTC`.

### 2.2 Gold

- Scheduled US macro news is the dominant predictor of intraday gold jumps; **negative jumps are predicted by FOMC, NFP, GDP advance, capacity utilization** among others; crashes are more prominent than rallies ([Sobti, IIMA / EFMA 2024](https://www.iima.ac.in/sites/default/files/2024-03/Neharika%20Sobti%20-%20Intraday%20price%20jumps.pdf)).
- NFP (n = 35): correlation of surprise with gold move −0.57 at 15 min, −0.53 at 1 h, −0.45 at 4 h; **misses move gold more than beats** (+$7.83 vs −$5.07 at 15 min, on 8 vs 27 observations) ([FXStreet](https://www.fxstreet.com/analysis/us-january-nonfarm-payrolls-preview-analyzing-gold-price-reaction-to-nfp-surprises-202502061000)). Gold reacts to headline NFP first, then to revisions and unemployment ([DergiPark](https://dergipark.org.tr/tr/download/article-file/3332695)).
- Inflation prints above consensus are negative for gold at 5-min, 30-min, and daily windows ([Wu, Atlantis Press](https://www.atlantis-press.com/article/126008582.pdf)).
- FOMC surprises: older evidence that *unexpected hikes raised gold* 1998 to 2008 ([Gospodinov & Jamali, Atlanta Fed](https://www.centralbanking.com/central-banks/monetary-policy/2317490/unexpected-increases-in-fed-funds-rate-prompt-gold-prices-to-rise)); a 2023 student paper finds +1.09 % per 1 pp surprise over two days, p = 0.08 ([Yale CSEC](https://csec.yale.edu/node/81)). Weak and sign-unstable; rely on the real-yield channel instead.

Ranking for gold: NFP ≈ FOMC > CPI/core CPI > GDP advance > PPI/PCE > rest. Reaction window: 15 min for most of the move, decay of the surprise correlation by 4 h (London fix profit-taking).

### 2.3 WTI

- **EIA / API inventory surprises dominate** intraday crude: immediate negative price impact of a build and positive vol impact for both API and EIA ([UGA](https://community.ams.org/amsmtgs/2237_abstracts/1117-91-109.pdf), [Sharma thesis](https://openscholar.uga.edu/record/14104/files/sharma_muna_201708_ms.pdf)); the effect lasts about **25 minutes and then reverts**, larger when analyst dispersion is wider ([Journal of Energy Markets](https://www.risk.net/node/5728636)).
- Macro releases: little evidence of impact on energy futures in the UGA thesis; an EIA presentation reports a significant NFP coefficient ≈ 0.3 ([EIA 2017](https://www.eia.gov/finance/markets/reports_presentations/2017/linn.pdf)). Rank: EIA > API > OPEC+ decisions > NFP > FOMC/CPI (via DXY).
- Implication: for WTI, the event weight for `eia_crude` should decay in ~30 min, not 4 h; the `relevance.WTI` of CPI/NFP (0.3 to 0.5) is already about right.

### 2.4 Consensus error priors (`typicalSurpriseSD`)

| Release | Current prior | Evidence | Suggested prior | Confidence |
|---|---|---|---|---|
| NFP (k) | 75 | SD of surprises 104k (2023), 85k SD of monthly changes (2024), Bloomberg 256k vs 164k = ~1 SD ([Econbrowser](https://econbrowser.com/?p=55162), [Wong note](https://files.constantcontact.com/668faa28001/60b6d93c-2c5b-4b36-b7d1-a3c47be6827c.pdf)); consensus under-predicts losses in turmoil ([QUB panel](https://pureadmin.qub.ac.uk/ws/files/271455399/JEBO_SI_Nonfarm_Payroll_Panel_WP_Sandbox.pdf)) | 90 | moderate |
| CPI m/m, core CPI m/m (pp) | 0.1 | Forecasts cluster on one 0.1 value with ~65 % of the panel, tails 0.0 to 0.4 ([investingLive](https://investinglive.com/news/what-is-the-distribution-of-forecasts-for-the-us-cpi-20250115/)); Kalshi-implied: a 0.1 pp lagged surprise raises P(m/m > 0.3) by 4.7 pp ([arXiv 2606.30040](https://arxiv.org/abs/2606.30040)); June 2026 core miss of 0.2 | 0.10 headline, 0.09 core; replace with Kalshi-implied SD when ladder liquidity > $50k | moderate |
| Unemployment (pp) | 0.1 | consensus rarely misses by > 0.1 | 0.1 | moderate |
| Claims (k) | 12 | typical weekly miss 10 to 15k | 12 | moderate |
| PPI m/m | 0.3 | PPI misses wider than CPI | 0.25 | weak |
| Core PCE m/m | 0.1 | largely nowcastable from CPI/PPI; misses ≤ 0.1 | 0.07 | weak |
| Fed funds | n/a | use market-implied (Section 4) | 0 if Kalshi/ZQ modal prob > 90 % | strong |
| EIA crude (mb) | existing | surprise SD ≈ 3 mb in practice | 3.0 | weak |

Rule of thumb for transmission: 100k NFP surprise ≈ 5.3 bp on the 2-year ([Wong note](https://files.constantcontact.com/668faa28001/60b6d93c-2c5b-4b36-b7d1-a3c47be6827c.pdf)). The `history.ts` refinement from stored releases should override all of these once n ≥ 12 per event.

### Concrete feature spec: macro events

| Name | Source | Update | Transformation | Expected contribution | Cost / latency |
|---|---|---|---|---|---|
| `eventFirst5mMove` | Strike 5m klines (exists) | at T+5 min | abs(ret) and sign vs surprise sign | Gate: promote only if > 0.6 % and sign agrees; kills the 9/19 reversals | zero |
| `eventWindowDecay` per asset class | config | n/a | BTC/Gold 30 min lock, 4 h decay; WTI inventories 30 min total | Stops stale event bias on oil | zero |
| `macroCouplingMult` | Strike BTC + Yahoo ^GSPC | daily | corr30d(BTC, SPX) clipped 0..1 | Scales macro/event weights down in decoupled regimes | 1 call |
| `typicalSurpriseSD` refresh | table above + Kalshi-implied SD | per event | market SD when available, else prior | Better z-scores and magnitude labels | zero |
| `goldAsymmetry` | taxonomy flag | n/a | multiply negative-for-gold surprises by 1.3 (misses > beats on NFP; crashes > rallies) | Matches documented asymmetry | zero |
| `realYieldTransmission` | Treasury XML | daily | regress Gold 1d return on Δ10y real; slope = transmission coefficient | Grounds the `impact.ts` transmission for gold | 1 call |

---

## 3. Gold and WTI drivers

### 3.1 Gold

- **Real yields (10y TIPS)**: long-run rolling 12-month correlation about −0.73 (2003 to 2021) ([BullionVault](https://www.bullionvault.com/gold-news/gold-price-news/gold-silver-real-rates-121620251)); **broke 2022 to 2025** as central banks became the marginal buyer: 2025 average real yield 1.97 % (highest since 2007) while gold rose > 65 %. Short-horizon *changes* in real yields still move gold on the day; levels do not anchor it. Encode changes only, gated by rolling correlation as in 1.13. Source: Treasury XML (**verified**), FRED `DFII10` with key.
- **DXY**: same treatment; Yahoo `DX-Y.NYB`.
- **Central bank buying**: PBoC 22 consecutive months to Sep 2026; record 289 t in Q2 2026 ([Crux](https://www.cruxinvestor.com/posts/western-etf-selling-masks-record-central-bank-gold-buying), [USAGold](https://www.usagold.com/daily-precious-metals-market-report-september-8-2026/)). Monthly and lagged; irrelevant at 1h to 3d except as regime context (keep real-yield weight low while it persists). Source: World Gold Council (free CSV, monthly), PBoC SAFE monthly on the 7th.
- **GLD holdings**: daily tonnage from SPDR; co-moves with price, no lead evidence found. Low priority; `https://www.spdrgoldshares.com/` publishes a daily CSV (not verified from this machine).
- **CFTC COT managed money**: evidence that *prices drive positioning* (feedback trading), contemporaneous not predictive ([PolyU thesis](https://theses.lib.polyu.edu.hk/handle/200/7971)); practitioners use extremes as crowding ([Saxo](https://home.saxo/en-gb/content/articles/commodities/cot-on-commodities-02062020)). Weak. Encode as `mmNetPct3y` percentile; > 95th = long-crowded haircut on long calls, < 5th = short-crowded. Source (**verified**, keyless Socrata): `https://publicreporting.cftc.gov/resource/72hh-3qpy.json?market_and_exchange_names=GOLD - COMMODITY EXCHANGE INC.&$order=report_date_as_yyyy_mm_dd DESC&$limit=160` with `m_money_positions_long_all`, `m_money_positions_short_all`, `open_interest_all` (2026-10-06: MM long 127,101 / short 16,114, OI 396,109). WTI: `CRUDE OIL, LIGHT SWEET - NEW YORK MERCANTILE EXCHANGE`. Tuesday data, Friday 15:30 ET release.
- **GPR index**: the monthly benchmark is useless at this horizon; the AI-GPR daily series was last updated 2026-03-31 ([Iacoviello](https://www.matteoiacoviello.com/ai_gpr.html)); `gpr_files/data_gpr_daily_recent.xls` downloads (**verified**, 3.2 MB) but is refreshed monthly. The existing headline-based geopolitical score is the right tool. Literature: oil rises after most geopolitical episodes ([Bank Underground](https://bankunderground.co.uk/2024/04/04/the-transmission-channels-of-geopolitical-risk/)); gold safe-haven evidence is case-study only.

### 3.2 WTI

- **EIA/API**: see 2.3; fast, mean-reverting; magnitude scales with dispersion. API (Tuesday 16:30 ET) is paid; EIA weekly via API key (free, exists). Add Cushing stocks (`WCSSTUS1`) and total product supplied as secondary surprise components; Cushing near tank bottoms (< 22 mb) amplifies draws.
- **OPEC+**: cuts produce significant positive abnormal returns, increases do not, "maintain" nothing ([Demirer & Kutan 2010 via SciELO](https://www.scielo.br/j/reaufsm/a/yrzLV9n7fd5vndj5pr8vT5B/); [Energies 2019](https://jes.journals.umz.ac.ir/article_3024.html?lang=en); [Portsmouth 1987 to 2019](https://researchportal.port.ac.uk/en/publications/the-oil-market-reactions-to-opecs-announcements-2/)). Surprise cut Apr 2023: Brent +6 % on the day ([CBC](https://www.cbc.ca/lite/story/1.6799412)). Encode: calendar flag for JMMC/ministerial meetings (vol event) + headline classifier for cut / extend / unwind / increase with asymmetric scores (cut +2, extend +1, maintain 0, increase −1). Partly in `catalyst-news.ts`; add the asymmetry.
- **Crack spreads**: 3-2-1 crack from Yahoo `RB=F`, `HO=F`, `CL=F` (keyless). Refinery margin leads crude demand on weeks, not days; weak at this horizon. Low priority.
- **Tanker / flow proxies**: no free API with evidence (Kpler, Vortexa paid). Skip.
- **WTI term structure**: CL1 to CL2 spread from Yahoo contract symbols (`CLZ26.NYM`, `CLF27.NYM`); deepening backwardation = physical tightness, supports dips. Moderate practitioner evidence, no short-horizon paper found. Cheap regime flag.

### Concrete feature spec: Gold and WTI

| Name | Source | Update | Transformation | Expected contribution | Cost / latency |
|---|---|---|---|---|---|
| `realYield10y`, `realYield5dChg` | Treasury XML | daily | bp change, z-score, × (−corr30d) | Gold daily tilt in coupled regimes; BTC secondary | 1 call |
| `mmNetPct3y` (gold, WTI) | CFTC Socrata 72hh-3qpy | weekly (Fri) | (MM long − short)/OI, 3-year percentile | Crowding haircut at extremes (> 95 / < 5) | 2 calls, cache 24 h |
| `eiaSurpriseFast` | existing EIA + ForexFactory consensus | weekly (Wed 10:30 ET) | z-score; event weight decays to zero in 30 min; Cushing < 22 mb multiplier 1.3 | Matches the 25-minute documented effect; stops 4 h stale bias | zero |
| `opecDecisionScore` | catalyst-news + calendar | event | cut +2, extend +1, maintain 0, increase −1 | Matches asymmetric literature | small |
| `wtiCurveFront` | Yahoo CL contract pair | daily | (CL1 − CL2)/CL2 %, z 1 year | Tightness regime flag | 2 calls |
| `crack321` | Yahoo RB=F, HO=F, CL=F | daily | 3-2-1 crack, z 1 year | Weak; demand context only | 3 calls |
| `cbGoldRegime` | WGC monthly | monthly | net purchases > 50 t/month = regime flag | Lowers real-yield weight while active | 1 call/month |

---

## 4. Prediction-market odds as inputs

Evidence: **Moderate-to-strong for Fed decisions near the meeting, contested elsewhere.**
- Kalshi's modal forecast the day before FOMC meetings has been perfect and beat fed funds futures ([Diercks, Katz & Wright, NBER WP Jan 2026 via Fortune](https://www.fortune.com/2026/01/28/kalshi-prediction-market-federal-reserve-betting-forecast-nber-working-paper); [Axios](https://www.axios.com/2026/02/19/kalshi-fed-prediction-markets)).
- Months out, Kalshi/Polymarket price "no change" up to 20 c above CME FedWatch, converging within 1 to 2 c in the final weeks; the instruments ask slightly different questions ([Dune](https://dune.com/blog/pricing-the-fed-kalshi-polymarket-cme-fedwatch)).
- Calibration varies with horizon, domain and trade size (87 % of calibration variance explained by those three) ([Le 2026, arXiv 2602.19520](https://arxiv.org/html/2602.19520v1)); a Vanderbilt study found Polymarket the least accurate of three venues on political markets ([DL News](https://www.dlnews.com/articles/markets/polymarket-kalshi-prediction-markets-not-so-reliable-says-study)). Shrink odds > 7 days from resolution toward 50/50.
- CPI ladders: the Kalshi-implied mean carries forecast information, especially for headline CPI; upper-tail probabilities predict high-inflation prints even when the implied mean equals consensus ([arXiv 2606.30040](https://arxiv.org/abs/2606.30040)).

Conversions:
1. **Fed expected change**: `E[Δ] = Σ p_i · Δ_i` over buckets (hike +25, hold 0, cut25 −25, cut50 −50 bp). Surprise at decision = `actual − E[Δ]`; `typicalSurpriseSD_fed = sqrt(Σ p_i (Δ_i − E)^2)`. With modal p > 0.9, SD ≈ 7 bp, so a hold when 92 % hold is priced is a 2 bp surprise (no event score), while a surprise cut scores z ≈ −3.5. Blend with fed funds futures: `impliedRate = 100 − ZQ price` for the meeting month (Yahoo `ZQZ26.CBT` **verified**); use the futures when Kalshi volume < $100k.
2. **Print expected value and SD**: for a ladder of `P(X > k_j)`, build the CDF, take `μ = Σ k_j · [P(>k_{j-1}) − P(>k_j)]` (midpoint rule), `σ` likewise. Use `μ_market` as a second consensus: `blendedConsensus = w·μ_market + (1−w)·consensus`, `w = min(1, volume/$200k) × 0.5`. Use `σ_market` to replace `typicalSurpriseSD` when volume ≥ $50k (`ladder.ts` already parses these).
3. **Skew prior**: `tailSkew = P(X > consensus + 0.1) − P(X < consensus − 0.1)`; feed as a pre-release lean (sign = direction of likely miss, magnitude × relevance × 0.5). This is the one pre-release directional feature with published support.
4. **Decay**: shrink any odds older than 24 h or > 14 days from resolution toward 0.5 by λ = 0.3.

### Concrete feature spec: prediction markets

| Name | Source | Update | Transformation | Expected contribution | Cost / latency |
|---|---|---|---|---|---|
| `fedExpectedChangeBp`, `fedSurpriseSd` | Kalshi/Polymarket (exists) + Yahoo ZQ | 15 min | Σ p·Δ; bucket SD; futures fallback | Correct FOMC surprise sizing; stops scoring fully-priced decisions | +1 Yahoo call |
| `printImpliedMean`, `printImpliedSd` | Kalshi ladders (exists; `KXCPI-26OCT` **verified**) | 15 min | CDF from thresholds | Market-based `typicalSurpriseSD`; blended consensus | zero |
| `printTailSkew` | same | 15 min | P(above +0.1) − P(below −0.1) | Pre-release lean, only published pre-event edge | zero |
| `oddsShrink` | clock | n/a | shrink toward 0.5 beyond 14 d | Avoids over-trusting far-dated odds | zero |

---

## 5. Ranked top 15 additions by expected accuracy gain per engineering hour

Gain is judgmental (evidence strength × horizon fit × how often the feature fires); effort is rough hours including tests.

| # | Addition | Evidence | Effort (h) | Why it ranks here |
|---|---|---|---|---|
| 1 | Prediction-market conversions: `fedExpectedChangeBp`, `printImpliedMean/Sd`, `printTailSkew`, odds shrink (Section 4) | moderate-strong | 4 | Data already fetched; fixes surprise sizing for the three releases that matter most; only pre-release directional edge with a paper behind it |
| 2 | Event first-5-minute confirmation gate + asset-class reaction windows (WTI inventories 30 min) | moderate (n small) + strong (JEM) | 3 | Removes roughly half of post-event reversals; zero new data |
| 3 | `fundingZ` + `fundingVenueSpread` via OKX history and Hyperliquid predictedFundings | moderate (conditioning) | 4 | Replaces fixed thresholds that "never fired"; restores the Binance view |
| 4 | `qhImbalance` quarter-hour taker imbalance from OKX trades | moderate, out-of-sample 4 to 12 h | 8 | Best-documented new 1h-horizon signal; needs a boundary-timed poller |
| 5 | `dvolPct` for expected move, stops, and confidence | strong for vol, none for direction | 3 | Improves calibration and grade thresholds on every BTC/ETH call |
| 6 | `basisAnn/basisZ/curveSlope` from Deribit futures | weak-moderate (stress flag) | 3 | One call; backwardation gate catches event-risk regimes |
| 7 | `oiQuadrant` from OKX OI history | weak (practitioner) | 3 | Cheap; complements #3; sign-aware continuation/fade |
| 8 | `realYield5dChg` + `dxy5dChg` gated by rolling correlation (gold, BTC) | moderate, regime-dependent | 4 | Treasury XML is keyless; self-silencing design avoids the 2022 to 2025 breakdown |
| 9 | `macroCouplingMult` (BTC/SPX corr30d scaling macro and event weights) | moderate (Fed paper regime finding) | 2 | Prevents macro features from dominating in decoupled months |
| 10 | `typicalSurpriseSD` refresh table + gold asymmetry multiplier | moderate | 1 | Table edit; better magnitude labels immediately |
| 11 | `stableSupply7dChg` + `usdtMint24h` (DefiLlama) | moderate event study, slow | 3 | Daily 1d to 3d tailwind; one cached call |
| 12 | `sessionVolScale` + weekend haircut | strong for vol/liquidity, none for direction | 2 | Fewer weekend false positives, better stop widths |
| 13 | `rr25_90d` risk reversal from Deribit mark_iv | moderate, decaying post-2024 | 8 | Published t-stat but sign must be confirmed and effort is highest |
| 14 | `mmNetPct3y` COT crowding (gold, WTI) + `wtiCurveFront` | weak | 4 | Keyless Socrata and Yahoo; weekly haircut at extremes only |
| 15 | `cbPremiumZ` + `krPremium` | weak | 3 | Cheap froth flag; cap at ±3 % weight |

Deferred or rejected: ETF flow streaks (moderate evidence but no keyless source yet; Farside 403s plain requests; try Kalshi ETF-flow markets as a proxy first), exchange netflows (paid only), max pain direction (no pinning evidence), GPR index (monthly refresh), crack spreads and tanker flows (wrong horizon or paid), funding-settlement timing (no study found), fear & greed as contrarian (literature shows co-movement, not reversal; keep the current small weight).

## Verified endpoint list (2026-10-13, keyless)

- OKX: `/api/v5/public/funding-rate-history`, `/api/v5/rubik/stat/contracts/open-interest-history`, `/api/v5/public/premium-history`, `/api/v5/market/ticker?instId=BTC-USDT`, `/api/v5/market/trades` (documented, used by spec), plus the existing rubik and liquidation endpoints. `rubik/stat/option/open-interest-volume-strike` rejected the expiry format tried; low priority.
- Hyperliquid: `info` types `metaAndAssetCtxs`, `predictedFundings` (both verified), `recentTrades`, `l2Book` (exists).
- Deribit: `get_volatility_index_data` (DVOL hourly OHLC), `get_book_summary_by_currency` kind=future and kind=option (mark_iv, open_interest, current_funding, funding_8h).
- Treasury real yield curve XML (TC_10YEAR), Yahoo `DX-Y.NYB`, `ZQZ26.CBT`, `CL=F`/`RB=F`/`HO=F` pattern.
- CFTC Socrata `72hh-3qpy` (disaggregated futures-only), field names confirmed.
- DefiLlama `stablecoins.llama.fi/stablecoincharts/all` and `/stablecoins`.
- Coinbase Exchange ticker, Upbit ticker, `open.er-api.com` USD rates.
- Kalshi `series_ticker=KXCPI` markets, Polymarket gamma (both already integrated).
- Alternative.me F&G history (`?limit=N`).
- Not working keyless: Farside (403), Coinglass (key), CryptoQuant/Glassnode (paid), API weekly oil (paid), CME FedWatch (no API; use ZQ futures), frankfurter.app (redirect; use api.frankfurter.dev).
