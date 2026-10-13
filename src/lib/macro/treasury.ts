// features.macroRates: 10-year real yield from the Treasury real-yield-curve XML (keyless, daily) and DXY from
// Yahoo DX-Y.NYB daily closes. Encoded as 5-day CHANGES gated by the rolling 30-day correlation with the asset's
// own daily returns (research 1.13, 3.1): |corr| < 0.3 silences the feature so it goes quiet in decoupled regimes.
// Cached 6h. Pure transforms are exported for tests; the engine supplies the asset's daily closes.

import { FeedCache, getJSON, getText, pearson, round, roundOrNull } from "@/lib/signals/features/fetch";
import type { MacroRatesFeature } from "@/lib/signals/features/types";

export const MACRO_RATES_TTL = 6 * 3600e3;
export const CORR_GATE = 0.3;
export const CORR_WINDOW = 30;
const MIN_OVERLAP = 15;

export interface DailyPoint {
  day: string; // YYYY-MM-DD (UTC)
  value: number;
}

/** Parse the Treasury OData XML feed into (day, TC_10YEAR) points, oldest first. */
export function parseTreasuryRealYield(xml: string | null, field = "TC_10YEAR"): DailyPoint[] {
  if (!xml) return [];
  const out: DailyPoint[] = [];
  const entry = /<m:properties>([\s\S]*?)<\/m:properties>/g;
  let m: RegExpExecArray | null;
  while ((m = entry.exec(xml))) {
    const block = m[1];
    const date = /<d:NEW_DATE[^>]*>([\d-]+)T/.exec(block)?.[1];
    const val = new RegExp(`<d:${field}[^>]*>([-\\d.]+)<`).exec(block)?.[1];
    if (!date || val == null) continue;
    const value = parseFloat(val);
    if (Number.isFinite(value)) out.push({ day: date, value });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

interface YahooChart {
  chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
}

export function parseYahooDaily(data: YahooChart | null): DailyPoint[] {
  const res = data?.chart?.result?.[0];
  const ts = res?.timestamp ?? [];
  const closes = res?.indicators?.quote?.[0]?.close ?? [];
  const out: DailyPoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    out.push({ day: new Date(ts[i] * 1000).toISOString().slice(0, 10), value: c });
  }
  // Yahoo can repeat the live day; keep the last value per day.
  const byDay = new Map<string, number>();
  for (const p of out) byDay.set(p.day, p.value);
  return [...byDay.entries()].map(([day, value]) => ({ day, value })).sort((a, b) => a.day.localeCompare(b.day));
}

/** Change over the last 5 observations (trading days), absolute. */
export function change5d(series: DailyPoint[]): number | null {
  if (series.length < 6) return null;
  return series[series.length - 1].value - series[series.length - 6].value;
}

function dailyDiffs(series: DailyPoint[], pct: boolean): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1].value;
    const b = series[i].value;
    if (pct) {
      if (a > 0 && b > 0) out.set(series[i].day, Math.log(b / a));
    } else out.set(series[i].day, b - a);
  }
  return out;
}

/**
 * Rolling correlation of the asset's daily log returns with the driver's daily changes over the last `window`
 * overlapping days (drivers only print on weekdays, so weekend asset returns are dropped, as coupling.ts does).
 */
export function rollingCorr(asset: DailyPoint[], driver: DailyPoint[], driverIsPct: boolean, window = CORR_WINDOW): number | null {
  const ra = dailyDiffs(asset, true);
  const rd = dailyDiffs(driver, driverIsPct);
  const days = [...rd.keys()].filter((d) => ra.has(d)).sort().slice(-window);
  if (days.length < MIN_OVERLAP) return null;
  return pearson(
    days.map((d) => ra.get(d)!),
    days.map((d) => rd.get(d)!)
  );
}

export interface MacroRatesSeries {
  realYield: DailyPoint[];
  dxy: DailyPoint[];
  fetchedAt: number;
}

export function buildMacroRatesFeature(series: MacroRatesSeries | null, assetDaily: DailyPoint[], now = Date.now()): MacroRatesFeature | null {
  if (!series || (series.realYield.length === 0 && series.dxy.length === 0)) return null;
  const ry = series.realYield;
  const dxy = series.dxy;
  const ryLatest = ry[ry.length - 1] ?? null;
  const dxyLatest = dxy[dxy.length - 1] ?? null;
  const ry5 = change5d(ry);
  const dxy5 = dxy.length >= 6 && dxy[dxy.length - 6].value > 0 ? (dxy[dxy.length - 1].value / dxy[dxy.length - 6].value - 1) * 100 : null;
  const corrRy = assetDaily.length ? rollingCorr(assetDaily, ry, false) : null;
  const corrDxy = assetDaily.length ? rollingCorr(assetDaily, dxy, true) : null;
  const candidates = [corrRy, corrDxy].filter((c): c is number => c != null);
  const corr30d = candidates.length ? candidates.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : null;
  const gated = corr30d == null || Math.abs(corr30d) < CORR_GATE;
  const asOfDay = [ryLatest?.day, dxyLatest?.day].filter((d): d is string => !!d).sort().pop();
  return {
    asOf: asOfDay ? Math.min(now, Date.parse(`${asOfDay}T21:00:00Z`)) : series.fetchedAt,
    ttlMs: MACRO_RATES_TTL,
    realYield10y: roundOrNull(ryLatest?.value, 2),
    realYield5dChgBp: ry5 == null ? null : round(ry5 * 100, 1),
    dxy: roundOrNull(dxyLatest?.value, 3),
    dxy5dChgPct: roundOrNull(dxy5, 2),
    corr30d: roundOrNull(corr30d, 3),
    corrRealYield30d: roundOrNull(corrRy, 3),
    corrDxy30d: roundOrNull(corrDxy, 3),
    gated,
    realYieldSeries: ry.slice(-20).map((p) => round(p.value, 2)),
    dxySeries: dxy.slice(-20).map((p) => round(p.value, 3)),
  };
}

// ── Fetchers ────────────────────────────────────────────────────────────────

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function fetchTreasuryRealYield(now = Date.now()): Promise<DailyPoint[]> {
  // Current month plus the two before it: 5d changes and a 30-day correlation need about 45 trading days.
  const d = new Date(now);
  const months = [0, 1, 2].map((back) => monthKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1))));
  const pages = await Promise.all(
    months.map((m) =>
      getText(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_real_yield_curve&field_tdr_date_value_month=${m}`, 12000)
    )
  );
  const byDay = new Map<string, number>();
  for (const page of pages) for (const p of parseTreasuryRealYield(page)) byDay.set(p.day, p.value);
  return [...byDay.entries()].map(([day, value]) => ({ day, value })).sort((a, b) => a.day.localeCompare(b.day));
}

export async function fetchDxyDaily(): Promise<DailyPoint[]> {
  return parseYahooDaily(await getJSON<YahooChart>("https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=3mo&interval=1d", 10000));
}

const cache = new FeedCache<MacroRatesSeries>(MACRO_RATES_TTL);

/** Shared across assets (one fetch per 6h). Null when both feeds fail. */
export async function fetchMacroRatesSeries(now = Date.now()): Promise<MacroRatesSeries | null> {
  return cache.get("all", async () => {
    const [realYield, dxy] = await Promise.all([fetchTreasuryRealYield(now).catch(() => []), fetchDxyDaily().catch(() => [])]);
    if (realYield.length === 0 && dxy.length === 0) return null;
    return { realYield, dxy, fetchedAt: now };
  });
}

export function _resetMacroRatesCache() {
  cache.clear();
}
