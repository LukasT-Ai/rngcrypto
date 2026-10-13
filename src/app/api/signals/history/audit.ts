import { CANDLE_MS, firstEligibleCandleTime, horizonFor, isMarketOrder } from "./check/core";
import type { SignalLog } from "./logger";
import { normalize, reasonText, type NormalizedSignal } from "./performance";

/** Inputs at call time, every field nullable (records logged before 2026-10-13 carry none of them). */
export interface AuditInputs {
  weightedScore: number | null;
  confidenceRaw: number | null;
  components: Record<string, { score: number; weight: number }> | null;
  rr1: number | null;
  rr2: number | null;
  rr3: number | null;
  entryType: "market" | "limit" | null;
  atrPct: number | null;
  fundingRate: number | null;
  minutesToNextEvent: number | null;
  tuning: Record<string, unknown> | null;
  gateNotes: string[];
  engineVersion: string | null;
  calibrationVersion: string | null;
  pTp1: number | null;
  regime: string | null;
  regimeGate: string | null;
  markAtSignal: number | null;
  lastAtSignal: number | null;
  candleCloseTime: number | null;
  /** Factor assessments as logged (older records only have these). */
  factors: Record<string, string>;
  blocks?: unknown;
  /** PR 26: block votes (-1/0/1) and agreement logged with the call. */
  blockVotes?: unknown;
  mode?: unknown;
  eventWindow?: unknown;
}

export interface AuditResolution {
  firstEligibleCandle: number;
  fillWindowEnd: number;
  fillCandle: number | null;
  fillPrice: number | null;
  tpTouches: { level: 1 | 2 | 3; at: number; price: number }[];
  stopTouch: { at: number; price: number; afterTp: 0 | 1 | 2 | 3 } | null;
  horizonEnd: number;
  closedAt: number | null;
  closedReason: string | null;
  grossR: number | null;
  netR: number | null;
  costR: number | null;
  costEstimated: boolean;
  coverageGap: SignalLog["coverageGap"] | null;
  lastCheckedAt: number | null;
  mfeR: number | null;
  maeR: number | null;
  reasonText: string;
}

export interface AuditRecord {
  signal: SignalLog;
  row: NormalizedSignal;
  inputs: AuditInputs;
  resolution: AuditResolution;
}

export function auditRecord(sig: SignalLog): AuditRecord {
  const row = normalize(sig);
  const inp = sig.context?.inputs ?? null;
  const market = isMarketOrder(sig);
  const firstEligible = firstEligibleCandleTime(sig);
  const fillWindowCandles = (sig.context?.tradeType?.toUpperCase() ?? "") === "SCALP" ? 24 : 96;
  const inputs: AuditInputs = {
    weightedScore: inp?.weightedScore ?? null,
    confidenceRaw: inp?.confidenceRaw ?? null,
    components: inp?.components ?? null,
    rr1: row.rr1,
    rr2: inp?.rr2 ?? null,
    rr3: inp?.rr3 ?? null,
    entryType: inp?.entryType ?? (sig.priceAtSignal > 0 ? (market ? "market" : "limit") : null),
    atrPct: row.atrPct,
    fundingRate: inp?.fundingRate ?? null,
    minutesToNextEvent: inp?.minutesToNextEvent ?? null,
    tuning: inp?.tuning ?? null,
    gateNotes: inp?.gateNotes ?? [],
    engineVersion: sig.engineVersion ?? null,
    calibrationVersion: inp?.calibrationVersion ?? null,
    pTp1: inp?.pTp1 ?? null,
    regime: inp?.regime ?? sig.context?.factors?.["Cloud/200MA Regime"] ?? null,
    regimeGate: inp?.regimeGate ?? null,
    markAtSignal: inp?.markAtSignal ?? null,
    lastAtSignal: inp?.lastAtSignal ?? null,
    candleCloseTime: inp?.candleCloseTime ?? null,
    factors: sig.context?.factors ?? {},
    blocks: inp?.blocks ?? undefined,
    blockVotes: inp?.blockVotes ?? undefined,
  };
  const stopAt = sig.stoppedAt ?? (sig.stoppedAfterTp != null && sig.outcomeTimestamp != null ? sig.outcomeTimestamp : null);
  const resolution: AuditResolution = {
    firstEligibleCandle: firstEligible,
    fillWindowEnd: firstEligible + fillWindowCandles * CANDLE_MS,
    fillCandle: sig.filledAt ?? null,
    fillPrice: sig.fillPrice ?? (sig.fillStatus === "filled" ? sig.entry : null),
    tpTouches: (sig.tpHits ?? []).map((h) => ({ level: h.level, at: h.at, price: h.price })),
    stopTouch: sig.stoppedAfterTp != null && stopAt != null ? { at: stopAt, price: sig.stopLoss, afterTp: sig.stoppedAfterTp } : null,
    horizonEnd: sig.timestamp + horizonFor(sig),
    closedAt: row.closedAt,
    closedReason: row.closedReason,
    grossR: row.realizedR,
    netR: row.realizedNetR,
    costR: row.costR,
    costEstimated: row.costEstimated,
    coverageGap: sig.coverageGap ?? null,
    lastCheckedAt: sig.lastCheckedAt ?? null,
    mfeR: row.mfeR,
    maeR: row.maeR,
    reasonText: reasonText(row, sig),
  };
  return { signal: sig, row, inputs, resolution };
}
