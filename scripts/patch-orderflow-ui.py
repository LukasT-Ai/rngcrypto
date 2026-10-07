# One-shot patch: wire order-flow (liquidations + walls) into types, Flow/Levels tabs, recommendation, guide.
import io, sys

def rw(p, fn):
    s = open(p, encoding="utf-8").read()
    n = fn(s)
    assert n != s, p
    open(p, "w", encoding="utf-8").write(n)

# 1. test expectation
rw("src/lib/signals/__tests__/orderflow.test.ts", lambda s: s.replace(
    "expect(s.coveragePct).toBeCloseTo(4.9, 1);",
    "expect(s.coveragePct).toBe(5); // capped at the 5% scan band"))

# 2. types
def types(s):
    s = s.replace('''    liquidations: { longLiqs24h: number | null; shortLiqs24h: number | null } | null
  }''', '''    liquidations: LiquidationInfo | null
  }
  orderBook?: OrderBookInfo | null''')
    s = s.replace('export interface SignalsResponse {', '''// Order flow (OKX sample). Mirrors LiquidationSummary / OrderBookSummary in lib/signals/orderflow.ts.
export type LiqSide = "long" | "short"
export interface LiqEventInfo { ts: number; side: LiqSide; price: number; usd: number }
export interface LiqBucketInfo { longUsd: number; shortUsd: number; longN: number; shortN: number }
export interface LiquidationInfo {
  longLiqs24h: number | null
  shortLiqs24h: number | null
  venue: "OKX"
  windowHours: number
  truncated: boolean
  h1: LiqBucketInfo
  h4: LiqBucketInfo
  window: LiqBucketInfo
  largest: LiqEventInfo | null
  clusters: { price: number; usd: number; side: LiqSide; longUsd: number; shortUsd: number; distancePct: number }[]
  tape: LiqEventInfo[]
  dominant: LiqSide | null
  longPct: number | null
  read: string
}
export interface WallInfo { price: number; usd: number; distancePct: number; share: number; strength: number }
export interface OrderBookInfo {
  venue: "OKX" | "Hyperliquid"
  mid: number
  spreadPct: number
  coveragePct: number
  depth: { band: number; bidUsd: number; askUsd: number; imbalance: number }[]
  bidWalls: WallInfo[]
  askWalls: WallInfo[]
  read: string
}

export interface SignalsResponse {''', 1)
    return s
rw("src/app/signals/types.ts", types)

# 3. FlowTab
def flow(s):
    s = s.replace('import { AMBER, GRAY, GREEN, RED, SectionTitle, StatCard, dirColor, fmt, fmtCompact } from "../shared"',
                  'import { AMBER, GRAY, GREEN, RED, SectionTitle, StatCard, dirColor, fmt, fmtCompact, priceDp } from "../shared"\nimport { LiquidationsPanel, OrderBookPanel } from "../OrderFlowPanels"')
    s = s.replace('''  const liq = m.liquidations
  const hasLiq = liq && liq.longLiqs24h != null && liq.shortLiqs24h != null
''', '''  const liq = m.liquidations
  const book = d.orderBook ?? null
  const price = d.price.mark
  const dp = price > 0 ? priceDp(price) : 2
''')
    a = s.index('            {hasLiq && (')
    b = s.index('          </div>\n        </div>\n      )}\n\n      {/* Market data */}')
    s = s[:a] + s[b:]
    s = s.replace('''      {/* Market data */}''', '''      {/* Order flow: realized liquidations and resting walls, each with a plain-English read */}
      {liq && <LiquidationsPanel liq={liq} dp={dp} price={price} />}
      {book && <OrderBookPanel book={book} dp={dp} price={price} call={d.call} />}

      {/* Market data */}''')
    return s
rw("src/app/signals/tabs/FlowTab.tsx", flow)

# 4. LevelsTab
def levels(s):
    s = s.replace('type LevelRow = { kind: "Support" | "Resistance" | "Fib" | "Daily high" | "Daily low" | "Weekly high" | "Weekly low"; label: string; price: number }',
                  'type LevelRow = { kind: "Support" | "Resistance" | "Fib" | "Daily high" | "Daily low" | "Weekly high" | "Weekly low" | "Buy wall" | "Sell wall"; label: string; price: number }')
    s = s.replace('''  const lv = d.levels

  const rows: LevelRow[] = [''', '''  const lv = d.levels
  const book = d.orderBook ?? null
  const fmtUsd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1e3).toFixed(0)}K`)

  const rows: LevelRow[] = [
    ...(book?.bidWalls ?? []).map((w) => ({ kind: "Buy wall" as const, label: `Buy wall ${fmtUsd(w.usd)}`, price: w.price })),
    ...(book?.askWalls ?? []).map((w) => ({ kind: "Sell wall" as const, label: `Sell wall ${fmtUsd(w.usd)}`, price: w.price })),''')
    s = s.replace('''  const rowColor = (r: LevelRow) => (r.kind === "Support" ? GREEN : r.kind === "Resistance" ? RED : "rgba(255,255,255,0.75)")''',
                  '''  const rowColor = (r: LevelRow) => (r.kind === "Support" || r.kind === "Buy wall" ? GREEN : r.kind === "Resistance" || r.kind === "Sell wall" ? RED : "rgba(255,255,255,0.75)")''')
    s = s.replace('''              {(lv.fibonacci ?? []).filter((f) => f.price >= min && f.price <= max).map((f, i) => (''', '''              {[...(book?.bidWalls ?? []), ...(book?.askWalls ?? [])].filter((w) => w.price >= min && w.price <= max).map((w, i) => (
                <div key={`w-${i}`} className="absolute top-1/4 bottom-1/4" style={{ left: `${pct(w.price)}%` }} title={`${w.price < price ? "Buy" : "Sell"} wall ${fmtUsd(w.usd)}`}>
                  <div className="h-full w-1 rounded-sm" style={{ backgroundColor: w.price < price ? GREEN : RED, opacity: 0.8 }} />
                </div>
              ))}
              {(lv.fibonacci ?? []).filter((f) => f.price >= min && f.price <= max).map((f, i) => (''')
    s = s.replace('''<SectionTitle right={<span className="text-[10px] text-[#9CA3AF]/80">Supports, resistances, Fibonacci and session extremes, nearest first</span>}>Key price levels</SectionTitle>''',
                  '''<SectionTitle right={<span className="text-[10px] text-[#9CA3AF]/80">Supports, resistances, Fibonacci, session extremes{book ? " and live order-book walls" : ""}, nearest first</span>}>Key price levels</SectionTitle>''')
    return s
rw("src/app/signals/tabs/LevelsTab.tsx", levels)

# 5. recommendation
def reco(s):
    s = s.replace('''  | "sec-positioning"
  | "sec-market-data"''', '''  | "sec-positioning"
  | "sec-liquidations"
  | "sec-orderbook"
  | "sec-market-data"''')
    old = '''    case "Liquidation/Positioning": {
      const p = d.positioning
      if (!p) return null
      const ls = p.longShortRatio != null ? `long/short ${p.longShortRatio.toFixed(2)}` : ""
      const sq = p.squeezeRisk ? `${ls ? ", " : ""}${p.squeezeRisk}` : ""
      if (!ls && !sq) return null
      return { ...base, anchor: "sec-positioning", text: `Positioning: ${ls}${sq}` }
    }'''
    new = '''    case "Liquidation/Positioning": {
      const p = d.positioning
      const lq = d.market.liquidations
      const ls = p?.longShortRatio != null ? `long/short ${p.longShortRatio.toFixed(2)}` : ""
      const sq = p?.squeezeRisk ? `${ls ? ", " : ""}${p.squeezeRisk.replace(/_/g, " ")}` : ""
      const liqTxt =
        lq && lq.dominant && lq.longPct != null
          ? lq.dominant === "long"
            ? `${Math.round(lq.longPct * 100)}% of liquidations were longs (flush)`
            : `${Math.round((1 - lq.longPct) * 100)}% of liquidations were shorts (squeeze)`
          : ""
      if (!ls && !sq && !liqTxt) return null
      const parts = [ls + sq, liqTxt].filter(Boolean)
      return { ...base, anchor: liqTxt && !ls ? "sec-liquidations" : "sec-positioning", text: `Positioning: ${parts.join("; ")}` }
    }'''
    assert old in s
    s = s.replace(old, new)
    old = '''  const sign = action === "LONG" ? 1 : action === "SHORT" ? -1 : 0
  const byWeight'''
    new = '''  // Order book: a wall between price and the stop is cover for the plan; a lopsided book is evidence either way.
  const book = d.orderBook
  const fmtUsd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1e3).toFixed(0)}K`)
  if (book && action !== "WAIT") {
    const long = action === "LONG"
    const shield = long ? book.bidWalls.find((w) => w.price < px && w.price > call.stopLoss) : book.askWalls.find((w) => w.price > px && w.price < call.stopLoss)
    if (shield) {
      reasons.push({ text: `${fmtUsd(shield.usd)} ${long ? "buy" : "sell"} wall at $${fmtN(shield.price, dp)} sits between price and the stop`, anchor: "sec-orderbook", tone: long ? "pos" : "neg", weight: 8 })
    }
    const d2 = book.depth[book.depth.length - 1]
    if (d2 && Math.abs(d2.imbalance) >= 0.2) {
      const bidHeavy = d2.imbalance > 0
      const band = d2.band * 100 < 1 ? (d2.band * 100).toFixed(2) : (d2.band * 100).toFixed(0)
      reasons.push({ text: `Resting book is ${bidHeavy ? "bid" : "ask"}-heavy within ${band}% (${fmtUsd(d2.bidUsd)} vs ${fmtUsd(d2.askUsd)})`, anchor: "sec-orderbook", tone: bidHeavy ? "pos" : "neg", weight: 6 })
    }
  }

  const sign = action === "LONG" ? 1 : action === "SHORT" ? -1 : 0
  const byWeight'''
    assert old in s
    s = s.replace(old, new)
    old = '''  if (call.geoOverride && action !== "WAIT") {
    butWatch.unshift({ text: call.geoOverride, anchor: "sec-geo", tone: "neg", weight: 25 })
  }'''
    new = old + '''
  if (book && action !== "WAIT") {
    const long = action === "LONG"
    const blocking = long ? book.askWalls.find((w) => w.price > px && w.price < call.tp1) : book.bidWalls.find((w) => w.price < px && w.price > call.tp1)
    if (blocking) {
      butWatch.unshift({ text: `${fmtUsd(blocking.usd)} ${long ? "sell" : "buy"} wall at $${fmtN(blocking.price, dp)} sits before the first target; bank part of the position in front of it`, anchor: "sec-orderbook", tone: "neg", weight: 14 })
    }
  }
  const lqw = d.market.liquidations
  const againstUs = lqw?.dominant && ((action === "LONG" && lqw.dominant === "short") || (action === "SHORT" && lqw.dominant === "long"))
  if (lqw && againstUs && lqw.h1.longUsd + lqw.h1.shortUsd > 0) {
    butWatch.unshift({
      text: action === "LONG" ? "Shorts are being squeezed right now; entering mid-squeeze is late, wait for it to stall" : "Longs are being flushed right now; entering mid-cascade is late, wait for the flush to stall",
      anchor: "sec-liquidations",
      tone: "neg",
      weight: 12,
    })
  }'''
    assert old in s
    s = s.replace(old, new)
    return s
rw("src/app/signals/recommendation.ts", reco)

# 6. dashboard anchors
rw("src/app/signals/dashboard.tsx", lambda s: s.replace(
    '"sec-volume": "flow", "sec-market-data": "flow", "sec-positioning": "flow",',
    '"sec-volume": "flow", "sec-market-data": "flow", "sec-positioning": "flow", "sec-liquidations": "flow", "sec-orderbook": "flow",'))

# 7. hints
rw("src/app/signals/shared.tsx", lambda s: s.replace('''  Whipsaw: "Headline regime''', '''  Liquidations: "Forced closes of leveraged positions. Mostly longs means buyers are being flushed (fuel for a bounce once it slows); mostly shorts means a squeeze is running.",
  "Buy wall": "A cluster of resting bids far larger than its neighbours. Price tends to bounce there; a stop just below it has cover. Walls can be pulled.",
  "Sell wall": "A cluster of resting asks far larger than its neighbours. Price tends to stall there; take partial profit in front of it rather than through it.",
  Whipsaw: "Headline regime'''))

# 8. guide
rw("src/app/signals/GuideModal.tsx", lambda s: s.replace('''  {
    title: "What to look at first",''', '''  {
    title: "Order flow (Flow tab)",
    color: AMBER,
    items: [
      { label: "Liquidations", desc: "Forced closes on OKX perps, split long vs short over 1h, 4h and the covered window. Mostly longs = buyers being flushed, which removes fuel for further downside and often precedes a bounce. Mostly shorts = a squeeze; chasing it is late." },
      { label: "Flush zones", desc: "Price buckets where the most positions were liquidated. A long-flush zone below price often becomes support; a short-flush zone above often becomes resistance." },
      { label: "Buy / sell walls", desc: "Resting orders at least 3x the median level. Buy walls below price are bounce points and cover for a stop; sell walls above are where to bank partial profit. Walls can be pulled, so treat them as intent." },
      { label: "Book imbalance", desc: "Bids vs asks inside the covered band. A book leaning against your direction is a reason to size down, not a reason to flip." },
    ],
  },
  {
    title: "What to look at first",'''))

print("edits ok")
