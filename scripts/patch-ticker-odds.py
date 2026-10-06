# One-shot patch (2026-10-06): make prediction-market odds ticker-specific in the signals UI.
import io

p = 'src/app/signals/PredictionOddsPanel.tsx'
s = open(p, encoding='utf-8').read()

old = '''export function EventOddsInline({ defId, state }: { defId: string; state: PredictionApi | undefined }) {
  if (!state) return null
  const fedDefs = ["fed_funds", "fomc_statement", "fomc_presser", "fomc_minutes", "fed_speech"]
  if (fedDefs.includes(defId) && state.fed.length > 0) {
    const m = state.fed[0]
    return ('''
assert old in s
s = s.replace(old, '''const ASSET_NAME: Record<MacroAsset, string> = { BTC: "BTC", GOLD: "Gold", WTI: "WTI crude" }

// The selected ticker's own price odds: implied median from the nearest dated ladder plus the rungs in play.
function AssetOddsLine({ asset, state }: { asset: MacroAsset; state: PredictionApi }) {
  const odds = state.byAsset[asset]
  if (!odds || odds.markets.length === 0) return null
  const soon = Date.now() + 20 * 3600e3
  const dated = odds.markets.filter((m) => impliedMedian(m) != null && (!m.closeTime || new Date(m.closeTime).getTime() > soon))
  const m = dated[0] ?? odds.markets[0]
  const med = impliedMedian(m)
  const rungs = ladderWindow(m, 5)
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{ASSET_NAME[asset]} price odds</span>
        <span className="text-[10px] font-bold" style={{ color: VENUE_COLOR[m.venue] }}>{VENUE_LABEL[m.venue]}</span>
        <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-white hover:underline underline-offset-2 truncate max-w-[55%]" title={m.title}>
          {m.title}
        </a>
        {med && (
          <span className="ml-auto font-mono text-white/85">
            median ≈ <span className="font-bold text-white">{fmtStrike(Math.round(med.value))}</span>
            {m.closeTime ? <span className="text-white/35"> {fmtDate(m.closeTime)}</span> : null}
          </span>
        )}
      </div>
      {rungs.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-white/70">
          {rungs.map((o) => (
            <span key={o.label}>
              {o.value != null ? fmtStrike(o.value) : o.label} <span className="text-white/90">{pct(o.prob)}</span>
            </span>
          ))}
        </div>
      )}
      {odds.summary && <div className="mt-0.5 text-[10px] text-white/45">{odds.summary}</div>}
    </div>
  )
}

export function EventOddsInline({ defId, state, asset }: { defId: string; state: PredictionApi | undefined; asset?: MacroAsset | null }) {
  if (!state) return null
  return (
    <div className="space-y-2">
      {asset && <AssetOddsLine asset={asset} state={state} />}
      <EventOddsBody defId={defId} state={state} />
    </div>
  )
}

function EventOddsBody({ defId, state }: { defId: string; state: PredictionApi }) {
  const fedDefs = ["fed_funds", "fomc_statement", "fomc_presser", "fomc_minutes", "fed_speech"]
  if (fedDefs.includes(defId) && state.fed.length > 0) {
    const m = state.fed[0]
    return (''')

old = '''export function PredictionOddsPanel({ asset }: { asset: MacroAsset | null }) {
  const q = usePredictionState()
  const s = q.data
  if (q.isLoading && !s) return <div id="sec-prediction" className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 animate-pulse h-28" />
  if (!s) return null
  const anyOk = s.venues.some((v) => v.ok && v.count > 0)
  const assetOdds = asset ? s.byAsset[asset] : null'''
assert old in s
s = s.replace(old, '''export function PredictionOddsPanel({ asset, symbol }: { asset: MacroAsset | null; symbol?: string }) {
  const q = usePredictionState()
  const s = q.data
  if (q.isLoading && !s) return <div id="sec-prediction" className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 animate-pulse h-28" />
  if (!s) return null
  const anyOk = s.venues.some((v) => v.ok && v.count > 0)
  const assetOdds = asset ? s.byAsset[asset] : null
  const label = symbol ?? asset ?? ""''')

old = '''        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-3">
            {s.fed.slice(0, 2).map((m) => ('''
assert old in s
s = s.replace(old, '''        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-3">
            {assetOdds && assetOdds.markets.length > 0 ? (
              <AssetLadder asset={assetOdds.asset} markets={assetOdds.markets} label={label} />
            ) : (
              <p className="text-xs text-white/40">{asset ? `No open ${label} price market on Kalshi or Polymarket right now.` : `No prediction market lists ${label || "this ticker"}. Fed and recession odds still apply to it.`}</p>
            )}
            {assetOdds?.summary && <p className="text-[11px] text-white/55">{assetOdds.summary}</p>}
          </div>
          <div className="space-y-3">
            {s.fed.slice(0, 2).map((m) => (''')

old = '''          </div>
          <div className="space-y-3">
            {assetOdds && assetOdds.markets.length > 0 ? (
              <AssetLadder asset={assetOdds.asset} markets={assetOdds.markets} />
            ) : (
              <p className="text-xs text-white/40">{asset ? `No open ${asset} price market found on either venue.` : "Select BTC, GOLD or OIL for price odds."}</p>
            )}
            {assetOdds?.summary && <p className="text-[11px] text-white/55">{assetOdds.summary}</p>}
          </div>
        </div>'''
assert old in s
s = s.replace(old, '''          </div>
        </div>''')

old = '''function AssetLadder({ asset, markets }: { asset: MacroAsset; markets: PMMarket[] }) {
  if (markets.length === 0) return null
  const list = markets.slice(0, 8)
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <div className="text-xs font-bold text-white mb-2">{asset === "WTI" ? "WTI crude" : asset} price odds</div>'''
assert old in s
s = s.replace(old, '''function AssetLadder({ asset, markets, label }: { asset: MacroAsset; markets: PMMarket[]; label?: string }) {
  if (markets.length === 0) return null
  const list = markets.slice(0, 8)
  const name = asset === "WTI" ? "WTI crude" : asset === "GOLD" ? "Gold" : asset
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-white">{name} price odds</span>
        {label && <span className="rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--brand, #9CA3AF)", backgroundColor: "rgba(255,255,255,0.06)" }}>{label} ticker</span>}
      </div>''')
open(p, 'w', encoding='utf-8').write(s)

p = 'src/app/signals/MacroEventPanel.tsx'
s = open(p, encoding='utf-8').read()
s = s.replace('export function MacroEventCard({ state, isLoading }: { state: MacroApi | undefined; isLoading: boolean }) {', 'export function MacroEventCard({ state, isLoading, asset }: { state: MacroApi | undefined; isLoading: boolean; asset?: MacroAsset | null }) {')
s = s.replace('<EventOddsInline defId={a.def.id} state={predQ.data} />', '<EventOddsInline defId={a.def.id} state={predQ.data} asset={asset} />')
open(p, 'w', encoding='utf-8').write(s)

p = 'src/app/signals/dashboard.tsx'
s = open(p, encoding='utf-8').read()
old = '''            <MacroEventCard state={macroQ.data} isLoading={macroQ.isLoading} />
            {d?.macroEvent && <MacroScoreStrip scores={d.macroEvent.scores} confidence={call?.confidence ?? 50} bias={call?.bias ?? "WAIT"} />}
            <PredictionOddsPanel asset={symbol === "BTC" ? "BTC" : symbol === "GOLD" ? "GOLD" : symbol === "OIL" ? "WTI" : null} />'''
assert old in s
s = s.replace(old, '''            <MacroEventCard state={macroQ.data} isLoading={macroQ.isLoading} asset={predAsset} />
            {d?.macroEvent && <MacroScoreStrip scores={d.macroEvent.scores} confidence={call?.confidence ?? 50} bias={call?.bias ?? "WAIT"} />}
            <PredictionOddsPanel asset={predAsset} symbol={symbol} />''')
old = '''  const [symbol, setSymbol] = useState(theme.defaultSymbol)
'''
assert old in s
s = s.replace(old, old + '''  // Prediction-market asset for the selected ticker (Kalshi/Polymarket list BTC, gold and WTI price markets).
  const predAsset: MacroAsset | null = symbol === "BTC" ? "BTC" : symbol === "GOLD" ? "GOLD" : symbol === "OIL" ? "WTI" : null
''')
head = s.split('export default function SignalsDashboard')[0]
if 'MacroAsset' not in head:
    s = s.replace('import { PredictionOddsPanel } from "./PredictionOddsPanel"', 'import { PredictionOddsPanel } from "./PredictionOddsPanel"\nimport type { MacroAsset } from "@/lib/macro/types"')
open(p, 'w', encoding='utf-8').write(s)
print("patched")
