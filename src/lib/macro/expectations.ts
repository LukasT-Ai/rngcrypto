import type { MacroEventDef, ScheduledEvent } from "./types";
import { EVENT_DEFS, formatValue } from "./taxonomy";
import { applyTransform, periodMatches, primaryObservations } from "./releases";

// Fills forecast/previous when the calendar feed leaves them blank, and always says where a number came from.
//
// Order of preference per field:
//   1. Calendar consensus (Fair Economy) — already on the event, source null.
//   2. Previous: the primary source's last published print (BLS/FRED/EIA) for the period BEFORE the one this
//      event reports on. Never uses the current period, so a released event's actual is not mislabelled.
//   3. Proxies for releases nobody publishes consensus for (API crude ← EIA consensus/previous from the same week).
//   4. Text events (Fed speeches, FOMC minutes/statement, auctions) get a note instead of numbers.

const TEXT_NOTE = "No consensus: text event. The read comes from the market (2Y yield, DXY) after release.";

function formatRaw(def: MacroEventDef, v: number): string {
  return formatValue(v, def.unit, def.decimals);
}

async function derivePrevious(def: MacroEventDef, event: ScheduledEvent): Promise<{ value: number; raw: string; period: string } | null> {
  const src = def.source;
  if (!src.transform) return null;
  // Long cache: this runs every tick and BLS allows 25 unregistered queries a day.
  const obs = await primaryObservations(def, 6 * 3600e3);
  if (!obs || obs.length === 0) return null;
  const eventTime = new Date(event.time);
  // Skip observations that belong to the period this event will publish (or newer): the first older one is "previous".
  let start = 0;
  while (start < obs.length && (periodMatches(def, obs[start], eventTime) || new Date(obs[start].period).getTime() > eventTime.getTime())) start++;
  const slice = obs.slice(start);
  if (slice.length === 0) return null;
  const v = applyTransform(slice, src.transform);
  if (v == null || !Number.isFinite(v)) return null;
  const rounded = Math.round(v * 10 ** def.decimals) / 10 ** def.decimals;
  return { value: rounded, raw: formatRaw(def, rounded), period: slice[0].period };
}

function sameWeek(a: string, b: string): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 4 * 86400e3;
}

export async function fillExpectations(events: ScheduledEvent[]): Promise<ScheduledEvent[]> {
  const out: ScheduledEvent[] = [];
  for (const e of events) {
    const def = EVENT_DEFS.find((d) => d.id === e.defId);
    if (!def) {
      out.push({ ...e, forecastSource: null, previousSource: null, expectationNote: e.forecast == null ? "No published consensus for this release." : null });
      continue;
    }
    const ev: ScheduledEvent = { ...e, forecastSource: e.forecastSource ?? null, previousSource: e.previousSource ?? null, expectationNote: e.expectationNote ?? null };

    if (def.unit === "text") {
      ev.expectationNote = TEXT_NOTE;
      out.push(ev);
      continue;
    }

    // API crude: nobody publishes a consensus; the EIA number for the same week is the closest thing to one.
    if (def.id === "api_crude") {
      const eia = events.find((x) => x.defId === "eia_crude" && sameWeek(x.time, e.time));
      if (ev.forecast == null && eia?.forecast != null) {
        ev.forecast = eia.forecast;
        ev.forecastRaw = eia.forecastRaw ?? formatRaw(def, eia.forecast);
        ev.forecastSource = "EIA consensus (proxy)";
      }
      if (ev.previous == null && eia?.previous != null) {
        ev.previous = eia.previous;
        ev.previousRaw = eia.previousRaw ?? formatRaw(def, eia.previous);
        ev.previousSource = "EIA prior week (proxy)";
      }
      ev.expectationNote =
        ev.forecast != null
          ? "API publishes no consensus. Forecast shown is the EIA crude consensus for the same reporting week. A draw larger than that consensus is the bullish surprise for WTI."
          : "API publishes no consensus and the EIA consensus for this week is not posted yet. The print is judged against last week: a draw (negative) means less crude in storage and leans bullish for WTI; a build (positive) leans bearish.";
      out.push(ev);
      continue;
    }

    if (ev.previous == null) {
      const prev = await derivePrevious(def, e).catch(() => null);
      if (prev) {
        ev.previous = prev.value;
        ev.previousRaw = prev.raw;
        ev.previousSource = `${def.source.provider} prior print (${prev.period})`;
      }
    }

    if (ev.forecast == null) {
      ev.expectationNote =
        def.source.provider === "NONE"
          ? "No published consensus for this release. Direction is judged against the previous print."
          : "No consensus on the calendar yet. Direction is judged against the previous print.";
    }
    out.push(ev);
  }
  return out;
}
