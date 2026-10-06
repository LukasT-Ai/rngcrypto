# One-shot patch (2026-10-06): ticker-relevant macro events + faster/longer actual verification + news fallback.

p = 'src/lib/macro/types.ts'
s = open(p, encoding='utf-8').read()
s = s.replace('export type SourceProvider = "BLS" | "FRED" | "EIA" | "BEA" | "FXSTREET" | "NONE";', 'export type SourceProvider = "BLS" | "FRED" | "EIA" | "BEA" | "FXSTREET" | "NEWS" | "NONE";')
open(p, 'w', encoding='utf-8').write(s)

p = 'src/lib/macro/fxstreet.ts'
s = open(p, encoding='utf-8').read()
old = '''export async function fetchFxStreet(): Promise<FxItem[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.items;'''
assert old in s
s = s.replace(old, '''// maxAgeMs lets the release verifier poll faster than the calendar's 10-minute cache during a release window.
export async function fetchFxStreet(maxAgeMs = TTL): Promise<FxItem[]> {
  if (cache && Date.now() - cache.at < Math.min(maxAgeMs, TTL)) return cache.items;''')
open(p, 'w', encoding='utf-8').write(s)

p = 'src/lib/macro/releases.ts'
s = open(p, encoding='utf-8').read()
s = s.replace('import { fetchFxStreet, fxActualFor, fxStatus } from "./fxstreet";', 'import { fetchFxStreet, fxActualFor, fxStatus } from "./fxstreet";\nimport { newsApiCrudeActual } from "./news-actual";')
old = '''  const items = await fetchFxStreet();
  const hit = fxActualFor(items, def.id, event.time);
  if (!hit) {
    return { eventId: event.id, status: "awaiting", actual: null, candidates: [], note: `${why}; FXStreet has not published the actual yet`, checkedAt };
  }'''
assert old in s
s = s.replace(old, '''  const age = Date.now() - new Date(event.time).getTime();
  // Poll FXStreet every 15s for the first hour after release, then once a minute; the calendar cache is 10 min otherwise.
  const items = await fetchFxStreet(age < 3600e3 ? 15_000 : 60_000);
  const hit = fxActualFor(items, def.id, event.time);
  if (!hit) {
    // API crude: calendars lag the wire by many minutes; Reuters/OilPrice headlines carry the number first.
    if (def.id === "api_crude") {
      const news = await newsApiCrudeActual(event.time, age < 3600e3 ? 20_000 : 120_000).catch(() => null);
      if (news) {
        const actual: ReleaseValue = { value: news.value, raw: news.raw, period: event.time.slice(0, 10), revisionStatus: "preliminary", provider: "NEWS", series: `${news.source}: ${news.headline}`, sourceTimestamp: news.publishedAt, retrievedAt: checkedAt, priorRevised: null };
        return { eventId: event.id, status: "verified", actual, candidates: [actual], note: `News-reported (${news.source}): "${news.headline}" — replaced by the FXStreet calendar actual when it lands`, checkedAt };
      }
    }
    return { eventId: event.id, status: "awaiting", actual: null, candidates: [], note: `${why}; FXStreet has not published the actual yet${def.id === "api_crude" ? " and no wire headline carries the API number yet" : ""}`, checkedAt };
  }''')
s = s.replace('''  if (p === "FXSTREET") return true;
  return false;''', '''  if (p === "FXSTREET" || p === "NEWS") return true;
  return false;''')
open(p, 'w', encoding='utf-8').write(s)

p = 'src/lib/macro/service.ts'
s = open(p, encoding='utf-8').read()
old = '''const VERIFY_FOR = 45 * 60e3;'''
assert old in s
s = s.replace(old, '''// Keep trying to verify an actual for up to 6h (secondary sources like FXStreet can lag the wire by a long time).
const VERIFY_FOR = 6 * 3600e3;
// A news-reported number is provisional: keep polling so the calendar actual replaces it.
const PROVISIONAL_RECHECK = 60_000;''')
old = '''  if (st.release?.status !== "verified" && st.release?.status !== "unavailable" && age < VERIFY_FOR) {
    const last = rt.lastVerifyAttempt.get(st.event.id) ?? 0;
    const interval = age < 10 * 60e3 ? 10_000 : 60_000;
    if (now - last >= interval) {
      rt.lastVerifyAttempt.set(st.event.id, now);
      const rel = await fetchRelease(st.def, st.event);
      st.release = rel;
      if (rel.status === "verified" && rel.actual) {'''
assert old in s
s = s.replace(old, '''  const provisional = st.release?.status === "verified" && st.release.actual?.provider === "NEWS";
  if ((st.release?.status !== "verified" || provisional) && st.release?.status !== "unavailable" && age < VERIFY_FOR) {
    const last = rt.lastVerifyAttempt.get(st.event.id) ?? 0;
    const interval = provisional ? PROVISIONAL_RECHECK : age < 10 * 60e3 ? 10_000 : age < 3600e3 ? 30_000 : 5 * 60e3;
    if (now - last >= interval) {
      rt.lastVerifyAttempt.set(st.event.id, now);
      const rel = await fetchRelease(st.def, st.event);
      // Never downgrade a provisional number back to "awaiting"; only a calendar actual may replace it.
      if (!(provisional && rel.status !== "verified")) st.release = rel;
      if (rel.status === "verified" && rel.actual && (!provisional || rel.actual.provider !== "NEWS")) {''')

# Per-asset view: filter active/upcoming/recent by taxonomy relevance for the selected ticker.
old = '''  stateCache: { state: MacroState; at: number } | null;'''
assert old in s
s = s.replace(old, '''  stateCache: Map<string, { state: MacroState; at: number }>;''')
s = s.replace('''  stateCache: null,
};''', '''  stateCache: new Map(),
};''')
s = s.replace('''    rt.stateCache = null;''', '''    rt.stateCache.clear();''')
old = '''export async function getMacroState(): Promise<MacroState> {
  if (rt.stateCache && Date.now() - rt.stateCache.at < 5_000) return rt.stateCache.state;'''
assert old in s
s = s.replace(old, '''// Minimum taxonomy relevance for an event to appear on a ticker's page (API crude is 0.0 for BTC, CPI 0.4 for WTI).
const MIN_RELEVANCE = 0.3;

function relevantTo(asset: MacroAsset | null, defId: string): boolean {
  if (!asset) return true;
  return (defFor(defId).relevance[asset] ?? 0) >= MIN_RELEVANCE;
}

export async function getMacroState(asset: MacroAsset | null = null): Promise<MacroState> {
  const cacheKey = asset ?? "all";
  const cached = rt.stateCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5_000) return cached.state;''')
old = '''  const upcomingAll = await getMacroEvents(now, now + 7 * 86400e3);
  const upcoming = upcomingAll.filter((e) => rank[e.importance] >= rank.medium).slice(0, 12);

  // Active = what the trader should be looking at right now.
  const candidates = all.filter((s) => s.secondsToRelease <= WINDOW_BEFORE / 1000 && s.secondsToRelease >= -WINDOW_AFTER / 1000 && rank[s.event.importance] >= rank.medium);'''
assert old in s
s = s.replace(old, '''  const upcomingAll = (await getMacroEvents(now, now + 7 * 86400e3)).filter((e) => relevantTo(asset, e.defId));
  const upcoming = upcomingAll.filter((e) => rank[e.importance] >= rank.medium).slice(0, 12);

  // Active = what the trader should be looking at right now, for this ticker.
  const candidates = all.filter((s) => relevantTo(asset, s.def.id) && s.secondsToRelease <= WINDOW_BEFORE / 1000 && s.secondsToRelease >= -WINDOW_AFTER / 1000 && rank[s.event.importance] >= rank.medium);''')
old = '''  const recent = all.filter((s) => s !== active && s.secondsToRelease < 0 && rank[s.event.importance] >= rank.medium)'''
assert old in s
s = s.replace(old, '''  const recent = all.filter((s) => s !== active && relevantTo(asset, s.def.id) && s.secondsToRelease < 0 && rank[s.event.importance] >= rank.medium)''')
old = '''  rt.stateCache = { state, at: now };
  return state;'''
assert old in s
s = s.replace(old, '''  rt.stateCache.set(cacheKey, { state, at: now });
  return state;''')
# Alerts should also be ticker-relevant.
old = '''    alerts: rt.alerts.slice(0, 30),'''
assert old in s
s = s.replace(old, '''    alerts: rt.alerts.filter((a) => !asset || a.asset == null || a.asset === asset).slice(0, 30),''')
# Scores accessor: asset-specific view is fine (scores are computed over all states regardless).
s = s.replace('''  const s = await getMacroState();
  return { scores: s.scores[asset], preEventRisk: s.preEventRisk, active: s.active };''', '''  const s = await getMacroState(asset);
  return { scores: s.scores[asset], preEventRisk: s.preEventRisk, active: s.active };''')
old = '''export function macroAssetFor(symbol: string): MacroAsset | null {
  if (symbol === "BTC") return "BTC";
  if (symbol === "GOLD") return "GOLD";
  if (symbol === "OIL") return "WTI";
  return null;
}'''
assert old in s
s = s.replace(old, '''export function macroAssetFor(symbol: string): MacroAsset | null {
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
}''')
open(p, 'w', encoding='utf-8').write(s)

p = 'src/app/api/macro/route.ts'
s = open(p, encoding='utf-8').read()
old = '''  const sp = req.nextUrl.searchParams;
  const state = await getMacroState();'''
assert old in s
s = s.replace(old, '''  const sp = req.nextUrl.searchParams;
  const assetParam = sp.get("asset");
  const asset: MacroAsset | null = assetParam === "BTC" || assetParam === "GOLD" || assetParam === "WTI" ? assetParam : null;
  const state = await getMacroState(asset);''')
open(p, 'w', encoding='utf-8').write(s)

p = 'src/app/signals/MacroEventPanel.tsx'
s = open(p, encoding='utf-8').read()
old = '''export function useMacroState() {
  return useQuery<MacroApi>({
    queryKey: ["macro"],
    queryFn: async () => {
      const r = await fetch("/api/macro")'''
assert old in s
s = s.replace(old, '''export function useMacroState(asset: MacroAsset | null = null) {
  return useQuery<MacroApi>({
    queryKey: ["macro", asset ?? "all"],
    queryFn: async () => {
      const r = await fetch(asset ? `/api/macro?asset=${asset}` : "/api/macro")''')
# Released card: show the provider/note so a news-reported number is labelled.
old = '''              { k: "Actual", v: verified ? fmt(a.release!.actual!.value) : null, strong: true },'''
assert old in s
s = s.replace(old, '''              { k: "Actual", v: verified ? fmt(a.release!.actual!.value) : null, strong: true, src: verified ? (a.release!.actual!.provider === "NEWS" ? "news-reported, provisional" : a.release!.actual!.provider === "FXSTREET" ? "FXStreet calendar" : a.release!.actual!.provider) : null },''')
open(p, 'w', encoding='utf-8').write(s)

p = 'src/app/signals/dashboard.tsx'
s = open(p, encoding='utf-8').read()
old = '''  const macroQ = useMacroState()'''
assert old in s
s = s.replace(old, '''  // Macro events are filtered to what matters for this ticker (metals -> gold lens, OIL -> WTI, everything else -> BTC/risk lens).
  const macroLens: MacroAsset = symbol === "GOLD" || symbol === "SILVER" ? "GOLD" : symbol === "OIL" ? "WTI" : "BTC"
  const macroQ = useMacroState(macroLens)''')
open(p, 'w', encoding='utf-8').write(s)
print("patched")
