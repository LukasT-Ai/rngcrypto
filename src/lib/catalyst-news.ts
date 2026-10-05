// Config-driven headline/catalyst engine. One code path, per-asset vocab and feeds.

export type CatalystAsset = "OIL" | "BTC" | "GOLD" | "ADA";
export type Sentiment = "bullish" | "bearish" | "neutral";
export type Impact = "high" | "medium" | "low";

export interface CatalystEvent {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  category: string;
  sentiment: Sentiment;
  impact: Impact;
  score: number;
  priceReaction: { eventPrice: number; sinceEventPct: number; confirms: boolean | null } | null;
}

export interface CatalystForce {
  category: string;
  count: number;
  avgScore: number;
  avgReactionPct: number | null;
  topHeadline: string;
}

export interface CatalystVerdict {
  bullForce: CatalystForce | null;
  bearForce: CatalystForce | null;
  netLean: Sentiment;
  priceFollowing: string | null;
  summary: string;
  flipCondition: string;
}

export interface CatalystResult {
  asset: CatalystAsset;
  assetName: string;
  panelTitle: string;
  score: number;
  label: string;
  eventCount: number;
  events: CatalystEvent[];
  lastUpdated: string;
  categoryBreakdown: { category: string; count: number; scoredCount: number; avgScore: number; avgReactionPct: number | null }[];
  priceContext: { current: number; change24h: number; changePct24h: number; weekHigh: number; weekLow: number } | null;
  verdict: CatalystVerdict | null;
  sourcesUsed: string[];
  triggers: { bull: Record<string, string>; bear: Record<string, string> };
}

interface CategoryRule {
  category: string;
  keywords: RegExp;
  bullish: RegExp;
  bearish: RegExp;
  baseImpact: Impact;
  needsAsset?: boolean;
}

interface AssetConfig {
  assetName: string;
  panelTitle: string;
  strikeSymbol: string;
  assetRe: RegExp;
  feeds: { url: string; name: string }[];
  rules: CategoryRule[];
  flip: Record<string, { bull: string; bear: string }>;
  triggers: { bull: Record<string, string>; bear: Record<string, string> };
  gdeltQuery: string | null;
}

const CACHE_TTL = 2 * 60 * 1000;
const UA = { "User-Agent": "RNGcrypto/1.0 (Catalyst Engine)" };
const caches = new Map<CatalystAsset, { data: CatalystResult; timestamp: number }>();

const gnq = (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const PRICE_UP = /\b(jump|surge|soar|rall(y|ies)|climb|ris(e|es|ing)|gain|extend|firm|higher|rebound|spike|breakout|record\s*high|all-?time\s*high|multi-\w+\s*high)\w*/i;
const PRICE_DOWN = /\b(fall|drop|plung|tumbl|slump|retreat|slide|lower|eas(e|es|ing)|pressur|dip|sink|weak|sell-?off|crash|correct)\w*/i;

const MAGNITUDE_WORDS =
  /\b(clos(ed|ure)|shut\s*down|halt|100\s*million|billion|record|major|massive|largest|unprecedented|emergency|blockade|war|explosion|destroy|crisis|shock|collapse|severe|historic|all-?time)\b/gi;

const HIGH_CRED =
  /reuters|bloomberg|oilprice|energynow|financial\s*times|\bft\b|wall\s*street|wsj|cnbc|s&p\s*global|platts|argus|rigzone|eia\.gov|iea\.org|business\s*standard|al\s*jazeera|associated\s*press|\bap\b|the\s*guardian|nikkei|coindesk|the\s*block|cointelegraph|decrypt|kitco|mining\.com|world\s*gold\s*council|barron|marketwatch|yahoo\s*finance|investing\.com|fxstreet|forbes/i;
const LOW_CRED =
  /daily\s*mail|inkl|newswav|biggo|urbanacres|business\s*upturn|ticker\s*news|psuindia|quantum\s*commodity|invezz|fxempire|briefs\.co|coinpedia|cryptopolitan|ambcrypto|newsbtc|u\.today|crypto\s*daily|coingape|bitcoinist|analytics\s*insight|watcher\.guru|timestabloid|zycrypto|thecryptobasic|cryptonews\.com|finbold/i;
const NOISE = /facebook\.com|moomoo|twitter\.com|\bx\.com|reddit|youtube|tiktok|medium\.com|binance\.com\/square|price\s*prediction|how\s*to\s*buy|sponsored|press\s*release|prnewswire|globenewswire|accesswire/i;

const IMPACT_MULT: Record<Impact, number> = { high: 1.5, medium: 1.0, low: 0.6 };
const IMPACT_RANK: Record<Impact, number> = { high: 3, medium: 2, low: 1 };

// ── Asset configs ───────────────────────────────────────────────────────────

const OIL: AssetConfig = {
  assetName: "WTI Crude",
  panelTitle: "Geopolitical Catalysts",
  strikeSymbol: "WTI-USD",
  assetRe: /\b(crude|oil|brent|wti|petroleum|opec|barrel|diesel|refiner|tanker|hormuz|aramco)\b/i,
  gdeltQuery:
    '(crude oil OR OPEC OR brent OR WTI OR "strait of hormuz" OR "oil reserves" OR aramco OR kharg OR "tanker attack" OR "oil price" OR houthi OR "strategic petroleum" OR "diesel release" OR "G7 oil") sourcelang:eng',
  feeds: [
    { url: "https://oilprice.com/rss/main", name: "OilPrice.com" },
    { url: gnq('WTI OR "crude oil" when:2d'), name: "Google News" },
    { url: gnq("(OPEC OR OPEC+) oil when:3d"), name: "Google News" },
    { url: gnq("(Hormuz OR tanker OR Aramco OR Houthi OR Iran) oil when:2d"), name: "Google News" },
    { url: gnq('("strategic reserve" OR SPR OR G7 OR IEA) oil release when:3d'), name: "Google News" },
    { url: gnq("(sanctions OR embargo) (oil OR crude) when:3d"), name: "Google News" },
    { url: gnq('(EIA OR "crude inventories" OR "rig count") when:3d'), name: "Google News" },
  ],
  rules: [
    {
      category: "CONFLICT",
      keywords:
        /\b(middle\s*east|strait\s*of\s*hormuz|hormuz|red\s*sea|houthi|yemen|iran|iraq|libya|israel|kharg|aramco|south\s*pars|riyadh|saudi|tanker|warship|(u\.?s\.?|us)[\s-]+iran|iran[\s-]+(u\.?s\.?|us)|camp\s*david|gulf\s*(war|attack|tension|strike|waters)|oman.{0,20}(tanker|ship|vessel)|troops?.{0,20}(deploy|middle\s*east|gulf)|bomber)\b/i,
      bullish:
        /\b(attack|strike|struck|hit|bomb|missile|drone|escalat|threat|blockad|clos(e|ed|ure|ing)|shut|disrupt|destroy|seiz|war|tension|military|deploy|retaliat|target|damage|shoot|intercept|explod|fire|vow|demand|ultimatum)\w*/i,
      bearish:
        /\b(ceasefire|truce|peace|de-?escalat|diplomac|negotiat|talks?|calm|resolv|withdraw|reopen|resum|recover|restor|eas(e|ing)|lift|agree|deal|losing\s*leverage)\w*/i,
      baseImpact: "high",
    },
    {
      category: "RESERVES",
      keywords:
        /\b(strategic\s*(petroleum|oil)\s*reserve|\bspr\b|emergency\s*(oil|fuel|diesel|crude)?\s*(reserve|stock|release)|(reserve|stock|stockpile|diesel|crude|oil)\s*release|release.{0,25}(reserve|stockpile|barrel)|iea.{0,25}(reserve|release|emergency|stock)|g7.{0,25}(oil|reserve|barrel|release|diesel)|(eu|europe|european|brussels).{0,25}(reserve|diesel|stock|release)|100\s*million\s*barrel|million[\s-]*barrel\s*release)\b/i,
      bullish: /\b(fill|refill|halt|pause|stop|rebuild|replenish|buy|woes|shortage|squeeze|crunch|tight|cannot\s*guarantee|buy\s*time|not\s*enough|insufficient)\w*/i,
      bearish: /\b(releas|draw|sell|deplet|tap|unlock|flood|dump|coordinat|agree|approve|pressur|massive|100\s*million)\w*/i,
      baseImpact: "high",
    },
    {
      category: "OPEC",
      keywords: /\b(opec\+?|oil\s*cartel|production\s*(cut|quota|target)|output\s*(cut|quota|target)|oil\s*quota|jmmc|saudi.{0,20}(output|production|cut))\b/i,
      bullish: /\b(cut|reduc|slash|curb|tighten|extend|deeper|compli|withhold|shortfall|deficit|under-?suppl|under-?produc|miss)\w*/i,
      bearish: /\b(increas|boost|ramp|hike|raise|eas(e|ing)|unwind|lift|abandon|exceed|pump\s*more|over-?produc|add\s*barrel|surplus|glut)\w*/i,
      baseImpact: "high",
    },
    {
      category: "SANCTIONS",
      keywords: /\b(sanction|embargo|ban.{0,20}(oil|crude|petroleum|energy|import|export)|restrict.{0,20}(oil|crude|export)|price\s*cap|(russia|venezuela|iran).{0,25}(oil|crude|export|barrel))\b/i,
      bullish: /\b(impos|tighten|expand|new|escalat|restrict|ban|block|seiz|penal|enforc|secondary)\w*/i,
      bearish: /\b(lift|eas(e|ing)|waiver|exempt|relax|suspend|remov|deal|agree|compl|resum|loophole|evad|circumvent)\w*/i,
      baseImpact: "high",
    },
    {
      category: "PIPELINE",
      keywords: /\b(pipeline|nord\s*stream|keystone|druzhba|cpc|lng\s*terminal|refiner(y|ies)|oil\s*(terminal|port|facility|infrastructure|hub)|export\s*terminal)\b/i,
      bullish: /\b(shut|halt|disrupt|explod|leak|damag|outage|malfunction|delay|cancel|block|suspend|fire|attack|strike|sabotag)\w*/i,
      bearish: /\b(reopen|restart|resum|repair|complet|commission|expand|new|approv|online|back\s*online)\w*/i,
      baseImpact: "medium",
    },
    {
      category: "INVENTORY",
      keywords: /\b(crude\s*(inventor|stock)|oil\s*(inventor|stock)|stockpil|eia.{0,20}(report|data|inventor|weekly)|api.{0,20}(report|data|inventor|weekly)|oil\s*storage|cushing|fuel\s*stock|diesel\s*(stock|inventor)|gasoline\s*(inventor|stock)|distillate)\b/i,
      bullish: /\b(draw|declin|fall|drop|deplet|below|lower|tighten|shortage|squeeze|lowest)\w*/i,
      bearish: /\b(build|rise|increas|surge|above|higher|glut|overflow|highest|surplus)\w*/i,
      baseImpact: "medium",
    },
    {
      category: "DEMAND",
      keywords: /\b(oil\s*demand|crude\s*demand|energy\s*demand|fuel\s*demand|(china|india|chinese|indian).{0,25}(oil|crude|demand|import|refin)|global.{0,20}(demand|growth|recession|slowdown)|iea.{0,25}(demand|forecast|outlook)|driving\s*season|travel\s*demand|refin.{0,15}(capacity|throughput|margin|run)|crack\s*spread|consumption)\b/i,
      bullish: /\b(strong|surge|record|boost|recover|revis\w*\s*up|upgrade|above|robust|accelerat|high|jump|increas)\w*/i,
      bearish: /\b(weak|slow|contract|declin|revis\w*\s*down|downgrade|below|recession|slump|crash|fall|drop|cut)\w*/i,
      baseImpact: "medium",
    },
    {
      category: "TRADE_POLICY",
      keywords: /\b(tariff|trade\s*war|import\s*duty|export\s*ban|export\s*curb|trade\s*deal)\b.{0,40}\b(oil|energy|crude|fuel|petroleum)|\b(oil|energy|crude|fuel).{0,40}\b(tariff|trade\s*war|duty|export\s*ban)\b/i,
      bullish: /\b(impos|ban|restrict|limit|block|tax|duty|retaliat|escalat)\w*/i,
      bearish: /\b(lift|remov|cut|reduc|exempt|free\s*trade|agree|deal|truce)\w*/i,
      baseImpact: "medium",
    },
    {
      category: "PRODUCTION",
      keywords: /\b(oil\s*production|crude\s*(output|production)|shale|permian|rig\s*count|baker\s*hughes|drilling|fracking|oil\s*field|gas\s*field|offshore|north\s*sea|gulf\s*of\s*mexico|hurricane|output\s*(rose|fell|hit))\b/i,
      bullish: /\b(declin|drop|shut|halt|slow|cut|fall|curb|reduc|hurricane|storm|evacuat|outage|lowest)\w*/i,
      bearish: /\b(record|surge|increas|ramp|boost|new\s*well|expand|more\s*rig|resum|highest|rose)\w*/i,
      baseImpact: "low",
    },
    {
      category: "GENERAL",
      keywords: /\b(crude\s*oil|brent|wti|oil\s*price|oil\s*futures|petroleum|oil\s*market|energy\s*market)\b/i,
      bullish: PRICE_UP,
      bearish: PRICE_DOWN,
      baseImpact: "low",
    },
  ],
  flip: {
    CONFLICT: { bull: "Ceasefire, Hormuz reopening, or confirmed de-escalation headlines would strip the risk premium.", bear: "Fresh strikes on tankers, Aramco, or Hormuz traffic would re-price supply risk higher." },
    RESERVES: { bull: "A larger or accelerated SPR/IEA release landing in physical markets would cap upside.", bear: "Release delays, smaller volumes, or reserves proving insufficient would flip bullish." },
    OPEC: { bull: "OPEC+ unwinding cuts or members exceeding quotas would turn bearish.", bear: "Surprise cuts or compliance tightening would turn bullish." },
    SANCTIONS: { bull: "Sanctions waivers or an Iran/Russia deal would release barrels and turn bearish.", bear: "New secondary sanctions or enforcement would tighten supply." },
    PIPELINE: { bull: "Restart of disrupted infrastructure.", bear: "Further outages or attacks on infrastructure." },
    INVENTORY: { bull: "A surprise inventory build on EIA Wednesday.", bear: "A surprise inventory draw on EIA Wednesday." },
    DEMAND: { bull: "Weak China/India import data or recession signals.", bear: "Upward demand revisions from IEA/OPEC." },
    TRADE_POLICY: { bull: "Tariff rollback or trade deal.", bear: "New energy tariffs or export bans." },
    PRODUCTION: { bull: "Rising rig counts or record US output.", bear: "Hurricane shut-ins or output declines." },
  },
  triggers: {
    bull: {
      CONFLICT: "Hormuz stays disrupted / fresh strikes on tankers or Gulf infrastructure",
      RESERVES: "Reserve release stalls, shrinks, or proves insufficient",
      OPEC: "OPEC+ cuts hold or compliance tightens",
      SANCTIONS: "Sanctions enforcement tightens",
      INVENTORY: "Surprise inventory draw (EIA Wednesday)",
    },
    bear: {
      CONFLICT: "Ceasefire / de-escalation headlines or Hormuz traffic normalizes",
      RESERVES: "G7 / IEA / SPR barrels confirmed landing in physical markets",
      OPEC: "OPEC+ quota hikes or members overproduce",
      SANCTIONS: "Sanctions waivers or an Iran / Russia deal",
      INVENTORY: "Surprise inventory build (EIA Wednesday)",
    },
  },
};

const BTC: AssetConfig = {
  assetName: "Bitcoin",
  panelTitle: "Market Catalysts",
  strikeSymbol: "BTC-USD",
  assetRe: /\b(bitcoin|btc|crypto|cryptocurrenc|digital\s*asset)\w*/i,
  gdeltQuery: null,
  feeds: [
    { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", name: "CoinDesk" },
    { url: "https://cointelegraph.com/rss", name: "Cointelegraph" },
    { url: gnq("bitcoin when:2d"), name: "Google News" },
    { url: gnq("bitcoin (ETF OR SEC OR regulation OR Congress) when:3d"), name: "Google News" },
    { url: gnq("bitcoin (Fed OR CPI OR rates OR dollar OR tariff) when:3d"), name: "Google News" },
    { url: gnq("(hack OR exploit OR outage OR insolvency) (exchange OR bitcoin OR crypto) when:3d"), name: "Google News" },
    { url: gnq("bitcoin (whale OR miners OR hashrate OR liquidations OR treasury) when:2d"), name: "Google News" },
  ],
  rules: [
    {
      category: "ETF_FLOWS",
      keywords: /\b((bitcoin|btc|spot|crypto)\s*etf|ibit|fbtc|gbtc|etf\s*(inflow|outflow|flow|holding)|blackrock.{0,20}(bitcoin|btc)|fidelity.{0,20}(bitcoin|btc))\b/i,
      bullish: /\b(inflow|record|buy|accumulat|demand|surge|add|purchase|net\s*positive)\w*/i,
      bearish: /\b(outflow|redempt|sell|dump|exit|net\s*negative|withdraw)\w*/i,
      baseImpact: "high",
    },
    {
      category: "REGULATION",
      keywords: /\b(sec\b|cftc|regulat|lawsuit|congress|senate|house\s*(bill|vote)|bill\b|crackdown|approv|license|mica|stablecoin\s*(bill|act|law)|genius\s*act|clarity\s*act|market\s*structure\s*(bill|act)|treasury\s*(rule|guidance)|irs|tax\w*\s*(crypto|bitcoin)|executive\s*order|strategic\s*bitcoin\s*reserve)\b/i,
      bullish: /\b(approv|clarity|pass|legal|license|framework|friendly|eas(e|ing)|sign|adopt|green\s*light|drop\w*\s*(case|lawsuit|charge)|reserve)\w*/i,
      bearish: /\b(ban|lawsuit|crackdown|reject|delay|probe|charge|fine|restrict|subpoena|sue|enforcement|block|veto)\w*/i,
      baseImpact: "high",
      needsAsset: true,
    },
    {
      category: "MACRO",
      keywords: /\b(fed\b|fomc|powell|rate\s*(cut|hike|decision|path)|interest\s*rate|cpi|pce|inflation|treasury\s*yield|bond\s*yield|dollar|dxy|jobs\s*report|payroll|unemployment|recession|tariff|trade\s*war|liquidity|qe\b|qt\b|balance\s*sheet|debt\s*ceiling|shutdown)\b/i,
      bullish: /\b(cut|dovish|cool|eas(e|ing)|weaker\s*dollar|dollar\s*(fall|drop|slide|weak)|liquidity|stimulus|pause|soft\s*landing|risk-?on|rally|below\s*expect)\w*/i,
      bearish: /\b(hike|hawkish|hot|sticky|stronger\s*dollar|dollar\s*(rise|jump|surge|strong)|tighten|higher\s*for\s*longer|recession|risk-?off|above\s*expect|sell-?off)\w*/i,
      baseImpact: "high",
      needsAsset: true,
    },
    {
      category: "ADOPTION",
      keywords: /\b(microstrategy|\bstrategy\b.{0,30}(bitcoin|btc)|saylor|treasury\s*(compan|reserve|purchase|strateg)|bitcoin\s*treasur|nation|el\s*salvador|bhutan|sovereign\s*wealth|pension\s*fund|bank.{0,25}(bitcoin|crypto|custody)|payment|visa|mastercard|paypal|stripe|adopt|metaplanet|institution\w*\s*(buy|demand|inflow|adopt))\b/i,
      bullish: /\b(buy|bought|purchase|add|acquir|adopt|launch|allow|offer|accumulat|holds?|raise|expand|integrat|enable)\w*/i,
      bearish: /\b(sell|sold|halt|suspend|exit|ban|drop|cut|pause|wind\s*down)\w*/i,
      baseImpact: "medium",
      needsAsset: true,
    },
    {
      category: "EXCHANGE_RISK",
      keywords: /\b(hack|exploit|breach|outage|insolven|bankrupt|withdraw\w*\s*(halt|pause|suspend|freeze)|binance|coinbase|kraken|okx|bybit|ftx|mt\.?\s*gox|tether|usdt|usdc|depeg|rug\s*pull|drain)\b/i,
      bullish: /\b(recover|resum|restor|secure|reimburse|settle|refund|return\w*\s*funds|patched)\w*/i,
      bearish: /\b(hack|exploit|breach|outage|halt|insolven|bankrupt|depeg|lawsuit|charge|probe|drain|stolen|frozen|freeze|collapse)\w*/i,
      baseImpact: "high",
    },
    {
      category: "ONCHAIN",
      keywords: /\b(whale|miner|hashrate|hash\s*rate|difficulty|exchange\s*(inflow|outflow|reserve|balance)|dormant|wallet\s*(move|transfer|activ)|long-?term\s*holder|short-?term\s*holder|supply\s*shock|halving|realized\s*(price|cap)|mvrv|sopr|coin\s*days)\b/i,
      bullish: /\b(outflow|accumulat|withdraw|dormant|record\s*hash|all-?time\s*high|hold|buy|absorb|supply\s*squeeze|lowest\s*exchange)\w*/i,
      bearish: /\b(inflow|sell|dump|capitulat|move\w*\s*to\s*exchange|miner\s*sell|distribut|deposit|offload|unload)\w*/i,
      baseImpact: "medium",
    },
    {
      category: "LEVERAGE",
      keywords: /\b(liquidat|funding\s*rate|open\s*interest|leverage|short\s*squeeze|long\s*squeeze|futures|perpetual|options\s*expir|max\s*pain|gamma)\b/i,
      bullish: /\b(short\s*squeeze|shorts\s*liquidat|negative\s*funding|reset|flush\w*\s*out|deleverag\w*\s*complete)\w*/i,
      bearish: /\b(longs?\s*liquidat|overleverag|record\s*open\s*interest|extreme\s*funding|cascade|wipe)\w*/i,
      baseImpact: "medium",
      needsAsset: true,
    },
    {
      category: "GENERAL",
      keywords: /\b(bitcoin|btc)\b/i,
      bullish: PRICE_UP,
      bearish: PRICE_DOWN,
      baseImpact: "low",
    },
  ],
  flip: {
    ETF_FLOWS: { bull: "A run of net ETF outflows would remove the marginal bid.", bear: "A return to sustained ETF inflows would flip bullish." },
    REGULATION: { bull: "A hostile ruling, lawsuit, or bill stalling would turn risk-off.", bear: "Regulatory clarity passing (market-structure or stablecoin bill) would flip bullish." },
    MACRO: { bull: "Hawkish Fed repricing or a stronger dollar would pull liquidity.", bear: "Rate cuts, cooling inflation, or a weaker dollar would flip bullish." },
    ADOPTION: { bull: "Treasury buyers pausing or selling would remove support.", bear: "New corporate or sovereign buying would flip bullish." },
    EXCHANGE_RISK: { bull: "Another exchange or stablecoin incident would hit confidence.", bear: "Funds recovered and withdrawals normalized would calm the market." },
    ONCHAIN: { bull: "Large exchange inflows or miner distribution would signal selling.", bear: "Exchange outflows and dormant supply growth would flip bullish." },
    LEVERAGE: { bull: "Crowded longs with extreme funding invite a flush.", bear: "A leverage reset with negative funding sets up a squeeze higher." },
  },
  triggers: {
    bull: {
      ETF_FLOWS: "ETF inflows persist / new record daily inflow",
      REGULATION: "Market-structure or stablecoin bill advances; SEC softens",
      MACRO: "Fed cuts or cooler inflation; dollar weakens",
      ADOPTION: "New corporate / sovereign treasury purchases announced",
      EXCHANGE_RISK: "Incident contained; withdrawals and funds restored",
      ONCHAIN: "Exchange outflows continue; long-term holders keep accumulating",
      LEVERAGE: "Shorts get squeezed after a leverage reset",
    },
    bear: {
      ETF_FLOWS: "ETF outflows accelerate",
      REGULATION: "Enforcement action, lawsuit, or legislative setback",
      MACRO: "Hawkish Fed / hot CPI / stronger dollar",
      ADOPTION: "Treasury buyers pause or sell",
      EXCHANGE_RISK: "Hack, insolvency, or stablecoin depeg spreads",
      ONCHAIN: "Whale or miner distribution hits exchanges",
      LEVERAGE: "Overleveraged longs cascade into liquidations",
    },
  },
};

const GOLD: AssetConfig = {
  assetName: "Gold",
  panelTitle: "Macro & Safe-Haven Catalysts",
  strikeSymbol: "XAU-USD",
  assetRe: /\b(gold|bullion|xau|precious\s*metal|safe\s*haven)\w*/i,
  gdeltQuery: null,
  feeds: [
    { url: "https://www.mining.com/feed/", name: "Mining.com" },
    { url: gnq("gold price when:2d"), name: "Google News" },
    { url: gnq("gold (Fed OR yields OR dollar OR inflation OR CPI) when:3d"), name: "Google News" },
    { url: gnq('("central bank" OR PBoC OR reserves OR "World Gold Council") gold when:5d'), name: "Google News" },
    { url: gnq('gold ("safe haven" OR war OR Iran OR tariff OR sanctions) when:2d'), name: "Google News" },
    { url: gnq("(gold ETF OR GLD OR bullion demand OR gold imports) when:4d"), name: "Google News" },
  ],
  rules: [
    {
      category: "RATES",
      keywords: /\b(fed\b|fomc|powell|rate\s*(cut|hike|decision|path|expectation)|interest\s*rate|treasury\s*yield|real\s*yield|bond\s*yield|10-?year|tips\b|dot\s*plot)\b/i,
      bullish: /\b(cut|dovish|lower\s*yield|yields?\s*(fall|drop|slide|retreat|ease|tumbl)|pause|eas(e|ing)|pivot)\w*/i,
      bearish: /\b(hike|hawkish|higher\s*yield|yields?\s*(rise|jump|climb|surge|spike)|higher\s*for\s*longer|tighten)\w*/i,
      baseImpact: "high",
      needsAsset: true,
    },
    {
      category: "DOLLAR",
      keywords: /\b(dollar|dxy|greenback|usd\s*index|currency\s*market)\b/i,
      bullish: /\b(weak|fall|drop|slide|slump|retreat|lower|soft|declin|dip)\w*/i,
      bearish: /\b(strong|rise|jump|climb|surge|rall|higher|firm|gain|strengthen)\w*/i,
      baseImpact: "high",
      needsAsset: true,
    },
    {
      category: "CENTRAL_BANKS",
      keywords: /\b(central\s*bank|pboc|people'?s\s*bank|reserve\s*(buy|purchase|holding|manager|asset)|rbi\b|turkey|poland|kazakhstan|czech|world\s*gold\s*council|official\s*sector|bullion\s*(reserve|purchase)|gold\s*reserve|de-?dollari)\w*/i,
      bullish: /\b(buy|bought|purchase|add|accumulat|record|increase|boost|raise|expand|continue)\w*/i,
      bearish: /\b(sell|sold|reduce|pause|halt|cut|slow|stop|trim)\w*/i,
      baseImpact: "high",
    },
    {
      category: "SAFE_HAVEN",
      keywords: /\b(war|conflict|strike|attack|missile|drone|iran|israel|ukraine|russia|taiwan|china.{0,15}(tension|military|threat)|sanction|tension|geopolit|escalat|hormuz|crisis|default|bank\s*(failure|run|collapse)|tariff|trade\s*war|shutdown|haven)\w*/i,
      bullish: /\b(escalat|attack|strike|war|tension|crisis|sanction|threat|fear|haven|flight\s*to\s*safety|uncertain|retaliat|collapse|turmoil|panic)\w*/i,
      bearish: /\b(ceasefire|peace|de-?escalat|truce|calm|deal|agree|resolv|relief|eas(e|ing)|optimism)\w*/i,
      baseImpact: "high",
      needsAsset: true,
    },
    {
      category: "INFLATION",
      keywords: /\b(cpi|pce|inflation|price\s*index|ppi|stagflation|cost\s*of\s*living|wage\s*growth)\b/i,
      bullish: /\b(hot|sticky|higher|above|accelerat|surge|stagflation|persistent|rise|jump)\w*/i,
      bearish: /\b(cool|soft|lower|below|slow|eas(e|ing)|disinflation|fall|drop)\w*/i,
      baseImpact: "medium",
      needsAsset: true,
    },
    {
      category: "ETF_FLOWS",
      keywords: /\b(gold\s*etf|gld\b|iau\b|etf\s*(inflow|outflow|holding)|spdr\s*gold|etf\s*demand|physically\s*backed)\b/i,
      bullish: /\b(inflow|record|buy|add|rise|increase|demand|accumulat)\w*/i,
      bearish: /\b(outflow|redempt|sell|fall|drop|decline|liquidat)\w*/i,
      baseImpact: "medium",
    },
    {
      category: "PHYSICAL",
      keywords: /\b(mine\s*(output|production|supply)|miner|newmont|barrick|agnico|recycl|scrap|jewel\w*\s*demand|india.{0,25}(import|demand|duty|festival|wedding)|china.{0,25}(import|demand|premium|retail)|shanghai\s*premium|comex\s*(inventor|stock|deliver)|physical\s*demand|bar\s*and\s*coin)\w*/i,
      bullish: /\b(demand|import|premium|record|strong|disrupt|strike|cut|shortage|deliver|surge)\w*/i,
      bearish: /\b(weak|slump|drop|fall|surplus|increase\s*output|record\s*production|discount|soft)\w*/i,
      baseImpact: "low",
    },
    {
      category: "GENERAL",
      keywords: /\b(gold|bullion|xau|precious\s*metal)\w*/i,
      bullish: PRICE_UP,
      bearish: PRICE_DOWN,
      baseImpact: "low",
    },
  ],
  flip: {
    RATES: { bull: "A hawkish repricing or rising real yields would cap gold.", bear: "Rate cuts or falling real yields would flip bullish." },
    DOLLAR: { bull: "A dollar rally would pressure gold.", bear: "A weaker dollar would flip bullish." },
    CENTRAL_BANKS: { bull: "Central banks pausing purchases would remove the structural bid.", bear: "Renewed official-sector buying would flip bullish." },
    SAFE_HAVEN: { bull: "De-escalation or a ceasefire would unwind the haven bid.", bear: "A fresh geopolitical shock would restore the haven bid." },
    INFLATION: { bull: "Disinflation prints reduce gold's hedge appeal.", bear: "Sticky or re-accelerating inflation would flip bullish." },
    ETF_FLOWS: { bull: "Sustained ETF outflows would weigh on price.", bear: "ETF inflows returning would flip bullish." },
    PHYSICAL: { bull: "Weak India/China physical demand would soften the floor.", bear: "Strong physical premiums would firm the floor." },
  },
  triggers: {
    bull: {
      RATES: "Fed cuts or yields fall",
      DOLLAR: "Dollar weakens",
      CENTRAL_BANKS: "Central-bank buying continues or accelerates",
      SAFE_HAVEN: "Geopolitical escalation or financial stress",
      INFLATION: "Inflation runs hot or re-accelerates",
      ETF_FLOWS: "ETF inflows return",
      PHYSICAL: "Strong India/China physical demand",
    },
    bear: {
      RATES: "Hawkish Fed or rising real yields",
      DOLLAR: "Dollar rallies",
      CENTRAL_BANKS: "Official-sector buying pauses",
      SAFE_HAVEN: "Ceasefire / de-escalation unwinds the haven bid",
      INFLATION: "Disinflation prints",
      ETF_FLOWS: "ETF outflows persist",
      PHYSICAL: "Weak physical demand, discounts in Asia",
    },
  },
};

const ADA: AssetConfig = {
  assetName: "Cardano",
  panelTitle: "Ecosystem & Market Catalysts",
  strikeSymbol: "ADA-USD",
  assetRe: /\b(cardano|\$ada|ada\s*(price|token|coin|crypto|usd|holder|whale|stak)|ada\b(?=.{0,50}(cardano|crypto|blockchain|token|coin)))/i,
  gdeltQuery: null,
  feeds: [
    { url: gnq("cardano when:3d"), name: "Google News" },
    { url: gnq("cardano ADA price when:2d"), name: "Google News" },
    { url: gnq("cardano (Hydra OR Midnight OR governance OR upgrade OR Hoskinson) when:7d"), name: "Google News" },
    { url: gnq("(cardano OR ADA) (ETF OR listing OR SEC OR Grayscale) when:7d"), name: "Google News" },
    { url: gnq("(Strike Finance OR Liqwid OR Minswap OR Midnight) cardano when:7d"), name: "Google News" },
    { url: "https://cointelegraph.com/rss/tag/cardano", name: "Cointelegraph" },
  ],
  rules: [
    {
      category: "PROTOCOL",
      keywords: /\b(hydra|midnight|chang\s*(hard\s*fork|upgrade)|hard\s*fork|voltaire|governance|constitution|catalyst\s*fund|leios|ouroboros|mithril|plomin|upgrade|mainnet|testnet|roadmap|iohk|iog\b|input\s*output|emurgo|cardano\s*foundation|node\s*release|scaling|throughput|tps)\b/i,
      bullish: /\b(launch|live|mainnet|ship|complete|upgrade|release|milestone|activat|pass|approv|record|successful|deploy)\w*/i,
      bearish: /\b(delay|postpon|bug|exploit|halt|fail|reject|outage|slip|vulnerab|rollback)\w*/i,
      baseImpact: "high",
      needsAsset: true,
    },
    {
      category: "ECOSYSTEM",
      keywords: /\b(strike\s*finance|ascend|liqwid|minswap|indigo|djed|snek|tvl|total\s*value\s*locked|dex\s*volume|stablecoin|usdm|usda|defi|dapp|nft|perp\w*|lending\s*protocol|bridge|wanchain|partner\w*|integrat)\w*/i,
      bullish: /\b(record|surge|grow|launch|inflow|all-?time\s*high|rise|expand|integrat|partner|mainnet|live|milestone)\w*/i,
      bearish: /\b(drop|fall|exploit|hack|decline|outflow|shut|exit|drain|rug|pause)\w*/i,
      baseImpact: "medium",
      needsAsset: true,
    },
    {
      category: "LISTINGS_ETF",
      keywords: /\b(ada\s*etf|cardano\s*etf|grayscale|21shares|vaneck|bitwise|list\w*|robinhood|coinbase|binance|kraken|futures|cme\b|etp\b|index\s*fund|custod)\w*/i,
      bullish: /\b(fil|approv|list|launch|add|include|support|green\s*light|debut|offer)\w*/i,
      bearish: /\b(delist|reject|delay|remov|withdraw|deny|suspend)\w*/i,
      baseImpact: "high",
      needsAsset: true,
    },
    {
      category: "REGULATION",
      keywords: /\b(sec\b|regulat|lawsuit|security\s*(status|classif)|clarity\s*act|genius\s*act|market\s*structure|mica|crackdown|congress|senate|commodity|cftc|enforcement)\b/i,
      bullish: /\b(approv|clarity|pass|legal|framework|drop\w*\s*(case|lawsuit)|not\s*a\s*security|commodity|dismiss|friendly)\w*/i,
      bearish: /\b(ban|lawsuit|crackdown|reject|charge|classif\w*\s*as\s*securit|probe|sue|subpoena|enforcement\s*action)\w*/i,
      baseImpact: "high",
      needsAsset: true,
    },
    {
      category: "FOUNDER",
      keywords: /\b(hoskinson|charles|gregaard|cardano\s*foundation.{0,20}(statement|announce|respond)|intersect|ama\b|x\s*spaces|livestream|keynote)\b/i,
      bullish: /\b(announce|partner|launch|bullish|confirm|reveal|deal|unveil|propos|plan)\w*/i,
      bearish: /\b(feud|dispute|criticis|controvers|leav|resign|lawsuit|attack|rift|split|warn)\w*/i,
      baseImpact: "low",
      needsAsset: true,
    },
    {
      category: "ONCHAIN",
      keywords: /\b(whale|large\s*holder|wallet\s*(move|transfer)|staking\s*(ratio|rate|pool)|delegat|exchange\s*(inflow|outflow|reserve)|active\s*address|transaction\s*volume|accumulat|dormant)\w*/i,
      bullish: /\b(accumulat|outflow|withdraw|record|surge|increase|buy|stak|lowest\s*exchange)\w*/i,
      bearish: /\b(sell|dump|inflow|deposit|decline|drop|unstak|distribut|offload)\w*/i,
      baseImpact: "medium",
      needsAsset: true,
    },
    {
      category: "MARKET_BETA",
      keywords: /\b(bitcoin|btc|altcoin\s*season|altseason|crypto\s*market|total\s*market\s*cap|risk-?on|risk-?off|liquidat|fed\b|cpi|tariff)\b/i,
      bullish: /\b(rall|surge|breakout|risk-?on|altcoin\s*season|altseason|inflow|rotat\w*\s*into\s*alt|cut|dovish)\w*/i,
      bearish: /\b(crash|plunge|sell-?off|risk-?off|liquidat|dump|hawkish|hike|outflow)\w*/i,
      baseImpact: "medium",
      needsAsset: true,
    },
    {
      category: "GENERAL",
      keywords: /\b(cardano|\$ada|\bada\b)/i,
      bullish: PRICE_UP,
      bearish: PRICE_DOWN,
      baseImpact: "low",
      needsAsset: true,
    },
  ],
  flip: {
    PROTOCOL: { bull: "A delayed or buggy upgrade would deflate the development narrative.", bear: "A shipped milestone (Hydra, Midnight, governance) would flip bullish." },
    ECOSYSTEM: { bull: "A DeFi exploit or TVL outflows would hurt.", bear: "TVL growth and new protocol launches would flip bullish." },
    LISTINGS_ETF: { bull: "An ETF rejection or delisting would remove the bid.", bear: "ETF approval or a major listing would flip bullish." },
    REGULATION: { bull: "A securities designation or enforcement action would weigh.", bear: "Commodity classification or market-structure clarity would flip bullish." },
    FOUNDER: { bull: "Public disputes or leadership turmoil would weigh on sentiment.", bear: "Major partnership or roadmap announcements would lift sentiment." },
    ONCHAIN: { bull: "Whale distribution to exchanges would signal selling.", bear: "Whale accumulation and rising staking would flip bullish." },
    MARKET_BETA: { bull: "A bitcoin sell-off drags ADA with higher beta.", bear: "Bitcoin strength and altcoin rotation would flip bullish." },
  },
  triggers: {
    bull: {
      PROTOCOL: "Upgrade / Hydra / Midnight milestone ships on schedule",
      ECOSYSTEM: "TVL and DEX volume keep growing; new launches",
      LISTINGS_ETF: "ETF filing advances or a major venue lists ADA",
      REGULATION: "Commodity treatment or market-structure clarity",
      FOUNDER: "Partnership or roadmap announcement lands",
      ONCHAIN: "Whale accumulation and exchange outflows continue",
      MARKET_BETA: "Bitcoin breaks out and capital rotates into alts",
    },
    bear: {
      PROTOCOL: "Upgrade delay, bug, or outage",
      ECOSYSTEM: "DeFi exploit or TVL outflows",
      LISTINGS_ETF: "ETF delay / rejection or a delisting",
      REGULATION: "Securities designation or enforcement action",
      FOUNDER: "Public dispute or leadership turmoil",
      ONCHAIN: "Whales move ADA to exchanges",
      MARKET_BETA: "Bitcoin sells off; risk-off across crypto",
    },
  },
};

const CONFIGS: Record<CatalystAsset, AssetConfig> = { OIL, BTC, GOLD, ADA };

export const CATALYST_ASSETS: CatalystAsset[] = ["OIL", "BTC", "GOLD", "ADA"];
export function isCatalystAsset(s: string): s is CatalystAsset {
  return (CATALYST_ASSETS as string[]).includes(s);
}

// ── Classification ──────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function countMatches(re: RegExp, text: string): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (text.match(g) ?? []).length;
}

interface Classification {
  category: string;
  sentiment: Sentiment;
  impact: Impact;
  score: number;
  strength: number;
}

function scoreAgainstRules(cfg: AssetConfig, text: string): Classification[] {
  const out: Classification[] = [];
  const mag = Math.min(countMatches(MAGNITUDE_WORDS, text), 3);
  const hasAsset = cfg.assetRe.test(text);
  for (const rule of cfg.rules) {
    if (!rule.keywords.test(text)) continue;
    if (rule.needsAsset && !hasAsset) continue;
    const bull = countMatches(rule.bullish, text);
    const bear = countMatches(rule.bearish, text);
    const net = bull - bear;
    let raw = 0;
    if (net > 0) raw = 25 + 10 * Math.min(net, 3) + 5 * mag;
    else if (net < 0) raw = -(25 + 10 * Math.min(-net, 3) + 5 * mag);
    const score = clamp(Math.round(raw * IMPACT_MULT[rule.baseImpact]), -75, 75);
    out.push({
      category: rule.category,
      sentiment: score >= 10 ? "bullish" : score <= -10 ? "bearish" : "neutral",
      impact: rule.baseImpact,
      score,
      strength: Math.abs(score) * 10 + IMPACT_RANK[rule.baseImpact],
    });
  }
  return out;
}

function pickBest(c: Classification[]): Classification | null {
  if (c.length === 0) return null;
  const s = [...c].sort((a, b) => b.strength - a.strength);
  const best = s[0];
  const second = s[1];
  if (second && best.score !== 0 && second.score !== 0 && Math.sign(best.score) !== Math.sign(second.score) && Math.abs(Math.abs(best.score) - Math.abs(second.score)) <= 15) {
    return { ...best, score: 0, sentiment: "neutral" };
  }
  return best;
}

function classify(cfg: AssetConfig, title: string, description: string): Classification | null {
  const fromTitle = pickBest(scoreAgainstRules(cfg, title));
  if (fromTitle) return fromTitle;
  if (!description) return null;
  const fromDesc = pickBest(scoreAgainstRules(cfg, description));
  if (!fromDesc || fromDesc.score === 0) return null;
  const score = Math.round(fromDesc.score * 0.5);
  return { ...fromDesc, impact: fromDesc.impact === "high" ? "medium" : "low", score, sentiment: score >= 10 ? "bullish" : score <= -10 ? "bearish" : "neutral" };
}

function credibility(source: string): number {
  if (HIGH_CRED.test(source)) return 1.15;
  if (LOW_CRED.test(source)) return 0.8;
  return 1.0;
}

function sentimentLabel(score: number): string {
  if (score >= 40) return "Very Bullish";
  if (score >= 15) return "Bullish";
  if (score >= 5) return "Slightly Bullish";
  if (score > -5) return "Neutral";
  if (score > -15) return "Slightly Bearish";
  if (score > -40) return "Bearish";
  return "Very Bearish";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10))).replace(/&nbsp;/g, " ");
}

function splitPublisher(title: string, fallback: string): { title: string; source: string } {
  const m = title.match(/^(.*?)\s+[-–—]\s+([^-–—]{2,60})$/);
  if (m) return { title: m[1].trim(), source: m[2].trim() };
  return { title: title.trim(), source: fallback };
}

const dedupKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);

interface RawItem {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
}

function toEvent(cfg: AssetConfig, item: RawItem): CatalystEvent | null {
  const c = classify(cfg, item.title, item.description);
  if (!c) return null;
  const score = clamp(Math.round(c.score * credibility(item.source)), -80, 80);
  return {
    title: item.title,
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt,
    category: c.category,
    sentiment: score >= 10 ? "bullish" : score <= -10 ? "bearish" : "neutral",
    impact: c.impact,
    score,
    priceReaction: null,
  };
}

// ── Sources ─────────────────────────────────────────────────────────────────

function parseRSS(xml: string, feedName: string): RawItem[] {
  const items: RawItem[] = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const b = m[1];
    const rawTitle = b.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? "";
    const link = b.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)?.[1]?.trim() ?? "";
    const pub = b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    const rawDesc = b.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] ?? "";
    const t = decodeEntities(rawTitle).trim();
    if (!t) continue;
    const { title, source } = feedName === "Google News" ? splitPublisher(t, feedName) : { title: t, source: feedName };
    const d = new Date(pub);
    items.push({
      title,
      description: decodeEntities(rawDesc.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 600),
      url: link,
      source,
      publishedAt: isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(),
    });
  }
  return items;
}

async function fetchText(url: string, ms: number): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store", headers: UA });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
async function fetchJSON<T>(url: string, ms: number): Promise<T | null> {
  const txt = await fetchText(url, ms);
  if (!txt) return null;
  try {
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function fetchFeeds(cfg: AssetConfig): Promise<{ items: RawItem[]; ok: string[] }> {
  const results = await Promise.allSettled(
    cfg.feeds.map(async (f) => {
      const xml = await fetchText(f.url, 8000);
      return { name: f.name, items: xml ? parseRSS(xml, f.name) : [] };
    })
  );
  const items: RawItem[] = [];
  const ok = new Set<string>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    if (r.value.items.length > 0) ok.add(r.value.name);
    items.push(...r.value.items);
  }
  return { items, ok: [...ok] };
}

interface GDELTArticle { title: string; url: string; domain: string; seendate: string }
async function fetchGDELT(cfg: AssetConfig): Promise<RawItem[]> {
  if (!cfg.gdeltQuery) return [];
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(cfg.gdeltQuery)}&mode=artlist&maxrecords=75&format=json&sort=datedesc&timespan=4320`;
  const data = await fetchJSON<{ articles?: GDELTArticle[] }>(url, 12000);
  return (data?.articles ?? []).filter((a) => a.title).map((a) => ({
    title: decodeEntities(a.title).trim(),
    description: "",
    url: a.url,
    source: a.domain ?? "GDELT",
    publishedAt: a.seendate ? a.seendate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z") : new Date().toISOString(),
  }));
}

interface GNewsArticle { title: string; description: string; url: string; source: { name: string }; publishedAt: string }
async function fetchGNews(asset: CatalystAsset): Promise<RawItem[]> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const q: Record<CatalystAsset, string> = {
    OIL: "crude oil OR OPEC OR oil sanctions OR Hormuz OR oil reserves OR tanker attack OR Aramco",
    BTC: "bitcoin ETF OR bitcoin SEC OR bitcoin Fed OR bitcoin whale OR crypto exchange hack",
    GOLD: "gold price Fed OR gold central bank OR gold safe haven OR gold ETF",
    ADA: "cardano OR ADA crypto",
  };
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q[asset])}&lang=en&max=10&sortby=publishedAt&apikey=${key}`;
  const data = await fetchJSON<{ articles?: GNewsArticle[] }>(url, 8000);
  return (data?.articles ?? []).map((a) => ({
    title: a.title,
    description: a.description ?? "",
    url: a.url,
    source: a.source?.name ?? "GNews",
    publishedAt: a.publishedAt ?? new Date().toISOString(),
  }));
}

// ── Price context & reactions ───────────────────────────────────────────────

const STRIKE = "https://api.strikefinance.org/price/v2";
interface Candle { time: number; open: number; high: number; low: number; close: number }

function parseCandles(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((k: unknown[]) => {
      const t = Number(k[0]);
      return { time: t < 1e12 ? t * 1000 : t, open: parseFloat(String(k[1])), high: parseFloat(String(k[2])), low: parseFloat(String(k[3])), close: parseFloat(String(k[4])) };
    })
    .filter((c) => Number.isFinite(c.close) && c.close > 0);
}

async function fetchPrice(strikeSymbol: string): Promise<{ context: CatalystResult["priceContext"]; intraday: Candle[] }> {
  const [mark, daily, intradayRaw] = await Promise.all([
    fetchJSON<{ p?: string }>(`${STRIKE}/markPrice?symbol=${strikeSymbol}`, 6000),
    fetchJSON<unknown>(`${STRIKE}/klines?symbol=${strikeSymbol}&interval=1d&limit=8&priceType=last`, 6000),
    fetchJSON<unknown>(`${STRIKE}/klines?symbol=${strikeSymbol}&interval=15m&limit=288&priceType=last`, 6000),
  ]);
  const dailyC = parseCandles(daily);
  const intraday = parseCandles(intradayRaw);
  const current = parseFloat(mark?.p ?? "") || intraday[intraday.length - 1]?.close || dailyC[dailyC.length - 1]?.close || 0;
  if (!current) return { context: null, intraday };
  const prevClose = dailyC.length >= 2 ? dailyC[dailyC.length - 2].close : 0;
  const week = dailyC.slice(-7);
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return {
    context: {
      current: r(current),
      change24h: prevClose ? r(current - prevClose) : 0,
      changePct24h: prevClose ? Math.round(((current - prevClose) / prevClose) * 10000) / 100 : 0,
      weekHigh: r(week.length ? Math.max(...week.map((c) => c.high)) : current),
      weekLow: r(week.length ? Math.min(...week.map((c) => c.low)) : current),
    },
    intraday,
  };
}

function priceAt(candles: Candle[], tsMs: number): number | null {
  if (candles.length === 0 || tsMs < candles[0].time) return null;
  let lo = 0;
  let hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time < tsMs) lo = mid + 1;
    else hi = mid;
  }
  const c = candles[lo];
  return c.time >= tsMs ? c.open : c.close;
}

function attachReactions(events: CatalystEvent[], intraday: Candle[], current: number | null): void {
  if (!current || intraday.length === 0) return;
  for (const e of events) {
    const p = priceAt(intraday, new Date(e.publishedAt).getTime());
    if (!p) continue;
    const pct = Math.round(((current - p) / p) * 10000) / 100;
    const confirms = e.sentiment === "neutral" || Math.abs(pct) < 0.15 ? null : (e.sentiment === "bullish" && pct > 0) || (e.sentiment === "bearish" && pct < 0);
    e.priceReaction = { eventPrice: Math.round(p * 10000) / 10000, sinceEventPct: pct, confirms };
  }
}

// ── Verdict ─────────────────────────────────────────────────────────────────

function buildVerdict(cfg: AssetConfig, events: CatalystEvent[], breakdown: CatalystResult["categoryBreakdown"], netScore: number): CatalystVerdict | null {
  const scored = breakdown.filter((b) => b.category !== "GENERAL" && b.scoredCount >= 2 && Math.abs(b.avgScore) >= 10);
  if (scored.length === 0) return null;

  const topHeadlineFor = (cat: string, sign: 1 | -1): string =>
    events.filter((e) => e.category === cat && Math.sign(e.score) === sign && e.impact === "high").sort((a, b) => Math.abs(b.score) - Math.abs(a.score))[0]?.title ??
    events.filter((e) => e.category === cat && Math.sign(e.score) === sign).sort((a, b) => Math.abs(b.score) - Math.abs(a.score))[0]?.title ??
    "";

  const bulls = scored.filter((b) => b.avgScore > 0).sort((a, b) => b.avgScore * b.scoredCount - a.avgScore * a.scoredCount);
  const bears = scored.filter((b) => b.avgScore < 0).sort((a, b) => a.avgScore * a.scoredCount - b.avgScore * b.scoredCount);
  const toForce = (b: CatalystResult["categoryBreakdown"][number] | undefined, sign: 1 | -1): CatalystForce | null =>
    b ? { category: b.category, count: b.scoredCount, avgScore: b.avgScore, avgReactionPct: b.avgReactionPct, topHeadline: topHeadlineFor(b.category, sign) } : null;

  const bullForce = toForce(bulls[0], 1);
  const bearForce = toForce(bears[0], -1);
  const netLean: Sentiment = netScore >= 10 ? "bullish" : netScore <= -10 ? "bearish" : "neutral";

  let priceFollowing: string | null = null;
  const bA = bullForce?.avgReactionPct != null && bullForce.avgReactionPct > 0.15;
  const sA = bearForce?.avgReactionPct != null && bearForce.avgReactionPct < -0.15;
  if (bA && !sA) priceFollowing = bullForce!.category;
  else if (sA && !bA) priceFollowing = bearForce!.category;
  else if (bA && sA) priceFollowing = Math.abs(bullForce!.avgReactionPct!) >= Math.abs(bearForce!.avgReactionPct!) ? bullForce!.category : bearForce!.category;

  const fmtPct = (p: number | null) => (p == null ? "n/a" : `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`);
  const label = (c: string) => c.replace(/_/g, " ");
  const name = cfg.assetName;

  let summary: string;
  if (bullForce && bearForce) {
    summary =
      `${label(bullForce.category)} (${bullForce.count} headlines, avg +${bullForce.avgScore}) vs ${label(bearForce.category)} (${bearForce.count}, avg ${bearForce.avgScore}). ` +
      `Net lean ${netLean}. ${name} since ${label(bullForce.category).toLowerCase()} headlines ${fmtPct(bullForce.avgReactionPct)}, since ${label(bearForce.category).toLowerCase()} headlines ${fmtPct(bearForce.avgReactionPct)}` +
      (priceFollowing ? ` — price is following ${label(priceFollowing)}.` : " — price undecided.");
  } else if (bullForce) {
    summary = `${label(bullForce.category)} dominates (${bullForce.count} headlines, avg +${bullForce.avgScore}); no meaningful bearish counterforce. ${name} since those headlines ${fmtPct(bullForce.avgReactionPct)}.`;
  } else if (bearForce) {
    summary = `${label(bearForce.category)} dominates (${bearForce.count} headlines, avg ${bearForce.avgScore}); no meaningful bullish counterforce. ${name} since those headlines ${fmtPct(bearForce.avgReactionPct)}.`;
  } else summary = "No dominant catalyst.";

  const dominant = netLean === "bearish" ? bearForce ?? bullForce : bullForce ?? bearForce;
  const flip = dominant ? cfg.flip[dominant.category] : undefined;
  const flipCondition = dominant && flip ? (netLean === "bearish" ? flip.bear : flip.bull) : "";

  return { bullForce, bearForce, netLean, priceFollowing, summary, flipCondition };
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function getCatalystNews(asset: CatalystAsset): Promise<CatalystResult> {
  const cached = caches.get(asset);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
  const cfg = CONFIGS[asset];

  const [feeds, gdelt, gnews, price] = await Promise.all([fetchFeeds(cfg), fetchGDELT(cfg), fetchGNews(asset), fetchPrice(cfg.strikeSymbol)]);

  const sourcesUsed = new Set<string>(feeds.ok);
  if (gdelt.length) sourcesUsed.add("GDELT");
  if (gnews.length) sourcesUsed.add("GNews");

  const seen = new Set<string>();
  const events: CatalystEvent[] = [];
  const cutoff = Date.now() - 72 * 3600e3;
  for (const raw of [...feeds.items, ...gnews, ...gdelt]) {
    const key = dedupKey(raw.title);
    if (!key || seen.has(key)) continue;
    if (NOISE.test(raw.source) || NOISE.test(raw.url) || NOISE.test(raw.title)) continue;
    const ts = new Date(raw.publishedAt).getTime();
    if (Number.isFinite(ts) && ts < cutoff) continue;
    const ev = toEvent(cfg, raw);
    if (!ev) continue;
    if (ev.category === "GENERAL" && ev.score === 0) continue;
    seen.add(key);
    events.push(ev);
  }
  events.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  attachReactions(events, price.intraday, price.context?.current ?? null);

  const now = Date.now();
  const scored = events.filter((e) => e.score !== 0);
  let netScore = 0;
  if (scored.length > 0) {
    let ws = 0;
    let wt = 0;
    for (const e of scored) {
      const age = now - new Date(e.publishedAt).getTime();
      const w = age < 6 * 3600e3 ? 2 : age < 24 * 3600e3 ? 1.25 : 1;
      ws += e.score * w;
      wt += w;
    }
    netScore = Math.round(ws / wt);
    const recentHi = scored.filter((e) => e.impact === "high" && now - new Date(e.publishedAt).getTime() < 12 * 3600e3);
    if (recentHi.length >= 3) {
      const hiAvg = Math.round(recentHi.reduce((s, e) => s + e.score, 0) / recentHi.length);
      netScore = Math.round(netScore * 0.4 + hiAvg * 0.6);
    }
  }

  const catMap = new Map<string, { count: number; scored: number; total: number; rSum: number; rN: number }>();
  for (const e of events) {
    const c = catMap.get(e.category) ?? { count: 0, scored: 0, total: 0, rSum: 0, rN: 0 };
    c.count++;
    if (e.score !== 0) {
      c.scored++;
      c.total += e.score;
    }
    if (e.priceReaction) {
      c.rSum += e.priceReaction.sinceEventPct;
      c.rN++;
    }
    catMap.set(e.category, c);
  }
  const categoryBreakdown = [...catMap.entries()]
    .map(([category, c]) => ({
      category,
      count: c.count,
      scoredCount: c.scored,
      avgScore: c.scored > 0 ? Math.round(c.total / c.scored) : 0,
      avgReactionPct: c.rN > 0 ? Math.round((c.rSum / c.rN) * 100) / 100 : null,
    }))
    .sort((a, b) => b.scoredCount - a.scoredCount || b.count - a.count);

  const result: CatalystResult = {
    asset,
    assetName: cfg.assetName,
    panelTitle: cfg.panelTitle,
    score: clamp(netScore, -100, 100),
    label: sentimentLabel(netScore),
    eventCount: events.length,
    events: events.slice(0, 30),
    lastUpdated: new Date().toISOString(),
    categoryBreakdown,
    priceContext: price.context,
    verdict: buildVerdict(cfg, events, categoryBreakdown, netScore),
    sourcesUsed: [...sourcesUsed],
    triggers: cfg.triggers,
  };
  caches.set(asset, { data: result, timestamp: Date.now() });
  return result;
}
