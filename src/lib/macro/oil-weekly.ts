// Weekly US crude inventory releases for the WTI macro lens: the EIA Weekly Petroleum Status Report (Wednesday)
// and the API estimate that previews it (Tuesday). Pairs the most recent print we recorded with the next
// scheduled release so the OIL page can show "current number" and "time to the next one" without digging
// through the calendar strip.
import type { Importance, ScheduledEvent, SourceProvider, StoredRelease, SurpriseMagnitude } from "./types";
import { defFor } from "./calendar";
import { formatValue } from "./taxonomy";

export const WEEKLY_OIL_DEFS = ["eia_crude", "api_crude"] as const;
export type WeeklyOilDefId = (typeof WEEKLY_OIL_DEFS)[number];

export interface WeeklyOilLast {
  eventTime: string;
  actual: number;
  actualRaw: string;
  forecast: number | null;
  previous: number | null;
  surpriseScore: number | null;
  magnitude: SurpriseMagnitude | null;
  provider: SourceProvider | null;
  // "stored": a release we verified and recorded. "calendar": only the next event's "previous" field is known
  // (the service was not running when the print landed), so the exact release time is inferred.
  source: "stored" | "calendar";
}

export interface WeeklyOilRelease {
  defId: WeeklyOilDefId;
  title: string;
  importance: Importance;
  cadence: string;
  next: ScheduledEvent | null;
  last: WeeklyOilLast | null;
}

const CADENCE: Record<WeeklyOilDefId, string> = {
  eia_crude: "Wednesdays 10:30 ET (a day later after US holidays)",
  api_crude: "Tuesdays 4:30 PM ET, the evening before EIA",
};

export function buildWeeklyOil(upcoming: ScheduledEvent[], stored: StoredRelease[], now = Date.now()): WeeklyOilRelease[] {
  return WEEKLY_OIL_DEFS.map((defId) => {
    const def = defFor(defId);
    const next =
      upcoming
        .filter((e) => e.defId === defId && new Date(e.time).getTime() > now - 60_000)
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())[0] ?? null;

    const rec = stored
      .filter((r) => r.defId === defId && r.actual != null && new Date(r.eventTime).getTime() <= now)
      .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime())[0];

    let last: WeeklyOilLast | null = null;
    if (rec && rec.actual != null) {
      last = {
        eventTime: rec.eventTime,
        actual: rec.actual,
        actualRaw: rec.actualRaw ?? formatValue(rec.actual, def.unit, def.decimals),
        forecast: rec.forecast,
        previous: rec.previous,
        surpriseScore: rec.surpriseScore,
        magnitude: rec.magnitude,
        provider: rec.actualProvider ?? null,
        source: "stored",
      };
    } else if (next && next.previous != null) {
      // Weekly cadence: the previous print landed one week before the next scheduled release.
      last = {
        eventTime: new Date(new Date(next.time).getTime() - 7 * 86400e3).toISOString(),
        actual: next.previous,
        actualRaw: next.previousRaw ?? formatValue(next.previous, def.unit, def.decimals),
        forecast: null,
        previous: null,
        surpriseScore: null,
        magnitude: null,
        provider: null,
        source: "calendar",
      };
    }

    return { defId, title: def.title, importance: def.importance, cadence: CADENCE[defId], next, last };
  });
}
