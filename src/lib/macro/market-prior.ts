import type { CalendarFed, CalendarMarket, MacroEventDef, ScheduledEvent } from "./types";
import type { PredictionState } from "../prediction/service";
import { fedExpectedChange, marketExpectation, type MarketExpectation } from "../prediction/conversions";
import type { MarketPrior } from "./surprise";

// Bridges prediction-market odds to a macro event: which ladder / meeting applies, and the numbers the surprise
// engine and the calendar need. Pure; the caller passes the (cached) PredictionState.

const LADDER_DEFS = new Set(["cpi_mom", "cpi_yoy", "core_cpi_mom", "core_cpi_yoy", "nfp", "unemployment"]);
const FED_DEFS = new Set(["fed_funds", "fomc_statement", "fomc_presser"]);

// Print step: CPI/unemployment are published to one decimal, payrolls to the thousand (treated as continuous).
export function printResolution(def: MacroEventDef): number {
  return def.unit === "pct" ? 10 ** -def.decimals : 0;
}

export function marketExpectationFor(def: MacroEventDef, event: Pick<ScheduledEvent, "time" | "forecast">, pred: PredictionState | null, now = Date.now()): MarketExpectation | null {
  if (!pred || !LADDER_DEFS.has(def.id)) return null;
  const markets = (pred.byEvent[def.id] ?? []).filter((m) => m.eventDefId === def.id);
  if (markets.length === 0) return null;
  const t = new Date(event.time).getTime();
  if (!Number.isFinite(t)) return null;
  const resolution = printResolution(def);
  return marketExpectation(markets, { eventTime: t, consensus: event.forecast, resolution, band: def.typicalSurpriseSD ?? (resolution || undefined), now });
}

// The surprise engine only takes the market as an anchor when the ladder is liquid (>= $50k traded); a thin ladder
// still shows in the calendar's Expect. cell but does not move the z-score.
export function marketPriorFor(def: MacroEventDef, event: Pick<ScheduledEvent, "time" | "forecast">, pred: PredictionState | null, now = Date.now()): MarketPrior | null {
  const mx = marketExpectationFor(def, event, pred, now);
  if (!mx || !mx.liquid) return null;
  return { mean: mx.mean, sd: mx.sd };
}

export function toCalendarMarket(mx: MarketExpectation | null): CalendarMarket | null {
  if (!mx) return null;
  return { mean: mx.mean, sd: mx.sd, tailSkew: mx.tailSkew, venue: mx.venue, volumeUsd: mx.volumeUsd, asOf: mx.asOf, shrunk: mx.shrunk };
}

// Fed meeting odds for a decision / statement / presser on the event's date (matched by month).
export function fedExpectationFor(def: MacroEventDef, event: Pick<ScheduledEvent, "time">, pred: PredictionState | null, now = Date.now()): CalendarFed | null {
  if (!pred || !FED_DEFS.has(def.id)) return null;
  const month = event.time.slice(0, 7);
  const odds = pred.fed.find((f) => f.period.slice(0, 7) === month);
  if (!odds) return null;
  const fx = fedExpectedChange(odds, now);
  if (!fx) return null;
  return { expectedChangeBp: fx.expectedChangeBp, surpriseSdBp: fx.surpriseSdBp, modalLabel: fx.modalLabel, modalProb: fx.modalProb };
}

// For the rate decision itself the market-implied expectation is the anchor: surprise = actual change - E[change].
// Returned in the def's unit (percentage points) so computeSurprise can use it as `market`; SD floors at 2bp so a
// fully priced decision still yields a finite z (a hold at 92% priced is a ~2bp, inline surprise).
export function fedPriorFor(def: MacroEventDef, event: Pick<ScheduledEvent, "time" | "previous">, pred: PredictionState | null, now = Date.now()): MarketPrior | null {
  if (def.id !== "fed_funds" || event.previous == null) return null;
  const fx = fedExpectationFor(def, event, pred, now);
  if (!fx) return null;
  return { mean: Math.round((event.previous + fx.expectedChangeBp / 100) * 1e4) / 1e4, sd: Math.max(0.02, fx.surpriseSdBp / 100) };
}
