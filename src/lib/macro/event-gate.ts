import type { ConfirmationStatus, EventKind, FirstMoveGate, Importance, MacroAsset } from "./types";

// Phase 3.2 universal event gate. Pure state machine over the macro calendar for one symbol's lens:
//   pre        T-60 .. T-30 (critical) or T-60 .. T (high): size 0.5, no gate
//   blackout   T-30 .. T  (critical only): no new entries (WAIT)
//   releasing  T .. T+10 (BTC/Gold; T .. T+2 for WTI inventories): no new entries, first-5-minute gate evaluated
//   post       to T+180 (BTC/Gold) or T+30 (WTI inventories): size 0.5 and stop 1.3x until T+60 (T+15 oil);
//              directional event weight 2^(-(age-releasing)/45) (10 for oil), hard zero at the window end
//   none       otherwise: every multiplier is 1 and the engine behaves exactly as before.
// Evidence: strategy research 3.1-3.2 (BTC CPI information spent inside one hour; EIA inside 10-30 min; the
// pre-window is volatility, not direction; the first 5 minutes confirm or reject the surprise direction).

export type EventWindowState = "none" | "pre" | "blackout" | "releasing" | "post";

export interface GateEvent {
  id: string;
  title: string;
  // ms epoch
  time: number;
  importance: Importance;
  kind: EventKind;
  // Relevance for the symbol's lens (0..1), after the coupling multiplier.
  relevance: number;
  // Expected direction of the lens asset given the verified surprise: +1 up, -1 down, 0 mixed, null unknown.
  surpriseDir: 1 | -1 | 0 | null;
  confirmation: ConfirmationStatus | null;
}

export interface EventWindow {
  state: EventWindowState;
  event: { id: string; title: string; time: string; importance: Importance } | null;
  // Minutes until the current state ends (to the release for pre/blackout, to the end of the window for post).
  minutesLeft: number;
  // Signed minutes since the release (negative before it). null when state is "none".
  minutesSince: number | null;
  sizeMult: number;
  stopMult: number;
  // True when no new entries should be published (blackout / releasing).
  gate: boolean;
  firstMoveGate: FirstMoveGate | null;
  // First-5-minute move of the lens asset in percent, signed; null until the candle closed.
  firstMovePct: number | null;
  // Directional weight for the event vote in [0, 1]; 0 outside the post window or when unconfirmed.
  eventWeight: number;
  note: string | null;
}

export interface WindowProfile {
  preMin: number;
  blackoutMin: number;
  releasingMin: number;
  stopUntilMin: number;
  halfLifeMin: number;
  zeroMin: number;
  preSize: number;
  postSize: number;
  postStop: number;
}

export const DEFAULT_PROFILE: WindowProfile = { preMin: 60, blackoutMin: 30, releasingMin: 10, stopUntilMin: 60, halfLifeMin: 45, zeroMin: 180, preSize: 0.5, postSize: 0.5, postStop: 1.3 };
// WTI inventory prints: the surprise is worth ~10 minutes and the whole window is over in 30.
export const OIL_INVENTORY_PROFILE: WindowProfile = { preMin: 60, blackoutMin: 30, releasingMin: 2, stopUntilMin: 15, halfLifeMin: 10, zeroMin: 30, preSize: 0.5, postSize: 0.5, postStop: 1.3 };

export const GATE_MIN_RELEVANCE = 0.3;
export const FIRST_MOVE_CONFIRM_PCT = 0.7;
export const FIRST_MOVE_FAIL_PCT = 0.5;

const RANK: Record<Importance, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function profileFor(kind: EventKind, lens: MacroAsset): WindowProfile {
  return lens === "WTI" && (kind === "oil_inventory" || kind === "oil_product_inventory") ? OIL_INVENTORY_PROFILE : DEFAULT_PROFILE;
}

export function gateEligible(e: Pick<GateEvent, "importance" | "relevance">): boolean {
  return RANK[e.importance] >= RANK.high && e.relevance >= GATE_MIN_RELEVANCE;
}

// First-5-minute confirmation: the move must exceed 0.7% in the surprise direction to confirm; under 0.5% or the
// wrong way is unconfirmed; in between stays pending (the 15m sample decides, see service.ts).
export function firstMoveGate(movePct: number | null, surpriseDir: 1 | -1 | 0 | null): FirstMoveGate | null {
  if (surpriseDir == null || surpriseDir === 0) return null;
  if (movePct == null) return "pending";
  const signed = movePct * surpriseDir;
  if (signed >= FIRST_MOVE_CONFIRM_PCT) return "confirmed";
  if (signed < FIRST_MOVE_FAIL_PCT) return "unconfirmed";
  return "pending";
}

export const NO_WINDOW: EventWindow = { state: "none", event: null, minutesLeft: 0, minutesSince: null, sizeMult: 1, stopMult: 1, gate: false, firstMoveGate: null, firstMovePct: null, eventWeight: 0, note: null };

export interface ComputeWindowInput {
  now: number;
  events: GateEvent[];
  lens: MacroAsset;
  // First-5-minute move of the lens asset for a given event time (percent), from the 5m candles.
  firstMoveFor?: (eventTime: number) => number | null;
}

// Picks the single most binding event (gating states first, then the nearest) and derives the window.
export function computeEventWindow(input: ComputeWindowInput): EventWindow {
  const { now, lens } = input;
  let best: EventWindow = NO_WINDOW;
  let bestRank = -1;
  for (const e of input.events) {
    if (!gateEligible(e)) continue;
    const w = windowFor(e, now, lens, input.firstMoveFor);
    if (w.state === "none") continue;
    const r = stateRank(w.state) * 1000 + RANK[e.importance] * 100 + Math.max(0, 100 - Math.abs(w.minutesSince ?? 0));
    if (r > bestRank) {
      bestRank = r;
      best = w;
    }
  }
  return best;
}

function stateRank(s: EventWindowState): number {
  return s === "blackout" ? 4 : s === "releasing" ? 3 : s === "post" ? 2 : s === "pre" ? 1 : 0;
}

export function windowFor(e: GateEvent, now: number, lens: MacroAsset, firstMoveFor?: (eventTime: number) => number | null): EventWindow {
  const p = profileFor(e.kind, lens);
  const min = (now - e.time) / 60e3; // signed minutes since release
  const critical = e.importance === "critical";
  const ev = { id: e.id, title: e.title, time: new Date(e.time).toISOString(), importance: e.importance };
  const base = { event: ev, minutesSince: Math.round(min * 10) / 10, firstMovePct: null as number | null };
  if (min < -p.preMin || min >= p.zeroMin) return NO_WINDOW;

  if (min < 0) {
    const toRelease = -min;
    if (critical && toRelease <= p.blackoutMin) {
      return { ...base, state: "blackout", minutesLeft: Math.ceil(toRelease), sizeMult: 0, stopMult: 1, gate: true, firstMoveGate: null, eventWeight: 0, note: `${e.title} in ${Math.ceil(toRelease)}m: no new entries inside the ${p.blackoutMin}-minute blackout` };
    }
    return { ...base, state: "pre", minutesLeft: Math.ceil(critical ? toRelease - p.blackoutMin : toRelease), sizeMult: p.preSize, stopMult: 1, gate: false, firstMoveGate: null, eventWeight: 0, note: `${e.title} in ${Math.ceil(toRelease)}m: pre-release volatility, size ${p.preSize}x` };
  }

  const firstMove = firstMoveFor ? firstMoveFor(e.time) : null;
  const gateState = firstMoveGate(firstMove, e.surpriseDir);
  if (min < p.releasingMin) {
    return { ...base, firstMovePct: firstMove, state: "releasing", minutesLeft: Math.ceil(p.releasingMin - min), sizeMult: 0, stopMult: p.postStop, gate: true, firstMoveGate: gateState, eventWeight: 0, note: `${e.title} released ${Math.floor(min)}m ago: no new entries until T+${p.releasingMin}` };
  }

  // Post window: directional weight decays from T+releasing with the profile half-life, zero at the window end.
  const age = min - p.releasingMin;
  let eventWeight = Math.pow(0.5, age / p.halfLifeMin);
  if (gateState === "unconfirmed" || e.confirmation === "reversing") eventWeight = 0;
  else if (gateState === "pending" && firstMove != null) eventWeight *= 0.5;
  if (e.confirmation === "fading") eventWeight *= 0.3;
  const inStopWindow = min < p.stopUntilMin;
  return {
    ...base,
    firstMovePct: firstMove,
    state: "post",
    minutesLeft: Math.ceil(p.zeroMin - min),
    sizeMult: inStopWindow ? p.postSize : 1,
    stopMult: inStopWindow ? p.postStop : 1,
    gate: false,
    firstMoveGate: gateState,
    eventWeight: Math.round(eventWeight * 1000) / 1000,
    note: inStopWindow
      ? `${e.title} ${Math.floor(min)}m ago: size ${p.postSize}x, stops ${p.postStop}x until T+${p.stopUntilMin}${gateState ? ` (first move ${gateState})` : ""}`
      : `${e.title} ${Math.floor(min)}m ago: event window closes in ${Math.ceil(p.zeroMin - min)}m`,
  };
}

// Percent move of the 5-minute candle that opened at the release time (close vs open), from candles already fetched.
export function firstFiveMinuteMove(candles: { time: number; open: number; close: number }[], eventTime: number, nowMs: number): number | null {
  if (candles.length === 0) return null;
  const slot = Math.floor(eventTime / 300e3) * 300e3;
  // The candle must have closed (the caller passes closed candles, but guard against a live one).
  if (nowMs < slot + 300e3) return null;
  for (const c of candles) {
    const open = c.time < 1e12 ? c.time * 1000 : c.time;
    if (open === slot) return c.open > 0 ? Math.round(((c.close - c.open) / c.open) * 10000) / 100 : null;
  }
  return null;
}
