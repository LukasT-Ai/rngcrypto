p='src/lib/macro/regime.ts'
s=open(p,encoding='utf-8').read()
def rep(old,new,count=1):
    global s
    assert s.count(old)==count, (s.count(old), old[:80])
    s=s.replace(old,new)
rep('''  if (policyBias === "hold" && i.us2y != null && i.us10y != null && i.us2y - i.us10y > 0.25) policyBias = "tightening";''',
'''  if (policyBias === "hold" && i.us2y != null && i.us10y != null && i.us2y - i.us10y > 0.25) policyBias = "tightening";
  // Dollar breakout (5d move of 1.5% or more) is the market pricing tighter US policy relative to the world;
  // a dollar breakdown is the mirror. Front-end yields keep precedence.
  if (policyBias === "hold" && i.dxyChg5d != null) {
    if (i.dxyChg5d >= 1.5) policyBias = "tightening";
    else if (i.dxyChg5d <= -1.5) policyBias = "easing";
  }''')
open(p,'w',encoding='utf-8').write(s)

p='src/lib/macro/impact.ts'
s=open(p,encoding='utf-8').read()
rep('''function confidenceFor(score: number, magnitude: SurpriseMagnitude | null, relevance: number, kind: MacroEventDef["kind"]): Confidence {
  if (kind === "fed_communication" || kind === "auction") return "low";''','''function confidenceFor(score: number, magnitude: SurpriseMagnitude | null, relevance: number, kind: MacroEventDef["kind"]): Confidence {
  if (kind === "auction") return "low";
  // Fed communication has no number: confidence comes only from a synthetic score derived from the 2Y reaction.
  if (kind === "fed_communication" && (magnitude == null || Math.abs(score) < 20)) return "low";''')
# transmission: fed_communication should carry r = s when a synthetic score is supplied
rep('''    case "fed_communication":
    case "auction":
    case "crypto":
      break;''','''    case "fed_communication":
      // Synthetic surprise from the front-end yield reaction: + = hawkish (yields up), - = dovish
      r = s;
      break;
    case "auction":
    case "crypto":
      break;''')
open(p,'w',encoding='utf-8').write(s)

p='src/lib/macro/service.ts'
s=open(p,encoding='utf-8').read()
rep('''  // 3) Confirmation (needs a directional expectation; for text events use the observed rates/dollar read).
  if (st.reactions.length > 0) {
    const s = st.surprise?.score ?? null;''','''  // 2b) Text events (FOMC statement, minutes, Fed speeches) have no number. Read the front-end yield reaction
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
    const s = st.surprise?.score ?? null;''')
rep('import { computeSurprise } from "./surprise";','import { computeSurprise, magnitudeFromZ } from "./surprise";')
open(p,'w',encoding='utf-8').write(s)
print("ok")
