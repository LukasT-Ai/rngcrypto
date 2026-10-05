import type { CSSProperties } from "react"

// Per-variant page chrome. Semantic colors (bullish green / bearish red / warning amber) are NOT themed —
// they stay identical on every variant so a green number always means the same thing.
export type SignalsVariant = "signals" | "strike" | "ascend"

export interface SignalsTheme {
  variant: SignalsVariant
  name: string
  tagline: string
  // Page-chrome accents. Sourced per variant; see notes in each entry.
  brand: string
  brand2: string
  // Card/surface base as "r g b" (vendor dark background); layered at 40-60% over the shared page image.
  surfaceRgb: string
  // Tickers available on this page (null = all tickers the engine supports).
  tickers: string[] | null
  defaultSymbol: string
  venueUrl: string | null
  sourceNote: string
}

// RNGcrypto brand (BRAND-GUIDE.md): neon green primary, #FF3B5C losses, #06080F base.
export const RNG_THEME: SignalsTheme = {
  variant: "signals",
  name: "Signals",
  tagline: "Plain-English trade calls across crypto, commodities, stocks and indices",
  brand: "#00FF88",
  brand2: "#F59E0B",
  surfaceRgb: "10 14 23",
  tickers: null,
  defaultSymbol: "BTC",
  venueUrl: null,
  sourceNote: "RNGcrypto house palette",
}

// Vendor palettes are filled only from colors verified on the vendors' own sites (see research notes in
// commit message). Until verified they fall back to the house palette so nothing is invented.
export const THEMES: Record<SignalsVariant, SignalsTheme> = {
  signals: RNG_THEME,
  strike: {
    ...RNG_THEME,
    variant: "strike",
    name: "Strike Signals",
    tagline: "Signals for every market tradable on Strike Finance perpetuals",
    // Verified 2026-10-05 from https://www.strikefinance.org stylesheet (/_next/static/chunks/263ad4217007c987.css):
    // --color-primary:#4efab0, --color-primary-dark:#3ad99a, --color-background:#000,
    // --color-background-secondary:#0a0a0a (text-[#4EFAB0] used 31x). Logo SVGs use the sibling #26fab0.
    brand: "#4EFAB0",
    brand2: "#3AD99A",
    surfaceRgb: "10 10 10",
    tickers: null,
    defaultSymbol: "BTC",
    venueUrl: "https://app.strikefinance.org",
    sourceNote: "strikefinance.org CSS vars --color-primary #4EFAB0 / --color-primary-dark #3AD99A / bg #0A0A0A",
  },
  ascend: {
    ...RNG_THEME,
    variant: "ascend",
    name: "Ascend Signals",
    tagline: "BTC, Gold, Cardano and WTI — the markets behind Ascend event perpetuals",
    // Verified 2026-10-05 from https://ascend.market stylesheet (/_next/static/chunks/64de67222f41c640.css):
    // text-[#F35233] 12x and logo.svg/full-logo.svg fill #F35233; --color-brand-orange:#ff4d00 (text 10x);
    // surfaces bg-[#06070a] 13x, bg-[#0C0B0F] 12x; borders #222126.
    brand: "#F35233",
    brand2: "#FF4D00",
    surfaceRgb: "12 11 15",
    tickers: ["BTC", "GOLD", "ADA", "OIL"],
    defaultSymbol: "BTC",
    venueUrl: "https://ascend.market",
    sourceNote: "ascend.market CSS: #F35233 (logo/text), --color-brand-orange #FF4D00, surfaces #06070A/#0C0B0F",
  },
}

export function themeStyle(t: SignalsTheme): CSSProperties {
  return { ["--brand" as string]: t.brand, ["--brand-2" as string]: t.brand2, ["--surface-rgb" as string]: t.surfaceRgb } as CSSProperties
}
