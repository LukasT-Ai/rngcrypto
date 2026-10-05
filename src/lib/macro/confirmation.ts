import type { AssetImpact, Confirmation, ConfirmationCheck, ConfirmationStatus, Direction, MacroAsset, ReactionPoint, SnapshotKey } from "./types";
import type { Transmission } from "./impact";

// Minimum move that counts as a direction. Yields are absolute percentage-point changes; everything else is %.
const FLAT: Record<SnapshotKey, number> = {
  dxy: 0.1,
  us2y: 0.02,
  us10y: 0.02,
  spx: 0.15,
  ndx: 0.2,
  vix: 2,
  btc: 0.3,
  gold: 0.2,
  wti: 0.4,
};

const ASSET_KEY: Record<MacroAsset, SnapshotKey> = { BTC: "btc", GOLD: "gold", WTI: "wti" };

type Exp = "up" | "down" | "flat";
const expOf = (v: number, thr = 0.15): Exp => (v > thr ? "up" : v < -thr ? "down" : "flat");
const inv = (e: Exp): Exp => (e === "up" ? "down" : e === "down" ? "up" : "flat");

export function expectedChecks(t: Transmission, impacts: AssetImpact[]): Omit<ConfirmationCheck, "observedPct" | "observed" | "agrees">[] {
  const rates = expOf(t.r);
  const risk = t.g > 0.15 || t.r < -0.15 ? "up" : t.r > 0.15 || t.g < -0.15 ? "down" : "flat";
  const dirExp = (d: Direction): Exp => (d === "bullish" ? "up" : d === "bearish" ? "down" : "flat");
  const byAsset = Object.fromEntries(impacts.map((i) => [i.asset, i])) as Record<MacroAsset, AssetImpact>;
  return [
    { name: "DXY", key: "dxy", expected: rates },
    { name: "US 2Y", key: "us2y", expected: rates },
    { name: "US 10Y", key: "us10y", expected: rates },
    { name: "S&P 500", key: "spx", expected: risk },
    { name: "Nasdaq", key: "ndx", expected: risk },
    { name: "VIX", key: "vix", expected: inv(risk) },
    { name: "BTC", key: "btc", expected: dirExp(byAsset.BTC?.direction ?? "mixed") },
    { name: "Gold", key: "gold", expected: dirExp(byAsset.GOLD?.direction ?? "mixed") },
    { name: "WTI", key: "wti", expected: dirExp(byAsset.WTI?.direction ?? "mixed") },
  ];
}

function observe(key: SnapshotKey, pct: number | null): Exp | null {
  if (pct == null) return null;
  const thr = FLAT[key];
  return pct > thr ? "up" : pct < -thr ? "down" : "flat";
}

const ORDER = ["30s", "1m", "5m", "15m", "1h", "4h", "24h"] as const;

export function evaluateConfirmation(
  t: Transmission,
  impacts: AssetImpact[],
  reactions: ReactionPoint[],
  asOf = new Date().toISOString()
): Confirmation {
  const expected = expectedChecks(t, impacts);
  const sorted = [...reactions].sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
  const latest = sorted[sorted.length - 1] ?? null;
  const empty: Confirmation = {
    status: "awaiting",
    pct: null,
    checks: expected.map((e) => ({ ...e, observedPct: null, observed: null, agrees: null })),
    perAsset: {
      BTC: { status: "awaiting", direction: "mixed", note: "Waiting for first reaction sample" },
      GOLD: { status: "awaiting", direction: "mixed", note: "Waiting for first reaction sample" },
      WTI: { status: "awaiting", direction: "mixed", note: "Waiting for first reaction sample" },
    },
    summary: "Awaiting market reaction",
    basedOn: null,
    asOf,
  };
  if (!latest) return empty;

  const mature = ORDER.indexOf(latest.label) >= ORDER.indexOf("5m");
  const checks: ConfirmationCheck[] = expected.map((e) => {
    const pct = latest.changesPct[e.key];
    const observed = observe(e.key, pct);
    let agrees: boolean | null = null;
    if (e.expected !== "flat" && observed != null) {
      if (observed === e.expected) agrees = true;
      else if (observed === "flat") agrees = mature ? false : null;
      else agrees = false;
    }
    return { ...e, observedPct: pct, observed, agrees };
  });

  const scored = checks.filter((c) => c.agrees != null);
  const agree = scored.filter((c) => c.agrees).length;
  const pct = scored.length ? Math.round((agree / scored.length) * 100) : null;

  // Core macro plumbing (rates + dollar) vs risk assets disagreeing = conflicted, not merely unconfirmed.
  const core = checks.filter((c) => ["dxy", "us2y", "us10y"].includes(c.key) && c.agrees != null);
  const coreAgree = core.length ? core.filter((c) => c.agrees).length / core.length : null;
  const riskChecks = checks.filter((c) => ["spx", "ndx", "btc", "gold"].includes(c.key) && c.agrees != null);
  const riskAgree = riskChecks.length ? riskChecks.filter((c) => c.agrees).length / riskChecks.length : null;

  let status: ConfirmationStatus;
  if (pct == null) status = "awaiting";
  else if (pct >= 70) status = "confirmed";
  else if (pct <= 30) status = "unconfirmed";
  else if (coreAgree != null && riskAgree != null && Math.abs(coreAgree - riskAgree) >= 0.5) status = "conflicted";
  else status = "unconfirmed";

  // Fading / reversing: compare the latest sample to the 5m sample for the asset legs.
  const five = sorted.find((r) => r.label === "5m") ?? null;
  const perAsset = {} as Confirmation["perAsset"];
  for (const asset of ["BTC", "GOLD", "WTI"] as MacroAsset[]) {
    const imp = impacts.find((i) => i.asset === asset);
    const key = ASSET_KEY[asset];
    const dir = imp?.direction ?? "mixed";
    const sign = dir === "bullish" ? 1 : dir === "bearish" ? -1 : 0;
    const now = latest.changesPct[key];
    const at5 = five?.changesPct[key] ?? null;
    let st: ConfirmationStatus = status;
    let note = "";
    if (sign === 0 || now == null) {
      st = "awaiting";
      note = sign === 0 ? "No directional call for this asset" : "No price sample yet";
    } else {
      const moved = now * sign;
      const thr = FLAT[key];
      if (five && at5 != null && latest.label !== "5m" && ORDER.indexOf(latest.label) > ORDER.indexOf("5m")) {
        const early = at5 * sign;
        if (early > thr && moved < -thr) {
          st = "reversing";
          note = `Initial ${dir} move (${fmt(at5)} at 5m) has reversed to ${fmt(now)} by ${latest.label}`;
        } else if (early > thr && moved < early * 0.4) {
          st = "fading";
          note = `Initial ${dir} move (${fmt(at5)} at 5m) is fading (${fmt(now)} at ${latest.label})`;
        }
      }
      if (!note) {
        if (moved > thr) {
          st = pct != null && pct >= 50 ? "confirmed" : "conflicted";
          note = `${asset} ${fmt(now)} since release, ${st === "confirmed" ? "with" : "without"} rates/dollar support`;
        } else if (moved < -thr) {
          st = "unconfirmed";
          note = `${asset} moving against the expected ${dir} reaction (${fmt(now)})`;
        } else {
          st = mature ? "unconfirmed" : "awaiting";
          note = mature ? `${asset} flat since release (${fmt(now)})` : `Too early to judge (${latest.label})`;
        }
      }
    }
    perAsset[asset] = { status: st, direction: dir, note };
  }

  const agreeing = checks.filter((c) => c.agrees).map((c) => c.name);
  const disagreeing = checks.filter((c) => c.agrees === false).map((c) => c.name);
  const summary =
    status === "confirmed"
      ? `Rates and dollar are responding in the expected direction (${agreeing.slice(0, 4).join(", ")}).`
      : status === "unconfirmed"
        ? `Expected reaction not confirmed — ${disagreeing.slice(0, 4).join(", ")} moving the other way.`
        : status === "conflicted"
          ? `Mixed tape: ${agreeing.slice(0, 3).join(", ")} agree but ${disagreeing.slice(0, 3).join(", ")} do not.`
          : "Awaiting market reaction";

  return { status, pct, checks, perAsset, summary, basedOn: latest.label, asOf };
}

function fmt(v: number | null) {
  return v == null ? "n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
