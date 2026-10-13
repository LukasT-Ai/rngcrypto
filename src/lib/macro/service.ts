import type { Alert, CalendarReaction, CalendarRow, ConfirmationStatus, Direction, EventPhase, EventState, FirstMoveGate, Importance, MacroAsset, MacroCoupling, MacroRegime, MacroScores, MacroState, MarketSnapshot, ReactionLabel, ReactionPoint, ScheduledEvent, SnapshotKey, StoredRelease } from "./types";
import { MACRO_ASSETS, REACTION_SCHEDULE, SNAPSHOT_KEYS } from "./types";
import { defFor, getMacroEvents } from "./calendar";
import { formatValue } from "./taxonomy";
import { buildScenarios } from "./scenarios";
import { fetchRelease, latestCpiYoY, sourceStatus } from "./releases";
import { computeSurprise, magnitudeFromZ, type MarketPrior } from "./surprise";
import { impactForSurprise, preReleaseMap, transmission } from "./impact";
import { getPredictionState, type PredictionState } from "../prediction/service";
import { fedExpectationFor, fedPriorFor, marketExpectationFor, marketPriorFor, toCalendarMarket } from "./market-prior";
import { getMacroCoupling } from "./coupling";
import { firstMoveGate as gateFromMove, gateEligible, type GateEvent } from "./event-gate";
import { evaluateConfirmation } from "./confirmation";
import { classifyRegime } from "./regime";
import { fiveDayChanges, getSnapshot, priceAt, setMarketTtl } from "./market";
import { bestHistoricalStats, findRelease, getStoredReleases, rollingSurpriseSD, upsertRelease } from "./history";
import { buildWeeklyOil } from "./oil-weekly";
import { deriveAlerts } from "./alerts";
import { summarizeOutcome } from "./outcome";
import { fetchFxStreet, fxActualFor } from "./fxstreet";

// Economic calendar table: last 7 days (with actuals) and next 14 days, medium importance and up, per lens.
const CAL_BACK = 7 * 86400e3;
const CAL_AHEAD = 14 * 86400e3;

const ASSET_KEY: Record<MacroAsset, SnapshotKey> = { BTC: "btc", GOLD: "gold", WTI: "wti" };
const REACTION_ORDER: ReactionLabel[] = REACTION_SCHEDULE.map((r) => r.label);
// Below this move (percent) the observed reaction is reported as mixed (mirrors outcome.ts).
const FLAT_PCT: Record<MacroAsset, number> = { BTC: 0.25, GOLD: 0.15, WTI: 0.35 };

function observedDirection(asset: MacroAsset, movePct: number | null): Direction | null {
  if (movePct == null) return null;
  if (movePct > FLAT_PCT[asset]) return "bullish";
  if (movePct < -FLAT_PCT[asset]) return "bearish";
  return "mixed";
}

function dirSign(d: Direction | null | undefined): 1 | -1 | 0 | null {
  if (d == null) return null;
  return d === "bullish" ? 1 : d === "bearish" ? -1 : 0;
}

// Latest stored reaction sample for the lens, plus the 5m/15m/1h table for the row expansion.
function reactionFor(lens: MacroAsset, reactions: ReactionPoint[], confirmation: ConfirmationStatus | null): CalendarReaction | null {
  if (reactions.length === 0) return null;
  const sorted = [...reactions].sort((a, b) => REACTION_ORDER.indexOf(a.label) - REACTION_ORDER.indexOf(b.label));
  const latest = sorted[sorted.length - 1];
  const samples: CalendarReaction["samples"] = {};
  for (const r of sorted) {
    if (r.label !== "5m" && r.label !== "15m" && r.label !== "1h") continue;
    samples[r.label] = { BTC: r.changesPct.btc, GOLD: r.changesPct.gold, WTI: r.changesPct.wti };
  }
  return { label: latest.label, lensMovePct: latest.changesPct[ASSET_KEY[lens]], confirmation, samples };
}

// First-5-minute gate from the stored 5m sample (the engine evaluates the same rule on live candles). Between 0.5
// and 0.7 the 15m sample decides; with no 15m sample yet it stays pending.
function gateFromReactions(lens: MacroAsset, reactions: ReactionPoint[], surpriseDir: 1 | -1 | 0 | null): FirstMoveGate | null {
  if (surpriseDir == null || surpriseDir === 0) return null;
  const five = reactions.find((r) => r.label === "5m")?.changesPct[ASSET_KEY[lens]] ?? null;
  const g = gateFromMove(five, surpriseDir);
  if (g !== "pending" || five == null) return g;
  const fifteen = reactions.find((r) => r.label === "15m")?.changesPct[ASSET_KEY[lens]] ?? null;
  if (fifteen == null) return "pending";
  return gateFromMove(fifteen, surpriseDir) === "confirmed" ? "confirmed" : "unconfirmed";
}

async function buildCalendar(asset: MacroAsset | null, now: number, pred: PredictionState | null, coupling: MacroCoupling | null, activeId: string | null, regime: MacroRegime): Promise<CalendarRow[]> {
  const lens: MacroAsset = asset ?? "BTC";
  const events = await getMacroEvents(now - CAL_BACK, now + CAL_AHEAD);
  const fx = await fetchFxStreet();
  const stored = getStoredReleases();
  const live = [...rt.states.values()];
  const rows: CalendarRow[] = [];
  for (const e of events) {
    if (!relevantTo(asset, e.defId)) continue;
    const def = defFor(e.defId);
    const t = new Date(e.time).getTime();
    const released = t <= now;
    const st = live.find((x) => x.event.id === e.id) ?? null;
    const rec = stored.find((r) => r.id === e.id) ?? stored.find((r) => r.defId === e.defId && Math.abs(new Date(r.eventTime).getTime() - t) < 12 * 3600e3) ?? null;
    let actual: number | null = null;
    let actualRaw: string | null = null;
    if (released && def.unit !== "text") {
      // Verified live state first, then the stored history, then the calendar feed's own actual.
      if (st?.release?.actual) {
        actual = st.release.actual.value;
        actualRaw = st.release.actual.raw;
      } else if (rec?.actual != null) {
        actual = rec.actual;
        actualRaw = rec.actualRaw ?? formatValue(rec.actual, def.unit, def.decimals);
      } else {
        const fa = fxActualFor(fx, e.defId, e.time);
        if (fa) {
          actual = fa.value;
          actualRaw = fa.raw;
        }
      }
    }
    // Prediction-market expectation (Kalshi ladders for prints, meeting buckets for the Fed).
    const mx = marketExpectationFor(def, e, pred, now);
    const market = toCalendarMarket(mx);
    const fed = fedExpectationFor(def, e, pred, now);
    const prior: MarketPrior | null = mx?.liquid ? { mean: mx.mean, sd: mx.sd } : fedPriorFor(def, e, pred, now);
    // Live state carries the verified surprise (incl. the synthetic Fed-communication read); otherwise recompute.
    const sur = st?.surprise ?? (actual != null ? computeSurprise(def, actual, e.forecast, e.previous, rollingSurpriseSD(def.id), prior) : null);

    // Lens direction: observed at the latest sample once reactions exist, else expected from the surprise, else
    // the pre-release lean from the priced tail skew.
    const reactions = st?.reactions ?? rec?.reactions ?? [];
    const confStatus: ConfirmationStatus | null = st?.confirmation?.perAsset[lens].status ?? rec?.confirmation ?? null;
    const reaction = released ? reactionFor(lens, reactions, confStatus) : null;
    let assetDirection: Direction | null = null;
    let basis: CalendarRow["assetDirectionBasis"] = null;
    let surpriseDir: 1 | -1 | 0 | null = null;
    if (sur && sur.score != null) {
      const impacts = st?.postImpact ?? impactForSurprise(def, sur.score, sur.magnitude, regime);
      const imp = impacts.find((i) => i.asset === lens) ?? null;
      surpriseDir = dirSign(imp?.direction);
      assetDirection = imp?.direction ?? null;
      basis = assetDirection ? "expected" : null;
    }
    if (reaction?.lensMovePct != null) {
      const obs = observedDirection(lens, reaction.lensMovePct);
      if (obs) {
        assetDirection = obs;
        basis = "observed";
      }
    }
    if (!released && assetDirection == null && market?.tailSkew != null && Math.abs(market.tailSkew) >= 0.1) {
      const pre = preReleaseMap(def, regime).find((i) => i.asset === lens)?.conditional;
      if (pre) {
        assetDirection = market.tailSkew > 0 ? pre.ifAbove : pre.ifBelow;
        basis = "expected";
      }
    }
    const rel = def.relevance[lens] ?? 0;
    rows.push({
      id: e.id,
      defId: e.defId,
      title: e.title,
      time: e.time,
      importance: e.importance,
      kind: def.kind,
      country: e.country ?? "US",
      forecastRaw: e.forecastRaw,
      forecastSource: e.forecastSource ?? null,
      previousRaw: e.previousRaw,
      actualRaw,
      released,
      read: sur && sur.score != null ? sur.label : null,
      score: sur?.score ?? null,
      relevance: def.relevance,
      lensRelevance: Math.round(rel * (lens === "BTC" ? coupling?.mult ?? 1 : 1) * 100) / 100,
      assetDirection,
      assetDirectionBasis: basis,
      zScore: sur?.zScore ?? null,
      zAnchor: sur?.zAnchor ?? null,
      isLive: activeId != null && e.id === activeId,
      market,
      fed,
      reaction,
      firstMoveGate: released ? gateFromReactions(lens, reactions, surpriseDir) : null,
    });
  }
  return rows.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

// Configurable blend (also surfaced in the API so the UI can show it).
export const MACRO_WEIGHTS = {
  macroBase: 0.08,
  eventBase: 0.12,
  confirmationBase: 0.08,
  eventBoostMultiplier: 2.0,
  eventBoostMinutes: 30,
  eventDecayMinutes: 240,
  // Phase 3.2: the directional information in a print is spent inside the hour for BTC/Gold (45-minute half-life,
  // hard zero at 3h) and inside 10-30 minutes for WTI inventory prints.
  eventHalfLifeMinutes: 45,
  eventZeroMinutes: 180,
  oilInventoryHalfLifeMinutes: 10,
  oilInventoryZeroMinutes: 30,
};

function eventWindowFor(asset: MacroAsset, kind: EventState["def"]["kind"]): { halfLife: number; zero: number } {
  const oil = asset === "WTI" && (kind === "oil_inventory" || kind === "oil_product_inventory");
  return oil ? { halfLife: MACRO_WEIGHTS.oilInventoryHalfLifeMinutes, zero: MACRO_WEIGHTS.oilInventoryZeroMinutes } : { halfLife: MACRO_WEIGHTS.eventHalfLifeMinutes, zero: MACRO_WEIGHTS.eventZeroMinutes };
}

const WINDOW_BEFORE = 2 * 3600e3;
const WINDOW_AFTER = 4 * 3600e3;
const RECENT_KEEP = 24 * 3600e3;
// Keep trying to verify an actual for up to 6h (secondary sources like FXStreet can lag the wire by a long time).
const VERIFY_FOR = 6 * 3600e3;
// A news-reported number is provisional: keep polling so the calendar actual replaces it.
const PROVISIONAL_RECHECK = 60_000;

const rank: Record<Importance, number> = { low: 0, medium: 1, high: 2, critical: 3 };

interface Runtime {
  states: Map<string, EventState>;
  lastVerifyAttempt: Map<string, number>;
  regime: MacroRegime | null;
  regimeAt: number;
  snapshot: MarketSnapshot | null;
  alerts: Alert[];
  lastTick: number;
  ticking: boolean;
  stateCache: Map<string, { state: MacroState; at: number }>;
  pred: PredictionState | null;
  coupling: MacroCoupling | null;
}

const rt: Runtime = {
  states: new Map(),
  lastVerifyAttempt: new Map(),
  regime: null,
  regimeAt: 0,
  snapshot: null,
  alerts: [],
  lastTick: 0,
  ticking: false,
  stateCache: new Map(),
  pred: null,
  coupling: null,
};

function phaseFor(secondsToRelease: number, s: EventState | null): EventPhase {
  if (secondsToRelease > 15 * 60) return "upcoming";
  if (secondsToRelease > 60) return "imminent";
  if (secondsToRelease > -90) return "releasing";
  const age = -secondsToRelease;
  if (age > WINDOW_AFTER / 1000) return "settled";
  if (s?.release?.status === "verified" && s.reactions.length > 0) return "confirming";
  return "released";
}

async function ensureRegime(): Promise<MacroRegime> {
  if (rt.regime && Date.now() - rt.regimeAt < 5 * 60e3) return rt.regime;
  const [snap, chg, cpi] = await Promise.all([getSnapshot(), fiveDayChanges(), latestCpiYoY()]);
  rt.snapshot = snap;
  rt.regime = classifyRegime({
    us2y: snap.prices.us2y,
    us10y: snap.prices.us10y,
    us2yChg5d: chg.us2y,
    dxy: snap.prices.dxy,
    dxyChg5d: chg.dxy,
    vix: snap.prices.vix,
    spxChg5d: chg.spx,
    cpiYoY: cpi,
  });
  rt.regimeAt = Date.now();
  return rt.regime;
}

function priorFor(def: EventState["def"], event: ScheduledEvent, pred: PredictionState | null, now: number): MarketPrior | null {
  return marketPriorFor(def, event, pred, now) ?? fedPriorFor(def, event, pred, now);
}

function newState(event: ScheduledEvent, regime: MacroRegime, now: number, pred: PredictionState | null): EventState {
  const def = defFor(event.defId);
  const stored = findRelease(event.id);
  const st: EventState = {
    event,
    def,
    phase: "upcoming",
    secondsToRelease: Math.round((new Date(event.time).getTime() - now) / 1000),
    preMap: preReleaseMap(def, regime),
    scenarios: buildScenarios(def, event, regime, null, rollingSurpriseSD(def.id)),
    release: null,
    surprise: null,
    postImpact: null,
    confirmation: null,
    reactions: stored?.reactions ?? [],
    releaseSnapshot: stored?.releaseSnapshot ?? null,
    historical: null,
    dataAgeMs: null,
    alerts: [],
    outcome: null,
  };
  // Rehydrate a verified release after a restart so reactions keep accumulating.
  if (stored?.actual != null) {
    st.release = {
      eventId: event.id,
      status: "verified",
      actual: {
        value: stored.actual,
        raw: stored.actualRaw ?? formatValue(stored.actual, def.unit, def.decimals),
        period: stored.eventTime.slice(0, 10),
        revisionStatus: "unknown",
        provider: stored.actualProvider ?? (def.source.provider === "NONE" ? "FXSTREET" : def.source.provider),
        series: stored.actualSeries ?? def.source.series ?? "",
        sourceTimestamp: null,
        retrievedAt: stored.recordedAt,
        priorRevised: null,
      },
      candidates: [],
      note: "Rehydrated from stored release",
      checkedAt: stored.recordedAt,
    };
    const ev = { ...event, forecast: event.forecast ?? stored.forecast, previous: event.previous ?? stored.previous };
    st.surprise = computeSurprise(def, stored.actual, ev.forecast, ev.previous, rollingSurpriseSD(def.id), priorFor(def, ev, pred, now));
    st.postImpact = impactForSurprise(def, st.surprise.score, st.surprise.magnitude, regime);
    st.scenarios = buildScenarios(def, { forecast: event.forecast ?? stored.forecast, previous: event.previous ?? stored.previous }, regime, stored.actual, rollingSurpriseSD(def.id));
  }
  return st;
}

function pctChange(key: SnapshotKey, from: number | null, to: number | null): number | null {
  if (from == null || to == null || from === 0) return null;
  if (key === "us2y" || key === "us10y") return Math.round((to - from) * 1000) / 1000;
  return Math.round(((to - from) / from) * 10000) / 100;
}

async function snapshotAt(tsMs: number): Promise<MarketSnapshot> {
  const prices = {} as Record<SnapshotKey, number | null>;
  for (const k of SNAPSHOT_KEYS) prices[k] = await priceAt(k, tsMs);
  return { at: new Date(tsMs).toISOString(), prices, dataAgeMs: null };
}

function persist(st: EventState, regime: MacroRegime) {
  const rec: StoredRelease = {
    id: st.event.id,
    defId: st.def.id,
    eventTime: st.event.time,
    forecast: st.event.forecast,
    previous: st.event.previous,
    actual: st.release?.actual?.value ?? null,
    actualRaw: st.release?.actual?.raw ?? null,
    actualProvider: st.release?.actual?.provider ?? null,
    actualSeries: st.release?.actual?.series ?? null,
    surpriseScore: st.surprise?.score ?? null,
    magnitude: st.surprise?.magnitude ?? "inline",
    regime: { inflationFocus: regime.inflationFocus, policyBias: regime.policyBias, risk: regime.risk },
    releaseSnapshot: st.releaseSnapshot,
    reactions: st.reactions,
    confirmation: st.confirmation?.status ?? null,
    recordedAt: new Date().toISOString(),
  };
  upsertRelease(rec);
}

async function advance(st: EventState, regime: MacroRegime, now: number, pred: PredictionState | null): Promise<void> {
  const t0 = new Date(st.event.time).getTime();
  st.secondsToRelease = Math.round((t0 - now) / 1000);
  st.phase = phaseFor(st.secondsToRelease, st);
  if (now < t0) return;

  // 1) Verify the actual number (poll fast for the first minutes, then back off).
  const age = now - t0;
  const provisional = st.release?.status === "verified" && st.release.actual?.provider === "NEWS";
  if ((st.release?.status !== "verified" || provisional) && st.release?.status !== "unavailable" && age < VERIFY_FOR) {
    const last = rt.lastVerifyAttempt.get(st.event.id) ?? 0;
    const interval = provisional ? PROVISIONAL_RECHECK : age < 10 * 60e3 ? 10_000 : age < 3600e3 ? 30_000 : 5 * 60e3;
    if (now - last >= interval) {
      rt.lastVerifyAttempt.set(st.event.id, now);
      const rel = await fetchRelease(st.def, st.event);
      // Never downgrade a provisional number back to "awaiting"; only a calendar actual may replace it.
      if (!(provisional && rel.status !== "verified")) st.release = rel;
      if (rel.status === "verified" && rel.actual && (!provisional || rel.actual.provider !== "NEWS")) {
        st.surprise = computeSurprise(st.def, rel.actual.value, st.event.forecast, st.event.previous, rollingSurpriseSD(st.def.id), priorFor(st.def, st.event, pred, now));
        st.postImpact = impactForSurprise(st.def, st.surprise.score, st.surprise.magnitude, regime, rel.actual.components);
        st.scenarios = buildScenarios(st.def, st.event, regime, rel.actual.value, rollingSurpriseSD(st.def.id));
        st.historical = bestHistoricalStats(st.def.id, st.surprise.score, regime);
        if (!st.releaseSnapshot) st.releaseSnapshot = await snapshotAt(t0);
        persist(st, regime);
      }
    }
  } else if (st.release == null && age >= VERIFY_FOR) {
    st.release = await fetchRelease(st.def, st.event);
  }

  // 2) Reaction samples on the schedule (also for text events, where the market IS the data).
  if (!st.releaseSnapshot && age >= 30_000) st.releaseSnapshot = await snapshotAt(t0);
  if (st.releaseSnapshot) {
    const live = rt.snapshot ?? (await getSnapshot());
    for (const sched of REACTION_SCHEDULE) {
      if (age < sched.afterMs) continue;
      if (st.reactions.some((r) => r.label === sched.label)) continue;
      // Late (after restart): reconstruct from intraday series; otherwise use the live snapshot.
      const lateBy = age - sched.afterMs;
      const useLive = lateBy < 60_000;
      const target = useLive ? live : await snapshotAt(t0 + sched.afterMs);
      const changes = {} as Record<SnapshotKey, number | null>;
      for (const k of SNAPSHOT_KEYS) changes[k] = pctChange(k, st.releaseSnapshot.prices[k], target.prices[k]);
      st.reactions.push({ label: sched.label, at: new Date(t0 + sched.afterMs).toISOString(), changesPct: changes });
      persist(st, regime);
    }
    st.dataAgeMs = live.dataAgeMs;
  }

  // 2b) Text events (FOMC statement, minutes, Fed speeches) have no number. Read the front-end yield reaction
  //     at 5m (then 15m) as a synthetic hawkish/dovish surprise so a hawkish Fed scores bearish for BTC and
  //     gold with the same magnitude a dovish Fed scores bullish. 2Y change is stored in percentage points.
  if (st.def.kind === "fed_communication" && st.reactions.length > 0) {
    const sample = st.reactions.find((r) => r.label === "15m") ?? st.reactions.find((r) => r.label === "5m") ?? null;
    const us2yPts = sample?.changesPct.us2y ?? null;
    if (us2yPts != null) {
      const bp = us2yPts * 100;
      const syntheticScore = Math.round(100 * Math.tanh(bp / 8)); // +5bp => about +55 (hawkish)
      const dxy = sample?.changesPct.dxy ?? null;
      // Dollar disagreeing with yields halves the read; agreeing leaves it intact.
      const agreed = dxy == null ? 1 : Math.sign(dxy) === Math.sign(bp) || Math.abs(dxy) < 0.1 ? 1 : 0.5;
      const score = Math.round(syntheticScore * agreed);
      const magnitude = magnitudeFromZ(bp / 5);
      st.surprise = {
        delta: Math.round(bp * 10) / 10,
        unit: st.def.unit,
        zScore: Math.round((bp / 5) * 100) / 100,
        anchor: 0,
        zAnchor: "market",
        sdSource: "prior",
        score,
        magnitude,
        label: Math.abs(bp) < 2 ? "Market read: neutral (2Y little changed)" : `Market read: ${bp > 0 ? "hawkish" : "dovish"} (2Y ${bp > 0 ? "+" : ""}${bp.toFixed(1)}bp at ${sample!.label}${dxy != null ? `, DXY ${dxy >= 0 ? "+" : ""}${dxy.toFixed(2)}%` : ""})`,
        vsPrevious: null,
      };
      st.postImpact = impactForSurprise(st.def, score, magnitude, regime);
    }
  }

  // 3) Confirmation (needs a directional expectation; for text events use the observed rates/dollar read).
  if (st.reactions.length > 0) {
    const s = st.surprise?.score ?? null;
    const trans = transmission(st.def, s, regime, st.release?.actual?.components);
    const impacts = st.postImpact ?? impactForSurprise(st.def, s, st.surprise?.magnitude ?? null, regime);
    st.confirmation = evaluateConfirmation(trans, impacts, st.reactions);
    if (st.release?.status === "verified") persist(st, regime);
  }
}

function decayWeight(ageMin: number | null): number {
  const w = MACRO_WEIGHTS;
  if (ageMin == null) return w.eventBase;
  if (ageMin <= w.eventBoostMinutes) return w.eventBase * w.eventBoostMultiplier;
  if (ageMin >= w.eventDecayMinutes) return w.eventBase;
  const f = (ageMin - w.eventBoostMinutes) / (w.eventDecayMinutes - w.eventBoostMinutes);
  return w.eventBase * (w.eventBoostMultiplier - f * (w.eventBoostMultiplier - 1));
}

function scoresFor(asset: MacroAsset, regime: MacroRegime, states: EventState[], now: number, coupling: MacroCoupling | null): MacroScores {
  // Macro: slow regime lean.
  let macro = 0;
  if (regime.policyBias === "easing") macro += asset === "WTI" ? 5 : 20;
  if (regime.policyBias === "tightening") macro -= asset === "WTI" ? 5 : 20;
  // Risk regime is a mirror: what risk-off takes from BTC and crude (and gives gold), risk-on gives back.
  if (regime.risk === "off") macro += asset === "BTC" ? -20 : asset === "GOLD" ? 10 : -10;
  if (regime.risk === "on") macro += asset === "BTC" ? 20 : asset === "GOLD" ? -10 : 10;
  if (regime.inflationFocus === "high") macro += asset === "GOLD" ? 10 : asset === "BTC" ? -5 : 5;
  if (regime.inflationFocus === "low") macro += asset === "GOLD" ? -10 : asset === "BTC" ? 5 : -5;

  // Event: verified releases inside the asset-class window (3h BTC/Gold, 30m WTI inventories), 45-minute
  // half-life, weighted by importance.
  let eventSum = 0;
  let eventW = 0;
  let youngest: number | null = null;
  let confirmation = 0;
  let confW = 0;
  for (const s of states) {
    if (!s.postImpact || s.release?.status !== "verified") continue;
    const ageMin = (now - new Date(s.event.time).getTime()) / 60e3;
    const win = eventWindowFor(asset, s.def.kind);
    if (ageMin >= win.zero || ageMin < 0) continue;
    const imp = s.postImpact.find((i) => i.asset === asset);
    if (!imp) continue;
    const decay = Math.pow(0.5, ageMin / win.halfLife);
    const w = (1 + rank[s.event.importance]) * decay;
    eventSum += imp.score * w;
    eventW += w;
    if (youngest == null || ageMin < youngest) youngest = ageMin;
    if (s.confirmation && s.confirmation.pct != null) {
      const pa = s.confirmation.perAsset[asset];
      const sign = imp.direction === "bullish" ? 1 : imp.direction === "bearish" ? -1 : 0;
      let c = (s.confirmation.pct - 50) * 2 * sign;
      if (pa.status === "reversing") c = -Math.abs(c) || -40;
      if (pa.status === "fading") c *= 0.3;
      confirmation += c * w;
      confW += w;
    }
  }
  const event = eventW ? Math.round(eventSum / eventW) : 0;
  const conf = confW ? Math.round(confirmation / confW) : 0;
  const ew = decayWeight(youngest);
  // Phase 3.3: macro and event weights on the crypto lens scale with the BTC/SPX coupling (0.3..1).
  const cm = asset === "BTC" && coupling ? coupling.mult : 1;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    macro: Math.round(macro),
    event,
    confirmation: conf,
    // No verified release in the window = no vote, so the weight leaves the engine's denominator instead of
    // diluting the technical evidence toward WAIT for BTC/GOLD/OIL (a ~20% confidence haircut with no information).
    weights: { macro: r3(MACRO_WEIGHTS.macroBase * cm), event: eventW ? r3(ew * cm) : 0, confirmation: confW ? MACRO_WEIGHTS.confirmationBase : 0 },
    eventAgeMinutes: youngest == null ? null : Math.round(youngest),
    note: youngest == null ? "No verified release inside the event window; event weight at base" : youngest <= MACRO_WEIGHTS.eventBoostMinutes ? "Fresh release: event weight boosted" : "Event weight decaying toward zero at the window end",
  };
}

export async function tick(): Promise<void> {
  if (rt.ticking) return;
  rt.ticking = true;
  try {
    const now = Date.now();
    const regime = await ensureRegime();
    const events = await getMacroEvents(now - RECENT_KEEP, now + 7 * 86400e3);

    // Faster market polling while anything is in its release window.
    const hot = events.some((e) => {
      const dt = new Date(e.time).getTime() - now;
      return dt < 2 * 60e3 && dt > -20 * 60e3 && rank[e.importance] >= rank.high;
    });
    setMarketTtl(hot ? 8_000 : 30_000);
    rt.snapshot = await getSnapshot();
    // Prediction-market odds (60s cached, never throws) feed the surprise anchor and the calendar.
    const pred = await getPredictionState().catch(() => null);
    rt.pred = pred;

    for (const e of events) {
      const dt = new Date(e.time).getTime() - now;
      if (dt > WINDOW_BEFORE || dt < -RECENT_KEEP) continue;
      let st = rt.states.get(e.id);
      if (!st) {
        st = newState(e, regime, now, pred);
        rt.states.set(e.id, st);
      } else {
        st.event = { ...e, forecast: e.forecast ?? st.event.forecast, previous: e.previous ?? st.event.previous };
        // A consensus that lands later (or a revised previous) re-anchors the scenario bands; keep the actual's band marked.
        st.scenarios = buildScenarios(st.def, st.event, regime, st.release?.status === "verified" ? st.release.actual?.value ?? null : null, rollingSurpriseSD(st.def.id));
      }
      await advance(st, regime, now, pred);
    }
    for (const [id, st] of rt.states) {
      if (now - new Date(st.event.time).getTime() > RECENT_KEEP) rt.states.delete(id);
    }

    const fresh = deriveAlerts([...rt.states.values()], now);
    rt.alerts = [...fresh, ...rt.alerts].slice(0, 100);
    rt.lastTick = now;
    rt.stateCache.clear();
  } finally {
    rt.ticking = false;
  }
}

// Minimum taxonomy relevance for an event to appear on a ticker's page (API crude is 0.0 for BTC, CPI 0.4 for WTI).
const MIN_RELEVANCE = 0.3;

function relevantTo(asset: MacroAsset | null, defId: string): boolean {
  if (!asset) return true;
  return (defFor(defId).relevance[asset] ?? 0) >= MIN_RELEVANCE;
}

export async function getMacroState(asset: MacroAsset | null = null): Promise<MacroState> {
  const cacheKey = asset ?? "all";
  const cached = rt.stateCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5_000) return cached.state;
  if (Date.now() - rt.lastTick > 20_000) await tick();
  const now = Date.now();
  const regime = rt.regime ?? (await ensureRegime());
  const market = rt.snapshot ?? (await getSnapshot());
  const all = [...rt.states.values()];
  for (const s of all) {
    s.secondsToRelease = Math.round((new Date(s.event.time).getTime() - now) / 1000);
    s.phase = phaseFor(s.secondsToRelease, s);
    s.outcome = summarizeOutcome(s, now);
  }

  // The WTI lens needs the next weekly inventory release even right after one landed, so look two weeks out.
  const horizonDays = asset === "WTI" ? 14 : 7;
  const fortnight = await getMacroEvents(now, now + horizonDays * 86400e3);
  const upcomingAll = fortnight.filter((e) => new Date(e.time).getTime() <= now + 7 * 86400e3 && relevantTo(asset, e.defId));
  const oilWeekly = asset === "WTI" ? buildWeeklyOil(fortnight, getStoredReleases(), now) : undefined;
  const upcoming = upcomingAll.filter((e) => rank[e.importance] >= rank.medium).slice(0, 12);

  // Active = what the trader should be looking at right now, for this ticker.
  const candidates = all.filter((s) => relevantTo(asset, s.def.id) && s.secondsToRelease <= WINDOW_BEFORE / 1000 && s.secondsToRelease >= -WINDOW_AFTER / 1000 && rank[s.event.importance] >= rank.medium);
  const phaseRank: Record<EventPhase, number> = { releasing: 5, confirming: 4, released: 4, imminent: 3, upcoming: 1, settled: 0 };
  candidates.sort((a, b) => phaseRank[b.phase] - phaseRank[a.phase] || rank[b.event.importance] - rank[a.event.importance] || Math.abs(a.secondsToRelease) - Math.abs(b.secondsToRelease));
  const active = candidates[0] ?? null;
  const recent = all.filter((s) => s !== active && relevantTo(asset, s.def.id) && s.secondsToRelease < 0 && rank[s.event.importance] >= rank.medium).sort((a, b) => b.secondsToRelease - a.secondsToRelease).slice(0, 6);

  const coupling = await getMacroCoupling().catch(() => null);
  rt.coupling = coupling;
  const scores = Object.fromEntries(MACRO_ASSETS.map((a) => [a, scoresFor(a, regime, all, now, coupling)])) as Record<MacroAsset, MacroScores>;
  const nextBig = upcomingAll.find((e) => rank[e.importance] >= rank.high && new Date(e.time).getTime() - now <= 15 * 60e3);
  const preEventRisk = nextBig ? { event: nextBig, minutes: Math.max(0, Math.round((new Date(nextBig.time).getTime() - now) / 60e3)), importance: nextBig.importance } : null;

  const calendar = await buildCalendar(asset, now, rt.pred, coupling, active?.event.id ?? null, regime);

  const state: MacroState = {
    asOf: new Date(now).toISOString(),
    regime,
    market,
    upcoming,
    calendar,
    active,
    recent,
    scores,
    alerts: rt.alerts.filter((a) => !asset || a.asset == null || a.asset === asset).slice(0, 30),
    preEventRisk,
    macroCoupling: coupling,
    sources: sourceStatus(),
    ...(oilWeekly ? { oilWeekly } : {}),
  };
  rt.stateCache.set(cacheKey, { state, at: now });
  return state;
}

// Lightweight accessor for the signal engine (avoids blocking a signal request on network if a tick is recent).
export async function getMacroScores(asset: MacroAsset): Promise<{ scores: MacroScores; preEventRisk: MacroState["preEventRisk"]; active: EventState | null }> {
  const s = await getMacroState(asset);
  return { scores: s.scores[asset], preEventRisk: s.preEventRisk, active: s.active };
}

// Inputs for the engine's universal event gate (event-gate.ts): every high/critical event relevant to the lens
// from 3h back to 90 minutes ahead, with the verified surprise direction and confirmation status where they exist,
// plus the BTC/SPX coupling. Cheap: reads the cached state for the lens.
export async function getEventGateInputs(lens: MacroAsset): Promise<{ events: GateEvent[]; coupling: MacroCoupling | null; asOf: string }> {
  const s = await getMacroState(lens);
  const now = new Date(s.asOf).getTime();
  const live = [...rt.states.values()];
  const cal = await getMacroEvents(now - 3 * 3600e3, now + 90 * 60e3);
  const events: GateEvent[] = [];
  for (const e of cal) {
    const def = defFor(e.defId);
    const relevance = def.relevance[lens] ?? 0;
    const ge: GateEvent = { id: e.id, title: e.title, time: new Date(e.time).getTime(), importance: e.importance, kind: def.kind, relevance, surpriseDir: null, confirmation: null };
    if (!gateEligible(ge)) continue;
    const st = live.find((x) => x.event.id === e.id);
    if (st?.postImpact && st.release?.status === "verified") {
      ge.surpriseDir = dirSign(st.postImpact.find((i) => i.asset === lens)?.direction);
      ge.confirmation = st.confirmation?.perAsset[lens].status ?? null;
    }
    events.push(ge);
  }
  return { events, coupling: s.macroCoupling, asOf: s.asOf };
}

export function macroAssetFor(symbol: string): MacroAsset | null {
  if (symbol === "BTC") return "BTC";
  if (symbol === "GOLD") return "GOLD";
  if (symbol === "OIL") return "WTI";
  return null;
}

// Which macro lens a ticker's page uses: metals follow gold, energy follows WTI, everything else (crypto, equities,
// indices) follows the BTC/risk-asset lens.
export function macroLensFor(symbol: string): MacroAsset {
  if (symbol === "GOLD" || symbol === "SILVER") return "GOLD";
  if (symbol === "OIL") return "WTI";
  return "BTC";
}

export type { ReactionPoint };
