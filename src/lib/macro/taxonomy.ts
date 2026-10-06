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
    typicalSurpriseSD: 0.1, relevance: { BTC: 1.0, GOLD: 1.0, WTI: 0.3 },
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
    typicalSurpriseSD: 0.3, relevance: { BTC: 0.6, GOLD: 0.7, WTI: 0.4 },
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
    typicalSurpriseSD: 0.1, relevance: { BTC: 0.9, GOLD: 1.0, WTI: 0.3 },
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
    typicalSurpriseSD: 75, relevance: { BTC: 0.9, GOLD: 0.9, WTI: 0.5 },
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
    id: "fed_speech", title: "Fed Speech", aliases: /fed chair powell speaks|fomc member .* speaks|^fed .* speaks$|fed monetary policy report|beige book/i, kind: "fed_communication", importance: "medium", unit: "text", decimals: 0,
    typicalSurpriseSD: null, relevance: { BTC: 0.5, GOLD: 0.5, WTI: 0.2 },
    source: { provider: "NONE" },
    logic: "Fed speakers nudge rate pricing; Powell matters most.",
  },
  {
    id: "eia_crude", title: "EIA Crude Oil Inventories", aliases: /^crude oil inventories$|^eia weekly petroleum status report$/i, kind: "oil_inventory", importance: "high", unit: "mb", decimals: 1,
    typicalSurpriseSD: 2.5, relevance: { BTC: 0.1, GOLD: 0.2, WTI: 1.0 },
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
    id: "durable_goods", title: "Durable Goods Orders m/m", aliases: /^(core )?durable goods orders m\/m$/i, kind: "growth", importance: "medium", unit: "pct", decimals: 1,
    typicalSurpriseSD: 1.5, relevance: { BTC: 0.3, GOLD: 0.3, WTI: 0.4 },
    source: { provider: "NONE" },
    logic: "Capital-goods demand informs the growth picture.",
  },
  {
    id: "empire_philly", title: "Regional Fed Manufacturing", aliases: /^(empire state|philly fed|richmond) manufacturing index$/i, kind: "growth", importance: "low", unit: "index", decimals: 1,
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
  return n;
}

export function formatValue(v: number | null, unit: Unit, decimals: number): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const d = v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (unit === "pct" || unit === "rate") return `${d}%`;
  if (unit === "k") return `${d}K`;
  if (unit === "m") return `${d}M`;
  if (unit === "mb") return `${v >= 0 ? "+" : ""}${d}M bbl`;
  return d;
}
