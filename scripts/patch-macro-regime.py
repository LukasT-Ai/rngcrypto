p='src/app/api/signals/route.ts'
s=open(p,encoding='utf-8').read()
def rep(old,new,count=1):
    global s
    assert s.count(old)==count, (s.count(old), old[:80])
    s=s.replace(old,new)
rep('import type { MacroScores, MacroState as MacroEventIntel } from "@/lib/macro/types";',
    'import type { MacroScores, MacroState as MacroEventIntel } from "@/lib/macro/types";\nimport { computeMacroRegime, macroBonus as regimeBonus, type MacroRegimeResult } from "@/lib/ta/macro-regime";')
rep('''  weeklyEngulfing: boolean;
  macroScore: number;
  signals: string[];
  bias: string;
  eventBlackout: { blocked: boolean; event?: string; date?: string };
}''','''  weeklyEngulfing: boolean;
  // Signed regime score in [-100, 100] from lib/ta/macro-regime (bearish mirrors of every bullish pattern).
  macroScore: number;
  signals: string[];
  bias: MacroRegimeResult["bias"];
  regime: Pick<MacroRegimeResult, "components" | "details"> | null;
  eventBlackout: { blocked: boolean; event?: string; date?: string };
}''')
rep('''    const bias = macroScore >= 20 ? "strong_bull" : macroScore >= 10 ? "bull" : macroScore >= 5 ? "lean_bull" : "neutral";

    const state: MacroState = {
      stochastic,
      goldenCross,
      ema21_377,
      weeklyEngulfing,
      macroScore,
      signals,
      bias,
      eventBlackout: getEventBlackout(),
    };''','''    // The legacy block above only knows bullish patterns. The regime module scores both sides (death cross,
    // weekly stoch breakdown, 21<377, bearish engulfing, LH/LL structure, 200d slope, Pi Cycle) and is the
    // source of truth for score and bias; the legacy fields stay for the dashboard's historical-stat cards.
    const regime = computeMacroRegime(candles);
    void macroScore;
    void signals;

    const state: MacroState = {
      stochastic,
      goldenCross,
      ema21_377,
      weeklyEngulfing,
      macroScore: regime.score,
      signals: regime.signals,
      bias: regime.bias,
      regime: { components: regime.components, details: regime.details },
      eventBlackout: getEventBlackout(),
    };''')
rep('''function getMacroBonus(macroState: MacroState | null, bias: "LONG" | "SHORT" | "WAIT", isCrypto: boolean): number {
  if (!macroState || !isCrypto || bias === "WAIT") return 0;
  const aligned = bias === "LONG" ? macroState.macroScore : -macroState.macroScore;
  if (aligned > 0) return Math.min(aligned, 20);
  if (aligned <= -15) return -10;
  return 0;
}''','''function getMacroBonus(macroState: MacroState | null, bias: "LONG" | "SHORT" | "WAIT", isCrypto: boolean): number {
  if (!macroState || !isCrypto) return 0;
  return regimeBonus(macroState.macroScore, bias);
}''')
# expose regime components in the API response
rep('''    macro: macroState
      ? {
          bias: macroState.bias,
          score: macroState.macroScore,
          signals: macroState.signals,''','''    macro: macroState
      ? {
          bias: macroState.bias,
          score: macroState.macroScore,
          signals: macroState.signals,
          regime: macroState.regime,''')
open(p,'w',encoding='utf-8').write(s)
print("ok")
