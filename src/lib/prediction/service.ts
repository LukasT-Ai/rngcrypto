import type { MacroAsset } from "../macro/types";
import type { PMAdapterResult, PMMarket, PMOutcome, PMVenue } from "./types";
import { fetchKalshi } from "./kalshi";
import { fetchPolymarket } from "./polymarket";
import { impliedMedian } from "./ladder";

// Merges Kalshi + Polymarket into one view: Fed-meeting buckets side by side (with a blended probability and the
// venue divergence), markets grouped by macro event def for the event card, and price ladders per asset.

export type FedBucket = "hike" | "hold" | "cut25" | "cut50";
export const FED_BUCKET_LABEL: Record<FedBucket, string> = { hike: "Hike", hold: "Hold", cut25: "Cut 25bp", cut50: "Cut 50bp+" };

export interface FedMeetingOdds {
  period: string; // YYYY-MM-DD or YYYY-MM
  buckets: { bucket: FedBucket; label: string; kalshi: number | null; polymarket: number | null; blended: number | null }[];
  // Probability of any cut, blended across venues.
  cutProb: number | null;
  hikeProb: number | null;
  // Largest venue disagreement on one bucket, in probability points (0..1). null with one venue.
  divergence: number | null;
  leaning: FedBucket | null;
  urls: Partial<Record<PMVenue, string>>;
  volume: number | null;
}

export interface AssetOdds {
  asset: MacroAsset;
  // Binary and ladder markets sorted by close time then strike.
  markets: PMMarket[];
  // Plain-English one-liner, e.g. "Polymarket: 62% BTC above $120k by Oct 31"
  summary: string | null;
}

export interface PredictionState {
  asOf: string;
  venues: { venue: PMVenue; ok: boolean; note: string; count: number; retrievedAt: string }[];
  fed: FedMeetingOdds[];
  // Keyed by macro taxonomy def id ("fed_funds", "cpi_mom", "nfp", ...). fed_funds also covers fomc_* defs via eventDefIdsFor().
  byEvent: Record<string, PMMarket[]>;
  byAsset: Record<MacroAsset, AssetOdds>;
  recession: PMMarket[];
  all: PMMarket[];
}

const TTL = 60_000;
let cache: { state: PredictionState; at: number } | null = null;
let inflight: Promise<PredictionState> | null = null;

export function fedBucketFor(label: string, value?: number | null): FedBucket | null {
  const l = label.toLowerCase();
  if (/hold|no change|maintain|unchanged|pause/.test(l)) return "hold";
  if (/hike|increase|raise/.test(l)) return "hike";
  if (/cut|decrease|lower/.test(l)) {
    const n = l.match(/(\d{2,3})\s*\+?\s*bps?/);
    const bp = n ? parseInt(n[1], 10) : value != null ? Math.abs(value) : 25;
    return bp >= 50 ? "cut50" : "cut25";
  }
  if (value != null) {
    if (value > 0) return "hike";
    if (value === 0) return "hold";
    return Math.abs(value) >= 50 ? "cut50" : "cut25";
  }
  return null;
}

function bucketize(outcomes: PMOutcome[]): Partial<Record<FedBucket, number>> {
  const r: Partial<Record<FedBucket, number>> = {};
  for (const o of outcomes) {
    const b = fedBucketFor(o.label, o.value);
    if (!b) continue;
    r[b] = (r[b] ?? 0) + o.prob;
  }
  return r;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function buildFedOdds(markets: PMMarket[]): FedMeetingOdds[] {
  const decisions = markets.filter((m) => m.topic === "fed_decision" && m.period);
  const byPeriod = new Map<string, PMMarket[]>();
  for (const m of decisions) {
    const key = m.period!.slice(0, 7); // group by meeting month so YYYY-MM-DD vs YYYY-MM from two venues still align
    byPeriod.set(key, [...(byPeriod.get(key) ?? []), m]);
  }
  const out: FedMeetingOdds[] = [];
  for (const [, list] of byPeriod) {
    const per: Partial<Record<PMVenue, Partial<Record<FedBucket, number>>>> = {};
    const urls: Partial<Record<PMVenue, string>> = {};
    let volume = 0;
    let period = list[0].period!;
    for (const m of list) {
      per[m.venue] = bucketize(m.outcomes);
      urls[m.venue] = m.url;
      volume += m.volume ?? 0;
      if (m.period && m.period.length > period.length) period = m.period;
    }
    const buckets = (["hike", "hold", "cut25", "cut50"] as FedBucket[]).map((b) => {
      const k = per.kalshi?.[b] ?? null;
      const p = per.polymarket?.[b] ?? null;
      const vals = [k, p].filter((x): x is number => x != null);
      const blended = vals.length ? round3(vals.reduce((a, c) => a + c, 0) / vals.length) : null;
      return { bucket: b, label: FED_BUCKET_LABEL[b], kalshi: k == null ? null : round3(k), polymarket: p == null ? null : round3(p), blended };
    });
    const sum = (keys: FedBucket[]) => {
      const vals = buckets.filter((b) => keys.includes(b.bucket)).map((b) => b.blended).filter((x): x is number => x != null);
      return vals.length ? round3(vals.reduce((a, c) => a + c, 0)) : null;
    };
    const cutProb = sum(["cut25", "cut50"]);
    const hikeProb = sum(["hike"]);
    const diffs = buckets.filter((b) => b.kalshi != null && b.polymarket != null).map((b) => Math.abs(b.kalshi! - b.polymarket!));
    const divergence = diffs.length ? round3(Math.max(...diffs)) : null;
    let leaning: FedBucket | null = null;
    let best = -1;
    for (const b of buckets) {
      if (b.blended != null && b.blended > best) {
        best = b.blended;
        leaning = b.bucket;
      }
    }
    out.push({ period, buckets, cutProb, hikeProb, divergence, leaning, urls, volume: volume || null });
  }
  return out.sort((a, b) => a.period.localeCompare(b.period));
}

const EVENT_ALIASES: Record<string, string[]> = {
  fed_funds: ["fed_funds", "fomc_statement", "fomc_presser", "fomc_minutes", "fed_speech"],
  cpi_mom: ["cpi_mom", "core_cpi_mom", "cpi_yoy"],
  cpi_yoy: ["cpi_yoy", "cpi_mom", "core_cpi_mom"],
  nfp: ["nfp", "adp"],
  unemployment: ["unemployment", "claims"],
};

// Which macro def ids a market's eventDefId should be attached to (fed decision odds also belong on FOMC minutes etc.).
export function eventDefIdsFor(defId: string): string[] {
  return EVENT_ALIASES[defId] ?? [defId];
}

function fmtUsd(n: number): string {
  if (n >= 10000) return `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n >= 1000) return `$${Math.round(n).toLocaleString("en-US")}`;
  return `$${Math.round(n * 100) / 100}`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const venueName = (v: PMVenue) => (v === "kalshi" ? "Kalshi" : "Polymarket");

function assetSummary(asset: MacroAsset, markets: PMMarket[]): string | null {
  const parts: string[] = [];
  // 1) Market-implied median from the highest-volume ladder that still has time to run (not expiring today).
  const soon = Date.now() + 20 * 3600e3;
  // Prefer "price on <date>" ladders over path-dependent "will it hit X" ladders, and the nearest date first.
  const pathDependent = /hit|dip|how high|how low|reach/i;
  const ladders = markets
    .filter((m) => impliedMedian(m) != null && (!m.closeTime || new Date(m.closeTime).getTime() > soon))
    .sort((a, b) => Number(pathDependent.test(a.title)) - Number(pathDependent.test(b.title)) || (a.closeTime ?? "9").localeCompare(b.closeTime ?? "9") || (b.volume ?? 0) - (a.volume ?? 0));
  const lad = ladders[0];
  if (lad) {
    const med = impliedMedian(lad)!;
    parts.push(`${venueName(lad.venue)} implies ${asset} ~${fmtUsd(Math.round(med.value))} median ${pathDependent.test(lad.title) ? "high-water mark" : "price"}${lad.closeTime ? ` ${pathDependent.test(lad.title) ? "by" : "on"} ${fmtWhen(lad.closeTime)}` : ""}`);
  }
  // 2) Best binary threshold market.
  const binary = markets.filter((m) => m.strike != null && m.outcomes.length > 0).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];
  if (binary) {
    const yes = binary.outcomes.find((o) => /^yes$/i.test(o.label)) ?? binary.outcomes[0];
    parts.push(`${venueName(binary.venue)}: ${Math.round(yes.prob * 100)}% ${asset} ${binary.strikeSide === "below" ? "below" : "above"} ${fmtUsd(binary.strike!)}${binary.closeTime ? ` by ${fmtWhen(binary.closeTime)}` : ""}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function buildState(results: PMAdapterResult[]): PredictionState {
  const all = results.flatMap((r) => r.markets);
  const byEvent: Record<string, PMMarket[]> = {};
  for (const m of all) {
    if (!m.eventDefId) continue;
    for (const id of eventDefIdsFor(m.eventDefId)) byEvent[id] = [...(byEvent[id] ?? []), m];
  }
  const byAsset = {} as Record<MacroAsset, AssetOdds>;
  for (const asset of ["BTC", "GOLD", "WTI"] as MacroAsset[]) {
    const ms = all
      .filter((m) => m.asset === asset)
      .sort((a, b) => (a.closeTime ?? "").localeCompare(b.closeTime ?? "") || (a.strike ?? 0) - (b.strike ?? 0));
    byAsset[asset] = { asset, markets: ms, summary: assetSummary(asset, ms) };
  }
  return {
    asOf: new Date().toISOString(),
    venues: results.map((r) => ({ venue: r.venue, ok: r.ok, note: r.note, count: r.markets.length, retrievedAt: r.retrievedAt })),
    fed: buildFedOdds(all),
    byEvent,
    byAsset,
    recession: all.filter((m) => m.topic === "recession"),
    all,
  };
}

function fail(venue: PMVenue) {
  return (e: unknown): PMAdapterResult => ({ venue, ok: false, note: `adapter threw: ${e instanceof Error ? e.message : String(e)}`, markets: [], retrievedAt: new Date().toISOString() });
}

export async function getPredictionState(): Promise<PredictionState> {
  if (cache && Date.now() - cache.at < TTL) return cache.state;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const results = await Promise.all([fetchKalshi().catch(fail("kalshi")), fetchPolymarket().catch(fail("polymarket"))]);
      const state = buildState(results);
      cache = { state, at: Date.now() };
      return state;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
