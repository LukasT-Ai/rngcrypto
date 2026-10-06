import type { SignalsResponse, MarketMapResponse, HistoryResponse } from "./dashboard"

export type SectionId =
  | "sec-call"
  | "sec-forecast"
  | "sec-confluence"
  | "sec-indicators"
  | "sec-volume"
  | "sec-htf"
  | "sec-levels"
  | "sec-fib"
  | "sec-divergences"
  | "sec-market-map"
  | "sec-geo"
  | "sec-calendar"
  | "sec-track-record"
  | "sec-positioning"
  | "sec-market-data"
  | "sec-news"
  | "sec-setups"
  | "sec-tf-alignment"
  | "sec-chart"
  | "sec-macro"

export type Tone = "pos" | "neg" | "neutral"

export interface RecoLink {
  text: string
  anchor: SectionId | null
  tone: Tone
  weight: number
}

export interface Recommendation {
  action: "LONG" | "SHORT" | "WAIT"
  headline: string
  oneLiner: string
  conviction: { grade: string; confidence: number; label: "High" | "Moderate" | "Low" | "None" }
  plan: {
    entry: number
    stop: number
    tp1: number
    tp2: number
    rr: number
    sizeNote: string | null
    horizon: string
  } | null
  because: RecoLink[]
  butWatch: RecoLink[]
  invalidation: RecoLink | null
  confirmation: RecoLink | null
  trackRecord: RecoLink | null
  nextCatalyst: RecoLink | null
  tally: { bull: number; bear: number; total: number }
}

const DIR: Record<string, number> = {
  "Strong Bullish": 2,
  Bullish: 1,
  Neutral: 0,
  Bearish: -1,
  "Strong Bearish": -2,
}

const fmtN = (n: number, dp = 2) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
const dpFor = (p: number) => (p >= 1000 ? 0 : p >= 1 ? 2 : p >= 0.01 ? 4 : 6)

function tone(dir: number): Tone {
  return dir > 0 ? "pos" : dir < 0 ? "neg" : "neutral"
}

function factorReason(d: SignalsResponse, category: string, assessment: string, weight: number): RecoLink | null {
  const dir = DIR[assessment] ?? 0
  const ind = d.indicators
  const px = d.price.mark
  const dp = dpFor(px)
  const base = { tone: tone(dir), weight: weight * Math.max(1, Math.abs(dir)) }

  switch (category) {
    case "Market Structure": {
      const stack =
        ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50
          ? "EMAs stacked bullish (9 > 21 > 50)"
          : ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50
            ? "EMAs stacked bearish (9 < 21 < 50)"
            : "EMAs tangled — no clean trend"
      const st = px > ind.supertrend ? "above" : "below"
      return { ...base, anchor: "sec-indicators", text: `${stack}; price ${st} supertrend` }
    }
    case "Momentum": {
      const rsi = ind.rsi
      const rsiTag = rsi >= 70 ? " (overbought)" : rsi <= 30 ? " (oversold)" : ""
      const macd = ind.macd.histogram > 0 ? "positive" : "negative"
      const stoch = ind.stochRsi.k >= 80 ? ", stoch RSI stretched high" : ind.stochRsi.k <= 20 ? ", stoch RSI washed out" : ""
      return { ...base, anchor: "sec-indicators", text: `RSI ${rsi.toFixed(0)}${rsiTag}, MACD histogram ${macd}${stoch}` }
    }
    case "Volume": {
      const v = d.volume
      if (v.trend === "unavailable" || !Number.isFinite(v.ratio) || v.ratio <= 0) return null
      const abs = v.absorption?.detected ? `, ${v.absorption.direction} absorption` : ""
      return {
        ...base,
        anchor: "sec-volume",
        text: `Volume ${v.ratio.toFixed(1)}× average (${v.spikeLabel.toLowerCase()}), CVD says ${v.cvd > 0 ? "buyers" : "sellers"} in control${abs}`,
      }
    }
    case "HTF Alignment": {
      const h = d.htf
      const daily = h.trendDaily ? ` · daily ${h.trendDaily}` : ""
      return { ...base, anchor: "sec-htf", text: `Higher timeframes: 1h ${h.trend1h} · 4h ${h.trend4h}${daily}` }
    }
    case "Bollinger Bands": {
      const bb = ind.bb
      const pos = px >= bb.upper ? "pressing the upper Bollinger band" : px <= bb.lower ? "pressing the lower Bollinger band" : px > bb.middle ? "in the upper half of the Bollinger range" : "in the lower half of the Bollinger range"
      const sq = d.patterns.squeeze === "volatility_compression" ? "; a volatility squeeze is building" : ""
      return { ...base, anchor: "sec-indicators", text: `Price ${pos}${sq}` }
    }
    case "Divergences": {
      const dv = d.divergences
      const parts = [
        dv.rsiDivergence15m && `RSI 15m ${dv.rsiDivergence15m}`,
        dv.rsiDivergence1h && `RSI 1h ${dv.rsiDivergence1h}`,
        dv.macdDivergence && `MACD ${dv.macdDivergence}`,
        dv.volumeDivergence && `volume ${dv.volumeDivergence}`,
      ].filter(Boolean)
      if (parts.length === 0) return null
      return { ...base, anchor: "sec-divergences", text: `Divergence: ${parts.join(", ")}` }
    }
    case "Derivatives": {
      const m = d.market
      if (m.fundingRate == null && m.putCallRatio == null) return null
      const f = m.fundingRate != null ? `Funding ${(m.fundingRate * 100).toFixed(3)}%` : ""
      const pc = m.putCallRatio != null ? `${f ? ", " : ""}put/call ${m.putCallRatio.toFixed(2)}` : ""
      return { ...base, anchor: "sec-market-data", text: `${f}${pc} — ${dir > 0 ? "positioning favors upside" : dir < 0 ? "crowded, favors downside" : "neutral positioning"}` }
    }
    case "Sentiment": {
      const fg = d.market.fearGreed
      const news = d.newsSentiment
      const parts = [fg && `Fear & Greed ${fg.value} (${fg.classification})`, news && `news ${news.label.toLowerCase()}`].filter(Boolean)
      if (parts.length === 0) return null
      return { ...base, anchor: fg ? "sec-market-data" : "sec-news", text: parts.join(", ") }
    }
    case "Geopolitical":
    case "Catalysts": {
      const g = d.oilGeopolitical
      if (!g) return null
      const v = g.verdict
      const nice = (c: string) => c.replace(/_/g, " ")
      const text = v
        ? `Headlines net ${g.label.toLowerCase()} (${g.score > 0 ? "+" : ""}${g.score}): ${v.bullForce ? `${nice(v.bullForce.category)} +${v.bullForce.avgScore}` : ""}${v.bullForce && v.bearForce ? " vs " : ""}${v.bearForce ? `${nice(v.bearForce.category)} ${v.bearForce.avgScore}` : ""}${v.priceFollowing ? `; price following ${nice(v.priceFollowing)}` : ""}`
        : `Catalyst headlines net ${g.label.toLowerCase()} (${g.score})`
      return { ...base, anchor: "sec-geo", text }
    }
    case "Market Data": {
      if (d.market.btcDominance == null) return null
      return { ...base, anchor: "sec-market-data", text: `BTC dominance ${d.market.btcDominance.toFixed(1)}%` }
    }
    case "ETF Flows": {
      if (!d.market.etfFlow) return null
      return { ...base, anchor: "sec-market-data", text: `ETF flows: ${d.market.etfFlow.description}` }
    }
    case "Liquidation/Positioning": {
      const p = d.positioning
      if (!p) return null
      const ls = p.longShortRatio != null ? `long/short ${p.longShortRatio.toFixed(2)}` : ""
      const sq = p.squeezeRisk ? `${ls ? ", " : ""}${p.squeezeRisk}` : ""
      if (!ls && !sq) return null
      return { ...base, anchor: "sec-positioning", text: `Positioning: ${ls}${sq}` }
    }
    case "Patterns": {
      if (!d.patterns.candlestick) return null
      return { ...base, anchor: "sec-divergences", text: `Candlestick: ${d.patterns.candlestick.replace(/_/g, " ")}` }
    }
    case "Catalyst Risk": {
      if (!d.call.catalystRisk) return null
      return { ...base, tone: "neg", anchor: "sec-calendar", text: `Event risk: ${d.call.catalystRisk}` }
    }
    default:
      if (dir === 0) return null
      return { ...base, anchor: "sec-confluence", text: `${category} ${assessment.toLowerCase()}` }
  }
  void dp
}

export function buildRecommendation(
  d: SignalsResponse,
  map: MarketMapResponse | undefined,
  stats: HistoryResponse["stats"] | undefined
): Recommendation {
  const call = d.call
  const action = call.bias
  const px = d.price.mark
  const dp = dpFor(px)
  const label = d.assetLabel || d.asset

  // ── Reasons from the engine's own factor list ───────────────────────────
  const reasons: RecoLink[] = []
  let bull = 0
  let bear = 0
  let total = 0
  for (const f of call.signalFactors) {
    const dir = DIR[f.assessment] ?? 0
    if (dir !== 0) {
      total++
      if (dir > 0) bull++
      else bear++
    }
    const r = factorReason(d, f.category, f.assessment, f.weight)
    if (r) reasons.push(r)
  }

  // ── Extra evidence not in the factor list ───────────────────────────────
  if (map?.signal && map.signal.bias !== "WAIT") {
    const dir = map.signal.bias === "LONG" ? 1 : -1
    reasons.push({
      text: `Daily structure map says ${map.signal.bias} (${map.signal.grade}, ${map.signal.conviction}% conviction)`,
      anchor: "sec-market-map",
      tone: tone(dir),
      weight: 14,
    })
  }
  if (map?.bounceProbabilities) {
    const entries = Object.entries(map.bounceProbabilities.windows)
    const pick = entries.find(([, w]) => (w.conditioned?.sampleSize ?? 0) >= 20) ?? entries.find(([, w]) => (w.all?.sampleSize ?? 0) >= 40)
    if (pick) {
      const [win, w] = pick
      const s = w.conditioned && w.conditioned.sampleSize >= 20 ? w.conditioned : w.all!
      const dir = s.positivePct >= 58 ? 1 : s.positivePct <= 42 ? -1 : 0
      reasons.push({
        text: `${s.positivePct.toFixed(0)}% of similar setups (RSI ${map.bounceProbabilities.rsiZone}) were higher after ${win} (n=${s.sampleSize}, avg ${s.avgReturn >= 0 ? "+" : ""}${s.avgReturn.toFixed(1)}%)`,
        anchor: "sec-market-map",
        tone: tone(dir),
        weight: 10,
      })
    }
  }
  if (d.timeframeOutlook?.alignment) {
    const a = d.timeframeOutlook.alignment
    const dir = a.direction === "LONG" ? 1 : a.direction === "SHORT" ? -1 : 0
    reasons.push({
      text: `${a.alignedCount}/${a.totalCount} timeframes agree → ${a.tradeType.toLowerCase()} setup`,
      anchor: "sec-tf-alignment",
      tone: tone(dir),
      weight: a.allAligned ? 16 : 8,
    })
  }
  // Macro Event Intelligence: scheduled releases, their verified surprise and whether the market confirms.
  const mac = d.macroEvent
  if (mac) {
    const act = mac.active
    if (act?.impact && act.secondsToRelease <= 0 && act.releaseStatus === "verified") {
      const i = act.impact
      const dir = i.direction === "bullish" ? 1 : i.direction === "bearish" ? -1 : 0
      const conf = act.confirmation
      const confTxt = conf && conf.pct != null ? `; market ${conf.status} (${conf.pct}%)` : conf ? `; market ${conf.status}` : ""
      reasons.push({
        text: `${act.title}: ${act.surpriseLabel?.split(" (")[0] ?? "released"} → ${i.direction} for ${mac.asset} (${i.confidence} confidence)${confTxt}`,
        anchor: "sec-macro",
        tone: conf?.status === "reversing" ? "neg" : tone(dir),
        weight: 18 + (conf?.status === "confirmed" ? 6 : 0),
      })
    } else if (act && act.secondsToRelease <= 0 && act.releaseStatus && act.releaseStatus !== "verified") {
      reasons.push({ text: `${act.title} released — awaiting verified data before scoring`, anchor: "sec-macro", tone: "neutral", weight: 12 })
    }
    if (mac.scores.macro !== 0 || mac.scores.event !== 0) {
      const v = mac.scores.event !== 0 ? mac.scores.event : mac.scores.macro
      reasons.push({
        text: `Macro backdrop ${mac.scores.macro > 10 ? "supportive" : mac.scores.macro < -10 ? "a headwind" : "neutral"} (${mac.scores.macro > 0 ? "+" : ""}${mac.scores.macro}); event score ${mac.scores.event > 0 ? "+" : ""}${mac.scores.event}, confirmation ${mac.scores.confirmation > 0 ? "+" : ""}${mac.scores.confirmation}`,
        anchor: "sec-macro",
        tone: tone(v > 10 ? 1 : v < -10 ? -1 : 0),
        weight: 10,
      })
    }
  }

  const ant = d.anticipatory
  const imminent = ant?.approachingLevels.find((l) => l.tier === "IMMINENT") ?? null
  const structure = ant?.structureSignals[0] ?? null
  if (structure) {
    const dir = structure.direction === "bullish" ? 1 : -1
    reasons.push({
      text: `${structure.type.replace(/_/g, " ").toLowerCase()} ${structure.direction} near $${fmtN(structure.referenceLevel, dp)}`,
      anchor: "sec-setups",
      tone: tone(dir),
      weight: 9,
    })
  }

  const sign = action === "LONG" ? 1 : action === "SHORT" ? -1 : 0
  const byWeight = (a: RecoLink, b: RecoLink) => b.weight - a.weight
  const pos = reasons.filter((r) => r.tone === "pos").sort(byWeight)
  const neg = reasons.filter((r) => r.tone === "neg").sort(byWeight)
  const neu = reasons.filter((r) => r.tone === "neutral").sort(byWeight)

  let because: RecoLink[]
  let butWatch: RecoLink[]
  if (sign > 0) {
    because = pos.slice(0, 4)
    butWatch = neg.slice(0, 3)
  } else if (sign < 0) {
    because = neg.slice(0, 4)
    butWatch = pos.slice(0, 3)
  } else {
    because = [...pos.slice(0, 2), ...neg.slice(0, 2)]
    butWatch = neu.slice(0, 2)
  }

  if (imminent) {
    butWatch.unshift({
      text: `Price is ${Math.abs(imminent.distance).toFixed(2)}% from ${imminent.type.replace("_", " ")} at $${fmtN(imminent.level, dp)} — decision point imminent`,
      anchor: "sec-setups",
      tone: "neutral",
      weight: 20,
    })
  }
  if (call.geoOverride && action !== "WAIT") {
    butWatch.unshift({ text: call.geoOverride, anchor: "sec-geo", tone: "neg", weight: 25 })
  }
  if (d.macroEvent?.preEventRisk) {
    const p = d.macroEvent.preEventRisk
    butWatch.unshift({
      text: `${p.title} in ${p.minutes} min (${p.importance} impact) — volatility may spike; technical confidence reduced until the print`,
      anchor: "sec-macro",
      tone: "neg",
      weight: 30,
    })
  }
  if (call.catalystRisk && !butWatch.some((r) => r.anchor === "sec-calendar")) {
    butWatch.push({ text: `Event risk: ${call.catalystRisk}`, anchor: "sec-calendar", tone: "neg", weight: 12 })
  }
  butWatch = butWatch.slice(0, 4)

  // ── Conviction / headline / one-liner ───────────────────────────────────
  const convLabel: Recommendation["conviction"]["label"] =
    action === "WAIT" ? "None" : call.grade === "A+" || call.grade === "A" ? "High" : call.grade === "B" ? "Moderate" : call.grade === "C" ? "Low" : "None"

  const headline =
    action === "LONG"
      ? `Buy ${label} — ${convLabel.toLowerCase()} conviction`
      : action === "SHORT"
        ? `Short ${label} — ${convLabel.toLowerCase()} conviction`
        : `Stand aside on ${label}`

  const top = because[0]?.text
  let oneLiner: string
  if (action === "WAIT") {
    const h = d.htf
    oneLiner = call.geoOverride
      ? call.geoOverride
      : Math.abs(bull - bear) <= 1
        ? `Signals are mixed (${bull} bullish vs ${bear} bearish factors, confidence ${call.confidence}%) — there is no edge right now.`
        : d.patterns.squeeze === "volatility_compression" && d.indicators.adx < 20
          ? `Volatility is compressed (ADX ${d.indicators.adx.toFixed(0)}) — wait for the breakout direction before committing.`
          : h.trend1h !== h.trend4h
            ? `The 1h (${h.trend1h}) and 4h (${h.trend4h}) trends disagree — wait for them to line up.`
            : `No clean setup yet (confidence ${call.confidence}%).`
  } else {
    const n = sign > 0 ? bull : bear
    oneLiner = `${n} of ${total} scored factors lean ${sign > 0 ? "bullish" : "bearish"}${top ? ` — ${top.charAt(0).toLowerCase()}${top.slice(1)}` : ""}. Enter near $${fmtN(call.entry, dp)}, stop $${fmtN(call.stopLoss, dp)}, first target $${fmtN(call.tp1, dp)} (R:R ${call.riskReward.toFixed(1)}).`
  }

  // ── Plan ────────────────────────────────────────────────────────────────
  const tt = d.timeframeOutlook?.alignment?.tradeType
  const horizon =
    d.oilForecast?.horizonHours
      ? `~${d.oilForecast.horizonHours}h`
      : tt === "SCALP"
        ? "hours"
        : tt === "SWING"
          ? "1–3 days"
          : tt === "POSITION" || tt === "ULTIMATE"
            ? "several days"
            : "intraday"
  const size = call.sizeMultiplier != null && call.sizeMultiplier < 1 ? `Size ${call.sizeMultiplier}× normal — elevated gap risk` : null
  const plan =
    action !== "WAIT"
      ? { entry: call.entry, stop: call.stopLoss, tp1: call.tp1, tp2: call.tp2, rr: call.riskReward, sizeNote: size, horizon }
      : null

  // ── Invalidation / confirmation / track record / next catalyst ─────────
  const invalidation: RecoLink | null = call.invalidates[0]
    ? { text: call.invalidates[0], anchor: /\$[\d,.]+/.test(call.invalidates[0]) ? "sec-levels" : /MACD|RSI|volume/i.test(call.invalidates[0]) ? "sec-indicators" : /headline|ceasefire|Hormuz|reserve/i.test(call.invalidates[0]) ? "sec-geo" : "sec-call", tone: "neg", weight: 0 }
    : null
  const confirmation: RecoLink | null = call.confirms[0]
    ? { text: call.confirms[0], anchor: /\$[\d,.]+/.test(call.confirms[0]) ? "sec-levels" : /headline|escalation|reserve|Hormuz/i.test(call.confirms[0]) ? "sec-geo" : "sec-indicators", tone: "pos", weight: 0 }
    : null

  let trackRecord: RecoLink | null = null
  const gb = stats?.byGradeSymbol?.[d.asset]?.[call.grade]
  if (gb && gb.n >= 5) {
    trackRecord = {
      text: `${call.grade}-grade ${d.asset} calls hit first target ${gb.tp1Rate.toFixed(0)}% of the time (n=${gb.n}${gb.avgR != null ? `, avg ${gb.avgR >= 0 ? "+" : ""}${gb.avgR.toFixed(2)}R` : ""})`,
      anchor: "sec-track-record",
      tone: gb.tp1Rate >= 55 ? "pos" : gb.tp1Rate <= 40 ? "neg" : "neutral",
      weight: 0,
    }
  } else {
    const bs = stats?.bySymbol?.[d.asset]
    if (bs && bs.wins + bs.losses >= 5) {
      trackRecord = {
        text: `Past ${d.asset} calls: ${bs.winRate.toFixed(0)}% win rate over ${bs.wins + bs.losses} decided signals`,
        anchor: "sec-track-record",
        tone: bs.winRate >= 55 ? "pos" : bs.winRate <= 40 ? "neg" : "neutral",
        weight: 0,
      }
    }
  }

  let nextCatalyst: RecoLink | null = null
  const nextEv = (d.events ?? []).map((e) => ({ ...e, t: new Date(e.time).getTime() })).filter((e) => e.t > Date.now() && e.impact !== "low").sort((a, b) => a.t - b.t)[0]
  const geoNext = d.oilGeopolitical?.nextScheduled
  const cand = [
    nextEv && { name: nextEv.name, t: nextEv.t, impact: nextEv.impact },
    geoNext && { name: geoNext.name, t: new Date(geoNext.time).getTime(), impact: geoNext.impact },
  ].filter(Boolean) as { name: string; t: number; impact: string }[]
  const soonest = cand.sort((a, b) => a.t - b.t)[0]
  if (soonest && soonest.t - Date.now() < 36 * 3600e3) {
    const mins = Math.max(1, Math.round((soonest.t - Date.now()) / 60000))
    const when = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.floor(mins / 1440)}d`
    nextCatalyst = { text: `${soonest.name} in ${when} (${soonest.impact} impact)`, anchor: geoNext && soonest.name === geoNext.name ? "sec-geo" : "sec-calendar", tone: soonest.impact === "high" ? "neg" : "neutral", weight: 0 }
  }
  if (!nextCatalyst && d.oilForecast?.scenarios[0]) {
    const s = d.oilForecast.scenarios[0]
    nextCatalyst = { text: `Lead scenario (${Math.round(s.probability * 100)}%): ${s.trigger}`, anchor: "sec-forecast", tone: s.direction === "LONG" ? "pos" : "neg", weight: 0 }
  }

  return {
    action,
    headline,
    oneLiner,
    conviction: { grade: call.grade, confidence: call.confidence, label: convLabel },
    plan,
    because,
    butWatch,
    invalidation,
    confirmation,
    trackRecord,
    nextCatalyst,
    tally: { bull, bear, total },
  }
}
