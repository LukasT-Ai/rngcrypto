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
    tickers: null,
    defaultSymbol: "BTC",
    venueUrl: "https://app.strikefinance.org",
    sourceNote: "Pending verified Strike palette",
  },
  ascend: {
    ...RNG_THEME,
    variant: "ascend",
    name: "Ascend Signals",
    tagline: "BTC, Gold, Cardano and WTI — the markets behind Ascend event perpetuals",
    tickers: ["BTC", "GOLD", "ADA", "OIL"],
    defaultSymbol: "BTC",
    venueUrl: "https://ascend.market",
    sourceNote: "Pending verified Ascend palette",
  },
}

export function themeStyle(t: SignalsTheme): CSSProperties {
  return { ["--brand" as string]: t.brand, ["--brand-2" as string]: t.brand2 } as CSSProperties
}
