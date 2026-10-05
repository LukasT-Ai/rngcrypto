import type { Alert, EventState, Importance, MacroAsset } from "./types";

const fired = new Map<string, number>();
const RETENTION = 48 * 3600e3;

function once(id: string): boolean {
  const now = Date.now();
  for (const [k, t] of fired) if (now - t > RETENTION) fired.delete(k);
  if (fired.has(id)) return false;
  fired.set(id, now);
  return true;
}

const rank: Record<Importance, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function deriveAlerts(states: EventState[], now = Date.now()): Alert[] {
  const out: Alert[] = [];
  const at = new Date(now).toISOString();

  for (const s of states) {
    const imp = s.event.importance;
    if (rank[imp] < rank.high) continue;
    const mins = s.secondsToRelease / 60;

    for (const threshold of [60, 15, 1]) {
      if (mins > 0 && mins <= threshold && once(`pre:${s.event.id}:${threshold}`)) {
        out.push({
          id: `pre:${s.event.id}:${threshold}`,
          at,
          kind: "pre_event",
          importance: imp,
          asset: null,
          title: `${s.event.title} in ${threshold === 1 ? "under a minute" : `${Math.ceil(mins)} minutes`}`,
          body: `Volatility in BTC, Gold and WTI may increase. Technical signal confidence is temporarily reduced into the release.`,
        });
      }
    }

    if (s.release?.status === "verified" && s.surprise && s.postImpact && once(`rel:${s.event.id}`)) {
      for (const imp2 of s.postImpact) {
        if (imp2.direction === "mixed" || imp2.confidence === "low") continue;
        out.push({
          id: `rel:${s.event.id}:${imp2.asset}`,
          at,
          kind: "release",
          importance: imp,
          asset: imp2.asset,
          direction: imp2.direction,
          confidence: imp2.confidence,
          title: `${s.event.title} released — ${s.surprise.label.split(" (")[0]}`,
          body: `${assetName(imp2.asset)} initial likely impact: ${imp2.direction} — ${imp2.confidence} confidence. ${imp2.reason}`,
        });
      }
    }

    if (s.release?.status === "conflict" && once(`conf:${s.event.id}`)) {
      out.push({ id: `conf:${s.event.id}`, at, kind: "conflict", importance: imp, asset: null, title: `${s.event.title}: data conflict`, body: `${s.release.note}. Signal paused until sources agree.` });
    }

    if (s.confirmation) {
      for (const asset of Object.keys(s.confirmation.perAsset) as MacroAsset[]) {
        const pa = s.confirmation.perAsset[asset];
        if ((pa.status === "reversing" || pa.status === "fading") && once(`rev:${s.event.id}:${asset}:${pa.status}`)) {
          out.push({
            id: `rev:${s.event.id}:${asset}:${pa.status}`,
            at,
            kind: "reversal",
            importance: imp,
            asset,
            direction: pa.direction,
            title: `${assetName(asset)} macro reaction ${pa.status}`,
            body: `${pa.note}. ${s.confirmation.summary}`,
          });
        }
      }
    }
  }
  return out;
}

export function assetName(a: MacroAsset) {
  return a === "BTC" ? "BTC" : a === "GOLD" ? "Gold" : "WTI";
}

// Client-side filtering contract (alerts are configurable by these fields; see /api/macro?alerts=1).
export interface AlertFilter {
  assets?: MacroAsset[];
  kinds?: Alert["kind"][];
  minImportance?: Importance;
  directions?: ("bullish" | "bearish")[];
  minConfidence?: "low" | "medium" | "high";
}

export function filterAlerts(alerts: Alert[], f: AlertFilter): Alert[] {
  const confRank = { low: 0, medium: 1, high: 2 };
  return alerts.filter((a) => {
    if (f.assets && a.asset && !f.assets.includes(a.asset)) return false;
    if (f.kinds && !f.kinds.includes(a.kind)) return false;
    if (f.minImportance && rank[a.importance] < rank[f.minImportance]) return false;
    if (f.directions && a.direction && a.direction !== "mixed" && !f.directions.includes(a.direction)) return false;
    if (f.minConfidence && a.confidence && confRank[a.confidence] < confRank[f.minConfidence]) return false;
    return true;
  });
}
