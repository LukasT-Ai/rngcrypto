import type { Importance, MacroEventDef, ScheduledEvent } from "./types";
import { EVENT_DEFS, matchEventDef, parseValue } from "./taxonomy";
import { generateOilEvents, generateScheduledEvents } from "../economic-calendar";

interface FFItem {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  previous?: string;
}

let ffCache: { items: FFItem[]; at: number } | null = null;
const FF_TTL = 10 * 60_000;

async function fetchFF(): Promise<FFItem[]> {
  if (ffCache && Date.now() - ffCache.at < FF_TTL) return ffCache.items;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", { signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) return ffCache?.items ?? [];
    const data = (await r.json()) as FFItem[];
    if (!Array.isArray(data)) return ffCache?.items ?? [];
    ffCache = { items: data, at: Date.now() };
    return data;
  } catch {
    return ffCache?.items ?? [];
  }
}

const GENERIC: MacroEventDef = {
  id: "generic_us",
  title: "US data",
  aliases: /.^/,
  kind: "sentiment",
  importance: "medium",
  unit: "index",
  decimals: 1,
  typicalSurpriseSD: null,
  relevance: { BTC: 0.2, GOLD: 0.2, WTI: 0.2 },
  source: { provider: "NONE" },
  logic: "Second-tier US release; usually only matters on a large miss.",
};

export function defFor(defId: string): MacroEventDef {
  return EVENT_DEFS.find((d) => d.id === defId) ?? GENERIC;
}

const IMP_RANK: Record<Importance, number> = { low: 0, medium: 1, high: 2, critical: 3 };

// Take the higher of our taxonomy's importance and the feed's tag (Fair Economy tags EIA inventories "low").
function ffImportance(s: string | undefined, def: MacroEventDef): Importance {
  const v = (s ?? "").toLowerCase();
  const ff: Importance = v === "high" ? "high" : v === "medium" ? "medium" : "low";
  if (def.id === "generic_us") return ff;
  return IMP_RANK[def.importance] >= IMP_RANK[ff] ? def.importance : ff;
}

const dayKey = (iso: string) => iso.slice(0, 10);

export async function getMacroEvents(fromMs: number, toMs: number): Promise<ScheduledEvent[]> {
  const retrievedAt = new Date().toISOString();
  const out: ScheduledEvent[] = [];
  const seen = new Set<string>();

  const ff = await fetchFF();
  for (const it of ff) {
    if (!it.title || !it.date || it.country !== "USD") continue;
    const time = new Date(it.date);
    if (isNaN(time.getTime())) continue;
    const ms = time.getTime();
    if (ms < fromMs || ms > toMs) continue;
    const matched = matchEventDef(it.title);
    const def = matched ?? GENERIC;
    if (!matched && !/high|medium/i.test(it.impact ?? "")) continue;
    const id = `${def.id === "generic_us" ? slug(it.title) : def.id}-${dayKey(time.toISOString())}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      defId: def.id,
      title: matched ? def.title : it.title,
      time: time.toISOString(),
      importance: ffImportance(it.impact, def),
      forecast: parseValue(it.forecast, def.unit),
      forecastRaw: it.forecast || null,
      previous: parseValue(it.previous, def.unit),
      previousRaw: it.previous || null,
      unit: def.unit,
      source: "faireconomy",
      retrievedAt,
    });
  }

  // Oil weekly releases + longer-dated scheduled majors that Fair Economy's this-week feed does not cover.
  const extra = [...generateOilEvents(), ...generateScheduledEvents()];
  for (const e of extra) {
    const ms = e.time.getTime();
    if (ms < fromMs || ms > toMs) continue;
    const def = matchEventDef(e.name) ?? matchScheduledName(e.name);
    if (!def) continue;
    const id = `${def.id}-${dayKey(e.time.toISOString())}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      defId: def.id,
      title: def.title,
      time: e.time.toISOString(),
      importance: def.importance,
      forecast: null,
      forecastRaw: null,
      previous: null,
      previousRaw: null,
      unit: def.unit,
      source: "scheduled",
      retrievedAt,
    });
  }

  return out.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function matchScheduledName(name: string): MacroEventDef | null {
  const n = name.toLowerCase();
  if (n.includes("fomc rate")) return defFor("fed_funds");
  if (n.includes("cpi")) return defFor("cpi_mom");
  if (n.includes("nfp") || n.includes("jobs report")) return defFor("nfp");
  if (n.includes("pce")) return defFor("core_pce_mom");
  if (n.includes("ppi")) return defFor("ppi_mom");
  if (n.includes("gdp")) return defFor("gdp_qq");
  if (n.includes("retail")) return defFor("retail_mom");
  if (n.includes("jobless")) return defFor("claims");
  if (n.includes("eia")) return defFor("eia_crude");
  if (n.includes("api weekly")) return defFor("api_crude");
  if (n.includes("baker hughes")) return defFor("baker_hughes");
  return null;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
}
