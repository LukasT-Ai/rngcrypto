"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { AlertTriangle, BarChart3, ChevronDown, Globe, HelpCircle, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CalendarRow, MacroAsset } from "@/lib/macro/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { buildRecommendation, type SectionId } from "./recommendation"
import { VerdictCard, type NextMarketHint } from "./VerdictCard"
import { GuideModal } from "./GuideModal"
import { AlertBanner, Chip, Countdown, EYEBROW, FOCUS_RING, SURFACE_BLUR, SkeletonContent, priceDp, scrollToSection, sessionFor, useNow } from "./shared"
import { LevelsTab } from "./tabs/LevelsTab"
import { MomentumTab } from "./tabs/MomentumTab"
import { FlowTab } from "./tabs/FlowTab"
import { MacroTab } from "./tabs/MacroTab"
import { ModelsTab } from "./tabs/ModelsTab"
import type { HistoryResponse, MarketMapResponse, SessionFeature, SignalsResponse } from "./types"
import { useMacroState } from "./MacroEventPanel"
import { THEMES, themeStyle, type SignalsVariant } from "./themes"
import { HotBoardState, HotPlayCard, HotStamp, hotStatus, useHotPlays } from "./HotBoard"

// ---------------------------------------------------------------------------
// Tickers
// ---------------------------------------------------------------------------

const TICKERS = [
  { symbol: "BTC", label: "Bitcoin", color: "#F7931A" },
  { symbol: "ETH", label: "Ethereum", color: "#627EEA" },
  { symbol: "BNB", label: "BNB", color: "#F3BA2F" },
  { symbol: "ADA", label: "Cardano", color: "#0033AD" },
  { symbol: "HYPE", label: "Hyperliquid", color: "#7BEBC2" },
  { symbol: "ZEC", label: "Zcash", color: "#ECB244" },
  { symbol: "PUMP", label: "PumpFun", color: "#FF6B6B" },
  { symbol: "NIGHT", label: "Night", color: "#8B5CF6" },
  { symbol: "SKHYNIX", label: "SK Hynix", color: "#E8622C" },
  { symbol: "GOLD", label: "Gold", color: "#FFD700" },
  { symbol: "XRP", label: "XRP", color: "#23292F" },
  { symbol: "SOL", label: "Solana", color: "#9945FF" },
  { symbol: "NEAR", label: "NEAR", color: "#00C08B" },
  { symbol: "OIL", label: "WTI Oil", color: "#8B6914" },
  { symbol: "SILVER", label: "Silver", color: "#C0C0C0" },
  { symbol: "TSLA", label: "Tesla", color: "#CC0000" },
  { symbol: "NVDA", label: "Nvidia", color: "#76B900" },
  { symbol: "GOOGL", label: "Google", color: "#4285F4" },
  { symbol: "COIN", label: "Coinbase", color: "#0052FF" },
  { symbol: "MU", label: "Micron", color: "#1A1AFF" },
  { symbol: "SP500", label: "S&P 500", color: "#E63946" },
  { symbol: "NAS100", label: "Nasdaq 100", color: "#457B9D" },
  { symbol: "CRCL", label: "Circle", color: "#00D395" },
  { symbol: "MINIMAX", label: "MiniMax", color: "#FF8C42" },
  { symbol: "SPCX", label: "SpaceX", color: "#005288" },
  { symbol: "DRAM", label: "DRAM", color: "#0EA5E9" },
  { symbol: "AAOI", label: "AAOI", color: "#DC2626" },
  { symbol: "SNDK", label: "SanDisk", color: "#E11D48" },
  { symbol: "UNITREE", label: "Unitree", color: "#059669" },
  { symbol: "ZHIPU", label: "Zhipu AI", color: "#7C3AED" },
  { symbol: "CXMT", label: "CXMT", color: "#0284C7" },
]

const TICKER_GROUPS: { label: string; symbols: Set<string> }[] = [
  { label: "Crypto", symbols: new Set(["BTC", "ETH", "BNB", "ADA", "HYPE", "ZEC", "PUMP", "NIGHT", "XRP", "SOL", "NEAR", "CRCL", "MINIMAX", "SPCX", "DRAM"]) },
  { label: "Commodities", symbols: new Set(["OIL", "GOLD", "SILVER"]) },
  { label: "Stocks", symbols: new Set(["TSLA", "NVDA", "GOOGL", "COIN", "MU", "SKHYNIX", "AAOI", "SNDK", "UNITREE", "ZHIPU", "CXMT"]) },
  { label: "Indices", symbols: new Set(["SP500", "NAS100"]) },
]
const CRYPTO = TICKER_GROUPS[0].symbols

// Response shapes live in ./types; re-exported here for older importers.
export type { OilGeoForce, OilGeo, SignalsResponse, MarketMapResponse, HotPlay, HotResponse, SignalLog, CalibrationBucket, HistoryResponse, RegimeInfo, RegimeTFInfo } from "./types"

// ---------------------------------------------------------------------------
// Tabs. Every `sec-*` id is a deep-link target used by the verdict's jump links and by external links.
// ---------------------------------------------------------------------------

const TABS = [
  { key: "levels", label: "Levels", hint: "Where to enter, where you are wrong, where to take profit, and what sits in between." },
  { key: "momentum", label: "Momentum", hint: "Is the trend real and do the timeframes agree?" },
  { key: "flow", label: "Flow", hint: "Who is positioned, who is being forced out, and where the resting size is." },
  { key: "macro", label: "Macro", hint: "What is scheduled, what just printed, and how the market took it." },
  { key: "models", label: "Models", hint: "What the structure models and the factor engine say, and what is forming." },
] as const
type TabKey = (typeof TABS)[number]["key"]
const TAB_KEYS = new Set<string>(TABS.map((t) => t.key))

// Which tab holds each jump anchor used by the verdict card and by deep links.
const ANCHOR_TAB: Record<string, TabKey> = {
  "sec-active-setups": "levels", "sec-levels": "levels", "sec-fib": "levels", "sec-chart": "levels",
  "sec-regime": "momentum", "sec-indicators": "momentum", "sec-divergences": "momentum", "sec-htf": "momentum", "sec-tf-alignment": "momentum",
  "sec-volume": "flow", "sec-market-data": "flow", "sec-positioning": "flow", "sec-liquidations": "flow", "sec-orderbook": "flow",
  "sec-calendar": "macro", "sec-geo": "macro", "sec-news": "macro", "sec-macro": "macro", "sec-macro-strip": "macro", "sec-macro-results": "macro", "sec-oil-weekly": "macro", "sec-prediction": "macro",
  "sec-confluence": "models", "sec-market-map": "models", "sec-setups": "models", "sec-forecast": "models",
}

const HOT_SLOW_MS = 8_000

// ---------------------------------------------------------------------------
// Context bar pieces
// ---------------------------------------------------------------------------

type Ticker = (typeof TICKERS)[number]

function TickerPills({ tickers, symbol, onPick }: { tickers: Ticker[]; symbol: string; onPick: (s: string) => void }) {
  return (
    <div className="relative hidden min-w-0 flex-1 sm:block">
      <div className="flex items-center gap-1 overflow-x-auto snap-x pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]" role="group" aria-label="Ticker">
        {TICKER_GROUPS.map((g) => {
          const items = tickers.filter((t) => g.symbols.has(t.symbol))
          if (items.length === 0) return null
          return (
            <React.Fragment key={g.label}>
              <span className={cn(EYEBROW, "shrink-0 pl-2 pr-1 text-white/50 first:pl-0")}>{g.label}</span>
              {items.map((t) => {
                const active = t.symbol === symbol
                return (
                  <button
                    key={t.symbol}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onPick(t.symbol)}
                    title={t.label}
                    className={cn(
                      "h-7 shrink-0 snap-start rounded-full border px-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors",
                      active ? "border-transparent text-[#06080F]" : "border-white/10 text-white/60 hover:border-white/25 hover:text-white",
                      FOCUS_RING
                    )}
                    style={active ? { backgroundColor: "var(--brand)" } : undefined}
                  >
                    {t.symbol}
                  </button>
                )
              })}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

function TickerPalette({ tickers, symbol, onPick }: { tickers: Ticker[]; symbol: string; onPick: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const label = tickers.find((t) => t.symbol === symbol)?.label
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn("inline-flex h-7 items-center gap-1 rounded-full border border-white/15 px-2.5 text-[11px] font-bold uppercase tracking-wide text-[#06080F] sm:hidden", FOCUS_RING)}
        style={{ backgroundColor: "var(--brand)" }}
      >
        {symbol}
        <ChevronDown className="size-3" />
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Pick a ticker" description={`Currently ${label ?? symbol}. Type to filter.`} className="border-white/[0.08] bg-[#0A0E17] text-white">
        <CommandInput placeholder="Search tickers…" />
        <CommandList>
          <CommandEmpty>No ticker matches.</CommandEmpty>
          {TICKER_GROUPS.map((g) => {
            const items = tickers.filter((t) => g.symbols.has(t.symbol))
            if (items.length === 0) return null
            return (
              <CommandGroup key={g.label} heading={g.label}>
                {items.map((t) => (
                  <CommandItem
                    key={t.symbol}
                    value={`${t.symbol} ${t.label}`}
                    onSelect={() => {
                      onPick(t.symbol)
                      setOpen(false)
                    }}
                    aria-selected={t.symbol === symbol}
                  >
                    <span className="font-mono font-bold">{t.symbol}</span>
                    <span className="text-white/50">{t.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )
          })}
        </CommandList>
      </CommandDialog>
    </>
  )
}

// Session chip (F2.7): features.session from the engine when present, else clock-derived. Gates are amber; everything
// else white/60. Engine copy: `US session · vol x1.3`, `Weekend · x0.7 · size x0.5`, `late UTC · entries gated`.
function SessionChip({ crypto, session }: { crypto: boolean; session?: SessionFeature | null }) {
  const now = useNow(60_000)
  if (now === 0 && !session) return null
  const gateTip = (gate: string | null | undefined) =>
    gate === "late_utc" ? "21:00 to 24:00 UTC: thin books and wide spreads; new entries are gated." : gate === "nonc_weekend" ? "This market is closed over the weekend; calls wait for the open." : gate ? `Session gate active: ${gate}.` : null
  if (session) {
    const gate = session.gate && session.gate !== "none" ? session.gate : null
    const word = session.weekend ? "Weekend" : session.name === "us" ? "US session" : session.name === "london" ? "London" : session.name === "asia" ? "Asia" : "Late UTC"
    const label =
      session.label ??
      (gate === "late_utc"
        ? "late UTC · entries gated"
        : gate === "nonc_weekend"
          ? "market closed · WAIT"
          : [word, session.volMult != null ? `vol x${session.volMult}` : null, session.sizeMult != null && session.sizeMult !== 1 ? `size x${session.sizeMult}` : null].filter(Boolean).join(" · "))
    return (
      <Chip variant={gate ? "warning" : "vol"} size="label" className="hidden md:inline-flex" tip={gateTip(gate) ?? "Trading session from the engine: volatility and size multipliers by session and weekend."}>
        {label}
      </Chip>
    )
  }
  const s = sessionFor(now, crypto)
  const gated = s.gate !== "none"
  return (
    <Chip variant={gated ? "warning" : "vol"} size="label" className="hidden md:inline-flex" tip={gateTip(gated ? s.gate : null) ?? "Trading session by UTC clock. Volatility scaling by session arrives with the engine's session feature."}>
      {s.label}
    </Chip>
  )
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export default function SignalsDashboard({ variant = "signals" }: { variant?: SignalsVariant }) {
  const theme = THEMES[variant]
  const tickers = useMemo(() => (theme.tickers ? TICKERS.filter((t) => theme.tickers!.includes(t.symbol)) : TICKERS), [theme.tickers])
  const allowed = useMemo(() => new Set(tickers.map((t) => t.symbol)), [tickers])
  const [symbol, setSymbol] = useState(theme.defaultSymbol)
  // Deep links from the performance log (/signals/strike?symbol=ETH) land on that ticker; unknown symbols are ignored.
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("symbol")?.toUpperCase()
    if (want && allowed.has(want)) setSymbol(want)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Prediction-market asset for the selected ticker (Kalshi/Polymarket list BTC, gold and WTI price markets).
  const predAsset: MacroAsset | null = symbol === "BTC" ? "BTC" : symbol === "GOLD" ? "GOLD" : symbol === "OIL" ? "WTI" : null
  const [fetchTs, setFetchTs] = useState(Date.now())
  const [guideOpen, setGuideOpen] = useState(false)
  const [tab, setTab] = useState<TabKey>("levels")
  // Hash -> tab on mount and on in-page hash changes (navbar links, back/forward), then scroll to the section.
  useEffect(() => {
    const apply = (scroll: boolean) => {
      const h = window.location.hash.replace("#", "")
      if (h in ANCHOR_TAB) setTab(ANCHOR_TAB[h])
      else if (TAB_KEYS.has(h)) setTab(h as TabKey)
      if (scroll && h && !TAB_KEYS.has(h)) window.setTimeout(() => scrollToSection(h), 150)
    }
    apply(false)
    const onHash = () => apply(true)
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  const selectTab = useCallback((k: string) => {
    if (!TAB_KEYS.has(k)) return
    setTab(k as TabKey)
    window.history.replaceState(null, "", `#${k}`)
  }, [])

  const accent = tickers.find((t) => t.symbol === symbol)?.color ?? theme.brand

  // "On the board right now": published calls across the tickers this venue page carries. Tapping one switches the ticker in place.
  const hotQ = useHotPlays()
  const hotPlays = useMemo(() => (hotQ.data?.hot ?? []).filter((p) => p.bias !== "WAIT" && allowed.has(p.symbol)).slice(0, 6), [hotQ.data, allowed])
  const hotStateRaw = hotStatus(hotQ, hotPlays)
  const hotStart = useRef(Date.now())
  const hotNow = useNow(2_000)
  const hotState = hotStateRaw === "loading" && hotNow - hotStart.current > HOT_SLOW_MS ? "slow" : hotStateRaw
  const pickHot = useCallback((sym: string) => {
    setSymbol(sym)
    window.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  }, [])

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<SignalsResponse>({
    queryKey: ["signals", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/signals?symbol=${symbol}`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 25_000,
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (dataUpdatedAt) setFetchTs(dataUpdatedAt)
  }, [dataUpdatedAt])

  const { data: mapData } = useQuery<MarketMapResponse>({
    queryKey: ["market-map", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/signals/market-map?symbol=${symbol}`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    refetchInterval: 120_000,
    staleTime: 110_000,
    placeholderData: keepPreviousData,
  })

  const { data: historyData } = useQuery<HistoryResponse>({
    queryKey: ["signals-history"],
    queryFn: async () => {
      const res = await fetch("/api/signals/history")
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    refetchInterval: 60_000,
  })

  // Macro events are filtered to what matters for this ticker (metals -> gold lens, OIL -> WTI, everything else -> BTC/risk lens).
  const macroLens: MacroAsset = symbol === "GOLD" || symbol === "SILVER" ? "GOLD" : symbol === "OIL" ? "WTI" : "BTC"
  const macroQ = useMacroState(macroLens)

  const d = data
  const call = d?.call
  const vol = d?.volume
  const pats = d?.patterns

  const currentPrice = d?.price?.mark ?? 0
  const dp = currentPrice > 0 ? priceDp(currentPrice) : 2

  // Data for a previously selected ticker can linger in the cache for a tick; never recommend on it
  const staleTicker = !!d && d.asset !== symbol
  const reco = useMemo(
    () => (d && !staleTicker ? buildRecommendation(d, mapData, historyData?.stats) : null),
    [d, mapData, historyData, staleTicker]
  )

  // NEXT row hint (F2.1): the market-implied mean for the next high-impact release, once the calendar carries it.
  const nextMarket = useMemo<NextMarketHint | null>(() => {
    const rows = macroQ.data?.calendar
    if (!rows) return null
    const next = rows.filter((r) => !r.released && (r.importance === "high" || r.importance === "critical")).sort((a, b) => a.time.localeCompare(b.time))[0] as
      | (CalendarRow & { market?: { mean: number | null; venue: "kalshi" | "polymarket" | null } | null })
      | undefined
    if (!next) return null
    const m = next.market ?? null
    return { consensus: next.forecastRaw ?? null, mean: m?.mean != null ? m.mean.toLocaleString("en-US", { maximumFractionDigits: 2 }) : null, venue: m?.venue ?? null }
  }, [macroQ.data?.calendar])

  // Verdict links point at sections that now live inside tabs: switch tab first, then scroll.
  const jumpTo = useCallback(
    (anchor: SectionId) => {
      if (anchor === "sec-track-record") {
        window.location.href = "/signals/performance"
        return
      }
      const target = ANCHOR_TAB[anchor]
      if (target && target !== tab) setTab(target)
      window.setTimeout(() => scrollToSection(anchor, accent), target && target !== tab ? 150 : 0)
    },
    [accent, tab]
  )

  const venueName = theme.name.replace(" Signals", "")
  const venue = theme.venueUrl ? { name: venueName, url: theme.venueUrl } : null
  const hint = TABS.find((t) => t.key === tab)?.hint

  return (
    <div className="signals-root min-h-screen pt-24 pb-16" style={themeStyle(theme)} data-variant={variant}>
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      <div className="mx-auto max-w-7xl px-4 lg:px-8 space-y-4">
        {/* ── 1. Context bar: venue, ticker, session, freshness, guide. 44px. ── */}
        <div className={cn(SURFACE_BLUR, "flex h-11 items-center gap-2 rounded-xl px-3")} style={{ boxShadow: "0 0 24px rgb(var(--glow-rgb) / 0.1), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
          <span className="relative flex size-2 shrink-0" aria-hidden>
            <span className="pulse-live absolute inline-flex size-full rounded-full opacity-60" style={{ backgroundColor: "var(--brand)" }} />
            <span className="relative inline-flex size-2 rounded-full" style={{ backgroundColor: "var(--brand)" }} />
          </span>
          <h1 className="font-display shrink-0 text-base font-bold tracking-tight sm:text-lg" style={{ color: "var(--brand)" }}>
            {theme.name}
          </h1>
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" aria-hidden />
          <TickerPills tickers={tickers} symbol={symbol} onPick={setSymbol} />
          <TickerPalette tickers={tickers} symbol={symbol} onPick={setSymbol} />
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <SessionChip crypto={CRYPTO.has(symbol)} session={d && !staleTicker ? d.features?.session ?? null : null} />
            <Chip variant="vol" size="label" tip={d?.timestamp ? `Last scan ${new Date(d.timestamp).toLocaleTimeString()}. The page re-fetches every 30 seconds.` : "Connecting to the engine."}>
              <RefreshCw className="size-3 text-white/50" />
              <Countdown lastFetch={fetchTs} color="var(--brand)" />
            </Chip>
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              aria-label="How to read this page"
              aria-haspopup="dialog"
              className={cn("rounded-full p-1 text-white/60 hover:bg-white/[0.06] hover:text-white transition-colors", FOCUS_RING)}
            >
              <HelpCircle className="size-4" />
            </button>
          </span>
        </div>

        {isLoading ? (
          <SkeletonContent />
        ) : (
          <>
            {/* ── 2. Verdict: the page. Everything below is navigation or evidence. ── */}
            <VerdictCard d={d} reco={reco} dp={dp} symbol={symbol} loading={!d || staleTicker} onJump={jumpTo} venue={venue} nextMarket={nextMarket} />

            {/* ── 3. One alert slot: only the most severe condition the verdict does not already say ── */}
            {(() => {
              if (isError && !d) {
                return (
                  <AlertBanner icon={AlertTriangle} color="#F59E0B">
                    Signals unavailable.{" "}
                    <button type="button" onClick={() => refetch()} className={cn("underline underline-offset-2", FOCUS_RING)}>
                      Retry
                    </button>
                  </AlertBanner>
                )
              }
              if (staleTicker) {
                return (
                  <AlertBanner icon={RefreshCw} color={accent}>
                    Loading {symbol} — sections below still show {d?.asset} until fresh data arrives
                  </AlertBanner>
                )
              }
              if (pats?.squeeze) return <AlertBanner icon={AlertTriangle} color="#F59E0B">Squeeze risk: {pats.squeeze}</AlertBanner>
              // The event-window bar on the verdict carries catalyst risk once the engine emits it.
              if (call?.catalystRisk && !call.eventWindow) return <AlertBanner icon={AlertTriangle} color="#F59E0B">Catalyst risk: {call.catalystRisk}</AlertBanner>
              const g = d?.oilGeopolitical
              if (g?.regime === "whipsaw" && g.verdict && !call?.geoOverride && !/whipsaw/i.test(reco?.oneLiner ?? "")) {
                return <AlertBanner icon={Globe} color="#F59E0B">Headline whipsaw: {g.verdict.summary.split(". ")[0]}</AlertBanner>
              }
              if (vol?.absorption?.detected) {
                return (
                  <AlertBanner icon={BarChart3} color="#F59E0B">
                    Volume absorption ({vol.absorption.strength.toFixed(1)}x):{" "}
                    {vol.absorption.direction === "bullish"
                      ? "buyers absorbing sell pressure, reversal up more likely"
                      : vol.absorption.direction === "bearish"
                        ? "sellers absorbing buy pressure, reversal down more likely"
                        : "heavy volume with no progress, expect a reversal"}
                  </AlertBanner>
                )
              }
              return null
            })()}

            {/* ── 4. Evidence tabs: Levels · Momentum · Flow · Macro · Models ── */}
            {d && !staleTicker && (
              <Tabs value={tab} onValueChange={selectTab} className="gap-3">
                <TabsList
                  aria-label="Evidence"
                  className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.75)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {TABS.map((t) => (
                    <TabsTrigger
                      key={t.key}
                      value={t.key}
                      className={cn(
                        "h-auto flex-none shrink-0 rounded-lg border-transparent px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-white/60 shadow-none transition-colors hover:text-white after:hidden",
                        "data-[state=active]:bg-[var(--brand)] data-[state=active]:text-[#06080F] data-[state=active]:shadow-none",
                        FOCUS_RING
                      )}
                    >
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {hint && <p className="-mt-1 px-1 text-[11px] text-white/50">{hint}</p>}
                <TabsContent value="levels">
                  <LevelsTab d={d} dp={dp} accent={accent} />
                </TabsContent>
                <TabsContent value="momentum">
                  <MomentumTab d={d} />
                </TabsContent>
                <TabsContent value="flow">
                  <FlowTab d={d} />
                </TabsContent>
                <TabsContent value="macro">
                  <MacroTab d={d} macro={macroQ.data} macroLoading={macroQ.isLoading} macroLens={macroLens} predAsset={predAsset} symbol={symbol} />
                </TabsContent>
                <TabsContent value="models">
                  <ModelsTab d={d} mapData={mapData} dp={dp} accent={accent} />
                </TabsContent>
              </Tabs>
            )}

            {/* ── 5. On the board: discovery, not decision, so it sits below the evidence as one strip ── */}
            <section id="hot" className="space-y-2" aria-label="On the board right now">
              <div className="flex flex-wrap items-center gap-2">
                <span className={EYEBROW} style={{ color: "var(--brand)" }}>On the board</span>
                <span className="hidden text-[11px] text-white/50 sm:inline">highest-conviction calls on {venueName}. Tap one to load its breakdown.</span>
                <span className="ml-auto">
                  <HotStamp ts={hotQ.data?.timestamp} />
                </span>
              </div>
              {hotState !== "ready" ? (
                <HotBoardState status={hotState} compact count={3} />
              ) : (
                <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
                  {hotPlays.map((p) => (
                    <div key={p.symbol} className="w-[260px] shrink-0 snap-start">
                      <HotPlayCard p={p} onSelect={pickHot} compact />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── 6. Track record: one line, the full page has the rest ── */}
            {historyData?.stats && (
              <div id="sec-track-record" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/[0.08] bg-[rgb(var(--surface-rgb)/0.75)] px-4 py-2.5 text-xs text-white/60">
                <span className="font-semibold uppercase tracking-[0.14em] text-white/60">Verified track record</span>
                <span>
                  <span className="font-mono text-white">{historyData.stats.total}</span> logged
                </span>
                <span>
                  <span className="font-mono text-white">{historyData.stats.winRate}%</span> reached TP1
                </span>
                <a href="/signals/performance" className={cn("ml-auto rounded-sm font-semibold text-white/80 hover:text-white transition-colors", FOCUS_RING)}>
                  Full performance →
                </a>
              </div>
            )}

            {/* ── 7. Footer ── */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-white/[0.04] pt-4 text-[11px] text-white/50">
              <span>Auto-refreshes every 30s</span>
              <span>Not financial advice</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
