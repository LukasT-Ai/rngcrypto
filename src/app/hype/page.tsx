import type { Metadata } from "next"
import HypeDashboard from "./dashboard"

export const metadata: Metadata = {
  title: "Hype Agent | Hyperliquid Perpetual Futures",
  description:
    "Live autonomous trading agent for Hyperliquid perpetual futures. EMA+RSI+ATR strategy with transparent, real-time performance tracking.",
  openGraph: {
    title: "Hype Agent | RnGcrypto",
    description:
      "Autonomous perpetual futures trading on Hyperliquid. Full transparency with live stats and trade history.",
    url: "https://www.rngcrypto.com/hype",
    siteName: "RnGcrypto",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hype Agent | RnGcrypto",
    description:
      "Autonomous perpetual futures trading on Hyperliquid. Full transparency with live stats and trade history.",
    creator: "@rngcrypto",
  },
}

export default function HypePage() {
  return <HypeDashboard />
}
