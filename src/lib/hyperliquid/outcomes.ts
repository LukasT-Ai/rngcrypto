// Hyperliquid outcome markets. Fills in them carry coin = "#<outcomeId><side>" (the last digit is the side, 0 or
// 1; verified against allMids: 580/580 live "#" keys resolve this way). They settle at 0 or 1 ("Settlement" fills)
// and are not perps, so they can never count toward a copyable group; we only resolve a readable label for the
// mix breakdown. outcomeMeta lists live outcomes only, so settled markets fall back to a generic label.

import { info, WEIGHT } from "./http";

interface OutcomeMeta {
  outcomes?: { outcome: number; name: string; description: string; sideSpecs?: { name: string }[] }[];
}

export const OUTCOME_TTL_MS = 60 * 60_000;

export const isOutcomeCoin = (coin: string) => /^#\d{2,}$/.test(coin);

/** [outcomeId, side] for a "#" coin, or null. */
export function parseOutcomeCoin(coin: string): [number, number] | null {
  if (!isOutcomeCoin(coin)) return null;
  const digits = coin.slice(1);
  return [Number(digits.slice(0, -1)), Number(digits.slice(-1))];
}

const field = (desc: string, key: string): string | null => {
  const m = desc.match(new RegExp(`(?:^|\\|)${key}:([^|]*)`));
  return m ? m[1] : null;
};

/** Human label from an outcome template, e.g. "BTC price binary (90s)" or "Ravens vs Browns". */
export function describeOutcome(name: string, description: string, side: number, sideSpecs?: { name: string }[]): string {
  const template = name.replace(/^template:/, "");
  let core: string;
  if (template === "binaryPrice") {
    const perp = field(description, "perp") ?? "price";
    const secs = field(description, "seconds");
    core = `${perp} price binary${secs ? ` (${secs}s)` : ""}`;
  } else if (template.startsWith("sportsContest")) {
    const a = field(description, "shortNameA") ?? field(description, "participantA") ?? "A";
    const b = field(description, "shortNameB") ?? field(description, "participantB") ?? "B";
    core = `${a} vs ${b}`;
  } else {
    core = template;
  }
  const sideName = sideSpecs?.[side]?.name?.replace(/^template:/, "");
  const resolvedSide = sideName && !sideName.includes("{") ? sideName : side === 0 ? "Yes" : "No";
  return `Outcome: ${core} · ${resolvedSide}`;
}

let cache: { at: number; byId: Map<number, { name: string; description: string; sideSpecs?: { name: string }[] }> } | null = null;
let inflight: Promise<void> | null = null;

/** Refresh the live outcome list at most hourly. Never throws. */
export async function refreshOutcomes(now = Date.now()): Promise<void> {
  if (cache && now - cache.at < OUTCOME_TTL_MS) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const meta = await info<OutcomeMeta>({ type: "outcomeMeta" }, WEIGHT.meta);
      if (meta && Array.isArray(meta.outcomes)) {
        const byId = new Map<number, { name: string; description: string; sideSpecs?: { name: string }[] }>();
        for (const o of meta.outcomes) if (o && typeof o.outcome === "number") byId.set(o.outcome, { name: o.name ?? "", description: o.description ?? "", sideSpecs: o.sideSpecs });
        cache = { at: now, byId };
      } else if (cache) cache.at = now - OUTCOME_TTL_MS + 5 * 60_000; // retry in 5 min
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Label for an outcome coin from the cached meta; generic when the market is settled or unknown. */
export function outcomeLabel(coin: string): string | null {
  const parsed = parseOutcomeCoin(coin);
  if (!parsed) return null;
  const [id, side] = parsed;
  const o = cache?.byId.get(id);
  if (o) return describeOutcome(o.name, o.description, side, o.sideSpecs);
  return `Outcome market #${id} · ${side === 0 ? "Yes" : "No"}`;
}
