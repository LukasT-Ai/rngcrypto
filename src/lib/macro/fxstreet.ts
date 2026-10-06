import type { MacroEventDef, ScheduledEvent } from "./types";
import { EVENT_DEFS, formatValue } from "./taxonomy";

// FXStreet economic calendar (public JSON, no key). Carries consensus, previous (and revised previous) and the
// actual once released, for US events ~weeks ahead. Reachable from cloud egress where Fair Economy rate-limits.

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
const BACK_DAYS = 3;
const AHEAD_DAYS = 21;

let cache: { items: FxItem[]; at: number; ok: boolean } | null = null;

function iso(ms: number) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// maxAgeMs lets the release verifier poll faster than the calendar's 10-minute cache during a release window.
export async function fetchFxStreet(maxAgeMs = TTL): Promise<FxItem[]> {
  if (cache && Date.now() - cache.at < Math.min(maxAgeMs, TTL)) return cache.items;
  const from = Date.now() - BACK_DAYS * 86400e3;
  const to = Date.now() + AHEAD_DAYS * 86400e3;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10_000);
    const r = await fetch(`${BASE}/${iso(from)}/${iso(to)}?countries=US`, { headers: HEADERS, signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) {
      cache = { items: cache?.items ?? [], at: Date.now() - TTL + 60_000, ok: false }; // retry in a minute
      return cache.items;
    }
    const data = (await r.json()) as FxItem[];
    if (!Array.isArray(data)) return cache?.items ?? [];
    cache = { items: data.filter((x) => x && x.countryCode === "US" && x.dateUtc && x.name), at: Date.now(), ok: true };
    return cache.items;
  } catch {
    cache = { items: cache?.items ?? [], at: Date.now() - TTL + 60_000, ok: false };
    return cache.items;
  }
}

export function fxStatus(): { ok: boolean; count: number; at: string | null } {
  return { ok: cache?.ok ?? false, count: cache?.items.length ?? 0, at: cache ? new Date(cache.at).toISOString() : null };
}

// FXStreet naming → taxonomy def id. Order matters: more specific first.
const FX_ALIASES: [RegExp, string][] = [
  [/^consumer price index ex food & energy \(mom\)$/i, "core_cpi_mom"],
  [/^consumer price index \(mom\)$/i, "cpi_mom"],
  [/^consumer price index \(yoy\)$/i, "cpi_yoy"],
  [/^producer price index ex food & energy \(mom\)$/i, "core_ppi_mom"],
  [/^producer price index \(mom\)$/i, "ppi_mom"],
  [/^core personal consumption expenditures - price index \(mom\)$/i, "core_pce_mom"],
  [/^personal consumption expenditures - price index \(mom\)$/i, "pce_mom"],
  [/^nonfarm payrolls$/i, "nfp"],
  [/^unemployment rate$/i, "unemployment"],
  [/^average hourly earnings \(mom\)$/i, "ahe_mom"],
  [/^initial jobless claims$/i, "claims"],
  [/^jolts job openings$/i, "jolts"],
  [/^adp employment change$/i, "adp"],
  [/^gross domestic product annualized$/i, "gdp_qq"],
  [/^retail sales \(mom\)$/i, "retail_mom"],
  [/^retail sales ex autos \(mom\)$/i, "core_retail_mom"],
  [/^ism manufacturing pmi$/i, "ism_mfg"],
  [/^ism services pmi$/i, "ism_svc"],
  [/^consumer confidence$/i, "cb_confidence"],
  [/^michigan consumer sentiment index$/i, "uom_sentiment"],
  [/^uom 1-year consumer inflation expectations$/i, "uom_infl_exp"],
  [/^fed interest rate decision$/i, "fed_funds"],
  [/^fed monetary policy statement$/i, "fomc_statement"],
  [/^fomc press conference$/i, "fomc_presser"],
  [/^fomc minutes$/i, "fomc_minutes"],
  [/^fed's .* speech$|^fed's beige book$|^fed's chair powell/i, "fed_speech"],
  [/^eia crude oil stocks change$/i, "eia_crude"],
  [/^api weekly crude oil stock$/i, "api_crude"],
  [/^baker hughes us oil rig count$/i, "baker_hughes"],
  [/^eia natural gas storage change$/i, "natgas"],
  [/^(10-year note|30-year bond) auction$/i, "treasury_auction"],
  [/^durable goods orders$/i, "durable_goods"],
  [/^(ny empire state manufacturing index|philadelphia fed manufacturing survey|richmond fed manufacturing index)$/i, "empire_philly"],
  [/^s&p global (manufacturing|services) pmi$/i, "flash_pmi"],
];

export function fxDefFor(name: string): MacroEventDef | null {
  const n = name.trim();
  for (const [re, id] of FX_ALIASES) {
    if (re.test(n)) return EVENT_DEFS.find((d) => d.id === id) ?? null;
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
  return v;
}

const dayKey = (isoStr: string) => isoStr.slice(0, 10);

export function fxToScheduled(items: FxItem[], fromMs: number, toMs: number, retrievedAt: string): ScheduledEvent[] {
  const out: ScheduledEvent[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const def = fxDefFor(it.name);
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
    });
  }
  return out;
}

// Actual for a given event once FXStreet has published it (within 6h of the scheduled time).
export function fxActualFor(items: FxItem[], defId: string, eventTimeIso: string): { value: number; raw: string; updatedAt: string | null } | null {
  const def = EVENT_DEFS.find((d) => d.id === defId);
  if (!def) return null;
  const t = new Date(eventTimeIso).getTime();
  for (const it of items) {
    if (it.actual == null) continue;
    const d = fxDefFor(it.name);
    if (!d || d.id !== defId) continue;
    const dt = Math.abs(new Date(it.dateUtc).getTime() - t);
    if (dt > 6 * 3600e3) continue;
    const v = fxValue(it.actual, it.potency, def.unit);
    if (v == null) continue;
    return { value: v, raw: formatValue(v, def.unit, def.decimals), updatedAt: it.lastUpdated ? new Date(it.lastUpdated * 1000).toISOString() : null };
  }
  return null;
}
