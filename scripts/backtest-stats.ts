/**
 * Small-sample statistics for the backtest report (research/research-strategy-price-action-macro.md section 5):
 * per-trade Sharpe with skew and kurtosis, the expected maximum Sharpe of N trials (SR0), the Probabilistic
 * Sharpe Ratio against a benchmark and the minimum track-record length (Bailey & Lopez de Prado, SSRN 2460551).
 * Dependency-free so the same code can run on the live ledger later.
 */

const EULER_GAMMA = 0.5772156649015329;

const r3 = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);

export interface SharpeStats {
  n: number;
  mean: number | null;
  sd: number | null;
  sharpe: number | null;
  tStat: number | null;
  skew: number | null;
  kurtosis: number | null;
}

/** Mean, sample sd, per-trade Sharpe (mean/sd), t-stat (SR * sqrt(n)), skew and (non-excess) kurtosis. */
export function sharpeStats(xs: number[]): SharpeStats {
  const n = xs.length;
  if (n < 2) return { n, mean: n ? r3(xs[0]) : null, sd: null, sharpe: null, tStat: null, skew: null, kurtosis: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const m2 = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt((m2 * n) / (n - 1));
  if (!(sd > 0)) return { n, mean: r3(mean), sd: 0, sharpe: null, tStat: null, skew: null, kurtosis: null };
  const m3 = xs.reduce((a, b) => a + (b - mean) ** 3, 0) / n;
  const m4 = xs.reduce((a, b) => a + (b - mean) ** 4, 0) / n;
  const sharpe = mean / sd;
  return { n, mean: r3(mean), sd: r3(sd), sharpe: r3(sharpe), tStat: r3(sharpe * Math.sqrt(n)), skew: r3(m3 / Math.pow(m2, 1.5)), kurtosis: r3(m4 / (m2 * m2)) };
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 erf approximation, |err| < 1.5e-7). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Inverse standard normal CDF (Acklam's algorithm, rel. err. ~1e-9). */
export function normInv(p: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  const ph = 1 - pl;
  let q: number;
  let r: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= ph) {
    q = p - 0.5;
    r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/** Expected maximum Sharpe of N independent trials whose Sharpes have variance V (SR0 in the DSR paper). */
export function expectedMaxSharpe(trialVariance: number, trials: number): number {
  const n = Math.max(2, trials);
  return Math.sqrt(Math.max(0, trialVariance)) * ((1 - EULER_GAMMA) * normInv(1 - 1 / n) + EULER_GAMMA * normInv(1 - 1 / (n * Math.E)));
}

/** Probabilistic Sharpe Ratio: P(true SR > benchmark) given T observations, skew and (non-excess) kurtosis. */
export function psr(sharpe: number, benchmark: number, t: number, skew: number, kurtosis: number): number {
  if (t < 2) return 0.5;
  const denom = Math.sqrt(Math.max(1e-9, 1 - skew * sharpe + ((kurtosis - 1) / 4) * sharpe * sharpe));
  return normCdf(((sharpe - benchmark) * Math.sqrt(t - 1)) / denom);
}

/** Minimum track-record length (trades) for `sharpe` to beat `benchmark` at confidence `alpha` (one-sided). */
export function minTrl(sharpe: number, benchmark: number, skew: number, kurtosis: number, alpha = 0.95): number | null {
  if (!(sharpe > benchmark)) return null;
  const z = normInv(alpha);
  const v = Math.max(1e-9, 1 - skew * sharpe + ((kurtosis - 1) / 4) * sharpe * sharpe);
  return Math.ceil(1 + v * (z / (sharpe - benchmark)) ** 2);
}

export interface DeflationReport {
  n: number;
  sharpe: number | null;
  skew: number | null;
  kurtosis: number | null;
  trialSd: number | null;
  sr0: number | null;
  psr0: number | null;
  psrDeflated: number | null;
  minTrl0: number | null;
  minTrlDeflated: number | null;
  verdict: string;
}

/**
 * Deflated Sharpe check for one configuration against the sweep it was picked from. `trialSharpes` are the
 * per-trade Sharpes of every configuration tried (this one included); `trials` the count to deflate for.
 */
export function deflatedSharpe(netR: number[], trialSharpes: number[], trials: number): DeflationReport {
  const st = sharpeStats(netR);
  const empty: DeflationReport = { n: st.n, sharpe: st.sharpe, skew: st.skew, kurtosis: st.kurtosis, trialSd: null, sr0: null, psr0: null, psrDeflated: null, minTrl0: null, minTrlDeflated: null, verdict: "not enough closed trades for a Sharpe" };
  if (st.sharpe == null || st.skew == null || st.kurtosis == null) return empty;
  const ts = trialSharpes.filter((v) => Number.isFinite(v));
  // With fewer than two trial Sharpes the spread is unknown; assume the paper's worked value for this engine (0.08).
  const trialSd = ts.length >= 2 ? sharpeStats(ts).sd ?? 0.08 : 0.08;
  const sr0 = expectedMaxSharpe(trialSd * trialSd, trials);
  const p0 = psr(st.sharpe, 0, st.n, st.skew, st.kurtosis);
  const pd = psr(st.sharpe, sr0, st.n, st.skew, st.kurtosis);
  const verdict =
    pd >= 0.9
      ? `PSR(SR0) ${r3(pd)} >= 0.90: the configuration beats the expected best-of-${trials} by luck`
      : p0 >= 0.95
        ? `PSR(SR0) ${r3(pd)} < 0.90: positive (PSR(0) ${r3(p0)}) but not distinguishable from selection luck across ${trials} trials`
        : `PSR(0) ${r3(p0)} < 0.95 and PSR(SR0) ${r3(pd)} < 0.90: not distinguishable from zero, let alone from selection luck`;
  return {
    n: st.n,
    sharpe: st.sharpe,
    skew: st.skew,
    kurtosis: st.kurtosis,
    trialSd: r3(trialSd),
    sr0: r3(sr0),
    psr0: r3(p0),
    psrDeflated: r3(pd),
    minTrl0: minTrl(st.sharpe, 0, st.skew, st.kurtosis),
    minTrlDeflated: minTrl(st.sharpe, sr0, st.skew, st.kurtosis),
    verdict,
  };
}
