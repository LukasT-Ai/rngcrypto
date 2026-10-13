import type { MacroEventDef, ScheduledEvent } from "./types";
import { EVENT_DEFS, formatValue } from "./taxonomy";

// FXStreet economic calendar (public JSON, no key). Carries consensus, previous (and revised previous) and the
// actual once released, ~weeks ahead. Reachable from cloud egress where Fair Economy rate-limits. One request per
// country; the US feed is primary, the others add the foreign central banks and the China / Eurozone data that
// move the dollar, oil demand and risk appetite.

export interface FxItem {
  id: string;
  eventId: string;
  dateUtc: string;
  name: string;
  countryCode: string;
  volatility: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  consensus: number | null;
  previous: number | null;
  revised: number | null;
  actual: number | null;
  unit: string | null;
  potency: string | null;
  isSpeech?: boolean;
  isReport?: boolean;
  isPreliminary?: boolean;
  lastUpdated?: number;
}

const BASE = "https://calendar-api.fxstreet.com/en/api/v1/eventDates";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; rngcrypto-signals)", Referer: "https://www.fxstreet.com/", Accept: "application/json" };
const TTL = 10 * 60_000;
const BACK_DAYS = 7;
const AHEAD_DAYS = 21;
// FXStreet country codes. "EMU" is the Eurozone, "UK" (not GB) is Britain.
export const FX_COUNTRIES = ["US", "EMU", "UK", "JP", "CN", "DE", "CA", "CH", "AU"] as const;

let cache: { items: FxItem[]; at: number; ok: boolean } | null = null;

function iso(ms: number) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function fetchCountry(country: string, from: number, to: number): Promise<FxItem[] | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10_000);
    const r = await fetch(`${BASE}/${iso(from)}/${iso(to)}?countries=${country}`, { headers: HEADERS, signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) return null;
    const data = (await r.json()) as FxItem[];
    if (!Array.isArray(data)) return null;
    return data.filter((x) => x && x.countryCode && x.dateUtc && x.name);
  } catch {
    return null;
  }
}

// maxAgeMs lets the release verifier poll faster than the calendar's 10-minute cache during a release window.
export async function fetchFxStreet(maxAgeMs = TTL): Promise<FxItem[]> {
  if (cache && Date.now() - cache.at < Math.min(maxAgeMs, TTL)) return cache.items;
  const from = Date.now() - BACK_DAYS * 86400e3;
  const to = Date.now() + AHEAD_DAYS * 86400e3;
  const results = await Promise.all(FX_COUNTRIES.map((c) => fetchCountry(c, from, to)));
  const us = results[0];
  if (!us) {
    // US feed is the one that matters; without it keep the old items and retry in a minute.
    cache = { items: cache?.items ?? [], at: Date.now() - TTL + 60_000, ok: false };
    return cache.items;
  }
  const items: FxItem[] = [];
  for (const list of results) if (list) items.push(...list);
  cache = { items, at: Date.now(), ok: true };
  return items;
}

export function fxStatus(): { ok: boolean; count: number; at: string | null } {
  return { ok: cache?.ok ?? false, count: cache?.items.length ?? 0, at: cache ? new Date(cache.at).toISOString() : null };
}

// FXStreet naming → taxonomy def id, keyed by country so "Consumer Price Index (YoY)" for the Eurozone does not
// collide with the US one. Order matters: more specific first. Only numeric level lines are mapped; FXStreet's
// duplicate "Change" lines (housing, auctions' bid-to-cover, etc.) are skipped on purpose.
const FX_ALIASES: Record<string, [RegExp, string][]> = {
  US: [
    // Inflation
    [/^consumer price index ex food & energy \(mom\)$/i, "core_cpi_mom"],
    [/^consumer price index ex food & energy \(yoy\)$/i, "core_cpi_yoy"],
    [/^consumer price index \(mom\)$/i, "cpi_mom"],
    [/^consumer price index \(yoy\)$/i, "cpi_yoy"],
    [/^producer price index ex food & energy \(mom\)$/i, "core_ppi_mom"],
    [/^producer price index ex food & energy \(yoy\)$/i, "core_ppi_yoy"],
    [/^producer price index \(mom\)$/i, "ppi_mom"],
    [/^producer price index \(yoy\)$/i, "ppi_yoy"],
    [/^core personal consumption expenditures - price index \(mom\)$/i, "core_pce_mom"],
    [/^core personal consumption expenditures - price index \(yoy\)$/i, "core_pce_yoy"],
    [/^personal consumption expenditures - price index \(mom\)$/i, "pce_mom"],
    [/^personal consumption expenditures - price index \(yoy\)$/i, "pce_yoy"],
    [/^core personal consumption expenditures \(qoq\)$/i, "core_pce_qq"],
    [/^gross domestic product price index$/i, "gdp_price"],
    [/^import price index \(mom\)$/i, "import_prices"],
    [/^ism manufacturing prices paid$/i, "ism_mfg_prices"],
    [/^ism services prices paid$/i, "ism_svc_prices"],
    [/^uom 1-year consumer inflation expectations$/i, "uom_infl_exp"],
    [/^uom 5-year consumer inflation expectations?$/i, "uom_5y_infl_exp"],
    // Labor
    [/^nonfarm payrolls$/i, "nfp"],
    [/^nonfarm payrolls benchmark revision$/i, "nfp_benchmark"],
    [/^unemployment rate$/i, "unemployment"],
    [/^average hourly earnings \(mom\)$/i, "ahe_mom"],
    [/^average hourly earnings \(yoy\)$/i, "ahe_yoy"],
    [/^initial jobless claims$/i, "claims"],
    [/^continuing jobless claims$/i, "continuing_claims"],
    [/^jolts job openings$/i, "jolts"],
    [/^adp employment change$/i, "adp"],
    [/^challenger job cuts$/i, "challenger"],
    [/^employment cost index$/i, "eci"],
    [/^unit labor costs$/i, "ulc"],
    [/^nonfarm productivity$/i, "productivity"],
    // Growth
    [/^gross domestic product annualized$/i, "gdp_qq"],
    [/^retail sales \(mom\)$/i, "retail_mom"],
    [/^retail sales ex autos \(mom\)$/i, "core_retail_mom"],
    [/^retail sales control group$/i, "retail_control"],
    [/^personal spending$/i, "personal_spending"],
    [/^personal income \(mom\)$/i, "personal_income"],
    [/^industrial production \(mom\)$/i, "industrial_production"],
    [/^capacity utilization$/i, "capacity_util"],
    [/^factory orders \(mom\)$/i, "factory_orders"],
    [/^durable goods orders$/i, "durable_goods"],
    [/^durable goods orders ex transportation$/i, "core_durable"],
    [/^nondefense capital goods orders ex aircraft$/i, "core_capex"],
    [/^ism manufacturing pmi$/i, "ism_mfg"],
    [/^ism services pmi$/i, "ism_svc"],
    [/^chicago pmi$/i, "chicago_pmi"],
    [/^s&p global (manufacturing|services) pmi$/i, "flash_pmi"],
    [/^s&p global composite pmi$/i, "composite_pmi"],
    [/^(ny empire state manufacturing index|philadelphia fed manufacturing survey|richmond fed manufacturing index|dallas fed manufacturing business index|kansas fed manufacturing activity)$/i, "empire_philly"],
    [/^chicago fed national activity index\s*$/i, "cfnai"],
    [/^total vehicle sales$/i, "vehicle_sales"],
    [/^wholesale inventories$/i, "wholesale_inv"],
    [/^business inventories$/i, "business_inv"],
    // Sentiment
    [/^consumer confidence$/i, "cb_confidence"],
    [/^michigan consumer sentiment index$/i, "uom_sentiment"],
    [/^nfib business optimism index$/i, "nfib"],
    // Housing
    [/^housing starts \(mom\)$/i, "housing_starts"],
    [/^building permits \(mom\)$/i, "building_permits"],
    [/^existing home sales \(mom\)$/i, "existing_home_sales"],
    [/^new home sales \(mom\)$/i, "new_home_sales"],
    [/^pending home sales \(mom\)$/i, "pending_home_sales"],
    [/^nahb housing market index$/i, "nahb"],
    [/^s&p\/case-shiller home price indices \(yoy\)$/i, "case_shiller"],
    [/^housing price index \(mom\)$/i, "fhfa_hpi"],
    [/^construction spending \(mom\)$/i, "construction_spending"],
    [/^mba mortgage applications$/i, "mba_mortgage"],
    // Trade, fiscal, flows
    [/^goods and services trade balance$/i, "trade_balance"],
    [/^goods trade balance$/i, "goods_trade_balance"],
    [/^current account$/i, "current_account"],
    [/^monthly budget statement$/i, "budget"],
    [/^net long-term tic flows$/i, "tic_flows"],
    [/^consumer credit change$/i, "consumer_credit"],
    // Fed
    [/^fed interest rate decision$/i, "fed_funds"],
    [/^fed monetary policy statement$/i, "fomc_statement"],
    [/^fomc press conference$/i, "fomc_presser"],
    [/^fomc minutes$/i, "fomc_minutes"],
    [/^fomc economic projections$/i, "fomc_projections"],
    [/^fed chair .* testif/i, "fed_testimony"],
    [/^fed monetary policy report$/i, "fed_testimony"],
    [/^jackson hole symposium$/i, "jackson_hole"],
    [/^loan officer survey$/i, "sloos"],
    [/^fed's .* speech$|^fed's beige book$|^fed's chair/i, "fed_speech"],
    [/^bank stress test results$/i, "fed_speech"],
    // Energy
    [/^eia crude oil stocks change$/i, "eia_crude"],
    [/^eia gasoline stocks change$/i, "eia_gasoline"],
    [/^eia distillate stocks change$/i, "eia_distillate"],
    [/^api weekly crude oil stock$/i, "api_crude"],
    [/^baker hughes us oil rig count$/i, "baker_hughes"],
    [/^eia natural gas storage change$/i, "natgas"],
    // Positioning
    [/^cftc gold nc net positions$/i, "cftc_gold"],
    [/^cftc oil nc net positions$/i, "cftc_oil"],
    [/^cftc s&p 500 nc net positions$/i, "cftc_spx"],
    // Treasury
    [/^(10-year note|30-year bond) auction$/i, "treasury_auction"],
    [/^(2-year note|3-year note|5-year note|7-year note|20-year bond|(5|10|30)-year tips) auction$/i, "treasury_auction_short"],
    // Political / market structure
    [/^us (midterm|presidential) elections?$/i, "us_election"],
  ],
  EMU: [
    [/^ecb main refinancing operations rate$/i, "ecb_rate"],
    [/^ecb rate on deposit facility$/i, "ecb_deposit"],
    [/^ecb monetary policy statement$/i, "ecb_statement"],
    [/^ecb press conference$/i, "ecb_presser"],
    [/^ecb monetary policy meeting accounts$/i, "ecb_minutes"],
    [/^ecb's president .* speech$/i, "ecb_speech"],
    [/^core harmonized index of consumer prices \(yoy\)$/i, "eu_core_hicp_yoy"],
    [/^harmonized index of consumer prices \(yoy\)$/i, "eu_hicp_yoy"],
    [/^gross domestic product s\.a\. \(qoq\)$/i, "eu_gdp_qq"],
    [/^hcob (manufacturing|services|composite) pmi$/i, "eu_pmi"],
  ],
  DE: [
    [/^harmonized index of consumer prices \(yoy\)$/i, "de_hicp_yoy"],
    [/^hcob manufacturing pmi$/i, "de_pmi"],
    [/^ifo – business climate$|^ifo - business climate$/i, "de_ifo"],
    [/^zew survey – economic sentiment$|^zew survey - economic sentiment$/i, "de_zew"],
  ],
  UK: [
    [/^boe interest rate decision$/i, "boe_rate"],
    [/^boe (minutes|monetary policy summary|monetary policy report)$/i, "boe_statement"],
    [/^boe's governor .* speech$/i, "boe_speech"],
    [/^consumer price index \(yoy\)$/i, "uk_cpi_yoy"],
    [/^core consumer price index \(yoy\)$/i, "uk_core_cpi_yoy"],
    [/^gross domestic product \(qoq\)$/i, "uk_gdp_qq"],
    [/^s&p global (manufacturing|services|composite) pmi$/i, "uk_pmi"],
  ],
  JP: [
    [/^boj interest rate decision$/i, "boj_rate"],
    [/^boj monetary policy statement$/i, "boj_statement"],
    [/^boj press conference$/i, "boj_presser"],
    [/^boj governor .* speech$/i, "boj_speech"],
    [/^tokyo consumer price index \(yoy\)$/i, "tokyo_cpi_yoy"],
    [/^gross domestic product \(qoq\)$/i, "jp_gdp_qq"],
    [/^tankan large manufacturing index$/i, "tankan"],
    [/^national cpi ex fresh food \(yoy\)$/i, "jp_cpi_yoy"],
  ],
  CN: [
    [/^consumer price index \(yoy\)$/i, "cn_cpi_yoy"],
    [/^gross domestic product \(yoy\)$/i, "cn_gdp_yoy"],
    [/^industrial production \(yoy\)$/i, "cn_ip_yoy"],
    [/^retail sales \(yoy\)$/i, "cn_retail_yoy"],
    [/^nbs manufacturing pmi$/i, "cn_nbs_pmi"],
    [/^nbs non-manufacturing pmi$/i, "cn_nbs_services_pmi"],
    [/^(ratingdog|caixin) manufacturing pmi$/i, "cn_caixin_pmi"],
    [/^(ratingdog|caixin) services pmi$/i, "cn_caixin_services_pmi"],
    [/^pboc interest rate decision$|^(1|5)-year loan prime rate$/i, "pboc_lpr"],
    [/^trade balance usd$/i, "cn_trade"],
    [/^exports \(yoy\)$/i, "cn_exports_yoy"],
    [/^imports \(yoy\)$/i, "cn_imports_yoy"],
    [/^producer price index \(yoy\)$/i, "cn_ppi_yoy"],
  ],
  CA: [
    [/^boc interest rate decision$/i, "boc_rate"],
    [/^consumer price index \(yoy\)$/i, "ca_cpi_yoy"],
  ],
  CH: [[/^snb interest rate decision$/i, "snb_rate"]],
  AU: [
    [/^rba interest rate decision$/i, "rba_rate"],
    [/^consumer price index \(yoy\)$/i, "au_cpi_yoy"],
  ],
};

const defById = new Map(EVENT_DEFS.map((d) => [d.id, d]));

export function fxDefFor(name: string, country = "US"): MacroEventDef | null {
  const n = name.trim();
  const list = FX_ALIASES[country];
  if (!list) return null;
  for (const [re, id] of list) {
    if (re.test(n)) return defById.get(id) ?? null;
  }
  return null;
}

// FXStreet numbers are already in the display scale (NFP 90.0 with potency K, EIA -0.3 with potency M, CPI 0.4 %).
// Only the mismatch cases need scaling.
export function fxValue(v: number | null | undefined, potency: string | null | undefined, unit: MacroEventDef["unit"]): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const p = (potency ?? "").toUpperCase();
  if (unit === "k" && p === "M") return v * 1000;
  if (unit === "m" && p === "K") return v / 1000;
  if (unit === "mb" && p === "K") return v / 1000;
  if (unit === "b" && p === "M") return v / 1000;
  if (unit === "b" && p === "K") return v / 1e6;
  return v;
}

const dayKey = (isoStr: string) => isoStr.slice(0, 10);

export function fxToScheduled(items: FxItem[], fromMs: number, toMs: number, retrievedAt: string): ScheduledEvent[] {
  const out: ScheduledEvent[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const def = fxDefFor(it.name, it.countryCode);
    if (!def) continue;
    const time = new Date(it.dateUtc);
    const ms = time.getTime();
    if (isNaN(ms) || ms < fromMs || ms > toMs) continue;
    const id = `${def.id}-${dayKey(time.toISOString())}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const text = def.unit === "text";
    const forecast = text ? null : fxValue(it.consensus, it.potency, def.unit);
    const prevNum = text ? null : fxValue(it.revised ?? it.previous, it.potency, def.unit);
    out.push({
      id,
      defId: def.id,
      title: def.title,
      time: time.toISOString(),
      importance: def.importance,
      forecast,
      forecastRaw: forecast == null ? null : formatValue(forecast, def.unit, def.decimals),
      previous: prevNum,
      previousRaw: prevNum == null ? null : formatValue(prevNum, def.unit, def.decimals) + (it.revised != null ? " (rev.)" : ""),
      unit: def.unit,
      source: "fxstreet",
      retrievedAt,
      country: it.countryCode,
    });
  }
  return out;
}

// Actual for a given event once FXStreet has published it (within 6h of the scheduled time).
export function fxActualFor(items: FxItem[], defId: string, eventTimeIso: string): { value: number; raw: string; updatedAt: string | null } | null {
  const def = defById.get(defId);
  if (!def) return null;
  const t = new Date(eventTimeIso).getTime();
  for (const it of items) {
    if (it.actual == null) continue;
    const d = fxDefFor(it.name, it.countryCode);
    if (!d || d.id !== defId) continue;
    const dt = Math.abs(new Date(it.dateUtc).getTime() - t);
    if (dt > 6 * 3600e3) continue;
    const v = fxValue(it.actual, it.potency, def.unit);
    if (v == null) continue;
    return { value: v, raw: formatValue(v, def.unit, def.decimals), updatedAt: it.lastUpdated ? new Date(it.lastUpdated * 1000).toISOString() : null };
  }
  return null;
}
