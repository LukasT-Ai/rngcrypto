import type { MacroEventDef, ReleaseValue, RevisionStatus, ScheduledEvent, SourceProvider, Transform, VerifiedRelease } from "./types";
import { fetchFxStreet, fxActualFor, fxStatus } from "./fxstreet";
import { newsApiCrudeActual } from "./news-actual";

// Primary-source adapters. Nothing here invents a number: a release is "verified" only when an authoritative
// series has published the period the event refers to, after the scheduled release time.

const FRED_KEY = process.env.FRED_API_KEY ?? "";
const EIA_KEY = process.env.EIA_API_KEY ?? "";

export function providerEnabled(p: SourceProvider): boolean {
  if (p === "BLS") return true;
  if (p === "FRED") return !!FRED_KEY;
  if (p === "EIA") return !!EIA_KEY;
  if (p === "FXSTREET" || p === "NEWS") return true;
  return false;
}

export function sourceStatus(): { provider: SourceProvider; enabled: boolean; note: string }[] {
  return [
    { provider: "BLS", enabled: true, note: "CPI, PPI, payrolls, unemployment, earnings, JOLTS (public API, 25 req/day unregistered)" },
    { provider: "FRED", enabled: !!FRED_KEY, note: FRED_KEY ? "PCE, claims, GDP, retail sales, fed funds" : "Set FRED_API_KEY to verify PCE, claims, GDP, retail sales, fed funds" },
    { provider: "EIA", enabled: !!EIA_KEY, note: EIA_KEY ? "Weekly petroleum status report incl. Cushing, products, production" : "Set EIA_API_KEY to verify EIA inventories and report internals" },
    { provider: "FXSTREET", enabled: true, note: `FXStreet calendar: consensus, previous and published actuals for every US release (secondary source for ISM, ADP, API crude, surveys and for keys not set)${fxStatus().ok ? "" : " — feed currently unreachable"}` },
    { provider: "NONE", enabled: false, note: "Fed speeches, FOMC text: no number — the market reaction is the data" },
  ];
}

async function fetchJSON<T>(url: string, init?: RequestInit, ms = 9000): Promise<T | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Reference period the event reports on: monthly data released in month M covers M-1 (CPI, NFP, PPI, JOLTS lags two).
export function referencePeriod(def: MacroEventDef, eventTime: Date): { year: number; month: number } {
  const d = new Date(eventTime);
  const lag = def.id === "jolts" ? 2 : 1;
  d.setUTCMonth(d.getUTCMonth() - lag);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export interface Obs {
  period: string;
  year: number;
  month: number;
  value: number;
  footnote: string;
}

export function applyTransform(obs: Obs[], transform: Transform): number | null {
  const v0 = obs[0]?.value;
  const v1 = obs[1]?.value;
  const v12 = obs[12]?.value;
  if (v0 == null) return null;
  switch (transform) {
    case "level":
      return v0;
    case "level_m":
      return v0 / 1000;
    case "mom_pct":
      return v1 ? ((v0 / v1 - 1) * 100) : null;
    case "yoy_pct":
      return v12 ? ((v0 / v12 - 1) * 100) : null;
    case "diff_k":
      return v1 != null ? v0 - v1 : null;
    case "weekly_change_mb":
      return v1 != null ? (v0 - v1) / 1000 : null;
  }
}

function revisionFrom(footnote: string): RevisionStatus {
  const f = footnote.toLowerCase();
  if (f.includes("preliminary")) return "preliminary";
  if (f.includes("revised")) return "revised";
  return "unknown";
}

// ── BLS ────────────────────────────────────────────────────────────────────
interface BLSResponse {
  status: string;
  Results?: { series: { seriesID: string; data: { year: string; period: string; value: string; footnotes: { text?: string }[] }[] }[] };
}

const blsCache = new Map<string, { obs: Obs[]; at: number }>();

export async function blsSeries(series: string, maxAgeMs = 20_000): Promise<Obs[] | null> {
  const hit = blsCache.get(series);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.obs;
  const year = new Date().getUTCFullYear();
  const body = JSON.stringify({ seriesid: [series], startyear: String(year - 1), endyear: String(year) });
  const data = await fetchJSON<BLSResponse>("https://api.bls.gov/publicAPI/v2/timeseries/data/", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const s = data?.Results?.series?.[0];
  if (!s) return hit?.obs ?? null;
  const obs: Obs[] = s.data
    .filter((d) => /^M\d\d$/.test(d.period))
    .map((d) => ({ period: `${d.year}-${d.period}`, year: parseInt(d.year, 10), month: parseInt(d.period.slice(1), 10), value: parseFloat(d.value), footnote: d.footnotes?.map((f) => f.text ?? "").join(" ") ?? "" }))
    .sort((a, b) => b.year - a.year || b.month - a.month);
  blsCache.set(series, { obs, at: Date.now() });
  return obs;
}

// ── FRED ───────────────────────────────────────────────────────────────────
interface FredResponse {
  observations?: { date: string; value: string }[];
}
const fredCache = new Map<string, { obs: Obs[]; at: number }>();

export async function fredSeries(series: string, maxAgeMs = 20_000): Promise<Obs[] | null> {
  if (!FRED_KEY) return null;
  const hit = fredCache.get(series);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.obs;
  const data = await fetchJSON<FredResponse>(`https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${FRED_KEY}&sort_order=desc&limit=14&file_type=json`);
  if (!data?.observations) return hit?.obs ?? null;
  const obs: Obs[] = data.observations
    .filter((o) => o.value !== ".")
    .map((o) => {
      const d = new Date(o.date);
      return { period: o.date, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, value: parseFloat(o.value), footnote: "" };
    });
  fredCache.set(series, { obs, at: Date.now() });
  return obs;
}

// ── EIA ────────────────────────────────────────────────────────────────────
interface EIAResponse {
  response?: { data?: { period: string; value: string | number; series: string }[] };
}
const eiaCache = new Map<string, { obs: Obs[]; at: number }>();

export async function eiaWeekly(series: string, maxAgeMs = 20_000): Promise<Obs[] | null> {
  if (!EIA_KEY) return null;
  const hit = eiaCache.get(series);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.obs;
  const url = `https://api.eia.gov/v2/petroleum/sum/sndw/data/?api_key=${EIA_KEY}&frequency=weekly&data[0]=value&facets[series][]=${series}&sort[0][column]=period&sort[0][direction]=desc&length=4`;
  const data = await fetchJSON<EIAResponse>(url);
  const rows = data?.response?.data;
  if (!rows) return hit?.obs ?? null;
  const obs: Obs[] = rows.map((r) => {
    const d = new Date(r.period);
    return { period: r.period, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, value: parseFloat(String(r.value)), footnote: "" };
  });
  eiaCache.set(series, { obs, at: Date.now() });
  return obs;
}

// ── Validator ──────────────────────────────────────────────────────────────

export function periodMatches(def: MacroEventDef, obs: Obs, eventTime: Date): boolean {
  if (def.source.provider === "EIA") {
    // Weekly: the report published on event day covers the week ending the previous Friday.
    const d = new Date(obs.period).getTime();
    return eventTime.getTime() - d < 10 * 86400e3 && eventTime.getTime() - d > 0;
  }
  if (def.id === "claims") {
    const d = new Date(obs.period).getTime();
    return eventTime.getTime() - d < 8 * 86400e3 && eventTime.getTime() - d > 0;
  }
  if (def.id === "gdp_qq" || def.id === "fed_funds") {
    const d = new Date(obs.period).getTime();
    return eventTime.getTime() - d < 100 * 86400e3;
  }
  const ref = referencePeriod(def, eventTime);
  return obs.year === ref.year && obs.month === ref.month;
}

async function candidateFrom(def: MacroEventDef, event: ScheduledEvent, provider: SourceProvider, series: string, transform: Transform): Promise<ReleaseValue | null> {
  const eventTime = new Date(event.time);
  if (Date.now() < eventTime.getTime()) return null;
  const obs = provider === "BLS" ? await blsSeries(series) : provider === "FRED" ? await fredSeries(series) : provider === "EIA" ? await eiaWeekly(series) : null;
  if (!obs || obs.length === 0) return null;
  const latest = obs[0];
  if (!periodMatches(def, latest, eventTime)) return null;
  const value = applyTransform(obs, transform);
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10 ** def.decimals) / 10 ** def.decimals;
  return {
    value: rounded,
    raw: String(rounded),
    period: latest.period,
    revisionStatus: revisionFrom(latest.footnote),
    provider,
    series,
    sourceTimestamp: null,
    retrievedAt: new Date().toISOString(),
    priorRevised: null,
  };
}

const FRED_MIRRORS: Record<string, { series: string; transform: Transform }> = {
  cpi_mom: { series: "CPIAUCSL", transform: "mom_pct" },
  core_cpi_mom: { series: "CPILFESL", transform: "mom_pct" },
  nfp: { series: "PAYEMS", transform: "diff_k" },
  unemployment: { series: "UNRATE", transform: "level" },
};

// Secondary source: the FXStreet calendar's published actual. Used when a release has no primary adapter
// (ISM, ADP, API crude, surveys) or the primary's key is not configured. Text events never get a number.
async function fxRelease(def: MacroEventDef, event: ScheduledEvent, checkedAt: string, why: string): Promise<VerifiedRelease> {
  if (def.unit === "text") {
    return { eventId: event.id, status: "unavailable", actual: null, candidates: [], note: "Text event — the market reaction is the data", checkedAt };
  }
  if (Date.now() < new Date(event.time).getTime()) {
    return { eventId: event.id, status: "awaiting", actual: null, candidates: [], note: "Not released yet", checkedAt };
  }
  const age = Date.now() - new Date(event.time).getTime();
  // Poll FXStreet every 15s for the first hour after release, then once a minute; the calendar cache is 10 min otherwise.
  const items = await fetchFxStreet(age < 3600e3 ? 15_000 : 60_000);
  const hit = fxActualFor(items, def.id, event.time);
  if (!hit) {
    // API crude: calendars lag the wire by many minutes; Reuters/OilPrice headlines carry the number first.
    if (def.id === "api_crude") {
      const news = await newsApiCrudeActual(event.time, age < 3600e3 ? 20_000 : 120_000).catch(() => null);
      if (news) {
        const actual: ReleaseValue = { value: news.value, raw: news.raw, period: event.time.slice(0, 10), revisionStatus: "preliminary", provider: "NEWS", series: `${news.source}: ${news.headline}`, sourceTimestamp: news.publishedAt, retrievedAt: checkedAt, priorRevised: null };
        return { eventId: event.id, status: "verified", actual, candidates: [actual], note: `News-reported (${news.source}): "${news.headline}" — replaced by the FXStreet calendar actual when it lands`, checkedAt };
      }
    }
    return { eventId: event.id, status: "awaiting", actual: null, candidates: [], note: `${why}; FXStreet has not published the actual yet${def.id === "api_crude" ? " and no wire headline carries the API number yet" : ""}`, checkedAt };
  }
  const actual: ReleaseValue = { value: hit.value, raw: hit.raw, period: event.time.slice(0, 10), revisionStatus: "unknown", provider: "FXSTREET", series: def.id, sourceTimestamp: hit.updatedAt, retrievedAt: checkedAt, priorRevised: null };
  return { eventId: event.id, status: "verified", actual, candidates: [actual], note: `FXStreet calendar actual (secondary source; ${why})`, checkedAt };
}

export async function fetchRelease(def: MacroEventDef, event: ScheduledEvent): Promise<VerifiedRelease> {
  const checkedAt = new Date().toISOString();
  const src = def.source;
  if (src.provider === "NONE" || !src.series || !src.transform) {
    return fxRelease(def, event, checkedAt, "no primary machine-readable source");
  }
  if (!providerEnabled(src.provider)) {
    return fxRelease(def, event, checkedAt, `${src.provider}_API_KEY not set`);
  }

  const candidates: ReleaseValue[] = [];
  const primary = await candidateFrom(def, event, src.provider, src.series, src.transform);
  if (primary) candidates.push(primary);
  const mirror = FRED_MIRRORS[def.id];
  if (mirror && providerEnabled("FRED")) {
    const m = await candidateFrom(def, event, "FRED", mirror.series, mirror.transform);
    if (m) candidates.push(m);
  }

  if (candidates.length === 0) {
    return { eventId: event.id, status: "awaiting", actual: null, candidates, note: `${src.provider} has not published the reference period yet`, checkedAt };
  }

  if (candidates.length >= 2) {
    const tol = Math.max((def.typicalSurpriseSD ?? 0.1) * 0.5, 10 ** -def.decimals);
    const spread = Math.abs(candidates[0].value - candidates[1].value);
    if (spread > tol) {
      return { eventId: event.id, status: "conflict", actual: null, candidates, note: `Sources disagree (${candidates.map((c) => `${c.provider} ${c.value}`).join(" vs ")}) — signal paused`, checkedAt };
    }
  }

  let actual = candidates[0];
  if (src.components && src.provider === "EIA") {
    const comps: Record<string, number | null> = {};
    for (const c of src.components) {
      const obs = await eiaWeekly(c.series);
      comps[c.name] = obs && obs.length ? applyTransform(obs, c.transform) : null;
    }
    actual = { ...actual, components: comps };
  }
  return { eventId: event.id, status: "verified", actual, candidates, note: `${actual.provider} ${actual.series} · period ${actual.period} · ${actual.revisionStatus}`, checkedAt };
}

// Latest CPI y/y for regime classification (no key needed).
export async function latestCpiYoY(): Promise<number | null> {
  const obs = await blsSeries("CUUR0000SA0", 6 * 3600e3);
  if (!obs || obs.length < 13) return null;
  const v = applyTransform(obs, "yoy_pct");
  return v == null ? null : Math.round(v * 10) / 10;
}

// Latest observations for a def's primary series (null when the provider is not configured).
export async function primaryObservations(def: MacroEventDef, maxAgeMs = 10 * 60e3): Promise<Obs[] | null> {
  const src = def.source;
  if (src.provider === "NONE" || !src.series || !providerEnabled(src.provider)) return null;
  if (src.provider === "BLS") return blsSeries(src.series, maxAgeMs);
  if (src.provider === "FRED") return fredSeries(src.series, maxAgeMs);
  if (src.provider === "EIA") return eiaWeekly(src.series, maxAgeMs);
  return null;
}
