import type { Direction, EventOutcome, EventState, MacroAsset, ReactionLabel, ReactionPoint, SnapshotKey } from "./types";
import { MACRO_ASSETS, REACTION_SCHEDULE } from "./types";
import { formatValue } from "./taxonomy";

// Compact, human-readable record of what a release did, so it can stay on screen after the live card moves on.
// Never invents data: if no actual was verified, the note says so and falls back to the observed market reaction.

const ASSET_KEY: Record<MacroAsset, SnapshotKey> = { BTC: "btc", GOLD: "gold", WTI: "wti" };
const ORDER: ReactionLabel[] = REACTION_SCHEDULE.map((r) => r.label);
// Below this move the asset is reported as flat (percent for assets).
const FLAT: Record<MacroAsset, number> = { BTC: 0.25, GOLD: 0.15, WTI: 0.35 };

function latestReaction(reactions: ReactionPoint[]): ReactionPoint | null {
  const sorted = [...reactions].sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
  return sorted[sorted.length - 1] ?? null;
}

function pct(v: number | null): string {
  return v == null ? "n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function observed(asset: MacroAsset, v: number | null): Direction | null {
  if (v == null) return null;
  if (v > FLAT[asset]) return "bullish";
  if (v < -FLAT[asset]) return "bearish";
  return "mixed";
}

export function summarizeOutcome(st: EventState, now = Date.now()): EventOutcome | null {
  const t0 = new Date(st.event.time).getTime();
  if (now < t0) return null;

  const verified = st.release?.status === "verified" && st.release.actual != null;
  const conflict = st.release?.status === "conflict";
  const ageMin = (now - t0) / 60e3;
  const latest = latestReaction(st.reactions);
  const fmt = (v: number | null) => formatValue(v, st.def.unit, st.def.decimals);

  // Status.
  let status: EventOutcome["status"];
  if (verified) status = "verified";
  else if (conflict) status = "conflict";
  else if (ageMin < 45) status = "awaiting";
  else status = "unverified";

  // Headline: the number, or why there is none.
  let headline: string;
  if (verified) {
    const actual = fmt(st.release!.actual!.value);
    const fc = st.event.forecastRaw ?? (st.event.forecast != null ? fmt(st.event.forecast) : null);
    headline = `Actual ${actual}${fc ? ` vs ${fc} forecast` : ""}`;
    if (st.surprise?.label) headline += ` · ${st.surprise.label.replace(/\s*\(.*\)$/, "")}`;
  } else if (conflict) {
    headline = "Data conflict between sources; signal paused";
  } else if (status === "awaiting") {
    headline = "Released; awaiting verified actual";
  } else {
    headline = st.release?.note && st.release.status === "unavailable" ? "No verified actual (no machine-readable source)" : "Actual not verified";
  }

  // Per-asset: expected direction (post-release if we have it) and observed move at the latest sample.
  const impacts = (verified && st.postImpact) || st.postImpact || st.preMap;
  const perAsset = MACRO_ASSETS.map((asset) => {
    const imp = impacts.find((i) => i.asset === asset) ?? null;
    const move = latest ? latest.changesPct[ASSET_KEY[asset]] : null;
    const pa = st.confirmation?.perAsset[asset] ?? null;
    return {
      asset,
      expected: (imp?.direction ?? "mixed") as Direction,
      observed: observed(asset, move),
      movePct: move,
      status: pa?.status ?? null,
    };
  });

  // Impact line: what the market actually did, plus whether it matched the expected reaction.
  let impact: string;
  let confirmationNote: string | null = null;
  if (!latest) {
    impact = ageMin < 1 ? "Market reaction pending" : "No market reaction samples";
  } else {
    const moves = perAsset.filter((p) => p.movePct != null).map((p) => `${p.asset} ${pct(p.movePct)}`);
    impact = moves.length ? `Market @${latest.label}: ${moves.join(" · ")}` : `Market @${latest.label}: no price data`;
    const conf = st.confirmation;
    if (conf && conf.status !== "awaiting") {
      const word = conf.status === "confirmed" ? "confirmed" : conf.status === "reversing" ? "reversing" : conf.status === "fading" ? "fading" : conf.status === "conflicted" ? "mixed" : "not confirmed";
      confirmationNote = `Expected reaction ${word}${conf.pct != null ? ` (${conf.pct}%)` : ""} @${conf.basedOn ?? latest.label}`;
    } else if (ageMin < 5) {
      confirmationNote = "Too early to judge";
    }
  }

  // Overall direction glyph for the chip: the strongest confirmed asset lean, else the expected lean, else mixed.
  const lead = perAsset.find((p) => p.observed && p.observed !== "mixed") ?? null;
  const direction: Direction = lead ? lead.observed! : (perAsset.find((p) => p.expected !== "mixed")?.expected ?? "mixed");

  return {
    status,
    headline,
    impact,
    confirmationNote,
    direction,
    perAsset,
    basedOn: latest?.label ?? null,
    asOf: new Date(now).toISOString(),
  };
}
