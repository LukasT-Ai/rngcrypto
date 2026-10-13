# rngcrypto.com signal pages: UX/UI audit and design direction (Phase 1)

Date: 2026-10-13. Scope: `/signals/strike`, `/signals/ascend`, `/signals/performance`.
Method: full read of `src/app/signals/**`, `src/components/*`, `globals.css`, `BRAND-GUIDE.md`; local run (`next dev` on port 3077) with headless Edge over CDP, 28 screenshots at 1440x900 and 390x844 (desktop and mobile, every tab, both vendor variants, performance page). No console errors, no horizontal overflow at either width (`scrollWidth === innerWidth` on all pages). Palette checks run with the dataviz skill validator (`scripts/validate_palette.js`).

Screenshots are in `C:\Users\Lukas\AppData\Local\Temp\rngshots\` (`strike-d-fold.png`, `strike-m-fold.png`, `strike-d-macro.png`, `perf-d-fold.png`, ...). They are temp files, not part of the repo.

---

## 1. Information architecture critique

### 1.1 What a trader needs in the first five seconds

| Need | Where it is today | Verdict |
|---|---|---|
| Direction | `VerdictCard.tsx:89-92` chip "STAND ASIDE / Long / Short" | Present, but it is the 5th block on the page. On desktop it starts at y≈510 of a 900px viewport; on mobile at y≈490 of 844, so only the direction chip and the confidence bar are above the fold and the price is not. |
| Confidence / grade | `VerdictCard.tsx:93-106` grade chip + 96px bar + "42%" | Present. Grade label ("no setup") and the bar say the same thing twice. |
| Invalidation ("wrong if") | `VerdictCard.tsx:177-185` | Present but demoted to a 12px line in the right column of row 4, below the plan grid. |
| Next catalyst | `VerdictCard.tsx:186-194` | Present, same 12px treatment. The same catalyst then appears again as the Macro strip, the event card, the calendar row and (for OIL) the catalyst panel's "next scheduled" chip. |
| What would flip the call | Nowhere on the card | The engine exposes `call.confirms`, `call.invalidates`, `call.bullCase`, `call.bearCase` (`types.ts:222-226`) and the recommendation builder produces `reco.confirmation` and `reco.butWatch` (`recommendation.ts:56-57`). `VerdictCard` dropped them when it replaced `RecommendationCard`, which is now dead code (`RecommendationCard.tsx`, not imported anywhere). |
| Price and 24h | `VerdictCard.tsx:110-119` | Good: 36px mono, signed, colored. |
| Is the data fresh / is the call live | Two countdowns (`dashboard.tsx:428` and `:512`), "Last scan" time, `staleTicker` banner | Duplicated. One freshness indicator is enough. |

### 1.2 What sits above the verdict and should not

Stack order today (`dashboard.tsx:405-517`): brand band (60px) → hot board header + 3 cards or skeleton (≈150px) → ticker rails (3 rows on desktop, ≈110px) → page header with symbol pill + "Signals" h1 + second countdown (40px) → verdict. That is ≈360px of chrome before the call. The hot board even takes its full height while empty or loading (`HotBoardState` skeletons were still showing 10s+ after load in the desktop capture because `/api/signals/hot` is slow; the compact empty state is 90px tall).

Recommendation: the verdict is the page. Everything else is navigation or evidence.

### 1.3 Duplication inventory

| Content | Appears in | Keep in |
|---|---|---|
| Next scheduled release | verdict "Next catalyst" (`VerdictCard.tsx:186`), `NextEventsStrip` (`MacroEventPanel.tsx:84`), empty-state `MacroEventCard` (`:408-427`), `EconomicCalendar` row, OIL catalyst chip (`dashboard.tsx:707-715`), WTI `WeeklyOilCard` countdown | Verdict (one line, linked) + calendar (row). The strip becomes the calendar's "upcoming" filter; the event card only renders when an event is inside its live window. |
| Released result | `RecentResults` (`:252`), `MacroEventCard` released branch (`:481-559`), calendar row with actual + read, `MacroAlerts` release alert | Calendar row (actual, surprise bar, read) + event card for the live one. `RecentResults` folds into the calendar as the "released" group. |
| Confidence | bar + percent + grade chip + grade label (`VerdictCard.tsx:93-106`) | Grade chip with percent inside it; no bar. |
| Countdown to refresh | brand band and page header | One, in the page header. |
| Verdict one-liner vs alert banner | `reco.oneLiner` (`VerdictCard.tsx:120`) and the alert slot (`dashboard.tsx:520-548`) both render "Headline whipsaw: opposing catalysts active..." (seen in `strike-d-full.png`) | Alert slot only when it says something the verdict does not. Pass the alert text into the one-liner slot instead and remove the banner for that case. |
| Regime | regime chip in verdict row 1 ("trending"), `RegimeStrip` row 2b, `RegimeSection` in Momentum, `ind.regime` in the page footer (`dashboard.tsx:1723`) | Strip in verdict + Momentum section. Drop the footer text and the row-1 chip. |
| Ticker label | symbol pill in header (`:497`), "BITCOIN" in verdict (`:111`), h1 "Signals" | One: the verdict's symbol line. |
| Track record | verdict "BTC history" link, "Verified track record" bar (`:1712-1719`), brand band "Performance" link | Verdict link + one bar. Drop the brand-band link. |
| Format helpers | `fmt`, `fmtPrice`, `priceDp`, `assessmentColor`, `useCountdown`, `SkeletonContent`, `AlertBanner`, `FactorRow` are defined in `dashboard.tsx:97-258` and again in `shared.tsx` | `shared.tsx` only. |

### 1.4 Noise

- Emoji glyphs for direction and status (`MacroEventPanel.tsx:47-49`, `:445`, `:506`, `:552`) render inconsistently across platforms and ignore the brand's Lucide line-icon rule.
- 20-row "Signal Confluence" list (`dashboard.tsx:864-875`) draws a bar whose length is the factor *weight* (2 to 14%), not its score; every bar is a 1 to 14% sliver. The assessment is only in the text. It reads as a broken chart.
- Three forms of the same regime fact in the verdict row 2b: "ABOVE CLOUD · > 200MA · TK ↑" repeated per timeframe. Fine for the Momentum tab, too much for the fold.
- Prediction-market panel on Macro (`PredictionOddsPanel.tsx:264-320`) renders eight ladders of strike probabilities before the calendar. It is interesting but it is not a decision input for most tickers.
- Page footer ("trending regime", "Auto-refreshes every 30s") duplicates header facts and collides on mobile (`dashboard.tsx:1722-1725` is `flex justify-between` with no gap or wrap; `strike-m-full.png` shows "trending regimeAuto-refreshes every 30s" run together).

### 1.5 Proposed page hierarchy

```
1. Context bar     venue name · ticker picker (searchable) · freshness · guide
2. VERDICT         direction + grade · price · one-liner · plan · why/wrong-if/flip/catalyst
3. Evidence tabs   Levels · Momentum · Flow · Macro · Models · (Chart inside Levels)
4. Board           "On the board" moves BELOW the verdict as a horizontal strip
5. Track record    one line → /signals/performance
```

The hot board moves below the verdict because a visitor who arrived at `/signals/strike?symbol=ETH` from the performance log, or from a hot card on the home page, has already chosen a ticker. The board is discovery, not decision.

### 1.6 Per-tab purpose statements

| Tab | Purpose (one sentence, shown as the tab tooltip and as a muted caption under the tab bar) | Must contain | Should move out |
|---|---|---|---|
| Levels | "Where to enter, where you are wrong, where to take profit, and what sits in between." | Price chart with plan lines, active setups, level ladder, order-book walls | Nothing |
| Momentum | "Is the trend real and do the timeframes agree?" | Regime cards, indicator tiles, divergences, HTF cards, timeframe agreement | Indicator tiles that duplicate regime cards (ADX, Trend) |
| Flow | "Who is positioned, who is being forced out, and where the resting size is." | Volume, positioning, liquidations, order book, market data | Order-book walls table duplicates the Levels ladder; keep the read and imbalance here, levels there |
| Macro | "What is scheduled, what just printed, and how the market took it." | Live event card (only when live), calendar (upcoming + released), catalyst headlines, news | Prediction markets collapse into a details block |
| Models | "What the structure models and the factor engine say, and what is forming." | Factor table, market map, early setups, scenario forecast | Nothing, but factor table becomes a signed bar table |

---

## 2. Component-level findings

### 2.1 Density

- Verdict plan tiles (`VerdictCard.tsx:136-151`): six tiles at `grid-cols-3 sm:grid-cols-6`, each 60px tall with a 10px label, 14px mono value and 10px delta. Good density. On mobile they wrap to 2 rows of 3, which is fine.
- Stat tiles (`shared.tsx:137-167`): 18px value, 10px label, 11px sub, 12px 4px padding. Good. But the Momentum tab renders 12 of them in a 4-col grid (`MomentumTab.tsx:180-199`) and four of those (ADX, Trend, Supertrend, EMA stack) are already in the regime cards above. Cut to 8.
- Regime cards (`MomentumTab.tsx:47-111`): 12 KV rows per card at 10px, three cards side by side. This is the densest block on the site and it works on desktop. On mobile three cards stack to ≈1,100px; collapse rows 4-9 behind "details" on `< sm`.
- Levels table (`LevelsTab.tsx:169-204`): 19 rows at 12px with 8px padding = 32px rows. DexScreener density is 24-28px rows. Use `py-1.5`.
- Calendar (`MacroEventPanel.tsx:159`): 11px mono cells, 6px padding, 9px header. Density is right; type size is below the floor (see 2.2).
- Macro tab total height on mobile: 6,424px (`strike-m-macro.png`). Desktop: 4,135px. Target under 2,500px on mobile by collapsing prediction markets, folding RecentResults into the calendar and capping the catalyst list at 3 rows.

### 2.2 Typography

- The brand rule "all numeric data in JetBrains Mono" is honored in the verdict, tiles and tables. Exceptions: `HotPlayCard` R:R string (`HotBoard.tsx:123`, sans), `RecentResults` "ago" text (`:277-280` mono, fine) but the `headline` (`:284`) contains numbers in sans, `ImpactRows` confidence (`:353` mono ok), the catalyst panel's "219 events · 72h" (`dashboard.tsx:625`, sans), `BucketTable` n/rates are mono (good) but the performance Fill audit numbers are mono inside sans sentences (fine).
- Type sizes below 11px are everywhere: `text-[9px]` in the calendar header (`MacroEventPanel.tsx:181`), country tag (`:213`), kind tag (`:216`), tier chips (`dashboard.tsx:1324`, `:1334`), structure chips (`:1481`), reconnect labels (`:939`, `:942`), DI labels (`MomentumTab.tsx:89`). `text-[10px]` is the default label size across the signal pages. The brand's caption size is 12px. Set a floor of 11px for anything a reader must read and 10px only for uppercase eyebrow labels.
- Display font: `font-display` (Space Grotesk) is used for the venue name (`dashboard.tsx:418`) and the performance h1. The signals h1 "Signals" (`dashboard.tsx:500`) is Inter 24px and carries no information. Remove it.

### 2.3 Color semantics

Green = bullish/long/up, red = bearish/short/down is consistent. The problems are amber, blue, and the near-greens.

| Color | Meanings in use | Files |
|---|---|---|
| Amber `#F59E0B` | warning banner, "Transition" regime, "In cloud", importance *high*, calendar surprise ≥20, scenario band hit, next-catalyst icon, "MIXED" macro direction, RecommendationCard neutral tone, counter-trend, SETUP_FORMING, APPROACHING tier, medium headline impact, brand2 on the signals variant | `dashboard.tsx:528-546`, `RegimeStrip.tsx:19,33`, `MacroEventPanel.tsx:44,51,231,379,388`, `VerdictCard.tsx:188`, `themes.ts:709` |
| Red `#FF3B5C` | bearish AND urgency: importance *critical*, next-event "now/urgent", IMMINENT tier, SETUP_IMMINENT, high-impact scheduled catalyst, conflict alerts | `MacroEventPanel.tsx:44,96`, `dashboard.tsx:604,1326,1516` |
| Blue `#60A5FA` / `#3B82F6` | importance *medium*, WATCHLIST tier | `MacroEventPanel.tsx:44`, `dashboard.tsx:1329` |
| Near-greens/reds `#00CC6A #7BEBC2 #FF6B7F #FFB3BD` | "Bullish / Slightly bullish / Bearish / Slightly bearish", hidden divergences | `dashboard.tsx:124-133`, `shared.tsx:85-93` |
| Cyan / purple | BOS vs CHoCH, absorption vs OI, Kalshi vs Polymarket | `dashboard.tsx:1470-1473,1583-1607`, `PredictionOddsPanel.tsx:28` |

Red for *urgency* collides with red for *bearish*: a "CPI in 3m" chip glows red next to a bearish chip and reads as "bearish". Rule going forward (section 4.3): direction uses green/red only; urgency and importance use white weight and the brand accent; warnings use amber only; blue and purple are dropped from the signal pages except as the two prediction-venue identities.

Contrast (measured with the validator's `contrast()`): `#00FF88` on `#0A0E17` 14.4:1, `#9CA3AF` 7.6:1, `#6B7280` 4.0:1 (fails AA for text under 18px), `#FF3B5C` 5.5:1, `#F59E0B` 9.0:1. Tailwind `text-white/35` ≈ 3.1:1 and `text-white/30` ≈ 2.7:1; both are used for real labels (`VerdictCard.tsx:127,139,141`, `MacroEventPanel.tsx:165,233,394`, `dashboard.tsx:1234`). Floor for any label: `text-white/50` (≈ 5:1). Ascend brand `#F35233` as a chip background with dark text is 5.8:1, with white text 3.5:1: use dark text on coral chips.

### 2.4 State handling

| State | Current | Gap |
|---|---|---|
| Initial loading | `SkeletonContent` (`dashboard.tsx:203-215`) and `VerdictCard` skeleton (`VerdictCard.tsx:49-58`) | Skeleton shapes do not match the real layout (generic 8 tiles). Fine. |
| Ticker switch | `keepPreviousData` + `staleTicker` banner (`:380`, `:521-527`) | Good pattern. The banner text ("sections below still show BTC") is honest. Keep. |
| Stale data (tab in background, API slow) | Countdown hits 0 and stays 0; no "stale" styling | Add a stale state: when `Date.now() - dataUpdatedAt > 90s`, dim the verdict border and show "last scan 3m ago" in amber. The `FreshnessBadge` component (`src/components/freshness-badge.tsx`) already encodes live/stale/none and is unused on these pages. |
| Hot board | skeleton, error, empty (`HotBoard.tsx:134-156`) | Skeleton has no timeout: the desktop capture still showed skeletons 12s after page load. After 8s switch to the empty-state copy with "still scanning". |
| Macro loading | `MacroEventCard` h-40 pulse (`:405`), calendar text "Loading..." (`:147`) | Calendar loading state is a one-line text box; use 6 skeleton rows. |
| Macro empty (no event in 2h) | Card collapses to one line (`:408-427`) | Good. |
| Provisional (release not verified) | "AWAITING VERIFIED DATA", "DATA CONFLICT" (`:504-508`), `outcomeStatusColor` chips | Good. Calendar "awaiting" cell (`:223`) is a 30% white word; make it an amber chip consistent with RecentResults. |
| Error | `useQuery` throws; dashboard never reads `isError` for signals, market-map or history (`:323-361`) | A failed `/api/signals` leaves the previous ticker's data on screen forever with no message. Render an error row under the header with "retry". Performance page does this (`PerformanceDashboard.tsx:216`). |
| Performance provisional | Amber banner + fill audit (`:221-239`) | Good and honest. Keep. |
| Performance thin buckets | `opacity-50` + title (`:97-99`) | Good; add the "n<8" text inline because title tooltips do not exist on touch. |

### 2.5 Mobile

- No overflow at 390px on any page (verified). Tables use `TableScroll`.
- Verdict fold: direction chip at y≈490, price at y≈590 (`strike-m-fold.png`). Moving the hot board below the verdict and collapsing the brand band to one row brings the price to y≈250.
- Ticker rail on mobile is a single snap row (`dashboard.tsx:460`) that shows 6 of 31 tickers with group labels inline; the group labels ("COMMODITIES") scroll past as if they were tickers. Replace with a select/command palette on `< sm` (the `search-command.tsx` primitive exists).
- Regime strip hides 15m on mobile (`RegimeStrip.tsx:102`) but still wraps to 3 lines of chips.
- Active setups table (`LevelsTab.tsx:70-125`): 11 columns, only Horizon/Direction/Entry/Stop visible before scroll on mobile. T1 and R:R should come before Stop and the table should become a card on `< md`.
- Calendar table (`MacroEventPanel.tsx:180-242`): six columns at 390px; Time + Release use the whole width and Actual/Forecast/Previous/Read are off-screen inside the scroll container. Needs a card layout (section 3).
- Macro event card countdown is `text-4xl` (`:459`) and the scenario table (`:376-392`) has 2 + N asset columns; at 390px it needs the asset columns stacked.
- Footer collision (`dashboard.tsx:1722-1725`), noted above.
- Performance page is good on mobile (`perf-m-full.png`): 2-col KPIs, cards for the log. The 10 breakdown tabs (`:115-126`) wrap to 4 rows of pills; use a select on `< sm`.

### 2.6 Accessibility

- Tabs (`dashboard.tsx:553-567`): `role="tab"` and `aria-selected` are set, but there is no `role="tablist"` keyboard handling (arrow keys), no `aria-controls`, and the panels have no `role="tabpanel"`. shadcn `tabs.tsx` (Radix) is already in `src/components/ui` and does all of this; the custom tab bar should be replaced with it and restyled.
- Ticker buttons (`:470-481`) have no `aria-pressed`.
- `GuideModal` (`GuideModal.tsx:83-126`): no `role="dialog"`, no `aria-modal`, no focus trap, no Escape handler, focus is not returned on close. `src/components/ui/dialog.tsx` exists; use it.
- Jump links in the verdict (`VerdictCard.tsx:13-30`) are anchors that preventDefault, fine, but `scrollToSection` sets a 2px box-shadow ring with no `focus()` call, so screen-reader users are not moved.
- Tooltips are all `title=` attributes (`shared.tsx:157`, `RegimeStrip.tsx:75-121`, 40+ places). They do not work on touch and are not announced. Any tooltip that carries decision data (regime tooltip, hint text, "n<8") needs a visible fallback or a Radix tooltip/popover.
- Focus rings: `outline-ring/50` from `globals.css:948` gives a 50% neon ring; buttons use `transition-colors` without `focus-visible:` styles anywhere in the signal pages. Add `focus-visible:ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-[#06080F]` to the shared button classes.
- Motion: `animate-ping` on two always-on dots (`dashboard.tsx:415,440`), `animate-pulse` on nine chips (`:897,957,1099,1267,1273,1326,1407,1516` and the header dot `:496`), and `motion.div {...fadeUp}` on every section so each tab switch replays the fade. Nothing on the signal pages checks `prefers-reduced-motion`; the home page does (`home-content.tsx:52-55`). Reduced-motion must disable ping/pulse and the fades.
- Color as the only channel: direction chips carry words ("Long"), good. Liquidation split bars (`OrderFlowPanels.tsx:17-35`) are red/green only with L/S text under them, acceptable. The equity curve and the confluence bars have no non-color channel but are single-series.
- Icon-only buttons: the help button (`dashboard.tsx:501-507`) has `title` but no `aria-label`.

### 2.7 Performance and re-render churn

Polling cadences in play on one Macro-tab view: signals 30s (`dashboard.tsx:330`), market-map 120s (`:348`), history 60s (`:360`), hot 60s (`HotBoard.tsx:71`), macro 15s/10s/5s/3s event-paced (`MacroEventPanel.tsx:24-31`), prediction 60s (`PredictionOddsPanel.tsx:21`). That is reasonable. The churn comes from timers, not polling:

- `useNow(1000)` is called in `NextEventsStrip` (`:85`), `MacroEventCard` (`:402`), `WeeklyOilCard` (`:743`) and `LiveCountdown` (`:69`). Each tick re-renders the whole component, including the scenario table and the reaction table inside the event card. Move the ticking number into a leaf `<LiveCountdown>` (already exists) and change the parent hooks to `useNow(15_000)` or remove them; `urgencyFor` tone changes can tolerate 15s granularity.
- `useCountdown` in `dashboard.tsx:179-191` is already isolated in `Countdown`, but two instances run (`:428`, `:512`). One.
- `EconomicCalendar` and `RecentResults` tick at 15s and rebuild groups each tick (`:142-156`); memoize the grouping on `rows` and only re-derive urgency per row.
- Every query result re-renders the 1,700-line `SignalsDashboard`; `reco` is memoized (`:381-384`) but the Macro and Models tab bodies are inline JSX in the parent, so a macro poll re-renders Levels tab state as well. Extract `MacroTab` and `ModelsTab` to files like the other three; wrap them in `React.memo`.
- `framer-motion` `motion.div` is used for simple fade-ins on 12+ sections. A CSS `@keyframes` fade with `animation-fill-mode` is cheaper and respects `prefers-reduced-motion` via a media query. Keep framer for the modal only.
- `backdrop-blur-md`/`xl` on every card (`shared.tsx:18`, the `SURFACE` class) over a fixed background image. On a 6,000px page with 60+ blurred cards this is the single biggest paint cost on mobile. Blur only the brand band and the verdict; cards use a solid `rgb(var(--surface-rgb)/0.75)`.

---

## 3. Economic Calendar: final design

Data available per row today (`CalendarRow`, `lib/macro/types.ts`): id, defId, title, time, importance (low/medium/high/critical), kind (EventKind), country, forecastRaw, forecastSource, previousRaw, actualRaw, released, read, score (-100..+100 economic surprise). Missing for the design below and worth adding to `CalendarRow` in `lib/macro/service.ts`: `relevance: Record<MacroAsset, number>` (exists on `MacroEventDef`), `zScore` (exists on `SurpriseResult` for the active event only), `assetDirection: Direction | null` (the lens asset's expected/observed direction, from `impact.ts`), and `isLive` (id equals `state.active.event.id`).

### 3.1 Grouping

Three groups, in this order, each with a sticky group header:

1. **Live** (0 or 1 row): the active event when `secondsToRelease` is within [-4h, +2h]. Rendered as the full `MacroEventCard` *in place of* the row, not above the table.
2. **Upcoming** (next 14d): grouped by day, day header shows weekday + date + count of high/critical.
3. **Released** (last 7d): grouped by day, newest first, collapsed by default to the last 2 days with "show 5 more days".

This replaces `NextEventsStrip`, `RecentResults` and the empty-state `MacroEventCard` line. The strip survives only as the verdict's "Next catalyst" line.

### 3.2 Columns (desktop, ≥ md)

| Col | Width | Content | Notes |
|---|---|---|---|
| When | 88px | `09:05` mono + countdown chip (`3h 41m`) for upcoming; `2h ago` for released | Countdown chip tone: white/50 default, white/90 under 2h, amber under 30m, brand under 5m. No red. |
| Release | flex | importance dot (4 steps, see 4.3) · country tag (2-letter, only non-US) · title · kind tag | Title in sans 12px white/85; released rows white/65. |
| Rel. | 44px | 1 to 3 filled bars for the lens asset's relevance (`relevance[lens]` ≥0.6 = 3, ≥0.3 = 2, else 1) | Visible so the reader sees why a foreign PMI is on a BTC page. |
| Actual | 72px right | mono 12px bold white; `awaiting` as amber chip; `—` before release | |
| Forecast | 72px right | mono 12px white/70; `*` suffix with tooltip when `forecastSource` is a proxy | Replace the asterisk with a `~` prefix and a visible "proxy" tag on hover/focus. |
| Previous | 72px right | mono 12px white/70; `(rev.)` when the previous text contains it | |
| Surprise | 96px | deviation bar: centered zero line, bar left (below consensus) or right (above), length = |score|/100 × 48px, color = amber for |score| ≥ 50, white/60 otherwise; a z-score chip `+1.8σ` when zScore exists | Economic surprise, not asset direction: no green/red here, because "above consensus" is bullish for some assets and bearish for others. |
| Read | flex | one-line `read` text, white/70; when `assetDirection` exists, prefix a small green/red arrow glyph with the lens asset code (`BTC ↓`) | This is the only cell that shows direction color. |

Row height 28px (`py-1`). Row hover `bg-white/[0.04]`. Row click opens an inline expansion (details element) with the scenario guide bands for that defId (reuse `ScenarioRows`) and, for released rows, the reaction table (reuse the block at `MacroEventPanel.tsx:594-620`). This is how the calendar links to the event card and the scenario guide: the live row is the card; every other row expands into the same two sub-components.

### 3.3 Filters (one row above the table)

Segmented controls, pill style (`Chip` primitive with `aria-pressed`):

- Impact: `All · High+ · Critical` (default High+ which hides low and medium; keeps the existing `showLow` behaviour but as a 3-state).
- Relevance: `This ticker · All assets` (default This ticker = `relevance[lens] ≥ 0.3`).
- Status: `Upcoming · Released · Both` (default Both, Released collapsed to 2 days).
- Region: `US · All` (default All; chips for EU/UK/JP/CN appear as tags in rows).

Counts in parentheses on each option. Filters persist in `localStorage` under `rng.calendar.filters`.

### 3.4 Mobile layout (< md)

Cards, not a scrolled table. One card per row, 2 lines:

```
┌──────────────────────────────────────────────┐
│ ● CPI (YoY)  INFLATION  US        in 8h 27m │  line 1: dot · title · tags · when
│ A 3.1%   F 3.0%   P 2.9%   ▕▌▏ +0.6σ  BTC ↓ │  line 2: A/F/P mono, mini surprise bar, read arrow
└──────────────────────────────────────────────┘
```

Tap expands the card (same inline expansion as desktop). Day headers stay sticky. The `read` sentence shows only in the expanded state on mobile.

### 3.5 Live event card integration

- `MacroEventCard` keeps its pre-release and post-release branches but loses the "Details" block duplication: transmission/regime/historical text moves into the expansion and the sources line moves to the calendar footer.
- Countdown stays `text-4xl` on desktop, `text-3xl` on mobile; it is the one hero number on the Macro tab.
- The card's border color follows importance (section 4.3), not red.
- `EventOddsInline` stays inside the card (it is the one place prediction odds are a decision input). The standalone `PredictionOddsPanel` becomes a collapsed `<details>` at the bottom of the Macro tab, titled "Prediction markets (Kalshi 32 · Polymarket 30)".

### 3.6 Color and typography rules for the table

- Importance dot: critical = brand color filled 6px; high = white/90 filled; medium = white/40 filled; low = white/25 outline. Importance is a *weight*, so it is encoded as luminance, not hue.
- Numbers: JetBrains Mono 12px, `tabular-nums`, right-aligned.
- Text: Inter 12px. Nothing under 11px; the kind and country tags are 10px uppercase eyebrow style with 0.08em tracking (allowed by the type scale as "eyebrow").
- Surprise bar: 4px tall, 2px radius, on a white/[0.06] track with a 1px white/20 zero tick.

---

## 4. Design-system spec for the signal pages

The dataviz skill was loaded before this section. Its palette validator was run on the brand colors against the dark surface `#0A0E17`.

### 4.1 Spacing scale (4px base, from the brand guide, applied)

| Token | px | Use on signal pages |
|---|---|---|
| `xs` | 4 | gap between chip and text, inside chips |
| `sm` | 8 | table cell padding (x), gap between chips, stat-tile internal gap |
| `md` | 12 | stat tile padding, card inner padding on mobile, grid gap |
| `lg` | 16 | card padding on desktop, gap between sections inside a tab |
| `xl` | 24 | gap between tabs content and the next block (track record) |
| `2xl` | 32 | top of page below navbar on mobile |

Card radius 12px (`rounded-xl`); the verdict and the live event card 16px (`rounded-2xl`); chips `rounded-md` (6px) for rectangular tags, `rounded-full` only for the ticker picker and segmented filters. Today both are mixed at random.

### 4.2 Type scale

| Role | Font | Size / weight | Where |
|---|---|---|---|
| Hero number | JetBrains Mono | 36px / 800, 32px on mobile | verdict price, live-event countdown. Exactly one per view. |
| Stat value | JetBrains Mono | 18px / 700 | stat tiles, KPI tiles (performance KPIs drop from 24 to 20) |
| Plan value | JetBrains Mono | 14px / 700 | plan tiles, table numbers |
| Table number | JetBrains Mono | 12px / 500, tabular | all tables |
| Body | Inter | 13px / 400, 1.45 | one-liner, why bullets, reads |
| Label | Inter | 11px / 500, white/50 | tile labels, table headers (uppercase, 0.08em) |
| Eyebrow | Inter | 10px / 600, uppercase, 0.14em | section titles ("ON THE BOARD"), group headers |
| Section title | Inter | 13px / 600, white/60, uppercase 0.06em | `SectionTitle` |
| Page title | Space Grotesk | 20px / 700 | venue name in the context bar |

Minimum readable size 11px. Delete `text-[9px]`.

### 4.3 Chip and badge vocabulary

All chips are `Chip` from `shared.tsx` with a `variant` prop. Height 20px, 6px radius, 10px eyebrow or 11px label text.

| Family | Values | Encoding |
|---|---|---|
| Direction | Long / Short / Stand aside | green fill 15% + green text / red / white 8% + white 70%. Always with the word. |
| Grade | A+ · A · B · C · NO TRADE | one neutral chip, white 8% bg; the *percent* sits inside: `A · 74%`. Grade is not colored. |
| Regime (trend) | Bull regime · Bear regime · Transition · Mixed | green / red / amber / gray text, 15% bg; strength suffix as a word (existing `strengthSuffix`). Weak = 55% opacity (existing). |
| Volatility regime | trending · transitional · ranging | white 8% bg, white 60% text. Never colored. |
| Importance | critical · high · medium · low | luminance dot (4.3 table in section 3.6) + optional word. Never red or blue. |
| Urgency (time) | ≥2h · <2h · <30m · <5m · now | text weight and brand accent: white/50 → white/90 → amber → brand → brand + pulse (only if motion allowed). |
| Kind tags | inflation · labor · fed · oil · growth · housing · treasury · sentiment | white 5% bg, white 50% text, 10px uppercase. No per-kind color. |
| Phase | upcoming · imminent · releasing · released · confirming · settled | white chip with the word; `releasing` and `confirming` get the brand border. |
| Verification | verified · awaiting · unverified · conflict | green / amber / gray / red text on 15% bg. This is a *status* family and may use red for conflict (status, not direction). |
| Warning | squeeze · catalyst risk · whipsaw · counter-trend · stretched | amber text on amber 10% bg with a Lucide icon. Amber means "caution" and nothing else. |
| Venue (prediction) | Kalshi · Polymarket | cyan / purple text only, the two categorical identities allowed on the page. |

Dropped: blue `#60A5FA`/`#3B82F6`, the five near-greens/near-reds in `dashboard.tsx:124-133` (use GREEN/RED with opacity 100/70/50 for strong/normal/slight), emoji.

### 4.4 Stat tile spec

```
┌────────────────────────────┐  SURFACE, 12px radius, px-3 py-2.5 (desktop px-4 py-3)
│ ◌ LABEL (11px/500/white50) │  icon 14px white/40, optional hint icon → popover
│ 48.2        (18px mono 700)│  value color: white/90 default; GREEN/RED only when the
│ Neutral  (11px white/45)   │  value itself is directional; AMBER when it is a warning
│ ▁▂▃▅▆▇  (optional 12-pt)   │  sparkline in white/35, last point brand
└────────────────────────────┘
```
Delta variant: `+1.4%` signed, GREEN/RED, 12px mono, placed right of the value. Meter variant (confidence, confirmation %): 4px track white/[0.06], fill = severity ramp (brand → amber → red), width = value. Do not color the number by the same ramp.

### 4.5 Chart color rules (validated)

Validator results on `#0A0E17`:
- Brand neon `#00FF88` (OKLCH L 0.88), amber `#F59E0B` (0.77), cyan `#22D3EE` (0.80) sit above the dark-mode lightness band (0.48 to 0.67). They are fine as *text and chips* (14:1 contrast) and wrong as *area fills and 2px lines* where they bloom on dark. The brand guide already defines `--primary-dim #00C466` (L 0.72, still high but usable for a single-series line) and the candle rule.
- Gray `#9CA3AF` fails the chroma floor as a *series* color (it is the correct de-emphasis color, not an identity).
- Categorical sets of 3 to 5 pass CVD and normal-vision separation: `#6366F1 / #A855F7 / #D97706` plus one green. There is no need for more than 3 series on any current chart.

Rules:
1. Single-series charts (equity curve, sparklines, confidence meter): line `#00C466` 2px, area fill `#00FF88` at 10% to 0 gradient (existing `eq` gradient at `PerformanceDashboard.tsx:268-271` uses 35% to 0; cut to 12%). Markers 8px with a 2px `#0A0E17` ring. No legend for one series.
2. Direction split (long vs short liquidations, bid vs ask): GREEN/RED at 85% opacity with a 2px surface gap between segments (`OrderFlowPanels.tsx:26-29` has none).
3. Diverging (surprise bar, factor score table): two arms from a neutral center, arm color white/60, extreme ≥ 50 amber. Not green/red, because economic surprise is not asset direction.
4. Sequential (reconnect probabilities, hit-rate heatmap by hour): one hue, white at 20/40/60/80/100% over the surface; label the cells.
5. Categorical identity (venue lines in the FOMC bars, future multi-asset reaction lines): fixed order `#6366F1`, `#A855F7`, `#D97706`; legend always present; never neon green as an identity color.
6. Status colors (GREEN good, AMBER warning, RED serious) are never used as series colors on the same chart.
7. Text wears text tokens: axis ticks `#9CA3AF` 11px, tooltip background `#111827` border white/10 (existing is fine).
8. Gridlines: 1px `rgba(255,255,255,0.06)`, solid, horizontal only.
9. Every chart ships a hover tooltip (crosshair for lines) and a table view fallback. The equity curve already has a tooltip; the plan is to add one to the ladder chart in Levels.

### 4.6 Motion rules

| Element | Motion | Reduced-motion |
|---|---|---|
| Section entrance | CSS fade 200ms + 8px rise, once per mount, not on tab switch (render tabs with `hidden` instead of unmount, or drop the fade on tab bodies) | none |
| Price change | background flash 600ms (`flash-gain/loss` exists in `globals.css:956-966`, unused on signal pages) | none |
| Live dot | one pulsing dot in the context bar, 2s | static dot |
| Countdown under 5m | text color only, no pulse | same |
| Chips | no `animate-pulse` anywhere (removes 9 instances) | |
| Card hover | border brighten 150ms, no translate on data cards (keep translate on hot cards) | no transition |
| Modal | 150ms scale 0.98 → 1 | fade only |

Implement with `useReducedMotion()` from framer where framer stays, and `@media (prefers-reduced-motion: reduce)` in `globals.css` for the keyframes (`pulse-live`, `hot-scroll`, `shimmer`, `ping`).

---

## 5. Wireframes

### 5.1 Signals page above the fold, desktop (1440)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ● Strike Signals   [BTC ▾ search]  CRYPTO BTC ETH BNB ADA HYPE … ▸   ● live 12s  (?) │  context bar, 44px
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ▌LONG▐  A · 74%   Bull regime · strong   counter-trend?                 Strike ↗ │ │  row 1
│ │ BITCOIN  $83,251  +1.21% 24h                                                     │ │  hero number 36px
│ │ Breakout retest holding above 83.2K with 4H and daily aligned; CPI in 8h caps size│ │  one-liner 13px
│ │ 15m ☁↑ 200↑   4h ☁–  200↑   1d ☁↑ 200↑                       → regime breakdown  │ │  regime strip (1 line)
│ │ ┌ENTRY────┐┌STOP─────┐┌T1───────┐┌T2───────┐┌T3───────┐┌R:R──────┐┌HORIZON──┐    │ │
│ │ │$83,251  ││$82,067  ││$84,434  ││$85,223  ││$86,407  ││1 : 1.7  ││~3h scalp│    │ │  plan, 7 tiles
│ │ │market   ││-1.4%    ││+1.4%    ││+2.4%    ││+3.8%    ││size 0.5x││limit ok │    │ │
│ │ └─────────┘└─────────┘└─────────┘└─────────┘└─────────┘└─────────┘└─────────┘    │ │
│ │ WHY (5↑ 3↓ of 10)                      │ WRONG IF   loss of $81,730 support  ↘  │ │
│ │ • EMAs stacked bullish; price > supertrend ↘│ FLIPS IF   4H close < 200MA + ADX<20 ↘│ │  flip line is new
│ │ • Daily structure map LONG (C, 25%)  ↘ │ NEXT        CPI (YoY) in 8h 27m · high ↘│ │
│ │ • 4H cloud / TK cross bullish        ↘ │ HISTORY     BTC 7 of 9 reached TP1   ↘ │ │
│ └──────────────────────────────────────────────────────────────────────────────────┘ │
│ ⚠ Catalyst risk: CPI in 8h, half size (only when not already in the one-liner)       │  alert slot, optional
│ [ LEVELS ] MOMENTUM  FLOW  MACRO  MODELS      Where to enter, where you're wrong…    │  tabs + purpose caption
│ ┌ chart (candles 15m, plan lines, walls) ────────────────────────┐┌ active setups ─┐ │
```

Fold at 900px lands at the tab bar. The verdict starts at y≈110 instead of 510.

### 5.2 Signals page above the fold, mobile (390)

```
┌────────────────────────────┐
│ ● Strike   [BTC ▾]   ● 12s │  44px
├────────────────────────────┤
│ ▌LONG▐ A·74%  Bull·strong  │
│ $83,251  +1.21%            │  32px hero
│ Breakout retest holding…   │
│ 4h ☁– 200↑ · 1d ☁↑ 200↑    │  (15m hidden)
│ ┌ENTRY──┐┌STOP───┐┌T1─────┐│
│ │83,251 ││82,067 ││84,434 ││
│ └───────┘└───────┘└───────┘│
│ ┌T2─────┐┌T3─────┐┌R:R────┐│
│ │85,223 ││86,407 ││1:1.7  ││
│ └───────┘└───────┘└───────┘│
│ WRONG IF  < $81,730     ↘  │  wrong-if and next come
│ NEXT      CPI in 8h 27m ↘  │  BEFORE the why bullets
│ WHY  • EMAs stacked… ↘     │
│      • Daily map LONG ↘    │
│      • 4H TK cross ↘       │
├────────────────────────────┤
│ [LEVELS] MOMENTUM FLOW ▸   │  ≈ y 700
│ ON THE BOARD  ▸ ETH LONG A │  board becomes a 1-row strip below tabs
└────────────────────────────┘
```

### 5.3 Macro tab (desktop)

```
┌ LIVE ───────────────────────────────────────────────────────────────────────────────┐
│ ● HIGH  CPI (YoY)  08:30 ET     Release in  00:12:41        forecast 3.0%  prev 2.9%│
│ EXPECTED IMPACT  BTC ↓ if above · ↑ if below   GOLD ↓/↑   WTI ↔   │ odds: Kalshi … │
│ What each outcome would mean   < 2.8 | 2.8–3.0 | 3.0–3.2 | > 3.2  (bands, BTC first)│
└──────────────────────────────────────────────────────────────────────────────────────┘
ECONOMIC CALENDAR   [High+ ▾] [This ticker ▾] [Both ▾] [All regions ▾]        sources ·
┌ UPCOMING ────────────────────────────────────────────────────────────────────────────┐
│ Tue Oct 14 · 2 high                                                                  │
│ 08:30  3h 41m  ● CPI (YoY)         INFLATION  ▮▮▮   —     3.0%   2.9%   ─┼─    BTC ↓?│
│ 14:00  9h 11m  ○ Treasury 10Y auct TREASURY   ▮▯▯   —     —      —      ─┼─          │
│ Wed Oct 15                                                                           │
│ 02:00  21h     ● CN  CPI (YoY)     INFLATION  ▮▮▯   —     0.4%   0.6%   ─┼─          │
├ RELEASED (last 2 days · show 5 more) ────────────────────────────────────────────────┤
│ Mon Oct 13                                                                           │
│ 10:00  2h ago  ● UoM Sentiment     SENTIMENT  ▮▮▯   46.3  47.6   48.1   ▬▬┼─  -1.3σ │  row expands:
│   ↳ Slightly weaker than expected · BTC +0.12% @15m confirmed · GOLD +0.03% · WTI … │  scenario bands,
│ 08:30  3h ago  ● Unemployment Clm  LABOR      ▮▮▯   197K  208K   199K   ─┼▬   +0.9σ │  reaction table
└──────────────────────────────────────────────────────────────────────────────────────┘
MARKET CATALYSTS   BEARISH -25  whipsaw   219 headlines · 72h          price $83,251 +1.8%
│ BULL  Adoption · "Strategy adds 250 BTC…"       ▬▬▬▬▬▬▬▬▬▬ 19% wt   +0.48%            │
│ BEAR  Exchange risk · "Tether freezes $10M…"    ▬▬▬▬▬▬▬▬▬▬▬▬▬▬ 47%  -0.31%            │
│ NET bearish -25 · price following adoption · FLIP: funds recovered, withdrawals normal │
│ ● Bitcoin rises above $83,000…   Pluang · 57m · GENERAL                     +0.36% ↗ │
│ ● NEAR Intents recovers $3.8M…   Pluang · 1h · EXCHANGE RISK                +0.34% ↗ │
│ ● South Korea blocks 27 crypto…  Cointelegraph · 1h · ONCHAIN               +0.57% ↗ │
│ show 15 more                                                                         │
NEWS SENTIMENT  neutral -3   (5 headlines, collapsed to 3)
▸ Prediction markets (Kalshi 32 · Polymarket 30)                                collapsed
```

### 5.4 Performance page (desktop)

```
┌ Signal Performance   [7d 30d 90d All] [Both Long Short] [A+ A B C] ☑ merge  Assets: All ADA BTC ETH ┐
│ ⚠ Provisional: 3 of 100 filled closed signals. Rates are a preview until 100 close.            │
│ Fill audit  3 filled · 0 awaiting · 0 unfilled · 0 unverifiable · 0 expired                     │
├ KPIs ───────────────────────────────────────────────────────────────────────────────────────────┤
│ TP1 HIT RATE │ EXPECTANCY │ PROFIT FACTOR │ STOPPED <TP1 │ MEDIAN TO TP1 │ OPEN NOW │ CALIBRATION│
│ 100%  n=3    │ n<20       │ n<20          │ 0.0%         │ —             │ 0        │ Brier 0.21 │  new tile (Phase 2)
├ Equity curve (cum R by close) ───────────────────────────┬ Target ladder ─────────────────────────┤
│  ▲ +12.4R                                                │ TP1  ████████████ 100%  n=3           │
│  │        ╱●                                             │ TP2  ████████████ 100%  n=3           │
│  │    ╱●                                                 │ TP3  ████████████ 100%  n=3           │
│  │●                       (line #00C466, fill 12%→0)     │ MFE +12.2R · MAE 0.0R · streak 3W     │
├ Calibration: stated vs realized ─────────────────────────┬ Breakdown [Symbol ▾] ──────────────────┤
│  realized │        ╱ perfect                             │ SYMBOL   n   TP1   EXP     W/L         │
│   100% ┤  ●55-64  ●65-74    (dots sized by n,           │ ADA      1   100%  +4.05R  1/0         │
│    50% ┤    ╱               greyed when n<8)             │ BTC      1   100%  +4.47R  1/0         │
│     0% ┼──╱──────── stated                               │ ETH      1   100%  +3.92R  1/0         │
├ Open signals (live progress) ─────────────────────────────────────────────────────────────────────┤
├ Signal log (40 rows, cards on mobile) ────────────────────────────────────────────────────────────┤
│ TIME   SYMBOL  BIAS  ENTRY    CONF   TARGETS                      R        MFE/MAE               │
│ 9d     ADA     LONG  $0.2449  74 C   TP1 ✓1d4h TP2 ✓ TP3 ✓        +4.05R   +12.21 / -0.00         │
```

The calibration block gains a reliability plot (stated confidence bucket on x, realized TP1 rate on y, diagonal reference, dot area = n) beside the existing table. Recharts `ScatterChart` with a `ReferenceLine`, no new dependency. Phase 2 will specify the Brier / log-loss tiles once the performance analysts report.

---

## 6. Implementation plan v1

Ordered by impact per effort. Effort: S < 2h, M half day, L 1 to 2 days. Risk is regression risk to existing behaviour.

| # | Change | Files | Effort | Risk |
|---|---|---|---|---|
| 1 | Move the hot board below the tabs as a 1-row strip; collapse the brand band into a 44px context bar with one countdown; delete the "Signals" h1 and the footer line | `dashboard.tsx:405-514, 1712-1725` | S | Low |
| 2 | Verdict: add "Flips if" (from `reco.confirmation`) and "Watch" (from `reco.butWatch`); put wrong-if/flips/next/history in a 4-row block; drop the confidence bar, put percent in the grade chip; drop the row-1 volatility chip; on mobile render the risk block before the why list | `VerdictCard.tsx:87-205`, `recommendation.ts` (no change, fields exist) | S | Low |
| 3 | Delete duplicated helpers in `dashboard.tsx` (lines 97-258) and import from `shared.tsx`; delete `RecommendationCard.tsx` | `dashboard.tsx`, `RecommendationCard.tsx` | S | Low |
| 4 | Extract `MacroTab.tsx` and `ModelsTab.tsx` from `dashboard.tsx:571-1707`; wrap all five tabs in `React.memo`; replace the custom tab bar with `components/ui/tabs.tsx` (keeps `#hash` sync and `ANCHOR_TAB`) | `dashboard.tsx`, new `tabs/MacroTab.tsx`, `tabs/ModelsTab.tsx` | M | Medium (jump links rely on section ids; keep ids) |
| 5 | Timer hygiene: `useNow(15_000)` in `NextEventsStrip`, `MacroEventCard`, `WeeklyOilCard`; countdown text via `LiveCountdown` leaf only; memoize calendar grouping | `MacroEventPanel.tsx:59-118, 141-246, 401-644, 742-761` | S | Low |
| 6 | Color vocabulary: new `Chip` variants (`direction`, `grade`, `regime`, `importance`, `urgency`, `kind`, `phase`, `verification`, `warning`, `venue`); replace blue, near-greens, emoji; red removed from urgency and importance | `shared.tsx:169-180`, `MacroEventPanel.tsx:44-55`, `dashboard.tsx:124-133, 604, 1324-1334, 1470-1473, 1516`, `RegimeStrip.tsx`, `HotBoard.tsx:37-61` | M | Low |
| 7 | Economic calendar v2 (section 3): groups, relevance column, surprise bar, filters, row expansion with `ScenarioRows` and reaction table, mobile cards; retire `NextEventsStrip` and `RecentResults`; collapse `PredictionOddsPanel` | `MacroEventPanel.tsx:120-325`, `lib/macro/service.ts` (add `relevance`, `assetDirection`, `zScore`, `isLive` to `CalendarRow`), `lib/macro/types.ts:CalendarRow` | L | Medium (API shape change; keep old fields) |
| 8 | Error and stale states: read `isError` for the three dashboard queries; stale styling after 90s using `FreshnessBadge`; hot-board skeleton timeout | `dashboard.tsx:323-361`, `HotBoard.tsx:134-156`, `components/freshness-badge.tsx` | S | Low |
| 9 | Accessibility: `GuideModal` on `ui/dialog.tsx`; `aria-pressed` on ticker and filter pills; `aria-label` on icon buttons; `focus-visible` ring class in `shared.tsx`; `focus()` the target in `scrollToSection`; Radix tooltip for `HINTS` and regime tooltips | `GuideModal.tsx`, `dashboard.tsx:460-507`, `shared.tsx:127-180, 263-282` | M | Low |
| 10 | Motion: remove `animate-pulse` on chips, keep one live dot; CSS fade instead of `motion.div` on sections; `prefers-reduced-motion` media rule in `globals.css` for all keyframes; no fade replay on tab switch | `globals.css`, `dashboard.tsx`, `shared.tsx:95-99`, all `motion.div` call sites | S | Low |
| 11 | Type and contrast floor: `text-[9px]` → 10px eyebrow or 11px; `text-white/25|30|35` labels → `/50`; `#6B7280` text only at ≥ 14px | sweep across `signals/**` | S | Low |
| 12 | Levels: price chart with plan lines and walls using the existing `TradingViewChart` (`components/tradingview-chart.tsx`, lightweight-charts) fed by `d.candles`; `sec-chart` anchor already exists in `recommendation.ts:25` | `tabs/LevelsTab.tsx`, `components/tradingview-chart.tsx` | M | Medium (chart sizing on mobile) |
| 13 | Models: factor table as a signed score bar (two arms, white/amber per 4.5 rule 3) with weight as a right-aligned number; EMA/RSI module cards keep layout | `dashboard.tsx:864-875` (then `tabs/ModelsTab.tsx`), `shared.tsx:200-216` | S | Low |
| 14 | Mobile: ticker picker becomes `search-command.tsx` on `< sm`; active-setups table becomes cards on `< md`; regime cards collapse rows 4-9 on `< sm` | `dashboard.tsx:460-487`, `LevelsTab.tsx:70-125`, `MomentumTab.tsx:47-111` | M | Low |
| 15 | Performance: reliability scatter beside the calibration table; breakdown tab select on mobile; equity fill 12%; inline "n<8" text | `PerformanceDashboard.tsx:257-283, 380-397, 115-126` | M | Low |
| 16 | Blur budget: `SURFACE` loses `backdrop-blur-md`; solid `rgb(var(--surface-rgb)/0.75)`; blur kept on context bar and verdict | `shared.tsx:18`, `HotBoard.tsx:90` | S | Low (visual change only) |

Sequencing: 1-3 and 10-11 first (one PR, mostly deletions), then 4-6 (structure and vocabulary), then 7 (calendar), then 8-9, 12-16. Items 7, 12 and 15 are the ones Phase 2 will extend with the analysts' metrics.

No new dependencies. Everything above uses Tailwind, shadcn primitives already in `src/components/ui`, lightweight-charts (already installed and wrapped), recharts (already used on the performance page) and Lucide.

---

# Final integrated design (Phase 2)

Date: 2026-10-13, after the master plan. Inputs: `MASTER-PLAN.md` (five phases, accepted scope), `audit-signal-engine.md`, `audit-performance-feedback.md`, `research-predictive-features.md`, `research-strategy-price-action-macro.md`, and the commits that shipped tonight (`7a98e24` engine 2026.10.13-feeds, `8ec089e` horizon inside the candle walk + atomic writes + token-gated restore, `128f44b` Economic Calendar table, `fba3543`/`bcca7ce` 141-event taxonomy). Everything below builds on that code and on the Phase 1 plan above; Phase 1 items are referenced as "P1-#".

Design rule for the whole section: a new engine feature earns screen space only in the form the research assigns it. Features the research classifies as *gates or sizing* (funding, DVOL, basis, session, event window, macro coupling) are shown as **state chips and multipliers**, never as directional votes. Features classified as *direction* (quarter-hour imbalance, real CVD, OI quadrant, tail skew) are shown as **signed evidence** in the tab that owns them and surface in the verdict only through the "Why" list. Calibrated probability replaces raw confidence as the headline number as soon as it exists, with raw confidence demoted to a tooltip.

## F1. Verdict card v2

### F1.1 Data contract (engine to UI)

New or changed fields on `SignalsResponse` (`src/app/signals/types.ts`). Nullable until the producing phase ships; the card renders a fallback for every null.

| Field | Type | Source phase | Fallback when null |
|---|---|---|---|
| `call.pTp1` | `number \| null` (0..1) | Phase 1.3 calibration (Platt on `weightedScore`), gated at n >= 100 decided on the current engine version | Show `confidence` with label "evidence strength", tooltip "calibrated probability appears after 100 decided calls on engine {version}; {n} so far" |
| `call.pTp1Ci` | `[lo, hi] \| null` | same | none |
| `call.confidenceRaw` | `number` | Phase 1.2 (logged anyway) | tooltip only |
| `call.calibrationVersion` | `string \| null` | Phase 1.3 | none |
| `call.invalidation` | `{ level: number; kind: "stop" \| "regime" \| "structure"; reason: string }` | engine audit 5.3 (stop + structural reason first, counter-regime condition second) | current `invalidates[0]` |
| `call.flips` | `{ text: string; factor: string; distance: number; direction: "to_long" \| "to_short" \| "to_wait" }[]` (two smallest) | engine audit 5.2 `flipDistance` | `reco.confirmation` / `reco.butWatch` (P1-2) |
| `call.expectedHold` | `{ medianMin: number; p25Min: number; p75Min: number; n: number; tf: "15m" \| "1h" \| "4h" \| "1d" }` | Phase 2.3 horizon-by-TF + perf #7 hold-time stats, bucketed symbol x bias x regime from the latest backtest JSON and the live ledger | current `expectedDuration` string, labelled "estimate" |
| `call.horizonMin` | `number` | Phase 2.3 (12/36/96h) | 24h |
| `call.mode` | `"trend" \| "reversion" \| "standby"` | Phase 2 mode-select (`--mode-select regime`, R1.1) | none (chip hidden) |
| `call.blocks` | `{ trend: number; timing: number; flow: number }` (-100..100 each) | Phase 2.10 TREND/TIMING/FLOW collapse | none |
| `call.eventWindow` | `{ state: "none" \| "pre" \| "blackout" \| "releasing" \| "post"; eventId: string; title: string; importance: Importance; minutesTo: number; minutesLeft: number; sizeMultiplier: number; stopMultiplier: number; firstMoveGate: "pending" \| "confirmed" \| "failed" \| null }` | Phase 3.2 universal event gate | none |
| `call.sizing` | `{ final: number; parts: { key: string; mult: number; reason: string }[] }` (event, session, weekend, counter-trend, funding, DVOL, decay guard) | Phase 2.8, 3.2, 4.1, 4.3 | current `sizeMultiplier` |
| `regime.macroCoupling` | `{ corr30d: number; mult: number }` | Phase 3.3 | none |
| `degraded` | `string[]` (feed names) | engine audit 4.8 | `[]` |
| `features` | see F2 | Phase 4 | per-feature null |

### F1.2 Layout (desktop, replaces the P1 5.1 wireframe)

```
+--------------------------------------------------------------------------------------+
| |LONG|  A . 61% TP1 [57-66]   TREND   Bull regime . strong              Strike ->    |  row 1
| BITCOIN  $83,251  +1.21% 24h                              ! feeds down: macro        |  hero 36px + degraded
| Breakout retest holding above 83.2K with 4H and daily aligned; CPI in 8h caps size   |  one-liner
| 15m cloud^ 200^   4h cloud-  200^   1d cloud^ 200^ . coupling 0.6       -> regime    |  regime strip
| [ EVENT WINDOW . PRE . CPI (YoY) in 8h 27m . size x0.5 from T-60m . no entry T-30m ] |  event-window bar (only when state != none)
| +ENTRY----+ +STOP-----+ +T1-------+ +T2-------+ +T3-------+ +R:R TP2--+ +HOLD----+ +SIZE--+
| |$83,251  | |$82,067  | |$84,434  | |$85,223  | |$86,407  | |1 : 1.7  | |~3h 40m | |x0.5  |  plan, 8 tiles
| |market   | |-1.4%    | |+1.4%    | |+2.4%    | |+3.8%    | |min 1.5 v| |p25 2h  | |event |
| |         | |4h swing | |         | |         | |         | |         | |p75 7h  | |+wknd |
| +---------+ +---------+ +---------+ +---------+ +---------+ +---------+ +--------+ +------+
| WHY (trend 62 . timing +18 . flow +9)        | WRONG IF   4H close < $81,730 (swing   |
| . 4H and daily above cloud and 200MA   ->    |            low behind stop, 0.5 ATR) ->|
| . Quarter-hour imbalance +0.31, held 3 ->    | FLIPS IF   flow block < -20 (CVD slope |
| . Real CVD rising with OI (new longs)  ->    |            turns) . or 4h ADX < 20  -> |
|                                              | NEXT       CPI (YoY) 8h 27m . high .   |
|                                              |            market mean 3.05 vs 3.0  -> |
|                                              | HISTORY    BTC long in Bull: 9/14 TP1  |
|                                              |            [43-83%] . median 3h 40m -> |
+--------------------------------------------------------------------------------------+
```

Row by row:

1. **Row 1.** Direction chip (unchanged). Grade chip now reads `A . 61% TP1` where the percent is `pTp1`; the interval `[57-66]` sits inside the chip at 10px white/60. When `pTp1` is null the chip reads `A . evidence 74` with the tooltip from F1.1; "evidence" is deliberately not "confidence" (perf audit 6.5). Mode chip: `TREND` / `REVERSION` / `STANDBY` in the volatility-regime style (white 8% bg, never colored); tooltip "strategy family chosen by regime and ADX: {reason}". Regime chip unchanged. The `Strike ->` venue link moves here from the brand band.
2. **Degraded feeds.** Amber warning chip `feeds down: macro, order flow` from `degraded[]`; tooltip lists the effect ("macro weight removed from the denominator"). Hidden when empty.
3. **Regime strip** gains one chip on the far right: `coupling 0.6` (macro coupling multiplier, white/60, tooltip "30-day BTC/SPX correlation 0.62; macro and event weights scaled by 0.6"). Hidden for lenses other than BTC, GOLD and WTI.
4. **Event-window bar.** Full-width 32px bar directly under the regime strip, rendered only when `eventWindow.state !== "none"`. Four states, one visual each:

| State | Left label | Body | Border / bg | Timer |
|---|---|---|---|---|
| `pre` (T-120m to T-60m) | `EVENT WINDOW . PRE` | `{title} in {minutesTo} . size x{sizeMultiplier} from T-60m . no new entries from T-30m` | white/10 border, no tint | `LiveCountdown` 15s tick |
| `blackout` (T-30m to T+10m) | `NO ENTRY` | `{title} {releasing in / released} {m}m . calls paused until T+10m` | amber 40% border, amber 8% bg | 1s tick on the number only |
| `releasing` (T+0 to T+10m) | `RELEASING` | `{title} out . first-5-minute gate: {pending / confirmed +0.8% / failed -0.3%}` | brand border | 1s |
| `post` (T+10m to T+60m BTC/Gold, T+2 to T+15m WTI) | `POST WINDOW` | `{minutesLeft}m of event lean left . size x0.5 . stop x1.3 . confirmation {confirming/fading/reversing}` | white/10 border; `reversing` turns the confirmation word red (status, not direction) | 15s |

The bar links to the live row in the calendar (F3). No red for urgency; blackout is amber because it is a warning, releasing uses the brand accent because it is live.

5. **Plan tiles.** Eight tiles at `grid-cols-4 sm:grid-cols-8`, mobile 2 rows of 4. Changes: STOP tile sub-line shows the anchor (`4h swing`, `1h swing`, `AVWAP`) from Phase 2.9; the R:R tile is labelled `R:R TP2` and shows `min 1.5 v` or `below min` in amber (Phase 2.7 gate); the new HOLD tile shows `expectedHold.medianMin` as the value with p25/p75 under it and `n` in the tooltip, falling back to `estimate ~3h` in white/50; the new SIZE tile shows `sizing.final` as `x0.5` with the two largest reasons under it (`event`, `+wknd`), amber when < 1, white when 1, and the full parts list in the tooltip.
6. **Why column.** Header shows the three block scores `trend 62 . timing +18 . flow +9` (mono, signed, white/60) when `call.blocks` exists, replacing the `5 up 3 down of 10` tally. Bullets stay as jump links; Phase 4 features appear here only when they are among the top three reasons by weight.
7. **Right column (four fixed rows, always in this order).** WRONG IF = `invalidation.level` formatted as a price plus the `reason` in white/60 and the kind as a 10px tag (`stop`, `regime`, `structure`). FLIPS IF = up to two `flips[]` entries joined by " . or ", each a jump link to the factor's section. NEXT = next catalyst with importance word, relevance bars, and when a prediction-market implied mean exists, `market mean 3.05 vs 3.0` (F2.1) in mono. HISTORY = `BTC long in Bull: 9/14 TP1 [43-83%] . median 3h 40m`, the pair bucket with Wilson interval and median hold, linking to the performance page filtered to that symbol and regime; below n=8 the row reads `BTC: 3 decided, too few to rate` and never shows a percentage.

Mobile keeps the P1 5.2 order (risk block before the why list); the event-window bar collapses to two lines; plan tiles 2x4; HISTORY and the block scores drop to the tooltip.

### F1.3 Color and state rules specific to v2

- The `pTp1` number is white/90, never green/red; the grade chip stays neutral. Probability is a magnitude, not a direction.
- Interval widths wider than 25 points (small n) render the number at white/60 with a `low n` tag.
- The mode chip is uncolored; `STANDBY` sets the whole plan grid to 60% opacity like today's inactive plan.
- The event-window bar replaces the alert slot for catalyst-risk alerts (P1 1.3 duplication); the alert slot keeps squeeze, whipsaw and absorption only.
- Stale: when the signal timestamp is older than 90s the hero price dims to white/60 and a `last scan 3m ago` chip appears; when older than the engine's 15-minute cadence the direction chip gets a dashed border and the tooltip says "no fresh scan; do not act".

## F2. Where each Phase 3-4 feature lives

Shared conventions for every feature tile: label 11px white/50, value mono 18px (tiles) or 12px (rows), direction color only when the research says the feature is directional, z-scores formatted `+1.8 sd`, percentiles `82nd pct`. Empty = feature object null, so the tile renders value `-` and sub `feed off` at white/40 (never hidden, so a missing feed is visible). Stale = `asOf` older than 3x the feed's TTL, so the value drops to white/50 with a `stale {age}` tag in amber. All feature objects carry `{ value, asOf, ttlMs }`.

`features` field on `SignalsResponse`:

```ts
features?: {
  funding: { z: number; rate8h: number; venues: { hl: number; binance: number | null; bybit: number | null }; spreadRatio: number; crowded: "long" | "short" | null } | null
  oi: { change24hPct: number; sd: number; quadrant: "new_longs" | "short_cover" | "new_shorts" | "long_flush" | null; priceChange24hPct: number } | null
  cvd: { cum4hUsd: number; slope1hUsd: number; takerRatio1h: number; qhImbalance: number | null; qhReadings: number[] } | null
  book: { imbalance: number; band: number } | null
  vol: { dvol: number; dvolPct: number; expectedMove24hPct: number; expectedMove24hUsd: number; change24hPct: number } | null
  basis: { annPct: number; z: number; curveSlope: number; stress: boolean } | null
  macroRates: { realYield10y: number; realYield5dChgBp: number; dxy: number; dxy5dChgPct: number; corr30d: number; gated: boolean } | null
  stablecoins: { supply7dChgPct: number; z: number; usdtMint24hUsd: number; flag: "tailwind" | "headwind" | null } | null
  session: { name: "asia" | "london" | "us" | "off"; volScale: number; weekend: boolean; haircutPct: number; gate: "none" | "late_utc" | "nonc_weekend" }
  macroCoupling: { corr30d: number; mult: number } | null
}
```

| # | Feature | Location | Visual form | Color rule | Empty / stale |
|---|---|---|---|---|---|
| F2.1 | Prediction-market implied mean, SD and tail skew (`printImpliedMean/Sd`, `printTailSkew`, `fedExpectedChangeBp`) | (a) Calendar row Expect. cell (F3); (b) live event card "Expectations" block; (c) verdict NEXT row | The Expect. cell shows two stacked values: `3.0%` consensus (mono white/70) and `3.05% <>` market mean (mono white/90, `<>` glyph = Kalshi/Polymarket), with `sd 0.09` under it. Tail skew as a 48px two-arm bar labelled `skew +0.12` (longer above-arm = upside miss priced). Fed rows show `E[d] -22bp . sd 7bp` in place of the ladder. The event card gets an "Expectations" row: consensus . market mean . blended (0.6/0.4) . SD source (`market, $140k` or `prior 0.10`). | Skew bar white/60 arms, amber beyond +/-0.25. The `<>` glyph takes the venue color (cyan Kalshi, purple Polymarket). Never green/red: skew is a surprise prior, not an asset direction. | No market or volume < $50k: consensus only, glyph absent, tooltip "no liquid market". Odds older than 24h or > 14 days out: shrunk value with a `shrunk` tag. |
| F2.2 | `fundingZ` + venue spread | Flow tab, Positioning section, first tile; mini chip on the verdict SIZE tile when it contributes a multiplier | Stat tile value `+2.1 sd`, sub `0.018%/8h . crowded long`; second line three venue dots `HL . Bin . Byb` with a `spread 2.4x` tag. Replaces the fixed-threshold Funding rate tile at `FlowTab.tsx:106-108` (keep the raw rate in the sub). | Magnitude only: white/90; the word `crowded` in amber. No green/red (funding is not a direction vote, do-not list). | `-` / `feed off`; venue dots grey when a venue is null (Binance via HL `predictedFundings`). |
| F2.3 | Real CVD, OI quadrant, book imbalance | Flow tab, new section "Order flow score" between Volume and Positioning, replacing the candle-colour CVD tile at `FlowTab.tsx:58` | Three tiles + one 4-quadrant glyph. CVD tile: value `cum 4h +$12.4M`, sub `slope 1h +$3.1M`, 12-point sparkline of 15m CVD (white/35, last point brand). Quarter-hour tile: value `+0.31`, sub `EMA of last 4 . 4-12h horizon`, four small bars for the readings. OI quadrant glyph: 2x2 grid with axes `price d24h` / `OI d24h`, the active cell filled and labelled `new longs`, inactive cells white/5; below it `OI +6.1% (1.3 sd) . price +2.0%`. Book imbalance stays in the Order book panel (unchanged) and feeds the FLOW block only. | CVD and quarter-hour values are directional: green/red by sign (direction features per research 1.4). OI quadrant cell: `new_longs`/`new_shorts` = continuation, filled with the direction color at 15%; `short_cover`/`long_flush` = fade, filled amber 15% with the word "fade". | CVD null: tile `-`, sub `OKX taker feed off`; quarter-hour null: `waiting for :15 boundary` with a countdown to the next boundary. OI sd < 1: quadrant unfilled with the caption `inside +/-1 sd`. |
| F2.4 | DVOL expected move, basis/curve stress | Momentum tab, new section "Volatility state" above Technical indicators (DVOL and basis are BTC/ETH only; section hidden otherwise). Expected move also appears on the Levels chart as a shaded band around price. | DVOL tile: value `54.2`, sub `82nd pct . 24h +9%`; Expected move tile: value `+/-2.84%` with `+/-$2,366` under it; Basis tile: value `+5.2% ann`, sub `z +0.4 . curve +1.1`; Stress chip: `BACKWARDATION` warning chip when `stress` is true, tooltip "front future below index: event or funding stress; confidence haircut applied". On the chart: two hairlines at price +/- expected move, labelled `1 sd 24h`. | DVOL percentile >= 80: value amber (warning: wider stops); < 20: white/60 with a `compressed` tag. Basis never green/red; stress chip amber. | `-` / `Deribit off`. Expected-move band hidden on the chart when null. |
| F2.5 | Real yield and DXY 5-day change (gated by correlation) | Macro tab, new "Rates & dollar" strip under the live event card, BTC and GOLD lenses only | Two stat tiles + gate chip: `10y real 2.91% . 5d +8bp` and `DXY 103.4 . 5d -0.6%`; gate chip `corr30d -0.41 . active` or `corr30d -0.12 . silenced`. A 20-point sparkline of each series (white/35). | Changes colored by *effect on the lens asset* (-corr x change): gate active and product positive for the asset = green; negative = red; silenced = white/50 and no color. Tooltip explains the sign. | Treasury XML missing: `-` with `Treasury feed off`; `gated: true` with corr below 0.3: tiles at white/50, chip `silenced`. |
| F2.6 | Stablecoin supply and USDT mint | Flow tab, Market data grid (crypto only), replacing the dead ETF flow tile at `FlowTab.tsx:115` | Tile: value `+1.8% 7d`, sub `+1.2 sd . tailwind`; second tile `USDT mint 24h $650M` with a `>= $500M flag` tag when active. Daily cadence stated in the sub (`daily . DefiLlama`). | Flag words `tailwind`/`headwind` in green/red at 70% opacity (slow directional feature per research 1.9); the number itself white/90. | `-` / `DefiLlama off`; stale beyond 12h shows `stale 14h`. |
| F2.7 | Session and weekend sizing state | Context bar (right of the freshness chip), and the SIZE tile parts on the verdict | Context-bar chip `US session . vol x1.3` / `Asia . x0.8` / `Weekend . x0.7 . size x0.5`; when the 21-24 UTC gate is active for crypto: `late UTC . entries gated`; non-crypto weekend: `market closed . WAIT`. | White/60 default; gates in amber. | Always present (clock-derived, never null). |
| F2.8 | Macro coupling multiplier | Regime strip chip (F1.2 row 3) and the Macro tab header (`coupling 0.6 . corr30d 0.62`) with a 30-point sparkline of the rolling correlation | Chip + sparkline. | White/60; when `mult` < 0.3 the Macro tab header gains the caption "macro features mostly silenced in this regime". | Null: chip hidden; the Macro tab header says `coupling n/a`. |
| F2.9 | Headline engine changes (GENERAL rule excluded from net, `confirms` weighting, exponential decay) | Catalyst panel on the Macro tab (existing) | Each headline row gains a `confirms v / x / -` glyph and its decayed weight as a 10px mono `w 0.42`; GENERAL headlines render with a `price-report . not scored` tag at white/40. | v green, x red (verification statuses, allowed), `-` white/40. | Unchanged. |
| F2.10 | Shadow calls (declined) | Not on the signal page. Performance page internal card only (F4.3). One 10px line under the verdict for WAIT states: `declined: lean long 57 (below 60) . logged as shadow` | Text line. | White/40. | Hidden when no shadow record exists. |

## F3. Economic Calendar v2 final spec

Supersedes P1 section 3 where they differ. `CalendarRow` additions in `lib/macro/types.ts`, produced in `lib/macro/service.ts`:

```ts
export interface CalendarRow {
  // existing: id, defId, title, time, importance, kind, country, forecastRaw, forecastSource, previousRaw, actualRaw, released, read, score
  relevance: Record<MacroAsset, number>          // from MacroEventDef.relevance
  lensRelevance: number                           // relevance[lens] after macroCoupling.mult
  assetDirection: Direction | null                // lens asset: expected (pre) or observed-at-latest-sample (post)
  assetDirectionBasis: "expected" | "observed" | null
  zScore: number | null                           // surprise z against the blended anchor
  zAnchor: "consensus" | "market" | "blended" | null
  isLive: boolean                                 // id === state.active?.event.id
  market: { mean: number | null; sd: number | null; tailSkew: number | null; venue: "kalshi" | "polymarket" | null; volumeUsd: number | null; asOf: string | null; shrunk: boolean } | null
  fed: { expectedChangeBp: number; surpriseSdBp: number; modalLabel: string; modalProb: number } | null
  reaction: { label: ReactionLabel; lensMovePct: number | null; confirmation: ConfirmationStatus | null } | null
  firstMoveGate: "pending" | "confirmed" | "failed" | null
}
```

### F3.1 Columns (desktop, final)

| Col | Width | Content |
|---|---|---|
| When | 88px | time; countdown chip (upcoming) or `2h ago` (released); the live row shows the event-window state word instead |
| Release | flex | importance dot (luminance) . country tag . title . kind tag . `<>` market-coverage glyph when `market` exists |
| Rel. | 44px | 1-3 bars from `lensRelevance`; dimmed (white/25) when `macroCoupling.mult` < 0.5, tooltip "scaled by coupling" |
| Actual | 72px | mono bold; `awaiting` amber chip; `-` |
| Expect. | 96px | two-line cell: consensus (white/70) over market mean `<>` (white/90) with `sd` under it; the anchor used for z is underlined dotted |
| Prev. | 64px | mono white/70 |
| Surprise | 112px | diverging bar from the blended anchor; z chip `+1.8 sd`; the tail-skew mini bar (pre-release only, 2px, white/40) sits on the same track as a hollow marker so the reader sees "priced skew" before and "realized surprise" after in one place |
| Read | flex | `read` text; prefix `{lens} up/down` colored by `assetDirection`, with `(expected)` or `(observed @15m, confirmed 75%)` from `reaction` |

Row expansion (click or Enter): `ScenarioRows` with the actual's band marked, the reaction table, the Expectations block (consensus . market . blended . SD source . tail skew), and for Fed rows the bucket bars. The live row renders `MacroEventCard` inline in place of the row (P1 3.1).

### F3.2 Filters and grouping

As P1 3.3 plus one: a `Market-covered only` toggle (rows with `market != null`). Groups: Live / Upcoming / Released. `RecentResults` and `NextEventsStrip` retire; their anchors (`sec-macro-strip`, `sec-macro-results`) are kept as aliases pointing at the calendar so `recommendation.ts` links do not break.

### F3.3 Mobile card

```
+----------------------------------------------+
| o CPI (YoY)  INFLATION  |||        in 8h 27m |
| A -   C 3.0%   M 3.05% <> sd.09   skew |> +.12|
| BTC down if above . up if below              |
+----------------------------------------------+
```

`C` consensus, `M` market mean. After release line 2 becomes `A 3.1%  C 3.0%  M 3.05%  ==|-  +0.6 sd` and line 3 `BTC down -0.4% @15m . confirmed`.

### F3.4 Macro tab final order

1. Live event card (only when live) with the Expectations block and the first-5-minute gate state.
2. Rates & dollar strip (BTC/GOLD) with the coupling sparkline (F2.5, F2.8).
3. WTI only: Weekly crude inventories card (unchanged) with its event window shortened to 30 minutes in the copy.
4. Economic Calendar v2.
5. Market catalysts (headline engine, F2.9), capped at 3 rows + "show more".
6. News sentiment, collapsed to 3 rows.
7. `<details>` Prediction markets (full ladders), collapsed.

## F4. Performance page v2

### F4.1 Data contract additions (`PerformanceStats`, `src/app/api/signals/history/performance.ts`)

```ts
kpis: {
  ...existing,
  expectancyNetR: number | null; profitFactorNet: number | null; sumNetR: number | null
  costModel: { venue: string; takerBps: number; makerBps: number; slipBps: number; fundingApplied: boolean }
  maxDrawdownR: number | null; maxDrawdownNetR: number | null; longestUnderwaterDays: number | null
  seExpectancyR: number | null                       // SD(R)/sqrt(n)
  fillRate: { market: number | null; limit: number | null; nMarket: number; nLimit: number }
  expiryRate: number | null; medianHoldMin: { winners: number | null; losers: number | null }
}
rHistogram: { bin: string; n: number; netN: number }[]   // -3..+5R in 0.5R bins
calibration: {
  byConfidence: CalBucket[]; byGrade: CalBucket[]; byRr1: CalBucket[]; byPTp1: CalBucket[]
  // CalBucket = Bucket + { meanConf, wilsonLo, wilsonHi, pPos, meanNetR, brierNaive, brierCal }
  brier: { naive: number; calibrated: number | null; base: number; bss: number; bssCalibrated: number | null; reliability: number; resolution: number; uncertainty: number; n: number }
  platt: { a: number; b: number; n: number; holdoutBrier: number; fitAt: string; version: string } | null
}
components: { name: string; nAgree: number; nDisagree: number; pWinAgree: number | null; pWinDisagree: number | null; lift: number | null; liftLo: number | null; liftHi: number | null; weight: number; candidateWeight: number | null }[]
shadow: { byClass: { key: "wait_lean" | "htf_blocked_short" | "regime_blocked" | "event_gated"; n: number; tp1Rate: number | null; wilsonLo: number | null; wilsonHi: number | null; expectancyR: number | null }[]; note: string }
versions: { version: string; firstAt: number; lastAt: number; n: number; netR: number | null }[]
ledger: { url: string; csvUrl: string; sha256: string; hashedAt: string; bytes: number }
changelog: { at: string; commit: string; title: string; effect: string }[]
```

Per-call audit record (`GET /api/signals/history/:id`): `{ signal, inputs: { weightedScore, confidenceRaw, components: Record<name,{score,weight}>, rr1, rr2, rr3, entryType, atrPct, fundingRate, minutesToNextEvent, tuning, gateNotes, engineVersion, calibrationVersion, blocks?, mode?, eventWindow? }, resolution: { firstEligibleCandle, fillCandle, fillPrice, tpTouches: {level, at, price}[], stopTouch, horizonEnd, closedReason, grossR, netR, costR, coverageGap, reasonText } }`.

### F4.2 Layout

```
+ Signal Performance  [7d 30d 90d All] [Both Long Short] [A+ A B C] [Net o Gross]  [x] merge +
| ! Provisional: 3 of 100 filled closed. Rates are previews. Engine 2026.10.13-feeds since Oct 13.|
| Fill audit  3 filled . 0 awaiting . 0 unfilled . 0 unverifiable . 0 expired   fill rate mkt 92% . lim 61%|
+ KPIs (8) ------------------------------------------------------------------------------------+
| TP1 HIT     | EXPECTANCY   | PROFIT F.  | MAX DD      | STOPPED <TP1| MED. TO TP1| BSS        | OPEN   |
| 100%        | +0.18R net   | 1.22 net   | -4.2R net   | 33% [12-65] | 3h 40m     | -0.04      | 2      |
| [44-100] n=3| +0.24R gross | 1.29 gross | -3.6R gross |             | n=12       | Brier .252 | streak |
+ Equity curve (net, gross as ghost line) ---------------+ R histogram (net) ----------------------+
|  +12.4R ---- net   ..... gross                          |  _.=#=._..   -3 ... +5R, 0.5R bins       |
+ Calibration -------------------------------------------+ Reliability plot ------------------------+
| Band  n  conf  TP1  [Wilson]  P(R>0)  netR  Brier       | realized ^      o 65-69                 |
| 60-64 41 62   44%  [30-59]   51%    +0.11  .247         |          |    o60-64    diagonal        |
| 65-69 22 66   50%  [31-69]   55%    +0.21  .250         |          +-------> stated / pTp1        |
| A     12 ...                                            |  dots area = n, grey when n<8            |
| rr1<1 ...  1-1.5 ...  >2 ...                            |  toggle: stated conf . calibrated pTp1   |
| Brier naive .252 . base .250 . BSS -0.04 . rel .006 . res .004 . unc .248 . n 63               |
+ Components (reliability per factor) -------------------+ Shadow calls (declined, not in stats) ---+
| FACTOR     w     n     P(win|agree) [CI]  P(win|dis) lift| CLASS            n   TP1 [CI]   exp R   |
| regime    .05    58   49% [37-62]   38%   +0.11 o      | WAIT lean 55-59  31  39% [24-57] -0.08 |
| momentum  .11    61   44% [32-56]   47%   -0.03        | HTF-blocked short 14  29% [11-55] -0.31 |
| ...                                                     | regime-blocked   9   ... too few         |
+ Breakdown [Symbol v] ----------------------------------+ Engine versions -------------------------+
| existing BucketTable + Wilson column                    | VERSION           FROM     TO     n  netR|
|                                                         | 2026.10.13-feeds  Oct 13   now    3  +.. |
|                                                         | 2026.10.12-regime Oct 12   Oct 13 ..     |
+ Open signals (fill window left . last check candle) -----------------------------------------+
+ Signal log ----------------------------------------------------------------------------------+
| TIME SYMBOL BIAS ENTRY  pTP1/CONF TARGETS            R net (gross)  MFE/MAE   > audit          |
| ..   ADA    LONG $0.2449 - / 74 C  TP1v TP2v TP3v     +3.91 (+4.05)  +12.2/-0  >               |
|   "Reached TP3 at 0.2611 on Oct 4 23:50 UTC, 1d 4h after fill; horizon 24h." (reasonText)      |
+ Ledger --------------------------------------------------------------------------------------+
| Download JSON . CSV   SHA-256 a91f...c2 (hashed daily 00:05 UTC) . 3 records . 41 KB           |
+ Methodology changelog -----------------------------------------------------------------------+
| Oct 13 8ec089e Horizon enforced inside the candle walk; late evaluations no longer credit post-horizon touches |
| Oct 13 7399b3f Expired no-verdict signals excluded from hit rate                                |
| Oct 05 9581570 Fill model: market vs limit, fill windows                                        |
+----------------------------------------------------------------------------------------------+
```

### F4.3 Element specs

- **Net/Gross toggle** (header, segmented, default Net once the cost model ships). Every R-denominated number shows net as the value and gross in the sub-line in white/50 (`+0.24R gross`). The equity chart draws net as the 2px `#00C466` line with 12% fill and gross as a 1px dotted white/35 ghost line; legend present (two series). Cost model shown in a tooltip on the toggle: `Strike: taker 5bp, slip 3bp, funding applied`.
- **Wilson CIs** everywhere a rate appears: `44% [30-59]` with the bracket at 11px white/60. Color rule (perf audit 6.4): no green/red on a rate when n < 30; between 30 and 100 color only when the interval excludes the base rate; the thresholds at `PerformanceDashboard.tsx:106` and `:242` are replaced by that rule.
- **Brier / BSS tile** in the KPI row: value `BSS -0.04` (white/90; green only when > +0.05 with n >= 100; red only when < -0.05 with n >= 100), sub `Brier .252 . base .250`. Tooltip: the Murphy decomposition line. A second line in the calibration card shows calibrated vs naive once `platt` exists.
- **Reliability plot**: recharts `ScatterChart`, x = mean stated confidence (or `pTp1` via toggle), y = realized TP1 rate, `ReferenceLine` diagonal white/20, dot radius from `n` (8px to 20px), fill `#6366F1` (categorical slot, not neon), grey when n < 8, 2px surface ring, Wilson bars as `ErrorBar`. Tooltip: band, n, rate, interval. Single series, so no legend; the toggle acts as the title.
- **R histogram**: recharts `BarChart`, bars <= 24px, 4px rounded tops, 2px gaps, fill `#6366F1`; the zero bin edge marked with a hairline; bars for net by default and gross via the same toggle. Share beyond +2R and the SE of expectancy printed under it.
- **Drawdown**: KPI tile `MAX DD -4.2R` with `longest underwater 6d` sub; on the equity chart a white/10 shaded span over the drawdown period.
- **Components table**: columns factor, weight, n agree, P(win | agree) with CI, P(win | disagree), lift with a marker when the CI excludes zero; a `candidate weight` column appears only when `candidateWeight` exists and is labelled "display only, validated in backtest" (perf audit 3.3). Sorted by |lift|.
- **Shadow calls card**: separate card, dashed border (same treatment as the hot-board empty state), header `Shadow calls . declined by a gate . not in any public number`; one row per class with n, TP1 rate, CI, expectancy. Internal note from `shadow.note`. When n is 0 for every class the card collapses to one line.
- **Engine versions table**: version, from, to, n, net R; current version in white/90, others white/60; the provisional banner names the current version and its start date.
- **Signal log**: the `pTP1/CONF` column shows `61% / 74 A` once `pTp1` exists; the R column shows `+3.91 (+4.05)` net (gross); every row has a `> audit` chevron that opens the per-call drawer (shadcn `sheet.tsx`, right side, 480px, full-screen on mobile) with two tabs: *Inputs at call time* (key-value list of `inputs`, components as the same signed bar as the Models factor table, gate notes) and *Resolution* (timeline: first eligible candle, fill, each TP touch, stop or horizon, each with UTC time, price and R at that point; `reasonText` sentence at the top; coverage-gap warning if present). The row's plain-language `reasonText` also renders inline under the row on desktop and inside the card on mobile.
- **Open signals**: add `fill window: 1h 12m left` for pending fills and `last check: 12:30 UTC candle`; a stalled checker (> 15 min) shows an amber `checker stalled` chip.
- **Ledger card**: two download buttons (JSON, CSV via `?format=csv`), SHA-256 (first 8 and last 2 characters, full hash behind a copy button), hash time, record count and size. The hash is served by the same route as a header so the number on the page can be checked against the file.
- **Methodology changelog**: static list from `changelog[]` (date, short hash linking to GitHub, title, one-line effect); newest first; the three known entries seeded now.
- **Mobile**: KPIs 2x4; reliability plot and histogram stack; components and shadow tables become two-line cards; audit drawer full-screen.

## F5. Implementation plan v2 (merged, ordered PRs)

One list, UI and backend in parallel lanes. "Needs" names the fields a UI PR consumes so the backend PR can be built first or stubbed with nulls (every UI PR must render the null fallback). Effort S < 2h, M half day, L 1-2 days. Phase labels are master-plan phases.

| PR | Lane | Title | Files | Effort | Risk | Needs from engine/API |
|---|---|---|---|---|---|---|
| 01 | UI | Deletions and reorder: context bar, hot board below tabs, one countdown, footer fix, dedupe helpers, delete `RecommendationCard.tsx`, reduced-motion CSS, type/contrast floor (P1-1, 3, 10, 11) | `dashboard.tsx`, `shared.tsx`, `globals.css`, `RecommendationCard.tsx` | M | Low | none |
| 02 | UI | Verdict v2 skeleton: 8 plan tiles, 4-row risk block (WRONG IF / FLIPS IF / NEXT / HISTORY), mode chip slot, degraded chip, block-score header, all with null fallbacks (F1) | `VerdictCard.tsx`, `recommendation.ts` (expose `confirmation`, `butWatch`), `types.ts` | M | Low | optional: `call.invalidation`, `call.flips`, `call.expectedHold`, `call.mode`, `call.blocks`, `call.sizing`, `degraded` |
| 03 | BE | Phase 1.2 log inputs at call time + Phase 1.7 version hash, gap detection, one write per pass, archive | `logger.ts` (`SignalContext`), `engine.ts:4821`, `core.ts`, new archive module | M | Medium | produces `inputs` for PR 13 |
| 04 | BE | Phase 1.1 cost model + next-open fills; net R fields | `check/core.ts`, `performance.ts`, `backtest.ts` | M | Medium (changes headline numbers; changelog entry) | produces `expectancyNetR`, `profitFactorNet`, `costModel`, `costR` |
| 05 | BE | Phase 1.3 calibration table, Wilson, Brier/BSS, Murphy; Phase 1.5 drawdown, histogram, expiry/fill/hold stats; `versions[]` with date ranges | `performance.ts` (new `calibration()`, `wilson()`), `backtest.ts` | M | Low | produces F4.1 `calibration`, `rHistogram`, `kpis.*`, `versions` |
| 06 | UI | Performance v2 part 1: net/gross toggle, Wilson brackets and the n-based color rule, KPI row (8 tiles incl. MAX DD and BSS), R histogram, reliability scatter, versions table, provisional banner naming the version (F4.3) | `PerformanceDashboard.tsx`, new `performance/ReliabilityPlot.tsx`, `performance/RHistogram.tsx` | L | Low | PR 04, PR 05 fields (renders `-` or hides until present) |
| 07 | UI | Tab extraction (`MacroTab.tsx`, `ModelsTab.tsx`), `React.memo`, shadcn tabs, timer hygiene, chip vocabulary variants, blur budget (P1-4, 5, 6, 16) | `dashboard.tsx`, `tabs/*`, `shared.tsx`, `MacroEventPanel.tsx`, `RegimeStrip.tsx`, `HotBoard.tsx` | L | Medium (section ids must survive) | none |
| 08 | BE | Phase 3.1 prediction-market conversions + Phase 3.4 SD refresh/gold asymmetry; `CalendarRow` v2 fields (F3) incl. `market`, `fed`, `zAnchor`, `relevance`, `lensRelevance`, `assetDirection`, `reaction`, `isLive` | `lib/prediction/ladder.ts`, `lib/macro/{service,surprise,taxonomy,types}.ts` | M | Low | produces F3 row fields |
| 09 | UI | Economic Calendar v2: groups, Expect. two-line cell, surprise/skew bar, relevance bars, filters, row expansion, mobile cards; retire strip and recent results; collapse prediction panel (F3) | `MacroEventPanel.tsx` (split into `calendar/EconomicCalendar.tsx`, `calendar/CalendarRow.tsx`, `calendar/SurpriseBar.tsx`), `PredictionOddsPanel.tsx` | L | Medium (API shape) | PR 08 fields; works on today's `CalendarRow` with the new columns blank |
| 10 | BE | Phase 3.2 universal event gate + first-5-minute confirmation + asset-class windows + Phase 3.3 coupling multiplier; emit `call.eventWindow`, `call.sizing`, `regime.macroCoupling` | `engine.ts` (gate replaces `getEventBlackout`), `lib/macro/service.ts` | M | Medium | produces F1 `eventWindow`, `sizing`, F2.8 |
| 11 | UI | Event-window bar on the verdict, SIZE tile parts, coupling chip and sparkline on the regime strip and Macro header, session chip in the context bar (F1.2 row 4, F2.7, F2.8) | `VerdictCard.tsx`, new `EventWindowBar.tsx`, `RegimeStrip.tsx`, `dashboard.tsx` | M | Low | PR 10 fields; `features.session` is clock-derived and can be computed client-side until the engine emits it |
| 12 | BE | Phase 1.4 shadow log + Phase 1.6 per-component reliability + `--weights-json`; `shadow`, `components` stats | `engine.ts:4807`, `logger.ts`, `performance.ts`, `backtest.ts` | M | Low | produces F4 `shadow`, `components` |
| 13 | BE | Per-call audit endpoint, ledger CSV + daily SHA-256, changelog source | new `api/signals/history/[id]/route.ts`, `backup/route.ts` (GET csv, hash header), `data/changelog.json` | M | Low | reads PR 03 inputs; hash cron via `instrumentation.ts` |
| 14 | UI | Performance v2 part 2: components table, shadow card, audit drawer (sheet), inline `reasonText`, open-signal fill window and last check, ledger card, changelog (F4.3) | `PerformanceDashboard.tsx`, new `performance/AuditDrawer.tsx`, `performance/ComponentsTable.tsx`, `performance/ShadowCard.tsx` | L | Low | PR 12, PR 13 |
| 15 | BE | Phase 2 structural fixes behind flags (mr-with-regime, breakeven, horizon-by-TF, HTF gate, SHORT rule, min-rr, weekend/hours, macro bonus frozen), then `mode`, `expectedHold`, `horizonMin`, `invalidation`, `flips`, stop anchor | `engine.ts`, `backtest.ts`, `setup-tracker.ts` | L | High (scoring changes; each behind a flag and a version bump) | produces F1 `mode`, `expectedHold`, `horizonMin`, `invalidation`, `flips`, STOP anchor |
| 16 | UI | Verdict v2 wiring: mode chip, HOLD tile from `expectedHold`, invalidation kind tag, flips rows, HISTORY pair bucket with CI and median hold, `pTp1` chip with interval and the "evidence" fallback | `VerdictCard.tsx`, `recommendation.ts` | M | Low | PR 15; `pTp1` from PR 17 |
| 17 | BE | Phase 1.3 Stage 0/1 calibrated probability: `calibration.json`, `call.pTp1`, `pTp1Ci`, `calibrationVersion`, hot-board `pTp1`; auto-revert guard | `performance.ts`, new `lib/signals/calibration.ts`, `engine.ts`, `api/signals/hot` | M | Medium (publishes a probability; gated n >= 100) | PR 03, PR 05 |
| 18 | BE | Phase 4.1-4.2 `fundingZ` + venue spread, real CVD / OI series / book imbalance into the score; Phase 4.10 drop dead calls; emit `features.funding`, `features.oi`, `features.cvd`, `features.book` | `engine.ts`, `orderflow.ts`, new `lib/signals/features/{funding,oi,cvd}.ts` | L | Medium | produces F2.2, F2.3 |
| 19 | UI | Flow tab v2: Order flow score section (CVD tile + sparkline, quarter-hour tile, OI quadrant glyph), funding z tile with venue dots, stablecoin tiles replacing the ETF tile (F2.2, F2.3, F2.6) | `tabs/FlowTab.tsx`, new `flow/OiQuadrant.tsx`, `flow/CvdTile.tsx` | M | Low | PR 18; PR 21 for stablecoins |
| 20 | BE | Phase 4.3-4.5 DVOL, basis/curve, OI quadrant; emit `features.vol`, `features.basis` | `engine.ts`, new `lib/signals/features/{deribit,basis}.ts` | M | Low | produces F2.4 |
| 21 | BE | Phase 4.7-4.8 real yield + DXY 5d gated by correlation, stablecoin supply; emit `features.macroRates`, `features.stablecoins` | new `lib/macro/{treasury,stablecoins}.ts`, `engine.ts` | M | Low | produces F2.5, F2.6 |
| 22 | UI | Momentum "Volatility state" section (DVOL, expected move, basis, stress chip); Levels chart with plan lines, walls and the expected-move band (P1-12 + F2.4); Macro "Rates & dollar" strip (F2.5) | `tabs/MomentumTab.tsx`, `tabs/LevelsTab.tsx`, `components/tradingview-chart.tsx`, `tabs/MacroTab.tsx` | L | Medium (chart sizing on mobile) | PR 20, PR 21; the chart works today on `d.candles` |
| 23 | BE | Phase 4.6 quarter-hour taker imbalance poller; Phase 4.9 headline engine (`confirms` weighting, GENERAL excluded, decay); emit `features.cvd.qhImbalance`, headline `w` and `confirms` | `instrumentation.ts` (boundary cron), `catalyst-news.ts`, `engine.ts` | L | Medium | produces the F2.3 quarter-hour tile, F2.9 |
| 24 | UI | Catalyst rows with `confirms` glyph and weight; quarter-hour tile live; Models factor table as signed block bars (TREND/TIMING/FLOW) once `call.blocks` exists (P1-13) | `tabs/MacroTab.tsx`, `tabs/FlowTab.tsx`, `tabs/ModelsTab.tsx` | S | Low | PR 23, PR 15 blocks |
| 25 | UI | Accessibility and mobile sweep (P1-9, P1-14): dialog for the guide, `aria-pressed`, focus rings, Radix tooltips for decision data, ticker command palette on mobile, active-setups cards, regime-card collapse, breakdown select | `GuideModal.tsx`, `dashboard.tsx`, `shared.tsx`, `LevelsTab.tsx`, `MomentumTab.tsx`, `PerformanceDashboard.tsx` | M | Low | none |
| 26 | BE+UI | Phase 2.10 TREND/TIMING/FLOW collapse (long-term architecture) and the Models tab rewrite around three blocks; engine version bump; the versions table separates it automatically | `engine.ts:3350-3521`, `tabs/ModelsTab.tsx` | L | High | after PR 15 numbers exist |

Sequencing and parallelism:

- **Week 1** (measurement + fold): UI 01, 02 and BE 03, 04, 05 in parallel; then UI 06. After this the performance page shows net R, Wilson intervals and BSS, and the verdict renders the v2 layout with fallbacks.
- **Week 2** (structure + calendar): UI 07, 09 and BE 08, 10, 12, 13 in parallel; then UI 11, 14. The calendar and the event-window bar go live together because they share the live row.
- **Week 3** (strategy + probability): BE 15, 17 (each behind flags and the validation protocol); UI 16 when `mode`, `expectedHold` and `pTp1` exist.
- **Week 4+** (features): BE 18, 20, 21, 23 in the research ranking order; UI 19, 22, 24 follow each; UI 25 any time; 26 last.

Rules carried from the master plan into the UI: nothing on the verdict claims a probability until PR 17 gates it at n >= 100; nothing colors a rate green or red below n = 30; every number that a backend PR changes gets a changelog entry rendered by PR 14; every Phase 4 feature tile shows `feed off` rather than disappearing, so a dead feed is visible to the reader and to the operator.

No new dependencies: recharts (scatter, bar, error bars), lightweight-charts (price lines and bands), shadcn `sheet`, `dialog`, `tabs`, `tooltip` (the Radix tooltip primitive can be added through the shadcn CLI; Radix is already a dependency), Lucide.
