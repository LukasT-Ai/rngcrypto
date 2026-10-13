import type { MacroEventDef, Unit } from "./types";

// typicalSurpriseSD = prior for the standard deviation of (actual − consensus) in the event's display unit.
// Refined by history.ts once enough stored releases exist. Values are conservative priors, not claims of precision.
export const EVENT_DEFS: MacroEventDef[] = [
  {
    id: "cpi_mom", title: "CPI m/m", aliases: /^cpi m\/m$/i, kind: "inflation", importance: "critical", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.9, GOLD: 1.0, WTI: 0.4 },
    source: { provider: "BLS", series: "CUSR0000SA0", transform: "mom_pct" },
    logic: "Cooler inflation lowers rate expectations, pressuring yields and the dollar, which supports BTC and Gold; hotter does the opposite.",
  },
  {
    id: "core_cpi_mom", title: "Core CPI m/m", aliases: /^core cpi m\/m$/i, kind: "inflation", importance: "critical", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.09, relevance: { BTC: 1.0, GOLD: 1.0, WTI: 0.3 },
    source: { provider: "BLS", series: "CUSR0000SA0L1E", transform: "mom_pct" },
    logic: "Core inflation is what the Fed reacts to; a cooler core print eases policy expectations and helps BTC and Gold.",
  },
  {
    id: "cpi_yoy", title: "CPI y/y", aliases: /^cpi y\/y$/i, kind: "inflation", importance: "high", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.7, GOLD: 0.8, WTI: 0.3 },
    source: { provider: "BLS", series: "CUUR0000SA0", transform: "yoy_pct" },
    logic: "Headline annual inflation shapes the rate path narrative; below consensus is dollar-negative and supportive for BTC and Gold.",
  },
  {
    id: "ppi_mom", title: "PPI m/m", aliases: /^ppi m\/m$/i, kind: "inflation", importance: "high", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.25, relevance: { BTC: 0.6, GOLD: 0.7, WTI: 0.4 },
    source: { provider: "BLS", series: "WPSFD4", transform: "mom_pct" },
    logic: "Producer prices lead consumer inflation and feed PCE; a softer print eases the Fed outlook.",
  },
  {
    id: "core_ppi_mom", title: "Core PPI m/m", aliases: /^core ppi m\/m$/i, kind: "inflation", importance: "high", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.6, GOLD: 0.7, WTI: 0.2 },
    source: { provider: "BLS", series: "WPSFD49104", transform: "mom_pct" },
    logic: "Core producer prices feed into core PCE; softer is dovish at the margin.",
  },
  {
    id: "core_pce_mom", title: "Core PCE Price Index m/m", aliases: /^core pce price index m\/m$/i, kind: "inflation", importance: "critical", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.07, relevance: { BTC: 0.9, GOLD: 1.0, WTI: 0.3 },
    source: { provider: "FRED", series: "PCEPILFE", transform: "mom_pct" },
    logic: "Core PCE is the Fed's preferred gauge; a cooler print directly lowers the policy path and supports BTC and Gold.",
  },
  {
    id: "pce_mom", title: "PCE Price Index m/m", aliases: /^pce price index m\/m$/i, kind: "inflation", importance: "high", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.7, GOLD: 0.8, WTI: 0.3 },
    source: { provider: "FRED", series: "PCEPI", transform: "mom_pct" },
    logic: "Headline PCE confirms the inflation trend the Fed tracks.",
  },
  {
    id: "nfp", title: "Non-Farm Employment Change", aliases: /^non-?farm employment change$/i, kind: "labor_strength", importance: "critical", unit: "k", decimals: 0,
    typicalSurpriseSD: 90, relevance: { BTC: 0.9, GOLD: 0.9, WTI: 0.5 },
    source: { provider: "BLS", series: "CES0000000001", transform: "diff_k" },
    logic: "Strong payrolls mean a Fed less pressed to ease (yields and dollar up) unless growth fears dominate, in which case risk assets can rally on relief.",
  },
  {
    id: "unemployment", title: "Unemployment Rate", aliases: /^unemployment rate$/i, kind: "labor_weakness", importance: "high", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.7, GOLD: 0.8, WTI: 0.4 },
    source: { provider: "BLS", series: "LNS14000000", transform: "level" },
    logic: "A higher jobless rate pulls rate expectations lower; it helps Gold and often BTC unless it tips into outright growth scare.",
  },
  {
    id: "ahe_mom", title: "Average Hourly Earnings m/m", aliases: /^average hourly earnings m\/m$/i, kind: "wages", importance: "high", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.6, GOLD: 0.7, WTI: 0.2 },
    source: { provider: "BLS", series: "CES0500000003", transform: "mom_pct" },
    logic: "Faster wage growth is read as sticky inflation pressure; softer wages are dovish.",
  },
  {
    id: "claims", title: "Unemployment Claims", aliases: /^unemployment claims$/i, kind: "labor_weakness", importance: "medium", unit: "k", decimals: 0,
    typicalSurpriseSD: 12, relevance: { BTC: 0.4, GOLD: 0.5, WTI: 0.3 },
    source: { provider: "FRED", series: "ICSA", transform: "level" },
    logic: "Higher claims signal labor softening and lean dovish; the market usually needs a large miss to move.",
  },
  {
    id: "jolts", title: "JOLTS Job Openings", aliases: /^jolts job openings$/i, kind: "labor_strength", importance: "medium", unit: "m", decimals: 2,
    typicalSurpriseSD: 0.3, relevance: { BTC: 0.5, GOLD: 0.6, WTI: 0.2 },
    source: { provider: "BLS", series: "JTS000000000000000JOL", transform: "level_m" },
    logic: "Fewer openings mean cooling labor demand and a softer Fed path.",
  },
  {
    id: "adp", title: "ADP Non-Farm Employment Change", aliases: /^adp non-?farm employment change$/i, kind: "labor_strength", importance: "medium", unit: "k", decimals: 0,
    typicalSurpriseSD: 60, relevance: { BTC: 0.5, GOLD: 0.5, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "ADP previews payrolls; markets fade it unless the miss is large.",
  },
  {
    id: "gdp_qq", title: "GDP q/q", aliases: /^(advance|prelim|final) gdp q\/q$/i, kind: "growth", importance: "high", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.5, relevance: { BTC: 0.6, GOLD: 0.5, WTI: 0.6 },
    source: { provider: "FRED", series: "A191RL1Q225SBEA", transform: "level" },
    logic: "Stronger growth supports oil demand and risk appetite but can lift yields; weaker growth is dovish yet risk-negative.",
  },
  {
    id: "retail_mom", title: "Retail Sales m/m", aliases: /^retail sales m\/m$/i, kind: "growth", importance: "high", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.4, relevance: { BTC: 0.5, GOLD: 0.5, WTI: 0.5 },
    source: { provider: "FRED", series: "RSAFS", transform: "mom_pct" },
    logic: "Consumer strength supports growth and oil demand but reduces urgency for Fed easing.",
  },
  {
    id: "core_retail_mom", title: "Core Retail Sales m/m", aliases: /^core retail sales m\/m$/i, kind: "growth", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.4, relevance: { BTC: 0.4, GOLD: 0.4, WTI: 0.4 },
    source: { provider: "FRED", series: "RSFSXMV", transform: "mom_pct" },
    logic: "Ex-autos sales track underlying consumer demand.",
  },
  {
    id: "ism_mfg", title: "ISM Manufacturing PMI", aliases: /^ism manufacturing pmi$/i, kind: "growth", importance: "high", unit: "index", decimals: 1,
    typicalSurpriseSD: 1.5, relevance: { BTC: 0.5, GOLD: 0.5, WTI: 0.7 },
    source: { provider: "NONE" },
    logic: "Factory activity drives oil demand expectations; a strong print helps WTI and lifts yields.",
  },
  {
    id: "ism_svc", title: "ISM Services PMI", aliases: /^ism services pmi$/i, kind: "growth", importance: "high", unit: "index", decimals: 1,
    typicalSurpriseSD: 1.5, relevance: { BTC: 0.6, GOLD: 0.6, WTI: 0.5 },
    source: { provider: "NONE" },
    logic: "Services are most of the economy; the prices-paid component is read as an inflation signal.",
  },
  {
    id: "cb_confidence", title: "CB Consumer Confidence", aliases: /^cb consumer confidence$/i, kind: "sentiment", importance: "medium", unit: "index", decimals: 1,
    typicalSurpriseSD: 3, relevance: { BTC: 0.4, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Confidence shapes spending expectations; markets react mainly to large misses.",
  },
  {
    id: "uom_sentiment", title: "UoM Consumer Sentiment", aliases: /^(prelim|revised) uom consumer sentiment$/i, kind: "sentiment", importance: "medium", unit: "index", decimals: 1,
    typicalSurpriseSD: 2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Sentiment and its inflation-expectations component inform the Fed's reaction function.",
  },
  {
    id: "uom_infl_exp", title: "UoM Inflation Expectations", aliases: /^(prelim|revised) uom inflation expectations$/i, kind: "inflation", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.5, GOLD: 0.6, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Rising expectations keep the Fed cautious; falling expectations are dovish.",
  },
  {
    id: "fed_funds", title: "Federal Funds Rate", aliases: /^federal funds rate$/i, kind: "policy_rate", importance: "critical", unit: "pct", decimals: 2,
    typicalSurpriseSD: 0.125, relevance: { BTC: 1.0, GOLD: 1.0, WTI: 0.6 },
    source: { provider: "FRED", series: "DFEDTARU", transform: "level" },
    logic: "A cut or a dovish surprise lowers real yields and the dollar, supporting BTC and Gold; a hawkish hold or hike does the reverse.",
  },
  {
    id: "fomc_statement", title: "FOMC Statement", aliases: /^fomc statement$/i, kind: "fed_communication", importance: "critical", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 1.0, GOLD: 1.0, WTI: 0.5 },
    source: { provider: "NONE" },
    logic: "Guidance language moves the whole curve; the market reaction (2Y, DXY) is the signal, not a number.",
  },
  {
    id: "fomc_presser", title: "FOMC Press Conference", aliases: /^fomc press conference$/i, kind: "fed_communication", importance: "critical", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.9, GOLD: 0.9, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Powell's tone often reverses the statement reaction; watch 2Y yields and the dollar for the verdict.",
  },
  {
    id: "fomc_minutes", title: "FOMC Meeting Minutes", aliases: /^fomc meeting minutes$/i, kind: "fed_communication", importance: "high", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.7, GOLD: 0.7, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Minutes reveal how divided the committee is; hawkish detail lifts yields.",
  },
  {
    id: "fed_chair_speech", title: "Fed Chair Speech", aliases: /^fed chair(man|woman)? \S+ speaks$/i, kind: "fed_communication", importance: "high", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.8, GOLD: 0.8, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "The Chair sets the committee's tone; a scheduled speech with Q&A can reprice the next meeting. Read via 2Y and DXY.",
  },
  {
    id: "fed_speech", title: "Fed Speech", aliases: /fomc member .* speaks|^fed .* speaks$|beige book/i, kind: "fed_communication", importance: "medium", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.5, GOLD: 0.5, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Regional presidents and governors nudge rate pricing; voters matter more than non-voters.",
  },
  {
    id: "eia_crude", title: "EIA Crude Oil Inventories", aliases: /^crude oil inventories$|^eia weekly petroleum status report$/i, kind: "oil_inventory", importance: "high", unit: "mb", decimals: 1,
    typicalSurpriseSD: 3.0, relevance: { BTC: 0.1, GOLD: 0.2, WTI: 1.0 },
    source: {
      provider: "EIA", series: "WCESTUS1", transform: "weekly_change_mb",
      components: [
        { name: "cushing", series: "W_EPC0_SAX_YCUOK_MBBL", transform: "weekly_change_mb" },
        { name: "gasoline", series: "WGTSTUS1", transform: "weekly_change_mb" },
        { name: "distillate", series: "WDISTUS1", transform: "weekly_change_mb" },
        { name: "production", series: "WCRFPUS2", transform: "weekly_change_mb" },
        { name: "refineryUtil", series: "WPULEUS3", transform: "level" },
        { name: "imports", series: "WCEIMUS2", transform: "weekly_change_mb" },
      ],
    },
    logic: "A larger-than-expected crude draw signals tighter near-term supply and supports WTI; a build weighs on it, subject to products, Cushing and production details.",
  },
  {
    id: "api_crude", title: "API Weekly Crude Stocks", aliases: /^api weekly crude (oil )?stock|^api weekly statistical bulletin$/i, kind: "oil_inventory", importance: "medium", unit: "mb", decimals: 1,
    typicalSurpriseSD: 2.5, relevance: { BTC: 0.0, GOLD: 0.1, WTI: 0.7 },
    source: { provider: "NONE" },
    logic: "The API estimate previews EIA; a big draw primes a bullish Wednesday unless EIA contradicts it.",
  },
  {
    id: "baker_hughes", title: "Baker Hughes Rig Count", aliases: /^baker hughes (us )?(oil )?rig count$/i, kind: "oil_production", importance: "low", unit: "index", decimals: 0,
    typicalSurpriseSD: 3, relevance: { BTC: 0.0, GOLD: 0.0, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Rising rig counts point to future supply growth; a slow-moving input.",
  },
  {
    id: "natgas", title: "Natural Gas Storage", aliases: /^natural gas storage$/i, kind: "oil_product_inventory", importance: "low", unit: "index", decimals: 0,
    typicalSurpriseSD: 10, relevance: { BTC: 0.0, GOLD: 0.0, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "Mostly a gas-market event; marginal read-through to crude.",
  },
  {
    id: "treasury_auction", title: "Treasury Auction", aliases: /^(10|30)-y bond auction$/i, kind: "auction", importance: "medium", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.4, GOLD: 0.4, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "A weak auction (high tail) pushes long yields up and pressures Gold and BTC; strong demand does the opposite.",
  },
  {
    id: "durable_goods", title: "Durable Goods Orders m/m", aliases: /^durable goods orders m\/m$/i, kind: "growth", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 1.5, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Capital-goods demand informs the growth picture.",
  },
  {
    id: "empire_philly", title: "Regional Fed Manufacturing", aliases: /^(empire state|philly fed|richmond|dallas fed|kansas fed) manufacturing index$/i, kind: "growth", importance: "low", unit: "index", decimals: 1,
    typicalSurpriseSD: 6, relevance: { BTC: 0.2, GOLD: 0.2, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Regional surveys preview ISM.",
  },
  {
    id: "flash_pmi", title: "S&P Global Flash PMI", aliases: /^flash (manufacturing|services) pmi$/i, kind: "growth", importance: "medium", unit: "index", decimals: 1,
    typicalSurpriseSD: 1.2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Flash PMIs are the earliest monthly growth read.",
  },
  // ── Housing / real estate ─────────────────────────────────────────────────────────────────────────────────
  // Rate-sensitive activity data: strong housing reads as growth (and keeps the Fed patient); weak housing is the
  // first place higher rates bite, so a miss leans dovish and feeds recession talk. Price indices are shelter
  // inflation inputs and are typed as inflation. Relevance is kept >= 0.3 so the whole block shows on every ticker.
  {
    id: "housing_starts", title: "Housing Starts", aliases: /^housing starts$/i, kind: "housing", importance: "medium", unit: "m", decimals: 2,
    typicalSurpriseSD: 0.06, relevance: { BTC: 0.4, GOLD: 0.4, WTI: 0.3 },
    source: { provider: "FRED", series: "HOUST", transform: "level_m" },
    logic: "Starts are the most rate-sensitive activity gauge; a weak print says higher rates are biting and leans dovish, a strong print supports growth and nudges yields up.",
  },
  {
    id: "building_permits", title: "Building Permits", aliases: /^building permits$/i, kind: "housing", importance: "medium", unit: "m", decimals: 2,
    typicalSurpriseSD: 0.05, relevance: { BTC: 0.4, GOLD: 0.4, WTI: 0.3 },
    source: { provider: "FRED", series: "PERMIT", transform: "level_m" },
    logic: "Permits lead starts by one to two months; the forward-looking half of the Census housing report.",
  },
  {
    id: "existing_home_sales", title: "Existing Home Sales", aliases: /^existing home sales$/i, kind: "housing", importance: "medium", unit: "m", decimals: 2,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.4, GOLD: 0.4, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Roughly 90% of home sales; the cleanest read on whether mortgage rates are freezing demand. A miss leans dovish, a beat supports growth.",
  },
  {
    id: "new_home_sales", title: "New Home Sales", aliases: /^new home sales$/i, kind: "housing", importance: "medium", unit: "k", decimals: 0,
    typicalSurpriseSD: 40, relevance: { BTC: 0.4, GOLD: 0.4, WTI: 0.3 },
    source: { provider: "FRED", series: "HSN1F", transform: "level" },
    logic: "Builder sales are volatile and heavily revised, but they move first when rates change; markets react to large misses.",
  },
  {
    id: "pending_home_sales", title: "Pending Home Sales m/m", aliases: /^pending home sales m\/m$/i, kind: "housing", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 2.5, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Contract signings lead existing sales by one to two months.",
  },
  {
    id: "nahb", title: "NAHB Housing Market Index", aliases: /^nahb housing market index$/i, kind: "housing", importance: "medium", unit: "index", decimals: 0,
    typicalSurpriseSD: 2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Builder confidence is the earliest monthly housing read; sub-50 means more builders see conditions as poor.",
  },
  {
    id: "case_shiller", title: "S&P/Case-Shiller HPI y/y", aliases: /^s&p\/cs composite-20 hpi y\/y$/i, kind: "inflation", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.4, relevance: { BTC: 0.4, GOLD: 0.5, WTI: 0.2 },
    source: { provider: "FRED", series: "CSUSHPINSA", transform: "yoy_pct" },
    logic: "Home prices feed shelter inflation with a lag of roughly a year; hotter prices keep core CPI sticky and the Fed cautious.",
  },
  {
    id: "fhfa_hpi", title: "FHFA House Price Index m/m", aliases: /^hpi m\/m$/i, kind: "inflation", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.3, relevance: { BTC: 0.3, GOLD: 0.4, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Conforming-mortgage home prices; same shelter-inflation read as Case-Shiller, released the same morning.",
  },
  {
    id: "construction_spending", title: "Construction Spending m/m", aliases: /^construction spending m\/m$/i, kind: "housing", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.5, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "FRED", series: "TTLCONS", transform: "mom_pct" },
    logic: "Residential plus non-residential outlays; a GDP input that rarely moves markets on its own.",
  },
  {
    id: "mba_mortgage", title: "MBA Mortgage Applications", aliases: /^mba mortgage applications$/i, kind: "housing", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 4, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Weekly mortgage demand; the fastest read on how rate moves hit housing, but noisy week to week.",
  },

  // ── Inflation, second tier ───────────────────────────────────────────────────────────────────────────────
  {
    id: "core_cpi_yoy", title: "Core CPI y/y", aliases: /^core cpi y\/y$/i, kind: "inflation", importance: "high", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.8, GOLD: 0.9, WTI: 0.3 },
    source: { provider: "BLS", series: "CUUR0000SA0L1E", transform: "yoy_pct" },
    logic: "Annual core inflation is the number the Fed quotes; a cooler print eases the rate path and supports BTC and Gold.",
  },
  {
    id: "core_pce_yoy", title: "Core PCE Price Index y/y", aliases: /^core pce price index y\/y$/i, kind: "inflation", importance: "high", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.8, GOLD: 0.9, WTI: 0.3 },
    source: { provider: "FRED", series: "PCEPILFE", transform: "yoy_pct" },
    logic: "The Fed's 2% target is measured on this series; the gap to target sets the tone for cuts.",
  },
  {
    id: "pce_yoy", title: "PCE Price Index y/y", aliases: /^pce price index y\/y$/i, kind: "inflation", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.5, GOLD: 0.6, WTI: 0.3 },
    source: { provider: "FRED", series: "PCEPI", transform: "yoy_pct" },
    logic: "Headline PCE confirms the annual inflation trend.",
  },
  {
    id: "core_pce_qq", title: "Core PCE Prices q/q", aliases: /^core pce prices q\/q$/i, kind: "inflation", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.5, GOLD: 0.6, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Quarterly core PCE inside the GDP report; a hot print pre-empts the monthly number.",
  },
  {
    id: "gdp_price", title: "GDP Price Index q/q", aliases: /^gdp price index q\/q$/i, kind: "inflation", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.3, relevance: { BTC: 0.4, GOLD: 0.5, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Economy-wide price deflator released with GDP; markets fade it unless it diverges sharply from CPI.",
  },
  {
    id: "ppi_yoy", title: "PPI y/y", aliases: /^ppi y\/y$/i, kind: "inflation", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.3, relevance: { BTC: 0.4, GOLD: 0.5, WTI: 0.3 },
    source: { provider: "BLS", series: "WPSFD4", transform: "yoy_pct" },
    logic: "Annual producer prices; a pipeline read for consumer inflation.",
  },
  {
    id: "core_ppi_yoy", title: "Core PPI y/y", aliases: /^core ppi y\/y$/i, kind: "inflation", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.4, GOLD: 0.5, WTI: 0.2 },
    source: { provider: "BLS", series: "WPSFD49104", transform: "yoy_pct" },
    logic: "Annual core producer prices; feeds core PCE components.",
  },
  {
    id: "import_prices", title: "Import Prices m/m", aliases: /^import prices m\/m$/i, kind: "inflation", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.4, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Imported inflation; tariff pass-through shows up here first.",
  },
  {
    id: "ism_mfg_prices", title: "ISM Manufacturing Prices", aliases: /^ism manufacturing prices$/i, kind: "inflation", importance: "medium", unit: "index", decimals: 1,
    typicalSurpriseSD: 3, relevance: { BTC: 0.4, GOLD: 0.4, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Factory input prices; a jump is read as goods inflation returning.",
  },
  {
    id: "ism_svc_prices", title: "ISM Services Prices", aliases: /^ism services prices$/i, kind: "inflation", importance: "medium", unit: "index", decimals: 1,
    typicalSurpriseSD: 3, relevance: { BTC: 0.4, GOLD: 0.4, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Services prices paid; the stickiest part of inflation and the one the Fed watches in this survey.",
  },
  {
    id: "uom_5y_infl_exp", title: "UoM 5-year Inflation Expectations", aliases: /^(prelim|revised) uom 5-year inflation expectations$/i, kind: "inflation", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.4, GOLD: 0.5, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Long-run expectations are what the Fed means by 'anchored'; a drift higher is hawkish.",
  },
  // ── Labor, second tier ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "ahe_yoy", title: "Average Hourly Earnings y/y", aliases: /^average hourly earnings y\/y$/i, kind: "wages", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.5, GOLD: 0.6, WTI: 0.2 },
    source: { provider: "BLS", series: "CES0500000003", transform: "yoy_pct" },
    logic: "Annual wage growth; above 4% is read as inconsistent with 2% inflation.",
  },
  {
    id: "continuing_claims", title: "Continuing Jobless Claims", aliases: /^continuing jobless claims$/i, kind: "labor_weakness", importance: "low", unit: "m", decimals: 2,
    typicalSurpriseSD: 0.03, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "FRED", series: "CCSA", transform: "level_m" },
    logic: "Rising continuing claims mean the unemployed are not being rehired; a slow-building dovish signal.",
  },
  {
    id: "challenger", title: "Challenger Job Cuts", aliases: /^challenger job cuts y\/y$|^challenger job cuts$/i, kind: "labor_weakness", importance: "low", unit: "k", decimals: 0,
    typicalSurpriseSD: 30, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Announced layoffs; no consensus, so the read is versus the prior month.",
  },
  {
    id: "eci", title: "Employment Cost Index q/q", aliases: /^employment cost index q\/q$/i, kind: "wages", importance: "high", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.6, GOLD: 0.7, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "The Fed's preferred wage gauge; a hot quarterly print is a hawkish surprise.",
  },
  {
    id: "ulc", title: "Unit Labor Costs q/q", aliases: /^(prelim|revised) unit labor costs q\/q$/i, kind: "wages", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 1.5, relevance: { BTC: 0.4, GOLD: 0.5, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Labor cost per unit of output; rising costs squeeze margins and lean hawkish.",
  },
  {
    id: "productivity", title: "Nonfarm Productivity q/q", aliases: /^(prelim|revised) nonfarm productivity q\/q$/i, kind: "growth", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 1.0, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Higher productivity lets growth run without inflation; a quietly dovish surprise.",
  },
  {
    id: "nfp_benchmark", title: "Payrolls Benchmark Revision", aliases: /^nonfarm payrolls benchmark revision$/i, kind: "labor_weakness", importance: "low", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Annual rewrite of past payrolls; a large downward revision feeds the labor-weakness narrative.",
  },
  // ── Growth, second tier ──────────────────────────────────────────────────────────────────────────────────
  {
    id: "retail_control", title: "Retail Sales Control Group m/m", aliases: /^retail sales control group m\/m$/i, kind: "growth", importance: "high", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.4, relevance: { BTC: 0.5, GOLD: 0.5, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "The GDP input inside retail sales; the number economists actually revise forecasts on.",
  },
  {
    id: "personal_spending", title: "Personal Spending m/m", aliases: /^personal spending m\/m$/i, kind: "growth", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.4, GOLD: 0.4, WTI: 0.4 },
    source: { provider: "FRED", series: "PCE", transform: "mom_pct" },
    logic: "Consumer outlays released with PCE prices; strong spending keeps growth and oil demand firm.",
  },
  {
    id: "personal_income", title: "Personal Income m/m", aliases: /^personal income m\/m$/i, kind: "growth", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "FRED", series: "PI", transform: "mom_pct" },
    logic: "Income supports future spending; rarely market-moving on its own.",
  },
  {
    id: "industrial_production", title: "Industrial Production m/m", aliases: /^industrial production m\/m$/i, kind: "growth", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.4, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.6 },
    source: { provider: "FRED", series: "INDPRO", transform: "mom_pct" },
    logic: "Factory, mining and utility output; the most direct monthly read on energy demand.",
  },
  {
    id: "capacity_util", title: "Capacity Utilization Rate", aliases: /^capacity utilization rate$/i, kind: "growth", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.3, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "FRED", series: "TCU", transform: "level" },
    logic: "Slack in industry; high utilization is a late-cycle inflation signal.",
  },
  {
    id: "factory_orders", title: "Factory Orders m/m", aliases: /^factory orders m\/m$/i, kind: "growth", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 1.5, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "FRED", series: "AMTMNO", transform: "mom_pct" },
    logic: "Mostly known from durable goods; a confirmation print.",
  },
  {
    id: "core_durable", title: "Core Durable Goods Orders m/m", aliases: /^core durable goods orders m\/m$/i, kind: "growth", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.5, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Ex-transport orders strip out aircraft noise; the cleaner capex read.",
  },
  {
    id: "core_capex", title: "Core Capital Goods Orders m/m", aliases: /^core capital goods orders m\/m$/i, kind: "growth", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.6, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Nondefense ex-aircraft orders; the business investment input to GDP.",
  },
  {
    id: "chicago_pmi", title: "Chicago PMI", aliases: /^chicago pmi$/i, kind: "growth", importance: "medium", unit: "index", decimals: 1,
    typicalSurpriseSD: 3, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Released the day before ISM manufacturing and traded as its preview.",
  },
  {
    id: "composite_pmi", title: "S&P Global Composite PMI", aliases: /^(flash|final) composite pmi$/i, kind: "growth", importance: "low", unit: "index", decimals: 1,
    typicalSurpriseSD: 1.2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Blend of the manufacturing and services flash PMIs.",
  },
  {
    id: "cfnai", title: "Chicago Fed National Activity Index", aliases: /^chicago fed national activity index$/i, kind: "growth", importance: "low", unit: "index", decimals: 2,
    typicalSurpriseSD: 0.3, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "85-indicator composite; below -0.7 has historically flagged recession.",
  },
  {
    id: "vehicle_sales", title: "Total Vehicle Sales", aliases: /^total vehicle sales$/i, kind: "growth", importance: "low", unit: "m", decimals: 2,
    typicalSurpriseSD: 0.4, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Big-ticket consumer demand and a gasoline demand input.",
  },
  {
    id: "wholesale_inv", title: "Wholesale Inventories m/m", aliases: /^(prelim|final) wholesale inventories m\/m$/i, kind: "growth", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.3, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Inventory swings move GDP nowcasts; little direct market impact.",
  },
  {
    id: "business_inv", title: "Business Inventories m/m", aliases: /^business inventories m\/m$/i, kind: "growth", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "GDP nowcast input; rarely traded.",
  },
  {
    id: "nfib", title: "NFIB Small Business Index", aliases: /^nfib small business index$/i, kind: "sentiment", importance: "low", unit: "index", decimals: 1,
    typicalSurpriseSD: 1.5, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Small-business optimism and its hiring and price plans sub-indices.",
  },
  // ── Trade, fiscal, flows (informational) ─────────────────────────────────────────────────────────────────
  {
    id: "trade_balance", title: "Trade Balance", aliases: /^trade balance$/i, kind: "trade", importance: "low", unit: "b", decimals: 1,
    typicalSurpriseSD: 4, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "A narrower deficit adds to GDP; the dollar reaction is usually muted.",
  },
  {
    id: "goods_trade_balance", title: "Goods Trade Balance", aliases: /^goods trade balance$/i, kind: "trade", importance: "low", unit: "b", decimals: 1,
    typicalSurpriseSD: 5, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Advance goods deficit; moves GDP nowcasts.",
  },
  {
    id: "current_account", title: "Current Account", aliases: /^current account$/i, kind: "trade", importance: "low", unit: "b", decimals: 1,
    typicalSurpriseSD: 15, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Quarterly external balance; a structural dollar input, not a trade.",
  },
  {
    id: "budget", title: "Federal Budget Balance", aliases: /^federal budget balance$/i, kind: "fiscal", importance: "low", unit: "b", decimals: 0,
    typicalSurpriseSD: 30, relevance: { BTC: 0.3, GOLD: 0.4, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Monthly deficit; feeds the Treasury supply and debt narrative that supports Gold and BTC over time.",
  },
  {
    id: "tic_flows", title: "Net Long-Term TIC Flows", aliases: /^tic long-term purchases$/i, kind: "fiscal", importance: "low", unit: "b", decimals: 1,
    typicalSurpriseSD: 50, relevance: { BTC: 0.3, GOLD: 0.4, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Foreign demand for US securities; weak flows are a slow dollar negative.",
  },
  {
    id: "consumer_credit", title: "Consumer Credit m/m", aliases: /^consumer credit m\/m$/i, kind: "fiscal", importance: "low", unit: "b", decimals: 1,
    typicalSurpriseSD: 8, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Household borrowing; a stretched consumer shows up here before it shows in spending.",
  },
  {
    id: "fed_dot_median", title: "FOMC Median Dot (current year)", aliases: /^fomc median dot/i, kind: "policy_rate", importance: "high", unit: "pct", decimals: 2,
    typicalSurpriseSD: 0.125, relevance: { BTC: 0.9, GOLD: 0.9, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "The median year-end funds rate projection; no consensus is published, so it is judged against the prior SEP. A higher median is hawkish.",
  },
  {
    id: "pce_qq", title: "PCE Prices q/q", aliases: /^pce prices q\/q$/i, kind: "inflation", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.3, GOLD: 0.4, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Quarterly headline PCE inside the GDP report; usually already implied by the monthly prints.",
  },
  {
    id: "uom_expectations", title: "UoM Consumer Expectations", aliases: /^(prelim|revised) uom consumer expectations$/i, kind: "sentiment", importance: "low", unit: "index", decimals: 1,
    typicalSurpriseSD: 2.5, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "The forward-looking half of the Michigan survey; moves with the headline.",
  },
  {
    id: "participation", title: "Labor Force Participation Rate", aliases: /^labor force participation rate$/i, kind: "labor_strength", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "FRED", series: "CIVPART", transform: "level" },
    logic: "Rising participation explains a higher jobless rate without weakness; read with the unemployment rate on jobs day.",
  },
  {
    id: "u6", title: "U6 Underemployment Rate", aliases: /^u6 underemployment rate$/i, kind: "labor_weakness", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "FRED", series: "U6RATE", transform: "level" },
    logic: "Broad slack including discouraged and part-time-for-economic-reasons workers; confirms or contradicts the headline rate.",
  },
  // ── Fed communications, remaining ────────────────────────────────────────────────────────────────────────
  {
    id: "fomc_projections", title: "FOMC Economic Projections (dot plot)", aliases: /^fomc economic projections$/i, kind: "fed_communication", importance: "critical", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 1.0, GOLD: 1.0, WTI: 0.5 },
    source: { provider: "NONE" },
    logic: "The dot plot resets the whole cut path; the median dot versus market pricing is the surprise.",
  },
  {
    id: "fed_testimony", title: "Fed Chair Testimony", aliases: /^fed chair .* testifies$|^fed monetary policy report$/i, kind: "fed_communication", importance: "high", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.8, GOLD: 0.8, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Semi-annual testimony; two days of Q&A can move the curve more than a speech.",
  },
  {
    id: "jackson_hole", title: "Jackson Hole Symposium", aliases: /^jackson hole symposium$/i, kind: "fed_communication", importance: "high", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.8, GOLD: 0.8, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "The Chair's August speech has historically been used to signal policy turns.",
  },
  {
    id: "sloos", title: "Fed Loan Officer Survey", aliases: /^senior loan officer survey$/i, kind: "fed_communication", importance: "low", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Tightening lending standards lead credit contraction; a slow-moving growth input.",
  },
  // ── Energy, remaining weekly lines ───────────────────────────────────────────────────────────────────────
  {
    id: "eia_gasoline", title: "EIA Gasoline Inventories", aliases: /^gasoline inventories$/i, kind: "oil_product_inventory", importance: "low", unit: "mb", decimals: 1,
    typicalSurpriseSD: 1.5, relevance: { BTC: 0.0, GOLD: 0.0, WTI: 0.5 },
    source: { provider: "EIA", series: "WGTSTUS1", transform: "weekly_change_mb" },
    logic: "A gasoline draw signals demand; builds into driving season weigh on crude.",
  },
  {
    id: "eia_distillate", title: "EIA Distillate Inventories", aliases: /^distillate inventories$/i, kind: "oil_product_inventory", importance: "low", unit: "mb", decimals: 1,
    typicalSurpriseSD: 1.5, relevance: { BTC: 0.0, GOLD: 0.0, WTI: 0.5 },
    source: { provider: "EIA", series: "WDISTUS1", transform: "weekly_change_mb" },
    logic: "Diesel and heating oil; tight distillate stocks support crude via refinery pull.",
  },
  // ── Positioning (CFTC, weekly) ───────────────────────────────────────────────────────────────────────────
  {
    id: "cftc_gold", title: "CFTC Gold Net Positions", aliases: /^cftc gold speculative net positions$/i, kind: "positioning", importance: "low", unit: "k", decimals: 1,
    typicalSurpriseSD: 15, relevance: { BTC: 0.0, GOLD: 0.6, WTI: 0.0 },
    source: { provider: "NONE" },
    logic: "Speculative net longs; crowded longs raise the risk of a washout, not a direction call.",
  },
  {
    id: "cftc_oil", title: "CFTC Crude Oil Net Positions", aliases: /^cftc crude oil speculative net positions$/i, kind: "positioning", importance: "low", unit: "k", decimals: 1,
    typicalSurpriseSD: 20, relevance: { BTC: 0.0, GOLD: 0.0, WTI: 0.6 },
    source: { provider: "NONE" },
    logic: "Managed-money crude positioning; extremes mark squeeze risk.",
  },
  {
    id: "cftc_spx", title: "CFTC S&P 500 Net Positions", aliases: /^cftc s&p 500 speculative net positions$/i, kind: "positioning", importance: "low", unit: "k", decimals: 1,
    typicalSurpriseSD: 30, relevance: { BTC: 0.4, GOLD: 0.0, WTI: 0.0 },
    source: { provider: "NONE" },
    logic: "Equity positioning is a risk-appetite read for BTC.",
  },
  // ── Treasury auctions, short end ─────────────────────────────────────────────────────────────────────────
  {
    id: "treasury_auction_short", title: "Treasury Auction (2y-7y, 20y, TIPS)", aliases: /^(2|3|5|7|20)-y (note|bond) auction$|^(5|10|30)-y tips auction$/i, kind: "auction", importance: "low", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "Front-end and belly demand; a tail matters most around FOMC repricing.",
  },
  // ── Market structure and political dates ─────────────────────────────────────────────────────────────────
  {
    id: "opex_monthly", title: "Monthly Options Expiry", aliases: /^monthly options expiry$/i, kind: "market_event", importance: "medium", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.5, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Dealer hedging pins price into expiry and releases it after; expect range into the print and expansion after.",
  },
  {
    id: "opex_quad", title: "Quad Witching", aliases: /^quad witching/i, kind: "market_event", importance: "high", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.6, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Quarterly index, futures and options expiry; the largest hedging unwind of the quarter.",
  },
  {
    id: "btc_opex", title: "BTC Options Expiry (Deribit monthly)", aliases: /^btc options expiry/i, kind: "market_event", importance: "medium", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.8, GOLD: 0.0, WTI: 0.0 },
    source: { provider: "NONE" },
    logic: "Month-end Deribit expiry at 08:00 UTC; max pain acts as a magnet into it and volatility often expands after.",
  },
  {
    id: "us_election", title: "US Election", aliases: /^us (midterm|presidential) election/i, kind: "market_event", importance: "critical", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.8, GOLD: 0.7, WTI: 0.5 },
    source: { provider: "NONE" },
    logic: "Policy-regime event; the market trades the fiscal and regulatory implications overnight.",
  },
  // ── Oil policy and agency reports (text events; no feed publishes a number) ─────────────────────────────
  {
    id: "opec_meeting", title: "OPEC+ Meeting", aliases: /^opec(\+|-jmmc)? meetings?$/i, kind: "market_event", importance: "high", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.1, GOLD: 0.2, WTI: 1.0 },
    source: { provider: "NONE" },
    logic: "Quota decisions set the supply path for months; an unexpected cut is bullish WTI, an unwind of voluntary cuts is bearish. Read from the WTI reaction.",
  },
  {
    id: "oil_agency_report", title: "Oil Market Report (EIA STEO / IEA OMR / OPEC MOMR)", aliases: /^(eia short-term energy outlook|iea (monthly )?oil market report|opec monthly oil market report)$/i, kind: "market_event", importance: "medium", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.0, GOLD: 0.1, WTI: 0.7 },
    source: { provider: "NONE" },
    logic: "Monthly demand and supply balance revisions; a demand downgrade or supply upgrade weighs on crude.",
  },
  // ── Foreign central banks ─────────────────────────────────────────────────────────────────────────────────
  // Convention: + surprise = more hawkish abroad = weaker dollar = mild support for BTC and Gold.
  {
    id: "ecb_rate", title: "ECB Rate Decision", aliases: /^main refinancing rate$/i, kind: "foreign_cb", importance: "high", unit: "pct", decimals: 2,
    typicalSurpriseSD: 0.125, relevance: { BTC: 0.5, GOLD: 0.5, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "ECB policy sets EUR, the largest DXY weight; a hawkish surprise weakens the dollar and helps Gold.",
  },
  {
    id: "ecb_deposit", title: "ECB Deposit Facility Rate", aliases: /^ecb deposit facility rate$/i, kind: "foreign_cb", importance: "medium", unit: "pct", decimals: 2,
    typicalSurpriseSD: 0.125, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "The ECB's operative rate; same read as the main refinancing rate.",
  },
  {
    id: "ecb_statement", title: "ECB Policy Statement", aliases: /^ecb monetary policy statement$/i, kind: "foreign_cb", importance: "medium", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Guidance language for the euro; watch EUR/USD for the verdict.",
  },
  {
    id: "ecb_presser", title: "ECB Press Conference", aliases: /^ecb press conference$/i, kind: "foreign_cb", importance: "medium", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Lagarde's tone often moves EUR more than the decision.",
  },
  {
    id: "ecb_minutes", title: "ECB Meeting Accounts", aliases: /^ecb monetary policy meeting accounts$/i, kind: "foreign_cb", importance: "low", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "Minutes of the prior ECB meeting.",
  },
  {
    id: "ecb_speech", title: "ECB President Speech", aliases: /^ecb president .* speaks$/i, kind: "foreign_cb", importance: "low", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "Frequent; only matters when it shifts the next-meeting odds.",
  },
  {
    id: "eu_hicp_yoy", title: "Eurozone HICP y/y", aliases: /^cpi flash estimate y\/y$|^final cpi y\/y$/i, kind: "foreign_cb", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.3, GOLD: 0.4, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Eurozone inflation drives ECB expectations and the euro; hotter is dollar-negative at the margin.",
  },
  {
    id: "eu_core_hicp_yoy", title: "Eurozone Core HICP y/y", aliases: /^core cpi flash estimate y\/y$|^final core cpi y\/y$/i, kind: "foreign_cb", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Core Eurozone inflation; the ECB's focus series.",
  },
  {
    id: "eu_gdp_qq", title: "Eurozone GDP q/q", aliases: /^(prelim|flash|revised) flash gdp q\/q$/i, kind: "foreign_cb", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Euro-area growth; weak growth keeps the ECB easing and the dollar bid.",
  },
  {
    id: "eu_pmi", title: "Eurozone HCOB PMI", aliases: /^(flash|final) (manufacturing|services|composite) pmi$/i, kind: "foreign_cb", importance: "low", unit: "index", decimals: 1,
    typicalSurpriseSD: 1.2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Earliest monthly read on European demand; an oil-demand input.",
  },
  {
    id: "de_hicp_yoy", title: "Germany HICP y/y", aliases: /^german (prelim|final) cpi m\/m$/i, kind: "foreign_cb", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "Leads the Eurozone flash by a day.",
  },
  {
    id: "de_pmi", title: "Germany Manufacturing PMI", aliases: /^german (flash|final) manufacturing pmi$/i, kind: "foreign_cb", importance: "low", unit: "index", decimals: 1,
    typicalSurpriseSD: 1.2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Europe's industrial core; an oil-demand and global-growth read.",
  },
  {
    id: "boe_rate", title: "BoE Rate Decision", aliases: /^official bank rate$/i, kind: "foreign_cb", importance: "high", unit: "pct", decimals: 2,
    typicalSurpriseSD: 0.125, relevance: { BTC: 0.4, GOLD: 0.4, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Sterling is the third DXY weight; hawkish BoE is dollar-negative.",
  },
  {
    id: "boe_statement", title: "BoE Minutes / Policy Report", aliases: /^mpc official bank rate votes$|^monetary policy (summary|report)$/i, kind: "foreign_cb", importance: "medium", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "Vote split and guidance for sterling.",
  },
  {
    id: "boe_speech", title: "BoE Governor Speech", aliases: /^boe gov .* speaks$/i, kind: "foreign_cb", importance: "low", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "Frequent; matters when it shifts BoE odds.",
  },
  {
    id: "uk_cpi_yoy", title: "UK CPI y/y", aliases: /^uk cpi y\/y$/i, kind: "foreign_cb", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "UK inflation drives BoE expectations and sterling.",
  },
  {
    id: "uk_core_cpi_yoy", title: "UK Core CPI y/y", aliases: /^uk core cpi y\/y$/i, kind: "foreign_cb", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "Core UK inflation.",
  },
  {
    id: "uk_gdp_qq", title: "UK GDP q/q", aliases: /^uk (prelim|final) gdp q\/q$/i, kind: "foreign_cb", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "UK growth; sterling input.",
  },
  {
    id: "uk_pmi", title: "UK S&P Global PMI", aliases: /^uk (flash|final) (manufacturing|services|composite) pmi$/i, kind: "foreign_cb", importance: "low", unit: "index", decimals: 1,
    typicalSurpriseSD: 1.2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "UK activity read.",
  },
  {
    id: "boj_rate", title: "BoJ Rate Decision", aliases: /^boj policy rate$/i, kind: "foreign_cb", importance: "critical", unit: "pct", decimals: 2,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.7, GOLD: 0.5, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Yen funds the global carry trade; a hawkish BoJ surprise unwinds leverage and hits BTC first (Aug 2024).",
  },
  {
    id: "boj_statement", title: "BoJ Policy Statement", aliases: /^monetary policy statement$|^boj outlook report$/i, kind: "foreign_cb", importance: "high", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.5, GOLD: 0.4, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Guidance on hikes and JGB purchases; watch USD/JPY.",
  },
  {
    id: "boj_presser", title: "BoJ Press Conference", aliases: /^boj press conference$/i, kind: "foreign_cb", importance: "high", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.5, GOLD: 0.4, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Ueda's tone sets the yen's direction for the session.",
  },
  {
    id: "boj_speech", title: "BoJ Governor Speech", aliases: /^boj gov .* speaks$/i, kind: "foreign_cb", importance: "low", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "Frequent; matters when it shifts BoJ hike odds.",
  },
  {
    id: "tokyo_cpi_yoy", title: "Tokyo CPI y/y", aliases: /^tokyo core cpi y\/y$/i, kind: "foreign_cb", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "Leads national Japanese CPI by three weeks; a BoJ input.",
  },
  {
    id: "jp_gdp_qq", title: "Japan GDP q/q", aliases: /^(prelim|final) gdp q\/q$/i, kind: "foreign_cb", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.3, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Japanese growth; BoJ normalization input.",
  },
  {
    id: "tankan", title: "Tankan Large Manufacturers", aliases: /^tankan manufacturing index$/i, kind: "foreign_cb", importance: "low", unit: "index", decimals: 0,
    typicalSurpriseSD: 2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Quarterly BoJ business survey.",
  },
  {
    id: "boc_rate", title: "BoC Rate Decision", aliases: /^boc rate statement$|^overnight rate$/i, kind: "foreign_cb", importance: "medium", unit: "pct", decimals: 2,
    typicalSurpriseSD: 0.125, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Canada is a major crude exporter; BoC and CAD feed into WTI's currency leg.",
  },
  {
    id: "ca_cpi_yoy", title: "Canada CPI y/y", aliases: /^canada cpi y\/y$/i, kind: "foreign_cb", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Canadian inflation; BoC input.",
  },
  {
    id: "snb_rate", title: "SNB Rate Decision", aliases: /^snb policy rate$/i, kind: "foreign_cb", importance: "medium", unit: "pct", decimals: 2,
    typicalSurpriseSD: 0.125, relevance: { BTC: 0.3, GOLD: 0.4, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "Franc is a safe-haven peer of Gold; SNB surprises move both.",
  },
  {
    id: "rba_rate", title: "RBA Rate Decision", aliases: /^rba cash rate$/i, kind: "foreign_cb", importance: "medium", unit: "pct", decimals: 2,
    typicalSurpriseSD: 0.125, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "AUD is the commodity-currency bellwether; RBA surprises read through to risk appetite.",
  },
  {
    id: "au_cpi_yoy", title: "Australia CPI y/y", aliases: /^australia cpi y\/y$/i, kind: "foreign_cb", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "Australian inflation; RBA input.",
  },
  // ── China (demand side of oil and global growth) ─────────────────────────────────────────────────────────
  {
    id: "cn_gdp_yoy", title: "China GDP y/y", aliases: /^china gdp q\/y$/i, kind: "growth", importance: "high", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.3, relevance: { BTC: 0.4, GOLD: 0.4, WTI: 0.7 },
    source: { provider: "NONE" },
    logic: "China is the marginal buyer of crude and metals; a growth beat lifts WTI and commodity-linked risk.",
  },
  {
    id: "cn_cpi_yoy", title: "China CPI y/y", aliases: /^china cpi y\/y$/i, kind: "growth", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.2, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Chinese deflation is a global demand warning; a firmer print is read as demand stabilising.",
  },
  {
    id: "cn_ip_yoy", title: "China Industrial Production y/y", aliases: /^china industrial production y\/y$/i, kind: "growth", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.5, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.6 },
    source: { provider: "NONE" },
    logic: "Chinese factory output is the single best monthly proxy for crude import demand.",
  },
  {
    id: "cn_retail_yoy", title: "China Retail Sales y/y", aliases: /^china retail sales y\/y$/i, kind: "growth", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.8, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Chinese consumer demand; stimulus effectiveness read.",
  },
  {
    id: "cn_nbs_pmi", title: "China NBS Manufacturing PMI", aliases: /^china manufacturing pmi$/i, kind: "growth", importance: "high", unit: "index", decimals: 1,
    typicalSurpriseSD: 0.5, relevance: { BTC: 0.4, GOLD: 0.3, WTI: 0.6 },
    source: { provider: "NONE" },
    logic: "Official PMI, large state firms; above 50 is expansion and supports oil and base metals.",
  },
  {
    id: "cn_nbs_services_pmi", title: "China NBS Non-Manufacturing PMI", aliases: /^china non-manufacturing pmi$/i, kind: "growth", importance: "low", unit: "index", decimals: 1,
    typicalSurpriseSD: 0.6, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Official services and construction PMI.",
  },
  {
    id: "cn_caixin_pmi", title: "China Caixin/RatingDog Manufacturing PMI", aliases: /^caixin manufacturing pmi$|^ratingdog manufacturing pmi$/i, kind: "growth", importance: "medium", unit: "index", decimals: 1,
    typicalSurpriseSD: 0.6, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.5 },
    source: { provider: "NONE" },
    logic: "Private-sector PMI, smaller exporters; often diverges from the official print.",
  },
  {
    id: "cn_caixin_services_pmi", title: "China Caixin/RatingDog Services PMI", aliases: /^caixin services pmi$|^ratingdog services pmi$/i, kind: "growth", importance: "low", unit: "index", decimals: 1,
    typicalSurpriseSD: 0.8, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Private services PMI.",
  },
  {
    id: "pboc_lpr", title: "PBoC Loan Prime Rate", aliases: /^(1|5)-y loan prime rate$/i, kind: "foreign_cb", importance: "medium", unit: "pct", decimals: 2,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "A surprise cut is Chinese stimulus and supports crude and commodity-linked risk; a hold when a cut was expected disappoints. Typed as a foreign rate so a lower print reads dovish.",
  },
  {
    id: "cn_trade", title: "China Trade Balance (USD)", aliases: /^china trade balance$/i, kind: "trade", importance: "medium", unit: "b", decimals: 1,
    typicalSurpriseSD: 10, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.5 },
    source: { provider: "NONE" },
    logic: "Chinese export strength and import demand; crude imports are inside the import line.",
  },
  {
    id: "cn_exports_yoy", title: "China Exports y/y", aliases: /^china exports y\/y$/i, kind: "growth", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 3, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Global goods demand as seen from the world's factory.",
  },
  {
    id: "cn_imports_yoy", title: "China Imports y/y", aliases: /^china imports y\/y$/i, kind: "growth", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 3, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.5 },
    source: { provider: "NONE" },
    logic: "Chinese import demand; the most direct monthly commodity-demand read.",
  },
  {
    id: "cn_ppi_yoy", title: "China PPI y/y", aliases: /^china ppi y\/y$/i, kind: "growth", importance: "low", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.3, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Factory-gate deflation in China is a global disinflation and weak-demand signal.",
  },
  {
    id: "de_ifo", title: "Germany Ifo Business Climate", aliases: /^german ifo business climate$/i, kind: "foreign_cb", importance: "low", unit: "index", decimals: 1,
    typicalSurpriseSD: 1, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Germany's benchmark business survey; a Europe growth read.",
  },
  {
    id: "de_zew", title: "Germany ZEW Economic Sentiment", aliases: /^german zew economic sentiment$/i, kind: "foreign_cb", importance: "low", unit: "index", decimals: 1,
    typicalSurpriseSD: 6, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.3 },
    source: { provider: "NONE" },
    logic: "Financial-analyst expectations for Germany; an early-month Europe sentiment read.",
  },
  {
    id: "jp_cpi_yoy", title: "Japan National CPI ex Fresh Food y/y", aliases: /^national core cpi y\/y$/i, kind: "foreign_cb", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.1 },
    source: { provider: "NONE" },
    logic: "The BoJ's core series; above 2% sustains the hike path and the yen.",
  },
];

export function matchEventDef(title: string): MacroEventDef | null {
  const t = title.trim();
  return EVENT_DEFS.find((d) => d.aliases.test(t)) ?? null;
}

// Parse Fair Economy strings like "2.8%", "185K", "7.56M", "-2.1M", "<4.50%", "55.1" into the def's display unit.
export function parseValue(raw: string | null | undefined, unit: Unit): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.replace(/[<>~,%\s]/g, "").match(/^(-?\d+(?:\.\d+)?)([KMB])?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const suffix = (m[2] ?? "").toUpperCase();
  if (!Number.isFinite(n)) return null;
  if (unit === "k") return suffix === "M" ? n * 1000 : suffix === "B" ? n * 1e6 : n;
  if (unit === "m") return suffix === "K" ? n / 1000 : suffix === "B" ? n * 1000 : n;
  if (unit === "mb") return suffix === "K" ? n / 1000 : n;
  if (unit === "b") return suffix === "K" ? n / 1e6 : suffix === "M" ? n / 1000 : n;
  return n;
}

export function formatValue(v: number | null, unit: Unit, decimals: number): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const d = v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (unit === "pct" || unit === "rate") return `${d}%`;
  if (unit === "k") return `${d}K`;
  if (unit === "m") return `${d}M`;
  if (unit === "mb") return `${v >= 0 ? "+" : ""}${d}M bbl`;
  if (unit === "b") return v < 0 ? `-$${d.replace("-", "")}B` : `$${d}B`;
  return d;
}
